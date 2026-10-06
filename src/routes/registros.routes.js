import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { confirmarDia, eliminarRegistro, guardarRegistro, listarRegistros } from '../services/registros.service.js';

const router = Router();

router.get('/', validate({ query: schemas.rangoQuery }), async (req, res) => res.json(await listarRegistros(req.valid.query)));

router.post('/confirmar-dia', validate({ body: schemas.confirmarDia }), async (req, res) => {
  res.json(await confirmarDia(req.valid.body.fecha, req.valid.body.empleadaIds));
});

router.put('/:empleadaId/:fecha', validate({ params: schemas.registroParams, body: schemas.registro }), async (req, res) => {
  const { empleadaId, fecha } = req.valid.params;
  const { registro, creado } = await guardarRegistro(empleadaId, fecha, req.valid.body);
  res.status(creado ? 201 : 200).json(registro);
});

router.delete('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  await eliminarRegistro(req.valid.params.id);
  res.status(204).end();
});

export default router;
