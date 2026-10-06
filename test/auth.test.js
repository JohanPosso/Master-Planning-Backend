import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { api, apiRaw, cerrarBD, crearEmpleada, limpiarBD, loginComo, prepararBD, uuid } from './helpers.js';

describe('auth y portal', () => {
  before(prepararBD);
  beforeEach(limpiarBD);
  after(cerrarBD);

  test('login admin y protege /estado', async () => {
    const sin = await apiRaw().get('/api/estado');
    assert.equal(sin.status, 401);

    const ok = await api().get('/api/estado');
    assert.equal(ok.status, 200);
    assert.ok(Array.isArray(ok.body.empleadas));
  });

  test('login empleada y portal solo lectura', async () => {
    const id = uuid();
    await crearEmpleada({
      id,
      nombre: 'Lucía',
      color: 'verde',
      usuario: 'lucia',
      password: '1234',
    });

    const sesion = await loginComo('lucia', '1234');
    assert.equal(sesion.rol, 'empleada');
    assert.equal(sesion.perfil.nombre, 'Lucía');

    const adminEstado = await apiRaw().get('/api/estado').set('Authorization', `Bearer ${sesion.token}`);
    assert.equal(adminEstado.status, 403);

    const portal = await apiRaw().get('/api/portal/estado').set('Authorization', `Bearer ${sesion.token}`);
    assert.equal(portal.status, 200);
    assert.equal(portal.body.empleada.id, id);
    assert.equal(portal.body.empleada.nombre, 'Lucía');
    assert.ok(Array.isArray(portal.body.turnos));

    const adminPortal = await api().get('/api/portal/estado');
    assert.equal(adminPortal.status, 403);
  });

  test('login incorrecto', async () => {
    const res = await apiRaw().post('/api/auth/login').send({ usuario: 'admin', password: 'mal' });
    assert.equal(res.status, 401);
  });

  test('health sigue público', async () => {
    const res = await apiRaw().get('/api/health');
    assert.equal(res.status, 200);
  });
});
