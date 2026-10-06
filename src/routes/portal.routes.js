import { Router } from 'express';
import { requireAuth, requireEmpleada } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { obtenerEstadoPortal, obtenerNominaPortal } from '../services/portal.service.js';

const router = Router();

router.use(requireAuth, requireEmpleada);

router.get('/estado', async (req, res) => {
  res.json(await obtenerEstadoPortal(req.auth.sub));
});

router.get('/nomina', validate({ query: schemas.periodoQuery }), async (req, res) => {
  res.json(await obtenerNominaPortal(req.auth.sub, req.valid.query));
});

export default router;
