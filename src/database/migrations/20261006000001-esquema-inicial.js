/** Esquema inicial. */const TRAMOS_CHECK = (col) => `CHECK (jsonb_typeof(${col}) = 'array' AND jsonb_array_length(${col}) BETWEEN 1 AND 2)`;
const TIMESTAMPS = `
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;

// Literal a propósito: una migración no debe depender de código de la app que evoluciona.
const REGLAS_INICIALES = {
  apertura: { desde: 400, hasta: 1260 },
  franjaVacia: true,
  minPersonas: { activa: true, desde: 540, hasta: 780, valor: 2 },
  maxHorasDia: { activa: true, valor: 10 },
  maxHorasSemana: { activa: true, valor: 40 },
  diaLibre: true,
  descansoSeguido: true,
};

export async function up({ sequelize, transaction }) {
  await sequelize.query(
    `
    CREATE TYPE enum_empleadas_rol AS ENUM ('Empleada', 'Jefa');
    CREATE TYPE enum_empleadas_color AS ENUM ('rosa', 'morado', 'turq', 'naranja', 'azul', 'verde', 'ambar', 'rojo', 'indigo', 'gris');
    CREATE TYPE enum_registros_estado AS ENUM ('previsto', 'confirmado');

    CREATE TABLE empleadas (
      id UUID PRIMARY KEY,
      nombre VARCHAR(80) NOT NULL CHECK (length(btrim(nombre)) > 0),
      rol enum_empleadas_rol NOT NULL DEFAULT 'Empleada',
      color enum_empleadas_color NOT NULL,
      tarifa_cent INTEGER NOT NULL DEFAULT 1000 CHECK (tarifa_cent >= 0),
      dias_descanso INTEGER[] NOT NULL DEFAULT '{}',
      descanso_seguido BOOLEAN NOT NULL DEFAULT FALSE,
      excluir_nomina BOOLEAN NOT NULL DEFAULT FALSE,
      activa BOOLEAN NOT NULL DEFAULT TRUE,
      eliminada_en DATE,${TIMESTAMPS}
    );

    CREATE TABLE plantillas (
      id UUID PRIMARY KEY,
      nombre VARCHAR(60) NOT NULL,
      tramos JSONB NOT NULL ${TRAMOS_CHECK('tramos')},
      orden INTEGER NOT NULL DEFAULT 0,${TIMESTAMPS}
    );

    CREATE TABLE semanas (
      lunes DATE PRIMARY KEY CHECK (EXTRACT(ISODOW FROM lunes) = 1),
      publicada BOOLEAN NOT NULL DEFAULT FALSE,
      publicada_en TIMESTAMPTZ,${TIMESTAMPS}
    );

    CREATE TABLE turnos (
      id UUID PRIMARY KEY,
      empleada_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE CASCADE,
      fecha DATE NOT NULL,
      tramos JSONB NOT NULL ${TRAMOS_CHECK('tramos')},
      plantilla_id UUID REFERENCES plantillas(id) ON DELETE SET NULL,
      avisos_ignorados TEXT[] NOT NULL DEFAULT '{}',${TIMESTAMPS},
      CONSTRAINT turnos_empleada_fecha_uk UNIQUE (empleada_id, fecha) DEFERRABLE INITIALLY IMMEDIATE
    );
    CREATE INDEX turnos_fecha_idx ON turnos (fecha);
    CREATE INDEX turnos_plantilla_idx ON turnos (plantilla_id);

    CREATE TABLE registros (
      id UUID PRIMARY KEY,
      empleada_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE RESTRICT,
      fecha DATE NOT NULL,
      tramos JSONB NOT NULL ${TRAMOS_CHECK('tramos')},
      minutos INTEGER NOT NULL DEFAULT 0 CHECK (minutos >= 0),
      nota TEXT,
      estado enum_registros_estado NOT NULL DEFAULT 'previsto',${TIMESTAMPS},
      CONSTRAINT registros_empleada_fecha_uk UNIQUE (empleada_id, fecha) DEFERRABLE INITIALLY IMMEDIATE
    );
    CREATE INDEX registros_fecha_idx ON registros (fecha);

    CREATE TABLE periodos_pago (
      id UUID PRIMARY KEY,
      inicio DATE NOT NULL UNIQUE,
      fin DATE NOT NULL,
      etiqueta VARCHAR(60) NOT NULL,
      pagado_en TIMESTAMPTZ NOT NULL,
      total_cent INTEGER NOT NULL CHECK (total_cent >= 0),${TIMESTAMPS},
      CHECK (fin >= inicio)
    );

    CREATE TABLE lineas_pago (
      id UUID PRIMARY KEY,
      periodo_id UUID NOT NULL REFERENCES periodos_pago(id) ON DELETE CASCADE,
      empleada_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE RESTRICT,
      minutos INTEGER NOT NULL CHECK (minutos >= 0),
      tarifa_cent INTEGER NOT NULL CHECK (tarifa_cent >= 0),
      recargos_cent INTEGER NOT NULL DEFAULT 0 CHECK (recargos_cent >= 0),
      importe_cent INTEGER NOT NULL CHECK (importe_cent >= 0),${TIMESTAMPS},
      CONSTRAINT lineas_pago_periodo_empleada_uk UNIQUE (periodo_id, empleada_id)
    );
    CREATE INDEX lineas_pago_empleada_idx ON lineas_pago (empleada_id);

    CREATE TABLE configuracion (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      reglas JSONB NOT NULL,
      recargo_domingo_pct INTEGER NOT NULL DEFAULT 0 CHECK (recargo_domingo_pct >= 0),
      recargo_festivo_pct INTEGER NOT NULL DEFAULT 0 CHECK (recargo_festivo_pct >= 0),${TIMESTAMPS}
    );

    CREATE TABLE festivos (
      fecha DATE PRIMARY KEY,
      nombre VARCHAR(80),${TIMESTAMPS}
    );
    `,
    { transaction },
  );

  await sequelize.query('INSERT INTO configuracion (id, reglas) VALUES (1, CAST(:reglas AS JSONB))', {
    replacements: { reglas: JSON.stringify(REGLAS_INICIALES) },
    transaction,
  });
}

export async function down({ sequelize, transaction }) {
  await sequelize.query(
    `
    DROP TABLE IF EXISTS festivos, configuracion, lineas_pago, periodos_pago, registros, turnos, semanas, plantillas, empleadas;
    DROP TYPE IF EXISTS enum_registros_estado, enum_empleadas_color, enum_empleadas_rol;
    `,
    { transaction },
  );
}
