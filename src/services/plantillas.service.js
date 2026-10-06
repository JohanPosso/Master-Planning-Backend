import { sequelize } from '../config/database.js';
import { Plantilla } from '../models/index.js';
import { toPlantilla } from '../serializers.js';
import { notFound } from '../utils/errors.js';
import { upsertById } from '../utils/repository.js';

export async function listarPlantillas() {
  const filas = await Plantilla.findAll({ order: [['orden', 'ASC'], ['createdAt', 'ASC']] });
  return filas.map(toPlantilla);
}

/** Las nuevas se añaden al final del panel. */
export function guardarPlantilla(id, datos) {
  return sequelize.transaction(async (transaction) => {
    const existe = await Plantilla.count({ where: { id }, transaction });
    const orden = existe ? undefined : ((await Plantilla.max('orden', { transaction })) ?? -1) + 1;
    const { instancia, creado } = await upsertById(Plantilla, id, { ...datos, ...(orden !== undefined && { orden }) }, { transaction });
    return { plantilla: toPlantilla(instancia), creado };
  });
}

/** Los turnos creados con ella se conservan (la columna plantilla_id pasa a NULL). */
export async function eliminarPlantilla(id) {
  const borradas = await Plantilla.destroy({ where: { id } });
  if (!borradas) throw notFound('Plantilla');
}
