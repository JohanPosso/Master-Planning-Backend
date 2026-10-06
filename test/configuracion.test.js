import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { api, cerrarBD, crearEmpleada, crearTurno, estado, limpiarBD, prepararBD, tramo } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
after(cerrarBD);

describe('Reglas y ajustes', () => {
  it('fusiona cambios parciales de reglas y valida el resultado', async () => {
    const res = await api().patch('/api/reglas').send({ maxHorasDia: { activa: false, valor: 9 } }).expect(200);
    assert.deepEqual(res.body.maxHorasDia, { activa: false, valor: 9 });
    assert.equal(res.body.maxHorasSemana.valor, 40, 'conserva el resto');

    await api().patch('/api/reglas').send({ apertura: { desde: 900, hasta: 600 } }).expect(400);
    await api().patch('/api/reglas').send({}).expect(400);
    assert.deepEqual((await estado()).reglas.maxHorasDia, { activa: false, valor: 9 });
  });

  it('actualiza recargos y sustituye festivos (ordenados y sin duplicados)', async () => {
    const res = await api().patch('/api/ajustes').send({ recargoDomingoPct: 10, festivos: ['2026-12-25', '2026-10-12', '2026-12-25'] }).expect(200);
    assert.deepEqual(res.body, { recargoDomingoPct: 10, recargoFestivoPct: 0, festivos: ['2026-10-12', '2026-12-25'] });
    const sin = await api().patch('/api/ajustes').send({ festivos: [] }).expect(200);
    assert.deepEqual(sin.body.festivos, []);
    await api().patch('/api/ajustes').send({ festivos: ['2026-02-30'] }).expect(400);
  });
});

describe('Sync (deshacer)', () => {
  it('deshace un «mover» que había sustituido a otro turno (intercambio de huecos)', async () => {
    const ana = await crearEmpleada();
    const a = await crearTurno({ empleadaId: ana.id, fecha: '2026-09-07', tramos: tramo(400, 720) });
    const b = await crearTurno({ empleadaId: ana.id, fecha: '2026-09-08', tramos: tramo(1080, 1200) });
    const antes = await estado();

    await api().post(`/api/turnos/${a.id}/mover`).send({ empleadaId: ana.id, fecha: '2026-09-08' }).expect(200);
    // Ahora: a ocupa el martes y b ya no existe. Deshacer = devolver a al lunes y recrear b en el martes.
    await api()
      .post('/api/sync')
      .send({ turnos: { upsert: antes.turnos, delete: [] } })
      .expect(200);

    const despues = await estado();
    assert.deepEqual(despues.turnos, antes.turnos);
    assert.ok(despues.turnos.some((t) => t.id === b.id));
  });

  it('restaura una empleada eliminada con sus turnos futuros', async () => {
    const e = await crearEmpleada();
    await crearTurno({ empleadaId: e.id, fecha: '2099-01-05' });
    const antes = await estado();
    await api().delete(`/api/empleadas/${e.id}`).expect(200);

    await api().post('/api/sync').send({ empleadas: { upsert: antes.empleadas }, turnos: { upsert: antes.turnos } }).expect(200);
    const despues = await estado();
    assert.deepEqual(despues.empleadas, antes.empleadas);
    assert.deepEqual(despues.turnos, antes.turnos);
  });

  it('es atómico: si una operación falla no se aplica ninguna', async () => {
    const e = await crearEmpleada();
    const t = await crearTurno({ empleadaId: e.id, fecha: '2026-09-07' });
    await api()
      .post('/api/sync')
      .send({ turnos: { delete: [t.id] }, empleadas: { upsert: [{ ...e, color: 'no-existe' }] } })
      .expect(400);
    await api()
      .post('/api/sync')
      .send({ turnos: { delete: [t.id], upsert: [{ ...t, id: crypto.randomUUID(), empleadaId: crypto.randomUUID() }] } })
      .expect(409);
    assert.equal((await estado()).turnos.length, 1);
  });

  it('restaura reglas y ajustes completos', async () => {
    const antes = await estado();
    await api().patch('/api/reglas').send({ diaLibre: false }).expect(200);
    await api().patch('/api/ajustes').send({ recargoFestivoPct: 50, festivos: ['2026-10-12'] }).expect(200);
    await api().post('/api/sync').send({ reglas: antes.reglas, ajustes: antes.ajustes }).expect(200);
    const despues = await estado();
    assert.deepEqual(despues.reglas, antes.reglas);
    assert.deepEqual(despues.ajustes, antes.ajustes);
  });
});
