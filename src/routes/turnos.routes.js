import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { eliminarTurno, guardarTurno, listarTurnos, moverTurno, turnoDesdePlantilla } from '../services/turnos.service.js';

const router = Router();

router.get('/', validate({ query: schemas.rangoQuery }), async (req, res) => res.json(await listarTurnos(req.valid.query)));

router.post('/desde-plantilla', validate({ body: schemas.turnoDesdePlantilla }), async (req, res) => {
  res.status(201).json(await turnoDesdePlantilla(req.valid.body));
});

router.put('/:id', validate({ params: schemas.idParams, body: schemas.turno }), async (req, res) => {
  const { turno, creado } = await guardarTurno(req.valid.params.id, req.valid.body);
  res.status(creado ? 201 : 200).json(turno);
});

router.post('/:id/mover', validate({ params: schemas.idParams, body: schemas.moverTurno }), async (req, res) => {
  const { turno, creado } = await moverTurno(req.valid.params.id, req.valid.body);
  res.status(creado ? 201 : 200).json(turno);
});

router.delete('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  await eliminarTurno(req.valid.params.id);
  res.status(204).end();
});

export default router;
