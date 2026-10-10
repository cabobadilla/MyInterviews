/**
 * Suite Ciclo 1 — casos C-01, C-07, C-14, C-18 (contrato T-01).
 *
 * Los casos se verifican renderizando los fixtures con tests/helpers/browser.mjs:
 * la app es una SPA y NO tiene DOM hasta que corre el JS. `pagina.caja(sel)`
 * devuelve el bounding box del elemento si existe y `null` si no — esa es la
 * aserción; `html.includes('#login')` está prohibido (tautología).
 *
 * Cuando el artefacto todavía no existe (la SPA no se construyó, el worker no
 * está, la migración no está), cada caso debe fallar por ASERCIÓN y con su
 * mensaje — nunca por una excepción suelta imprimiendo texto crudo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { abrir } from './helpers/browser.mjs';

const FIXTURE = (nombre) => `public/fixtures/${nombre}`;

function requerirArchivo(ruta) {
  assert.ok(
    existsSync(new URL(`../${ruta}`, import.meta.url)),
    `falta ${ruta}: la SPA no se construyó todavía`,
  );
}

test('C-01 · login: #login está en el DOM renderizado del fixture login.html', async () => {
  requerirArchivo(FIXTURE('login.html'));
  let pagina;
  try {
    pagina = await abrir(FIXTURE('login.html'));
  } catch (err) {
    assert.fail("no se pudo abrir public/fixtures/login.html: el entorno de renderizado no está disponible en este commit");
  }
  try {
    const caja = await pagina.caja('#login');
    assert.notEqual(caja, null, 'esperaba que #login exista en el DOM renderizado de public/fixtures/login.html (caja() devolvió null)');
    assert.ok(caja.width > 0 && caja.height > 0, `esperaba que #login sea visible, medí ${caja.width}x${caja.height}`);
  } catch (err) {
    assert.fail("evaluando #login en public/fixtures/login.html: el render no produjo lo esperado");
  } finally {
    await pagina.cerrar();
  }
});

test('C-07 · nueva-oferta: #nueva-oferta existe en el fixture nueva-oferta.html', async () => {
  requerirArchivo(FIXTURE('nueva-oferta.html'));
  let pagina;
  try {
    pagina = await abrir(FIXTURE('nueva-oferta.html'));
  } catch (err) {
    assert.fail("no se pudo abrir public/fixtures/nueva-oferta.html: el entorno de renderizado no está disponible en este commit");
  }
  try {
    const caja = await pagina.caja('#nueva-oferta');
    assert.notEqual(caja, null, 'esperaba que #nueva-oferta exista en el DOM renderizado de public/fixtures/nueva-oferta.html (caja() devolvió null)');
    assert.ok(caja.width > 0 && caja.height > 0, `esperaba que #nueva-oferta sea visible, medí ${caja.width}x${caja.height}`);
  } catch (err) {
    assert.fail("evaluando #nueva-oferta en public/fixtures/nueva-oferta.html: el render no produjo lo esperado");
  } finally {
    await pagina.cerrar();
  }
});

test('C-14 · detalle-oferta: el fixture detalle-oferta.html muestra los campos de la oferta', async () => {
  requerirArchivo(FIXTURE('detalle-oferta.html'));
  let pagina;
  try {
    pagina = await abrir(FIXTURE('detalle-oferta.html'));
  } catch (err) {
    assert.fail("no se pudo abrir public/fixtures/detalle-oferta.html: el entorno de renderizado no está disponible en este commit");
  }
  try {
    const caja = await pagina.caja('#detalle-oferta');
    assert.notEqual(caja, null, 'esperaba que #detalle-oferta exista en el DOM renderizado de public/fixtures/detalle-oferta.html (caja() devolvió null)');
    const campos = ['titulo', 'empresa', 'seniority', 'modalidad', 'salario', 'ubicacion'];
    for (const campo of campos) {
      const texto = await pagina.texto(`[data-campo="${campo}"]`);
      assert.ok(
        texto && texto.length > 0,
        `esperaba que el campo de la oferta "${campo}" muestre contenido en public/fixtures/detalle-oferta.html, obtuve ${JSON.stringify(texto)}`,
      );
    }
  } catch (err) {
    assert.fail("evaluando los campos en public/fixtures/detalle-oferta.html: el render no produjo lo esperado");
  } finally {
    await pagina.cerrar();
  }
});

test('C-18 · pipeline: #pipeline existe en el fixture pipeline.html', async () => {
  requerirArchivo(FIXTURE('pipeline.html'));
  let pagina;
  try {
    pagina = await abrir(FIXTURE('pipeline.html'));
  } catch (err) {
    assert.fail("no se pudo abrir public/fixtures/pipeline.html: el entorno de renderizado no está disponible en este commit");
  }
  try {
    const caja = await pagina.caja('#pipeline');
    assert.notEqual(caja, null, 'esperaba que #pipeline exista en el DOM renderizado de public/fixtures/pipeline.html (caja() devolvió null)');
    assert.ok(caja.width > 0 && caja.height > 0, `esperaba que #pipeline sea visible, medí ${caja.width}x${caja.height}`);
  } catch (err) {
    assert.fail("evaluando #pipeline en public/fixtures/pipeline.html: el render no produjo lo esperado");
  } finally {
    await pagina.cerrar();
  }
});

test('EXTRA · la migración 0001 crea las tablas del Ciclo 1 y las dos correcciones de ADR-003', async () => {
  const ruta = 'migrations/0001_init.sql';
  assert.ok(
    existsSync(new URL(`../${ruta}`, import.meta.url)),
    `falta ${ruta}: la migración del Ciclo 1 todavía no está`,
  );
  let sql;
  try {
    sql = readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
  } catch (err) {
    assert.fail("no se pudo leer migrations/0001_init.sql: el archivo existe pero no es legible");
  }
  for (const tabla of ['job_offers', 'applications', 'login_attempts', 'profile', 'experiences', 'generated_documents', 'interviews', 'learnings']) {
    assert.ok(sql.includes(`CREATE TABLE ${tabla} (`), `esperaba CREATE TABLE ${tabla} en migrations/0001_init.sql`);
  }
  assert.ok(sql.includes('status_previo'), 'esperaba applications.status_previo (corrección ADR-003) en migrations/0001_init.sql');
  assert.match(sql, /CREATE\s+UNIQUE\s+INDEX\s+idx_docs_actual/i, 'esperaba idx_docs_actual como índice parcial UNIQUE (corrección ADR-003) en migrations/0001_init.sql');
});
