import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { listarMovimientos } from '../services/auditoria.service.js';

const router = Router();

router.get('/', validate({ query: schemas.movimientosQuery }), async (req, res) => {
  res.json(await listarMovimientos(req.valid.query));
});

export default router;
