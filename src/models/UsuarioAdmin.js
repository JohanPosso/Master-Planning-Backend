import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export const UsuarioAdmin = sequelize.define(
  'UsuarioAdmin',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    usuario: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
  },
  { tableName: 'usuarios_admin' },
);
