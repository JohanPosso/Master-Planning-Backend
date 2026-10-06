import { Op } from 'sequelize';
import { conTransaccion } from '../config/database.js';
import { REGLAS_POR_DEFECTO } from '../domain/catalogos.js';
import { Configuracion, Festivo, ID_CONFIGURACION } from '../models/index.js';
import * as schemas from '../schemas.js';

async function fila(transaction, lock = false) {
  const [config] = await Configuracion.findOrCreate({
    where: { id: ID_CONFIGURACION },
    defaults: { reglas: REGLAS_POR_DEFECTO },
    transaction,
    ...(lock && { lock: transaction.LOCK.UPDATE }),
  });
  return config;
}

export async function obtenerReglas(transaction) {
  return (await fila(transaction)).reglas;
}

export async function obtenerAjustes(transaction) {
  const config = await fila(transaction);
  const festivos = await Festivo.findAll({ attributes: ['fecha'], order: [['fecha', 'ASC']], transaction });
  return {
    recargoDomingoPct: config.recargoDomingoPct,
    recargoFestivoPct: config.recargoFestivoPct,
    festivos: festivos.map((f) => f.fecha),
  };
}

/** Fusiona las claves recibidas con las reglas actuales y valida el resultado completo. */
export function actualizarReglas(parcial, transaction) {
  return conTransaccion(transaction, async (t) => {
    const config = await fila(t, true);
    const reglas = schemas.reglas.parse({ ...config.reglas, ...parcial });
    await config.update({ reglas }, { transaction: t });
    return reglas;
  });
}

/** Sustituye la lista de festivos conservando el nombre de los que ya existían. */
async function reemplazarFestivos(fechas, transaction) {
  await Festivo.destroy({ where: fechas.length ? { fecha: { [Op.notIn]: fechas } } : {}, transaction });
  if (fechas.length) {
    await Festivo.bulkCreate(fechas.map((fecha) => ({ fecha })), { ignoreDuplicates: true, transaction });
  }
}

export function actualizarAjustes(parcial, transaction) {
  return conTransaccion(transaction, async (t) => {
    const config = await fila(t, true);
    const { festivos, ...recargos } = parcial;
    if (Object.keys(recargos).length) await config.update(recargos, { transaction: t });
    if (festivos) await reemplazarFestivos(festivos, t);
    return obtenerAjustes(t);
  });
}
