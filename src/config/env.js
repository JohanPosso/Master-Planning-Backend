const lista = (valor) => valor.split(',').map((v) => v.trim()).filter(Boolean);

function leerEnv(source = process.env) {
  const database = {
    url: source.DATABASE_URL || null,
    host: source.DB_HOST ?? 'localhost',
    port: Number(source.DB_PORT ?? 5432),
    name: source.DB_NAME,
    user: source.DB_USER,
    password: source.DB_PASSWORD,
    ssl: source.DB_SSL === 'true',
    logging: source.DB_LOGGING === 'true',
  };

  if (!database.url && !database.name) {
    throw new Error('Configura DATABASE_URL o DB_NAME/DB_USER/DB_PASSWORD (ver .env.example).');
  }

  const nodeEnv = source.NODE_ENV ?? 'development';
  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: Number(source.PORT ?? 3000),
    corsOrigin: lista(source.CORS_ORIGIN ?? 'http://localhost:5173'),
    timezone: source.APP_TIMEZONE ?? 'Europe/Madrid',
    database: Object.freeze(database),
  });
}

export const env = leerEnv();
