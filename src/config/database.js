import { Sequelize } from 'sequelize';
import { env } from './env.js';
import { logger } from './logger.js';

const comunes = {
  dialect: 'postgres',
  logging: env.database.logging ? (sql) => logger.debug(sql) : false,
  // underscored: atributos camelCase en JS (createdAt, empleadaId) ↔ columnas snake_case en SQL.
  define: { underscored: true, timestamps: true },
  pool: { max: 10, min: 0, idle: 10_000 },
};

function crearSequelize() {
  if (env.database.url) {
    return new Sequelize(env.database.url, {
      ...comunes,
      dialectOptions: env.database.ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
    });
  }
  return new Sequelize(env.database.name, env.database.user, env.database.password, {
    ...comunes,
    host: env.database.host,
    port: env.database.port,
  });
}

export const sequelize = crearSequelize();

/** Ejecuta `fn` dentro de la transacción recibida o abre una nueva. Permite componer servicios. */
export function conTransaccion(transaction, fn) {
  return transaction ? fn(transaction) : sequelize.transaction(fn);
}
