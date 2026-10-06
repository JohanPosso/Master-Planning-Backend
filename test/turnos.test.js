import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { api, cerrarBD, crearEmpleada, crearPlantilla, crearTurno, estado, limpiarBD, prepararBD, tramo, uuid } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
after(cerrarBD);

const LUNES = '2026-09-07';
const MARTES = '2026-09-08';

describe('Turnos', () => {
  it('un turno nuevo en un día ocupado sustituye al anterior', async () => {
    const e = await crearEmpleada();
    const a = await crearTurno({ empleadaId: e.id, fecha: LUNES });
    const b = await crearTurno({ empleadaId: e.id, fecha: LUNES, tramos: [{ inicio: 540, fin: 660 }, { inicio: 1080, fin: 1200 }] });
    const { turnos } = await estado();
    assert.deepEqual(turnos.map((t) => t.id), [b.id]);
    assert.notEqual(a.id, b.id);
  });

  it('rechaza tramos solapados o con fin antes del inicio', async () => {
    const e = await crearEmpleada();
    const base = { empleadaId: e.id, fecha: LUNES };
    await api().put(`/api/turnos/${uuid()}`).send({ ...base, tramos: [{ inicio: 540, fin: 720 }, { inicio: 700, fin: 800 }] }).expect(400);
    await api().put(`/api/turnos/${uuid()}`).send({ ...base, tramos: tramo(720, 540) }).expect(400);
    await api().put(`/api/turnos/${uuid()}`).send({ ...base, tramos: [] }).expect(400);
  });

  it('descarta la referencia a una plantilla que ya no existe', async () => {
    const e = await crearEmpleada();
    const t = await crearTurno({ empleadaId: e.id, fecha: LUNES, plantillaId: uuid() });
    assert.equal('plantillaId' in t, false);
  });

  it('no asigna turnos a empleadas eliminadas (409)', async () => {
    const e = await crearEmpleada();
    await api().delete(`/api/empleadas/${e.id}`).expect(200);
    const res = await api().put(`/api/turnos/${uuid()}`).send({ empleadaId: e.id, fecha: '2099-01-05', tramos: tramo(540, 600) }).expect(409);
    assert.match(res.body.error.message, /eliminada/);
  });

  it('mueve un turno sustituyendo al que ocupaba el destino', async () => {
    const ana = await crearEmpleada();
    const eva = await crearEmpleada({ nombre: 'Eva', color: 'verde' });
    const t1 = await crearTurno({ empleadaId: ana.id, fecha: LUNES });
    await crearTurno({ empleadaId: eva.id, fecha: MARTES });

    const res = await api().post(`/api/turnos/${t1.id}/mover`).send({ empleadaId: eva.id, fecha: MARTES }).expect(200);
    assert.equal(res.body.id, t1.id);
    const { turnos } = await estado();
    assert.deepEqual(turnos.map((t) => [t.id, t.empleadaId, t.fecha]), [[t1.id, eva.id, MARTES]]);
  });

  it('duplica con el id que propone el cliente y soltar en la misma celda no hace nada', async () => {
    const e = await crearEmpleada();
    const t = await crearTurno({ empleadaId: e.id, fecha: LUNES });
    const nuevoId = uuid();
    const copia = await api().post(`/api/turnos/${t.id}/mover`).send({ empleadaId: e.id, fecha: MARTES, duplicar: true, nuevoId }).expect(201);
    assert.equal(copia.body.id, nuevoId);
    await api().post(`/api/turnos/${t.id}/mover`).send({ empleadaId: e.id, fecha: LUNES, duplicar: true }).expect(200);
    assert.equal((await estado()).turnos.length, 2);
  });

  it('crea desde plantilla copiando sus tramos', async () => {
    const e = await crearEmpleada();
    const p = await crearPlantilla({ tramos: [{ inicio: 570, fin: 660 }, { inicio: 1080, fin: 1200 }] });
    const id = uuid();
    const res = await api().post('/api/turnos/desde-plantilla').send({ id, plantillaId: p.id, empleadaId: e.id, fecha: LUNES }).expect(201);
    assert.deepEqual(res.body, { id, empleadaId: e.id, fecha: LUNES, tramos: p.tramos, plantillaId: p.id });
  });

  it('al borrar una plantilla los turnos se conservan sin referencia', async () => {
    const e = await crearEmpleada();
    const p = await crearPlantilla();
    await api().post('/api/turnos/desde-plantilla').send({ plantillaId: p.id, empleadaId: e.id, fecha: LUNES }).expect(201);
    await api().delete(`/api/plantillas/${p.id}`).expect(204);
    const { turnos, plantillas } = await estado();
    assert.equal(plantillas.length, 0);
    assert.equal(turnos.length, 1);
    assert.equal(turnos[0].plantillaId, undefined);
  });

  it('filtra por rango de fechas y elimina (204 / 404)', async () => {
    const e = await crearEmpleada();
    const t = await crearTurno({ empleadaId: e.id, fecha: LUNES });
    await crearTurno({ empleadaId: e.id, fecha: '2026-09-20' });
    const res = await api().get('/api/turnos').query({ desde: LUNES, hasta: '2026-09-13' }).expect(200);
    assert.deepEqual(res.body.map((x) => x.id), [t.id]);
    await api().delete(`/api/turnos/${t.id}`).expect(204);
    await api().delete(`/api/turnos/${t.id}`).expect(404);
  });
});

describe('Semanas', () => {
  it('publica y vuelve a borrador; exige que la clave sea lunes', async () => {
    await api().put(`/api/semanas/${LUNES}`).send({ publicada: true }).expect(200, { lunes: LUNES, publicada: true });
    await api().put(`/api/semanas/${LUNES}`).send({ publicada: false }).expect(200, { lunes: LUNES, publicada: false });
    await api().put(`/api/semanas/${MARTES}`).send({ publicada: true }).expect(400);
    assert.equal((await estado()).semanas.length, 1);
  });

  it('copiar semana anterior solo rellena huecos y omite eliminadas', async () => {
    const ana = await crearEmpleada();
    const eva = await crearEmpleada({ nombre: 'Eva', color: 'verde' });
    const ida = await crearEmpleada({ nombre: 'Ida', color: 'gris' });
    await crearTurno({ empleadaId: ana.id, fecha: '2026-08-31', tramos: tramo(400, 720) });
    await crearTurno({ empleadaId: eva.id, fecha: '2026-09-01' });
    await crearTurno({ empleadaId: ida.id, fecha: '2026-09-02' });
    await api().delete(`/api/empleadas/${ida.id}`).expect(200);
    const propio = await crearTurno({ empleadaId: ana.id, fecha: LUNES, tramos: tramo(600, 660) });

    const res = await api().post(`/api/semanas/${LUNES}/copiar-anterior`).expect(201);
    assert.deepEqual(res.body.creados.map((t) => [t.empleadaId, t.fecha]), [[eva.id, MARTES]]);

    const { turnos } = await estado();
    assert.deepEqual(turnos.find((t) => t.fecha === LUNES).tramos, propio.tramos, 'no pisa lo existente');

    const otra = await api().post(`/api/semanas/${LUNES}/copiar-anterior`).expect(200);
    assert.deepEqual(otra.body.creados, []);
  });
});
