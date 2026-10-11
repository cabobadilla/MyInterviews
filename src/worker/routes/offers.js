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
import { crearOfertaConPostulacion, listarOfertas } from '../repos/offers.js';
import { MAX_PROMPT_CARACTERES } from '../lib/schema.js';

// GET /api/offers → 200 {ofertas:[…]} (la lista vacía es [], no 404).
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
