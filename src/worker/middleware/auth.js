// middleware/auth.js — decisor puro de la barrera de sesión. Sin imports de
// repositorios: corta ANTES de tocar cualquier base (C-02). Devuelve los
// claims directamente si la sesión valida, o { status: 401, borrarCookie: true }.
//
// ADR-009: después de validar la firma, la barrera comprueba que el jti no
// esté revocado. La consulta de revocación ENTRA INYECTADA por parámetro
// `estaRevocado`, con valor por defecto `() => false`: las firmas que ya
// existían (sin el cuarto parámetro) siguen funcionando tal cual.

import { verificar } from '../lib/session.js';

// exigirSesion(cookie, secreto, ahoraSeg[, opciones])
//   opciones.estaRevocado: (jti) => boolean — por defecto () => false
//   → claims | { status: 401, borrarCookie: true }
export function exigirSesion(cookie, secreto, ahoraSeg, opciones) {
  const estaRevocado = opciones?.estaRevocado ?? (() => false);
  const claims = verificar(cookie, secreto, ahoraSeg);
  if (claims) {
    if (estaRevocado(claims.jti)) return { status: 401, borrarCookie: true };
    return claims;
  }
  return { status: 401, borrarCookie: true };
}

// exigirSesionActiva — el cableado con base real (D1): la consulta de
// revocación puede ser asíncrona y la barrera la ESPERA antes de dejar pasar.
export async function exigirSesionActiva(cookie, secreto, ahoraSeg, opciones) {
  const claims = verificar(cookie, secreto, ahoraSeg);
  if (claims) {
    const revocada = await Promise.resolve(opciones?.estaRevocado?.(claims.jti) ?? false);
    if (revocada) return { status: 401, borrarCookie: true };
    return claims;
  }
  return { status: 401, borrarCookie: true };
}
