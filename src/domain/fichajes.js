/**
 * Lógica pura del fichaje (sin BD). Un fichaje es { tipo: 'entrada' | 'salida', minuto, marca }:
 * `minuto` son minutos desde las 00:00 en la zona del negocio y `marca` el instante exacto (orden).
 */
import { MAX_TRAMOS } from './tramos.js';

/** Fecha (YYYY-MM-DD) y minuto del día de un instante en una zona horaria. */
export function ahoraEn(timeZone, instante = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, minuto: (Number(partes.hour) % 24) * 60 + Number(partes.minute) };
}

const ordenar = (fichajes) => [...fichajes].sort((a, b) => new Date(a.marca) - new Date(b.marca));

/** Lo que toca fichar ahora: tras una entrada, la salida; en cualquier otro caso, la entrada. */
export function siguienteTipo(fichajesDelDia) {
  return ordenar(fichajesDelDia).at(-1)?.tipo === 'entrada' ? 'salida' : 'entrada';
}

/**
 * Empareja entradas y salidas del día. Una salida sin entrada previa se ignora; una entrada sin salida
 * queda `abierta` (está trabajando, o se le olvidó fichar la salida).
 */
export function estadoDia(fichajesDelDia) {
  const pares = [];
  let abierta = null;
  for (const f of ordenar(fichajesDelDia)) {
    if (f.tipo === 'entrada') abierta ??= f.minuto;
    else if (abierta !== null) {
      if (f.minuto > abierta) pares.push({ inicio: abierta, fin: f.minuto });
      abierta = null;
    }
  }
  return { pares, abierta, dentro: abierta !== null, minutos: pares.reduce((t, p) => t + p.fin - p.inicio, 0) };
}

/**
 * Convierte los pares fichados en tramos de registro (máx. 2). Si hay más, une los huecos más cortos
 * —contando ese hueco como trabajado— y lo indica para que el encargado lo revise.
 */
export function tramosDesdePares(pares) {
  // Salir y volver a entrar en el mismo minuto es un único tramo.
  const tramos = [];
  for (const p of pares) {
    const ultimo = tramos.at(-1);
    if (ultimo && p.inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, p.fin);
    else tramos.push({ ...p });
  }
  const unificados = tramos.length > MAX_TRAMOS;
  while (tramos.length > MAX_TRAMOS) {
    let menor = 0;
    for (let i = 1; i < tramos.length - 1; i++) {
      if (tramos[i + 1].inicio - tramos[i].fin < tramos[menor + 1].inicio - tramos[menor].fin) menor = i;
    }
    tramos.splice(menor, 2, { inicio: tramos[menor].inicio, fin: tramos[menor + 1].fin });
  }
  return { tramos, unificados };
}

const RADIO_TIERRA_M = 6_371_000;
const rad = (g) => (g * Math.PI) / 180;

/** Distancia en metros entre dos coordenadas (fórmula del haversine). */
export function distanciaMetros(a, b) {
  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(h));
}

/** Margen máximo que se concede por la imprecisión del GPS del móvil. */
export const MARGEN_PRECISION_MAX_M = 100;

/**
 * ¿Está dentro de la geocerca? Se descuenta la precisión declarada por el dispositivo (con tope)
 * para no rechazar a quien está en la puerta con un GPS impreciso.
 */
export function dentroDeGeocerca(geocerca, ubicacion) {
  const distancia = Math.round(distanciaMetros(geocerca, ubicacion));
  const margen = Math.min(Math.max(ubicacion.precisionM ?? 0, 0), MARGEN_PRECISION_MAX_M);
  return { dentro: distancia - margen <= geocerca.radioM, distancia };
}
