import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Rango liquidado. Al pagarse queda congelado junto con sus líneas. */
export const PeriodoPago = sequelize.define(
  'PeriodoPago',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    inicio: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
    fin: { type: DataTypes.DATEONLY, allowNull: false },
    etiqueta: { type: DataTypes.STRING(60), allowNull: false },
    pagadoEn: { type: DataTypes.DATE, allowNull: false },
    totalCent: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'periodos_pago' },
);
