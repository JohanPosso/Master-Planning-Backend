import { Configuracion, ID_CONFIGURACION } from './Configuracion.js';
import { Empleada } from './Empleada.js';
import { Festivo } from './Festivo.js';
import { LineaPago } from './LineaPago.js';
import { PeriodoPago } from './PeriodoPago.js';
import { Plantilla } from './Plantilla.js';
import { Registro } from './Registro.js';
import { Semana } from './Semana.js';
import { Turno } from './Turno.js';
import { UsuarioAdmin } from './UsuarioAdmin.js';

// Las reglas ON DELETE reales viven en la migración; aquí solo se declaran las relaciones para consultas.
Empleada.hasMany(Turno, { as: 'turnos', foreignKey: 'empleadaId' });
Turno.belongsTo(Empleada, { as: 'empleada', foreignKey: 'empleadaId' });
Turno.belongsTo(Plantilla, { as: 'plantilla', foreignKey: 'plantillaId' });

Empleada.hasMany(Registro, { as: 'registros', foreignKey: 'empleadaId' });
Registro.belongsTo(Empleada, { as: 'empleada', foreignKey: 'empleadaId' });

PeriodoPago.hasMany(LineaPago, { as: 'lineas', foreignKey: 'periodoId' });
LineaPago.belongsTo(PeriodoPago, { as: 'periodo', foreignKey: 'periodoId' });
LineaPago.belongsTo(Empleada, { as: 'empleada', foreignKey: 'empleadaId' });

export {
  Configuracion,
  Empleada,
  Festivo,
  ID_CONFIGURACION,
  LineaPago,
  PeriodoPago,
  Plantilla,
  Registro,
  Semana,
  Turno,
  UsuarioAdmin,
};
