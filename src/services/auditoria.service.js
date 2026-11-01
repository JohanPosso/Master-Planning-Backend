import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { logger } from '../config/logger.js';
import { Movimiento } from '../models/index.js';
import { toMovimiento } from '../serializers.js';

const actorAls = new AsyncLocalStorage();

export function runWithActor(actor, fn) {
  return actorAls.run(actor ?? { tipo: 'sistema', id: null, nombre: 'Sistema' }, fn);
}

export function actorActual() {
  return actorAls.getStore() ?? { tipo: 'sistema', id: null, nombre: 'Sistema' };
}

/**
 * Registra un movimiento. No tumba la operación de negocio si falla el insert
 * (salvo que `estricto` sea true, p. ej. en tests).
 */
export async function registrarMovimiento(
  { tipo, entidad = null, entidadId = null, empleadaId = null, resumen, detalle = {}, actor } = {},
  { transaction, estricto = false } = {},
) {
  const quien = actor ?? actorActual();
  const payload = {
    id: randomUUID(),
    tipo,
    entidad,
    entidadId,
    empleadaId,
    actorTipo: quien.tipo ?? 'sistema',
    actorId: quien.id ?? null,
    actorNombre: quien.nombre ?? null,
    resumen: String(resumen).slice(0, 240),
    detalle: detalle && typeof detalle === 'object' ? detalle : {},
    creadoEn: new Date(),
  };

  try {
    const fila = await Movimiento.create(payload, { transaction });
    logger.info(`auditoría · ${tipo}`, { resumen: payload.resumen, entidadId: payload.entidadId });
    return toMovimiento(fila.get({ plain: true }));
  } catch (err) {
    logger.warn(`No se pudo registrar movimiento ${tipo}: ${err.message}`);
    if (estricto) throw err;
    return null;
  }
}

export async function listarMovimientos({
  desde,
  hasta,
  tipo,
  empleadaId,
  limit = 50,
  offset = 0,
} = {}) {
  const where = {};
  if (desde || hasta) {
    where.creadoEn = {};
    if (desde) where.creadoEn[Op.gte] = new Date(desde);
    if (hasta) where.creadoEn[Op.lte] = new Date(hasta);
  }
  if (tipo) where.tipo = tipo.includes('%') || tipo.includes('*')
    ? { [Op.like]: tipo.replace(/\*/g, '%') }
    : tipo.includes('.')
      ? tipo
      : { [Op.like]: `${tipo}%` };
  if (empleadaId) where.empleadaId = empleadaId;

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);

  const { rows, count } = await Movimiento.findAndCountAll({
    where,
    order: [['creadoEn', 'DESC']],
    limit: lim,
    offset: off,
  });

  return {
    total: count,
    limit: lim,
    offset: off,
    items: rows.map((r) => toMovimiento(r.get({ plain: true }))),
  };
}
