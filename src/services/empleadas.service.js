import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { hoyEn } from '../domain/fechas.js';
import { Empleada, Turno } from '../models/index.js';
import { toEmpleada } from '../serializers.js';
import { notFound } from '../utils/errors.js';
import { upsertById } from '../utils/repository.js';

export async function listarEmpleadas() {
  const filas = await Empleada.findAll({ order: [['createdAt', 'ASC'], ['nombre', 'ASC']] });
  return filas.map(toEmpleada);
}

export function guardarEmpleada(id, datos) {
  return sequelize.transaction(async (transaction) => {
    const { instancia, creado } = await upsertById(Empleada, id, datos, { transaction });
    return { empleada: toEmpleada(instancia), creado };
  });
}

/**
 * Borrado lógico: conserva horas registradas y pagadas (histórico y RGPD) y quita sus turnos
 * desde hoy en adelante para que no aparezcan en el horario.
 */
export function eliminarEmpleada(id) {
  return sequelize.transaction(async (transaction) => {
    const empleada = await Empleada.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!empleada) throw notFound('Empleada');
    const hoy = hoyEn(env.timezone);
    await empleada.update({ eliminadaEn: empleada.eliminadaEn ?? hoy, activa: false }, { transaction });
    const turnosEliminados = await Turno.destroy({ where: { empleadaId: id, fecha: { [Op.gte]: hoy } }, transaction });
    return { empleada: toEmpleada(empleada), turnosEliminados };
  });
}
