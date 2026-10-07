/**
 * Fichaje de jornada (RD-ley 8/2019).
 * - `fichajes`: registro de solo inserción con la hora del servidor (la empleada no la elige).
 *   No se borra en cascada: el histórico debe conservarse (4 años) aunque la empleada se dé de baja.
 * - `registros.origen`: distingue las horas generadas desde los fichajes de las introducidas a mano.
 * - `configuracion.fichaje`: geocerca opcional (solo fichar en la cafetería).
 */
const TIMESTAMPS = `
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;

const FICHAJE_INICIAL = { geocerca: { activa: false, latitud: null, longitud: null, radioM: 150 } };

export async function up({ sequelize, transaction }) {
  await sequelize.query(
    `
    CREATE TYPE enum_fichajes_tipo AS ENUM ('entrada', 'salida');

    CREATE TABLE fichajes (
      id UUID PRIMARY KEY,
      empleada_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE RESTRICT,
      fecha DATE NOT NULL,
      minuto INTEGER NOT NULL CHECK (minuto BETWEEN 0 AND 1439),
      tipo enum_fichajes_tipo NOT NULL,
      marca TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      latitud DOUBLE PRECISION CHECK (latitud BETWEEN -90 AND 90),
      longitud DOUBLE PRECISION CHECK (longitud BETWEEN -180 AND 180),
      precision_m INTEGER CHECK (precision_m >= 0),
      distancia_m INTEGER CHECK (distancia_m >= 0),${TIMESTAMPS}
    );
    CREATE INDEX fichajes_empleada_fecha_idx ON fichajes (empleada_id, fecha, marca);
    CREATE INDEX fichajes_fecha_idx ON fichajes (fecha);

    ALTER TABLE registros
      ADD COLUMN origen VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'fichaje'));
    `,
    { transaction },
  );
  await sequelize.query('ALTER TABLE configuracion ADD COLUMN fichaje JSONB NOT NULL DEFAULT CAST(:inicial AS JSONB)', {
    replacements: { inicial: JSON.stringify(FICHAJE_INICIAL) },
    transaction,
  });
}

export async function down({ sequelize, transaction }) {
  await sequelize.query(
    `
    ALTER TABLE configuracion DROP COLUMN IF EXISTS fichaje;
    ALTER TABLE registros DROP COLUMN IF EXISTS origen;
    DROP TABLE IF EXISTS fichajes;
    DROP TYPE IF EXISTS enum_fichajes_tipo;
    `,
    { transaction },
  );
}
