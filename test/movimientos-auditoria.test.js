/**
 * Auditoría: login, adelantos/pagos generan movimientos listables.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { env } from '../src/config/env.js';
import { api, apiRaw, cerrarBD, crearEmpleada, limpiarBD, prepararBD, tramo } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
after(cerrarBD);

describe('Movimientos de auditoría', () => {
  it('login genera auth.login y aparece en el listado', async () => {
    await apiRaw().post('/api/auth/login').send({ usuario: env.adminUser, password: env.adminPassword }).expect(200);
    const list = await api().get('/api/movimientos').query({ tipo: 'auth.login', limit: 5 }).expect(200);
    assert.ok(list.body.total >= 1);
    assert.ok(list.body.items.some((m) => m.tipo === 'auth.login'));
    assert.ok(list.body.items[0].creadoEn);
  });

  it('adelanto y liquidación generan movimientos encadenados', async () => {
    const e = await crearEmpleada({ nombre: 'Ana', tarifaCent: 1000 });
    await api().put(`/api/registros/${e.id}/2026-10-06`).send({ tramos: tramo(480, 600), estado: 'confirmado' }).expect(201);

    await api().post('/api/adelantos').send({ empleadaId: e.id, montoCent: 500 }).expect(201);
    await api().post('/api/pagos').send({
      inicio: '2026-10-06', fin: '2026-10-06', etiqueta: 'Ana · hasta 6', empleadaIds: [e.id],
    }).expect(201);

    const todos = await api().get('/api/movimientos').query({ limit: 20 }).expect(200);
    const tipos = todos.body.items.map((m) => m.tipo);
    assert.ok(tipos.includes('adelanto.crear'));
    assert.ok(tipos.includes('adelanto.aplicar'));
    assert.ok(tipos.includes('pago.crear'));

    const deAna = await api().get('/api/movimientos').query({ empleadaId: e.id, limit: 10 }).expect(200);
    assert.ok(deAna.body.items.length >= 1);
    assert.ok(deAna.body.items.every((m) => !m.empleadaId || m.empleadaId === e.id || m.tipo === 'adelanto.aplicar'));
  });
});
