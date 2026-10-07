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
  const jwtSecret = source.JWT_SECRET || (nodeEnv === 'production' ? '' : 'dev-secret-cambiar');
  if (!jwtSecret) throw new Error('Configura JWT_SECRET (ver .env.example).');

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: Number(source.PORT ?? 3000),
    corsOrigin: lista(source.CORS_ORIGIN ?? 'http://localhost:5173'),
    timezone: source.APP_TIMEZONE ?? 'Europe/Madrid',
    jwtSecret,
    /**
     * Proxies delante de la API (Railway, Render, Nginx…). Con el valor correcto, req.ip es la IP pública
     * de quien ficha; si está mal, se ve la de un proxy y el fichaje por Wi-Fi no reconoce la red.
     * Número de saltos ('1'), 'true' para confiar en todos o una lista de IPs/subredes.
     */
    trustProxy: (() => { const v = source.TRUST_PROXY ?? '1'; return v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v; })(),
    /** Duración de la sesión desde que se entra (luego hay que volver a entrar). */
    jwtExpiresIn: source.JWT_EXPIRES_IN ?? '1h',
    adminUser: source.ADMIN_USER ?? 'admin',
    adminPassword: source.ADMIN_PASSWORD ?? 'admin123',
    database: Object.freeze(database),
  });
}

export const env = leerEnv();
