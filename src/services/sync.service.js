import { sequelize } from '../config/database.js';
import { Empleada, LineaPago, PeriodoPago, Plantilla, Registro, Semana, Turno } from '../models/index.js';
import { upsertById } from '../utils/repository.js';
import { actualizarAjustes, actualizarReglas } from './configuracion.service.js';
import { plantillaVigente } from './turnos.service.js';

/**
 * Aplica un lote de cambios (upsert / delete) en una transacción.
 *
 * Orden: primero se borran hijos → padres y luego se crean padres → hijos, respetando las claves foráneas.
 * Las restricciones únicas (empleada, día) se difieren al COMMIT para permitir intercambiar huecos
 * (p. ej. deshacer un «mover» que había sustituido a otro turno).
 */
export function aplicarSync(ops) {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query('SET CONSTRAINTS ALL DEFERRED', { transaction });
    const opts = { transaction };
    const borrar = (Model, ids, campo = 'id') => ids?.length && Model.destroy({ where: { [campo]: ids }, ...opts });
    const resumen = {};

    await borrar(Registro, ops.registros?.delete);
    await borrar(Turno, ops.turnos?.delete);
    await borrar(PeriodoPago, ops.pagos?.delete);
    await borrar(Semana, ops.semanas?.delete, 'lunes');
    await borrar(Plantilla, ops.plantillas?.delete);
    await borrar(Empleada, ops.empleadas?.delete);

    for (const { id, ...datos } of ops.empleadas?.upsert ?? []) await upsertById(Empleada, id, datos, opts);
    for (const { id, ...datos } of ops.plantillas?.upsert ?? []) await upsertById(Plantilla, id, datos, opts);
    for (const { lunes, publicada } of ops.semanas?.upsert ?? []) {
      await upsertById(Semana, lunes, { publicada, publicadaEn: publicada ? new Date() : null }, opts);
    }
    for (const { id, ...datos } of ops.turnos?.upsert ?? []) {
      await upsertById(Turno, id, { ...datos, plantillaId: await plantillaVigente(datos.plantillaId, transaction) }, opts);
    }
    for (const { id, ...datos } of ops.registros?.upsert ?? []) await upsertById(Registro, id, datos, opts);
    for (const { id, lineas, ...datos } of ops.pagos?.upsert ?? []) {
      await upsertById(PeriodoPago, id, datos, opts);
      await LineaPago.destroy({ where: { periodoId: id }, ...opts });
      await LineaPago.bulkCreate(lineas.map((l) => ({ ...l, periodoId: id })), opts);
    }

    if (ops.reglas) resumen.reglas = await actualizarReglas(ops.reglas, transaction);
    if (ops.ajustes) resumen.ajustes = await actualizarAjustes(ops.ajustes, transaction);
    return { ok: true, ...resumen };
  });
}
