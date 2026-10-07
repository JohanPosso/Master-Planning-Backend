/**
 * Fuente única de «ahora» para el fichaje. En producción es el reloj del servidor;
 * los tests lo fijan para simular una jornada (entrada a las 08:00, salida a las 12:00…).
 */
export const reloj = {
  ahora: () => new Date(),
};
