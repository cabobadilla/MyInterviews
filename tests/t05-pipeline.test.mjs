/**
 * Suite T-05 — el pipeline: contadores por estado, altas sin recarga,
 * próximas entrevistas y las tres mediciones de FORMA (contrato T-05).
 *
 * Casos del contrato: C-19, C-20, C-21 (comportamiento/datos) y C-22, C-23,
 * C-24 (forma).
 *
 * Cómo se mide:
 *   - Los datos y el ordenamiento (C-19 API, C-21 API) se miden ejecutando los
 *     decisores puros `respuestaDeAplicaciones` / `respuestaDeProximasEntrevistas`
 *     contra una base D1 de mentira (árbol pelado, sin red, sin node_modules).
 *   - Lo que se VE (contadores, alta sin recarga, bloque de próximas, y las tres
 *     formas) se mide con `tests/helpers/browser.mjs` sobre el fixture
 *     `public/fixtures/pipeline.html`, que monta los componentes REALES de la
 *     SPA con datos fijos. La geometría sale de `pagina.caja(sel)` (x/y/width/
 *     height), nunca de leer el texto del artefacto.
 *
 * Regla dura de aserciones: ningún mensaje puede contener el texto crudo de una
 * excepción. Los `abrir`/`import` van envueltos y fallan por aserción propia.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { abrir } from './helpers/browser.mjs';

// ─── carga de arnés (debe fallar por ASERCIÓN, nunca por excepción cruda) ────

const ABS = (ruta) => new URL(`../${ruta}`, import.meta.url);

function requerirArchivo(ruta) {
  assert.ok(
    existsSync(ABS(ruta)),
    `falta ${ruta}: el artefacto del entregable aún no está en este commit`,
  );
}

async function cargar(ruta) {
  requerirArchivo(ruta);
  try {
    return await import(ABS(ruta).href);
  } catch {
    assert.fail(
      `el módulo ${ruta} no se pudo importar en el árbol pelado: importa algo no-builtin o aún no está la implementación`,
    );
  }
}

// ─── base D1 de mentira (forma viva {results, success, meta}) ────────────────
// Una sola base que responde a los dos SELECT del pipeline: applications y
// interviews. Devuelve las filas sembradas según el SQL que le llega.

function baseDeMentira({ aplicaciones = [], entrevistas = [] } = {}) {
  const bitacora = [];
  const db = {
    prepare(sql) {
      const stmt = { sql: String(sql), args: null };
      const acc = {
        bind(...args) { stmt.args = args; return acc; },
        async all() {
          bitacora.push({ sql: stmt.sql, args: stmt.args ?? [] });
          let filas;
          if (/FROM interviews\b/i.test(stmt.sql)) filas = entrevistas.map((f) => ({ ...f }));
          else filas = aplicaciones.map((f) => ({ ...f }));
          return { results: filas, success: true, meta: {} };
        },
      };
      return acc;
    },
  };
  return { db, bitacora };
}

// ─── datos fijos del fixture y del contrato ──────────────────────────────────

const ESTADOS = ['borrador', 'preparando', 'enviada', 'entrevistas', 'oferta', 'rechazada', 'cerrada'];

const AHORA = '2026-10-15T00:00:00Z';

const FIXTURE = (caso) =>
  `public/fixtures/pipeline.html${caso ? `?caso=${caso}` : ''}`;

// ─── navegador: abrir y esperar sin filtros de excepción cruda ───────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrirSeguro(ruta) {
  try {
    return await abrir(ruta);
  } catch {
    assert.fail(`no se pudo abrir ${ruta} en el navegador de pruebas`);
  }
}

async function clickSeguro(pagina, sel) {
  try {
    await pagina.click(sel);
  } catch {
    assert.fail(`esperaba poder hacer click en ${sel}, pero no estaba en la pantalla`);
  }
}

async function textoSeguro(pagina, sel) {
  try {
    return await pagina.texto(sel);
  } catch {
    assert.fail(`esperaba poder leer ${sel} en la pantalla`);
  }
}

async function esperar(pagina, sel, presente = true, vueltas = 60) {
  for (let i = 0; i < vueltas; i++) {
    const caja = await pagina.caja(sel);
    if (presente ? caja != null : caja == null) return caja;
    await sleep(100);
  }
  assert.fail(
    `la vista no quedó como se esperaba: ${presente ? 'falta' : 'sobra'} ${sel} (timeout de espera)`,
  );
}

// ─── C-19 · los 7 contadores, siempre, con los ceros ─────────────────────────

test('C-19 · GET /api/applications entrega los 7 contadores por estado, con los ceros incluidos', async () => {
  const routes = await cargar('src/worker/routes/pipeline.js');
  assert.equal(
    typeof routes.respuestaDeAplicaciones,
    'function',
    'routes/pipeline debe exportar respuestaDeAplicaciones({ db }) para el GET /api/applications',
  );

  const { db } = baseDeMentira({
    aplicaciones: [
      { id: 1, status: 'borrador', titulo: 'Frontend Engineer', empresa: 'Acme' },
      { id: 2, status: 'borrador', titulo: 'Data Analyst', empresa: 'Beta' },
      { id: 3, status: 'oferta', titulo: 'SRE', empresa: 'Delta' },
    ],
  });
  const r = await routes.respuestaDeAplicaciones({ db });
  assert.equal(r.status, 200, `esperaba 200 del pipeline, obtuve ${r.status}`);
  const contadores = r.body?.contadores;
  assert.ok(contadores && typeof contadores === 'object', 'la respuesta lleva el objeto contadores');

  const claves = Object.keys(contadores).sort();
  assert.deepEqual(claves, [...ESTADOS].sort(), `contadores debe traer exactamente los 7 estados, trajo ${claves.join(', ')}`);

  for (const estado of ESTADOS) {
    assert.ok(Number.isInteger(contadores[estado]), `el contador de "${estado}" debe ser un entero, fue ${JSON.stringify(contadores[estado])}`);
  }
  assert.equal(contadores.borrador, 2, 'el contador de borrador cuenta las dos filas sembradas');
  assert.equal(contadores.oferta, 1, 'el contador de oferta cuenta la fila sembrada');
  for (const estado of ['preparando', 'enviada', 'entrevistas', 'rechazada', 'cerrada']) {
    assert.equal(contadores[estado], 0, `el estado "${estado}" sin filas se informa como 0, no ausente`);
  }
});

test('C-19 · la pantalla del pipeline muestra los 7 contadores, ceros incluidos', async () => {
  const pagina = await abrirSeguro(FIXTURE('pipeline-con-datos'));
  try {
    await esperar(pagina, '#pipeline');
    for (const estado of ESTADOS) {
      const caja = await pagina.caja(`#contador-${estado}`);
      assert.notEqual(caja, null, `esperaba el contador del estado "${estado}" en la pantalla (#contador-${estado})`);
      const numero = await textoSeguro(pagina, `#contador-${estado}`);
      assert.match(String(numero).trim(), /^\d+$/, `el contador de "${estado}" muestra un número, mostró ${JSON.stringify(numero)}`);
    }
    assert.equal((await textoSeguro(pagina, '#contador-borrador')).trim(), '2', 'la pantalla refleja las 2 postulaciones sembradas en borrador');
    assert.equal((await textoSeguro(pagina, '#contador-cerrada')).trim(), '0', 'el estado cerrada, sin filas, se ve como 0');
  } finally {
    await pagina.cerrar();
  }
});

test('C-19 · con la lista vacía los 7 contadores existen y valen 0', async () => {
  const { db } = baseDeMentira({ aplicaciones: [] });
  const routes = await cargar('src/worker/routes/pipeline.js');
  const r = await routes.respuestaDeAplicaciones({ db });
  assert.equal(r.status, 200, `esperaba 200 con la lista vacía, obtuve ${r.status}`);
  assert.deepEqual(r.body?.aplicaciones, [], 'sin filas la lista de postulaciones es vacía');
  assert.deepEqual(
    r.body?.contadores,
    Object.fromEntries(ESTADOS.map((e) => [e, 0])),
    'sin filas los 7 contadores existen y valen 0',
  );
});

// ─── C-20 · alta sin recarga ─────────────────────────────────────────────────

test('C-20 · una postulación nueva aparece en el pipeline en borrador sin recargar la página', async () => {
  const pagina = await abrirSeguro(FIXTURE('nueva-postulacion'));
  try {
    await esperar(pagina, '#pipeline');
    await esperar(pagina, '[data-estado="borrador"] .tarjeta-postulacion', false);

    await clickSeguro(pagina, '#nav-nueva-oferta');
    await esperar(pagina, '#nueva-oferta');
    const campoTexto = await pagina.caja('#nueva-oferta-texto');
    assert.notEqual(campoTexto, null, 'esperaba el campo de texto de la nueva oferta');
    // el doble del fixture acepta cualquier texto: lo que importa es el alta
    await clickSeguro(pagina, '#nueva-oferta-guardar');
    await esperar(pagina, '#nueva-oferta-resultado');

    await clickSeguro(pagina, '#nav-pipeline');
    const tarjeta = await esperar(pagina, '[data-estado="borrador"] .tarjeta-postulacion');
    assert.notEqual(tarjeta, null, 'tras crear la oferta, la postulación nueva debe verse en la columna borrador');
    assert.ok(tarjeta.width > 0 && tarjeta.height > 0, `la tarjeta nueva debe ser visible, midió ${tarjeta.width}x${tarjeta.height}`);
  } finally {
    await pagina.cerrar();
  }
});

// ─── C-21 · próximas entrevistas ordenadas ───────────────────────────────────

test('C-21 · GET /api/interviews/proximas lista solo las futuras, por fecha ascendente', async () => {
  const routes = await cargar('src/worker/routes/pipeline.js');
  assert.equal(
    typeof routes.respuestaDeProximasEntrevistas,
    'function',
    'routes/pipeline debe exportar respuestaDeProximasEntrevistas({ db, ahoraIso }) para GET /api/interviews/proximas',
  );

  const { db } = baseDeMentira({
    entrevistas: [
      { id: 11, application_id: 1, scheduled_at: '2026-10-20T15:00:00Z', tipo: 'tecnica', titulo: 'Frontend Engineer' },
      { id: 12, application_id: 2, scheduled_at: '2026-10-18T09:00:00Z', tipo: 'screening', titulo: 'Data Analyst' },
      { id: 13, application_id: 3, scheduled_at: '2026-10-25T11:30:00Z', tipo: 'cultural', titulo: 'SRE' },
      { id: 14, application_id: 1, scheduled_at: '2026-10-01T10:00:00Z', tipo: 'screening', titulo: 'Ya pasó' },
    ],
  });
  const r = await routes.respuestaDeProximasEntrevistas({ db, ahoraIso: AHORA });
  assert.equal(r.status, 200, `esperaba 200 de próximas entrevistas, obtuve ${r.status}`);
  const fechas = (r.body?.entrevistas ?? []).map((e) => e.scheduled_at);
  assert.deepEqual(fechas, ['2026-10-18T09:00:00Z', '2026-10-20T15:00:00Z', '2026-10-25T11:30:00Z'], 'la lista va por fecha ascendente y descarta las pasadas');
  const ids = (r.body?.entrevistas ?? []).map((e) => e.id);
  assert.deepEqual(ids, [12, 11, 13], 'el orden por fecha reordena las filas sembradas desordenadas');
});

test('C-21 · en este ciclo no hay entrevistas: la lista llega vacía y el bloque existe en la pantalla', async () => {
  const routes = await cargar('src/worker/routes/pipeline.js');
  const { db } = baseDeMentira({ entrevistas: [] });
  const r = await routes.respuestaDeProximasEntrevistas({ db, ahoraIso: AHORA });
  assert.equal(r.status, 200, `esperaba 200 con la lista vacía, obtuve ${r.status}`);
  assert.deepEqual(r.body?.entrevistas, [], 'sin entrevistas sembradas la lista de próximas es vacía');

  const pagina = await abrirSeguro(FIXTURE('pipeline-con-datos'));
  try {
    await esperar(pagina, '#pipeline');
    const bloque = await esperar(pagina, '#proximas-entrevistas');
    assert.notEqual(bloque, null, 'el bloque de próximas entrevistas existe aunque la lista pueda estar vacía');
  } finally {
    await pagina.cerrar();
  }
});

test('C-21 · la pantalla ordena las filas de próximas entrevistas por fecha ascendente', async () => {
  const pagina = await abrirSeguro(FIXTURE('pipeline-con-datos'));
  try {
    await esperar(pagina, '.entrevista-fila');
    const leidas = [];
    for (const id of [12, 11, 13]) {
      const fila = await pagina.caja(`[data-entrevista="${id}"]`);
      assert.notEqual(fila, null, `esperaba la fila de la entrevista ${id} en la pantalla`);
      leidas.push(await textoSeguro(pagina, `[data-entrevista="${id}"] .entrevista-fecha`));
    }
    const ordenadas = [...leidas].sort();
    assert.deepEqual(leidas, ordenadas, `las fechas en pantalla deben ir ascendentes, vi ${JSON.stringify(leidas)}`);
  } finally {
    await pagina.cerrar();
  }
});

// ─── C-22 · forma M-1: las columnas del tablero ──────────────────────────────

test('C-22 · forma M-1: las columnas comparten top ±4, miden lo mismo ±4 y su left crece', async () => {
  const pagina = await abrirSeguro(FIXTURE('pipeline-con-datos'));
  try {
    await esperar(pagina, '.columna-estado[data-estado="borrador"]');
    const columnas = [];
    for (const estado of ESTADOS) {
      const caja = await pagina.caja(`.columna-estado[data-estado="${estado}"]`);
      assert.notEqual(caja, null, `esperaba la columna del estado "${estado}" en el tablero`);
      columnas.push(caja);
    }

    const primera = columnas[0];
    for (let i = 1; i < columnas.length; i++) {
      assert.ok(
        Math.abs(columnas[i].y - primera.y) <= 4,
        `la columna "${ESTADOS[i]}" debe compartir top ±4 con la primera: y=${columnas[i].y} vs ${primera.y}`,
      );
      assert.ok(
        Math.abs(columnas[i].width - primera.width) <= 4,
        `la columna "${ESTADOS[i]}" debe medir el mismo ancho ±4: width=${columnas[i].width} vs ${primera.width}`,
      );
      assert.ok(
        Math.abs(columnas[i].height - primera.height) <= 4,
        `la columna "${ESTADOS[i]}" debe medir el mismo alto ±4: height=${columnas[i].height} vs ${primera.height}`,
      );
      assert.ok(
        columnas[i].x > columnas[i - 1].x,
        `el left de las columnas debe ser estrictamente creciente: "${ESTADOS[i]}" x=${columnas[i].x} no supera "${ESTADOS[i - 1]}" x=${columnas[i - 1].x}`,
      );
    }
  } finally {
    await pagina.cerrar();
  }
});

// ─── C-23 · forma M-2: barra lateral y contenido ─────────────────────────────

test('C-23 · forma M-2: la barra lateral mide 240 ±6 y el contenido arranca en sidebar.right + 24 ±6', async () => {
  const pagina = await abrirSeguro(FIXTURE('pipeline-con-datos'));
  try {
    await esperar(pagina, '.sidebar');
    const sidebar = await pagina.caja('.sidebar');
    const contenido = await esperar(pagina, '.contenido');
    assert.notEqual(sidebar, null, 'esperaba la barra lateral (.sidebar) en la pantalla');
    assert.notEqual(contenido, null, 'esperaba el contenido (.contenido) en la pantalla');

    assert.ok(
      Math.abs(sidebar.width - 240) <= 6,
      `la barra lateral debe medir 240px ±6, midió ${sidebar.width}`,
    );
    const esperado = sidebar.x + sidebar.width + 24;
    assert.ok(
      Math.abs(contenido.x - esperado) <= 6,
      `el contenido debe arrancar en sidebar.right + 24px ±6 (esperaba ~${esperado}), arrancó en ${contenido.x}`,
    );
  } finally {
    await pagina.cerrar();
  }
});

// ─── C-24 · forma M-4: fecha de cada fila de próximas ────────────────────────

test('C-24 · forma M-4: la fecha de cada fila de próximas entrevistas comparte left ±3', async () => {
  const pagina = await abrirSeguro(FIXTURE('pipeline-con-datos'));
  try {
    await esperar(pagina, '.entrevista-fecha');
    const fechas = [];
    for (const id of [12, 11, 13]) {
      const caja = await pagina.caja(`[data-entrevista="${id}"] .entrevista-fecha`);
      assert.notEqual(caja, null, `esperaba la fecha de la entrevista ${id} en la pantalla`);
      fechas.push(caja);
    }
    const primera = fechas[0];
    for (let i = 1; i < fechas.length; i++) {
      assert.ok(
        Math.abs(fechas[i].x - primera.x) <= 3,
        `la fecha de la fila ${i} debe compartir left ±3 con la primera: x=${fechas[i].x} vs ${primera.x}`,
      );
    }
  } finally {
    await pagina.cerrar();
  }
});
