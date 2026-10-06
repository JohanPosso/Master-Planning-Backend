import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { REGLAS_POR_DEFECTO } from '../domain/catalogos.js';
import { hoyEn, sumarDias, diaSemana } from '../domain/fechas.js';
import { Configuracion, Empleada, Festivo, ID_CONFIGURACION, Plantilla, Registro, Turno } from '../models/index.js';

/** Datos de ejemplo: el equipo real de la cafetería y 10 semanas de horario (antes vivían en el frontend). */
const T = (a, b) => {
  const min = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
  return { inicio: min(a), fin: min(b) };
};
const AP = [T('06:40', '12:00')];
const APF = [T('06:40', '13:40')];
const JE = [T('09:00', '21:00')];

const EQUIPO = [
  { clave: 'val', nombre: 'Valentina', rol: 'Jefa', color: 'rosa', diasDescanso: [6], excluirNomina: true },
  { clave: 'sil', nombre: 'Silvia', rol: 'Empleada', color: 'morado', diasDescanso: [3, 4], descansoSeguido: true },
  { clave: 'dul', nombre: 'Dulce', rol: 'Empleada', color: 'turq', diasDescanso: [2] },
  { clave: 'car', nombre: 'Carolina', rol: 'Empleada', color: 'naranja', diasDescanso: [6] },
];

/** Patrón semanal (lunes → domingo; null = descanso). */
const PATRON = {
  val: [JE, JE, JE, JE, JE, JE, null],
  sil: [AP, AP, AP, null, null, APF, APF],
  dul: [[T('09:30', '13:00')], [T('09:00', '12:00'), T('18:00', '20:00')], null, AP, AP, [T('18:00', '20:00')], [T('09:30', '13:00')]],
  car: [[T('18:00', '20:00')], [T('09:30', '13:00')], [T('09:00', '12:00'), T('18:00', '20:00')], [T('09:30', '13:00')], [T('10:35', '12:00'), T('18:00', '20:00')], [T('09:00', '13:00')], null],
};

const PLANTILLAS = [
  ['Apertura', AP],
  ['Apertura fin de semana', APF],
  ['Jefa', JE],
  ['Mañana', [T('09:00', '12:00')]],
  ['Mañana larga', [T('09:30', '13:00')]],
  ['Refuerzo de tarde', [T('18:00', '20:00')]],
  ['Partido', [T('09:30', '11:00'), T('18:00', '20:00')]],
];

const FESTIVOS = [
  ['2026-10-12', 'Fiesta Nacional de España'],
  ['2026-11-01', 'Todos los Santos'],
  ['2026-12-06', 'Día de la Constitución'],
  ['2026-12-08', 'Inmaculada Concepción'],
  ['2026-12-25', 'Navidad'],
  ['2027-01-01', 'Año Nuevo'],
  ['2027-01-06', 'Epifanía del Señor'],
];

export function construirDatos(hoy = hoyEn(env.timezone)) {
  const ahora = Date.now();
  const empleadas = EQUIPO.map(({ clave, ...e }, i) => ({
    id: randomUUID(),
    clave,
    tarifaCent: 1000,
    descansoSeguido: false,
    excluirNomina: false,
    activa: true,
    ...e,
    createdAt: new Date(ahora + i), // conserva el orden del equipo en la UI
  }));
  const plantillas = PLANTILLAS.map(([nombre, tramos], orden) => ({ id: randomUUID(), nombre, tramos, orden }));

  const lunesActual = sumarDias(hoy, -diaSemana(hoy));
  const turnos = [];
  const registros = [];
  for (let w = -9; w <= 0; w++) {
    const lunes = sumarDias(lunesActual, w * 7);
    empleadas.forEach((e, ei) =>
      PATRON[e.clave].forEach((tramos, i) => {
        if (!tramos) return;
        const fecha = sumarDias(lunes, i);
        turnos.push({ id: randomUUID(), empleadaId: e.id, fecha, tramos });
        if (fecha >= hoy) return;
        const extra = (Math.abs(w) * 7 + i + ei * 3) % 9 === 0;
        registros.push({
          id: randomUUID(),
          empleadaId: e.id,
          fecha,
          estado: 'confirmado',
          tramos: extra ? tramos.map((t, k) => (k === tramos.length - 1 ? { ...t, fin: t.fin + 30 } : t)) : tramos,
          nota: extra ? 'Se quedó 30 min más por inventario' : null,
        });
      }),
    );
  }
  return { empleadas: empleadas.map(({ clave: _clave, ...e }) => e), plantillas, turnos, registros };
}

const TABLAS = 'lineas_pago, periodos_pago, registros, turnos, semanas, plantillas, festivos, empleadas';

export async function seed({ force = false } = {}) {
  await sequelize.transaction(async (transaction) => {
    if (force) await sequelize.query(`TRUNCATE ${TABLAS} CASCADE`, { transaction });
    else if (await Empleada.count({ transaction })) {
      logger.info('La base de datos ya tiene datos; usa --force para reiniciarla.');
      return;
    }
    const datos = construirDatos();
    await Empleada.bulkCreate(datos.empleadas, { transaction });
    await Plantilla.bulkCreate(datos.plantillas, { transaction });
    await Turno.bulkCreate(datos.turnos, { transaction });
    await Registro.bulkCreate(datos.registros, { transaction });
    await Festivo.bulkCreate(FESTIVOS.map(([fecha, nombre]) => ({ fecha, nombre })), { transaction });
    await Configuracion.upsert(
      { id: ID_CONFIGURACION, reglas: REGLAS_POR_DEFECTO, recargoDomingoPct: 0, recargoFestivoPct: 25 },
      { transaction },
    );
    logger.info(`Seed: ${datos.empleadas.length} empleadas, ${datos.turnos.length} turnos, ${datos.registros.length} registros.`);
  });
}

const esScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (esScript) {
  seed({ force: process.argv.includes('--force') })
    .then(() => sequelize.close())
    .catch(async (err) => {
      logger.error('Error en el seed', err);
      await sequelize.close();
      process.exit(1);
    });
}
