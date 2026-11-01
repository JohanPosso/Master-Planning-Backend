/** Adelantos en € (deuda) y descuento aplicado al liquidar horas. */
export async function up({ sequelize, transaction }) {
  await sequelize.query(
    `
    CREATE TABLE adelantos (
      id UUID PRIMARY KEY,
      empleada_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE RESTRICT,
      monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
      saldo_cent INTEGER NOT NULL CHECK (saldo_cent >= 0 AND saldo_cent <= monto_cent),
      nota VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX adelantos_empleada_saldo_idx ON adelantos (empleada_id, saldo_cent)
      WHERE saldo_cent > 0;

    ALTER TABLE periodos_pago
      ADD COLUMN IF NOT EXISTS adelanto_descontado_cent INTEGER NOT NULL DEFAULT 0
        CHECK (adelanto_descontado_cent >= 0);
    `,
    { transaction },
  );
}

export async function down({ sequelize, transaction }) {
  await sequelize.query(
    `
    ALTER TABLE periodos_pago DROP COLUMN IF EXISTS adelanto_descontado_cent;
    DROP TABLE IF EXISTS adelantos;
    `,
    { transaction },
  );
}
