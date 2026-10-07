/**
 * Correcciones trazables, cierre automático y verificación por Wi-Fi.
 * - origen: quién creó el fichaje (empleada, encargado o el cierre automático).
 * - Una corrección nunca borra: anula el original (anulado_en + motivo) y crea otro con sustituye_a.
 * - verificacion: cómo se comprobó que estaba en la cafetería (gps, red) o si no se pudo (sin_verificar).
 */
const NUEVOS_AJUSTES = { cierreAutomaticoHoras: 10, red: { activa: false, ips: [] }, sinVerificar: 'revisar' };

export async function up({ sequelize, transaction }) {
  await sequelize.query(
    `
    ALTER TABLE fichajes
      ADD COLUMN origen VARCHAR(12) NOT NULL DEFAULT 'empleada' CHECK (origen IN ('empleada', 'encargado', 'automatico')),
      ADD COLUMN verificacion VARCHAR(16) CHECK (verificacion IN ('gps', 'red', 'sin_verificar')),
      ADD COLUMN ip VARCHAR(45),
      ADD COLUMN anulado_en TIMESTAMPTZ,
      ADD COLUMN motivo TEXT,
      ADD COLUMN sustituye_a UUID REFERENCES fichajes(id) ON DELETE RESTRICT,
      ADD CONSTRAINT fichajes_correccion_con_motivo CHECK (origen <> 'encargado' OR motivo IS NOT NULL),
      ADD CONSTRAINT fichajes_anulacion_con_motivo CHECK (anulado_en IS NULL OR motivo IS NOT NULL);

    -- El cierre automático busca entradas abiertas recientes.
    CREATE INDEX fichajes_vigentes_idx ON fichajes (fecha, empleada_id) WHERE anulado_en IS NULL;
    `,
    { transaction },
  );
  await sequelize.query('UPDATE configuracion SET fichaje = CAST(:nuevos AS JSONB) || fichaje', {
    replacements: { nuevos: JSON.stringify(NUEVOS_AJUSTES) },
    transaction,
  });
}

export async function down({ sequelize, transaction }) {
  await sequelize.query(
    `
    DROP INDEX IF EXISTS fichajes_vigentes_idx;
    ALTER TABLE fichajes
      DROP CONSTRAINT IF EXISTS fichajes_anulacion_con_motivo,
      DROP CONSTRAINT IF EXISTS fichajes_correccion_con_motivo,
      DROP COLUMN IF EXISTS sustituye_a,
      DROP COLUMN IF EXISTS motivo,
      DROP COLUMN IF EXISTS anulado_en,
      DROP COLUMN IF EXISTS ip,
      DROP COLUMN IF EXISTS verificacion,
      DROP COLUMN IF EXISTS origen;
    UPDATE configuracion SET fichaje = fichaje - 'cierreAutomaticoHoras' - 'red' - 'sinVerificar';
    `,
    { transaction },
  );
}
