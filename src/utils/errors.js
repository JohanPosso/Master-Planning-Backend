/** Error de negocio con código HTTP. El errorHandler lo convierte en { error: { code, message, details } }. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (que) => new AppError(404, 'NOT_FOUND', `${que} no encontrado`);
export const conflict = (message, details) => new AppError(409, 'CONFLICT', message, details);
