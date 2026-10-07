import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import * as schemas from '../schemas.js';
import { caducidadDe, login } from '../services/auth.service.js';

const router = Router();

router.post('/login', validate({ body: schemas.login }), async (req, res) => {
  res.json(await login(req.valid.body));
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ rol: req.auth.rol, perfil: req.auth.perfil, expiraEn: caducidadDe(req.auth) });
});

router.post('/logout', (_req, res) => res.status(204).end());

export default router;
