import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Dinero adelantado a una empleada; el saldo se resta al liquidar horas. */
export const Adelanto = sequelize.define(
  'Adelanto',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    empleadaId: { type: DataTypes.UUID, allowNull: false },
    montoCent: { type: DataTypes.INTEGER, allowNull: false },
    saldoCent: { type: DataTypes.INTEGER, allowNull: false },
    nota: { type: DataTypes.STRING(120), allowNull: true },
  },
  { tableName: 'adelantos' },
);
