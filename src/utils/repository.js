/**
 * Crea o actualiza por clave primaria. El cliente genera los UUID (permite actualizaciones optimistas
 * con identificadores estables), así que un PUT es idempotente.
 * Se evita `Model.upsert` porque en Postgres puede elegir como árbitro otra restricción única.
 */
export async function upsertById(Model, id, valores, { transaction }) {
  const existente = await Model.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (existente) return { instancia: await existente.update(valores, { transaction }), creado: false };
  const instancia = await Model.create({ ...valores, [Model.primaryKeyAttribute]: id }, { transaction });
  return { instancia, creado: true };
}
