import { env } from '../config/env.js';
import { hoyEn, sumarDias } from '../domain/fechas.js';
import { obtenerAjustes, obtenerFichajeConfig, obtenerReglas } from './configuracion.service.js';
import { DIAS_FICHAJES_EN_ESTADO, listarFichajes } from './fichajes.service.js';
import { listarEmpleadas } from './empleadas.service.js';
import { listarPagos } from './pagos.service.js';
import { listarPlantillas } from './plantillas.service.js';
import { listarRegistros } from './registros.service.js';
import { listarSemanas } from './semanas.service.js';
import { listarTurnos } from './turnos.service.js';

/** Estado completo con la misma forma que `State` del frontend (carga inicial y resincronización). */
export async function obtenerEstado() {
  const desdeFichajes = sumarDias(hoyEn(env.timezone), -DIAS_FICHAJES_EN_ESTADO);
  const [empleadas, plantillas, turnos, registros, pagos, semanas, reglas, ajustes, fichajes, fichaje] = await Promise.all([
    listarEmpleadas(),
    listarPlantillas(),
    listarTurnos(),
    listarRegistros(),
    listarPagos(),
    listarSemanas(),
    obtenerReglas(),
    obtenerAjustes(),
    listarFichajes({ desde: desdeFichajes }),
    obtenerFichajeConfig(),
  ]);
  return { version: 1, empleadas, plantillas, turnos, registros, pagos, semanas, reglas, ajustes, fichajes, fichaje };
}
