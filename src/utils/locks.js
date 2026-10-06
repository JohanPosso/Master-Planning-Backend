import { sequelize } from '../config/database.js';

/** Advisory locks por empleada+día; claves ordenadas para evitar deadlocks. */
export async function bloquearHuecos(tipo, huecos, transaction) {
  const claves = [...new Set(huecos.map(({ empleadaId, fecha }) => `${tipo}:${empleadaId}|${fecha}`))].sort();
  for (const clave of claves) {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:clave, 0))', { replacements: { clave }, transaction });
  }
}
