/**
 * Suite T-02-fix3 — /api/session informa estado (criterio C-02, la excepción).
 *
 * El edge real mostró: GET /api/session sin cookie respondía 401
 * {error:'sesión requerida'}, y con cookie respondía {session:{exp:…}} con los
 * claims crudos. El contrato manda SIEMPRE 200 — {autenticado:false} sin cookie
 * válida y {autenticado:true} con ella; nunca 401, y el cuerpo no es los claims
 * crudos. La excepción está escrita acá como caso numerado (C-02).
 *
 * IMPORTABILIDAD (ADR-004): el decisor vive en src/worker/lib/respuesta_sesion.js
 * y solo puede importar node: y lib/session.js (que a su vez solo usa
 * node:crypto). La suite corre en un árbol pelado: si el módulo no existe o no
 * carga, el caso falla por ASERCIÓN con nuestra propia frase, nunca con texto
 * crudo de una excepción.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { firmar } from '../src/worker/lib/session.js';

const ABS = (ruta) => new URL(`../${ruta}`, import.meta.url);

function requerirArchivo(ruta) {
  assert.ok(existsSync(ABS(ruta)), `falta ${ruta}: el decisor del estado de sesión todavía no existe`);
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

test('C-02 · /api/session responde 200 {autenticado:false} sin cookie y {autenticado:true} con cookie válida', async () => {
  const { respuestaSesion } = await cargar('src/worker/lib/respuesta_sesion.js');
  assert.equal(typeof respuestaSesion, 'function', 'respuestaSesion(cookie, secreto, ahoraSeg) debe ser una función exportada de src/worker/lib/respuesta_sesion.js');

  const cookieViva = firmar({ exp: AHORA + 60 * 60 }, SECRETO);
  const cookieFirmaRota = 'cuerpo-roto.firma-rota';
  const cookieVencida = firmar({ exp: AHORA - 10 }, SECRETO);
  const cookieVidaExcesiva = firmar({ exp: AHORA + 40 * 24 * 60 * 60 }, SECRETO); // >30 días

  // ── sin cookie (o vacía): SIEMPRE 200, con {autenticado:false} ──
  for (const sinCookie of [null, undefined, '']) {
    const r = respuestaSesion(sinCookie, SECRETO, AHORA);
    assert.equal(r.status, 200, `sin cookie (valor ${JSON.stringify(sinCookie)}) el estado de sesión se informa con 200, nunca con 401 — la SPA debe distinguir «no hay sesión» de «no puedo preguntar»`);
    assert.deepEqual(r.cuerpo, { autenticado: false }, 'sin cookie el cuerpo debe ser exactamente {autenticado:false}, no los claims crudos ni un error');
    assert.equal(r.borrarCookie, false, 'sin cookie no hay nada que limpiar: borrarCookie debe ser false');
  }

  // ── cookie válida: SIEMPRE 200, con {autenticado:true} ──
  const viva = respuestaSesion(cookieViva, SECRETO, AHORA);
  assert.equal(viva.status, 200, `con cookie válida el estado se informa con 200, obtuve ${viva.status} — un 401 acá le impide a la SPA distinguir estados`);
  assert.deepEqual(viva.cuerpo, { autenticado: true }, 'con cookie válida el cuerpo debe ser exactamente {autenticado:true}, no los claims crudos (session:{exp:…})');
  assert.equal(viva.borrarCookie, false, 'con sesión válida no se borra la cookie');
  assert.equal(JSON.stringify(viva.cuerpo).includes('exp'), false, 'el cuerpo no puede exponer los claims crudos: la forma es {autenticado:<bool>}');

  // ── firma inválida, vencida o vida excesiva: 200 {autenticado:false} + cookie borrada ──
  for (const [nombre, muerta] of [['firma inválida', cookieFirmaRota], ['vencida', cookieVencida], ['vida excesiva', cookieVidaExcesiva]]) {
    const r = respuestaSesion(muerta, SECRETO, AHORA);
    assert.equal(r.status, 200, `con cookie ${nombre} también se informa estado con 200 (nunca 401 en /api/session)`);
    assert.deepEqual(r.cuerpo, { autenticado: false }, `con cookie ${nombre} el cuerpo debe ser {autenticado:false}`);
    assert.equal(r.borrarCookie, true, `una cookie muerta que el navegador sigue mandando es una cookie que hay que limpiar: con cookie ${nombre} la respuesta debe borrar la cookie vieja`);
  }

  // ── sin secreto configurado: falla cerrado, pero SIEMPRE 200 ──
  const sinSecreto = respuestaSesion(cookieViva, undefined, AHORA);
  assert.equal(sinSecreto.status, 200, 'sin secreto no se puede validar la firma: también es estado no autenticado, informado con 200');
  assert.deepEqual(sinSecreto.cuerpo, { autenticado: false }, 'sin secreto el cuerpo debe ser {autenticado:false}');
});

test('C-02b · el cableado de GET /api/session usa el decisor y nunca devuelve 401', async () => {
  requerirArchivo('src/worker/index.js');
  requerirArchivo('src/worker/lib/respuesta_sesion.js');
  const cableado = readFileSync(ABS('src/worker/index.js'), 'utf8');

  assert.ok(cableado.includes("respuestaSesion"), 'el cableado de GET /api/session debe usar el decisor respuestaSesion — la forma de la respuesta sale del cableado y pasa al módulo');

  // El bloque del handler de /api/session no puede devolver 401 ni montar el
  // cuerpo con los claims crudos: es la ruta que INFORMA estado, no bloquea.
  const iniciador = cableado.indexOf("app.get('/api/session'");
  assert.ok(iniciador !== -1, 'el cableado debe tener una ruta app.get /api/session');
  const fin = cableado.indexOf('app.', iniciador + 1);
  const handler = cableado.slice(iniciador, fin === -1 ? cableado.length : fin);
  assert.ok(!handler.includes("401"), 'GET /api/session no puede devolver 401: la excepción C-02 manda 200 siempre');
  assert.ok(!handler.includes("verificar("), 'el cableado no debe verificar la firma por su cuenta: uso el decisor respuestaSesion');
  assert.ok(!handler.includes("sesion requerida"), 'el handler de /api/session no debe responder el cuerpo de barrera {error:"sesión requerida"}');

  // La barrera C-06 sigue intacta: el middleware de /api/* protegido sigue
  // respondiendo 401 con la cookie borrada — eso es otro camino y no se toca.
  const middleware = cableado.slice(cableado.indexOf("app.use('/api/*'"), cableado.indexOf("app.get('/api/session'"));
  assert.ok(middleware.includes('401'), 'la barrera C-06 en /api/* protegido debe seguir devolviendo 401 con la cookie borrada');
});
