/**
 * Alta inicial del Wi-Fi de la Cafetería Mediterránea (FIBRAMEDIOS-M03664_5G) para el fichaje.
 * Es un dato de configuración, no código: se aplica una sola vez por base de datos y después
 * se gestiona desde Ajustes → Fichaje (si el proveedor cambia la IP, se cambia allí).
 * Idempotente: no duplica la IP si ya estaba y conserva las demás redes guardadas.
 */
const IP_CAFETERIA = '185.250.76.217';

export async function up({ sequelize, transaction }) {
  await sequelize.query(
    `
    UPDATE configuracion
    SET fichaje = jsonb_set(
      fichaje,
      '{red}',
      jsonb_build_object(
        'activa', true,
        'ips', (
          SELECT COALESCE(jsonb_agg(DISTINCT ip), '[]'::jsonb)
          FROM jsonb_array_elements_text(COALESCE(fichaje->'red'->'ips', '[]'::jsonb) || to_jsonb(CAST(:ip AS TEXT))) AS ip
        )
      )
    )
    `,
    { replacements: { ip: IP_CAFETERIA }, transaction },
  );
}

/** Quita solo esta IP; si no queda ninguna red, desactiva el fichaje por Wi-Fi. */
export async function down({ sequelize, transaction }) {
  await sequelize.query(
    `
    UPDATE configuracion
    SET fichaje = jsonb_set(
      fichaje,
      '{red}',
      (
        SELECT jsonb_build_object('activa', (fichaje->'red'->>'activa')::boolean AND COUNT(ip) > 0, 'ips', COALESCE(jsonb_agg(ip), '[]'::jsonb))
        FROM jsonb_array_elements_text(COALESCE(fichaje->'red'->'ips', '[]'::jsonb)) AS ip
        WHERE ip <> :ip
      )
    )
    `,
    { replacements: { ip: IP_CAFETERIA }, transaction },
  );
}
