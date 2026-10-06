import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Empleada, Plantilla, Turno } from '../models/index.js';
import { toTurno } from '../serializers.js';
import { conflict, notFound } from '../utils/errors.js';
import { bloquearHuecos } from '../utils/locks.js';
import { upsertById } from '../utils/repository.js';

export const filtroRango = ({ desde, hasta } = {}) => {
  const fecha = { ...(desde && { [Op.gte]: desde }), ...(hasta && { [Op.lte]: hasta }) };
  return Reflect.ownKeys(fecha).length ? { fecha } : {};
};

export async function listarTurnos(rango) {
  const filas = await Turno.findAll({ where: filtroRango(rango), order: [['fecha', 'ASC']] });
  return filas.map(toTurno);
}

async function asegurarAsignable(empleadaId, transaction) {
  const empleada = await Empleada.findByPk(empleadaId, { transaction });
  if (!empleada) throw notFound('Empleada');
  if (empleada.eliminadaEn) throw conflict(`${empleada.nombre} está eliminada: no se le pueden asignar turnos`);
}

/** Una plantilla borrada no debe impedir guardar el turno: la referencia se descarta. */
export async function plantillaVigente(plantillaId, transaction) {
  if (!plantillaId) return null;
  return (await Plantilla.count({ where: { id: plantillaId }, transaction })) ? plantillaId : null;
}

/** Cada empleada tiene como mucho un turno al día: el que llega sustituye al que había. */
async function liberarHueco({ empleadaId, fecha, excepto }, transaction) {
  await Turno.destroy({ where: { empleadaId, fecha, ...(excepto && { id: { [Op.ne]: excepto } }) }, transaction });
}

export function guardarTurno(id, datos) {
  return sequelize.transaction(async (transaction) => {
    await bloquearHuecos('turno', [datos], transaction);
    await asegurarAsignable(datos.empleadaId, transaction);
    const plantillaId = await plantillaVigente(datos.plantillaId, transaction);
    await liberarHueco({ empleadaId: datos.empleadaId, fecha: datos.fecha, excepto: id }, transaction);
    const { instancia, creado } = await upsertById(Turno, id, { ...datos, plantillaId }, { transaction });
    return { turno: toTurno(instancia), creado };
  });
}

export async function eliminarTurno(id) {
  const borrados = await Turno.destroy({ where: { id } });
  if (!borrados) throw notFound('Turno');
}

/** Mover (o duplicar con Alt) un turno a otra celda. Soltarlo en su propia celda no hace nada. */
export function moverTurno(id, { empleadaId, fecha, duplicar, nuevoId }) {
  return sequelize.transaction(async (transaction) => {
    const previo = await Turno.findByPk(id, { transaction });
    if (!previo) throw notFound('Turno');
    await bloquearHuecos('turno', [previo, { empleadaId, fecha }], transaction);
    const origen = await Turno.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!origen) throw notFound('Turno');
    if (origen.empleadaId === empleadaId && origen.fecha === fecha) return { turno: toTurno(origen), creado: false };

    await asegurarAsignable(empleadaId, transaction);
    if (!duplicar) {
      await liberarHueco({ empleadaId, fecha, excepto: id }, transaction);
      await origen.update({ empleadaId, fecha }, { transaction });
      return { turno: toTurno(origen), creado: false };
    }
    await liberarHueco({ empleadaId, fecha }, transaction);
    const copia = await Turno.create(
      { id: nuevoId ?? randomUUID(), empleadaId, fecha, tramos: origen.tramos, plantillaId: origen.plantillaId, avisosIgnorados: origen.avisosIgnorados },
      { transaction },
    );
    return { turno: toTurno(copia), creado: true };
  });
}

export function turnoDesdePlantilla({ id, plantillaId, empleadaId, fecha }) {
  return sequelize.transaction(async (transaction) => {
    const plantilla = await Plantilla.findByPk(plantillaId, { transaction });
    if (!plantilla) throw notFound('Plantilla');
    await bloquearHuecos('turno', [{ empleadaId, fecha }], transaction);
    await asegurarAsignable(empleadaId, transaction);
    await liberarHueco({ empleadaId, fecha }, transaction);
    const turno = await Turno.create({ id: id ?? randomUUID(), empleadaId, fecha, tramos: plantilla.tramos, plantillaId }, { transaction });
    return toTurno(turno);
  });
}
