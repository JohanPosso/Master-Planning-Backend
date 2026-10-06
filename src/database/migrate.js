import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sequelize } from '../config/database.js';
import { logger } from '../config/logger.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

const archivos = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
const cargar = (archivo) => import(pathToFileURL(path.join(DIR, archivo)).href);

async function ejecutadas() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  const [filas] = await sequelize.query('SELECT name FROM schema_migrations ORDER BY name');
  return filas.map((f) => f.name);
}

/** Aplica las migraciones pendientes; cada una con su registro en una sola transacción (todo o nada). */
export async function runMigrations() {
  const hechas = new Set(await ejecutadas());
  const pendientes = archivos().filter((f) => !hechas.has(f));

  for (const archivo of pendientes) {
    const migracion = await cargar(archivo);
    await sequelize.transaction(async (transaction) => {
      await migracion.up({ sequelize, transaction });
      await sequelize.query('INSERT INTO schema_migrations (name) VALUES (:name)', { replacements: { name: archivo }, transaction });
    });
    logger.info(`Migración aplicada: ${archivo}`);
  }
  if (!pendientes.length) logger.info('No hay migraciones pendientes.');
  return pendientes;
}

/** Revierte la última migración aplicada. */
export async function rollbackLast() {
  const ultima = (await ejecutadas()).at(-1);
  if (!ultima) return logger.info('No hay migraciones que revertir.');
  const migracion = await cargar(ultima);
  await sequelize.transaction(async (transaction) => {
    await migracion.down({ sequelize, transaction });
    await sequelize.query('DELETE FROM schema_migrations WHERE name = :name', { replacements: { name: ultima }, transaction });
  });
  logger.info(`Migración revertida: ${ultima}`);
}

const esScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (esScript) {
  const accion = process.argv[2] === 'down' ? rollbackLast : runMigrations;
  accion()
    .then(() => sequelize.close())
    .catch(async (err) => {
      logger.error('Error en la migración', err);
      await sequelize.close();
      process.exit(1);
    });
}
