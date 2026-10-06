import { createApp } from './app.js';
import { sequelize } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

async function main() {
  await sequelize.authenticate();
  const server = createApp().listen(env.port, () => logger.info(`API de Jornada en http://localhost:${env.port}/api`));

  const cerrar = (senal) => {
    logger.info(`${senal} recibido, cerrando…`);
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => cerrar('SIGTERM'));
  process.on('SIGINT', () => cerrar('SIGINT'));
  process.on('unhandledRejection', (motivo) => logger.error('Promesa rechazada sin capturar', motivo));
}

main().catch((err) => {
  logger.error('No se pudo arrancar la API', err);
  process.exit(1);
});
