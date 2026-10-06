import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { api, apiRaw, cerrarBD, crearEmpleada, crearTurno, limpiarBD, loginComo, prepararBD, tramo, uuid } from './helpers.js';

describe('auth y portal', () => {
  before(prepararBD);
  beforeEach(limpiarBD);
  after(cerrarBD);

  test('login admin y protege /estado', async () => {
    const sin = await apiRaw().get('/api/estado');
    assert.equal(sin.status, 401);

    const ok = await api().get('/api/estado');
    assert.equal(ok.status, 200);
    assert.ok(Array.isArray(ok.body.empleadas));
  });

  test('login empleada case-insensitive y portal', async () => {
    const id = uuid();
    const creada = await crearEmpleada({
      id,
      nombre: 'Lucía',
      color: 'verde',
      usuario: 'Lucia.Test',
      password: '1234',
    });
    assert.equal(creada.usuario, 'lucia.test');
    assert.equal(creada.tieneAccesoPortal, true);

    const sesion = await loginComo('LUCIA.TEST', '1234');
    assert.equal(sesion.rol, 'empleada');
    assert.equal(sesion.perfil.nombre, 'Lucía');

    const adminEstado = await apiRaw().get('/api/estado').set('Authorization', `Bearer ${sesion.token}`);
    assert.equal(adminEstado.status, 403);

    const portal = await apiRaw().get('/api/portal/estado').set('Authorization', `Bearer ${sesion.token}`);
    assert.equal(portal.status, 200);
    assert.equal(portal.body.empleada.id, id);
    assert.ok(Array.isArray(portal.body.empleadas));
    assert.equal(portal.body.empleada.tarifaCent, undefined);

    const adminPortal = await api().get('/api/portal/estado');
    assert.equal(adminPortal.status, 403);
  });

  test('asignar PIN después de crear y poder entrar', async () => {
    const id = uuid();
    await crearEmpleada({ id, nombre: 'Ana', color: 'azul' });
    const upd = await api()
      .put(`/api/empleadas/${id}`)
      .send({
        nombre: 'Ana',
        rol: 'Empleada',
        color: 'azul',
        tarifaCent: 1000,
        diasDescanso: [],
        descansoSeguido: false,
        excluirNomina: false,
        activa: true,
        usuario: 'AnaPin',
        password: 'abcd',
        tieneAccesoPortal: false,
      });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.usuario, 'anapin');
    assert.equal(upd.body.tieneAccesoPortal, true);

    const sesion = await loginComo('anapin', 'abcd');
    assert.equal(sesion.rol, 'empleada');
  });

  test('portal nomina solo propia y según rango', async () => {
    const id = uuid();
    await crearEmpleada({ id, nombre: 'Paga', color: 'turq', tarifaCent: 1000, usuario: 'paga', password: '1234' });
    const otra = uuid();
    await crearEmpleada({ id: otra, nombre: 'Otra', color: 'naranja', tarifaCent: 2000 });

    // Lunes 2026-10-12 es festivo en seed de reglas? usamos día laboral 2026-10-13 (martes)
    await crearTurno({ empleadaId: id, fecha: '2026-10-13', tramos: tramo(540, 660) }); // 2h
    await crearTurno({ empleadaId: otra, fecha: '2026-10-13', tramos: tramo(540, 900) }); // 6h otra

    await api().put('/api/semanas/2026-10-12').send({ publicada: true });

    const sesion = await loginComo('paga', '1234');
    const nomina = await apiRaw()
      .get('/api/portal/nomina?inicio=2026-10-13&fin=2026-10-13')
      .set('Authorization', `Bearer ${sesion.token}`);
    assert.equal(nomina.status, 200);
    assert.equal(nomina.body.estimacion.minutos, 120);
    assert.equal(nomina.body.estimacion.importeCent, 2000); // 2h * 10€
    // no debe incluir horas de la otra
    assert.ok(nomina.body.estimacion.importeCent < 10000);

    const semana = await apiRaw()
      .get('/api/portal/nomina?inicio=2026-10-12&fin=2026-10-18')
      .set('Authorization', `Bearer ${sesion.token}`);
    assert.equal(semana.status, 200);
    assert.equal(semana.body.estimacion.minutos, 120);
  });

  test('sync no borra el PIN', async () => {
    const id = uuid();
    await crearEmpleada({ id, nombre: 'Sync', color: 'indigo', usuario: 'syncuser', password: '9999' });
    await api()
      .post('/api/sync')
      .send({
        empleadas: {
          upsert: [
            {
              id,
              nombre: 'Sync',
              rol: 'Empleada',
              color: 'indigo',
              tarifaCent: 1000,
              diasDescanso: [],
              descansoSeguido: false,
              excluirNomina: false,
              activa: true,
              usuario: 'syncuser',
              tieneAccesoPortal: true,
            },
          ],
          delete: [],
        },
      })
      .expect(200);

    const sesion = await loginComo('syncuser', '9999');
    assert.equal(sesion.rol, 'empleada');
  });

  test('empleada puede actualizar nombre y clave', async () => {
    const id = uuid();
    await crearEmpleada({ id, nombre: 'Clara', color: 'azul', usuario: 'clara', password: '1234' });
    const sesion = await loginComo('clara', '1234');
    const auth = { Authorization: `Bearer ${sesion.token}` };

    const ok = await apiRaw()
      .patch('/api/portal/perfil')
      .set(auth)
      .send({ nombre: 'Clara Nueva', usuario: 'ClaraNueva', passwordActual: '1234', passwordNueva: '5678' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.nombre, 'Clara Nueva');
    assert.equal(ok.body.usuario, 'claranueva');

    const mal = await apiRaw()
      .patch('/api/portal/perfil')
      .set(auth)
      .send({ passwordActual: 'mal', passwordNueva: '9999' });
    assert.equal(mal.status, 401);

    const loginNuevo = await loginComo('claranueva', '5678');
    assert.equal(loginNuevo.rol, 'empleada');
  });

  test('login incorrecto', async () => {
    const res = await apiRaw().post('/api/auth/login').send({ usuario: 'admin', password: 'mal' });
    assert.equal(res.status, 401);
  });

  test('health sigue público', async () => {
    const res = await apiRaw().get('/api/health');
    assert.equal(res.status, 200);
  });
});
