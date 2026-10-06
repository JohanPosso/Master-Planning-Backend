import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Foto fija por empleada: no cambia aunque luego cambie su tarifa. */
export const LineaPago = sequelize.define(
  'LineaPago',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    periodoId: { type: DataTypes.UUID, allowNull: false },
    empleadaId: { type: DataTypes.UUID, allowNull: false },
    minutos: { type: DataTypes.INTEGER, allowNull: false },
    tarifaCent: { type: DataTypes.INTEGER, allowNull: false },
    recargosCent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    importeCent: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'lineas_pago' },
);
