import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Estado de publicación de una semana del horario (clave: su lunes). */
export const Semana = sequelize.define(
  'Semana',
  {
    lunes: { type: DataTypes.DATEONLY, primaryKey: true },
    publicada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    publicadaEn: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'semanas' },
);
