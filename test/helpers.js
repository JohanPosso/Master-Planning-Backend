import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { REGLAS_POR_DEFECTO } from '../src/domain/catalogos.js';
import { runMigrations } from '../src/database/migrate.js';
import { asegurarAdmin } from '../src/services/auth.service.js';

if (process.env.NODE_ENV !== 'test' || !/test/.test(process.env.DB_NAME ?? '')) {
  throw new Error('Los tests de integración solo se ejecutan contra una BD de test (npm run test:integration).');
}

export const app = createApp();
export const uuid = () => randomUUID();

let tokenAdmin = null;

export async function prepararBD() {
  await runMigrations();
  await asegurarAdmin();
  const res = await request(app).post('/api/auth/login').send({ usuario: env.adminUser, password: env.adminPassword });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  tokenAdmin = res.body.token;
}

export function api() {
  const r = request(app);
  const conAuth = (req) => (tokenAdmin ? req.set('Authorization', `Bearer ${tokenAdmin}`) : req);
  return {
    get: (url) => conAuth(r.get(url)),
    post: (url) => conAuth(r.post(url)),
    put: (url) => conAuth(r.put(url)),
    patch: (url) => conAuth(r.patch(url)),
    delete: (url) => conAuth(r.delete(url)),
  };
}

/** Request sin token (rutas públicas o comprobar 401). */
export const apiRaw = () => request(app);

export async function limpiarBD() {
  await sequelize.query('TRUNCATE lineas_pago, periodos_pago, registros, turnos, semanas, plantillas, festivos, empleadas CASCADE');
  await sequelize.query('UPDATE configuracion SET reglas = CAST(:r AS JSONB), recargo_domingo_pct = 0, recargo_festivo_pct = 0', {
    replacements: { r: JSON.stringify(REGLAS_POR_DEFECTO) },
  });
}

export const cerrarBD = () => sequelize.close();

export const tramo = (inicio, fin) => [{ inicio, fin }];

export async function crearEmpleada(datos = {}) {
  const id = datos.id ?? uuid();
  const res = await api()
    .put(`/api/empleadas/${id}`)
    .send({ nombre: 'Ana', rol: 'Empleada', color: 'azul', tarifaCent: 1000, ...datos });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

export async function crearTurno(datos) {
  const id = datos.id ?? uuid();
  const res = await api().put(`/api/turnos/${id}`).send({ tramos: tramo(540, 720), ...datos });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

export async function crearPlantilla(datos = {}) {
  const id = uuid();
  const res = await api().put(`/api/plantillas/${id}`).send({ nombre: 'Apertura', tramos: tramo(400, 720), ...datos });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

export const estado = async () => (await api().get('/api/estado').expect(200)).body;

export async function loginComo(usuario, password) {
  const res = await apiRaw().post('/api/auth/login').send({ usuario, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}
