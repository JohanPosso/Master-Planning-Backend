import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { actualizarFichajeConfig, obtenerFichajeConfig } from '../services/configuracion.service.js';
import { listarFichajes, novedades } from '../services/fichajes.service.js';

/** Vista del encargado. Los fichajes no se editan ni se borran: las correcciones van al registro de horas. */
const router = Router();

router.get('/fichajes', validate({ query: schemas.rangoQuery }), async (req, res) => res.json(await listarFichajes(req.valid.query)));

/** Fichajes y registros desde una fecha: el panel del encargado lo consulta cada poco para verlo en vivo. */
router.get('/fichajes/novedades', validate({ query: schemas.desdeQuery }), async (req, res) => res.json(await novedades(req.valid.query)));

router.get('/fichaje/config', async (_req, res) => res.json(await obtenerFichajeConfig()));
router.put('/fichaje/config', validate({ body: schemas.fichajeConfig }), async (req, res) => res.json(await actualizarFichajeConfig(req.valid.body)));

export default router;
