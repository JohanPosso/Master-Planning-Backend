import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Lo planificado. Un turno partido es un único turno con dos tramos. Máximo uno por empleada y día. */
export const Turno = sequelize.define(
  'Turno',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    empleadaId: { type: DataTypes.UUID, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    tramos: { type: DataTypes.JSONB, allowNull: false },
    plantillaId: { type: DataTypes.UUID, allowNull: true },
    avisosIgnorados: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
  },
  { tableName: 'turnos' },
);
