// repos/interviews.js — D1 para las próximas entrevistas del pipeline
// (ADR-007). Importa nada: corre en el árbol pelado.
//
// C-21: se listan SOLO las futuras (scheduled_at posterior al momento de la
// consulta), por fecha ASCENDENTE. El WHERE+tolerancia se refuerza en JS para
// no depender del driver: una fecha nula no es una entrevista futura.

export const SQL_PROXIMAS_ENTREVISTAS = `SELECT i.id, i.application_id, i.secuencia, i.tipo, i.scheduled_at,
    i.duracion_min, i.lugar_link, o.titulo, o.empresa
  FROM interviews i
  LEFT JOIN applications a ON a.id = i.application_id
  LEFT JOIN job_offers o ON o.id = a.offer_id
  WHERE i.scheduled_at IS NOT NULL AND i.scheduled_at >= ?
  ORDER BY i.scheduled_at ASC, i.id ASC`;

function filasDe(r) {
  return Array.isArray(r) ? r : (r?.results ?? []);
}

export async function listarProximasEntrevistas(db, ahoraIso) {
  const r = await db.prepare(SQL_PROXIMAS_ENTREVISTAS).bind(ahoraIso).all();
  const filas = filasDe(r).map((f) => ({
    id: Number(f.id),
    application_id: f.application_id == null ? null : Number(f.application_id),
    secuencia: f.secuencia == null ? null : Number(f.secuencia),
    tipo: f.tipo ?? null,
    scheduled_at: f.scheduled_at ?? null,
    duracion_min: f.duracion_min == null ? null : Number(f.duracion_min),
    lugar_link: f.lugar_link ?? null,
    titulo: f.titulo ?? null,
    empresa: f.empresa ?? null,
  }));
  // La ordenación fina es del repo, no del SQL: mismo resultado en cualquier
  // driver. Sólo futuras y ascendente.
  return filas
    .filter((e) => typeof e.scheduled_at === 'string' && e.scheduled_at.length > 0 && (!ahoraIso || e.scheduled_at >= ahoraIso))
    .sort((a, b) => (a.scheduled_at < b.scheduled_at ? -1 : a.scheduled_at > b.scheduled_at ? 1 : a.id - b.id));
}
