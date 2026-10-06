import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { sumarDias } from '../domain/fechas.js';
import { Empleada, Semana, Turno } from '../models/index.js';
import { toSemana, toTurno } from '../serializers.js';
import { bloquearHuecos } from '../utils/locks.js';
import { upsertById } from '../utils/repository.js';

export async function listarSemanas() {
  const filas = await Semana.findAll({ order: [['lunes', 'ASC']] });
  return filas.map(toSemana);
}

export function publicarSemana(lunes, publicada) {
  return sequelize.transaction(async (transaction) => {
    const { instancia } = await upsertById(Semana, lunes, { publicada, publicadaEn: publicada ? new Date() : null }, { transaction });
    return toSemana(instancia);
  });
}

/**
 * Copia los turnos de la semana anterior desplazados 7 días. Solo rellena huecos: nunca pisa
 * un turno existente. Omite a las empleadas eliminadas.
 */
export function copiarSemanaAnterior(lunes) {
  return sequelize.transaction(async (transaction) => {
    const enRango = (desde, hasta) => ({ fecha: { [Op.between]: [desde, hasta] } });
    const origen = await Turno.findAll({
      where: enRango(sumarDias(lunes, -7), sumarDias(lunes, -1)),
      include: [{ model: Empleada, as: 'empleada', attributes: [], where: { eliminadaEn: null } }],
      transaction,
    });
    await bloquearHuecos('turno', origen.map((t) => ({ empleadaId: t.empleadaId, fecha: sumarDias(t.fecha, 7) })), transaction);
    const destino = await Turno.findAll({ where: enRango(lunes, sumarDias(lunes, 6)), attributes: ['empleadaId', 'fecha'], transaction });

    const ocupado = new Set(destino.map((t) => `${t.empleadaId}|${t.fecha}`));
    const nuevos = origen
      .map((t) => ({
        id: randomUUID(),
        empleadaId: t.empleadaId,
        fecha: sumarDias(t.fecha, 7),
        tramos: t.tramos,
        plantillaId: t.plantillaId,
        avisosIgnorados: t.avisosIgnorados,
      }))
      .filter((t) => !ocupado.has(`${t.empleadaId}|${t.fecha}`));

    const creados = await Turno.bulkCreate(nuevos, { transaction });
    return creados.map(toTurno);
  });
}
