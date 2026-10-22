const CIERRE = [{ desde: 840, hasta: 1020 }];

export async function up({ sequelize, transaction }) {
  await sequelize.query(
    `
    UPDATE configuracion
    SET
      reglas = jsonb_set(reglas, '{cierres}', CAST(:cierres AS JSONB)),
      fichaje = jsonb_set(fichaje, '{red,activa}', 'false'::jsonb)
    `,
    { replacements: { cierres: JSON.stringify(CIERRE) }, transaction },
  );
}

export async function down({ sequelize, transaction }) {
  await sequelize.query(
    `
    UPDATE configuracion
    SET reglas = reglas - 'cierres'
    `,
    { transaction },
  );
}
