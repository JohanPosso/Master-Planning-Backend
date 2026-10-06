/**
 * E2E contra la API en marcha: un mes de trabajo completo + pruebas de estrés y casos límite
 * para encontrar fallos. Usa los años 2002–2003 (sin datos reales) y limpia todo al terminar.
 *   API_URL=http://localhost:3000/api npm run test:e2e
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { diaSemana, esDomingo, rangoFechas, sumarDias } from '../src/domain/fechas.js';

const API = (process.env.API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');
async function http(metodo, ruta, cuerpo, headers = {}) {
  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: cuerpo === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  let body;
  try { body = texto ? JSON.parse(texto) : undefined; } catch { body = texto; }
  return { status: res.status, body };
}
const ok = async (p, status) => {
  const r = await p;
  assert.equal(r.status, status, `esperaba ${status}, llegó ${r.status}: ${JSON.stringify(r.body)?.slice(0, 300)}`);
  return r.body;
};
const sinErrorDeServidor = (r) => assert.ok(r.status < 500, `error de servidor ${r.status}: ${JSON.stringify(r.body)}`);

const MES = { inicio: '2002-03-01', fin: '2002-03-31' };
const LUNES1 = sumarDias(MES.inicio, (7 - diaSemana(MES.inicio)) % 7); // primer lunes del mes
const T = (a, b) => [{ inicio: a, fin: b }];
const ids = { empleadas: [], plantillas: [], pagos: [] };
let original;

async function nuevaEmpleada(datos) {
  const id = randomUUID();
  await ok(http('PUT', `/empleadas/${id}`, { rol: 'Empleada', tarifaCent: 1000, ...datos }), 201);
  ids.empleadas.push(id);
  return id;
}

before(async () => { original = await ok(http('GET', '/estado'), 200); });

after(async () => {
  for (const id of ids.pagos) await http('DELETE', `/pagos/${id}`);
  const s = await ok(http('GET', '/estado'), 200);
  for (const p of s.pagos.filter((x) => x.inicio.startsWith('2002') || x.inicio.startsWith('2003'))) await http('DELETE', `/pagos/${p.id}`);
  const mias = new Set(ids.empleadas);
  await ok(http('POST', '/sync', {
    registros: { delete: s.registros.filter((r) => mias.has(r.empleadaId)).map((r) => r.id) },
    turnos: { delete: s.turnos.filter((t) => mias.has(t.empleadaId)).map((t) => t.id) },
    semanas: { delete: s.semanas.filter((x) => x.lunes.startsWith('2002')).map((x) => x.lunes) },
    plantillas: { delete: ids.plantillas },
    empleadas: { delete: ids.empleadas },
    reglas: original.reglas,
    ajustes: original.ajustes,
  }), 200);
  const fin = await ok(http('GET', '/estado'), 200);
  assert.equal(fin.empleadas.length, original.empleadas.length, 'limpieza completa');
});

describe('Flujo de negocio: un mes completo', () => {
  let ana, bea, jefa, apertura, tarde;

  it('alta del equipo y plantillas', async () => {
    ana = await nuevaEmpleada({ nombre: 'E2E Ana', color: 'azul', tarifaCent: 1000 });
    bea = await nuevaEmpleada({ nombre: 'E2E Bea', color: 'verde', tarifaCent: 1150, diasDescanso: [5, 6], descansoSeguido: true });
    jefa = await nuevaEmpleada({ nombre: 'E2E Jefa', color: 'rosa', rol: 'Jefa', excluirNomina: true });
    for (const [nombre, tramos] of [['E2E Apertura', T(400, 720)], ['E2E Tarde partida', [{ inicio: 570, fin: 660 }, { inicio: 1080, fin: 1200 }]]]) {
      const id = randomUUID();
      await ok(http('PUT', `/plantillas/${id}`, { nombre, tramos }), 201);
      ids.plantillas.push(id);
    }
    [apertura, tarde] = ids.plantillas;
  });

  it('planifica la semana 1 arrastrando plantillas y la publica', async () => {
    for (let d = 0; d < 7; d++) {
      const fecha = sumarDias(LUNES1, d);
      await ok(http('POST', '/turnos/desde-plantilla', { plantillaId: apertura, empleadaId: ana, fecha }), 201);
      if (d < 5) await ok(http('POST', '/turnos/desde-plantilla', { plantillaId: tarde, empleadaId: bea, fecha }), 201);
      if (d < 6) await ok(http('PUT', `/turnos/${randomUUID()}`, { empleadaId: jefa, fecha, tramos: T(540, 1260) }), 201);
    }
    await ok(http('PUT', `/semanas/${LUNES1}`, { publicada: true }), 200);
  });

  it('copia la semana a las 3 siguientes (solo huecos)', async () => {
    for (let w = 1; w <= 3; w++) {
      const r = await ok(http('POST', `/semanas/${sumarDias(LUNES1, 7 * w)}/copiar-anterior`), 201);
      assert.equal(r.creados.length, 7 + 5 + 6);
    }
  });

  it('mueve, duplica y corrige turnos como en el horario', async () => {
    const s = await ok(http('GET', `/turnos?desde=${LUNES1}&hasta=${sumarDias(LUNES1, 6)}`), 200);
    const deAna = s.find((t) => t.empleadaId === ana && t.fecha === LUNES1);
    // Bea no trabaja el sábado: le duplicamos el turno de Ana con Alt+arrastrar
    await ok(http('POST', `/turnos/${deAna.id}/mover`, { empleadaId: bea, fecha: sumarDias(LUNES1, 5), duplicar: true, nuevoId: randomUUID() }), 201);
    // DayTimeline: estirar el fin a las 12:30
    await ok(http('PUT', `/turnos/${deAna.id}`, { ...deAna, tramos: T(400, 750) }), 200);
  });

  it('registra horas reales con diferencias, confirma y la nómina cuadra a mano', async () => {
    const turnos = await ok(http('GET', `/turnos?desde=${MES.inicio}&hasta=${MES.fin}`), 200);
    const mios = turnos.filter((t) => [ana, bea, jefa].includes(t.empleadaId));
    // Ana se queda 25 min más los lunes (inventario)
    for (const t of mios.filter((x) => x.empleadaId === ana && diaSemana(x.fecha) === 0)) {
      await ok(http('PUT', `/registros/${ana}/${t.fecha}`, { tramos: [{ ...t.tramos[0], fin: t.tramos[0].fin + 25 }], nota: 'Inventario', estado: 'confirmado' }), 201);
    }
    for (const fecha of rangoFechas(MES.inicio, MES.fin)) {
      await ok(http('POST', '/registros/confirmar-dia', { fecha, empleadaIds: [ana, bea, jefa] }), 200);
    }
    await ok(http('PATCH', '/ajustes', { recargoDomingoPct: 10, recargoFestivoPct: 30, festivos: [...original.ajustes.festivos, '2002-03-19'] }), 200);

    const calc = await ok(http('GET', `/pagos/calculo?inicio=${MES.inicio}&fin=${MES.fin}`), 200);
    assert.deepEqual(calc.pendientes, []);
    // Cálculo independiente con los registros confirmados
    const regs = await ok(http('GET', `/registros?desde=${MES.inicio}&hasta=${MES.fin}`), 200);
    const esperado = (empleadaId, tarifa) => regs.filter((r) => r.empleadaId === empleadaId).reduce((acc, r) => {
      const min = r.tramos.reduce((a, x) => a + x.fin - x.inicio, 0);
      const pct = r.fecha === '2002-03-19' ? 30 : esDomingo(r.fecha) ? 10 : 0;
      return acc + (min / 60) * tarifa * (1 + pct / 100);
    }, 0);
    const linea = (id) => calc.lineas.find((l) => l.empleadaId === id);
    assert.equal(linea(ana).importeCent, Math.round(esperado(ana, 1000)));
    assert.equal(linea(bea).importeCent, Math.round(esperado(bea, 1150)));
    assert.equal(linea(jefa).importeCent, 0, 'la jefa no cobra nómina');
    assert.ok(linea(jefa).minutos > 0, 'pero sus horas se ven');
  });

  it('paga el mes, cambia la tarifa y lo pagado no cambia', async () => {
    const pago = await ok(http('POST', '/pagos', { ...MES, etiqueta: 'E2E Marzo 2002' }), 201);
    ids.pagos.push(pago.id);
    await ok(http('PUT', `/empleadas/${ana}`, { nombre: 'E2E Ana', rol: 'Empleada', color: 'azul', tarifaCent: 1500 }), 200);
    const despues = (await ok(http('GET', '/pagos'), 200)).find((p) => p.id === pago.id);
    assert.deepEqual(despues, pago);
  });

  it('elimina a Bea: conserva su histórico pagado y no admite borrado físico', async () => {
    await ok(http('DELETE', `/empleadas/${bea}`), 200);
    const r = await http('POST', '/sync', { empleadas: { delete: [bea] } });
    assert.equal(r.status, 409);
  });
});

describe('Concurrencia', () => {
  let emp;
  before(async () => { emp = await nuevaEmpleada({ nombre: 'E2E Concurrencia', color: 'gris' }); });

  it('10 PUT simultáneos al mismo hueco dejan 1 turno y ningún 500', async () => {
    const fecha = '2003-05-04';
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      http('PUT', `/turnos/${randomUUID()}`, { empleadaId: emp, fecha, tramos: T(500 + i, 700) })));
    rs.forEach(sinErrorDeServidor);
    const quedan = await ok(http('GET', `/turnos?desde=${fecha}&hasta=${fecha}`), 200);
    assert.equal(quedan.filter((t) => t.empleadaId === emp).length, 1);
  });

  it('5 registros simultáneos del mismo día: un solo registro y ningún 500', async () => {
    const fecha = '2003-05-05';
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      http('PUT', `/registros/${emp}/${fecha}`, { tramos: T(600, 700 + i), estado: 'previsto' })));
    rs.forEach(sinErrorDeServidor);
    const regs = await ok(http('GET', `/registros?desde=${fecha}&hasta=${fecha}`), 200);
    assert.equal(regs.filter((r) => r.empleadaId === emp).length, 1);
  });

  it('dos pagos simultáneos del mismo periodo: uno 201 y el otro 409', async () => {
    await ok(http('PUT', `/registros/${emp}/2003-05-06`, { tramos: T(600, 660), estado: 'confirmado' }), 201);
    const periodo = { inicio: '2003-05-06', fin: '2003-05-06', etiqueta: 'E2E carrera' };
    const rs = await Promise.all([http('POST', '/pagos', periodo), http('POST', '/pagos', periodo)]);
    rs.forEach(sinErrorDeServidor);
    rs.filter((r) => r.status === 201).forEach((r) => ids.pagos.push(r.body.id));
    assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]);
  });

  it('PATCH de reglas simultáneos sobre claves distintas no se pisan', async () => {
    await Promise.all([
      http('PATCH', '/reglas', { diaLibre: false }),
      http('PATCH', '/reglas', { franjaVacia: false }),
      http('PATCH', '/reglas', { maxHorasSemana: { activa: true, valor: 38 } }),
    ]);
    const r = await ok(http('GET', '/reglas'), 200);
    assert.deepEqual([r.diaLibre, r.franjaVacia, r.maxHorasSemana.valor], [false, false, 38]);
  });

  it('confirmar el mismo día dos veces a la vez no duplica registros', async () => {
    const fecha = '2003-05-07';
    await ok(http('PUT', `/turnos/${randomUUID()}`, { empleadaId: emp, fecha, tramos: T(600, 700) }), 201);
    const rs = await Promise.all([1, 2].map(() => http('POST', '/registros/confirmar-dia', { fecha, empleadaIds: [emp] })));
    rs.forEach(sinErrorDeServidor);
    const regs = await ok(http('GET', `/registros?desde=${fecha}&hasta=${fecha}`), 200);
    assert.equal(regs.filter((r) => r.empleadaId === emp).length, 1);
  });
});

describe('Entradas extremas', () => {
  let emp;
  before(async () => { emp = await nuevaEmpleada({ nombre: 'E2E Límites', color: 'ambar' }); });

  it('fechas imposibles o fuera de rango → 400, nunca 500', async () => {
    for (const fecha of ['0000-01-01', '2003-02-30', '2003-13-01', '20030101', '', '2003-1-1', '1899-12-31', '3000-01-01']) {
      const r = await http('PUT', `/turnos/${randomUUID()}`, { empleadaId: emp, fecha, tramos: T(1, 2) });
      assert.equal(r.status, 400, `fecha «${fecha}» → ${r.status}`);
    }
  });

  it('tipos incorrectos no se convierten en silencio', async () => {
    const r = await http('PUT', `/empleadas/${randomUUID()}`, { nombre: 'X', rol: 'Empleada', color: 'azul', tarifaCent: '1000' });
    assert.equal(r.status, 400);
    const t = await http('PUT', `/turnos/${randomUUID()}`, { empleadaId: emp, fecha: '2003-06-01', tramos: [{ inicio: '400', fin: 720 }] });
    assert.equal(t.status, 400);
  });

  it('textos con comillas, SQL y emojis se guardan tal cual', async () => {
    const nombre = `O'Brien "x"; DROP TABLE empleadas;-- 👩‍🍳`;
    const id = randomUUID();
    const e = await ok(http('PUT', `/empleadas/${id}`, { nombre, rol: 'Empleada', color: 'rojo', tarifaCent: 0 }), 201);
    ids.empleadas.push(id);
    assert.equal(e.nombre, nombre);
  });

  it('campos desconocidos se ignoran y no se filtran', async () => {
    const e = await ok(http('PUT', `/empleadas/${emp}`, { nombre: 'E2E Límites', rol: 'Empleada', color: 'ambar', tarifaCent: 1, hackeo: true, createdAt: '1999-01-01' }), 200);
    assert.equal('hackeo' in e, false);
    assert.equal('createdAt' in e, false);
  });

  it('tramo hasta las 24:00 sí, más allá o vacío no', async () => {
    await ok(http('PUT', `/turnos/${randomUUID()}`, { empleadaId: emp, fecha: '2003-06-02', tramos: T(1200, 1440) }), 201);
    assert.equal((await http('PUT', `/turnos/${randomUUID()}`, { empleadaId: emp, fecha: '2003-06-03', tramos: T(1200, 1441) })).status, 400);
    assert.equal((await http('PUT', `/turnos/${randomUUID()}`, { empleadaId: emp, fecha: '2003-06-03', tramos: T(600, 600) })).status, 400);
  });

  it('parámetros de consulta duplicados → 400, no 500', async () => {
    assert.equal((await http('GET', '/turnos?desde=2098-01-01&desde=2098-02-01')).status, 400);
    assert.equal((await http('GET', '/pagos/calculo')).status, 400);
  });

  it('cuerpo enorme → 413 · cuerpo no JSON → 400 · reglas como array → 400', async () => {
    const enorme = JSON.stringify({ nombre: 'x'.repeat(3 * 1024 * 1024) });
    assert.equal((await http('PUT', `/empleadas/${randomUUID()}`, enorme)).status, 413);
    assert.equal((await http('PUT', `/empleadas/${randomUUID()}`, 'hola', { 'Content-Type': 'text/plain' })).status, 400);
    assert.equal((await http('PATCH', '/reglas', [])).status, 400);
  });

  it('mover duplicando con un id que ya existe → 409, no 500', async () => {
    const a = randomUUID();
    const b = randomUUID();
    await ok(http('PUT', `/turnos/${a}`, { empleadaId: emp, fecha: '2003-06-08', tramos: T(600, 700) }), 201);
    await ok(http('PUT', `/turnos/${b}`, { empleadaId: emp, fecha: '2003-06-09', tramos: T(600, 700) }), 201);
    assert.equal((await http('POST', `/turnos/${a}/mover`, { empleadaId: emp, fecha: '2003-06-10', duplicar: true, nuevoId: b })).status, 409);
  });
});

describe('Reglas de negocio de la nómina', () => {
  it('no se puede pagar un periodo sin horas (se congelaría un 0 € que bloquea el mes real)', async () => {
    const r = await http('POST', '/pagos', { inicio: '2003-08-01', fin: '2003-08-31', etiqueta: 'E2E vacío' });
    if (r.status === 201) ids.pagos.push(r.body.id);
    assert.equal(r.status, 409, `se aceptó un pago vacío: ${JSON.stringify(r.body)?.slice(0, 120)}`);
  });

  it('no se puede pagar un periodo que aún no ha empezado', async () => {
    const r = await http('POST', '/pagos', { inicio: '2099-12-01', fin: '2099-12-31', etiqueta: 'E2E futuro' });
    if (r.status === 201) ids.pagos.push(r.body.id);
    assert.equal(r.status, 409);
  });
});
