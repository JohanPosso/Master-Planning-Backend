import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ahoraEn, estadoDia, ipEnLista, normalizarIp, redDeIp, salidaAutomatica, siguienteTipo, tramosDesdePares, verificarUbicacion } from '../domain/fichajes.js';
import { diaSemana, sumarDias } from '../domain/fechas.js';
import { minutosDe } from '../domain/tramos.js';
import { Empleada, Fichaje, Registro, Turno } from '../models/index.js';
import { toFichaje, toRegistro, toTurno } from '../serializers.js';
import { AppError, conflict, forbidden, notFound } from '../utils/errors.js';
import { bloquearHuecos } from '../utils/locks.js';
import { reloj } from '../utils/reloj.js';
import { obtenerFichajeConfig } from './configuracion.service.js';
import { filtroRango } from './turnos.service.js';

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** Por minuto y, a igualdad, por instante: una corrección añadida después se coloca en su hora. */
const ordenFichajes = [['fecha', 'ASC'], ['minuto', 'ASC'], ['marca', 'ASC']];
const vigentes = { anuladoEn: null };

/** Días que el encargado recibe en la carga inicial (lo más antiguo se pide por rango). */
export const DIAS_FICHAJES_EN_ESTADO = 62;
/** Hasta cuántos días atrás busca el cierre automático (por si el servidor estuvo parado). */
const DIAS_REVISION_CIERRE = 7;

async function empleadaQueFicha(empleadaId, transaction) {
  const e = await Empleada.findByPk(empleadaId, { transaction });
  if (!e || e.eliminadaEn) throw notFound('Empleada');
  if (!e.activa) throw forbidden('Tu cuenta está inactiva. Habla con el encargado.');
  return e;
}

const fichajesDelDia = (empleadaId, fecha, transaction, { todos = false } = {}) =>
  Fichaje.findAll({ where: { empleadaId, fecha, ...(!todos && vigentes) }, order: ordenFichajes, transaction });

/** Notas que el encargado debe ver en el registro, derivadas de los fichajes del día. */
function notasDeRevision(lista, pares, unificados) {
  const notas = [];
  if (lista.some((f) => f.origen === 'automatico')) notas.push('Salida automática (olvidó fichar): revisar');
  if (lista.some((f) => f.verificacion === 'sin_verificar')) notas.push('Fichaje sin verificar la ubicación');
  if (unificados) notas.push(`Fichó ${pares.length} tramos: ${pares.map((p) => `${hhmm(p.inicio)}–${hhmm(p.fin)}`).join(', ')}`);
  return notas.length ? notas.join(' · ') : null;
}

/**
 * Lleva los fichajes vigentes del día al registro de horas, como «por confirmar».
 * Un registro confirmado nunca se toca. Uno escrito a mano solo se toca si el encargado corrige
 * los fichajes (`forzar`): esa corrección es su decisión más reciente.
 */
async function sincronizarRegistro(empleadaId, fecha, transaction, { forzar = false } = {}) {
  const lista = await fichajesDelDia(empleadaId, fecha, transaction);
  const { pares } = estadoDia(lista);
  const { tramos, unificados } = tramosDesdePares(pares);

  await bloquearHuecos('registro', [{ empleadaId, fecha }], transaction);
  const existente = await Registro.findOne({ where: { empleadaId, fecha }, transaction, lock: transaction.LOCK.UPDATE });
  if (existente?.estado === 'confirmado') return null;
  if (existente && existente.origen !== 'fichaje' && !forzar) return null;

  if (!tramos.length) {
    // Tras una corrección el día puede quedar sin horas válidas: las que salían de los fichajes ya no valen.
    if (existente?.origen === 'fichaje') await existente.destroy({ transaction });
    return null;
  }
  const nota = notasDeRevision(lista, pares, unificados);
  if (!existente) {
    return Registro.create({ id: randomUUID(), empleadaId, fecha, tramos, nota, estado: 'previsto', origen: 'fichaje' }, { transaction });
  }
  return existente.update({ tramos, nota, origen: 'fichaje' }, { transaction });
}

/** Con el Wi-Fi activo, el mensaje dice qué red ve el servidor: así se sabe al momento si es otra IP (p. ej. IPv6). */
const notaRed = (d) => (d.red ? ` Tu conexión llega desde ${d.red}, que no es la del Wi-Fi de la cafetería.` : '');
const RECHAZOS = {
  FUERA_DE_ZONA: (d) =>
    new AppError(403, 'FUERA_DE_ZONA', `Estás a ${d.distancia} m de la cafetería. Acércate o conéctate a su Wi-Fi para fichar.${notaRed(d)}`, { distanciaM: d.distancia, redDetectada: d.red }),
  SIN_VERIFICAR: (d) =>
    new AppError(400, 'UBICACION_REQUERIDA', `No se pudo comprobar que estés en la cafetería: activa la ubicación o conéctate a su Wi-Fi.${notaRed(d)}`, { redDetectada: d.red }),
};

/**
 * Ficha la entrada o la salida de la empleada con la hora del servidor.
 * `tipo` es lo que el cliente cree que toca: si no coincide (doble toque, otra pestaña) se rechaza.
 */
export function fichar(empleadaId, { tipo, ubicacion, ip }) {
  return sequelize.transaction(async (transaction) => {
    const ahora = reloj.ahora();
    const { fecha, minuto } = ahoraEn(env.timezone, ahora);
    await bloquearHuecos('fichaje', [{ empleadaId, fecha }], transaction);
    await empleadaQueFicha(empleadaId, transaction);

    const config = await obtenerFichajeConfig(transaction);
    const v = verificarUbicacion(config, { ubicacion, ip });
    if (v.rechazo) throw RECHAZOS[v.rechazo]({ ...v, red: config.red.activa && ip ? redDeIp(ip) : null });

    const delDia = await fichajesDelDia(empleadaId, fecha, transaction);
    const toca = siguienteTipo(delDia);
    if (tipo !== toca) {
      throw conflict(
        tipo === 'entrada'
          ? `Ya fichaste la entrada a las ${hhmm(delDia.at(-1).minuto)}. Ahora toca fichar la salida.`
          : 'No tienes una entrada abierta hoy. Ficha primero la entrada.',
        { toca },
      );
    }

    const verificada = v.verificacion !== null;
    const fichaje = await Fichaje.create(
      {
        id: randomUUID(),
        empleadaId,
        fecha,
        minuto,
        tipo,
        marca: ahora,
        verificacion: v.verificacion,
        // Solo se guarda lo necesario para probar dónde se fichó, y solo si hay verificación activa.
        ...(verificada && v.verificacion === 'gps' && ubicacion && { latitud: ubicacion.latitud, longitud: ubicacion.longitud, precisionM: ubicacion.precisionM ?? null }),
        ...(verificada && v.distancia !== undefined && { distanciaM: v.distancia }),
        ...(verificada && ip && { ip: normalizarIp(ip) }),
      },
      { transaction },
    );
    const registro = tipo === 'salida' ? await sincronizarRegistro(empleadaId, fecha, transaction) : null;
    return { fichaje: toFichaje(fichaje), registro: registro && toRegistro(registro) };
  });
}

/** Lo que ve la empleada en su bloque de fichaje: hoy, su turno, la semana y su historial reciente. */
export async function resumenFichaje(empleadaId, { dias = 14, ip } = {}) {
  await empleadaQueFicha(empleadaId);
  const ahora = reloj.ahora();
  const { fecha: hoy, minuto } = ahoraEn(env.timezone, ahora);
  const lunes = sumarDias(hoy, -diaSemana(hoy));
  const inicioHistorial = sumarDias(hoy, -(dias - 1));
  const desde = inicioHistorial < lunes ? inicioHistorial : lunes;

  const [todos, turnos, config] = await Promise.all([
    Fichaje.findAll({ where: { empleadaId, fecha: { [Op.gte]: desde } }, order: ordenFichajes }),
    Turno.findAll({ where: { empleadaId, fecha: { [Op.between]: [lunes, sumarDias(lunes, 6)] } } }),
    obtenerFichajeConfig(),
  ]);
  const fichajes = todos.filter((f) => !f.anuladoEn);
  const deHoy = fichajes.filter((f) => f.fecha === hoy);
  const estadoHoy = estadoDia(deHoy);
  const semana = fichajes.filter((f) => f.fecha >= lunes);

  const porDia = new Map();
  for (const f of todos) porDia.set(f.fecha, [...(porDia.get(f.fecha) ?? []), f]);
  const historial = [...porDia.entries()]
    .filter(([fecha]) => fecha >= inicioHistorial)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([fecha, lista]) => {
      const e = estadoDia(lista);
      return {
        fecha,
        fichajes: lista.filter((f) => !f.anuladoEn).map(toFichaje),
        minutos: e.minutos,
        incompleto: e.dentro && fecha < hoy,
        // Transparencia: la empleada ve que el encargado o el sistema tocaron ese día.
        corregido: lista.some((f) => f.anuladoEn || f.origen !== 'empleada'),
      };
    });

  return {
    ahora: ahora.toISOString(),
    zonaHoraria: env.timezone,
    hoy,
    minutoActual: minuto,
    toca: siguienteTipo(deHoy),
    dentroDesde: estadoHoy.abierta,
    minutosHoy: estadoHoy.minutos,
    fichajesHoy: deHoy.map(toFichaje),
    turnoHoy: (() => { const t = turnos.find((x) => x.fecha === hoy); return t ? toTurno(t) : null; })(),
    semana: {
      lunes,
      minutosFichados: [...new Set(semana.map((f) => f.fecha))].reduce((total, f) => total + estadoDia(semana.filter((x) => x.fecha === f)).minutos, 0),
      minutosPlanificados: turnos.reduce((total, t) => total + minutosDe(t.tramos), 0),
    },
    historial,
    geocerca: { activa: config.geocerca.activa, radioM: config.geocerca.radioM },
    red: { activa: config.red.activa },
    // En el Wi-Fi de la cafetería no hace falta pedir la ubicación al móvil.
    enRedCafeteria: config.red.activa && ipEnLista(ip, config.red.ips),
    // Diagnóstico: la red que ve el servidor (solo si el fichaje por Wi-Fi está activo). Es la propia de quien consulta.
    redDetectada: config.red.activa && ip ? redDeIp(ip) : null,
    cierreAutomaticoHoras: config.cierreAutomaticoHoras,
  };
}

/** Listado para el encargado, con anulados (historial de correcciones). Sin coordenadas ni IP. */
export async function listarFichajes(rango) {
  const filas = await Fichaje.findAll({ where: filtroRango(rango), order: ordenFichajes });
  return filas.map(toFichaje);
}

/** Lo que ha cambiado desde `desde` por los fichajes: para refrescar la vista del encargado. */
export async function novedades({ desde }) {
  const [fichajes, registros] = await Promise.all([
    Fichaje.findAll({ where: { fecha: { [Op.gte]: desde } }, order: ordenFichajes }),
    Registro.findAll({ where: { fecha: { [Op.gte]: desde } }, order: [['fecha', 'ASC']] }),
  ]);
  return { desde, fichajes: fichajes.map(toFichaje), registros: registros.map(toRegistro) };
}

// ── Correcciones del encargado ──────────────────────────────────────────────

async function resultadoDelDia(empleadaId, fecha, transaction) {
  const registro = await sincronizarRegistro(empleadaId, fecha, transaction, { forzar: true });
  const todos = await fichajesDelDia(empleadaId, fecha, transaction, { todos: true });
  const actual = registro ?? (await Registro.findOne({ where: { empleadaId, fecha }, transaction }));
  return { fecha, empleadaId, fichajes: todos.map(toFichaje), registro: actual && toRegistro(actual) };
}

/** Añade un fichaje que faltaba (p. ej. la salida que olvidó). Queda como «del encargado» con su motivo. */
export function anadirFichaje({ empleadaId, fecha, tipo, minuto, motivo }) {
  return sequelize.transaction(async (transaction) => {
    if (!(await Empleada.count({ where: { id: empleadaId }, transaction }))) throw notFound('Empleada');
    await bloquearHuecos('fichaje', [{ empleadaId, fecha }], transaction);
    await Fichaje.create({ id: randomUUID(), empleadaId, fecha, minuto, tipo, marca: reloj.ahora(), origen: 'encargado', motivo }, { transaction });
    return resultadoDelDia(empleadaId, fecha, transaction);
  });
}

async function fichajeVigente(id, transaction) {
  const previo = await Fichaje.findByPk(id, { transaction });
  if (!previo) throw notFound('Fichaje');
  await bloquearHuecos('fichaje', [previo], transaction);
  const f = await Fichaje.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (f.anuladoEn) throw conflict('Ese fichaje ya fue corregido o anulado');
  return f;
}

/** Corrige hora o tipo: anula el original (con el motivo) y crea el nuevo enlazado a él. */
export function corregirFichaje(id, { tipo, minuto, motivo }) {
  return sequelize.transaction(async (transaction) => {
    const original = await fichajeVigente(id, transaction);
    const ahora = reloj.ahora();
    await original.update({ anuladoEn: ahora, motivo }, { transaction });
    await Fichaje.create(
      { id: randomUUID(), empleadaId: original.empleadaId, fecha: original.fecha, minuto, tipo, marca: ahora, origen: 'encargado', motivo, sustituyeA: original.id },
      { transaction },
    );
    return resultadoDelDia(original.empleadaId, original.fecha, transaction);
  });
}

/** Anula un fichaje erróneo (doble, de prueba…). No se borra: queda en el historial con el motivo. */
export function anularFichaje(id, { motivo }) {
  return sequelize.transaction(async (transaction) => {
    const f = await fichajeVigente(id, transaction);
    await f.update({ anuladoEn: reloj.ahora(), motivo }, { transaction });
    return resultadoDelDia(f.empleadaId, f.fecha, transaction);
  });
}

// ── Cierre automático ───────────────────────────────────────────────────────

/**
 * Cierra las entradas abiertas más de `cierreAutomaticoHoras`: la empleada olvidó fichar la salida.
 * La salida se pone al fin del tramo del turno (o entrada + horas) y el día queda «por confirmar»
 * con una nota para que el encargado lo revise. Devuelve cuántos fichajes cerró.
 */
export async function cerrarFichajesOlvidados() {
  const ahora = reloj.ahora();
  const { fecha: hoy } = ahoraEn(env.timezone, ahora);
  const { cierreAutomaticoHoras: horas } = await obtenerFichajeConfig();
  const recientes = await Fichaje.findAll({ where: { ...vigentes, fecha: { [Op.gte]: sumarDias(hoy, -DIAS_REVISION_CIERRE) } }, order: ordenFichajes });

  const grupos = new Map();
  for (const f of recientes) grupos.set(`${f.empleadaId}|${f.fecha}`, [...(grupos.get(`${f.empleadaId}|${f.fecha}`) ?? []), f]);

  let cerrados = 0;
  for (const lista of grupos.values()) {
    const { dentro, abierta } = estadoDia(lista);
    if (!dentro) continue;
    const entrada = lista.filter((f) => f.tipo === 'entrada' && f.minuto === abierta).at(-1);
    if (ahora - new Date(entrada.marca) < horas * 3_600_000) continue;

    const { empleadaId, fecha } = entrada;
    const cerrado = await sequelize.transaction(async (transaction) => {
      await bloquearHuecos('fichaje', [{ empleadaId, fecha }], transaction);
      const actual = estadoDia(await fichajesDelDia(empleadaId, fecha, transaction));
      if (!actual.dentro) return false; // fichó la salida mientras tanto
      const turno = await Turno.findOne({ where: { empleadaId, fecha }, transaction });
      const minuto = Math.max(salidaAutomatica({ entrada: actual.abierta, tramosTurno: turno?.tramos ?? [], horasMax: horas }), actual.abierta);
      await Fichaje.create({ id: randomUUID(), empleadaId, fecha, minuto, tipo: 'salida', marca: ahora, origen: 'automatico' }, { transaction });
      await sincronizarRegistro(empleadaId, fecha, transaction);
      return true;
    });
    if (cerrado) cerrados += 1;
  }
  if (cerrados) logger.info(`Cierre automático: ${cerrados} fichaje(s) sin salida cerrados`);
  return cerrados;
}
