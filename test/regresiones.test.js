import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { env } from '../src/config/env.js';
import { hoyEn, sumarDias } from '../src/domain/fechas.js';
import { api, cerrarBD, crearEmpleada, limpiarBD, prepararBD, tramo, uuid } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
after(cerrarBD);

/** Fallos encontrados en la prueba E2E del 6/10/2026. */
describe('Regresiones E2E', () => {
  it('PUT simultáneos al mismo hueco: sin deadlock (500) y queda un solo turno', async () => {
    const e = await crearEmpleada();
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      api().put(`/api/turnos/${uuid()}`).send({ empleadaId: e.id, fecha: '2026-09-07', tramos: tramo(500 + i, 700) })));
    assert.ok(rs.every((r) => r.status < 500), rs.map((r) => r.status).join(','));
    const lista = await api().get('/api/turnos').expect(200);
    assert.equal(lista.body.length, 1);
  });

  it('mover y copiar semana a la vez sobre los mismos huecos no da 500', async () => {
    const e = await crearEmpleada();
    const t = (await api().put(`/api/turnos/${uuid()}`).send({ empleadaId: e.id, fecha: '2026-08-31', tramos: tramo(400, 720) }).expect(201)).body;
    const rs = await Promise.all([
      api().post('/api/semanas/2026-09-07/copiar-anterior'),
      api().post(`/api/turnos/${t.id}/mover`).send({ empleadaId: e.id, fecha: '2026-09-07', duplicar: true }),
      api().put(`/api/turnos/${uuid()}`).send({ empleadaId: e.id, fecha: '2026-09-07', tramos: tramo(600, 700) }),
    ]);
    assert.ok(rs.every((r) => r.status < 500), rs.map((r) => r.status).join(','));
    const semana = await api().get('/api/turnos').query({ desde: '2026-09-07', hasta: '2026-09-07' }).expect(200);
    assert.equal(semana.body.length, 1);
  });

  it('registros y confirmar día simultáneos: un registro por día', async () => {
    const e = await crearEmpleada();
    await api().put(`/api/turnos/${uuid()}`).send({ empleadaId: e.id, fecha: '2026-09-08', tramos: tramo(600, 700) }).expect(201);
    const rs = await Promise.all([
      ...Array.from({ length: 4 }, () => api().put(`/api/registros/${e.id}/2026-09-08`).send({ tramos: tramo(600, 720), estado: 'previsto' })),
      api().post('/api/registros/confirmar-dia').send({ fecha: '2026-09-08', empleadaIds: [e.id] }),
    ]);
    assert.ok(rs.every((r) => r.status < 500), rs.map((r) => r.status).join(','));
    assert.equal((await api().get('/api/registros').expect(200)).body.length, 1);
  });

  it('fechas fuera de rango (año 0, < 1900, > 2999) → 400', async () => {
    const e = await crearEmpleada();
    for (const fecha of ['0000-01-01', '1899-12-31', '3000-01-01']) {
      await api().put(`/api/turnos/${uuid()}`).send({ empleadaId: e.id, fecha, tramos: tramo(1, 2) }).expect(400);
    }
  });

  it('no se paga un periodo vacío ni uno que aún no ha empezado', async () => {
    await crearEmpleada();
    const vacio = await api().post('/api/pagos').send({ inicio: '2026-08-01', fin: '2026-08-31', etiqueta: 'Agosto' }).expect(409);
    assert.match(vacio.body.error.message, /No hay horas/);
    const manana = sumarDias(hoyEn(env.timezone), 1);
    const futuro = await api().post('/api/pagos').send({ inicio: manana, fin: sumarDias(manana, 5), etiqueta: 'Futuro' }).expect(409);
    assert.match(futuro.body.error.message, /no ha empezado/);
    assert.equal((await api().get('/api/pagos').expect(200)).body.length, 0);
  });
});
