import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { minutosDe, tramosValidos } from './tramos.js';

describe('tramos', () => {
  it('suma los minutos de turnos simples y partidos', () => {
    assert.equal(minutosDe([{ inicio: 400, fin: 720 }]), 320);
    assert.equal(minutosDe([{ inicio: 540, fin: 720 }, { inicio: 1080, fin: 1200 }]), 300);
    assert.equal(minutosDe(undefined), 0);
  });

  it('acepta 1 o 2 tramos ordenados y sin solaparse', () => {
    assert.equal(tramosValidos([{ inicio: 400, fin: 720 }]), true);
    assert.equal(tramosValidos([{ inicio: 540, fin: 720 }, { inicio: 720, fin: 800 }]), true);
  });

  it('rechaza vacíos, solapes, desorden, más de 2 tramos y límites del día', () => {
    assert.equal(tramosValidos([]), false);
    assert.equal(tramosValidos([{ inicio: 720, fin: 720 }]), false);
    assert.equal(tramosValidos([{ inicio: 540, fin: 720 }, { inicio: 700, fin: 800 }]), false);
    assert.equal(tramosValidos([{ inicio: 900, fin: 1000 }, { inicio: 500, fin: 600 }]), false);
    assert.equal(tramosValidos([{ inicio: 1, fin: 2 }, { inicio: 3, fin: 4 }, { inicio: 5, fin: 6 }]), false);
    assert.equal(tramosValidos([{ inicio: -10, fin: 60 }]), false);
    assert.equal(tramosValidos([{ inicio: 1400, fin: 1450 }]), false);
    assert.equal(tramosValidos([{ inicio: 10.5, fin: 60 }]), false);
  });
});
