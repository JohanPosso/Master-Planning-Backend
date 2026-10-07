import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Fila única (id = 1) con las reglas de aviso y los recargos. */
export const Configuracion = sequelize.define(
  'Configuracion',
  {
    id: { type: DataTypes.SMALLINT, primaryKey: true, defaultValue: 1 },
    reglas: { type: DataTypes.JSONB, allowNull: false },
    fichaje: { type: DataTypes.JSONB, allowNull: false },
    recargoDomingoPct: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    recargoFestivoPct: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'configuracion' },
);

export const ID_CONFIGURACION = 1;
