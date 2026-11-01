/**
 * Escenarios límite de adelantos / liquidación que suelen romper en producción.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { api, cerrarBD, crearEmpleada, estado, limpiarBD, prepararBD, tramo } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
after(cerrarBD);

async function horas(empleadaId, fecha, desde = 480, hasta = 600) {
  await api().put(`/api/registros/${empleadaId}/${fecha}`).send({ tramos: tramo(desde, hasta), estado: 'confirmado' }).expect(201);
}

describe('Escenarios límite adelantos/liquidación', () => {
  it('adelanto mayor que el pago deja saldo y neto 0 en ese periodo', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await horas(e.id, '2026-10-06'); // 20 €
    await api().post('/api/adelantos').send({ empleadaId: e.id, montoCent: 50_00 }).expect(201);

    const pago = await api().post('/api/pagos').send({
      inicio: '2026-10-06', fin: '2026-10-06', etiqueta: 'Liquidar', empleadaIds: [e.id],
    }).expect(201);
    assert.equal(pago.body.totalCent, 2000);
    assert.equal(pago.body.adelantoDescontadoCent, 2000);

    const adelantos = (await api().get('/api/adelantos').expect(200)).body;
    assert.equal(adelantos[0].saldoCent, 3000);
  });

  it('adelanto de Ana no se descuenta al liquidar a Silvia', async () => {
    const ana = await crearEmpleada({ nombre: 'Ana', tarifaCent: 1000 });
    const silvia = await crearEmpleada({ nombre: 'Silvia', color: 'verde', tarifaCent: 1000 });
    await horas(ana.id, '2026-10-06');
    await horas(silvia.id, '2026-10-06');
    await api().post('/api/adelantos').send({ empleadaId: ana.id, montoCent: 1000 }).expect(201);

    const pagoSilvia = await api().post('/api/pagos').send({
      inicio: '2026-10-06', fin: '2026-10-06', etiqueta: 'Silvia', empleadaIds: [silvia.id],
    }).expect(201);
    assert.equal(pagoSilvia.body.adelantoDescontadoCent, 0);

    const pagoAna = await api().post('/api/pagos').send({
      inicio: '2026-10-06', fin: '2026-10-06', etiqueta: 'Ana', empleadaIds: [ana.id],
    }).expect(201);
    assert.equal(pagoAna.body.adelantoDescontadoCent, 1000);
  });

  it('rechaza monto 0 / negativo / empleada excluida / inexistente', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await api().post('/api/adelantos').send({ empleadaId: e.id, montoCent: 0 }).expect(400);
    await api().post('/api/adelantos').send({ empleadaId: e.id, montoCent: -100 }).expect(400);

    const excluida = await crearEmpleada({ nombre: 'Jefa', color: 'rojo', excluirNomina: true });
    await api().post('/api/adelantos').send({ empleadaId: excluida.id, montoCent: 1000 }).expect(409);

    await api().post('/api/adelantos').send({
      empleadaId: '00000000-0000-4000-8000-000000000099', montoCent: 1000,
    }).expect(404);
  });

  it('estado incluye adelantos y pagos con adelantoDescontadoCent', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await horas(e.id, '2026-10-01');
    await api().post('/api/adelantos').send({ empleadaId: e.id, montoCent: 500 }).expect(201);
    await api().post('/api/pagos').send({
      inicio: '2026-10-01', fin: '2026-10-01', etiqueta: 'X', empleadaIds: [e.id],
    }).expect(201);

    const s = await estado();
    assert.ok(Array.isArray(s.adelantos));
    assert.equal(s.adelantos.length, 1);
    assert.equal(s.adelantos[0].saldoCent, 0);
    assert.equal(s.pagos[0].adelantoDescontadoCent, 500);
  });

  it('liquidar solo hasta mitad del mes deja el resto pendiente (sin solape)', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await horas(e.id, '2026-10-10');
    await horas(e.id, '2026-10-20');
    await horas(e.id, '2026-10-25');

    await api().post('/api/pagos').send({
      inicio: '2026-10-01', fin: '2026-10-15', etiqueta: 'Hasta 15', empleadaIds: [e.id],
    }).expect(201);

    // El día 20 y 25 siguen pagables
    const resto = await api().post('/api/pagos').send({
      inicio: '2026-10-16', fin: '2026-10-31', etiqueta: 'Resto', empleadaIds: [e.id],
    }).expect(201);
    assert.equal(resto.body.lineas[0].minutos, 240);

    // No se puede volver a incluir el 10
    await api().post('/api/pagos').send({
      inicio: '2026-10-10', fin: '2026-10-10', etiqueta: 'Otra', empleadaIds: [e.id],
    }).expect(409);
  });

  it('adelanto sin horas confirmadas no bloquea; liquidar sí exige confirmados', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await api().put(`/api/registros/${e.id}/2026-10-12`).send({ tramos: tramo(480, 600), estado: 'previsto' }).expect(201);

    await api().post('/api/adelantos').send({ empleadaId: e.id, montoCent: 1000 }).expect(201);

    await api().post('/api/pagos').send({
      inicio: '2026-10-12', fin: '2026-10-12', etiqueta: 'Sin confirmar', empleadaIds: [e.id],
    }).expect(409);
  });
});
