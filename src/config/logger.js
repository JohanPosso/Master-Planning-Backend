import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

/** No importa `env.js`: los unit tests cargan el logger sin variables de BD. */
const TZ = process.env.APP_TIMEZONE || 'Europe/Madrid';
const nodeEnv = process.env.NODE_ENV ?? 'development';
const isTest = nodeEnv === 'test';
const isProduction = nodeEnv === 'production';
const nivel = process.env.LOG_LEVEL || (isTest ? 'warn' : 'info');
const logDir = process.env.LOG_DIR || path.resolve(process.cwd(), 'logs');

const stampMadrid = winston.format((info) => {
  info.timestamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(' ', 'T');
  return info;
});

const formato = winston.format.combine(
  stampMadrid(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...rest }) => {
    const meta = { ...rest };
    for (const k of Object.getOwnPropertySymbols(meta)) delete meta[k];
    delete meta.timestamp;
    const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const cuerpo = stack ? `${message}\n${stack}` : message;
    return `${timestamp} ${String(level).toUpperCase().padEnd(5)} ${cuerpo}${extras}`;
  }),
);

const transports = [
  new winston.transports.Console({
    level: nivel,
    format: isProduction
      ? formato
      : winston.format.combine(winston.format.colorize({ all: true }), formato),
  }),
];

/**
 * Ficheros solo en local/dev: en Railway el disco del servicio no es persistente
 * (no hay volumen en backend) y los logs van a la consola de Railway vía stdout.
 */
if (!isTest && !isProduction) {
  fs.mkdirSync(logDir, { recursive: true });
  transports.push(
    new DailyRotateFile({
      dirname: logDir,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '20m',
      level: nivel === 'debug' ? 'debug' : 'info',
      format: formato,
    }),
    new DailyRotateFile({
      dirname: logDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m',
      level: 'error',
      format: formato,
    }),
  );
}

const winstonLogger = winston.createLogger({
  level: nivel,
  transports,
  exitOnError: false,
});

function emitir(nivelLog, mensaje, extra) {
  if (extra === undefined) winstonLogger.log(nivelLog, String(mensaje));
  else if (extra instanceof Error) winstonLogger.log(nivelLog, String(mensaje), { err: extra.message, stack: extra.stack });
  else if (typeof extra === 'object') winstonLogger.log(nivelLog, String(mensaje), extra);
  else winstonLogger.log(nivelLog, String(mensaje), { detail: String(extra) });
}

/** Misma API que el logger anterior para no tocar call sites. */
export const logger = {
  debug: (m, e) => emitir('debug', m, e),
  info: (m, e) => emitir('info', m, e),
  warn: (m, e) => emitir('warn', m, e),
  error: (m, e) => emitir('error', m, e),
};
