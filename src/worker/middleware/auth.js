// middleware/auth.js — decisor puro de la barrera de sesión. Sin imports:
// corta ANTES de tocar cualquier repositorio (C-02). Devuelve los claims
// directamente si la sesión valida, o { status: 401, borrarCookie: true }.

import { verificar } from '../lib/session.js';

// exigirSesion(cookie, secreto, ahoraSeg) → claims | { status: 401, borrarCookie: true }
export function exigirSesion(cookie, secreto, ahoraSeg) {
  const claims = verificar(cookie, secreto, ahoraSeg);
  if (claims) return claims;
  return { status: 401, borrarCookie: true };
}
