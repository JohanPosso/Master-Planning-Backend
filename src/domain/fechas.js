/**
 * Fechas de calendario como texto ISO (YYYY-MM-DD), sin zona horaria, igual que en el frontend.
 * Toda la aritmética se hace en UTC para que el cambio de hora no desplace días.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const aUtc = (fecha) => new Date(`${fecha}T00:00:00Z`);

export function esFechaIso(valor) {
  if (typeof valor !== 'string' || !ISO.test(valor)) return false;
  const d = aUtc(valor);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

export function sumarDias(fecha, dias) {
  const d = aUtc(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 0 = lunes … 6 = domingo (la semana empieza en lunes). */
export const diaSemana = (fecha) => (aUtc(fecha).getUTCDay() + 6) % 7;
export const esLunes = (fecha) => diaSemana(fecha) === 0;
export const esDomingo = (fecha) => diaSemana(fecha) === 6;
export const lunesDeIso = (fecha) => sumarDias(fecha, -diaSemana(fecha));

export const diasEntre = (inicio, fin) => Math.round((aUtc(fin) - aUtc(inicio)) / 86_400_000);

/** Fechas desde `inicio` hasta `fin`, ambas incluidas. */
export function rangoFechas(inicio, fin) {
  const total = diasEntre(inicio, fin);
  return Array.from({ length: Math.max(total + 1, 0) }, (_, i) => sumarDias(inicio, i));
}

/** «Hoy» en la zona horaria del negocio, no la del servidor. */
export function hoyEn(timeZone, ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}
