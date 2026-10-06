import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { env } from '../src/config/env.js';
import { hoyEn, sumarDias } from '../src/domain/fechas.js';
import { api, cerrarBD, crearEmpleada, crearTurno, estado, limpiarBD, prepararBD, uuid } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
after(cerrarBD);

describe('Empleadas', () => {
  it('crea (201), actualiza (200) y lista con el contrato del frontend', async () => {
    const e = await crearEmpleada({ nombre: '  Silvia ', diasDescanso: [4, 3, 3] });
    assert.equal(e.nombre, 'Silvia');
    assert.deepEqual(e.diasDescanso, [3, 4]);
    assert.equal(e.activa, true);
    assert.equal('eliminadaEn' in e, false);
    assert.equal('createdAt' in e, false);

    const res = await api().put(`/api/empleadas/${e.id}`).send({ ...e, tarifaCent: 1250 }).expect(200);
    assert.equal(res.body.tarifaCent, 1250);

    const lista = await api().get('/api/empleadas').expect(200);
    assert.equal(lista.body.length, 1);
  });

  it('valida los datos con mensajes por campo', async () => {
    const res = await api().put(`/api/empleadas/${uuid()}`).send({ nombre: ' ', rol: 'Jefa', color: 'fucsia', tarifaCent: -1 }).expect(400);
    assert.equal(res.body.error.code, 'VALIDATION');
    const campos = res.body.error.details.map((d) => d.path).sort();
    assert.deepEqual(campos, ['color', 'nombre', 'tarifaCent']);
  });

  it('rechaza ids que no son UUID', async () => {
    await api().put('/api/empleadas/val').send({ nombre: 'Val', rol: 'Jefa', color: 'rosa', tarifaCent: 0 }).expect(400);
  });

  it('elimina de forma lógica y quita solo sus turnos desde hoy', async () => {
    const e = await crearEmpleada();
    const hoy = hoyEn(env.timezone);
    const pasado = await crearTurno({ empleadaId: e.id, fecha: sumarDias(hoy, -3) });
    await crearTurno({ empleadaId: e.id, fecha: hoy });
    await crearTurno({ empleadaId: e.id, fecha: sumarDias(hoy, 5) });

    const res = await api().delete(`/api/empleadas/${e.id}`).expect(200);
    assert.equal(res.body.empleada.eliminadaEn, hoy);
    assert.equal(res.body.empleada.activa, false);
    assert.equal(res.body.turnosEliminados, 2);

    const s = await estado();
    assert.deepEqual(s.turnos.map((t) => t.id), [pasado.id]);
    assert.equal(s.empleadas.length, 1, 'se conserva para el histórico');
  });

  it('devuelve 404 al eliminar una empleada inexistente', async () => {
    const res = await api().delete(`/api/empleadas/${uuid()}`).expect(404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});

describe('Estado', () => {
  it('devuelve el State completo que consume el frontend', async () => {
    const s = await estado();
    assert.deepEqual(Object.keys(s).sort(), ['ajustes', 'empleadas', 'pagos', 'plantillas', 'registros', 'reglas', 'semanas', 'turnos', 'version']);
    assert.equal(s.version, 1);
    assert.equal(s.reglas.maxHorasSemana.valor, 40);
    assert.deepEqual(s.ajustes, { recargoDomingoPct: 0, recargoFestivoPct: 0, festivos: [] });
  });

  it('responde 404 JSON en rutas desconocidas y 400 con JSON mal formado', async () => {
    await api().get('/api/no-existe').expect(404);
    const res = await api().put(`/api/empleadas/${uuid()}`).set('Content-Type', 'application/json').send('{mal').expect(400);
    assert.equal(res.body.error.code, 'BAD_JSON');
  });
});
