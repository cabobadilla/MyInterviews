// lib/validar_oferta.js — validador propio del OfferJSON canónico (spec §4.1).
// ADR-006: módulo PROPATICO, NO importa nada (ni zod): C-10 y C-11 son el
// corazón de la tarea y deben poder medirse en el árbol pelado.
//
// Devuelve SIEMPRE { ok, faltantes, error }:
//   faltantes = campos OBLIGATORIOS ausentes o vacíos → la extracción queda «parcial».
//   error     = por qué el JSON NO SIRVE (no es objeto, campos de tipo equivocado)
//               → la extracción queda «fallida» (y se re-intenta con este texto).

export const CAMPOS_OBLIGATORIOS = [
  'titulo', 'empresa', 'ubicacion', 'modalidad', 'seniority', 'resumen', 'salario', 'beneficios',
];

export const FRASE_NO_JSON = 'la respuesta del modelo no es un objeto JSON con la forma del OfferJSON';

export function validarOferta(dato) {
  if (dato === null || typeof dato !== 'object' || Array.isArray(dato)) {
    return { ok: false, faltantes: [], error: FRASE_NO_JSON };
  }

  // Primero la forma: si algo presente viene con otro tipo, el JSON no sirve.
  const deformados = [];
  const esTexto = (v) => typeof v === 'string' && v.trim().length > 0;
  for (const campo of ['titulo', 'empresa', 'ubicacion', 'modalidad', 'seniority', 'resumen']) {
    if (dato[campo] !== undefined && dato[campo] !== null && !esTexto(dato[campo])) deformados.push(campo);
  }
  if (dato.salario !== undefined && dato.salario !== null) {
    const s = dato.salario;
    const formaOk =
      (typeof s === 'object' && !Array.isArray(s) && esTexto(s.texto)) ||
      (typeof s === 'object' && !Array.isArray(s) && (Number.isFinite(s.min) || Number.isFinite(s.max)));
    if (!formaOk) deformados.push('salario');
  }
  for (const campo of ['beneficios', 'responsabilidades', 'requisitos_obligatorios', 'requisitos_deseables', 'proceso_entrevistas']) {
    if (dato[campo] !== undefined && dato[campo] !== null && !Array.isArray(dato[campo])) deformados.push(campo);
  }
  if (dato.skills !== undefined && dato.skills !== null && !Array.isArray(dato.skills)) deformados.push('skills');
  if (dato.confianza !== undefined && dato.confianza !== null &&
      (typeof dato.confianza !== 'object' || Array.isArray(dato.confianza))) deformados.push('confianza');

  if (deformados.length > 0) {
    return {
      ok: false,
      faltantes: [],
      error: `la respuesta ya no responde la forma del esquema: los campos ${deformados.join(', ')} salen con otro tipo del canónico`,
    };
  }

  // Después lo faltante: ausente o vacío → «parcial».
  const faltantes = [];
  for (const campo of CAMPOS_OBLIGATORIOS) {
    const v = dato[campo];
    const presente = v !== undefined && v !== null;
    const conContenido = Array.isArray(v) ? v.length > 0 :
      typeof v === 'object' ? Object.keys(v ?? {}).length > 0 : esTexto(v);
    if (!presente || !conContenido) faltantes.push(campo);
  }

  return { ok: faltantes.length === 0, faltantes, error: null };
}
