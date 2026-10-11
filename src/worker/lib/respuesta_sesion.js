// lib/respuesta_sesion.js — decisor puro del estado de sesión para GET
// /api/session (C-02, la excepción). No toca repositorios ni cableado: recibe
// la cookie ya cruda, el secreto y el instante, y devuelve la forma completa de
// la respuesta. La ruta informa ESTADO, no bloquea: SIEMPRE 200 —
// {autenticado:true} con cookie válida y {autenticado:false} sin ella, y al
// 200 nunca se le suma un 401. Cuando la firma no valida (inválida, vencida, o
// vida >30 días) la cookie que el navegador sigue mandando es una cookie que
// hay que limpiar: borrarCookie:true.
//
// La firma NO se reimplementa: se reusa verificar() de lib/session.js.
// ADR-009: una sesión CON firma válida pero jti revocado se informa como
// {autenticado:false}. La consulta entra INYECTADA por `estaRevocado` con
// valor por defecto `() => false` — sin el cuarto parámetro, la forma queda
// exactamente igual a la de los tests sellados.
import { verificar } from './session.js';

function decidir(cookie, secreto, ahoraSeg) {
  const habiaCookie = typeof cookie === 'string' && cookie.length > 0;
  // Sin secreto no se puede validar ninguna firma: estado no autenticado.
  if (typeof secreto !== 'string' || secreto.length === 0) return { claims: null, habiaCookie };
  return { claims: verificar(cookie, secreto, ahoraSeg), habiaCookie };
}

// respuestaSesion(cookie, secreto, ahoraSeg[, estaRevocado]) — sincrónico:
// `estaRevocado(jti)` debe ser una función sincrónica. Por defecto () => false.
export function respuestaSesion(cookie, secreto, ahoraSeg, estaRevocado = () => false) {
  const { claims, habiaCookie } = decidir(cookie, secreto, ahoraSeg);
  if (claims) {
    if (estaRevocado(claims.jti)) {
      // C-05 / ADR-009: sesión revocada → estado NO autenticado, SIEMPRE 200,
      // con la cookie para limpiar.
      return { status: 200, cuerpo: { autenticado: false }, borrarCookie: true };
    }
    return { status: 200, cuerpo: { autenticado: true }, borrarCookie: false };
  }
  // Una cookie muerta que el navegador sigue mandando merece borrado; si no
  // no llegó ninguna cookie, no hay nada que limpiar.
  return { status: 200, cuerpo: { autenticado: false }, borrarCookie: habiaCookie };
}

// respuestaSesionActiva — cableado con base real (D1): `estaRevocado` puede
// ser asíncrona y el await la ESPERA antes de informar el estado.
export async function respuestaSesionActiva(cookie, secreto, ahoraSeg, estaRevocado) {
  const { claims, habiaCookie } = decidir(cookie, secreto, ahoraSeg);
  if (claims) {
    const revocada = await Promise.resolve(estaRevocado?.(claims.jti) ?? false);
    if (revocada) return { status: 200, cuerpo: { autenticado: false }, borrarCookie: true };
    return { status: 200, cuerpo: { autenticado: true }, borrarCookie: false };
  }
  return { status: 200, cuerpo: { autenticado: false }, borrarCookie: habiaCookie };
}
