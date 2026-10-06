/** Auth: admin y credenciales de portal en empleadas. */
const TIMESTAMPS = `
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;

export async function up({ sequelize, transaction }) {
  await sequelize.query(
    `
    CREATE TABLE usuarios_admin (
      id UUID PRIMARY KEY,
      usuario VARCHAR(40) NOT NULL,
      password_hash VARCHAR(100) NOT NULL,${TIMESTAMPS},
      CONSTRAINT usuarios_admin_usuario_uk UNIQUE (usuario)
    );

    ALTER TABLE empleadas
      ADD COLUMN usuario VARCHAR(40),
      ADD COLUMN password_hash VARCHAR(100);

    CREATE UNIQUE INDEX empleadas_usuario_uk ON empleadas (usuario) WHERE usuario IS NOT NULL;
    `,
    { transaction },
  );
}

export async function down({ sequelize, transaction }) {
  await sequelize.query(
    `
    DROP INDEX IF EXISTS empleadas_usuario_uk;
    ALTER TABLE empleadas DROP COLUMN IF EXISTS password_hash, DROP COLUMN IF EXISTS usuario;
    DROP TABLE IF EXISTS usuarios_admin;
    `,
    { transaction },
  );
}
