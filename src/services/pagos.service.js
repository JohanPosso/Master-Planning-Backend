import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { hoyEn } from '../domain/fechas.js';
import { calcularPeriodo } from '../domain/nomina.js';
import { Empleada, LineaPago, PeriodoPago, Registro, Turno } from '../models/index.js';
import { toPago } from '../serializers.js';
import { conflict, notFound } from '../utils/errors.js';
import { obtenerAjustes } from './configuracion.service.js';

const plano = (filas) => filas.map((f) => f.get({ plain: true }));
const lineasInclude = [{ association: 'lineas' }];

export async function listarPagos() {
  const filas = await PeriodoPago.findAll({ include: lineasInclude, order: [['inicio', 'DESC']] });
  return filas.map(toPago);
}

export async function calcularNomina({ inicio, fin, empleadaIds }, transaction) {
  const enRango = { fecha: { [Op.between]: [inicio, fin] } };
  const whereEmp = empleadaIds?.length ? { id: { [Op.in]: empleadaIds } } : undefined;
  const empleadas = await Empleada.findAll({ where: whereEmp, transaction });
  const turnos = await Turno.findAll({ where: enRango, attributes: ['empleadaId', 'fecha', 'tramos'], transaction });
  const registros = await Registro.findAll({ where: enRango, attributes: ['empleadaId', 'fecha', 'tramos', 'estado'], transaction });
  const ajustes = await obtenerAjustes(transaction);
  return calcularPeriodo({ empleadas: plano(empleadas), turnos: plano(turnos), registros: plano(registros), ajustes, inicio, fin });
}

/** Marca un periodo como pagado. Con `empleadaIds` solo liquida a esas empleadas (adelanto / pago individual). */
export function pagarPeriodo({ id, inicio, fin, etiqueta, empleadaIds }) {
  return sequelize.transaction(async (transaction) => {
    if (inicio > hoyEn(env.timezone)) throw conflict('No se puede pagar un periodo que aún no ha empezado');

    const nomina = await calcularNomina({ inicio, fin, empleadaIds }, transaction);
    if (nomina.pendientes.length) {
      throw conflict('Confirma antes todas las horas del periodo', { pendientes: nomina.pendientes });
    }

    const lineas = nomina.lineas
      .filter((l) => !l.excluida && l.minutos > 0)
      .map(({ empleadaId, minutos, tarifaCent, recargosCent, importeCent }) => ({ empleadaId, minutos, tarifaCent, recargosCent, importeCent }));

    if (!lineas.length) throw conflict('No hay horas que pagar en este periodo');

    const ids = lineas.map((l) => l.empleadaId);
    const solapado = await PeriodoPago.findOne({
      where: { inicio: { [Op.lte]: fin }, fin: { [Op.gte]: inicio } },
      include: [{ association: 'lineas', where: { empleadaId: { [Op.in]: ids } }, required: true }],
      transaction,
    });
    if (solapado) throw conflict(`El periodo se solapa con «${solapado.etiqueta}», que ya está pagado`);

    const totalCent = lineas.reduce((a, l) => a + l.importeCent, 0);
    const pago = await PeriodoPago.create(
      { id: id ?? randomUUID(), inicio, fin, etiqueta, pagadoEn: new Date(), totalCent },
      { transaction },
    );
    const filas = await LineaPago.bulkCreate(lineas.map((l) => ({ ...l, periodoId: pago.id })), { transaction });
    return toPago({ ...pago.get({ plain: true }), lineas: filas });
  });
}

export async function eliminarPago(id) {
  const borrados = await PeriodoPago.destroy({ where: { id } });
  if (!borrados) throw notFound('Pago');
}
