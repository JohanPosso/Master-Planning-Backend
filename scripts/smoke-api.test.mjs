/**
 * Prueba de humo de TODOS los endpoints contra una API en marcha (no en proceso).
 *   API_URL=http://localhost:3000/api npm run test:smoke
 * Trabaja en el año 2001 para no tocar datos reales y deja la BD como estaba (borra lo que crea
 * y restaura reglas y ajustes).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { diaSemana, sumarDias } from '../src/domain/fechas.js';

const API = (process.env.API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');

async function http(metodo, ruta, cuerpo, { raw } = {}) {
  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : raw ? cuerpo : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  return { status: res.status, headers: res.headers, body: texto ? JSON.parse(texto) : undefined };
}
const esperar = async (promesa, status) => {
  const res = await promesa;
  assert.equal(res.status, status, `esperaba ${status} y llegó ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

const LUNES = sumarDias('2001-01-10', -diaSemana('2001-01-10')); // un lunes de 2001 (sin datos reales)
const dia = (n) => sumarDias(LUNES, n);
const T = (inicio, fin) => [{ inicio, fin }];
const creados = { empleadas: [], plantillas: [], turnos: [], registros: [], pagos: [], semanas: [] };
let reglasOriginales;
let ajustesOriginales;

const ana = { id: randomUUID(), nombre: 'Smoke Ana', rol: 'Empleada', color: 'azul', tarifaCent: 1000 };
const eva = { id: randomUUID(), nombre: 'Smoke Eva', rol: 'Empleada', color: 'verde', tarifaCent: 1200, diasDescanso: [6] };

before(async () => {
  await esperar(http('GET', '/health'), 200);
  reglasOriginales = await esperar(http('GET', '/reglas'), 200);
  ajustesOriginales = await esperar(http('GET', '/ajustes'), 200);
});

after(async () => {
  for (const id of creados.pagos) await http('DELETE', `/pagos/${id}`);
  const s = await esperar(http('GET', '/estado'), 200);
  const mias = new Set(creados.empleadas);
  await esperar(
    http('POST', '/sync', {
      registros: { delete: s.registros.filter((r) => mias.has(r.empleadaId)).map((r) => r.id) },
      turnos: { delete: s.turnos.filter((t) => mias.has(t.empleadaId)).map((t) => t.id) },
      semanas: { delete: creados.semanas },
      plantillas: { delete: creados.plantillas },
      empleadas: { delete: creados.empleadas },
      reglas: reglasOriginales,
      ajustes: ajustesOriginales,
    }),
    200,
  );
  const fin = await esperar(http('GET', '/estado'), 200);
  assert.ok(!fin.empleadas.some((e) => mias.has(e.id)), 'la limpieza deja la BD como estaba');
  assert.deepEqual(fin.reglas, reglasOriginales);
  assert.deepEqual(fin.ajustes, ajustesOriginales);
});

describe('Sistema', () => {
  it('GET /health → 200 ok', async () => assert.deepEqual(await esperar(http('GET', '/health'), 200), { status: 'ok' }));

  it('GET /estado → State completo', async () => {
    const s = await esperar(http('GET', '/estado'), 200);
    for (const k of ['empleadas', 'plantillas', 'turnos', 'registros', 'pagos', 'semanas']) assert.ok(Array.isArray(s[k]), k);
    assert.equal(s.version, 1);
  });

  it('cabeceras de seguridad (helmet) y sin x-powered-by', async () => {
    const res = await http('GET', '/health');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('ruta desconocida → 404 JSON · JSON roto → 400', async () => {
    assert.equal((await esperar(http('GET', '/no-existe'), 404)).error.code, 'NOT_FOUND');
    assert.equal((await esperar(http('PUT', `/empleadas/${randomUUID()}`, '{roto', { raw: true }), 400)).error.code, 'BAD_JSON');
  });
});

describe('Empleadas', () => {
  it('PUT crea (201) y actualiza (200)', async () => {
    for (const e of [ana, eva]) {
      const { id, ...datos } = e;
      const creada = await esperar(http('PUT', `/empleadas/${id}`, datos), 201);
      assert.equal(creada.id, id);
      creados.empleadas.push(id);
    }
    const act = await esperar(http('PUT', `/empleadas/${ana.id}`, { ...ana, tarifaCent: 1100 }), 200);
    assert.equal(act.tarifaCent, 1100);
    ana.tarifaCent = 1100;
  });

  it('GET lista incluye las creadas', async () => {
    const lista = await esperar(http('GET', '/empleadas'), 200);
    assert.ok([ana.id, eva.id].every((id) => lista.some((e) => e.id === id)));
  });

  it('PUT inválido → 400 con detalle · id no UUID → 400', async () => {
    const err = await esperar(http('PUT', `/empleadas/${randomUUID()}`, { nombre: '', rol: 'X', color: 'azul', tarifaCent: 1 }), 400);
    assert.ok(err.error.details.length >= 2);
    await esperar(http('PUT', '/empleadas/abc', ana), 400);
  });

  it('DELETE inexistente → 404', async () => esperar(http('DELETE', `/empleadas/${randomUUID()}`), 404));
});

describe('Plantillas', () => {
  const p = { id: randomUUID(), nombre: 'Smoke partido', tramos: [{ inicio: 570, fin: 660 }, { inicio: 1080, fin: 1200 }] };
  it('PUT crea (201) · actualiza (200) · GET lista', async () => {
    await esperar(http('PUT', `/plantillas/${p.id}`, { nombre: p.nombre, tramos: p.tramos }), 201);
    creados.plantillas.push(p.id);
    await esperar(http('PUT', `/plantillas/${p.id}`, { nombre: 'Smoke partido B', tramos: p.tramos }), 200);
    const lista = await esperar(http('GET', '/plantillas'), 200);
    assert.equal(lista.at(-1).id, p.id, 'la nueva va al final del panel');
  });

  it('tramos solapados → 400', async () => {
    await esperar(http('PUT', `/plantillas/${randomUUID()}`, { nombre: 'x', tramos: [{ inicio: 600, fin: 700 }, { inicio: 650, fin: 800 }] }), 400);
  });

  it('POST /turnos/desde-plantilla copia los tramos (201)', async () => {
    const id = randomUUID();
    const t = await esperar(http('POST', '/turnos/desde-plantilla', { id, plantillaId: p.id, empleadaId: eva.id, fecha: dia(3) }), 201);
    assert.deepEqual(t.tramos, p.tramos);
    creados.turnos.push(id);
  });

  it('desde plantilla inexistente → 404', async () => {
    await esperar(http('POST', '/turnos/desde-plantilla', { plantillaId: randomUUID(), empleadaId: eva.id, fecha: dia(3) }), 404);
  });
});

describe('Turnos', () => {
  const t1 = randomUUID();
  it('PUT crea (201) y actualiza (200)', async () => {
    await esperar(http('PUT', `/turnos/${t1}`, { empleadaId: ana.id, fecha: dia(0), tramos: T(400, 720) }), 201);
    creados.turnos.push(t1);
    const t = await esperar(http('PUT', `/turnos/${t1}`, { empleadaId: ana.id, fecha: dia(0), tramos: T(400, 780) }), 200);
    assert.deepEqual(t.tramos, T(400, 780));
  });

  it('GET con rango filtra por fecha', async () => {
    const r = await esperar(http('GET', `/turnos?desde=${dia(0)}&hasta=${dia(0)}`), 200);
    assert.deepEqual(r.map((x) => x.id), [t1]);
    await esperar(http('GET', `/turnos?desde=${dia(5)}&hasta=${dia(0)}`), 400);
  });

  it('POST /:id/mover mueve (200) y duplica (201)', async () => {
    const movido = await esperar(http('POST', `/turnos/${t1}/mover`, { empleadaId: ana.id, fecha: dia(1) }), 200);
    assert.equal(movido.fecha, dia(1));
    const nuevoId = randomUUID();
    const copia = await esperar(http('POST', `/turnos/${t1}/mover`, { empleadaId: ana.id, fecha: dia(2), duplicar: true, nuevoId }), 201);
    assert.equal(copia.id, nuevoId);
    creados.turnos.push(nuevoId);
  });

  it('DELETE (204) y de nuevo → 404', async () => {
    const id = randomUUID();
    await esperar(http('PUT', `/turnos/${id}`, { empleadaId: ana.id, fecha: dia(4), tramos: T(600, 660) }), 201);
    await esperar(http('DELETE', `/turnos/${id}`), 204);
    await esperar(http('DELETE', `/turnos/${id}`), 404);
  });

  it('empleada inexistente → 404', async () => {
    await esperar(http('PUT', `/turnos/${randomUUID()}`, { empleadaId: randomUUID(), fecha: dia(0), tramos: T(1, 2) }), 404);
  });
});

describe('Semanas', () => {
  it('PUT /:lunes publica (200) · martes → 400 · GET lista', async () => {
    assert.deepEqual(await esperar(http('PUT', `/semanas/${LUNES}`, { publicada: true }), 200), { lunes: LUNES, publicada: true });
    creados.semanas.push(LUNES);
    await esperar(http('PUT', `/semanas/${dia(1)}`, { publicada: true }), 400);
    assert.ok((await esperar(http('GET', '/semanas'), 200)).some((s) => s.lunes === LUNES));
  });

  it('POST /:lunes/copiar-anterior → 201 con creados y luego 200 sin huecos', async () => {
    const sig = dia(7);
    const r = await esperar(http('POST', `/semanas/${sig}/copiar-anterior`), 201);
    assert.ok(r.creados.length >= 3);
    assert.ok(r.creados.every((t) => t.fecha >= sig && t.fecha <= sumarDias(sig, 6)));
    assert.deepEqual((await esperar(http('POST', `/semanas/${sig}/copiar-anterior`), 200)).creados, []);
  });
});

describe('Registros', () => {
  it('PUT /:empleadaId/:fecha crea (201) y actualiza manteniendo id (200)', async () => {
    const id = randomUUID();
    const r = await esperar(http('PUT', `/registros/${ana.id}/${dia(1)}`, { id, tramos: T(400, 800), estado: 'previsto', nota: 'Inventario' }), 201);
    assert.equal(r.id, id);
    const r2 = await esperar(http('PUT', `/registros/${ana.id}/${dia(1)}`, { tramos: T(400, 810), estado: 'previsto' }), 200);
    assert.equal(r2.id, id);
    assert.equal(r2.nota, undefined, 'PUT reemplaza: sin nota → se borra');
  });

  it('POST /confirmar-dia confirma existentes y crea desde turnos', async () => {
    for (const n of [1, 2, 3]) {
      const res = await esperar(http('POST', '/registros/confirmar-dia', { fecha: dia(n), empleadaIds: [ana.id, eva.id] }), 200);
      assert.ok(res.every((r) => r.estado === 'confirmado'));
    }
  });

  it('GET con rango · DELETE (204) · DELETE inexistente (404)', async () => {
    const lista = await esperar(http('GET', `/registros?desde=${dia(1)}&hasta=${dia(3)}`), 200);
    assert.ok(lista.length >= 3);
    const id = randomUUID();
    await esperar(http('PUT', `/registros/${eva.id}/${dia(5)}`, { id, tramos: T(600, 660), estado: 'previsto' }), 201);
    await esperar(http('DELETE', `/registros/${id}`), 204);
    await esperar(http('DELETE', `/registros/${id}`), 404);
  });
});

describe('Reglas y ajustes', () => {
  it('GET/PATCH /reglas fusiona y valida', async () => {
    const r = await esperar(http('PATCH', '/reglas', { maxHorasDia: { activa: true, valor: 9 } }), 200);
    assert.equal(r.maxHorasDia.valor, 9);
    await esperar(http('PATCH', '/reglas', { apertura: { desde: 900, hasta: 100 } }), 400);
  });

  it('GET/PATCH /ajustes recargos y festivos', async () => {
    const a = await esperar(http('PATCH', '/ajustes', { recargoFestivoPct: 50, festivos: [...ajustesOriginales.festivos, dia(2)] }), 200);
    assert.ok(a.festivos.includes(dia(2)));
    assert.equal((await esperar(http('GET', '/ajustes'), 200)).recargoFestivoPct, 50);
  });
});

describe('Pagos', () => {
  const periodo = { inicio: dia(0), fin: dia(6), etiqueta: 'Smoke semana' };

  it('POST con horas sin confirmar → 409 con pendientes', async () => {
    await esperar(http('PUT', `/turnos/${randomUUID()}`, { empleadaId: ana.id, fecha: dia(5), tramos: T(600, 660) }), 201);
    const res = await http('POST', '/pagos', periodo);
    if (res.status === 201) creados.pagos.push(res.body.id); // que la limpieza no quede bloqueada si falla
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.error.details.pendientes, [dia(5)]);
  });

  it('GET /pagos/calculo previsualiza', async () => {
    const c = await esperar(http('GET', `/pagos/calculo?inicio=${dia(1)}&fin=${dia(3)}`), 200);
    assert.deepEqual(c.pendientes, []);
    assert.ok(c.totalCent > 0);
  });

  it('POST (201) congela líneas con recargo festivo · duplicado y solapado → 409', async () => {
    const id = randomUUID();
    const sub = { id, inicio: dia(1), fin: dia(3), etiqueta: 'Smoke 3 días' };
    const previa = await esperar(http('GET', `/pagos/calculo?inicio=${sub.inicio}&fin=${sub.fin}`), 200);
    const pago = await esperar(http('POST', '/pagos', sub), 201);
    creados.pagos.push(id);
    assert.equal(pago.totalCent, previa.totalCent, 'lo pagado = lo previsualizado');
    assert.equal(pago.totalCent, pago.lineas.reduce((t, l) => t + l.importeCent, 0));
    assert.ok(pago.lineas.find((l) => l.empleadaId === ana.id).recargosCent > 0, 'Ana trabaja el festivo (día 2) con +50 %');
    await esperar(http('POST', '/pagos', sub), 409);
    await esperar(http('POST', '/pagos', { inicio: dia(3), fin: dia(4), etiqueta: 'x' }), 409);
    assert.ok((await esperar(http('GET', '/pagos'), 200)).some((p) => p.id === id));
  });

  it('DELETE reabre (204) y luego 404', async () => {
    const id = creados.pagos.pop();
    await esperar(http('DELETE', `/pagos/${id}`), 204);
    await esperar(http('DELETE', `/pagos/${id}`), 404);
  });
});

describe('Eliminar empleada y sync', () => {
  it('DELETE /empleadas/:id → borrado lógico (200)', async () => {
    const r = await esperar(http('DELETE', `/empleadas/${eva.id}`), 200);
    assert.ok(r.empleada.eliminadaEn);
    assert.equal(r.empleada.activa, false);
  });

  it('POST /sync restaura la empleada (deshacer) y valida el lote', async () => {
    await esperar(http('POST', '/sync', { empleadas: { upsert: [{ ...eva, activa: true, eliminadaEn: null }] } }), 200);
    const e = (await esperar(http('GET', '/empleadas'), 200)).find((x) => x.id === eva.id);
    assert.equal(e.activa, true);
    assert.equal(e.eliminadaEn, undefined);
    await esperar(http('POST', '/sync', { turnos: { delete: ['no-uuid'] } }), 400);
  });
});
