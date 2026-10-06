import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { eliminarEmpleada, guardarEmpleada, listarEmpleadas } from '../services/empleadas.service.js';

const router = Router();

router.get('/', async (_req, res) => res.json(await listarEmpleadas()));

router.put('/:id', validate({ params: schemas.idParams, body: schemas.empleada }), async (req, res) => {
  const { empleada, creado } = await guardarEmpleada(req.valid.params.id, req.valid.body);
  res.status(creado ? 201 : 200).json(empleada);
});

router.delete('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await eliminarEmpleada(req.valid.params.id));
});

export default router;
