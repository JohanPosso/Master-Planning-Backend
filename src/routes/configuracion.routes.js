import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { actualizarAjustes, actualizarReglas, obtenerAjustes, obtenerReglas } from '../services/configuracion.service.js';

const router = Router();

router.get('/reglas', async (_req, res) => res.json(await obtenerReglas()));
router.patch('/reglas', validate({ body: schemas.reglasParcial }), async (req, res) => res.json(await actualizarReglas(req.valid.body)));

router.get('/ajustes', async (_req, res) => res.json(await obtenerAjustes()));
router.patch('/ajustes', validate({ body: schemas.ajustesParcial }), async (req, res) => res.json(await actualizarAjustes(req.valid.body)));

export default router;
