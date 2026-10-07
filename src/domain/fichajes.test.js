import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ahoraEn, dentroDeGeocerca, distanciaMetros, estadoDia, siguienteTipo, tramosDesdePares } from './fichajes.js';

let n = 0;
const F = (tipo, minuto) => ({ tipo, minuto, marca: new Date(Date.UTC(2026, 9, 7, 0, 0, n++)).toISOString() });

describe('ahoraEn', () => {
  it('da fecha y minuto en la zona del negocio', () => {
    assert.deepEqual(ahoraEn('Europe/Madrid', new Date('2026-10-07T06:02:30Z')), { fecha: '2026-10-07', minuto: 8 * 60 + 2 });
    assert.deepEqual(ahoraEn('Europe/Madrid', new Date('2026-10-06T22:30:00Z')), { fecha: '2026-10-07', minuto: 30 });
  });

  it('respeta el cambio de hora (invierno: UTC+1)', () => {
    assert.deepEqual(ahoraEn('Europe/Madrid', new Date('2026-11-02T07:00:00Z')), { fecha: '2026-11-02', minuto: 8 * 60 });
  });

  it('medianoche es el minuto 0, nunca 1440', () => {
    assert.equal(ahoraEn('Europe/Madrid', new Date('2026-10-06T22:00:00Z')).minuto, 0);
  });
});

describe('siguienteTipo y estadoDia', () => {
  it('alterna entrada y salida', () => {
    assert.equal(siguienteTipo([]), 'entrada');
    assert.equal(siguienteTipo([F('entrada', 480)]), 'salida');
    assert.equal(siguienteTipo([F('entrada', 480), F('salida', 720)]), 'entrada');
  });

  it('empareja un turno partido y suma los minutos', () => {
    const e = estadoDia([F('entrada', 540), F('salida', 720), F('entrada', 1080), F('salida', 1200)]);
    assert.deepEqual(e.pares, [{ inicio: 540, fin: 720 }, { inicio: 1080, fin: 1200 }]);
    assert.equal(e.minutos, 300);
    assert.equal(e.dentro, false);
  });

  it('deja abierta la entrada sin salida e ignora salidas huérfanas y pares de 0 min', () => {
    const e = estadoDia([F('salida', 400), F('entrada', 480), F('salida', 480), F('entrada', 600)]);
    assert.deepEqual(e.pares, []);
    assert.equal(e.abierta, 600);
    assert.equal(e.dentro, true);
  });

  it('ordena por instante, no por el orden de llegada', () => {
    const entrada = F('entrada', 480);
    const salida = F('salida', 720);
    assert.deepEqual(estadoDia([salida, entrada]).pares, [{ inicio: 480, fin: 720 }]);
  });
});

describe('tramosDesdePares', () => {
  it('deja intactos 1 o 2 pares', () => {
    const pares = [{ inicio: 540, fin: 720 }, { inicio: 1080, fin: 1200 }];
    assert.deepEqual(tramosDesdePares(pares), { tramos: pares, unificados: false });
  });

  it('une tramos contiguos (salió y volvió a entrar en el mismo minuto) sin avisar', () => {
    assert.deepEqual(tramosDesdePares([{ inicio: 1152, fin: 1154 }, { inicio: 1154, fin: 1156 }]), { tramos: [{ inicio: 1152, fin: 1156 }], unificados: false });
  });

  it('con 3 o más une el hueco más corto y lo avisa', () => {
    const r = tramosDesdePares([{ inicio: 480, fin: 600 }, { inicio: 610, fin: 720 }, { inicio: 1080, fin: 1200 }]);
    assert.deepEqual(r.tramos, [{ inicio: 480, fin: 720 }, { inicio: 1080, fin: 1200 }]);
    assert.equal(r.unificados, true);
  });
});

describe('geocerca', () => {
  const cafeteria = { latitud: 40.4168, longitud: -3.7038, radioM: 150 };

  it('calcula distancias reales (Puerta del Sol → Plaza Mayor ≈ 400 m)', () => {
    const d = distanciaMetros(cafeteria, { latitud: 40.4155, longitud: -3.7074 });
    assert.ok(d > 300 && d < 450, String(d));
  });

  it('acepta dentro del radio y rechaza fuera', () => {
    assert.equal(dentroDeGeocerca(cafeteria, { latitud: 40.4169, longitud: -3.7039 }).dentro, true);
    assert.equal(dentroDeGeocerca(cafeteria, { latitud: 40.4155, longitud: -3.7074 }).dentro, false);
  });

  it('descuenta la imprecisión del GPS con un tope de 100 m', () => {
    const cerca = { latitud: 40.4184, longitud: -3.7038 }; // ~178 m
    assert.equal(dentroDeGeocerca(cafeteria, { ...cerca, precisionM: 5 }).dentro, false);
    assert.equal(dentroDeGeocerca(cafeteria, { ...cerca, precisionM: 40 }).dentro, true);
    const lejos = { latitud: 40.4155, longitud: -3.7074, precisionM: 5000 };
    assert.equal(dentroDeGeocerca(cafeteria, lejos).dentro, false, 'una precisión enorme no abre la puerta');
  });
});
