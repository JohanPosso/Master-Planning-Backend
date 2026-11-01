import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import * as schemas from '../schemas.js';
import { registrarMovimiento } from '../services/auditoria.service.js';
import { caducidadDe, login, perfilDesdePayload, verificarToken } from '../services/auth.service.js';

const router = Router();

router.post('/login', validate({ body: schemas.login }), async (req, res) => {
  const sesion = await login(req.valid.body);
  await registrarMovimiento({
    tipo: 'auth.login',
    resumen: `Inicio de sesión · ${sesion.perfil.nombre}`,
    detalle: { rol: sesion.rol, ip: req.ip },
    actor: { tipo: sesion.rol, id: sesion.perfil.id, nombre: sesion.perfil.nombre },
    empleadaId: sesion.rol === 'empleada' ? sesion.perfil.id : null,
  });
  res.json(sesion);
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ rol: req.auth.rol, perfil: req.auth.perfil, expiraEn: caducidadDe(req.auth) });
});

router.post('/logout', async (req, res) => {
  try {
    const header = req.headers.authorization ?? '';
    const [, token] = header.match(/^Bearer\s+(.+)$/i) ?? [];
    if (token) {
      const payload = verificarToken(token);
      const perfil = await perfilDesdePayload(payload);
      await registrarMovimiento({
        tipo: 'auth.logout',
        resumen: `Cierre de sesión · ${perfil.nombre}`,
        detalle: { rol: payload.rol },
        actor: { tipo: payload.rol, id: payload.sub, nombre: perfil.nombre },
        empleadaId: payload.rol === 'empleada' ? payload.sub : null,
      });
    }
  } catch {
    /* token inválido o caducado: igual cerramos en cliente */
  }
  res.status(204).end();
});

export default router;
