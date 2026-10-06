import { Router } from 'express';
import { sequelize } from '../config/database.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as schemas from '../schemas.js';
import { obtenerEstado } from '../services/estado.service.js';
import { aplicarSync } from '../services/sync.service.js';
import auth from './auth.routes.js';
import configuracion from './configuracion.routes.js';
import empleadas from './empleadas.routes.js';
import pagos from './pagos.routes.js';
import plantillas from './plantillas.routes.js';
import portal from './portal.routes.js';
import registros from './registros.routes.js';
import semanas from './semanas.routes.js';
import turnos from './turnos.routes.js';

const router = Router();

router.get('/health', async (_req, res) => {
  await sequelize.authenticate();
  res.json({ status: 'ok' });
});

router.use('/auth', auth);
router.use('/portal', portal);

router.use(requireAuth, requireAdmin);

router.get('/estado', async (_req, res) => res.json(await obtenerEstado()));
router.post('/sync', validate({ body: schemas.sync }), async (req, res) => res.json(await aplicarSync(req.valid.body)));

router.use('/empleadas', empleadas);
router.use('/plantillas', plantillas);
router.use('/turnos', turnos);
router.use('/semanas', semanas);
router.use('/registros', registros);
router.use('/pagos', pagos);
router.use('/', configuracion);

export default router;
