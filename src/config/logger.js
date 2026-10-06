const NIVELES = { debug: 10, info: 20, warn: 30, error: 40 };
const minimo = NIVELES[process.env.LOG_LEVEL] ?? (process.env.NODE_ENV === 'test' ? NIVELES.warn : NIVELES.info);

function log(nivel, mensaje, extra) {
  if (NIVELES[nivel] < minimo) return;
  const linea = `${new Date().toISOString()} ${nivel.toUpperCase().padEnd(5)} ${mensaje}`;
  const salida = nivel === 'error' ? console.error : nivel === 'warn' ? console.warn : console.log;
  extra === undefined ? salida(linea) : salida(linea, extra);
}

export const logger = {
  debug: (m, e) => log('debug', m, e),
  info: (m, e) => log('info', m, e),
  warn: (m, e) => log('warn', m, e),
  error: (m, e) => log('error', m, e),
};
