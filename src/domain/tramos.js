/** Un tramo es una franja continua dentro de un día, en minutos desde las 00:00 (400 = 06:40). */
export const MINUTOS_DIA = 1440;
export const MAX_TRAMOS = 2;

export const minutosDe = (tramos = []) => tramos.reduce((total, t) => total + (t.fin - t.inicio), 0);

/** Misma regla que `tramosValidos` del frontend, más límites del día. Sin turnos que crucen medianoche. */
export function tramosValidos(tramos) {
  if (!Array.isArray(tramos) || tramos.length === 0 || tramos.length > MAX_TRAMOS) return false;
  const enRango = tramos.every(
    (t) => Number.isInteger(t?.inicio) && Number.isInteger(t?.fin) && t.inicio >= 0 && t.fin <= MINUTOS_DIA && t.fin > t.inicio,
  );
  return enRango && (tramos.length < 2 || tramos[1].inicio >= tramos[0].fin);
}
