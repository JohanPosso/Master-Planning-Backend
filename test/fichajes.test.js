import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { reloj } from '../src/utils/reloj.js';
import { api, apiRaw, cerrarBD, crearEmpleada, limpiarBD, loginComo, prepararBD, tramo, uuid } from './helpers.js';

before(prepararBD);
beforeEach(limpiarBD);
afterEach(() => { reloj.ahora = () => new Date(); });
after(cerrarBD);

const HOY = '2026-03-10'; // martes, horario de invierno (UTC+1)
/** Fija el reloj del servidor a una hora de Madrid de HOY. */
const a = (hhmm, fecha = HOY) => { reloj.ahora = () => new Date(`${fecha}T${hhmm}:00+01:00`); };

async function empleadaConPortal(datos = {}) {
  const usuario = `fich${Math.random().toString(36).slice(2, 8)}`;
  const e = await crearEmpleada({ nombre: 'Lucía', color: 'turq', usuario, password: 'clave-test', ...datos });
  const { token } = await loginComo(usuario, 'clave-test');
  const como = (req) => req.set('Authorization', `Bearer ${token}`);
  return {
    e,
    fichar: (tipo, extra = {}) => como(apiRaw().post('/api/portal/fichajes')).send({ tipo, ...extra }),
    resumen: () => como(apiRaw().get('/api/portal/fichaje')),
    token,
  };
}

describe('Fichaje desde el portal', () => {
  it('entrada y salida con la hora del servidor generan el registro «por confirmar»', async () => {
    const yo = await empleadaConPortal();
    await api().put(`/api/turnos/${uuid()}`).send({ empleadaId: yo.e.id, fecha: HOY, tramos: tramo(480, 720) }).expect(201);

    a('08:02');
    const entrada = await yo.fichar('entrada').expect(201);
    assert.deepEqual([entrada.body.fichaje.tipo, entrada.body.fichaje.minuto, entrada.body.fichaje.fecha], ['entrada', 482, HOY]);
    assert.equal(entrada.body.registro, null, 'con la entrada aún no hay horas');

    a('10:30');
    const r = (await yo.resumen().expect(200)).body;
    assert.equal(r.toca, 'salida');
    assert.equal(r.dentroDesde, 482);
    assert.deepEqual(r.turnoHoy.tramos, tramo(480, 720));
    assert.equal(r.semana.minutosPlanificados, 240);

    a('12:05');
    const salida = await yo.fichar('salida').expect(201);
    assert.deepEqual(salida.body.registro, { id: salida.body.registro.id, empleadaId: yo.e.id, fecha: HOY, tramos: tramo(482, 725), estado: 'previsto', origen: 'fichaje' });

    const despues = (await yo.resumen().expect(200)).body;
    assert.equal(despues.toca, 'entrada');
    assert.equal(despues.minutosHoy, 243);
    assert.equal(despues.semana.minutosFichados, 243);
    assert.equal(despues.historial[0].fichajes.length, 2);
  });

  it('un turno partido fichado da un registro de dos tramos', async () => {
    const yo = await empleadaConPortal();
    for (const [h, t] of [['09:00', 'entrada'], ['12:00', 'salida'], ['18:00', 'entrada'], ['20:00', 'salida']]) {
      a(h);
      await yo.fichar(t).expect(201);
    }
    const regs = (await api().get('/api/registros').expect(200)).body;
    assert.deepEqual(regs[0].tramos, [{ inicio: 540, fin: 720 }, { inicio: 1080, fin: 1200 }]);
  });

  it('el doble toque no ficha dos veces: 409 y dice qué toca', async () => {
    const yo = await empleadaConPortal();
    a('08:00');
    await yo.fichar('entrada').expect(201);
    const doble = await yo.fichar('entrada').expect(409);
    assert.match(doble.body.error.message, /Ya fichaste la entrada a las 08:00/);
    assert.equal(doble.body.error.details.toca, 'salida');
  });

  it('salida sin entrada → 409', async () => {
    const yo = await empleadaConPortal();
    a('08:00');
    const r = await yo.fichar('salida').expect(409);
    assert.match(r.body.error.message, /entrada/);
  });

  it('10 entradas simultáneas dejan un solo fichaje', async () => {
    const yo = await empleadaConPortal();
    a('08:00');
    const rs = await Promise.all(Array.from({ length: 10 }, () => yo.fichar('entrada')));
    assert.deepEqual(rs.map((r) => r.status).sort(), [201, ...Array(9).fill(409)]);
    assert.equal((await api().get('/api/fichajes').expect(200)).body.length, 1);
  });

  it('cada día empieza de cero: una entrada olvidada ayer no bloquea hoy y queda como incompleta', async () => {
    const yo = await empleadaConPortal();
    a('08:00', '2026-03-09');
    await yo.fichar('entrada').expect(201);
    a('08:00');
    await yo.fichar('entrada').expect(201);
    const r = (await yo.resumen().expect(200)).body;
    assert.equal(r.historial.find((d) => d.fecha === '2026-03-09').incompleto, true);
  });

  it('no pisa un registro que el encargado ya confirmó o escribió a mano', async () => {
    const yo = await empleadaConPortal();
    await api().put(`/api/registros/${yo.e.id}/${HOY}`).send({ tramos: tramo(480, 600), estado: 'confirmado' }).expect(201);
    a('08:00'); await yo.fichar('entrada').expect(201);
    a('13:00');
    const s = await yo.fichar('salida').expect(201);
    assert.equal(s.body.registro, null);
    const reg = (await api().get('/api/registros').expect(200)).body[0];
    assert.deepEqual(reg.tramos, tramo(480, 600));
  });

  it('si el encargado corrige las horas fichadas, pasan a manuales y el fichaje ya no las cambia', async () => {
    const yo = await empleadaConPortal();
    a('08:00'); await yo.fichar('entrada').expect(201);
    a('12:00'); await yo.fichar('salida').expect(201);
    const corregido = await api().put(`/api/registros/${yo.e.id}/${HOY}`).send({ tramos: tramo(480, 690), estado: 'previsto' }).expect(200);
    assert.equal(corregido.body.origen, undefined, 'origen manual');
    a('18:00'); await yo.fichar('entrada').expect(201);
    a('19:00'); await yo.fichar('salida').expect(201);
    assert.deepEqual((await api().get('/api/registros').expect(200)).body[0].tramos, tramo(480, 690));
  });

  it('confirmar el día mantiene el origen «fichaje»', async () => {
    const yo = await empleadaConPortal();
    a('08:00'); await yo.fichar('entrada').expect(201);
    a('12:00'); await yo.fichar('salida').expect(201);
    const [r] = (await api().post('/api/registros/confirmar-dia').send({ fecha: HOY, empleadaIds: [yo.e.id] }).expect(200)).body;
    assert.deepEqual([r.estado, r.origen], ['confirmado', 'fichaje']);
  });

  it('una empleada inactiva no puede fichar', async () => {
    const yo = await empleadaConPortal();
    await api().put(`/api/empleadas/${yo.e.id}`).send({ ...yo.e, activa: false }).expect(200);
    a('08:00');
    const r = await yo.fichar('entrada');
    assert.ok([401, 403].includes(r.status), String(r.status));
  });

  it('valida el cuerpo: tipo obligatorio y coordenadas en rango', async () => {
    const yo = await empleadaConPortal();
    await yo.fichar(undefined).expect(400);
    await yo.fichar('entrada', { ubicacion: { latitud: 200, longitud: 0 } }).expect(400);
  });
});

describe('Permisos', () => {
  it('el portal exige sesión de empleada y la vista de fichajes, de encargado', async () => {
    await apiRaw().post('/api/portal/fichajes').send({ tipo: 'entrada' }).expect(401);
    await api().post('/api/portal/fichajes').send({ tipo: 'entrada' }).expect(403);
    const yo = await empleadaConPortal();
    await apiRaw().get('/api/fichajes').set('Authorization', `Bearer ${yo.token}`).expect(403);
    await apiRaw().get('/api/fichaje/config').set('Authorization', `Bearer ${yo.token}`).expect(403);
  });

  it('no hay forma de editar ni borrar un fichaje', async () => {
    const yo = await empleadaConPortal();
    a('08:00');
    const { fichaje } = (await yo.fichar('entrada').expect(201)).body;
    await api().delete(`/api/fichajes/${fichaje.id}`).expect(404);
    await api().put(`/api/fichajes/${fichaje.id}`).send({ minuto: 1 }).expect(404);
  });
});

describe('Geocerca', () => {
  const CAFETERIA = { latitud: 40.4168, longitud: -3.7038 };

  it('no se puede activar sin fijar la ubicación', async () => {
    await api().put('/api/fichaje/config').send({ geocerca: { activa: true, latitud: null, longitud: null, radioM: 150 } }).expect(400);
  });

  it('activa: exige ubicación, rechaza fuera de radio y guarda la distancia', async () => {
    await api().put('/api/fichaje/config').send({ geocerca: { activa: true, ...CAFETERIA, radioM: 150 } }).expect(200);
    const yo = await empleadaConPortal();
    a('08:00');
    assert.equal((await yo.fichar('entrada').expect(400)).body.error.code, 'UBICACION_REQUERIDA');
    const lejos = await yo.fichar('entrada', { ubicacion: { latitud: 40.4155, longitud: -3.7074, precisionM: 10 } }).expect(403);
    assert.equal(lejos.body.error.code, 'FUERA_DE_ZONA');
    assert.ok(lejos.body.error.details.distanciaM > 300);
    const ok = await yo.fichar('entrada', { ubicacion: { latitud: 40.4169, longitud: -3.7039, precisionM: 12 } }).expect(201);
    assert.ok(ok.body.fichaje.distanciaM < 20);
    assert.equal('latitud' in ok.body.fichaje, false, 'las coordenadas no salen de la BD');
    assert.deepEqual((await yo.resumen().expect(200)).body.geocerca, { activa: true, radioM: 150 });
  });
});

describe('Vista del encargado', () => {
  it('estado inicial incluye fichajes recientes y la configuración; novedades trae registros nuevos', async () => {
    const yo = await empleadaConPortal();
    a('08:00'); await yo.fichar('entrada').expect(201);
    a('09:00'); await yo.fichar('salida').expect(201);
    reloj.ahora = () => new Date();
    const estado = (await api().get('/api/estado').expect(200)).body;
    assert.ok(Array.isArray(estado.fichajes));
    assert.deepEqual(estado.fichaje.geocerca.activa, false);
    const nov = (await api().get('/api/fichajes/novedades').query({ desde: HOY }).expect(200)).body;
    assert.equal(nov.fichajes.length, 2);
    assert.equal(nov.registros[0].origen, 'fichaje');
  });
});
