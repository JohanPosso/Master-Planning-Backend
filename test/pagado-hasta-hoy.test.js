import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { app, api, cerrarBD, crearEmpleada, limpiarBD, loginComo, prepararBD, tramo } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
after(cerrarBD);

describe('Pago individual hasta la fecha', () => {
  it('permite pagar a una empleada sin liquidar a la otra en las mismas fechas', async () => {
    const ana = await crearEmpleada({ nombre: 'Ana', tarifaCent: 1000 });
    const silvia = await crearEmpleada({ nombre: 'Silvia', color: 'verde', tarifaCent: 1000 });
    for (const e of [ana, silvia]) {
      await api().put(`/api/registros/${e.id}/2026-10-20`).send({ tramos: tramo(480, 780), estado: 'confirmado' }).expect(201);
    }

    const soloAna = await api().post('/api/pagos').send({
      inicio: '2026-10-16', fin: '2026-10-22', etiqueta: 'Ana · hasta 22 oct', empleadaIds: [ana.id],
    }).expect(201);
    assert.equal(soloAna.body.lineas.length, 1);
    assert.equal(soloAna.body.lineas[0].empleadaId, ana.id);
    assert.equal(soloAna.body.lineas[0].minutos, 300);

    await api().post('/api/pagos').send({
      inicio: '2026-10-16', fin: '2026-10-22', etiqueta: 'Ana otra vez', empleadaIds: [ana.id],
    }).expect(409);

    const silviaPago = await api().post('/api/pagos').send({
      inicio: '2026-10-16', fin: '2026-10-22', etiqueta: 'Silvia · hasta 22 oct', empleadaIds: [silvia.id],
    }).expect(201);
    assert.equal(silviaPago.body.lineas[0].empleadaId, silvia.id);

    assert.equal((await api().get('/api/pagos').expect(200)).body.length, 2);
  });

  it('al pagar a todas sin filtro sigue funcionando', async () => {
    const e = await crearEmpleada({ tarifaCent: 1000 });
    await api().put(`/api/registros/${e.id}/2026-10-05`).send({ tramos: tramo(480, 780), estado: 'confirmado' }).expect(201);
    const res = await api().post('/api/pagos').send({ inicio: '2026-10-01', fin: '2026-10-15', etiqueta: '1ª quincena' }).expect(201);
    assert.equal(res.body.lineas[0].minutos, 300);
  });
});

describe('Fichaje sin Wi-Fi y cierre mediodía', () => {
  it('con Wi-Fi apagado se puede fichar sin IP de la cafetería', async () => {
    await crearEmpleada({ usuario: 'ana', password: 'ana1234' });
    await api().put('/api/fichaje/config').send({
      geocerca: { activa: false, latitud: null, longitud: null, radioM: 150 },
      red: { activa: false, ips: ['185.250.76.217'] },
      sinVerificar: 'revisar',
      cierreAutomaticoHoras: 10,
    }).expect(200);

    const { token } = await loginComo('ana', 'ana1234');
    const fichaje = await request(app)
      .post('/api/portal/fichajes')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'entrada' })
      .expect(201);

    assert.equal(fichaje.body.fichaje.tipo, 'entrada');
    assert.equal(fichaje.body.fichaje.verificacion, undefined);
  });

  it('acepta cierre mediodía en las reglas y lo persiste', async () => {
    const res = await api().patch('/api/reglas').send({
      cierres: [{ desde: 840, hasta: 1020 }],
    }).expect(200);
    assert.deepEqual(res.body.cierres, [{ desde: 840, hasta: 1020 }]);
  });
});
