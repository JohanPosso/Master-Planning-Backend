import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Adelanto, Empleada } from '../models/index.js';
import { toAdelanto } from '../serializers.js';
import { AppError, conflict, notFound } from '../utils/errors.js';
import { registrarMovimiento } from './auditoria.service.js';

export async function listarAdelantos({ soloPendientes = false } = {}) {
  const where = soloPendientes ? { saldoCent: { [Op.gt]: 0 } } : undefined;
  const filas = await Adelanto.findAll({ where, order: [['createdAt', 'DESC']] });
  return filas.map((f) => toAdelanto(f.get({ plain: true })));
}

export function crearAdelanto({ id, empleadaId, montoCent, nota }) {
  return sequelize.transaction(async (transaction) => {
    if (!Number.isInteger(montoCent) || montoCent <= 0) {
      throw new AppError(400, 'VALIDATION', 'El monto debe ser mayor que 0');
    }
    const emp = await Empleada.findByPk(empleadaId, { transaction });
    if (!emp || emp.eliminadaEn) throw notFound('Empleada');
    if (emp.excluirNomina) throw conflict('Esta empleada está excluida de la nómina');

    const fila = await Adelanto.create(
      {
        id: id ?? randomUUID(),
        empleadaId,
        montoCent,
        saldoCent: montoCent,
        nota: nota?.trim() || null,
      },
      { transaction },
    );
    const out = toAdelanto(fila.get({ plain: true }));
    await registrarMovimiento(
      {
        tipo: 'adelanto.crear',
        entidad: 'adelanto',
        entidadId: fila.id,
        empleadaId,
        resumen: `Adelanto a ${emp.nombre} · ${(montoCent / 100).toFixed(2)} €`,
        detalle: { montoCent, nota: out.nota },
      },
      { transaction },
    );
    return out;
  });
}

/** Solo si no se ha aplicado nada (saldo intacto). */
export async function eliminarAdelanto(id) {
  return sequelize.transaction(async (transaction) => {
    const fila = await Adelanto.findByPk(id, { transaction });
    if (!fila) throw notFound('Adelanto');
    if (fila.saldoCent !== fila.montoCent) {
      throw conflict('Este adelanto ya se descontó en una liquidación; no se puede borrar');
    }
    const plain = fila.get({ plain: true });
    await fila.destroy({ transaction });
    await registrarMovimiento(
      {
        tipo: 'adelanto.borrar',
        entidad: 'adelanto',
        entidadId: id,
        empleadaId: plain.empleadaId,
        resumen: `Adelanto anulado · ${(plain.montoCent / 100).toFixed(2)} €`,
        detalle: { montoCent: plain.montoCent },
      },
      { transaction },
    );
  });
}

/**
 * Resta adelantos pendientes (FIFO por empleada) hasta el importe de cada línea.
 * Devuelve el total descontado y las filas actualizadas.
 */
export async function aplicarAdelantosALineas(lineas, transaction) {
  let totalDescontado = 0;
  const actualizados = [];
  const aplicaciones = [];

  for (const linea of lineas) {
    let resto = linea.importeCent;
    if (resto <= 0) continue;

    const pendientes = await Adelanto.findAll({
      where: { empleadaId: linea.empleadaId, saldoCent: { [Op.gt]: 0 } },
      order: [['createdAt', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    for (const adelanto of pendientes) {
      if (resto <= 0) break;
      const aplica = Math.min(adelanto.saldoCent, resto);
      adelanto.saldoCent -= aplica;
      await adelanto.save({ transaction });
      resto -= aplica;
      totalDescontado += aplica;
      actualizados.push(toAdelanto(adelanto.get({ plain: true })));
      aplicaciones.push({ adelantoId: adelanto.id, empleadaId: linea.empleadaId, montoCent: aplica });
    }
  }

  if (aplicaciones.length) {
    await registrarMovimiento(
      {
        tipo: 'adelanto.aplicar',
        resumen: `Descuento de adelantos · ${(totalDescontado / 100).toFixed(2)} €`,
        detalle: { totalCent: totalDescontado, aplicaciones },
      },
      { transaction },
    );
  }

  return { adelantoDescontadoCent: totalDescontado, adelantos: actualizados };
}
