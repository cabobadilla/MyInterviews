/**
 * Suite T-02-fix6 — la revocación entiende las DOS formas de respuesta.
 *
 * El defecto, medido contra `wrangler dev` real: el login emitía una cookie y
 * el request siguiente ya la negaba. La consulta estaba bien; estaba mal la
 * LECTURA de la respuesta, porque hay dos formas:
 *   - node:sqlite → .all() devuelve un ARRAY de filas.
 *   - D1          → .all() devuelve un OBJETO { results, success, meta }.
 * `Boolean({results: []})` es true: con la rama D1, toda sesión parecía
 * revocada. Ninguna prueba sellada lo ve: las de SQL corren contra
 * node:sqlite, que devuelve el array.
 *
 * IMPORTABILIDAD (ADR-004): la base acá es un objeto de mentira con
 * prepare() que devuelve { all: () => … }, sin .bind, sin node:sqlite,
 * sin wrangler y sin red. El árbol pelado basta.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const ABS = (ruta) => new URL(`../${ruta}`, import.meta.url);

test('C-05 · la revocación entiende las DOS formas de respuesta: array (node:sqlite) y {results} (D1)', async () => {
  assert.ok(existsSync(ABS('src/worker/lib/revocacion.js')), 'falta src/worker/lib/revocacion.js: el módulo pedido todavía no existe');

  const { verificarRevocacion } = await import(ABS('src/worker/lib/revocacion.js').href);
  assert.equal(typeof verificarRevocacion, 'function', 'verificarRevocacion(db, jti) debe seguir exportándose de src/worker/lib/revocacion.js con la misma firma');

  // Base de mentira: prepare() devuelve { all } que responde con lo que le
  // programemos. Sin .bind (rama posicional del adaptador). Sin excepciones:
  // si algo explota, el caso falla con nuestra frase, no con texto crudo.
  const baseDeMentira = (respuesta) => ({
    prepare: () => ({ all: () => respuesta }),
  });

  const casos = [
    // forma node:sqlite (array)
    { forma: 'array vacío (node:sqlite)', respuesta: [], esperado: false },
    { forma: 'array con una fila (node:sqlite)', respuesta: [{ r: 1 }], esperado: true },
    // forma D1 ({results, success, meta})
    { forma: 'objeto D1 con results vacío', respuesta: { results: [], success: true, meta: {} }, esperado: false },
    { forma: 'objeto D1 con una fila en results', respuesta: { results: [{ r: 1 }], success: true, meta: {} }, esperado: true },
  ];

  const falladas = [];
  for (const { forma, respuesta, esperado } of casos) {
    let obtenido;
    try {
      obtenido = await verificarRevocacion(baseDeMentira(respuesta), 'jti-de-prueba');
    } catch {
      assert.fail(`la forma "${forma}" no debería lanzar una excepción: verificarRevocacion debe leer la respuesta, no estrellarse contra ella`);
    }
    if (obtenido !== esperado) {
      falladas.push(`forma "${forma}": esperado ${esperado}, obtenido ${obtenido} — la revocación debe devolver true SOLO si hay al menos una fila, en ambas formas de respuesta (array de node:sqlite y {results} de D1)`);
    }
  }

  assert.equal(falladas.length, 0, falladas.length > 0 ? falladas.join(' | ') : 'sin formas mal leídas');
});
