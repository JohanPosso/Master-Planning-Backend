import { sequelize } from '../config/database.js';
import { logger } from '../config/logger.js';
import { cerrarFichajesOlvidados } from '../services/fichajes.service.js';

const CADA_MS = 5 * 60_000;

/**
 * Revisa cada 5 minutos los fichajes que se quedaron abiertos. El lock de transacción evita que, con
 * varias instancias de la API, dos cierren a la vez el mismo fichaje.
 */
async function ejecutar() {
  try {
    await sequelize.transaction(async (transaction) => {
      const [[{ libre }]] = await sequelize.query("SELECT pg_try_advisory_xact_lock(hashtextextended('cierre-automatico', 0)) AS libre", { transaction });
      if (libre) await cerrarFichajesOlvidados();
    });
  } catch (err) {
    logger.error('Cierre automático de fichajes', err);
  }
}

export function iniciarCierreAutomatico() {
  void ejecutar();
  const t = setInterval(ejecutar, CADA_MS);
  t.unref();
  return () => clearInterval(t);
}
