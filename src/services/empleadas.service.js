import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { hoyEn } from '../domain/fechas.js';
import { Empleada, Turno } from '../models/index.js';
import { toEmpleada } from '../serializers.js';
import { conflict, notFound } from '../utils/errors.js';
import { upsertById } from '../utils/repository.js';
import { hashPassword, usuarioDisponible } from './auth.service.js';

export async function listarEmpleadas() {
  const filas = await Empleada.findAll({ order: [['createdAt', 'ASC'], ['nombre', 'ASC']] });
  return filas.map(toEmpleada);
}

export function guardarEmpleada(id, datos) {
  return sequelize.transaction(async (transaction) => {
    const { password, quitarAcceso, usuario, ...resto } = datos;
    const existente = await Empleada.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    const valores = { ...resto };

    if (quitarAcceso) {
      valores.usuario = null;
      valores.passwordHash = null;
    } else {
      if (usuario !== undefined) {
        await usuarioDisponible(usuario, { exceptEmpleadaId: id });
        valores.usuario = usuario;
      }
      if (password) {
        const userFinal = usuario !== undefined ? usuario : existente?.usuario;
        if (!userFinal) throw conflict('Asigna un usuario antes de poner el PIN');
        valores.passwordHash = await hashPassword(password);
      }
    }

    const { instancia, creado } = await upsertById(Empleada, id, valores, { transaction });
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
