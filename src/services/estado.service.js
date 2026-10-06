import { obtenerAjustes, obtenerReglas } from './configuracion.service.js';
import { listarEmpleadas } from './empleadas.service.js';
import { listarPagos } from './pagos.service.js';
import { listarPlantillas } from './plantillas.service.js';
import { listarRegistros } from './registros.service.js';
import { listarSemanas } from './semanas.service.js';
import { listarTurnos } from './turnos.service.js';

/** Estado completo con la misma forma que `State` del frontend (carga inicial y resincronización). */
export async function obtenerEstado() {
  const [empleadas, plantillas, turnos, registros, pagos, semanas, reglas, ajustes] = await Promise.all([
    listarEmpleadas(),
    listarPlantillas(),
    listarTurnos(),
    listarRegistros(),
    listarPagos(),
    listarSemanas(),
    obtenerReglas(),
    obtenerAjustes(),
  ]);
  return { version: 1, empleadas, plantillas, turnos, registros, pagos, semanas, reglas, ajustes };
}
