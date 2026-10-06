import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export const Festivo = sequelize.define(
  'Festivo',
  {
    fecha: { type: DataTypes.DATEONLY, primaryKey: true },
    nombre: { type: DataTypes.STRING(80), allowNull: true },
  },
  { tableName: 'festivos' },
);
