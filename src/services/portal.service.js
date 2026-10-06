import { Op } from 'sequelize';
import { lunesDeIso } from '../domain/fechas.js';
import { Empleada, PeriodoPago, Registro, Semana, Turno } from '../models/index.js';
import { toEmpleada, toPago, toRegistro, toSemana, toTurno } from '../serializers.js';
import { forbidden, notFound, unauthorized } from '../utils/errors.js';
import { hashPassword, normalizarUsuario, usuarioDisponible, verificarPassword } from './auth.service.js';
import { obtenerAjustes, obtenerReglas } from './configuracion.service.js';
import { calcularNomina } from './pagos.service.js';

/** Ficha visible en el horario del portal: sin tarifas ni datos de nómina. */
function toEmpleadaHorario(e, { propia = false } = {}) {
  const full = toEmpleada(e);
  const { tarifaCent: _t, tieneAccesoPortal: _a, usuario, ...rest } = full;
  return propia ? { ...rest, usuario: usuario ?? null } : rest;
}

async function empleadaDelPortal(empleadaId) {
  const e = await Empleada.findByPk(empleadaId);
  if (!e || e.eliminadaEn) throw notFound('Empleada');
  return e;
}

/** Estado del portal: horario completo del equipo (semanas publicadas) + datos de pago solo propios. */
export async function obtenerEstadoPortal(empleadaId) {
  const yo = await empleadaDelPortal(empleadaId);
  const semanasPub = await Semana.findAll({ where: { publicada: true }, order: [['lunes', 'ASC']] });
  const lunesPub = new Set(semanasPub.map((s) => String(s.lunes)));

  const [equipo, turnosAll, registros, pagosAll, reglas, ajustes] = await Promise.all([
    Empleada.findAll({
      where: { eliminadaEn: null, activa: true },
      order: [['createdAt', 'ASC'], ['nombre', 'ASC']],
    }),
    Turno.findAll({ order: [['fecha', 'ASC']] }),
    Registro.findAll({ where: { empleadaId }, order: [['fecha', 'ASC']] }),
    PeriodoPago.findAll({
      include: [{ association: 'lineas', where: { empleadaId }, required: true }],
      order: [['inicio', 'DESC']],
    }),
    obtenerReglas(),
    obtenerAjustes(),
  ]);

  const turnos = turnosAll.filter((t) => lunesPub.has(lunesDeIso(String(t.fecha)))).map(toTurno);

  const pagos = pagosAll.map((p) => {
    const plain = p.get({ plain: true });
    const lineas = (plain.lineas ?? []).filter((l) => l.empleadaId === empleadaId);
    const totalCent = lineas.reduce((a, l) => a + l.importeCent, 0);
    return toPago({ ...plain, totalCent, lineas });
  });

  return {
    version: 1,
    empleada: toEmpleadaHorario(yo, { propia: true }),
    empleadas: equipo.map((e) => toEmpleadaHorario(e)),
    turnos,
    registros: registros.map(toRegistro),
    pagos,
    semanas: semanasPub.map(toSemana),
    reglas,
    ajustes,
  };
}

/** La empleada actualiza su nombre, usuario y/o clave. */
export async function actualizarPerfilPortal(empleadaId, datos) {
  const e = await empleadaDelPortal(empleadaId);
  if (!e.activa) throw forbidden('Tu cuenta está inactiva');

  const cambios = {};
  if (datos.nombre !== undefined) cambios.nombre = datos.nombre;
  if (datos.usuario !== undefined) {
    const u = normalizarUsuario(datos.usuario);
    await usuarioDisponible(u, { exceptEmpleadaId: empleadaId });
    cambios.usuario = u;
  }
  if (datos.passwordNueva) {
    const ok = await verificarPassword(datos.passwordActual ?? '', e.passwordHash);
    if (!ok) throw unauthorized('La clave actual no es correcta');
    cambios.passwordHash = await hashPassword(datos.passwordNueva);
  }

  await e.update(cambios);
  await e.reload();
  return toEmpleadaHorario(e, { propia: true });
}

/** Estimación de nómina del periodo + histórico propio. */
export async function obtenerNominaPortal(empleadaId, { inicio, fin }) {
  await empleadaDelPortal(empleadaId);
  const nomina = await calcularNomina({ inicio, fin });
  const linea = nomina.lineas.find((l) => l.empleadaId === empleadaId) ?? {
    empleadaId,
    minutos: 0,
    tarifaCent: 0,
    recargosCent: 0,
    importeCent: 0,
    excluida: false,
    activa: true,
  };

  const pagos = await PeriodoPago.findAll({
    include: [{ association: 'lineas', where: { empleadaId }, required: true }],
    where: {
      [Op.or]: [
        { inicio: { [Op.between]: [inicio, fin] } },
        { fin: { [Op.between]: [inicio, fin] } },
        { inicio: { [Op.lte]: inicio }, fin: { [Op.gte]: fin } },
      ],
    },
    order: [['inicio', 'DESC']],
  });

  const historico = pagos.map((p) => {
    const plain = p.get({ plain: true });
    const lineas = (plain.lineas ?? []).filter((l) => l.empleadaId === empleadaId);
    const totalCent = lineas.reduce((a, l) => a + l.importeCent, 0);
    return toPago({ ...plain, totalCent, lineas });
  });

  return {
    inicio,
    fin,
    estimacion: {
      minutos: linea.minutos,
      recargosCent: linea.recargosCent,
      importeCent: linea.importeCent,
      excluida: linea.excluida,
      pendientes: nomina.pendientes,
    },
    historico,
  };
}
