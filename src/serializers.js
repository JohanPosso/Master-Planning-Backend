/**
 * Contrato con el frontend (src/lib/types.ts). Se eligen los campos explícitamente para no filtrar
 * columnas internas (timestamps, minutos derivados) y se omiten los opcionales vacíos, como en el cliente.
 */
const sinVacios = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));

export const toEmpleada = (e) =>
  sinVacios({
    id: e.id,
    nombre: e.nombre,
    rol: e.rol,
    color: e.color,
    tarifaCent: e.tarifaCent,
    diasDescanso: e.diasDescanso,
    descansoSeguido: e.descansoSeguido,
    excluirNomina: e.excluirNomina,
    activa: e.activa,
    eliminadaEn: e.eliminadaEn,
  });

export const toPlantilla = (p) => ({ id: p.id, nombre: p.nombre, tramos: p.tramos });

export const toTurno = (t) =>
  sinVacios({
    id: t.id,
    empleadaId: t.empleadaId,
    fecha: t.fecha,
    tramos: t.tramos,
    plantillaId: t.plantillaId,
    avisosIgnorados: t.avisosIgnorados?.length ? t.avisosIgnorados : undefined,
  });

export const toRegistro = (r) =>
  sinVacios({ id: r.id, empleadaId: r.empleadaId, fecha: r.fecha, tramos: r.tramos, nota: r.nota, estado: r.estado });

export const toSemana = (s) => ({ lunes: s.lunes, publicada: s.publicada });

export const toLineaPago = (l) => ({
  empleadaId: l.empleadaId,
  minutos: l.minutos,
  tarifaCent: l.tarifaCent,
  recargosCent: l.recargosCent,
  importeCent: l.importeCent,
});

export const toPago = (p) => ({
  id: p.id,
  inicio: p.inicio,
  fin: p.fin,
  etiqueta: p.etiqueta,
  pagadoEn: new Date(p.pagadoEn).toISOString(),
  totalCent: p.totalCent,
  // Orden estable (mayor importe primero) para que POST y GET devuelvan lo mismo.
  lineas: (p.lineas ?? []).map(toLineaPago).sort((a, b) => b.importeCent - a.importeCent || a.empleadaId.localeCompare(b.empleadaId)),
});
