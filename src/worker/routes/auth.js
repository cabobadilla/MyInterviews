// routes/auth.js — decisores del login/logout + la capa fina de D1 (ADR-007).
// Solo imports node: (regla de importabilidad, ADR-004): la lógica de los
// casos vive acá, no en el cableado de Hono.
import { pbkdf2Sync, timingSafeEqual, createHash } from 'node:crypto';
import { evaluar } from '../lib/rate_limit.js';
import { firmar, nuevoJti, verificar } from '../lib/session.js';
import { revocar } from '../lib/revocacion.js';

const TTL_COOKIE_SEG = 30 * 24 * 60 * 60;

// ── contraseña: PBKDF2-SHA256 con PBKDF2_ITERATIONS leído de env ─────────────
// Formato de APP_PASSWORD_HASH: pbkdf2:<iteraciones>:<saltB64>:<hashHex>
function partesDeHash(hash) {
  if (typeof hash !== 'string') return null;
  const partes = hash.split(':');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return null;
  const [tag, iterTxt, saltB64, hashHex] = partes;
  const iter = Number.parseInt(iterTxt, 10);
  if (!/^\d+$/.test(iterTxt) || iter <= 0 || !saltB64 || !/^[0-9a-f]{64}$/.test(hashHex)) return null;
  return { iter, saltB64, hashHex };
}

// la contraseña se comprueba contra el hash de env, con EL NÚMERO DE
// ITERACIONES QUE VIENE DE env (no del hash ni del código). Si env no trae
// iteraciones o el hash está deformado, falla cerrado.
export function laContraseñaCoincide(password, env) {
  const partes = partesDeHash(env?.APP_PASSWORD_HASH);
  if (!partes || typeof password !== 'string' || password.length === 0) return false;
  const iter = Number.parseInt(env.PBKDF2_ITERATIONS, 10);
  if (!Number.isFinite(iter) || iter <= 0) return false;
  if (iter !== partes.iter) return false; // el iterador obligatorio es el de env
  const dada = pbkdf2Sync(password, Buffer.from(partes.saltB64, 'base64'), iter, 32, 'sha256');
  const guardada = Buffer.from(partes.hashHex, 'hex');
  return dada.length === guardada.length && timingSafeEqual(dada, guardada);
}

// ── decisores de la respuesta ────────────────────────────────────────────────

const CUERPO_CREDENCIAL_INVALIDA = { error: 'credenciales inválidas' };

// respuestaDeLogin({ body, env, intentos, ahoraSeg })
//   → { status, body, setCookie? }
// Orden impuesto por los casos: primero el límite (C-04, sin evaluar la
// contraseña), después la credencial con error genérico (C-03), último el éxito.
export async function respuestaDeLogin({ body, env, intentos, ahoraSeg }) {
  // C-04: el bloqueo se evalúa ANTES de mirar la contraseña.
  const limite = evaluar(intentos, ahoraSeg);
  if (limite.bloqueado) {
    return { status: 429, body: { error: 'demasiados intentos fallidos; esperá y volvé a intentar' } };
  }

  const secreto = env?.SESSION_SECRET;
  if (!secreto) return { status: 500, body: { error: 'sesión no disponible' } }; // falla cerrado
  if (!env?.APP_EMAIL || !env?.APP_PASSWORD_HASH) return { status: 401, body: CUERPO_CREDENCIAL_INVALIDA };

  // C-03: email inexistente y contraseña mala dan el MISMO status y el MISMO cuerpo.
  const entra =
    typeof body?.email === 'string' &&
    body.email === env.APP_EMAIL &&
    laContraseñaCoincide(body?.password, env);

  if (!entra) return { status: 401, body: CUERPO_CREDENCIAL_INVALIDA };

  // ADR-009: el payload firma un jti ALEATORIO, distinto en cada login. Es el
  // único ancla que el logout tiene para invalidar la sesión en el servidor.
  const token = firmar({ exp: ahoraSeg + TTL_COOKIE_SEG, jti: nuevoJti() }, secreto);
  return { status: 200, body: { ok: true, email: env.APP_EMAIL }, setCookie: token };
}

// ── logout (C-05, ADR-009): la revocación vive EN la tabla, no en la cookie ──

// respuestaDeLogout({ cookie, secreto, ahoraSeg, db })
//   → { status, body } — el logout INSERTA la revocación del jti (si la sesión
// que llegó tiene jti y hay base) y SIEMPRE ordena borrar la cookie.
export async function respuestaDeLogout({ cookie, secreto, ahoraSeg, db }) {
  if (typeof cookie === 'string' && cookie.length > 0 && typeof secreto === 'string' && secreto.length > 0) {
    const claims = verificar(cookie, secreto, ahoraSeg);
    if (claims && claims.jti) {
      try {
        await revocar(db, claims.jti, claims.exp);
      } catch {
        // la cookie se borra igual: cerrarle la puerta al navegador nunca
        // depende de la base; la revocación es la invalidación del reuso.
      }
    }
  }
  return { status: 200, body: { ok: true }, borrarCookie: true };
}

// ── capa fina de D1 (ADR-007): solo lee/escribe las filas que consume evaluar ─

function aEpoca(created_at) {
  const t = Date.parse(`${created_at}Z`);
  return Number.isNaN(t) ? 0 : t / 1000;
}

export const SQL_INTENTOS = 'SELECT ip, exito, created_at FROM login_attempts WHERE ip = ? AND created_at > ? ORDER BY created_at';
export const SQL_INSERTAR_INTENTO = 'INSERT INTO login_attempts (ip, exito, created_at) VALUES (?, ?, datetime(\'now\'))';

// consultarIntentos(db, ip, desdeSeg) → filas para evaluar(...): { exito: 0|1, created_at: épocaSeg }
export async function consultarIntentos(db, ip, desdeSeg) {
  const { results } = await db.prepare(SQL_INTENTOS).bind(ip, new Date(desdeSeg * 1000).toISOString().slice(0, 19).replace('T', ' ')).all();
  return (results ?? []).map((f) => ({ exito: Number(f.exito), created_at: aEpoca(f.created_at) }));
}

export async function registrarIntento(db, ip, exito) {
  await db.prepare(SQL_INSERTAR_INTENTO).bind(ip, exito ? 1 : 0).run();
}
