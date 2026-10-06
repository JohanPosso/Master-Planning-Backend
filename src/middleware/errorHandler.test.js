import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConnectionRefusedError } from 'sequelize';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';
import { errorHandler } from './errorHandler.js';

function responder(err) {
  const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  errorHandler(err, { method: 'GET', originalUrl: '/api/x' }, res, () => {});
  return res;
}

describe('errorHandler', () => {
  it('traduce errores de negocio con su código', () => {
    const res = responder(new AppError(409, 'CONFLICT', 'Ya pagado', { pendientes: [] }));
    assert.equal(res.code, 409);
    assert.deepEqual(res.body, { error: { code: 'CONFLICT', message: 'Ya pagado', details: { pendientes: [] } } });
  });

  it('devuelve 400 con el detalle por campo de zod', () => {
    const { error } = z.object({ nombre: z.string() }).safeParse({});
    const res = responder(error);
    assert.equal(res.code, 400);
    assert.equal(res.body.error.details[0].path, 'nombre');
  });

  it('devuelve 503 si la base de datos no está disponible', () => {
    const res = responder(new ConnectionRefusedError(new Error('ECONNREFUSED')));
    assert.equal(res.code, 503);
    assert.equal(res.body.error.code, 'DB_UNAVAILABLE');
  });

  it('no filtra detalles internos en errores inesperados', () => {
    const original = console.error;
    console.error = () => {};
    try {
      const res = responder(new Error('password=secreta en la cadena de conexión'));
      assert.equal(res.code, 500);
      assert.deepEqual(res.body, { error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
    } finally {
      console.error = original;
    }
  });
});
