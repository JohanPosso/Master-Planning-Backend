import { z } from 'zod';
import { COLORES, ESTADOS_REGISTRO, ROLES } from './domain/catalogos.js';
import { diasEntre, esFechaIso, esLunes } from './domain/fechas.js';
import { MINUTOS_DIA, tramosValidos } from './domain/tramos.js';

/** Mensajes de validación en español (los muestra el frontend en el aviso de error). */
const TIPOS = { boolean: 'sí/no', number: 'un número', integer: 'un número entero', float: 'un decimal', string: 'texto', array: 'una lista', object: 'un objeto', null: 'vacío', date: 'una fecha' };
const tipo = (t) => TIPOS[t] ?? t;
z.setErrorMap((issue, ctx) => {
  const limite = (i) => (i.type === 'array' ? `${i.minimum ?? i.maximum} elementos` : i.type === 'string' ? `${i.minimum ?? i.maximum} caracteres` : `${i.minimum ?? i.maximum}`);
  switch (issue.code) {
    case 'invalid_type':
      return { message: issue.received === 'undefined' ? 'campo obligatorio' : `se esperaba ${tipo(issue.expected)} y llegó ${tipo(issue.received)}` };
    case 'too_small':
      return { message: `debe ser como mínimo ${limite(issue)}` };
    case 'too_big':
      return { message: `debe ser como máximo ${limite(issue)}` };
    case 'invalid_enum_value':
      return { message: `valor no permitido (opciones: ${issue.options.join(', ')})` };
    case 'not_integer':
      return { message: 'debe ser un número entero' };
    case 'invalid_string':
      return { message: issue.validation === 'uuid' ? 'identificador no válido' : 'texto no válido' };
    default:
      return { message: ctx.defaultError };
  }
});

const MAX_DIAS_PERIODO = 366;
const MAX_LOTE = 5000;

export const uuid = z.string().uuid('identificador no válido');
const FECHA_MIN = '1900-01-01';
const FECHA_MAX = '2999-12-31';
export const fecha = z
  .string()
  .refine(esFechaIso, 'fecha no válida (YYYY-MM-DD)')
  .refine((f) => f >= FECHA_MIN && f <= FECHA_MAX, `fecha fuera de rango (${FECHA_MIN} – ${FECHA_MAX})`);
export const lunes = fecha.refine(esLunes, 'la semana debe empezar en lunes');
const minuto = z.number().int().min(0).max(MINUTOS_DIA);
const porcentaje = z.number().int().min(0).max(500);
const notaOpcional = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => v || null);

export const tramos = z
  .array(z.object({ inicio: minuto, fin: minuto }).strip())
  .refine(tramosValidos, '1 o 2 tramos, cada uno con fin posterior al inicio y sin solaparse');

// ── Entidades ──────────────────────────────────────────────────────────────
export const empleada = z.object({
  nombre: z.string().trim().min(1, 'el nombre es obligatorio').max(80, 'máximo 80 caracteres'),
  rol: z.enum(ROLES),
  color: z.enum(COLORES),
  tarifaCent: z.number().int().min(0).max(100_000),
  diasDescanso: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .default([])
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  descansoSeguido: z.boolean().default(false),
  excluirNomina: z.boolean().default(false),
  activa: z.boolean().default(true),
  eliminadaEn: fecha.nullish().transform((v) => v ?? null),
  usuario: z
    .string()
    .trim()
    .min(2, 'mínimo 2 caracteres')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'solo letras, números, punto, guion y guion bajo')
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  password: z
    .string()
    .min(4, 'mínimo 4 caracteres')
    .max(72)
    .nullish()
    .transform((v) => (v == null || v === '' ? undefined : v)),
  quitarAcceso: z.boolean().optional(),
});

export const login = z.object({
  usuario: z.string().trim().min(1, 'usuario obligatorio').max(40),
  password: z.string().min(1, 'contraseña obligatoria').max(72),
});

export const portalPerfil = z
  .object({
    nombre: z.string().trim().min(1, 'el nombre es obligatorio').max(80).optional(),
    usuario: z
      .string()
      .trim()
      .min(2, 'mínimo 2 caracteres')
      .max(40)
      .regex(/^[a-zA-Z0-9._-]+$/, 'solo letras, números, punto, guion y guion bajo')
      .transform((v) => v.toLowerCase())
      .optional(),
    passwordActual: z.string().min(1).max(72).optional(),
    passwordNueva: z.string().min(4, 'mínimo 4 caracteres').max(72).optional(),
  })
  .refine((d) => d.nombre !== undefined || d.usuario !== undefined || d.passwordNueva !== undefined, {
    message: 'sin cambios',
  })
  .refine((d) => !d.passwordNueva || Boolean(d.passwordActual), {
    message: 'indica tu clave actual para cambiarla',
    path: ['passwordActual'],
  });

export const plantilla = z.object({ nombre: z.string().trim().min(1, 'el nombre es obligatorio').max(60, 'máximo 60 caracteres'), tramos });

export const turno = z.object({
  empleadaId: uuid,
  fecha,
  tramos,
  plantillaId: uuid.nullish().transform((v) => v ?? null),
  avisosIgnorados: z.array(z.string().max(40)).max(20).default([]),
});

export const registro = z.object({
  id: uuid.optional(),
  tramos,
  nota: notaOpcional,
  estado: z.enum(ESTADOS_REGISTRO),
});

const reglaActivaValor = (max) => z.object({ activa: z.boolean(), valor: z.number().min(0).max(max) });
export const reglas = z
  .object({
    apertura: z.object({ desde: minuto, hasta: minuto }),
    franjaVacia: z.boolean(),
    minPersonas: z.object({ activa: z.boolean(), desde: minuto, hasta: minuto, valor: z.number().int().min(1).max(50) }),
    maxHorasDia: reglaActivaValor(24),
    maxHorasSemana: reglaActivaValor(168),
    diaLibre: z.boolean(),
    descansoSeguido: z.boolean(),
  })
  .refine((r) => r.apertura.hasta > r.apertura.desde, { message: 'el cierre debe ser posterior a la apertura', path: ['apertura'] })
  .refine((r) => r.minPersonas.hasta > r.minPersonas.desde, { message: 'franja de mínimo de personas no válida', path: ['minPersonas'] });

/** PATCH de reglas: claves de primer nivel opcionales; se valida el resultado completo tras fusionar. */
export const reglasParcial = z.record(z.unknown()).refine((o) => Object.keys(o).length > 0, 'sin cambios');

export const ajustes = z.object({
  recargoDomingoPct: porcentaje,
  recargoFestivoPct: porcentaje,
  festivos: z
    .array(fecha)
    .max(200)
    .transform((f) => [...new Set(f)].sort()),
});
export const ajustesParcial = ajustes.partial().refine((o) => Object.keys(o).length > 0, 'sin cambios');

// ── Parámetros y acciones ──────────────────────────────────────────────────
export const idParams = z.object({ id: uuid });
export const lunesParams = z.object({ lunes });
export const registroParams = z.object({ empleadaId: uuid, fecha });

export const rangoQuery = z
  .object({ desde: fecha.optional(), hasta: fecha.optional() })
  .refine((q) => !q.desde || !q.hasta || q.hasta >= q.desde, 'hasta debe ser posterior a desde');

const periodo = z
  .object({ inicio: fecha, fin: fecha })
  .refine((p) => p.fin >= p.inicio, 'fin debe ser posterior a inicio')
  .refine((p) => diasEntre(p.inicio, p.fin) < MAX_DIAS_PERIODO, `periodo de ${MAX_DIAS_PERIODO} días como máximo`);
export const periodoQuery = periodo;

export const pagarPeriodo = z
  .object({ id: uuid.optional(), inicio: fecha, fin: fecha, etiqueta: z.string().trim().min(1).max(60) })
  .and(periodo);

export const moverTurno = z.object({ empleadaId: uuid, fecha, duplicar: z.boolean().default(false), nuevoId: uuid.optional() });
export const turnoDesdePlantilla = z.object({ id: uuid.optional(), plantillaId: uuid, empleadaId: uuid, fecha });
export const publicarSemana = z.object({ publicada: z.boolean() });
export const confirmarDia = z.object({ fecha, empleadaIds: z.array(uuid).min(1).max(100) });

// ── Sincronización (deshacer) ──────────────────────────────────────────────
const coleccion = (item, clave = uuid) =>
  z.object({ upsert: z.array(item).max(MAX_LOTE).default([]), delete: z.array(clave).max(MAX_LOTE).default([]) }).optional();

const conId = (schema) => schema.extend({ id: uuid });
const lineaPago = z.object({
  empleadaId: uuid,
  minutos: z.number().int().min(0),
  tarifaCent: z.number().int().min(0).default(0),
  recargosCent: z.number().int().min(0).default(0),
  importeCent: z.number().int().min(0),
});

export const sync = z.object({
  empleadas: coleccion(conId(empleada.omit({ password: true, quitarAcceso: true }))),
  plantillas: coleccion(conId(plantilla)),
  semanas: coleccion(z.object({ lunes, publicada: z.boolean() }), lunes),
  turnos: coleccion(conId(turno)),
  registros: coleccion(conId(registro.omit({ id: true }).extend({ empleadaId: uuid, fecha }))),
  pagos: coleccion(
    z.object({
      id: uuid,
      inicio: fecha,
      fin: fecha,
      etiqueta: z.string().trim().min(1).max(60),
      pagadoEn: z.string().datetime({ offset: true }),
      totalCent: z.number().int().min(0),
      lineas: z.array(lineaPago).max(500),
    }),
  ),
  reglas: reglas.optional(),
  ajustes: ajustes.optional(),
});
