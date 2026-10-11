/**
 * Suite T-02-fix — verificación del cableado y del SQL contra los artefactos
 * reales (contracto T-02, ADR-007, ADR-004).
 *
 * ANTECEDENTE: los defectos del smoke del borde (`/api/session` detrás del
 * middleware y el INSERT que no matchea el esquema) pasaron al lado de la
 * suite pelada porque nada verificaba (a) el cableado de rutas públicas y
 * (b) el SQL contra el esquema de verdad. Los dos casos nuevos cubren eso:
 *
 *  - C-02b: el decisor puro de rutas públicas exceptúa GET /api/session y
 *    POST /api/auth/login, y NO exceptúa lo protegido.
 *  - C-04b: node:sqlite (builtin, Node ≥ 22) crea el esquema de verdad con
 *    TODAS las migraciones en orden y después ejecuta el SQL que exporta
 *    routes/auth.js. Si el esquema y el SQL no coinciden, la base RECHAZA,
 *    no un `includes()` — verificación real, no lectura de texto.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ABS = (ruta) => new URL(`../${ruta}`, import.meta.url);

function requerirArchivo(ruta) {
  assert.ok(existsSync(ABS(ruta)), `falta ${ruta}: el modulo pedido no existe todavia`);
}

async function cargar(ruta) {
  requerirArchivo(ruta);
  try {
    return await import(ABS(ruta).href);
  } catch {
    throw new Error(
      `no se pudo cargar ${ruta} en un arbol pelado (¿importa algo que no es builtin de node: o tiene un defecto interno?)`,
    );
  }
}

test('C-02b · /api/session es pública: el decisor de rutas la exceptúa', async () => {
  const { esPublica } = await cargar('src/worker/lib/rutas_publicas.js');
  assert.equal(typeof esPublica, 'function', 'la lista de rutas publicas debe exponer esPublica(metodo, ruta)');

  // Lo público, con el método exacto de la excepción.
  assert.equal(esPublica('POST', '/api/auth/login'), true, 'POST /api/auth/login debe ser pública');
  assert.equal(esPublica('GET', '/api/session'), true, 'GET /api/session debe ser pública (la SPA consulta si hay sesión para decidir login vs app)');

  // Cuidado con el método: la excepción es para GET /api/session.
  assert.equal(esPublica('POST', '/api/session'), false, 'POST /api/session NO es pública: la excepción es solo GET');
  assert.equal(esPublica('DELETE', '/api/auth/login'), false, 'DELETE /api/auth/login NO es pública: la excepción es solo POST');
  assert.equal(esPublica('GET', '/api/auth/login'), false, 'GET /api/auth/login NO es pública: la excepción es solo POST');

  // Lo protegido NO puede quedar público (incluye logout: no se cierra sesión inexistente).
  assert.equal(esPublica('POST', '/api/auth/logout'), false, 'POST /api/auth/logout NO es pública');
  assert.equal(esPublica('GET', '/api/offers'), false, 'GET /api/offers NO es pública');
  assert.equal(esPublica('GET', '/api/applications'), false, 'GET /api/applications NO es pública');
  assert.equal(esPublica('GET', '/api/interviews/proximas'), false, 'GET /api/interviews/proximas NO es pública');
});

test('C-04b · el SQL de login_attempts ejecuta contra el esquema de las migraciones', async () => {
  const rutaMigraciones = ABS('migrations');

  // 1) Esquema REAL: correr todas las migraciones, en orden, en una base en memoria.
  const archivos = readdirSync(rutaMigraciones)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  assert.ok(archivos.length > 0, 'debe haber al menos una migración en migrations/');
  const db = new DatabaseSync(':memory:');
  for (const archivo of archivos) {
    db.exec(readFileSync(join(fileURLToPath(rutaMigraciones), archivo), 'utf8'));
  }
  // El esquema reconstruido tendrá la forma de ADR-007 cuando la migración de
  // alineación corra; esto no se mira con texto, se usa: ver abajo.

  // 2) El SQL de la implementación contra ese esquema real.
  const { SQL_INSERTAR_INTENTO, SQL_INTENTOS } = await cargar('src/worker/routes/auth.js');
  // Insertar un intento real: si el SQL pide columnas que el esquema tiene
  // distinto (o exige datos que el INSERT no trae), la BASE rechaza.
  db.prepare(SQL_INSERTAR_INTENTO).run('203.0.113.7', 0);

  // Consultar la ventana: la consulta debe traer lo que el decisor de C-04 consume.
  const filas = db.prepare(SQL_INTENTOS).all('203.0.113.7', '2020-01-01 00:00:00');
  assert.ok(Array.isArray(filas) && filas.length === 1, `la consulta de intentos debe traer 1 fila del insert recién hecho, obtuve ${filas.length}`);
  assert.equal(filas[0].ip, '203.0.113.7', 'la fila recuperada debe corresponder a la IP insertada');
  assert.equal(filas[0].exito, 0, 'la fila recuperada debe preservar exito=0');
  assert.ok(typeof filas[0].created_at === 'string' && filas[0].created_at.length > 0, 'la fila recuperada debe tener created_at (el INSERT lo completa con datetime)');

  // 3) El índice por (ip, created_at) quedó, según ADR-007.
  const indices = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='login_attempts'").all();
  assert.ok(indices.some((r) => r.name === 'idx_login_attempts_ip_fecha'), 'debe existir el índice idx_login_attempts_ip_fecha para la ventana del límite');

  db.close();
});
