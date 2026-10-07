import { Router } from 'express';
import { requireAuth, requireEmpleada } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { fichar, resumenFichaje } from '../services/fichajes.service.js';
import { actualizarPerfilPortal, obtenerEstadoPortal, obtenerNominaPortal } from '../services/portal.service.js';

const router = Router();

router.use(requireAuth, requireEmpleada);

router.get('/estado', async (req, res) => {
  res.json(await obtenerEstadoPortal(req.auth.sub));
});

/** Bloque de fichaje del portal: estado de hoy, turno, semana e historial propio. */
router.get('/fichaje', async (req, res) => res.json(await resumenFichaje(req.auth.sub)));

/** Fichar entrada o salida con la hora del servidor. */
router.post('/fichajes', validate({ body: schemas.fichar }), async (req, res) => {
  res.status(201).json(await fichar(req.auth.sub, req.valid.body));
});

router.get('/nomina', validate({ query: schemas.periodoQuery }), async (req, res) => {
  res.json(await obtenerNominaPortal(req.auth.sub, req.valid.query));
});

router.patch('/perfil', validate({ body: schemas.portalPerfil }), async (req, res) => {
  res.json(await actualizarPerfilPortal(req.auth.sub, req.valid.body));
});

export default router;
