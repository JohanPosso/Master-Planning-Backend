import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { TIPOS_FICHAJE } from '../domain/catalogos.js';

/**
 * Marca de entrada o salida. Solo se inserta: la API no permite editarla ni borrarla
 * (las correcciones se hacen en el registro de horas, que conserva el fichaje original).
 */
export const Fichaje = sequelize.define(
  'Fichaje',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    empleadaId: { type: DataTypes.UUID, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    minuto: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.ENUM(...TIPOS_FICHAJE), allowNull: false },
    marca: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    latitud: { type: DataTypes.DOUBLE, allowNull: true },
    longitud: { type: DataTypes.DOUBLE, allowNull: true },
    precisionM: { type: DataTypes.INTEGER, allowNull: true },
    distanciaM: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'fichajes' },
);
