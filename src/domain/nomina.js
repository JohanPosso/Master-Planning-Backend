import { esDomingo, rangoFechas } from './fechas.js';
import { minutosDe } from './tramos.js';

/**
 * Cálculo de nómina. Réplica de `calcularPeriodo` / `importeDia` del frontend (Nomina.tsx, rules.ts)
 * para que el servidor sea la fuente de verdad al marcar un periodo como pagado.
 */
export function importeDia({ tarifaCent, fecha, minutos, ajustes, festivos = new Set(ajustes.festivos) }) {
  const pct = festivos.has(fecha) ? ajustes.recargoFestivoPct : esDomingo(fecha) ? ajustes.recargoDomingoPct : 0;
  const base = (minutos / 60) * tarifaCent;
  return { base, recargo: (base * pct) / 100 };
}

const clave = (empleadaId, fecha) => `${empleadaId}|${fecha}`;
const indexar = (filas, fechas) => new Map(filas.filter((f) => fechas.has(f.fecha)).map((f) => [clave(f.empleadaId, f.fecha), f]));
const sumar = (lineas, campo) => lineas.reduce((total, l) => total + l[campo], 0);

/**
 * Lo trabajado es el registro si existe; si no, lo planificado (estimación).
 * Un día con horas cuyo registro no está confirmado queda «pendiente» y bloquea el pago.
 * Importes en céntimos enteros; el total es la suma de líneas ya redondeadas (cuadra al céntimo).
 */
export function calcularPeriodo({ empleadas, turnos, registros, ajustes, inicio, fin }) {
  const fechas = rangoFechas(inicio, fin);
  const enRango = new Set(fechas);
  const festivos = new Set(ajustes.festivos);
  const registroDe = indexar(registros, enRango);
  const turnoDe = indexar(turnos, enRango);
  const pendientes = new Set();

  const lineas = empleadas
    .filter((e) => !e.eliminadaEn || fechas.some((f) => registroDe.has(clave(e.id, f))))
    .map((e) => {
      let minutos = 0;
      let base = 0;
      let recargo = 0;
      for (const fecha of fechas) {
        const registro = registroDe.get(clave(e.id, fecha));
        const m = minutosDe(registro?.tramos ?? turnoDe.get(clave(e.id, fecha))?.tramos);
        if (!m) continue;
        if (registro?.estado !== 'confirmado') pendientes.add(fecha);
        minutos += m;
        const dia = importeDia({ tarifaCent: e.tarifaCent, fecha, minutos: m, ajustes, festivos });
        base += dia.base;
        recargo += dia.recargo;
      }
      return {
        empleadaId: e.id,
        minutos,
        tarifaCent: e.tarifaCent,
        recargosCent: Math.round(recargo),
        importeCent: e.excluirNomina ? 0 : Math.round(base + recargo),
        excluida: e.excluirNomina,
        activa: e.activa,
      };
    })
    .filter((l) => l.minutos > 0 || l.activa);

  const pagables = lineas.filter((l) => !l.excluida);
  return {
    inicio,
    fin,
    lineas,
    pendientes: [...pendientes].sort(),
    minutos: sumar(pagables, 'minutos'),
    recargosCent: sumar(pagables, 'recargosCent'),
    totalCent: sumar(pagables, 'importeCent'),
  };
}
