// lib/session.js — decisor de sesión. Imports: solo node:crypto (regla de
// importabilidad, ADR-004). Sin hono, sin repositorios, sin estado.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TTL_SEG = 30 * 24 * 60 * 60; // C-06: vida máxima de 30 días

// nuevoJti() → string — identificador de sesión ALEATORIO, distinto en cada
// login (ADR-009). El login lo suma STANDALONE al payload que firma firmar:
// firmar y verificar NO cambian de forma (claims que entran = claims que
// vuelven), el identificador va DENTRO del contenido ya firmado.
export function nuevoJti() {
  return randomBytes(16).toString('base64url');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function firmar(claims, secreto) {
  const payload = b64url(JSON.stringify(claims));
  const mac = createHmac('sha256', secreto).update(payload).digest();
  return `${payload}.${b64url(mac)}`;
}

// verificar(cookie, secreto, ahoraSeg) → claims | null
// null si: firma inválida, formato roto, exp vencida, o vida > 30 días.
export function verificar(cookie, secreto, ahoraSeg) {
  if (typeof cookie !== 'string' || cookie.length === 0) return null;
  const partes = cookie.split('.');
  if (partes.length !== 2) return null;
  const [payload, macDado] = partes;

  const macReComputado = createHmac('sha256', secreto).update(payload).digest();
  const macDadoBuf = Buffer.from(macDado, 'base64url');
  if (macDadoBuf.length !== macReComputado.length) return null;
  if (!timingSafeEqual(macDadoBuf, macReComputado)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null; // formato roto
  }
  if (!claims || typeof claims.exp !== 'number') return null;

  if (claims.exp <= ahoraSeg) return null; // vencida
  if (claims.exp > ahoraSeg + TTL_SEG) return null; // emitida para vivir más de 30 días
  return claims;
}

export function expiracionDesde(ahoraSeg, ttlSeg = TTL_SEG) {
  return ahoraSeg + ttlSeg;
}
