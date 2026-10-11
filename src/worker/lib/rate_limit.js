// lib/rate_limit.js — decisor del límite de intentos (ADR-007). Puro: el
// reloj y las filas van inyectados; sin imports.
// `intentos` son filas ya preparadas por la capa fina de D1:
//   { exito: 0|1, created_at: <segundos de época> }.

export const VENTANA_SEG = 15 * 60; // 15 minutos
export const UMBRAL_FALLOS = 5;      // 5 fallos en la ventana bloquean

// evaluar(intentos, ahoraSeg) → { bloqueado, fallidos, ventanaSeg }
export function evaluar(intentos, ahoraSeg, ventanaSeg = VENTANA_SEG, umbral = UMBRAL_FALLOS) {
  const desde = ahoraSeg - ventanaSeg;
  const fallidos = (intentos ?? []).filter(
    (f) => f.exito === 0 && f.created_at > desde && f.created_at <= ahoraSeg,
  ).length;
  return { bloqueado: fallidos >= umbral, fallidos, ventanaSeg };
}
