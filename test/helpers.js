import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { REGLAS_POR_DEFECTO } from '../src/domain/catalogos.js';
import { runMigrations } from '../src/database/migrate.js';

if (process.env.NODE_ENV !== 'test' || !/test/.test(process.env.DB_NAME ?? '')) {
  throw new Error('Los tests de integración solo se ejecutan contra una BD de test (npm run test:integration).');
}

export const app = createApp();
export const api = () => request(app);
export const uuid = () => randomUUID();

export async function prepararBD() {
  await runMigrations();
}

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
