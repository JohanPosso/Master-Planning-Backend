import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { COLORES, ROLES } from '../domain/catalogos.js';

/** Persona del equipo. Nunca se borra físicamente si tiene horas pagadas (borrado lógico con `eliminadaEn`). */
export const Empleada = sequelize.define(
  'Empleada',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    nombre: { type: DataTypes.STRING(80), allowNull: false },
    rol: { type: DataTypes.ENUM(...ROLES), allowNull: false, defaultValue: 'Empleada' },
    color: { type: DataTypes.ENUM(...COLORES), allowNull: false },
    tarifaCent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1000 },
    diasDescanso: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    descansoSeguido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    excluirNomina: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    eliminadaEn: { type: DataTypes.DATEONLY, allowNull: true },
  },
  { tableName: 'empleadas' },
);
