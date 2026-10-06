import { verificarToken, perfilDesdePayload } from '../services/auth.service.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization ?? '';
    const [, token] = header.match(/^Bearer\s+(.+)$/i) ?? [];
    if (!token) throw unauthorized();
    const payload = verificarToken(token);
    req.auth = { ...payload, perfil: await perfilDesdePayload(payload) };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, _res, next) {
  if (req.auth?.rol !== 'admin') return next(forbidden('Solo el encargado puede hacer esto'));
  next();
}

export function requireEmpleada(req, _res, next) {
  if (req.auth?.rol !== 'empleada') return next(forbidden('Solo disponible para empleadas'));
  next();
}
