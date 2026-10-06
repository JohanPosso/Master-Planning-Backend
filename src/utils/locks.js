import { sequelize } from '../config/database.js';

/**
 * Serializa las escrituras sobre un mismo hueco (empleada + día) con advisory locks de Postgres,
 * que se liberan solos al terminar la transacción. Sin esto, dos peticiones simultáneas que
 * «sustituyen lo que haya en el hueco» se bloquean entre sí en el índice único (deadlock).
 * Las claves se ordenan para que dos transacciones nunca las tomen en orden cruzado.
 */
export async function bloquearHuecos(tipo, huecos, transaction) {
  const claves = [...new Set(huecos.map(({ empleadaId, fecha }) => `${tipo}:${empleadaId}|${fecha}`))].sort();
  for (const clave of claves) {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:clave, 0))', { replacements: { clave }, transaction });
  }
}
