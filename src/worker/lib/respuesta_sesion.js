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
import { verificar } from './session.js';

export function respuestaSesion(cookie, secreto, ahoraSeg) {
  // Sin secreto no se puede validar ninguna firma: falla cerrado, pero sigue
  // informando estado con 200 (nunca 401, nunca texto crudo de excepción).
  if (typeof secreto !== 'string' || secreto.length === 0) {
    return { status: 200, cuerpo: { autenticado: false }, borrarCookie: false };
  }
  const claims = verificar(cookie, secreto, ahoraSeg);
  if (claims) {
    return { status: 200, cuerpo: { autenticado: true }, borrarCookie: false };
  }
  // Una cookie muerta que el navegador sigue mandando merece borrado; si no
  // no llegó ninguna cookie, no hay nada que limpiar.
  const habiaCookie = typeof cookie === 'string' && cookie.length > 0;
  return { status: 200, cuerpo: { autenticado: false }, borrarCookie: habiaCookie };
}
