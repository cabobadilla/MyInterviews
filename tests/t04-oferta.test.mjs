/**
 * Suite T-04 — revisar y editar la oferta extraída (contrato T-04).
 *
 * Casos del contrato: C-15, C-16, C-17 (+ EXTRA de cableado).
 * La lógica medible vive en módulos que no importan nada salvo node: (los
 * decisores de routes/offers.js y el repositorio de ofertas), así que esta
 * suite corre en un árbol pelado sin node_modules. La base D1 es doble de
 * mentira con la forma VIVA de la respuesta de D1 ({results, success, meta} /
 * {success, meta}), suficientemente fina para SELECT por id y UPDATE.
 *
 * C-15 es el corazón: editar a mano guarda la fila SIEMPRE, aunque la
 * extracción sea parcial o fallida. El PUT no vuelve a llamar al LLM: una
 * sola fila, editada in situ.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// ─── carga de arnés (debe fallar por ASERCIÓN, nunca por excepción cruda) ────

const ABS = (ruta) => new URL(`../${ruta}`, import.meta.url);

function requerirArchivo(ruta) {
  assert.ok(existsSync(ABS(ruta)), `falta ${ruta}: el artefacto del entregable aún no está en este commit`);
}

function leerArchivo(ruta) {
  requerirArchivo(ruta);
  try {
    return readFileSync(ABS(ruta), 'utf8');
  } catch {
    assert.fail(`no se pudo leer ${ruta} aunque el archivo existe`);
  }
}

async function cargar(ruta) {
  requerirArchivo(ruta);
  try {
    return await import(ABS(ruta).href);
  } catch {
    assert.fail(`el módulo ${ruta} no se pudo importar en el árbol pelado: importa algo no-builtin o aún no está la implementación`);
  }
}

// ─── base D1 de mentira (SELECT por id, UPDATE de la fila) ───────────────────
//   all()  → { results, success, meta }   ·   run()  → { success, meta }
//   Modos de forma: el envoltorio {results} VIVO de D1 (también responde igual
//   con el envoltorio ausente, como la bifurcación que ya se midió en T-03).

function baseDeMentira({ filas = [] } = {}) {
  const bitacora = [];
  let idxFilaSiempreExiste = false;
  const db = {
    prepare(sql) {
      const stmt = { sql: String(sql), args: null };
      const acc = {
        bind(...args) { stmt.args = args; return acc; },
        async run() {
          bitacora.push({ sql: stmt.sql, args: stmt.args ?? [] });
          if (/^UPDATE job_offers\b/.test(stmt.sql)) {
            const [source_url, raw_text, extracted_json, extraction_status, extraction_error, campos_faltantes_json, titulo, empresa, updated_at, id] = stmt.args ?? [];
            const fila = filas.find((f) => Number(f.id) === Number(id));
            if (fila) {
              Object.assign(fila, {
                source_url,
                raw_text,
                extracted_json,
                extraction_status,
                extraction_error,
                campos_faltantes_json,
                titulo,
                empresa,
                updated_at,
              });
            }
          }
          return { success: true, meta: { changes: 1, duration_ms: 0 } };
        },
        async all() {
          bitacora.push({ sql: stmt.sql, args: stmt.args ?? [] });
          let salida = filas.map((f) => ({ ...f }));
          if (/WHERE id\b/.test(stmt.sql) && (stmt.args ?? []).length > 0) {
            salida = salida.filter((f) => Number(f.id) === Number(stmt.args[0]));
            idxFilaSiempreExiste = salida.length > 0;
          }
          return { results: salida, success: true, meta: {} };
        },
      };
      return acc;
    },
  };
  return { db, bitacora, filas, humanoIgual: () => idxFilaSiempreExiste };
}

// ─── filas canónicas (una parcial, una fallida, una exitosa) ─────────────────

const TXT_PARCIAL = [
  'Posición: Desarrolladora de datos Jr — Delta Ltd.',
  'Responsabilidades: reportes y consultas SQL.',
  'Requisitos obligatorios: SQL intermedio.',
  'Sin salario declarado. Sin beneficios comentados.',
].join('\n');

const JSON_PARCIAL = {
  titulo: 'Desarrolladora de datos Jr',
  empresa: 'Delta Ltd',
  ubicacion: '',
  modalidad: 'remoto',
  seniority: 'junior',
  resumen: 'Reportes y consultas SQL.',
  requisitos_obligatorios: ['SQL intermedio'],
  skills: [{ nombre: 'SQL', obligatoria: true }],
};

const TXT_FALLIDA = [
  'Gaveta de texto discontinuo: párrafos sueltos con recortes',
  'de un portal que no describe la vacante como formulario.',
  'Dato flotante: «2021» sin contexto.',
].join('\n');

const TXT_EXITOSA = [
  'Posición: Ingeniera de Software Sr — Acme Corp.',
  'Compensación: 39.000.000 CLP anual.',
  'Beneficios: salud integral.',
].join('\n');

function filaParcial() {
  return {
    id: 1,
    source_url: 'https://portales.local/oferta/9001',
    raw_text: TXT_PARCIAL,
    extracted_json: JSON.stringify(JSON_PARCIAL),
    extraction_status: 'parcial',
    extraction_error: null,
    campos_faltantes_json: '["salario","beneficios"]',
    titulo: JSON_PARCIAL.titulo,
    empresa: JSON_PARCIAL.empresa,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
  };
}

function filaFallida() {
  return {
    id: 2,
    source_url: null,
    raw_text: TXT_FALLIDA,
    extracted_json: null,
    extraction_status: 'fallida',
    extraction_error: 'la respuesta del modelo no es un objeto JSON con la forma del OfferJSON',
    campos_faltantes_json: '[]',
    titulo: null,
    empresa: null,
    created_at: '2026-10-10T11:00:00Z',
    updated_at: '2026-10-10T11:00:00Z',
  };
}

function filaExitosa() {
  return {
    id: 3,
    source_url: 'https://portales.local/oferta/3001',
    raw_text: TXT_EXITOSA,
    extracted_json: null,
    extraction_status: 'exitosa',
    extraction_error: null,
    campos_faltantes_json: '[]',
    titulo: 'Ingeniera de Software Sr',
    empresa: 'Acme Corp',
    created_at: '2026-10-10T12:00:00Z',
    updated_at: '2026-10-10T12:00:00Z',
  };
}

const AHORA = '2026-10-11T12:00:00Z';

// ─── los tres casos del contrato ─────────────────────────────────────────────

test('C-15 · editar a mano se guarda aunque la oferta esté parcial o fallida', async () => {
  const routes = await cargar('src/worker/routes/offers.js');
  assert.equal(
    typeof routes.respuestaDeEdicion, 'function',
    'routes/offers debe exportar respuestaDeEdicion({ db, id, body, ahoraIso }) para el PUT',
  );

  const base = baseDeMentira({ filas: [filaParcial(), filaFallida()] });

  // La parcial: se completan a mano el salario y los beneficios.
  const r = await routes.respuestaDeEdicion({
    db: base.db, id: 1,
    body: { salario: '39.500.000 CLP al año', beneficios: ['salud integral'] },
    ahoraIso: AHORA,
  });
  assert.equal(r.status, 200, `esperaba 200 editando una parcial, obtuve ${r.status}`);
  assert.ok(r.body?.ok === true, 'la edicion de una parcial responde ok');

  const updates = base.bitacora.filter((b) => /^UPDATE job_offers\b/.test(b.sql));
  assert.equal(updates.length, 1, `una fila editada in situ debe registrar exactamente 1 UPDATE, hubo ${updates.length}`);

  const parcial = base.filas[0];
  assert.equal(parcial.extraction_status, 'parcial', 'editar a mano NO cambia el estado: no hay re-extracción al guardar');
  assert.equal(JSON.parse(parcial.extracted_json).salario.texto, '39.500.000 CLP al año', 'el salario editado queda dentro del extracted_json de la fila');
  assert.deepEqual(JSON.parse(parcial.extracted_json).beneficios, ['salud integral'], 'los beneficios editados quedan en extracted_json');
  assert.deepEqual(JSON.parse(parcial.campos_faltantes_json), [], 'al completar salario y beneficios los faltantes se recalculan a vacío');
  assert.equal(parcial.updated_at, AHORA, 'updated_at marca el momento de la edición');
  assert.equal(parcial.raw_text, TXT_PARCIAL, 'raw_text no se toca al editar');
  assert.equal(parcial.source_url, 'https://portales.local/oferta/9001', 'source_url no se toca al editar');

  // La fallida: título y empresa se guardan igual, sobre un extracted_json vacío.
  const r2 = await routes.respuestaDeEdicion({
    db: base.db, id: 2,
    body: { titulo: 'Analista de datos', empresa: 'Beta Ltd' },
    ahoraIso: AHORA,
  });
  assert.equal(r2.status, 200, `esperaba 200 editando una fallida, obtuve ${r2.status}`);
  const fallida = base.filas[1];
  assert.equal(fallida.extraction_status, 'fallida', 'la fila fallida sigue fallida tras editar: nada la re-extrae');
  assert.equal(fallida.titulo, 'Analista de datos', 'el título editado queda en la columna denormalizada');
  assert.deepEqual(JSON.parse(fallida.extracted_json).empresa, 'Beta Ltd', 'la empresa editada entra al extracted_json de la fila fallida');
  assert.equal(fallida.extraction_error, 'la respuesta del modelo no es un objeto JSON con la forma del OfferJSON', 'el error de extracción histórica no se borra al editar');

  // Rechazos cerrados: fila inexistente y sin base.
  const r404 = await routes.respuestaDeEdicion({ db: base.db, id: 99, body: { titulo: 'x' }, ahoraIso: AHORA });
  assert.equal(r404.status, 404, 'editar una oferta que no existe responde 404');
  const r500 = await routes.respuestaDeEdicion({ db: null, id: 1, body: { titulo: 'x' }, ahoraIso: AHORA });
  assert.equal(r500.status, 500, 'sin base la edición no puede prometer guardar: 500');
});

test('C-16 · los campos de campos_faltantes_json se resaltan con una clase CSS identificable', () => {
  const codigo = leerArchivo('src/screens/DetalleOferta.jsx');
  assert.ok(codigo.includes('campo-faltante'), 'la pantalla marca los campos con la clase CSS campo-faltante');
  assert.ok(
    /campos_faltantes|camposFaltantes/.test(codigo),
    'el resalte se decide a partir de la lista campos_faltantes de la oferta',
  );
  assert.ok(
    /data-campo/.test(codigo),
    'cada campo editable conserva su atributo data-campo (así el test puede apuntar a cada uno)',
  );
  const css = leerArchivo('src/styles.css');
  assert.ok(
    /\.campo-faltante\s*[{,]/.test(css),
    'styles.css define la presentación de .campo-faltante: el resalte es una CLASE verificable, no un estilo en línea opaco',
  );
});

test('C-17 · el detalle entrega raw_text y source_url tal como se guardaron', async () => {
  const routes = await cargar('src/worker/routes/offers.js');
  assert.equal(
    typeof routes.respuestaDeDetalle, 'function',
    'routes/offers debe exportar respuestaDeDetalle({ db, id }) para el GET',
  );

  const base = baseDeMentira({ filas: [filaParcial(), filaExitosa()] });

  const r = await routes.respuestaDeDetalle({ db: base.db, id: 1 });
  assert.equal(r.status, 200, `esperaba 200 para el detalle de la oferta 1, obtuve ${r.status}`);
  const oferta = r.body?.oferta;
  assert.ok(oferta, 'la respuesta del detalle lleva la oferta');
  assert.equal(oferta.raw_text, TXT_PARCIAL, 'raw_text vuelve EXACTAMENTE como se guardó (saltos de línea y todo)');
  assert.equal(oferta.source_url, 'https://portales.local/oferta/9001', 'source_url vuelve tal como se guardó');
  assert.equal(oferta.extraction_status, 'parcial', 'el detalle informa el estado de la extracción');
  assert.deepEqual(oferta.campos_faltantes, ['salario', 'beneficios'], 'el detalle lista los campos faltantes como arreglo');
  assert.equal(JSON.parse(JSON.stringify(oferta.extracted_json)).titulo, JSON_PARCIAL.titulo, 'el detalle entrega extracted_json parseado');

  // La flor: la fila exitosa se ve con raw_text y source_url intactos igualmente.
  assert.equal(base.filas[1].extraction_status, 'exitosa', 'la segunda fila sembrada es exitosa');
  const r3 = await routes.respuestaDeDetalle({ db: base.db, id: 3 });
  assert.equal(r3.status, 200, `esperaba 200 para el detalle de la oferta 3, obtuve ${r3.status}`);
  assert.equal(r3.body?.oferta?.raw_text, TXT_EXITOSA, 'raw_text de la exitosa es el guardado, sin ajustes');
  assert.equal(r3.body?.oferta?.source_url, 'https://portales.local/oferta/3001', 'source_url de la exitosa es el guardado');

  // Rechazos cerrados: inexistente, id inválido y sin base.
  const r404 = await routes.respuestaDeDetalle({ db: base.db, id: 99 });
  assert.equal(r404.status, 404, `el detalle de una oferta inexistente responde 404, obtuve ${r404.status}`);
  assert.ok(typeof r404.body?.error === 'string' && r404.body.error.length > 0, 'el 404 del detalle lleva un mensaje propio');
  const r400 = await routes.respuestaDeDetalle({ db: base.db, id: 'no-soy-id' });
  assert.equal(r400.status, 400, `el detalle con un id que no es número responde 400, obtuve ${r400.status}`);
  const r500 = await routes.respuestaDeDetalle({ db: null, id: 1 });
  assert.equal(r500.status, 500, 'sin base el detalle responde 500 en lugar de fingir que no hay nada');

  // La pantalla: raw_text plegable y link de origen, en el render y no con estilos ocultos.
  const codigo = leerArchivo('src/screens/DetalleOferta.jsx');
  assert.ok(codigo.includes('raw_text'), 'la pantalla muestra el raw_text de la oferta');
  assert.ok(/<details|plegad|plegar|ver más/i.test(codigo), 'el raw_text es plegable: la pantalla lo expone dentro de un bloque contraíble');
  assert.ok(codigo.includes('source_url'), 'la pantalla muestra la source_url de la oferta');
  assert.ok(/<a\s/.test(codigo), 'la source_url se renderiza como link navegovel (elemento <a>)');
  assert.ok(/api\/offers\/|respuestaDeDetalle/.test(codigo) || /cargarOferta|onCargada|api/.test(codigo), 'la pantalla consigue la oferta del detalle por id (GET /api/offers/:id)');
});

// ─── EXTRA: cableado de las rutas nuevas en el Worker ────────────────────────

test('EXTRA · el cableado del Worker expone GET y PUT de /api/offers/:id', () => {
  const cableado = leerArchivo('src/worker/index.js');
  assert.ok(/app\.get\(\s*'\/api\/offers\/:id'/.test(cableado), 'el Worker mapea GET /api/offers/:id');
  assert.ok(/app\.put\(\s*'\/api\/offers\/:id'/.test(cableado), 'el Worker mapea PUT /api/offers/:id');
  assert.ok(
    /respuestaDeDetalle|respuestaDeEdicion/.test(cableado),
    'las decisiones viven en los decisores de routes/offers.js (el cableado no decide nada propio)',
  );
});
