// lib/cookie.js — serialización y lectura de la cookie de sesión. Puro,
// sin imports (regla de importabilidad, ADR-004).

export const NOMBRE_SESION = 'sesion';

export function serializarSesion(valor) {
  return `${NOMBRE_SESION}=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`;
}

export function borrarSesion() {
  return `${NOMBRE_SESION}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// leerCookie(header) → valor de la cookie de sesión | null
export function leerCookie(header) {
  if (typeof header !== 'string') return null;
  const m = header.match(new RegExp(`(?:^|;\\s*)${NOMBRE_SESION}=([^;]*)`));
  if (!m) return null;
  return m[1] === '' ? null : m[1];
}
