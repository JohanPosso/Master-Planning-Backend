import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { api, cerrarBD, crearEmpleada, crearTurno, estado, limpiarBD, prepararBD, tramo, uuid } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
after(cerrarBD);

const OCT = { inicio: '2026-10-01', fin: '2026-10-31', etiqueta: 'Octubre 2026' };

describe('Registro de horas', () => {
  it('guarda por empleada y día conservando el id existente', async () => {
    const e = await crearEmpleada();
    const id = uuid();
    const r1 = await api().put(`/api/registros/${e.id}/2026-10-05`).send({ id, tramos: tramo(540, 720), estado: 'previsto', nota: '  ' }).expect(201);
    assert.deepEqual(r1.body, { id, empleadaId: e.id, fecha: '2026-10-05', tramos: tramo(540, 720), estado: 'previsto' });

    const r2 = await api().put(`/api/registros/${e.id}/2026-10-05`).send({ id: uuid(), tramos: tramo(540, 750), estado: 'confirmado', nota: 'Inventario' }).expect(200);
    assert.equal(r2.body.id, id);
    assert.equal(r2.body.nota, 'Inventario');
  });

  it('confirmar día confirma existentes y crea desde lo planificado', async () => {
    const ana = await crearEmpleada();
    const eva = await crearEmpleada({ nombre: 'Eva', color: 'verde' });
    const sin = await crearEmpleada({ nombre: 'Sin turno', color: 'gris' });
    await crearTurno({ empleadaId: ana.id, fecha: '2026-10-05', tramos: tramo(400, 720) });
    await crearTurno({ empleadaId: eva.id, fecha: '2026-10-05' });
    await api().put(`/api/registros/${eva.id}/2026-10-05`).send({ tramos: tramo(540, 780), estado: 'previsto' }).expect(201);

    const res = await api().post('/api/registros/confirmar-dia').send({ fecha: '2026-10-05', empleadaIds: [ana.id, eva.id, sin.id] }).expect(200);
    const porEmpleada = Object.fromEntries(res.body.map((r) => [r.empleadaId, r]));
    assert.equal(res.body.length, 2);
    assert.deepEqual(porEmpleada[ana.id].tramos, tramo(400, 720));
    assert.deepEqual(porEmpleada[eva.id].tramos, tramo(540, 780), 'respeta lo ya registrado');
    assert.ok(res.body.every((r) => r.estado === 'confirmado'));
  });
});

describe('Nómina y pagos', () => {
  async function escenario() {
    const ana = await crearEmpleada({ tarifaCent: 1000 });
    const jefa = await crearEmpleada({ nombre: 'Valentina', rol: 'Jefa', color: 'rosa', excluirNomina: true });
    await api().patch('/api/ajustes').send({ recargoFestivoPct: 25, festivos: ['2026-10-12'] }).expect(200);
    await crearTurno({ empleadaId: ana.id, fecha: '2026-10-12', tramos: tramo(540, 660) }); // festivo, 2 h
    await crearTurno({ empleadaId: ana.id, fecha: '2026-10-13', tramos: tramo(635, 720) }); // 1 h 25
    await crearTurno({ empleadaId: jefa.id, fecha: '2026-10-13', tramos: tramo(540, 1260) });
    return { ana, jefa };
  }

  it('no deja pagar con horas sin confirmar y devuelve los días pendientes', async () => {
    await escenario();
    const res = await api().post('/api/pagos').send(OCT).expect(409);
    assert.deepEqual(res.body.error.details.pendientes, ['2026-10-12', '2026-10-13']);
  });

  it('calcula en el servidor, congela líneas y evita pagar dos veces', async () => {
    const { ana, jefa } = await escenario();
    for (const fecha of ['2026-10-12', '2026-10-13']) {
      await api().post('/api/registros/confirmar-dia').send({ fecha, empleadaIds: [ana.id, jefa.id] }).expect(200);
    }
    const previa = await api().get('/api/pagos/calculo').query({ inicio: OCT.inicio, fin: OCT.fin }).expect(200);
    assert.deepEqual(previa.body.pendientes, []);

    const id = uuid();
    const res = await api().post('/api/pagos').send({ ...OCT, id }).expect(201);
    // 2 h × 10 € + 25 % festivo = 25,00 €; 1 h 25 × 10 € = 14,17 €
    assert.equal(res.body.id, id);
    assert.equal(res.body.totalCent, 2500 + 1417);
    assert.deepEqual(res.body.lineas, [{ empleadaId: ana.id, minutos: 205, tarifaCent: 1000, recargosCent: 500, importeCent: 3917 }]);

    // Cambiar la tarifa no altera lo pagado
    await api().put(`/api/empleadas/${ana.id}`).send({ ...ana, tarifaCent: 2000 }).expect(200);
    assert.equal((await estado()).pagos[0].lineas[0].importeCent, 3917);

    await api().post('/api/pagos').send(OCT).expect(409);
    await api().post('/api/pagos').send({ inicio: '2026-10-10', fin: '2026-10-20', etiqueta: 'Rango' }).expect(409);

    await api().delete(`/api/pagos/${id}`).expect(204);
    assert.equal((await estado()).pagos.length, 0);
  });

  it('no permite borrar físicamente a una empleada con horas registradas', async () => {
    const e = await crearEmpleada();
    await api().put(`/api/registros/${e.id}/2026-10-05`).send({ tramos: tramo(540, 600), estado: 'confirmado' }).expect(201);
    await api().post('/api/sync').send({ empleadas: { delete: [e.id] } }).expect(409);
  });

  it('valida el periodo', async () => {
    await api().post('/api/pagos').send({ inicio: '2026-10-31', fin: '2026-10-01', etiqueta: 'X' }).expect(400);
    await api().post('/api/pagos').send({ inicio: '2026-01-01', fin: '2027-06-01', etiqueta: 'X' }).expect(400);
  });
});
