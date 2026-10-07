import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { ORIGENES_FICHAJE, TIPOS_FICHAJE } from '../domain/catalogos.js';

/**
 * Marca de entrada o salida. Nunca se borra ni se sobrescribe: una corrección del encargado anula el
 * original (anuladoEn + motivo) y crea otro que lo sustituye, de modo que queda todo el historial.
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
    origen: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'empleada', validate: { isIn: [ORIGENES_FICHAJE] } },
    /** gps · red (Wi-Fi de la cafetería) · sin_verificar · null si no hay verificación activa. */
    verificacion: { type: DataTypes.STRING(16), allowNull: true },
    ip: { type: DataTypes.STRING(45), allowNull: true },
    anuladoEn: { type: DataTypes.DATE, allowNull: true },
    motivo: { type: DataTypes.TEXT, allowNull: true },
    sustituyeA: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'fichajes' },
);
