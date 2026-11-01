/** Libro de auditoría append-only (movimientos de negocio). */
export async function up({ sequelize, transaction }) {
  await sequelize.query(
    `
    CREATE TABLE movimientos (
      id UUID PRIMARY KEY,
      tipo VARCHAR(60) NOT NULL,
      entidad VARCHAR(40),
      entidad_id UUID,
      empleada_id UUID REFERENCES empleadas(id) ON DELETE SET NULL,
      actor_tipo VARCHAR(20) NOT NULL DEFAULT 'sistema',
      actor_id UUID,
      actor_nombre VARCHAR(80),
      resumen VARCHAR(240) NOT NULL,
      detalle JSONB NOT NULL DEFAULT '{}',
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX movimientos_creado_en_idx ON movimientos (creado_en DESC);
    CREATE INDEX movimientos_tipo_creado_idx ON movimientos (tipo, creado_en DESC);
    CREATE INDEX movimientos_empleada_creado_idx ON movimientos (empleada_id, creado_en DESC)
      WHERE empleada_id IS NOT NULL;
    `,
    { transaction },
  );
}

export async function down({ sequelize, transaction }) {
  await sequelize.query(`DROP TABLE IF EXISTS movimientos;`, { transaction });
}
