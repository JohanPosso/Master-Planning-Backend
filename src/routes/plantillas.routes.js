import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { eliminarPlantilla, guardarPlantilla, listarPlantillas } from '../services/plantillas.service.js';

const router = Router();

router.get('/', async (_req, res) => res.json(await listarPlantillas()));

router.put('/:id', validate({ params: schemas.idParams, body: schemas.plantilla }), async (req, res) => {
  const { plantilla, creado } = await guardarPlantilla(req.valid.params.id, req.valid.body);
  res.status(creado ? 201 : 200).json(plantilla);
});

router.delete('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  await eliminarPlantilla(req.valid.params.id);
  res.status(204).end();
});

export default router;
