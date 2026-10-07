import { Router } from 'express';
import { normalizarIp } from '../domain/fichajes.js';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { actualizarFichajeConfig, obtenerFichajeConfig } from '../services/configuracion.service.js';
import { anadirFichaje, anularFichaje, corregirFichaje, listarFichajes, novedades } from '../services/fichajes.service.js';

/**
 * Vista del encargado. Nada se borra: corregir o anular deja el original anulado con su motivo
 * (historial completo del registro de jornada).
 */
const router = Router();

router.get('/fichajes', validate({ query: schemas.rangoQuery }), async (req, res) => res.json(await listarFichajes(req.valid.query)));

/** Fichajes y registros desde una fecha: el panel del encargado lo consulta cada poco para verlo en vivo. */
router.get('/fichajes/novedades', validate({ query: schemas.desdeQuery }), async (req, res) => res.json(await novedades(req.valid.query)));

router.post('/fichajes', validate({ body: schemas.nuevoFichaje }), async (req, res) => res.status(201).json(await anadirFichaje(req.valid.body)));
router.put('/fichajes/:id', validate({ params: schemas.idParams, body: schemas.correccionFichaje }), async (req, res) => {
  res.json(await corregirFichaje(req.valid.params.id, req.valid.body));
});
router.post('/fichajes/:id/anular', validate({ params: schemas.idParams, body: schemas.anulacionFichaje }), async (req, res) => {
  res.json(await anularFichaje(req.valid.params.id, req.valid.body));
});

router.get('/fichaje/config', async (_req, res) => res.json(await obtenerFichajeConfig()));
router.put('/fichaje/config', validate({ body: schemas.fichajeConfig }), async (req, res) => res.json(await actualizarFichajeConfig(req.valid.body)));

/** IP pública desde la que conecta el encargado: con «Usar la red actual» se guarda la del Wi-Fi de la cafetería. */
router.get('/fichaje/mi-ip', (req, res) => res.json({ ip: normalizarIp(req.ip) }));

export default router;
