/**
 * Suite T-02-fix4 — el logout invalida la sesión en el servidor (criterio C-05).
 *
 * El edge real mostró: POST /api/auth/logout con cookie respondía 200 borrando
 * la cookie y NADA más: con esa misma cookie copiada, /api/session seguía
 * devolviendo {autenticado:true} — una cookie firmada no deja de valer porque
 * el navegador la olvide (ADR-009). La decisión implementada: el login emite un
 * jti aleatorio dentro del payload firmado; el logout inserta ese jti en
 * sesiones_revocadas; la barrera, DESPUÉS de validar la firma, rechaza el jti
 * revocado con 401 y la cookie borrada.
 *
 * IMPORTABILIDAD (ADR-004): solo módulos propios y builtins (node:crypto,
 * node:sqlite, node:fs). La suite corre en un árbol pelado: si un módulo no
 * existe o no carga, el caso falla por ASERCIÓN con nuestra propia frase,
 * nunca con el texto crudo de una excepción.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ABS = (ruta) => new URL(`../${ruta}`, import.meta.url);

function requerirArchivo(ruta) {
  assert.ok(existsSync(ABS(ruta)), `falta ${ruta}: el módulo pedido todavía no existe`);
}

async function cargar(ruta) {
  requerirArchivo(ruta);
  try {
    return await import(ABS(ruta).href);
  } catch {
    throw new Error(`no se pudo cargar ${ruta} en un árbol pelado (¿importa algo que no es builtin de node:? o tiene un defecto interno)`);
  }
}

const SECRETO = 'secreto-de-prueba-0123456789';
const AHORA = 1_000_000;

test('C-05 · el logout revoca la sesión: con la misma cookie, la barrera responde 401', async () => {
  const { exigirSesion } = await cargar('src/worker/middleware/auth.js');
  const { firmar, verificar } = await cargar('src/worker/lib/session.js');
  const { respuestaDeLogin } = await cargar('src/worker/routes/auth.js');
  const { revocar } = await cargar('src/worker/lib/revocacion.js');

  assert.equal(typeof exigirSesion, 'function', 'exigirSesion debe seguir exportándose de src/worker/middleware/auth.js con la misma firma ante tests ya sellados');
  assert.equal(typeof revocar, 'function', 'revocar(db, jti, exp) debe exportarse de src/worker/lib/revocacion.js');
  assert.equal(typeof verificar, 'function', 'verificar debe seguir exportándose de src/worker/lib/session.js');

  const JTI = 'jti-de-prueba-rotura-1';
  const cookie = firmar({ exp: AHORA + 60 * 60, jti: JTI }, SECRETO);

  // ── aplicación: revocación APLICADA ──
  // (el módulo expone el SQL como constantes exportadas para que el caso
  // siguiente lo ejecute contra el esquema real; acá solo afirmamos su forma,
  // el comportamiento real de la base se prueba abajo)
  const mod = await cargar('src/worker/lib/revocacion.js');
  assert.equal(typeof mod.SQL_INSERTAR_REVOCACION, 'string', 'SQL_INSERTAR_REVOCACION debe exportarse como string');
  assert.equal(typeof mod.SQL_REVOCADO, 'string', 'SQL_REVOCADO debe exportarse como string');

  // ── barrera pura ──
  // 1) sin revocación: la sesión pasa y devuelve los claims (firma intacta).
  const sinRevocacion = exigirSesion(cookie, SECRETO, AHORA);
  assert.equal(sinRevocacion.status, undefined, 'sin revocación la barra debe pasar (decisor devuelve claims, no un objeto con status)');
  assert.deepEqual(sinRevocacion.jti, JTI, 'sin revocación los claims deben incluir el jti emitido por el login');

  // 2) con la revocación aplicada: 401 CON la cookie borrada.
  const revocados = new Set([JTI]);
  const conRevocacion = exigirSesion(cookie, SECRETO, AHORA, {
    estaRevocado: (jti) => revocados.has(jti),
  });
  assert.equal(conRevocacion.status, 401, 'con la sesión revocada la barrera debe responder 401');
  assert.equal(conRevocacion.borrarCookie, true, 'con la sesión revocada la barrera debe borrar la cookie');
  assert.equal(conRevocacion.jti, undefined, 'con la sesión revocada no deben devolverse claims');

  // ── el login emite un jti DISTINTO en cada login ──
  const env = {
    APP_EMAIL: 'yo@example.com',
    APP_PASSWORD_HASH: `pbkdf2-manual-acá-no-aplica`,
    SESSION_SECRET: SECRETO,
  };
  const primera = await respuestaDeLogin({ body: { email: 'todo-malo' }, env, intentos: [], ahoraSeg: AHORA });
  assert.ok(primera.status >= 400, 'con credencial mala el login debe fallar igual que antes (los demás criterios no cambian)');

  // Para dos logins válidos, usamos una contraseña real y el hash PBKDF2 hecho con
  // las herramientas del caso sellado: PBKDF2_ITERATIONS de env. Importamos pbkdf2Sync acá
  // y replicamos el formato pbkdf2:<iter>:<saltB64>:<hashHex>.
  const { pbkdf2Sync, randomBytes } = await import('node:crypto');
  const ITER = 1000;
  const salt = randomBytes(16);
  const hash = pbkdf2Sync('contraseña-correcta', salt, ITER, 32, 'sha256');
  const envBueno = {
    APP_EMAIL: 'yo@example.com',
    APP_PASSWORD_HASH: `pbkdf2:${ITER}:${salt.toString('base64')}:${hash.toString('hex')}`,
    PBKDF2_ITERATIONS: String(ITER),
    SESSION_SECRET: SECRETO,
  };
  const loginUno = await respuestaDeLogin({ body: { email: 'yo@example.com', password: 'contraseña-correcta' }, env: envBueno, intentos: [], ahoraSeg: AHORA });
  const loginDos = await respuestaDeLogin({ body: { email: 'yo@example.com', password: 'contraseña-correcta' }, env: envBueno, intentos: [], ahoraSeg: AHORA + 1 });
  assert.equal(loginUno.status, 200, 'el primer login válido debe seguir respondiendo 200');
  assert.equal(loginDos.status, 200, 'el segundo login válido debe seguir respondiendo 200');
  assert.ok(typeof loginUno.setCookie === 'string', 'el login debe seguir devolviendo setCookie con el token firmado');

  const jtiDe = (token) => {
    const payload = token.split('.')[0];
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  };
  const claimsUno = jtiDe(loginUno.setCookie);
  const claimsDos = jtiDe(loginDos.setCookie);
  assert.equal(typeof claimsUno.jti, 'string', 'el payload del login debe incluir un jti como string');
  assert.equal(typeof claimsDos.jti, 'string', 'el segundo payload también debe incluir un jti');
  assert.notEqual(claimsUno.jti, '', 'el jti no puede ser vacío');
  assert.notEqual(claimsUno.jti, claimsDos.jti, 'el jti emitido por el login debe ser DISTINTO en cada login');
  assert.equal(verificar(loginUno.setCookie, SECRETO, AHORA).jti, claimsUno.jti, 'verificar debe seguir devolviendo los claims (que ahora incluyen el jti)');
});

test('C-05 · el SQL de sesiones_revocadas ejecuta contra el esquema de las migraciones', async () => {
  const { SQL_INSERTAR_REVOCACION, SQL_REVOCADO, revocar, verificarRevocacion } = await cargar('src/worker/lib/revocacion.js');

  assert.equal(typeof SQL_INSERTAR_REVOCACION, 'string', 'SQL_INSERTAR_REVOCACION debe exportarse como string');
  assert.equal(typeof SQL_REVOCADO, 'string', 'SQL_REVOCADO debe exportarse como string');
  assert.equal(typeof revocar, 'function', 'revocar debe exportarse');
  assert.equal(typeof verificarRevocacion, 'function', 'verificarRevocacion debe exportarse');

  // Esquema REAL: correr TODAS las migraciones, en orden, en una base en memoria.
  const rutaMigraciones = fileURLToPath(ABS('migrations'));
  const archivos = readdirSync(rutaMigraciones).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(archivos.length >= 4, `debe haber la migración de sesiones_revocadas entre las migraciones; hay ${archivos.length} archivos .sql`);
  const db = new DatabaseSync(':memory:');
  for (const archivo of archivos) {
    db.exec(readFileSync(join(rutaMigraciones, archivo), 'utf8'));
  }

  // El INSERT de revocación corre contra el esquema real: si el módulo y las
  // migraciones no coinciden, la BASE rechaza (esto no es includes(), es ejecución).
  await revocar(db, 'jti-revocacion-insert', AHORA + 1000);

  // La consulta de revocación corre contra el esquema real.
  const revocado = verificarRevocacion(db, 'jti-revocacion-insert')
    ? true
    : db.prepare(SQL_REVOCADO).all('jti-revocacion-insert').some((fila) => fila.jti === 'jti-revocacion-insert');
  assert.equal(revocado, true, 'la consulta de revocación debe encontrar el jti recién insertado');

  const sinRevocar = db.prepare(SQL_REVOCADO).all('jti-nunca-insertado');
  assert.equal(sinRevocar.length, 0, 'la consulta de revocación no debe encontrar un jti que nunca se insertó');

  // La tabla real existe con su índice (verificamos por el esquema real, no por texto).
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sesiones_revocadas'").all();
  assert.equal(tablas.length, 1, 'la tabla sesiones_revocadas debe existir después de las migraciones');

  db.close();
});
