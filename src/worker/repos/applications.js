// repos/applications.js — la capa que toca D1 para las postulaciones del
// pipeline (ADR-007). Importa nada: corre en el árbol pelado. La forma de
// respuesta de D1 es { results, success, meta }; la lista vacía es
// `results: []` (nunca «sin filas» confundido con «hay filas»).
//
// Los 7 estados del pipeline son los mismos del CHECK de `applications`
// (migración 0001). El orden importa: es el orden de las columnas y de los
// contadores en pantalla, y los siete SIEMPRE se informan (los ceros también).

export const ESTADOS = ['borrador', 'preparando', 'enviada', 'entrevistas', 'oferta', 'rechazada', 'cerrada'];

export const SQL_LISTAR_APLICACIONES = `SELECT a.id, a.offer_id, a.status, a.updated_at, o.titulo, o.empresa
  FROM applications a
  LEFT JOIN job_offers o ON o.id = a.offer_id
  ORDER BY a.id DESC`;

function filasDe(r) {
  return Array.isArray(r) ? r : (r?.results ?? []);
}

export async function listarAplicaciones(db) {
  const r = await db.prepare(SQL_LISTAR_APLICACIONES).all();
  return filasDe(r).map((f) => ({
    id: Number(f.id),
    offer_id: f.offer_id == null ? null : Number(f.offer_id),
    status: f.status ?? 'borrador',
    titulo: f.titulo ?? null,
    empresa: f.empresa ?? null,
    updated_at: f.updated_at ?? null,
  }));
}
