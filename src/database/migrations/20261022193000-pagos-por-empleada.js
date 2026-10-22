export async function up({ sequelize, transaction }) {
  await sequelize.query(
    `
    ALTER TABLE periodos_pago DROP CONSTRAINT IF EXISTS periodos_pago_inicio_key;
    CREATE INDEX IF NOT EXISTS periodos_pago_inicio_fin_idx ON periodos_pago (inicio, fin);
    `,
    { transaction },
  );
}

export async function down({ sequelize, transaction }) {
  await sequelize.query(
    `
    DROP INDEX IF EXISTS periodos_pago_inicio_fin_idx;
    ALTER TABLE periodos_pago ADD CONSTRAINT periodos_pago_inicio_key UNIQUE (inicio);
    `,
    { transaction },
  );
}
