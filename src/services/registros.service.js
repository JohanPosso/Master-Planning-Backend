import { randomUUID } from 'node:crypto';
import { sequelize } from '../config/database.js';
import { Empleada, Registro, Turno } from '../models/index.js';
import { toRegistro } from '../serializers.js';
import { notFound } from '../utils/errors.js';
import { bloquearHuecos } from '../utils/locks.js';
import { filtroRango } from './turnos.service.js';

export async function listarRegistros(rango) {
  const filas = await Registro.findAll({ where: filtroRango(rango), order: [['fecha', 'ASC']] });
  return filas.map(toRegistro);
}

/** Upsert por clave natural (empleada + día). `id` solo se usa si el registro es nuevo. */
export function guardarRegistro(empleadaId, fecha, { id, tramos, nota, estado }) {
  return sequelize.transaction(async (transaction) => {
    if (!(await Empleada.count({ where: { id: empleadaId }, transaction }))) throw notFound('Empleada');
    await bloquearHuecos('registro', [{ empleadaId, fecha }], transaction);
    const existente = await Registro.findOne({ where: { empleadaId, fecha }, transaction, lock: transaction.LOCK.UPDATE });
    if (existente) {
      const editadas = JSON.stringify(existente.tramos) !== JSON.stringify(tramos);
      await existente.update({ tramos, nota, estado, ...(editadas && { origen: 'manual' }) }, { transaction });
      return { registro: toRegistro(existente), creado: false };
    }
    const nuevo = await Registro.create({ id: id ?? randomUUID(), empleadaId, fecha, tramos, nota, estado }, { transaction });
    return { registro: toRegistro(nuevo), creado: true };
  });
}

/**
 * Confirma las horas de un día: confirma los registros existentes y, para quien no tiene registro,
 * lo crea prellenado con lo planificado. Quien no tiene ni turno ni registro se ignora.
 */
export function confirmarDia(fecha, empleadaIds) {
  return sequelize.transaction(async (transaction) => {
    const ids = [...new Set(empleadaIds)];
    await bloquearHuecos('registro', ids.map((empleadaId) => ({ empleadaId, fecha })), transaction);
    const where = { fecha, empleadaId: ids };
    const registros = await Registro.findAll({ where, transaction, lock: transaction.LOCK.UPDATE });
    const turnos = await Turno.findAll({ where, transaction });
    const registroDe = new Map(registros.map((r) => [r.empleadaId, r]));
    const turnoDe = new Map(turnos.map((t) => [t.empleadaId, t]));

    const resultado = [];
    for (const empleadaId of ids) {
      const registro = registroDe.get(empleadaId);
      const turno = turnoDe.get(empleadaId);
      if (registro) resultado.push(await registro.update({ estado: 'confirmado' }, { transaction }));
      else if (turno) {
        resultado.push(await Registro.create({ id: randomUUID(), empleadaId, fecha, tramos: turno.tramos, estado: 'confirmado' }, { transaction }));
      }
    }
    return resultado.map(toRegistro);
  });
}

export async function eliminarRegistro(id) {
  const borrados = await Registro.destroy({ where: { id } });
  if (!borrados) throw notFound('Registro');
}
