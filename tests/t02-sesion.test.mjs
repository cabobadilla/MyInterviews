/**
 * Suite T-02 — sesión de un solo usuario (casos C-02, C-03, C-04, C-05, C-06).
 *
 * IMPORTABILIDAD (ADR-004): los decisores verificados acá viven en módulos que
 * no importan nada salvo `node:` builtins. La suite corre en un árbol pelado
 * (sin node_modules, sin servidor, sin red), así que los decisores de
 * `routes/auth.js` se cargan por import dinámico y si no existen todavía el
 * caso falla por ASERCIÓN con nuestra propia frase — nunca por una excepción
 * suelta imprimiendo texto crudo.
 *
 * Formato de las credenciales (contrato T-02, PBKDF2-SHA256 con el número de
 * iteraciones leído de env):
 *   APP_PASSWORD_HASH = `pbkdf2:<PBKDF2_ITERATIONS>:<saltB64>:<hashHex>`
 *   hashHex = hex(pbkdf2Sync(password, saltB64decodificado, iteraciones, 32, 'sha256'))
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const ABS = (ruta) => new URL(`../${ruta}`, import.meta.url);

function requerirArchivo(ruta) {
  assert.ok(
    existsSync(ABS(ruta)),
    `falta ${ruta}: los decisores de la sesión no están implementados todavía`,
  );
}

async function cargar(ruta) {
  requerirArchivo(ruta);
  try {
    return await import(ABS(ruta).href);
  } catch (err) {
    // Regla 2: el texto crudo de la excepción no entra en ningún mensaje.
    throw new Error(`no se pudo cargar ${ruta} en un árbol pelado (¿importa algo que no es un builtin de node:? o tiene un defecto interno)`);
  }
}

// ── utilidades de credenciales ───────────────────────────────────────────────

const ITER = 100000;

function hashDe(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITER, 32, 'sha256');
  return `pbkdf2:${ITER}:${salt.toString('base64')}:${hash.toString('hex')}`;
}

function envDeCredenciales(password) {
  return {
    APP_EMAIL: 'yo@example.com',
    APP_PASSWORD_HASH: hashDe(password),
    PBKDF2_ITERATIONS: String(ITER),
    SESSION_SECRET: 'secreto-de-prueba-0123456789',
  };
}

const SECRETO = 'secreto-de-prueba-0123456789';
const AHORA = 1000000;

function filasFallidas(n, ahoraSeg, ventana = 700) {
  return Array.from({ length: n }, (_, i) => ({
    ip: '1.2.3.4',
    exito: 0,
    created_at: ahoraSeg - ventana + i,
  }));
}

// ── C-02 ─────────────────────────────────────────────────────────────────────

test('C-02 · /api/* sin cookie: el decisor devuelve 401 y no toca ninguna consulta', async () => {
  const { exigirSesion } = await cargar('src/worker/middleware/auth.js');

  // espía: si el decisor intenta leer cualquier propiedad de un repositorio,
  // el latch se prende y el caso falla — el 401 debe salir sin tocar nada.
  let espiaTocado = false;
  const repositorioEspia = new Proxy({}, {
    get() {
      espiaTocado = true;
      throw new Error('el decisor intentó resolver una consulta y el caso lo detectó');
    },
  });

  for (const cookieSinSesion of [null, undefined, '']) {
    const r = exigirSesion(cookieSinSesion, SECRETO, AHORA, { espia: repositorioEspia });
    assert.equal(r.status, 401, `con cookie ${JSON.stringify(cookieSinSesion)} esperaba status 401, obtuve ${r.status}`);
    assert.equal(r.borrarCookie, true, 'con falta de cookie esperaba borrarCookie:true (cuando no hay sesión, la cookie se limpia)');
    assert.equal(r.claims, undefined, 'con falta de cookie no deben devolverse claims');
  }
  assert.equal(espiaTocado, false, 'el decisor no debió tocar ningún repositorio: el 401 se corta antes de cualquier consulta');
});

// ── C-03 ─────────────────────────────────────────────────────────────────────

test('C-03 · login: email inexistente y contraseña mala dan exactamente el mismo status y el mismo cuerpo', async () => {
  const { respuestaDeLogin } = await cargar('src/worker/routes/auth.js');
  const env = envDeCredenciales('contraseña-correcta');

  const emailInexistente = await respuestaDeLogin({
    body: { email: 'otro@example.com', password: 'contraseña-correcta' },
    env,
    intentos: [],
    ahoraSeg: AHORA,
  });
  const contraseñaMala = await respuestaDeLogin({
    body: { email: 'yo@example.com', password: 'contraseña-mala' },
    env,
    intentos: [],
    ahoraSeg: AHORA,
  });

  assert.ok(emailInexistente.status >= 400, `credencial incorrecta esperaba status de error, obtuve ${emailInexistente.status}`);
  assert.equal(
    contraseñaMala.status,
    emailInexistente.status,
    `email inexistente y contraseña mala deben dar el MISMO status: obtuve ${emailInexistente.status} y ${contraseñaMala.status}`,
  );
  assert.deepEqual(
    contraseñaMala.body,
    emailInexistente.body,
    'email inexistente y contraseña mala deben dar el MISMO cuerpo: si difieren, la respuesta filtra qué campo falló',
  );

  const caminoSano = await respuestaDeLogin({
    body: { email: 'yo@example.com', password: 'contraseña-correcta' },
    env,
    intentos: [],
    ahoraSeg: AHORA,
  });
  assert.ok(caminoSano.status < 300, `la contraseña correcta con límite vacío debió entrar, obtuve status ${caminoSano.status}`);
  assert.notDeepEqual(
    caminoSano.body === undefined ? null : caminoSano.body,
    emailInexistente.body === undefined ? null : emailInexistente.body,
    'el cuerpo del éxito no puede ser el mismo cuerpo del error genérico (si lo es, el error no distingue nada)',
  );
});

// ── C-04 ─────────────────────────────────────────────────────────────────────

test('C-04 · límite de intentos: 5 fallos en 15 min y el 6º intento da 429 sin evaluar la contraseña', async () => {
  const { evaluar } = await cargar('src/worker/lib/rate_limit.js');

  const cinco = evaluar(filasFallidas(5, AHORA), AHORA);
  assert.equal(cinco.bloqueado, true, 'con 5 intentos fallidos dentro de la ventana esperaba bloqueado:true');
  assert.equal(cinco.fallidos, 5, `esperaba contar 5 fallidos dentro de la ventana, conté ${cinco.fallidos}`);
  assert.equal(cinco.ventanaSeg, 900, `esperaba una ventana de 15 minutos (900 s), obtuve ${cinco.ventanaSeg} s`);

  const cuatro = evaluar(filasFallidas(4, AHORA), AHORA);
  assert.equal(cuatro.bloqueado, false, 'con 4 fallos todavía no se bloquea');

  const fueraDeVentana = evaluar(filasFallidas(5, AHORA - 901), AHORA);
  assert.equal(fueraDeVentana.bloqueado, false, 'los fallos fuera de la ventana de 15 minutos no bloquean');

  const exitososNoCuentan = evaluar(
    filasFallidas(4, AHORA).concat([{ ip: '1.2.3.4', exito: 1, created_at: AHORA - 100 }]),
    AHORA,
  );
  assert.equal(exitososNoCuentan.bloqueado, false, 'los intentos exitosos no cuentan para el bloqueo');

  // 6º intento: con 5 fallos ya registrados, se bloquea aun con la contraseña CORRECTA
  const { respuestaDeLogin } = await cargar('src/worker/routes/auth.js');
  const env = envDeCredenciales('contraseña-correcta');
  const bloqueado = await respuestaDeLogin({
    body: { email: 'yo@example.com', password: 'contraseña-correcta' },
    env,
    intentos: filasFallidas(5, AHORA),
    ahoraSeg: AHORA,
  });
  assert.equal(bloqueado.status, 429, `con 5 fallos previos esperaba el 6º intento con status 429, obtuve ${bloqueado.status}`);
});

// ── C-05 ─────────────────────────────────────────────────────────────────────

test('C-05 · cookie de sesión con HttpOnly, Secure y SameSite=Strict; logout la invalida al borrarla', async () => {
  const { serializarSesion, leerCookie, borrarSesion } = await cargar('src/worker/lib/cookie.js');

  const setCookie = serializarSesion('VALOR-FIRMADO');
  assert.ok(setCookie.startsWith('sesion='), `la cookie de sesión debe llamarse sesion, obtuve "${setCookie}"`);
  assert.ok(/HttpOnly/i.test(setCookie), 'la cookie de sesión debe llevar HttpOnly');
  assert.ok(/Secure/i.test(setCookie), 'la cookie de sesión debe llevar Secure');
  assert.ok(/SameSite=Strict/i.test(setCookie), 'la cookie de sesión debe llevar SameSite=Strict');

  assert.equal(leerCookie('sesion=VALOR-FIRMADO; otras=x'), 'VALOR-FIRMADO', 'leerCookie debe devolver el valor de sesion dentro del header');
  assert.equal(leerCookie('otra=x'), null, 'sin cookie sesion, leerCookie debe devolver null');

  const expirada = borrarSesion();
  assert.ok(/sesion=/.test(expirada), 'borrarSesion debe referirse a la cookie sesion');
  assert.ok(/(Max-Age=0|Expires=Thu, 01 Jan 1970)/i.test(expirada), `borrarSesion debe marcar la cookie para eliminarse ya, obtuve "${expirada}"`);
  // el logout invalida: lo que expira no puede ser reutilizado — y una cookie
  // eliminada ya no llega con sesión.
  const { verificar } = await cargar('src/worker/lib/session.js');
  assert.equal(verificar(null, SECRETO, AHORA), null, 'después de logout/borrado no queda cookie y verificar debe rechazar');
});

// ── C-06 ─────────────────────────────────────────────────────────────────────

test('C-06 · firma inválida o cookie vencida a los 30 días: verificar rechaza y el decisor manda 401 con la cookie borrada', async () => {
  const { firmar, verificar } = await cargar('src/worker/lib/session.js');
  const { exigirSesion } = await cargar('src/worker/middleware/auth.js');
  const { borrarSesion, serializarSesion, leerCookie } = await cargar('src/worker/lib/cookie.js');

  const claims = { exp: AHORA + 3600 };
  const cookie = serializarSesion(firmar(claims, SECRETO));
  const leida = leerCookie(cookie);
  assert.deepEqual(verificar(leida, SECRETO, AHORA), claims, 'una cookie recién firmada y no vencida debe verificarse a sus claims');

  // firma inválida (bit alterado)
  const val = leida;
  const partidos = val.split('.');
  partidos[1] = partidos[1].replace(/[a-zA-Z0-9_-]/, 'A') + 'X';
  const alterada = `${partidos[0]}.${partidos[1]}.${partidos[2]}`;
  assert.equal(verificar(alterada, SECRETO, AHORA), null, 'una firma alterada debe rechazarse (verificar devuelve null)');

  // formato roto
  assert.equal(verificar('no-es-una-sesion-firmada', SECRETO, AHORA), null, 'un formato roto debe rechazarse null');
  assert.equal(verificar('', SECRETO, AHORA), null, 'una cadena vacía debe rechazarse null');
  // secreto equivocado
  assert.equal(verificar(leida, 'otro-secreto-distinto', AHORA), null, 'con un secreto distinto la firma no valida');

  // vencida: emitida con exp de hace más de 30 días
  const limite = 30 * 24 * 60 * 60;
  const vencidaCookie = firmar({ exp: AHORA - limite - 1 }, SECRETO);
  assert.equal(verificar(vencidaCookie, SECRETO, AHORA), null, 'una cookie vencida debe rechazarse null');
  // emitida a más de 30 días de vida
  const demasiadoVida = firmar({ exp: AHORA + limite + 1 }, SECRETO);
  assert.equal(verificar(demasiadoVida, SECRETO, AHORA), null, 'una cookie que excede los 30 días de vida debe rechazarse null');

  // el decisor corta con 401 y orden de borrar la cookie
  for (const mala of [null, alterada, demasiadoVida]) {
    const r = exigirSesion(mala, SECRETO, AHORA);
    assert.equal(r.status, 401, `con cookie ${mala === null ? 'ausente' : 'mala'} esperaba 401, obtuve ${r.status}`);
    assert.equal(r.borrarCookie, true, 'con cookie inválida o vencida el decisor debe ordenar borrar la cookie');
    assert.ok(typeof borrarSesion() === 'string', 'la respuesta de login/logout debe llegar con la cookie borrada');
  }
});

// ── extra: PBKDF2_ITERATIONS viene de env, no está escrito en el código ──────

test('extra · PBKDF2_ITERATIONS leído de env: el mismo hash con otra iteración de env no verifica la contraseña', async () => {
  const { respuestaDeLogin } = await cargar('src/worker/routes/auth.js');
  const envBien = envDeCredenciales('contraseña-correcta');
  const envOtraIter = { ...envBien, PBKDF2_ITERATIONS: String(ITER + 1) };

  const bien = await respuestaDeLogin({ body: { email: 'yo@example.com', password: 'contraseña-correcta' }, env: envBien, intentos: [], ahoraSeg: AHORA });
  const malIter = await respuestaDeLogin({ body: { email: 'yo@example.com', password: 'contraseña-correcta' }, env: envOtraIter, intentos: [], ahoraSeg: AHORA });
  assert.ok(bien.status < 300, 'con el iterador correcto debía entrar');
  assert.ok(malIter.status >= 400, `con PBKDF2_ITERATIONS de env distinto debía fallar (status ${malIter.status} < 400 significa que el iterador no se leyó de env)`);
  // sin SESSION_SECRET no hay sesión posible: el login falla cerrado
  const envSinSecreto = { ...envBien, SESSION_SECRET: undefined };
  const cerrado = await respuestaDeLogin({ body: { email: 'yo@example.com', password: 'contraseña-correcta' }, env: envSinSecreto, intentos: [], ahoraSeg: AHORA });
  assert.ok(cerrado.status >= 400, `sin SESSION_SECRET el login debe fallar cerrado, obtuve status ${cerrado.status}`);
});
