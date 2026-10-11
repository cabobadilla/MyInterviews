// routes/offers.js — decisores de las rutas de ofertas + la capa fina de D1
// (ADR-007, igual que routes/auth.js): SOLO módulos puros del proyecto, sin
// hono ni node_modules — el cableado vive en index.js y los tests corren en el
// árbol pelado (ADR-004/ADR-006).
//
// Contrato (docs/04-DISENO.md §): POST /api/offers/extract y GET /api/offers.
//   Entrada: {fuente:'texto'|'url', texto?, url?}
//   201 → {oferta, aplicacion}   ·   400 sin fuente/texto   ·   422 URL no
//   descargable o >500 KB (se ofrece pegar el texto, y NO se crea la oferta).
// C-11: la oferta se crea SIEMPRE, aunque la extracción sea fallida.

import { extraerOferta } from '../llm/extract_offer.js';
import { descargarTexto } from '../llm/reduce_html.js';
import { llamarLlm } from '../llm/gateway.js';
import { crearOfertaConPostulacion, listarOfertas, obtenerOferta, actualizarOferta } from '../repos/offers.js';
import { MAX_PROMPT_CARACTERES } from '../lib/schema.js';
import { validarOferta } from '../lib/validar_oferta.js';

// GET /api/offers → 200 {ofertas:[…]} (la lista vacía es [], no 404).
// T-04 — detalle y edición de la oferta.
//   GET /api/offers/:id → 200 {oferta} con raw_text y source_url EXACTAMENTE
//   como se guardaron (C-17)    ·   400 id inválido   ·   404 inexistente.
//   PUT /api/offers/:id  → edita la fila in situ (C-15: guardando SIEMPRE,
//   aunque el estado sea parcial o fallida). NO vuelve a llamar al LLM: la
//   extracción es un dato histórico y el estado no cambia. Los faltantes SÍ
//   se recalculan con el validador propio (es puro, no es extracción).

const ID_INVALIDO = { error: 'el id de la oferta es inválido: esperaba un número positivo' };

function idNumerico(id) {
  const n = Number(id);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function aflojarJson(texto) {
  try {
    const v = JSON.parse(typeof texto === 'string' ? texto : texto === null || texto === undefined ? 'null' : String(texto));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// La lista de faltantes es un ARREGLO del JSON guardado (otra forma que el
// objeto del OfferJSON): si el texto no es un arreglo, queda lista vacía.
function aflojarLista(texto) {
  try {
    const v = JSON.parse(typeof texto === 'string' ? texto : texto === null || texto === undefined ? '[]' : String(texto));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function cuerpoDeDetalle(fila, extract) {
  return {
    id: Number(fila.id),
    source_url: fila.source_url ?? null,
    raw_text: fila.raw_text,
    extracted_json: extract,
    extraction_status: fila.extraction_status ?? null,
    extraction_error: fila.extraction_error ?? null,
    campos_faltantes: aflojarLista(fila.campos_faltantes_json ?? '[]'),
    titulo: fila.titulo ?? null,
    empresa: fila.empresa ?? null,
    created_at: fila.created_at ?? null,
    updated_at: fila.updated_at ?? null,
  };
}

export async function respuestaDeDetalle({ db, id }) {
  if (!db) return { status: 500, body: { error: 'la base de ofertas no está disponible' } };
  const idNum = idNumerico(id);
  if (!idNum) return { status: 400, body: ID_INVALIDO };
  const fila = await obtenerOferta(db, idNum);
  if (!fila) return { status: 404, body: { error: `no existe la oferta con id ${idNum}` } };
  return { status: 200, body: { ok: true, oferta: cuerpoDeDetalle(fila, aflojarJson(fila.extracted_json)) } };
}

// Campos que el usuario edifica a mano desde la pantalla del detalle.
const EDITABLES_TEXTO = ['titulo', 'empresa', 'ubicacion', 'modalidad', 'seniority', 'resumen'];

const SIN_CAMPOS = {
  error: 'decí qué campos editar: titulo, empresa, ubicacion, modalidad, seniority, resumen, salario o beneficios',
};

export async function respuestaDeEdicion({ db, id, body, ahoraIso }) {
  if (!db) return { status: 500, body: { error: 'la base de ofertas no está disponible' } };
  const idNum = idNumerico(id);
  if (!idNum) return { status: 400, body: ID_INVALIDO };
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: SIN_CAMPOS };
  }

  // Sólo tipos que la pantalla manda: texto no vacío, salario como texto
  // (o forma completa {}, escapándose del validador) y beneficios como lista.
  const cargas = {};
  const deformados = [];
  for (const campo of EDITABLES_TEXTO) {
    if (body[campo] === undefined) continue;
    if (typeof body[campo] === 'string' && body[campo].trim()) cargas[campo] = body[campo].trim();
    else deformados.push(campo);
  }
  if (body.salario !== undefined) {
    const s = body.salario;
    if (typeof s === 'string' && s.trim()) cargas.salario = { texto: s.trim() };
    else if (s && typeof s === 'object' && !Array.isArray(s) && (typeof s.texto === 'string' && s.texto.trim())) {
      cargas.salario = { texto: s.texto.trim(), min: s.min ?? null, max: s.max ?? null, moneda: s.moneda ?? null };
    } else deformados.push('salario');
  }
  if (body.beneficios !== undefined) {
    if (Array.isArray(body.beneficios) && body.beneficios.length > 0) cargas.beneficios = body.beneficios;
    else deformados.push('beneficios');
  }
  if (deformados.length > 0) {
    return { status: 400, body: { error: `los campos editados vienen deforme: ${deformados.join(', ')} (texto no vacío, o lista/objeto según el campo)` } };
  }
  if (Object.keys(cargas).length === 0) return { status: 400, body: SIN_CAMPOS };

  const actual = await obtenerOferta(db, idNum);
  if (!actual) return { status: 404, body: { error: `no existe la oferta con id ${idNum}` } };

  // Editar sobre lo que ya hay: la extracción es un dato histórico, el estado
  // (parcial/fallida incluidos) SIEMPRE queda como está. Una sola fila, in situ.
  const mezcla = { ...(aflojarJson(actual.extracted_json) ?? {}) };
  for (const campo of EDITABLES_TEXTO) if (campo in cargas) mezcla[campo] = cargas[campo];
  if ('salario' in cargas) mezcla.salario = cargas.salario;
  if ('beneficios' in cargas) mezcla.beneficios = cargas.beneficios;

  const validacion = validarOferta(mezcla);
  // Los faltantes se recalculan del estado EDITADO (con salario/beneficios
  // completados, la pantalla deja de marcarlos). Si el usuario tipeó algo de
  // forma distinta al canónico, el validador sale sin lista de faltantes, y
  // ese es el estado honesto que se guarda.
  const faltantes = validacion.faltantes;

  const editada = await actualizarOferta(db, idNum, {
    source_url: actual.source_url,
    raw_text: actual.raw_text,
    extracted_json: JSON.stringify(mezcla),
    extraction_status: actual.extraction_status,
    extraction_error: actual.extraction_error,
    campos_faltantes_json: JSON.stringify(faltantes),
    titulo: typeof mezcla.titulo === 'string' ? mezcla.titulo : null,
    empresa: typeof mezcla.empresa === 'string' ? mezcla.empresa : null,
  }, ahoraIso);

  return {
    status: 200,
    body: {
      ok: true,
      oferta: cuerpoDeDetalle(editada, mezcla),
    },
  };
}

export async function respuestaDeListado({ db }) {
  if (!db) return { status: 500, body: { error: 'la base de ofertas no está disponible' } };
  return { status: 200, body: { ofertas: await listarOfertas(db) } };
}

const SIN_FUENTE = { error: 'indicá la fuente de la oferta: {"fuente":"texto","texto":…} o {"fuente":"url","url":…}' };

export async function respuestaDeExtract({
  body, env, db, gatewayFn = llamarLlm, fetchImpl = globalThis.fetch, ahoraIso,
}) {
  if (!db) return { status: 500, body: { error: 'la base de ofertas no está disponible' } };

  const fuente = body?.fuente;
  if (fuente !== 'texto' && fuente !== 'url') {
    return { status: 400, body: SIN_FUENTE };
  }

  let textoCompleto = null;
  let sourceUrl = null;

  if (fuente === 'url') {
    const url = body?.url;
    if (typeof url !== 'string' || !/^https?:\/\/\S+$/.test(url.trim())) {
      return { status: 400, body: { error: 'la URL es inválida: esperaba http(s)://…' } };
    }
    const descarga = await descargarTexto({ url: url.trim(), fetchImpl });
    if (!descarga.ok) {
      // C-12: error explícito que ofrece pegar el texto, y la oferta NO se crea.
      return {
        status: 422,
        body: {
          error: `no se pudo bajar esa URL (${descarga.error ?? 'la descarga falló'}); pegá el texto de la oferta manualmente`,
          motivo: descarga.motivo ?? null,
          sugerencia: 'pegá el texto de la oferta',
        },
      };
    }
    textoCompleto = descarga.texto;
    sourceUrl = url.trim();
  } else {
    const texto = body?.texto;
    if (typeof texto !== 'string' || texto.trim().length === 0) {
      return { status: 400, body: { error: 'pegá el texto de la oferta: va en {"fuente":"texto","texto":"…"}' } };
    }
    textoCompleto = texto;
  }

  const extraccion = await extraerOferta({ gatewayFn, texto: textoCompleto, env, fetchImpl });

  // C-13: raw_text SIEMPRE el texto completo; la marca del truncado va a
  // extraction_error (que coexiste con el error real cuando hubo ambos).
  const notaTruncado = extraccion.truncado
    ? `texto truncado a ${extraccion.caracteresPrompt ?? MAX_PROMPT_CARACTERES} caracteres para el prompt (raw_text guarda el texto completo)`
    : null;
  const extractionError = [
    extraccion.estado === 'fallida' ? extraccion.error : null,
    notaTruncado,
  ].filter(Boolean).join(' · ') || null;

  const { oferta, aplicacion } = await crearOfertaConPostulacion(db, {
    source_url: sourceUrl,
    raw_text: textoCompleto,
    extracted_json: extraccion.json ? JSON.stringify(extraccion.json) : null,
    extraction_status: extraccion.estado,
    extraction_error: extractionError,
    campos_faltantes_json: JSON.stringify(extraccion.faltantes ?? []),
    titulo: extraccion.json?.titulo ?? null,
    empresa: extraccion.json?.empresa ?? null,
  }, ahoraIso ?? new Date().toISOString());

  return {
    status: 201,
    body: {
      ok: true,
      oferta: {
        id: oferta?.id,
        source_url: oferta?.source_url ?? null,
        raw_text: oferta?.raw_text,
        extracted_json: extraccion.json,
        extraction_status: extraccion.estado,
        extraction_error: extractionError,
        campos_faltantes: extraccion.faltantes ?? [],
        titulo: oferta?.titulo ?? null,
        empresa: oferta?.empresa ?? null,
        created_at: ahoraIso ?? null,
      },
      aplicacion: {
        offer_id: oferta?.id ?? null,
        status: 'borrador',
      },
    },
  };
}
