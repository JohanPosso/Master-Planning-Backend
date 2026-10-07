import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { ahoraEn, dentroDeGeocerca, estadoDia, siguienteTipo, tramosDesdePares } from '../domain/fichajes.js';
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
const ordenFichajes = [['fecha', 'ASC'], ['marca', 'ASC']];

async function empleadaQueFicha(empleadaId, transaction) {
  const e = await Empleada.findByPk(empleadaId, { transaction });
  if (!e || e.eliminadaEn) throw notFound('Empleada');
  if (!e.activa) throw forbidden('Tu cuenta está inactiva. Habla con el encargado.');
  return e;
}

/** Valida la ubicación si la geocerca está activa. Devuelve los datos de auditoría a guardar. */
function comprobarGeocerca(config, ubicacion) {
  const { geocerca } = config;
  if (!geocerca.activa) return {};
  if (!ubicacion) {
    throw new AppError(400, 'UBICACION_REQUERIDA', 'Para fichar hay que permitir la ubicación: solo se puede fichar desde la cafetería.');
  }
  const { dentro, distancia } = dentroDeGeocerca(geocerca, ubicacion);
  if (!dentro) {
    throw new AppError(403, 'FUERA_DE_ZONA', `Estás a ${distancia} m de la cafetería. Acércate para fichar (radio ${geocerca.radioM} m).`, { distanciaM: distancia });
  }
  return { latitud: ubicacion.latitud, longitud: ubicacion.longitud, precisionM: ubicacion.precisionM ?? null, distanciaM: distancia };
}

/**
 * Lleva los fichajes del día al registro de horas, como «por confirmar».
 * No se toca un registro confirmado ni uno que el encargado escribió a mano: él tiene la última palabra.
 */
async function sincronizarRegistro(empleadaId, fecha, fichajesDelDia, transaction) {
  const { pares } = estadoDia(fichajesDelDia);
  const { tramos, unificados } = tramosDesdePares(pares);
  if (!tramos.length) return null;

  await bloquearHuecos('registro', [{ empleadaId, fecha }], transaction);
  const existente = await Registro.findOne({ where: { empleadaId, fecha }, transaction, lock: transaction.LOCK.UPDATE });
  const nota = unificados ? `Fichó ${pares.length} tramos: ${pares.map((p) => `${hhmm(p.inicio)}–${hhmm(p.fin)}`).join(', ')}` : null;

  if (!existente) {
    return Registro.create({ id: randomUUID(), empleadaId, fecha, tramos, nota, estado: 'previsto', origen: 'fichaje' }, { transaction });
  }
  if (existente.estado === 'confirmado' || existente.origen !== 'fichaje') return null;
  return existente.update({ tramos, nota }, { transaction });
}

/**
 * Ficha la entrada o la salida de la empleada con la hora del servidor.
 * `tipo` es lo que el cliente cree que toca: si no coincide (doble toque, otra pestaña) se rechaza.
 */
export function fichar(empleadaId, { tipo, ubicacion }) {
  return sequelize.transaction(async (transaction) => {
    const ahora = reloj.ahora();
    const { fecha, minuto } = ahoraEn(env.timezone, ahora);
    await bloquearHuecos('fichaje', [{ empleadaId, fecha }], transaction);
    await empleadaQueFicha(empleadaId, transaction);
    const auditoria = comprobarGeocerca(await obtenerFichajeConfig(transaction), ubicacion);

    const delDia = await Fichaje.findAll({ where: { empleadaId, fecha }, order: ordenFichajes, transaction });
    const toca = siguienteTipo(delDia);
    if (tipo !== toca) {
      const ultimo = delDia.at(-1);
      throw conflict(
        tipo === 'entrada'
          ? `Ya fichaste la entrada a las ${hhmm(ultimo.minuto)}. Ahora toca fichar la salida.`
          : 'No tienes una entrada abierta hoy. Ficha primero la entrada.',
        { toca },
      );
    }

    const fichaje = await Fichaje.create({ id: randomUUID(), empleadaId, fecha, minuto, tipo, marca: ahora, ...auditoria }, { transaction });
    const registro = tipo === 'salida' ? await sincronizarRegistro(empleadaId, fecha, [...delDia, fichaje], transaction) : null;
    return { fichaje: toFichaje(fichaje), registro: registro && toRegistro(registro) };
  });
}

/** Lo que ve la empleada en su bloque de fichaje: hoy, su turno, la semana y su historial reciente. */
export async function resumenFichaje(empleadaId, { dias = 14 } = {}) {
  await empleadaQueFicha(empleadaId);
  const ahora = reloj.ahora();
  const { fecha: hoy, minuto } = ahoraEn(env.timezone, ahora);
  const lunes = sumarDias(hoy, -diaSemana(hoy));
  const desde = sumarDias(hoy, -(dias - 1)) < lunes ? sumarDias(hoy, -(dias - 1)) : lunes;

  const [fichajes, turnos, config] = await Promise.all([
    Fichaje.findAll({ where: { empleadaId, fecha: { [Op.gte]: desde } }, order: ordenFichajes }),
    Turno.findAll({ where: { empleadaId, fecha: { [Op.between]: [lunes, sumarDias(lunes, 6)] } } }),
    obtenerFichajeConfig(),
  ]);
  const deHoy = fichajes.filter((f) => f.fecha === hoy);
  const estadoHoy = estadoDia(deHoy);
  const semana = fichajes.filter((f) => f.fecha >= lunes);
  const fechasSemana = [...new Set(semana.map((f) => f.fecha))];

  const porDia = new Map();
  for (const f of fichajes) porDia.set(f.fecha, [...(porDia.get(f.fecha) ?? []), f]);
  const historial = [...porDia.entries()]
    .filter(([fecha]) => fecha >= sumarDias(hoy, -(dias - 1)))
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([fecha, lista]) => {
      const e = estadoDia(lista);
      return { fecha, fichajes: lista.map(toFichaje), minutos: e.minutos, incompleto: e.dentro && fecha < hoy };
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
      minutosFichados: fechasSemana.reduce((total, f) => total + estadoDia(semana.filter((x) => x.fecha === f)).minutos, 0),
      minutosPlanificados: turnos.reduce((total, t) => total + minutosDe(t.tramos), 0),
    },
    historial,
    geocerca: { activa: config.geocerca.activa, radioM: config.geocerca.radioM },
  };
}

/** Listado para el encargado (sin coordenadas: solo la distancia, por privacidad). */
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

/** Días que el encargado recibe en la carga inicial (lo más antiguo se pide por rango). */
export const DIAS_FICHAJES_EN_ESTADO = 62;
