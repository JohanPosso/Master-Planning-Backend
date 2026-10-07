import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { ESTADOS_REGISTRO, ORIGENES_REGISTRO } from '../domain/catalogos.js';
import { minutosDe } from '../domain/tramos.js';

const derivarMinutos = (registro) => {
  registro.minutos = minutosDe(registro.tramos);
};

/** Lo trabajado de verdad. `minutos` se deriva de los tramos para poder agregar en SQL. */
export const Registro = sequelize.define(
  'Registro',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    empleadaId: { type: DataTypes.UUID, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    tramos: { type: DataTypes.JSONB, allowNull: false },
    minutos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    nota: { type: DataTypes.TEXT, allowNull: true },
    estado: { type: DataTypes.ENUM(...ESTADOS_REGISTRO), allowNull: false, defaultValue: 'previsto' },
    /** 'fichaje' si las horas salen de los fichajes de la empleada; 'manual' si las puso el encargado. */
    origen: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'manual', validate: { isIn: [ORIGENES_REGISTRO] } },
  },
  {
    tableName: 'registros',
    hooks: {
      beforeSave: derivarMinutos,
      beforeBulkCreate: (registros) => registros.forEach(derivarMinutos),
    },
  },
);
