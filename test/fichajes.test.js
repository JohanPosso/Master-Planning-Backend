import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { cerrarFichajesOlvidados } from '../src/services/fichajes.service.js';
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

  it('un fichaje nunca se borra; corregirlo exige ser encargado y dar un motivo', async () => {
    const yo = await empleadaConPortal();
    a('08:00');
    const { fichaje } = (await yo.fichar('entrada').expect(201)).body;
    await api().delete(`/api/fichajes/${fichaje.id}`).expect(404);
    await api().put(`/api/fichajes/${fichaje.id}`).send({ tipo: 'entrada', minuto: 470 }).expect(400);
    await apiRaw().put(`/api/fichajes/${fichaje.id}`).set('Authorization', `Bearer ${yo.token}`).send({ tipo: 'entrada', minuto: 470, motivo: 'yo misma' }).expect(403);
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
    // Por defecto, sin ubicación ni Wi-Fi deja fichar «sin verificar»; con la política «bloquear», no.
    await api().put('/api/fichaje/config').send({ geocerca: { activa: true, ...CAFETERIA, radioM: 150 }, sinVerificar: 'bloquear' }).expect(200);
    assert.equal((await yo.fichar('entrada').expect(400)).body.error.code, 'UBICACION_REQUERIDA');
    const lejos = await yo.fichar('entrada', { ubicacion: { latitud: 40.4155, longitud: -3.7074, precisionM: 10 } }).expect(403);
    assert.equal(lejos.body.error.code, 'FUERA_DE_ZONA');
    assert.ok(lejos.body.error.details.distanciaM > 300);
    const ok = await yo.fichar('entrada', { ubicacion: { latitud: 40.4169, longitud: -3.7039, precisionM: 12 } }).expect(201);
    assert.ok(ok.body.fichaje.distanciaM < 20);
    assert.equal('latitud' in ok.body.fichaje, false, 'las coordenadas no salen de la BD');
    assert.deepEqual((await yo.resumen().expect(200)).body.geocerca, { activa: true, radioM: 150 });
    assert.equal(ok.body.fichaje.verificacion, 'gps');
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

describe('Wi-Fi de la cafetería y fichajes sin verificar', () => {
  const CAFETERIA = { latitud: 40.4168, longitud: -3.7038 };
  const config = (extra) => api().put('/api/fichaje/config').send({ geocerca: { activa: true, ...CAFETERIA, radioM: 150 }, ...extra });

  it('en el Wi-Fi de la cafetería ficha sin ubicación y el portal lo sabe', async () => {
    // Los tests llegan desde 127.0.0.1: esa es «la red de la cafetería».
    await config({ red: { activa: true, ips: ['127.0.0.1'] } }).expect(200);
    const yo = await empleadaConPortal();
    a('08:00');
    assert.equal((await yo.resumen().expect(200)).body.enRedCafeteria, true);
    const r = await yo.fichar('entrada').expect(201);
    assert.equal(r.body.fichaje.verificacion, 'red');
  });

  it('en el Wi-Fi vale aunque el GPS diga que está lejos (dentro de un local el GPS falla)', async () => {
    await config({ red: { activa: true, ips: ['127.0.0.1'] } }).expect(200);
    const yo = await empleadaConPortal();
    a('08:00');
    const r = await yo.fichar('entrada', { ubicacion: { latitud: 40.4155, longitud: -3.7074, precisionM: 10 } }).expect(201);
    assert.equal(r.body.fichaje.verificacion, 'red');
  });

  it('sin GPS ni Wi-Fi deja fichar «sin verificar» y lo anota en el registro', async () => {
    await config({ red: { activa: true, ips: ['83.45.10.2'] } }).expect(200);
    const yo = await empleadaConPortal();
    a('08:00');
    assert.equal((await yo.fichar('entrada').expect(201)).body.fichaje.verificacion, 'sin_verificar');
    a('12:00');
    const s = await yo.fichar('salida').expect(201);
    assert.match(s.body.registro.nota, /sin verificar/);
  });

  it('valida la configuración y devuelve la IP actual del encargado', async () => {
    await api().put('/api/fichaje/config').send({ geocerca: { activa: false, latitud: null, longitud: null, radioM: 150 }, red: { activa: true, ips: [] } }).expect(400);
    await api().put('/api/fichaje/config').send({ geocerca: { activa: false, latitud: null, longitud: null, radioM: 150 }, red: { activa: false, ips: ['no-es-ip'] } }).expect(400);
    await api().put('/api/fichaje/config').send({ geocerca: { activa: false, latitud: null, longitud: null, radioM: 150 }, cierreAutomaticoHoras: 3 }).expect(400);
    assert.equal((await api().get('/api/fichaje/mi-ip').expect(200)).body.ip, '127.0.0.1');
  });
});

describe('Cierre automático', () => {
  it('cierra a las 10 h al fin del turno, deja el día por revisar y no duplica', async () => {
    const yo = await empleadaConPortal();
    await api().put(`/api/turnos/${uuid()}`).send({ empleadaId: yo.e.id, fecha: HOY, tramos: tramo(480, 720) }).expect(201);
    a('08:00'); await yo.fichar('entrada').expect(201);
    a('17:59'); assert.equal(await cerrarFichajesOlvidados(), 0, 'aún no han pasado 10 h');
    a('18:00'); assert.equal(await cerrarFichajesOlvidados(), 1);
    assert.equal(await cerrarFichajesOlvidados(), 0, 'no vuelve a cerrarlo');

    const fichajes = (await api().get('/api/fichajes').expect(200)).body;
    const salida = fichajes.find((f) => f.tipo === 'salida');
    assert.deepEqual([salida.minuto, salida.origen], [720, 'automatico']);
    const [reg] = (await api().get('/api/registros').expect(200)).body;
    assert.deepEqual([reg.tramos, reg.estado], [tramo(480, 720), 'previsto']);
    assert.match(reg.nota, /Salida automática/);
    a('19:00');
    assert.equal((await yo.resumen().expect(200)).body.toca, 'entrada');
  });

  it('sin turno cierra a entrada + 10 h; una entrada olvidada de ayer se cierra al día siguiente', async () => {
    const yo = await empleadaConPortal();
    a('15:00', '2026-03-09'); await yo.fichar('entrada').expect(201);
    a('09:00'); assert.equal(await cerrarFichajesOlvidados(), 1);
    const salida = (await api().get('/api/fichajes').expect(200)).body.find((f) => f.tipo === 'salida');
    assert.deepEqual([salida.fecha, salida.minuto], ['2026-03-09', 1439], 'como máximo 23:59 del mismo día');
  });

  it('respeta las horas configuradas', async () => {
    await api().put('/api/fichaje/config').send({ geocerca: { activa: false, latitud: null, longitud: null, radioM: 150 }, cierreAutomaticoHoras: 6 }).expect(200);
    const yo = await empleadaConPortal();
    a('08:00'); await yo.fichar('entrada').expect(201);
    a('14:00'); assert.equal(await cerrarFichajesOlvidados(), 1);
    assert.equal((await api().get('/api/fichajes').expect(200)).body.find((f) => f.tipo === 'salida').minuto, 840);
  });
});

describe('Correcciones del encargado', () => {
  it('añade la salida olvidada y genera las horas', async () => {
    const yo = await empleadaConPortal();
    a('09:03'); await yo.fichar('entrada').expect(201);
    const r = await api().post('/api/fichajes').send({ empleadaId: yo.e.id, fecha: HOY, tipo: 'salida', minuto: 1020, motivo: 'Olvidó fichar al salir' }).expect(201);
    assert.deepEqual(r.body.registro.tramos, tramo(543, 1020));
    assert.equal(r.body.fichajes.at(-1).origen, 'encargado');
    assert.equal(r.body.fichajes.at(-1).motivo, 'Olvidó fichar al salir');
  });

  it('una entrada añadida a posteriori se coloca en su hora (no al final)', async () => {
    const yo = await empleadaConPortal();
    a('12:00'); await api().post('/api/fichajes').send({ empleadaId: yo.e.id, fecha: HOY, tipo: 'salida', minuto: 720, motivo: 'Salida anotada en papel' }).expect(201);
    const r = await api().post('/api/fichajes').send({ empleadaId: yo.e.id, fecha: HOY, tipo: 'entrada', minuto: 480, motivo: 'No pudo fichar: sin batería' }).expect(201);
    assert.deepEqual(r.body.registro.tramos, tramo(480, 720));
  });

  it('corregir anula el original con su motivo, lo enlaza y recalcula las horas', async () => {
    const yo = await empleadaConPortal();
    a('08:30'); const { fichaje: entrada } = (await yo.fichar('entrada').expect(201)).body;
    a('12:00'); await yo.fichar('salida').expect(201);
    const r = await api().put(`/api/fichajes/${entrada.id}`).send({ tipo: 'entrada', minuto: 480, motivo: 'Llegó a las 8, el móvil no tenía cobertura' }).expect(200);
    const original = r.body.fichajes.find((f) => f.id === entrada.id);
    const nueva = r.body.fichajes.find((f) => f.sustituyeA === entrada.id);
    assert.ok(original.anulado);
    assert.equal(original.motivo, 'Llegó a las 8, el móvil no tenía cobertura');
    assert.deepEqual([nueva.minuto, nueva.origen], [480, 'encargado']);
    assert.deepEqual(r.body.registro.tramos, tramo(480, 720));
    await api().put(`/api/fichajes/${entrada.id}`).send({ tipo: 'entrada', minuto: 470, motivo: 'otra vez' }).expect(409);

    const historial = (await yo.resumen().expect(200)).body.historial[0];
    assert.equal(historial.corregido, true, 'la empleada ve que se corrigió');
    assert.equal(historial.fichajes.some((f) => f.id === entrada.id), false, 'y solo los vigentes');
  });

  it('anular deja el día sin horas fichadas (el registro de fichaje desaparece) pero conserva el historial', async () => {
    const yo = await empleadaConPortal();
    a('08:00'); await yo.fichar('entrada').expect(201);
    a('08:01'); const { fichaje: salida } = (await yo.fichar('salida').expect(201)).body;
    const r = await api().post(`/api/fichajes/${salida.id}/anular`).send({ motivo: 'Fichaje de prueba' }).expect(200);
    assert.equal(r.body.registro, null);
    assert.equal((await api().get('/api/fichajes').expect(200)).body.length, 2, 'nada se borra');
    await api().post(`/api/fichajes/${salida.id}/anular`).send({ motivo: 'x' }).expect(400);
  });

  it('no toca un registro ya confirmado', async () => {
    const yo = await empleadaConPortal();
    a('08:00'); await yo.fichar('entrada').expect(201);
    a('12:00'); const { fichaje } = (await yo.fichar('salida').expect(201)).body;
    await api().post('/api/registros/confirmar-dia').send({ fecha: HOY, empleadaIds: [yo.e.id] }).expect(200);
    const r = await api().put(`/api/fichajes/${fichaje.id}`).send({ tipo: 'salida', minuto: 780, motivo: 'Se quedó a cerrar' }).expect(200);
    assert.deepEqual([r.body.registro.tramos, r.body.registro.estado], [tramo(480, 720), 'confirmado']);
  });
});

describe('Diagnóstico de red', () => {
  const CAFETERIA = { latitud: 40.4168, longitud: -3.7038 };

  it('si no reconoce el Wi-Fi, el rechazo y el resumen dicen qué red ve el servidor', async () => {
    await api().put('/api/fichaje/config').send({ geocerca: { activa: true, ...CAFETERIA, radioM: 150 }, red: { activa: true, ips: ['185.250.76.217'] } }).expect(200);
    const yo = await empleadaConPortal();
    a('08:00');
    const r = (await yo.resumen().expect(200)).body;
    assert.deepEqual([r.enRedCafeteria, r.redDetectada], [false, '127.0.0.1']);
    const lejos = await yo.fichar('entrada', { ubicacion: { latitud: 40.4155, longitud: -3.7074, precisionM: 10 } }).expect(403);
    assert.match(lejos.body.error.message, /llega desde 127\.0\.0\.1/);
    assert.equal(lejos.body.error.details.redDetectada, '127.0.0.1');
  });

  it('sin Wi-Fi activo no expone la red', async () => {
    const yo = await empleadaConPortal();
    a('08:00');
    assert.equal((await yo.resumen().expect(200)).body.redDetectada, null);
  });

  it('mi-ip devuelve también la red', async () => {
    assert.deepEqual((await api().get('/api/fichaje/mi-ip').expect(200)).body, { ip: '127.0.0.1', red: '127.0.0.1' });
  });
});
