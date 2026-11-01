/**
 * Adelantos en € (sin cerrar días) y liquidación hasta fecha con descuento FIFO.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { api, cerrarBD, crearEmpleada, limpiarBD, prepararBD, tramo } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
after(cerrarBD);

async function horas(empleadaId, fecha, desde = 480, hasta = 600) {
  await api().put(`/api/registros/${empleadaId}/${fecha}`).send({ tramos: tramo(desde, hasta), estado: 'confirmado' }).expect(201);
}

describe('Adelantos y liquidación por fecha', () => {
  it('el adelanto no cierra días; al liquidar se descuenta el saldo FIFO', async () => {
    const ana = await crearEmpleada({ nombre: 'Ana', tarifaCent: 1000 });
    await horas(ana.id, '2026-10-06'); // 2 h = 20 €
    await horas(ana.id, '2026-10-08'); // 2 h = 20 €

    const adelanto = await api().post('/api/adelantos').send({
      empleadaId: ana.id, montoCent: 1500, // 15 €
    }).expect(201);
    assert.equal(adelanto.body.montoCent, 1500);
    assert.equal(adelanto.body.saldoCent, 1500);

    // Aún se puede liquidar el día 6 (el adelanto no marcó días)
    const pago = await api().post('/api/pagos').send({
      inicio: '2026-10-06', fin: '2026-10-06', etiqueta: 'Ana · hasta 6', empleadaIds: [ana.id],
    }).expect(201);
    assert.equal(pago.body.totalCent, 2000);
    assert.equal(pago.body.adelantoDescontadoCent, 1500);

    const lista = await api().get('/api/adelantos').expect(200);
    const a = lista.body.find((x) => x.id === adelanto.body.id);
    assert.equal(a.saldoCent, 0);

    // Segundo pago: ya no hay adelanto que descontar
    const segundo = await api().post('/api/pagos').send({
      inicio: '2026-10-07', fin: '2026-10-08', etiqueta: 'Ana · hasta 8', empleadaIds: [ana.id],
    }).expect(201);
    assert.equal(segundo.body.totalCent, 2000);
    assert.equal(segundo.body.adelantoDescontadoCent, 0);
  });

  it('permite liquidar un mes vencido (p. ej. octubre visto en noviembre)', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await horas(e.id, '2026-10-30');
    await horas(e.id, '2026-10-31');

    const pago = await api().post('/api/pagos').send({
      inicio: '2026-10-01', fin: '2026-10-31', etiqueta: 'Hasta 31 oct', empleadaIds: [e.id],
    }).expect(201);
    assert.equal(pago.body.lineas[0].minutos, 240);
    assert.equal(pago.body.fin, '2026-10-31');

    await api().post('/api/pagos').send({
      inicio: '2026-10-01', fin: '2026-10-31', etiqueta: 'Otra vez', empleadaIds: [e.id],
    }).expect(409);
  });

  it('FIFO: varios adelantos se aplican en orden de creación', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await horas(e.id, '2026-10-10', 480, 780); // 5 h = 50 €

    const a1 = await api().post('/api/adelantos').send({ empleadaId: e.id, montoCent: 2000 }).expect(201);
    const a2 = await api().post('/api/adelantos').send({ empleadaId: e.id, montoCent: 4000 }).expect(201);

    const pago = await api().post('/api/pagos').send({
      inicio: '2026-10-10', fin: '2026-10-10', etiqueta: 'Liquidar', empleadaIds: [e.id],
    }).expect(201);
    assert.equal(pago.body.adelantoDescontadoCent, 5000); // todo el importe

    const lista = await api().get('/api/adelantos').expect(200);
    assert.equal(lista.body.find((x) => x.id === a1.body.id).saldoCent, 0);
    assert.equal(lista.body.find((x) => x.id === a2.body.id).saldoCent, 1000); // 40 − 30 restantes
  });

  it('no se puede borrar un adelanto ya aplicado parcialmente', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await horas(e.id, '2026-10-05'); // 20 €
    const a = await api().post('/api/adelantos').send({ empleadaId: e.id, montoCent: 5000 }).expect(201);

    await api().post('/api/pagos').send({
      inicio: '2026-10-05', fin: '2026-10-05', etiqueta: 'Parcial', empleadaIds: [e.id],
    }).expect(201);

    await api().delete(`/api/adelantos/${a.body.id}`).expect(409);

    const intacto = await api().post('/api/adelantos').send({ empleadaId: e.id, montoCent: 1000 }).expect(201);
    await api().delete(`/api/adelantos/${intacto.body.id}`).expect(204);
  });
});
