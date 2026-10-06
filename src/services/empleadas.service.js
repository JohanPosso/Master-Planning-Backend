import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { hoyEn } from '../domain/fechas.js';
import { Empleada, Turno } from '../models/index.js';
import { toEmpleada } from '../serializers.js';
import { conflict, notFound } from '../utils/errors.js';
import { upsertById } from '../utils/repository.js';
import { hashPassword, normalizarUsuario, usuarioDisponible } from './auth.service.js';

const CAMPOS_FICHA = [
  'nombre',
  'rol',
  'color',
  'tarifaCent',
  'diasDescanso',
  'descansoSeguido',
  'excluirNomina',
  'activa',
  'eliminadaEn',
];

function fichaDe(datos) {
  return Object.fromEntries(CAMPOS_FICHA.filter((k) => datos[k] !== undefined).map((k) => [k, datos[k]]));
}

export async function listarEmpleadas() {
  const filas = await Empleada.findAll({ order: [['createdAt', 'ASC'], ['nombre', 'ASC']] });
  return filas.map(toEmpleada);
}

export function guardarEmpleada(id, datos) {
  return sequelize.transaction(async (transaction) => {
    const { password, quitarAcceso, usuario } = datos;
    const existente = await Empleada.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    const valores = fichaDe(datos);

    if (quitarAcceso) {
      valores.usuario = null;
      valores.passwordHash = null;
    } else {
      const usuarioNorm = usuario !== undefined ? (usuario ? normalizarUsuario(usuario) : null) : undefined;
      if (usuarioNorm !== undefined) {
        await usuarioDisponible(usuarioNorm, { exceptEmpleadaId: id });
        valores.usuario = usuarioNorm;
      }
      if (password) {
        const userFinal = usuarioNorm !== undefined ? usuarioNorm : existente?.usuario;
        if (!userFinal) throw conflict('Asigna un usuario antes de poner el PIN');
        valores.passwordHash = await hashPassword(password);
        if (usuarioNorm !== undefined) valores.usuario = usuarioNorm;
      }
    }

    const { instancia, creado } = await upsertById(Empleada, id, valores, { transaction });
    await instancia.reload({ transaction });
    return { empleada: toEmpleada(instancia), creado };
  });
}

/** Borrado lógico: conserva horas y quita turnos desde hoy. */
export function eliminarEmpleada(id) {
  return sequelize.transaction(async (transaction) => {
    const empleada = await Empleada.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!empleada) throw notFound('Empleada');
    const hoy = hoyEn(env.timezone);
    await empleada.update(
      { eliminadaEn: empleada.eliminadaEn ?? hoy, activa: false, usuario: null, passwordHash: null },
      { transaction },
    );
    const turnosEliminados = await Turno.destroy({ where: { empleadaId: id, fecha: { [Op.gte]: hoy } }, transaction });
    return { empleada: toEmpleada(empleada), turnosEliminados };
  });
}
