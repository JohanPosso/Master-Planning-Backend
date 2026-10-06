import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { copiarSemanaAnterior, listarSemanas, publicarSemana } from '../services/semanas.service.js';

const router = Router();

router.get('/', async (_req, res) => res.json(await listarSemanas()));

router.put('/:lunes', validate({ params: schemas.lunesParams, body: schemas.publicarSemana }), async (req, res) => {
  res.json(await publicarSemana(req.valid.params.lunes, req.valid.body.publicada));
});

router.post('/:lunes/copiar-anterior', validate({ params: schemas.lunesParams }), async (req, res) => {
  const creados = await copiarSemanaAnterior(req.valid.params.lunes);
  res.status(creados.length ? 201 : 200).json({ creados });
});

export default router;
