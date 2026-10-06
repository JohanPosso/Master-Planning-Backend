import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { calcularNomina, eliminarPago, listarPagos, pagarPeriodo } from '../services/pagos.service.js';

const router = Router();

router.get('/', async (_req, res) => res.json(await listarPagos()));

/** Previsualiza la nómina de un periodo: GET /api/pagos/calculo?inicio=2026-10-01&fin=2026-10-31 */
router.get('/calculo', validate({ query: schemas.periodoQuery }), async (req, res) => res.json(await calcularNomina(req.valid.query)));

router.post('/', validate({ body: schemas.pagarPeriodo }), async (req, res) => res.status(201).json(await pagarPeriodo(req.valid.body)));

router.delete('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  await eliminarPago(req.valid.params.id);
  res.status(204).end();
});

export default router;
