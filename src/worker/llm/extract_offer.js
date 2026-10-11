// llm/extract_offer.js — el corazón de T-03 (contrato + ADR-006):
//   1. La oferta llega como texto COMPLETO (lo que el usuario pegó o lo que
//      salió de reducir el HTML). El truncado a ≤15.000 es SOLO para el prompt
//      (C-13); lo que se guarda entero es raw_text, del lado del repos.
//   2. Prompt (lib/schema.js) → gateway LLM (INJECTADO) → validación con el
//      validador propio (lib/validar_oferta.js, ADR-006: sin zod).
//   3. Si la validación no pasa, EXACTAMENTE UN reintento con el error de
//      validación DENTRO del prompt. Reintentos en bucle: fuera.
// La extracción nunca bloquea: dos intentos fallidos → «fallida» y se completa
// a mano. Los campos obligatorios ausentes → «parcial» (C-10).

import { validarOferta } from '../lib/validar_oferta.js';
import { promptSistema, promptReintento, PROMPT_VERSION, MAX_PROMPT_CARACTERES } from '../lib/schema.js';

export { MAX_PROMPT_CARACTERES as MAX_PROMPT };

export async function extraerOferta({ gatewayFn, texto, env, fetchImpl, timeoutMs }) {
  const dato = typeof texto === 'string' ? texto : '';
  const truncado = dato.length > MAX_PROMPT_CARACTERES;
  // C-13: «al LLM le llegan ≤15.000» es el MENSAJE completo (prompt + texto);
  // el texto en sí se acota el margen que el prompt del sistema deja libre.
  const tope = Math.max(1000, MAX_PROMPT_CARACTERES - promptSistema().length);
  const textoPrompt = truncado ? dato.slice(0, tope) : dato;

  const mensajesPrimerIntento = [
    { role: 'system', content: promptSistema() },
    { role: 'user', content: textoPrompt },
  ];

  let fraseFalla = null;
  const llamadas = [];

  for (let intento = 0; intento < 2; intento += 1) {
    const mensajes = intento === 0
      ? mensajesPrimerIntento
      : [
          ...mensajesPrimerIntento,
          { role: 'user', content: promptReintento(fraseFalla ?? 'la respuesta anterior no sirvió') },
        ];
    llamadas.push(mensajes);

    const r = await gatewayFn({ env, mensajes, fetchImpl, timeoutMs });
    if (!r?.ok) {
      fraseFalla = typeof r?.error === 'string' && r.error.length > 0
        ? r.error
        : 'el gateway no pudo hablar con la pasarela del LLM';
      continue;
    }

    let json;
    try {
      json = JSON.parse(r.texto);
    } catch {
      fraseFalla = 'la respuesta del modelo no es un JSON parseable';
      continue;
    }

    const v = validarOferta(json);
    if (v.error) {
      fraseFalla = v.error;
      continue;
    }

    return {
      estado: v.faltantes.length > 0 ? 'parcial' : 'exitosa',
      json,
      faltantes: v.faltantes,
      error: null,
      truncado,
      caracteresPrompt: textoPrompt.length,
      llamadas: llamadas.length,
      promptVersion: PROMPT_VERSION,
    };
  }

  return {
    estado: 'fallida',
    json: null,
    faltantes: [],
    error: fraseFalla ?? 'la extracción no dio un JSON utilizable tras el reintento',
    truncado,
    caracteresPrompt: textoPrompt.length,
    llamadas: llamadas.length,
    promptVersion: PROMPT_VERSION,
  };
}
