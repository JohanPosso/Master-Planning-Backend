import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diaSemana, esDomingo, esFechaIso, esLunes, hoyEn, rangoFechas, sumarDias } from './fechas.js';

describe('fechas', () => {
  it('valida fechas ISO reales', () => {
    assert.equal(esFechaIso('2026-10-05'), true);
    assert.equal(esFechaIso('2024-02-29'), true);
    assert.equal(esFechaIso('2026-02-29'), false);
    assert.equal(esFechaIso('2026-13-01'), false);
    assert.equal(esFechaIso('5/10/2026'), false);
    assert.equal(esFechaIso(20261005), false);
  });

  it('suma días cruzando meses, años y el cambio de hora', () => {
    assert.equal(sumarDias('2026-10-31', 1), '2026-11-01');
    assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
    assert.equal(sumarDias('2026-10-25', 1), '2026-10-26'); // fin del horario de verano en Madrid
    assert.equal(sumarDias('2026-10-05', -7), '2026-09-28');
  });

  it('numera la semana empezando en lunes', () => {
    assert.equal(diaSemana('2026-10-05'), 0);
    assert.equal(esLunes('2026-10-05'), true);
    assert.equal(esDomingo('2026-10-11'), true);
    assert.equal(esLunes('2026-10-06'), false);
  });

  it('genera rangos inclusivos y vacíos si fin < inicio', () => {
    assert.deepEqual(rangoFechas('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    assert.deepEqual(rangoFechas('2026-10-05', '2026-10-05'), ['2026-10-05']);
    assert.deepEqual(rangoFechas('2026-10-05', '2026-10-01'), []);
  });

  it('calcula «hoy» en la zona del negocio, no en la del servidor', () => {
    const casiMedianocheUtc = new Date('2026-10-05T22:30:00Z'); // 00:30 del día 6 en Madrid
    assert.equal(hoyEn('Europe/Madrid', casiMedianocheUtc), '2026-10-06');
    assert.equal(hoyEn('UTC', casiMedianocheUtc), '2026-10-05');
  });
});
