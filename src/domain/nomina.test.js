import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calcularPeriodo, importeDia } from './nomina.js';

const ajustes = { recargoDomingoPct: 10, recargoFestivoPct: 25, festivos: ['2026-10-12'] };
const emp = (id, extra = {}) => ({ id, tarifaCent: 1000, excluirNomina: false, activa: true, eliminadaEn: null, ...extra });
const T = (inicio, fin) => [{ inicio, fin }];

describe('importeDia', () => {
  it('aplica recargo de festivo antes que el de domingo', () => {
    assert.deepEqual(importeDia({ tarifaCent: 1000, fecha: '2026-10-12', minutos: 60, ajustes }), { base: 1000, recargo: 250 });
    assert.deepEqual(importeDia({ tarifaCent: 1000, fecha: '2026-10-11', minutos: 60, ajustes }), { base: 1000, recargo: 100 });
    assert.deepEqual(importeDia({ tarifaCent: 1000, fecha: '2026-10-13', minutos: 60, ajustes }), { base: 1000, recargo: 0 });
  });

  it('paga minutos exactos (10:35–12:00 = 1 h 25 = 14,17 €)', () => {
    const { base } = importeDia({ tarifaCent: 1000, fecha: '2026-10-13', minutos: 85, ajustes });
    assert.equal(Math.round(base), 1417);
  });
});

describe('calcularPeriodo', () => {
  const base = { ajustes, inicio: '2026-10-12', fin: '2026-10-13' };

  it('usa el registro real si existe y lo planificado si no, marcando pendientes', () => {
    const r = calcularPeriodo({
      ...base,
      empleadas: [emp('a')],
      turnos: [{ empleadaId: 'a', fecha: '2026-10-12', tramos: T(540, 600) }, { empleadaId: 'a', fecha: '2026-10-13', tramos: T(540, 600) }],
      registros: [{ empleadaId: 'a', fecha: '2026-10-12', tramos: T(540, 660), estado: 'confirmado' }],
    });
    assert.equal(r.lineas[0].minutos, 180);
    assert.deepEqual(r.pendientes, ['2026-10-13']);
    // 2 h festivo (+25 %) + 1 h normal
    assert.equal(r.totalCent, 2000 + 500 + 1000);
    assert.equal(r.recargosCent, 500);
  });

  it('excluye de importes a quien no cobra nómina pero cuenta sus horas pendientes', () => {
    const r = calcularPeriodo({
      ...base,
      empleadas: [emp('jefa', { excluirNomina: true }), emp('b')],
      turnos: [{ empleadaId: 'jefa', fecha: '2026-10-13', tramos: T(540, 1260) }],
      registros: [{ empleadaId: 'b', fecha: '2026-10-13', tramos: T(540, 600), estado: 'confirmado' }],
    });
    assert.equal(r.lineas.find((l) => l.empleadaId === 'jefa').importeCent, 0);
    assert.equal(r.totalCent, 1000);
    assert.equal(r.minutos, 60);
    assert.deepEqual(r.pendientes, ['2026-10-13']);
  });

  it('incluye eliminadas solo si tienen registros en el periodo y oculta inactivas sin horas', () => {
    const r = calcularPeriodo({
      ...base,
      empleadas: [emp('vieja', { eliminadaEn: '2026-09-01', activa: false }), emp('baja', { activa: false }), emp('ida', { eliminadaEn: '2026-10-13', activa: false })],
      turnos: [],
      registros: [{ empleadaId: 'ida', fecha: '2026-10-12', tramos: T(600, 660), estado: 'confirmado' }],
    });
    assert.deepEqual(r.lineas.map((l) => l.empleadaId), ['ida']);
  });

  it('el total cuadra con la suma de líneas redondeadas', () => {
    const r = calcularPeriodo({
      ...base,
      empleadas: [emp('a', { tarifaCent: 1001 }), emp('b', { tarifaCent: 1001 })],
      turnos: [],
      registros: ['a', 'b'].map((id) => ({ empleadaId: id, fecha: '2026-10-13', tramos: T(600, 607), estado: 'confirmado' })),
    });
    assert.equal(r.totalCent, r.lineas.reduce((t, l) => t + l.importeCent, 0));
  });
});
