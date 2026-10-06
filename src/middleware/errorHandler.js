import { ConnectionError, ForeignKeyConstraintError, UniqueConstraintError, ValidationError as SequelizeValidationError } from 'sequelize';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

const responder = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details !== undefined && { details }) } });

/** Traduce cualquier error a una respuesta JSON coherente sin filtrar detalles internos en 500. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) return responder(res, err.status, err.code, err.message, err.details);

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return responder(res, 400, 'VALIDATION', 'Datos no válidos', details);
  }
  if (err instanceof UniqueConstraintError) return responder(res, 409, 'CONFLICT', 'Ya existe un registro con esos datos');
  if (err instanceof ForeignKeyConstraintError) {
    return responder(res, 409, 'CONFLICT', 'Referencia no válida o en uso por otros datos (p. ej. horas pagadas)');
  }
  if (err instanceof SequelizeValidationError) {
    return responder(res, 400, 'VALIDATION', 'Datos no válidos', err.errors.map((e) => ({ path: e.path, message: e.message })));
  }
  if (['40P01', '40001'].includes(err?.parent?.code)) {
    return responder(res, 409, 'CONCURRENCY', 'Otro cambio simultáneo afectó a los mismos datos. Inténtalo de nuevo.');
  }
  if (err instanceof ConnectionError) {
    logger.error(`${req.method} ${req.originalUrl}: base de datos no disponible`, err.message);
    return responder(res, 503, 'DB_UNAVAILABLE', 'La base de datos no está disponible. Inténtalo de nuevo en unos segundos.');
  }
  if (err?.type === 'entity.parse.failed') return responder(res, 400, 'BAD_JSON', 'El cuerpo no es JSON válido');
  if (err?.type === 'entity.too.large') return responder(res, 413, 'TOO_LARGE', 'Petición demasiado grande');

  logger.error(`${req.method} ${req.originalUrl}`, err);
  return responder(res, 500, 'INTERNAL', 'Error interno del servidor');
}

export const notFoundHandler = (req, res) => responder(res, 404, 'NOT_FOUND', `Ruta no encontrada: ${req.method} ${req.originalUrl}`);
