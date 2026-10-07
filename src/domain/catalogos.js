/** Valores cerrados compartidos con el frontend (src/lib/types.ts). */
export const COLORES = Object.freeze(['rosa', 'morado', 'turq', 'naranja', 'azul', 'verde', 'ambar', 'rojo', 'indigo', 'gris']);
export const ROLES = Object.freeze(['Empleada', 'Jefa']);
export const ESTADOS_REGISTRO = Object.freeze(['previsto', 'confirmado']);

/** Reglas de aviso por defecto (las del diseño: 10 h/día, 40 h/semana, 2 personas 09:00–13:00). */
export const TIPOS_FICHAJE = Object.freeze(['entrada', 'salida']);
export const ORIGENES_REGISTRO = Object.freeze(['manual', 'fichaje']);

/** Fichaje: la geocerca viene desactivada; el encargado la activa y fija la ubicación en Ajustes. */
export const ORIGENES_FICHAJE = Object.freeze(['empleada', 'encargado', 'automatico']);
export const POLITICAS_SIN_VERIFICAR = Object.freeze(['revisar', 'bloquear']);
export const FICHAJE_POR_DEFECTO = Object.freeze({
  geocerca: { activa: false, latitud: null, longitud: null, radioM: 150 },
  red: { activa: false, ips: [] },
  /** Sin GPS ni Wi-Fi: 'revisar' deja fichar y lo marca; 'bloquear' no deja. */
  sinVerificar: 'revisar',
  /** Un fichaje abierto más de estas horas se cierra solo (olvidó fichar la salida). */
  cierreAutomaticoHoras: 10,
});

export const REGLAS_POR_DEFECTO = Object.freeze({
  apertura: { desde: 400, hasta: 1260 },
  franjaVacia: true,
  minPersonas: { activa: true, desde: 540, hasta: 780, valor: 2 },
  maxHorasDia: { activa: true, valor: 10 },
  maxHorasSemana: { activa: true, valor: 40 },
  diaLibre: true,
  descansoSeguido: true,
});
