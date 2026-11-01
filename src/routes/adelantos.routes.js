import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { crearAdelanto, eliminarAdelanto, listarAdelantos } from '../services/adelantos.service.js';

const router = Router();

router.get('/', async (_req, res) => res.json(await listarAdelantos()));

router.post('/', validate({ body: schemas.crearAdelanto }), async (req, res) => {
  res.status(201).json(await crearAdelanto(req.valid.body));
});

router.delete('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  await eliminarAdelanto(req.valid.params.id);
  res.status(204).end();
});

export default router;
