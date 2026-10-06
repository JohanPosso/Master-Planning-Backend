import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Turno tipo que se arrastra desde el panel del horario. */
export const Plantilla = sequelize.define(
  'Plantilla',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    nombre: { type: DataTypes.STRING(60), allowNull: false },
    tramos: { type: DataTypes.JSONB, allowNull: false },
    orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'plantillas' },
);
