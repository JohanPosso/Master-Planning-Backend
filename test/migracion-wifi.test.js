import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sequelize } from '../src/config/database.js';
import { down, up } from '../src/database/migrations/20261008120000-wifi-cafeteria.js';
import { cerrarBD, limpiarBD, prepararBD } from './helpers.js';

before(async () => { await prepararBD(); await limpiarBD(); });
after(cerrarBD);

const red = async () => (await sequelize.query("SELECT fichaje->'red' AS red FROM configuracion", { plain: true })).red;
const aplicar = (fn) => sequelize.transaction((transaction) => fn({ sequelize, transaction }));

describe('Migración del Wi-Fi de la cafetería', () => {
  it('da de alta la IP y activa el Wi-Fi, sin duplicar ni perder otras redes', async () => {
    await sequelize.query(`UPDATE configuracion SET fichaje = jsonb_set(fichaje, '{red}', '{"activa": false, "ips": ["10.0.0.1"]}')`);
    await aplicar(up);
    await aplicar(up);
    const r = await red();
    assert.equal(r.activa, true);
    assert.deepEqual([...r.ips].sort(), ['10.0.0.1', '185.250.76.217']);
  });

  it('al revertir quita solo esa IP', async () => {
    await aplicar(down);
    assert.deepEqual(await red(), { activa: true, ips: ['10.0.0.1'] });
  });
});
