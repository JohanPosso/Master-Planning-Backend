/**
 * Escenarios reales de pago por empleada: adelanto, nuevos días tras pagar,
 * no pisar a otra, no pagar dos veces, borrar y volver a deber.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { api, cerrarBD, crearEmpleada, limpiarBD, prepararBD, tramo } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
after(cerrarBD);

async function horas(empleadaId, fecha, desde = 480, hasta = 600) {
  // 2 h por defecto (480–600)
  await api().put(`/api/registros/${empleadaId}/${fecha}`).send({ tramos: tramo(desde, hasta), estado: 'confirmado' }).expect(201);
}

async function pendiente(empleadaId, inicio, fin) {
  const calc = await api().get('/api/pagos/calculo').query({ inicio, fin }).expect(200);
  const linea = calc.body.lineas.find((l) => l.empleadaId === empleadaId && !l.excluida);
  return { minutos: linea?.minutos ?? 0, importeCent: linea?.importeCent ?? 0, pendientes: calc.body.pendientes };
}

describe('Escenarios de pago individual', () => {
  it('1) Pagar 2 h a Ana no toca a Silvia; después Ana vuelve a deber si trabaja más días', async () => {
    const ana = await crearEmpleada({ nombre: 'Ana', tarifaCent: 1000 });
    const silvia = await crearEmpleada({ nombre: 'Silvia', color: 'verde', tarifaCent: 1000 });

    await horas(ana.id, '2026-10-06'); // lun 2 h
    await horas(silvia.id, '2026-10-06'); // misma fecha, Silvia

    const adelanto = await api().post('/api/pagos').send({
      inicio: '2026-10-06', fin: '2026-10-06', etiqueta: 'Ana · adelanto 6 oct', empleadaIds: [ana.id],
    }).expect(201);
    assert.equal(adelanto.body.lineas.length, 1);
    assert.equal(adelanto.body.lineas[0].empleadaId, ana.id);
    assert.equal(adelanto.body.lineas[0].minutos, 120);
    assert.equal(adelanto.body.totalCent, 2000); // 2 h × 10 €

    // Silvia sigue debiendo esas 2 h
    const silviaTras = await pendiente(silvia.id, '2026-10-06', '2026-10-06');
    assert.equal(silviaTras.minutos, 120);

    // Ana ya no debe el día 6 (el cálculo bruto del servidor no resta pagos;
    // el solape impide volver a pagárselo)
    await api().post('/api/pagos').send({
      inicio: '2026-10-06', fin: '2026-10-06', etiqueta: 'Ana otra vez', empleadaIds: [ana.id],
    }).expect(409);

    // Nuevos días de Ana → nuevo pendiente
    await horas(ana.id, '2026-10-08'); // mié 2 h
    await horas(ana.id, '2026-10-09'); // jue 2 h

    const segundo = await api().post('/api/pagos').send({
      inicio: '2026-10-07', fin: '2026-10-09', etiqueta: 'Ana · hasta 9 oct', empleadaIds: [ana.id],
    }).expect(201);
    assert.equal(segundo.body.lineas[0].minutos, 240);
    assert.equal(segundo.body.totalCent, 4000);

    // Silvia aún se puede pagar el día 6
    const silviaPago = await api().post('/api/pagos').send({
      inicio: '2026-10-06', fin: '2026-10-06', etiqueta: 'Silvia · 6 oct', empleadaIds: [silvia.id],
    }).expect(201);
    assert.equal(silviaPago.body.lineas[0].empleadaId, silvia.id);

    assert.equal((await api().get('/api/pagos').expect(200)).body.length, 3);
  });

  it('2) Tras pagar hasta el día 10, añadir horas el 15 y pagar solo ese tramo', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await horas(e.id, '2026-10-08', 480, 780); // 5 h
    await horas(e.id, '2026-10-10', 480, 780); // 5 h

    await api().post('/api/pagos').send({
      inicio: '2026-10-01', fin: '2026-10-10', etiqueta: 'Hasta 10', empleadaIds: [e.id],
    }).expect(201);

    // «Avanzar la fecha»: trabaja el 15
    await horas(e.id, '2026-10-15', 540, 720); // 3 h

    const pagoNuevo = await api().post('/api/pagos').send({
      inicio: '2026-10-11', fin: '2026-10-15', etiqueta: 'Hasta 15', empleadaIds: [e.id],
    }).expect(201);
    assert.equal(pagoNuevo.body.lineas[0].minutos, 180);
    assert.equal(pagoNuevo.body.totalCent, 3000);

    // No se puede solapar con lo ya pagado
    await api().post('/api/pagos').send({
      inicio: '2026-10-10', fin: '2026-10-12', etiqueta: 'Solapa', empleadaIds: [e.id],
    }).expect(409);
  });

  it('3) Horas sin confirmar de Ana no bloquean el pago de Silvia', async () => {
    const ana = await crearEmpleada({ nombre: 'Ana', tarifaCent: 1000 });
    const silvia = await crearEmpleada({ nombre: 'Silvia', color: 'verde', tarifaCent: 1000 });

    await api().put(`/api/registros/${ana.id}/2026-10-20`).send({ tramos: tramo(480, 600), estado: 'previsto' }).expect(201);
    await horas(silvia.id, '2026-10-20');

    await api().post('/api/pagos').send({
      inicio: '2026-10-20', fin: '2026-10-20', etiqueta: 'Ana sin confirmar', empleadaIds: [ana.id],
    }).expect(409);

    const ok = await api().post('/api/pagos').send({
      inicio: '2026-10-20', fin: '2026-10-20', etiqueta: 'Silvia ok', empleadaIds: [silvia.id],
    }).expect(201);
    assert.equal(ok.body.lineas[0].empleadaId, silvia.id);
  });

  it('4) Borrar un pago individual vuelve a dejar pendiente a esa empleada', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await horas(e.id, '2026-10-12', 480, 780);

    const pago = await api().post('/api/pagos').send({
      inicio: '2026-10-12', fin: '2026-10-12', etiqueta: 'Pago', empleadaIds: [e.id],
    }).expect(201);

    await api().delete(`/api/pagos/${pago.body.id}`).expect(204);

    const otraVez = await api().post('/api/pagos').send({
      inicio: '2026-10-12', fin: '2026-10-12', etiqueta: 'Repago', empleadaIds: [e.id],
    }).expect(201);
    assert.equal(otraVez.body.totalCent, 5000);
  });

  it('5) Empleada excluida de nómina no genera línea aunque tenga horas', async () => {
    const jefa = await crearEmpleada({ nombre: 'Jefa', rol: 'Jefa', color: 'rosa', excluirNomina: true, tarifaCent: 1000 });
    const ana = await crearEmpleada({ nombre: 'Ana', tarifaCent: 1000 });
    await horas(jefa.id, '2026-10-13', 480, 780);
    await horas(ana.id, '2026-10-13', 480, 600);

    await api().post('/api/pagos').send({
      inicio: '2026-10-13', fin: '2026-10-13', etiqueta: 'Jefa', empleadaIds: [jefa.id],
    }).expect(409);

    const pago = await api().post('/api/pagos').send({
      inicio: '2026-10-13', fin: '2026-10-13', etiqueta: 'Ana', empleadaIds: [ana.id],
    }).expect(201);
    assert.equal(pago.body.lineas.length, 1);
    assert.equal(pago.body.lineas[0].empleadaId, ana.id);
  });

  it('6) Pago de todo el equipo y luego individual de otra fecha coexiste', async () => {
    const ana = await crearEmpleada({ nombre: 'Ana', tarifaCent: 1000 });
    const silvia = await crearEmpleada({ nombre: 'Silvia', color: 'verde', tarifaCent: 1000 });
    await horas(ana.id, '2026-10-05');
    await horas(silvia.id, '2026-10-05');

    const equipo = await api().post('/api/pagos').send({
      inicio: '2026-10-05', fin: '2026-10-05', etiqueta: 'Equipo 5 oct',
    }).expect(201);
    assert.equal(equipo.body.lineas.length, 2);

    await horas(ana.id, '2026-10-18');
    const soloAna = await api().post('/api/pagos').send({
      inicio: '2026-10-18', fin: '2026-10-18', etiqueta: 'Ana 18', empleadaIds: [ana.id],
    }).expect(201);
    assert.equal(soloAna.body.lineas.length, 1);

    await api().post('/api/pagos').send({
      inicio: '2026-10-05', fin: '2026-10-05', etiqueta: 'Otra vez equipo', empleadaIds: [ana.id],
    }).expect(409);
  });
});
