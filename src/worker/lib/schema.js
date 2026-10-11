// lib/schema.js — el OfferJSON canónico del spec §4.1, sin efectos y sin
// dependencias: las constantes que comparten el prompt, la extracción y el
// cableado. La VALIDACIÓN vive en lib/validar_oferta.js (ADR-006).

export const PROMPT_VERSION = 'oferta-extract-v1';

// C-13: el truncado a ≤15.000 caracteres es SOLO para el prompt; lo que el
// usuario pegó se guarda entero en raw_text.
export const MAX_PROMPT_CARACTERES = 15_000;

// C-12: cap de la descarga server-side de una URL (spec §4 / ADR-004).
export const CAP_BYTES = 500_000;

// Forma canónica que el modelo debe devolver (OfferJSON, spec §4.1):
const OFERTA_EJEMPLO = `{
  "titulo": "título exacto de la vacante",
  "empresa": "empresa que contrata",
  "ubicacion": "ciudad/país o 'remoto'",
  "modalidad": "presencial | hibrido | remoto",
  "seniority": "junior | semi_senior | senior | lead",
  "salario": { "texto": "declarado en la oferta" } | null,
  "resumen": "2-3 oraciones con el corazón del puesto",
  "responsabilidades": ["..."],
  "requisitos_obligatorios": ["..."],
  "requisitos_deseables": ["..."],
  "skills": [{ "nombre": "...", "obligatoria": true }],
  "beneficios": ["..."],
  "proceso_entrevistas": [{ "paso": "...", "descripcion": "..." }],
  "confianza": { "titulo": "alta|media|baja", "empresa": "alta|media|baja" }
}`;

export function promptSistema() {
  return [
    'Sos un extractor de ofertas laborales. Recibís el texto (o el texto extraído del HTML) de una oferta y devolvés SOLAMENTE un objeto JSON con esta forma exacta (OfferJSON):',
    OFERTA_EJEMPLO,
    'Reglas:',
    '- Devolvés ÚNICAMENTE el JSON: sin markdown, sin explicaciones, sin texto alrededor.',
    '- No inventás valores que el texto no declare: si un campo no aparece, lo dejás ausente o en lista vacía. Nunca lo completás con supuestos.',
    '- Lo que el texto declare en otro idioma va igual en el JSON.',
    '- Respondé en una sola línea de JSON si podés: mismo contenido, menos caracteres.',
  ].join('\n');
}

export function promptReintento(errorValidacion) {
  return [
    `El intento anterior NO pasaron los controles del esquema: ${errorValidacion}`,
    'Re-generá el JSON COMPLETO del OfferJSON, corrigiendo ese problema.',
    'Devolvés SOLAMENTE el JSON, sin markdown ni explicaciones.',
  ].join('\n');
}
