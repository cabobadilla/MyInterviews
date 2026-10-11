// repos/offers.js — la ÚNICA capa que toca D1 para ofertas/postulaciones
// (ADR-007: los routes no conocen SQL; los repos no conocen HTTP).
// Importa nada: corre en el árbol pelado. La forma de respuesta de D1 es
// { results, success, meta } SIEMPRE — la lista vacía es `results: []`
// (defecto ya pagado: confundir «sin filas» con «hay filas»).

export const SQL_INSERTAR_OFERTA = `INSERT INTO job_offers
  (source_url, raw_text, extracted_json, extraction_status, extraction_error, campos_faltantes_json, titulo, empresa, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export const SQL_CREAR_POSTULACION = `INSERT INTO applications (offer_id, status, status_previo, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`;

export const SQL_LISTAR_OFERTAS = `SELECT id, source_url, extraction_status, campos_faltantes_json, titulo, empresa, created_at FROM job_offers ORDER BY id DESC`;

export async function insertarOferta(db, {
  source_url = null, raw_text, extracted_json = null, extraction_status, extraction_error = null,
  campos_faltantes_json = '[]', titulo = null, empresa = null,
}, ahoraIso) {
  const r = await db.prepare(SQL_INSERTAR_OFERTA).bind(
    source_url, raw_text, extracted_json, extraction_status, extraction_error,
    campos_faltantes_json, titulo, empresa, ahoraIso, ahoraIso,
  ).run();
  const id = r?.meta?.last_row_id;
  return id == null ? null : Number(id);
}

export async function crearPostulacion(db, offerId, ahoraIso, status = 'borrador') {
  await db.prepare(SQL_CREAR_POSTULACION).bind(offerId, status, ahoraIso, ahoraIso).run();
  return { status };
}

export async function crearOfertaConPostulacion(db, datosOferta, ahoraIso) {
  const id = await insertarOferta(db, datosOferta, ahoraIso);
  if (id == null) return { oferta: null, aplicacion: null };
  const aplicacion = await crearPostulacion(db, id, ahoraIso);
  return { oferta: { id, ...datosOferta }, aplicacion: { offer_id: id, ...aplicacion } };
}

function intentarJson(texto) {
  try {
    const v = JSON.parse(texto);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function listarOfertas(db, limite = 20) {
  const r = await db.prepare(SQL_LISTAR_OFERTAS).all();
  const filas = Array.isArray(r) ? r : (r?.results ?? []);
  return filas.slice(0, limite).map((f) => ({
    id: Number(f.id),
    source_url: f.source_url ?? null,
    extraction_status: f.extraction_status ?? null,
    campos_faltantes: intentarJson(f.campos_faltantes_json),
    titulo: f.titulo ?? null,
    empresa: f.empresa ?? null,
    created_at: f.created_at ?? null,
  }));
}

// T-04 — la fila individual de la oferta (detalle y edición in situ).
export const SQL_OBTENER_OFERTA = `SELECT id, source_url, raw_text, extracted_json, extraction_status, extraction_error, campos_faltantes_json, titulo, empresa, created_at, updated_at FROM job_offers WHERE id = ?`;

export const SQL_ACTUALIZAR_OFERTA = `UPDATE job_offers
  SET source_url = ?, raw_text = ?, extracted_json = ?, extraction_status = ?, extraction_error = ?,
      campos_faltantes_json = ?, titulo = ?, empresa = ?, updated_at = ?
  WHERE id = ?`;

export async function obtenerOferta(db, id) {
  const r = await db.prepare(SQL_OBTENER_OFERTA).bind(id).all();
  const filas = Array.isArray(r) ? r : (r?.results ?? []);
  return filas.length > 0 ? filas[0] : null;
}

// Edición in situ: UNA fila, sin re-extracción y sin versionado. Devuelve la
// fila tal como quedó, con updated_at en el momento de la edición.
export async function actualizarOferta(db, id, datos, ahoraIso) {
  await db.prepare(SQL_ACTUALIZAR_OFERTA).bind(
    datos.source_url ?? null,
    datos.raw_text,
    datos.extracted_json ?? null,
    datos.extraction_status,
    datos.extraction_error ?? null,
    datos.campos_faltantes_json ?? '[]',
    datos.titulo ?? null,
    datos.empresa ?? null,
    ahoraIso,
    id,
  ).run();
  return { id, ...datos, updated_at: ahoraIso };
}
