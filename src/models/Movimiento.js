import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Entrada append-only del libro de auditoría. */
export const Movimiento = sequelize.define(
  'Movimiento',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    tipo: { type: DataTypes.STRING(60), allowNull: false },
    entidad: { type: DataTypes.STRING(40), allowNull: true },
    entidadId: { type: DataTypes.UUID, allowNull: true },
    empleadaId: { type: DataTypes.UUID, allowNull: true },
    actorTipo: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'sistema' },
    actorId: { type: DataTypes.UUID, allowNull: true },
    actorNombre: { type: DataTypes.STRING(80), allowNull: true },
    resumen: { type: DataTypes.STRING(240), allowNull: false },
    detalle: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' },
  },
  {
    tableName: 'movimientos',
    timestamps: false,
    updatedAt: false,
    createdAt: false,
  },
);
