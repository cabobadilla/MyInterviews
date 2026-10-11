/**
 * Suite T-03 — cargar una oferta y extraerla con el LLM (contrato T-03).
 *
 * Los seis casos del contrato: C-08, C-09, C-10, C-11, C-12, C-13 (+ EXTRA de
 * arnés). La lógica medible vive en módulos que no importan nada salvo node:,
 * así que esta suite se puede correr en un árbol pelado sin node_modules.
 * Las tres externas (gateway LLM, descarga HTTP, base D1) son dobles de
 * mentira: inyectables y de forma real del lado del contrato (D1 responde
 * {success, meta} y {results}; OpenRouter responde choices[0].message.content).
 *
 * C-11 es el caso medular: la oferta se SIEMPRE, aunque la extracción sea fallida.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// ─── carga de arnés (debe fallar por ASERCIÓN, nunca por excepción cruda) ────

const ABS = (ruta) => new URL(`../${ruta}`, import.meta.url);

function requerirArchivo(ruta) {
  assert.ok(existsSync(ABS(ruta)), `falta ${ruta}: el artefacto del entregable aún no está en este commit`);
}

async function cargar(ruta) {
  requerirArchivo(ruta);
  try {
    return await import(ABS(ruta).href);
  } catch {
    assert.fail(`el módulo ${ruta} no se pudo importar en el árbol pelado: importa algo no-builtin o aún no está la implementación`);
  }
}

// ─── base D1 de mentira (con la forma VIVAS de la respuesta de D1) ────────────
//   run()  → { success, meta: { last_row_id, changes } }
//   all()  → { results, success, meta }
//   modo 'sql_bare' devuelve las filas sin el envoltorio (forma de otro driver)
//   para recorrer la bifurcación por forma de respuesta, como pide REGLA 6.

function baseDeMentira({ filas = [], modo = 'd1' } = {}) {
  const bitacora = [];
  const ofertas = [];
  const aplicaciones = [];
  let proximoId = 0;
  const db = {
    prepare(sql) {
      const stmt = { sql, args: null };
      const regenar = () => {
        if (/FROM job_offers\b/.test(String(stmt.sql))) {
          return filas.map((f) => ({ ...f }));
        }
        return [];
      };
      const acc = {
        bind(...args) { stmt.args = args; return acc; },
        async run() {
          bitacora.push({ sql: stmt.sql, args: stmt.args });
          if (/INSERT INTO job_offers\b/.test(String(stmt.sql))) {
            proximoId += 1;
            const [source_url, raw_text, extracted_json, extraction_status, extraction_error, campos_faltantes_json, titulo, empresa] = stmt.args ?? [];
            ofertas.push({ id: proximoId, source_url, raw_text, extracted_json, extraction_status, extraction_error, campos_faltantes_json, titulo, empresa });
          }
          if (/INSERT INTO applications\b/.test(String(stmt.sql))) {
            const [offer_id, status, created_at, updated_at] = stmt.args ?? [];
            aplicaciones.push({ offer_id, status, created_at: created_at ?? null, updated_at: updated_at ?? null });
          }
          if (modo === 'sql_bare') return { lastInsertRowid: proximoId, changes: 1 };
          return { success: true, meta: { last_row_id: proximoId, changes: 1, duration_ms: 0 } };
        },
        async all() {
          bitacora.push({ sql: stmt.sql, args: stmt.args });
          const resultados = regenar();
          if (modo === 'sql_bare') return resultados;
          return { results: resultados, success: true, meta: {} };
        },
      };
      return acc;
    },
  };
  return { db, bitacora, ofertas, aplicaciones };
}

function gatewayDeMentira(respuesta) {
  const llamadas = [];
  const gatewayFn = async ({ env, mensajes }) => {
    llamadas.push({ env, mensajes });
    const r = typeof respuesta === 'function' ? respuesta({ env, mensajes }) : respuesta;
    if (r && r.ok === false) return r;
    return { ok: true, texto: r };
  };
  return { gatewayFn, llamadas };
}

const fetchDeMentira = async () => ({ ok: true, status: 200, text: async () => '{}' });

// ─── datos canónicos del OfferJSON (spec §4.1) ───────────────────────────────

const OFERTA_COMPLETA = {
  titulo: 'Ingeniera de Software Sr',
  empresa: 'Acme Corp',
  ubicacion: 'Santiago de Chile',
  modalidad: 'hibrido',
  seniority: 'senior',
  salario: { texto: '39.000.000 CLP anual', min: null, max: null, moneda: 'CLP' },
  resumen: 'Reingeniería de plataforma de pagos y de datos.',
  responsabilidades: ['Definir APIs', 'Gobernar el dominio'],
  requisitos_obligatorios: ['5 años de Node.js', 'PostgreSQL avanzado'],
  requisitos_deseables: ['Rust'],
  skills: [{ nombre: 'Node.js', obligatoria: true }, { nombre: 'PostgreSQL', obligatoria: true }],
  beneficios: ['Salud integral', 'Días de bienestar'],
  proceso_entrevistas: [{ paso: 'screening técnica', descripcion: 'una sesión con el equipo' }],
  confianza: { titulo: 'alta', empresa: 'media' },
};

function textoOfertaClara({ sinSalario = false, sinBeneficios = false } = {}) {
  return [
    'Posición: Ingeniera de Software Sr — Acme Corp.',
    'Modelo: híbrido, 3 días en la oficina.',
    'Responsabilidades: definir APIs y llevar el modelo de datos.',
    'Requisitos obligatorios: Node.js avanzado; PostgreSQL intermedio.',
    'Deseables: Rust.',
    sinSalario ? 'Compensación: no declarada.' : 'Compensación: 39.000.000 CLP anual.',
    sinBeneficios ? 'Sin beneficios comentados.' : 'Beneficios: salud integral, flexibilidad.',
    'Proceso: 1) screening técnica. 2) par de programación. 3) entrevista con el equipo.',
    'Zócalo: abajo quedan los detalles legales de la vacante.',
  ].join('\n');
}

const TXT_OFERTA = textoOfertaClara();

// ─── los seis casos del contrato ─────────────────────────────────────────────

test('C-08 · guardar el texto crea la oferta y una postulación en borrador', async () => {
  const routes = await cargar('src/worker/routes/offers.js');
  const base = baseDeMentira();
  const { gatewayFn, llamadas } = gatewayDeMentira(JSON.stringify(OFERTA_COMPLETA));
  const r = await routes.respuestaDeExtract({
    body: { fuente: 'texto', texto: TXT_OFERTA },
    env: { OPENROUTER_API_KEY: 'k-arnes', LLM_MODEL_EXTRACCION: 'm-arnes' },
    db: base.db, gatewayFn, fetchImpl: fetchDeMentira, ahoraIso: '2026-10-11T00:00:00Z',
  });
  assert.equal(r.status, 201, `esperaba 201 al crear la oferta desde texto, obtuve ${r.status}`);
  assert.ok(r.body?.oferta?.id >= 1, 'esperaba el id de la oferta creada en la respuesta');
  assert.equal(r.body?.aplicacion?.status, 'borrador', 'esperaba la postulación en borrador en la respuesta');

  const insOferta = base.bitacora.filter((b) => /INSERT INTO job_offers\b/.test(b.sql));
  assert.equal(insOferta.length, 1, `esperaba exactamente 1 INSERT en job_offers, hubo ${insOferta.length}`);
  assert.equal(insOferta[0]?.args?.[1], TXT_OFERTA, 'raw_text debe guardar exactamente el texto que el usuario pegó');
  assert.equal(JSON.parse(insOferta[0]?.args?.[2] ?? 'null').titulo, OFERTA_COMPLETA.titulo, 'extracted_json guarda el JSON del modelo');

  const insAplicacion = base.bitacora.filter((b) => /INSERT INTO applications\b/.test(b.sql));
  assert.equal(insAplicacion.length, 1, `esperaba exactamente 1 INSERT en applications, hubo ${insAplicacion.length}`);
  assert.ok((insAplicacion[0]?.args ?? []).includes('borrador'), 'la fila de applications se inserta con status borrador');

  assert.equal(llamadas.length, 1, 'una extracción exitosa al primer intento llama al LLM una vez');
  assert.equal(base.ofertas[0]?.titulo, OFERTA_COMPLETA.titulo, 'titulo denormalizado se guarda para el listado');
  assert.equal(base.ofertas[0]?.empresa, OFERTA_COMPLETA.empresa, 'empresa denormalizada se guarda para el listado');
});

test('C-09 · pegar una URL descarga server-side y reduce a texto; resultado indistinguible en la UI del camino de texto', async () => {
  const reduce = await cargar('src/worker/llm/reduce_html.js');
  assert.equal(typeof reduce.reducirHtml, 'function', 'reduce_html debe exportar reducirHtml(html) → texto');

  const html = `<html><head><style>.fuga { color: red; }</style></head><body>
    <h1>Ingeniera de Software Sr</h1>
    <p>Acme Corp — Modelo: híbrido. Vacante 2001.</p>
    <script>window.fuga = function fuga() { return 1; };</script>
  </body></html>`;
  const reducido = reduce.reducirHtml(html);
  assert.ok(!reducido.includes('<'), 'la reducción no deja etiquetas en el texto');
  assert.ok(!reducido.toLowerCase().includes('window.fuga'), 'el contenido de <script> no entra al texto reducido');
  assert.ok(!reducido.toLowerCase().includes('color: red'), 'el contenido de <style> no entra al texto reducido');
  assert.ok(reducido.includes('Vacante 2001'), 'el contenido visible del HTML sí entra al texto reducido');

  // La ruta con URL llega al mismo estado que la ruta con texto:
  const routes = await cargar('src/worker/routes/offers.js');
  const base = baseDeMentira();
  const url = 'https://portales.local/oferta/2001';
  const { gatewayFn } = gatewayDeMentira(JSON.stringify(OFERTA_COMPLETA));
  const fetchImpl = async (u) => (u === url ? { ok: true, status: 200, text: async () => html } : { ok: false, status: 404, text: async () => '' });
  const r = await routes.respuestaDeExtract({
    body: { fuente: 'url', url },
    env: { OPENROUTER_API_KEY: 'k-arnes', LLM_MODEL_EXTRACCION: 'm-arnes' },
    db: base.db, gatewayFn, fetchImpl, ahoraIso: '2026-10-11T00:00:00Z',
  });
  assert.equal(r.status, 201, `esperaba 201 cargando por URL, obtuve ${r.status}`);
  const fila = base.ofertas[0];
  assert.ok(fila, 'la oferta por URL se guarda en la base de mentira');
  assert.equal(fila.source_url, url, 'la URL de origen queda en la fila');
  assert.equal(fila.raw_text, reducido, 'raw_text guarda el texto reducido, no el HTML crudo');
  assert.equal(fila.extraction_status, 'exitosa', 'la extracción por URL es exitosa igual que la por texto');
  assert.equal(r.body?.aplicacion?.status, 'borrador', 'la postulación en borrador es igual al camino de texto');
  assert.ok(typeof r.body?.oferta?.extracted_json === 'object' || typeof r.body?.oferta?.extracted_json === 'string', 'la respuesta por URL entrega la oferta extrída');
});

test('C-10 · sin salario ni beneficios → extraction_status parcial con esos campos en campos_faltantes_json', async () => {
  const validar = await cargar('src/worker/lib/validar_oferta.js');
  assert.equal(typeof validar.validarOferta, 'function', 'validar_oferta debe exportar validarOferta(dato)');
  const sin = validar.validarOferta({ ...OFERTA_COMPLETA, salario: undefined, beneficios: [] });
  assert.equal(sin.ok, false, 'el OfferJSON sin salario ni beneficios no está completo');
  assert.deepEqual(sin.faltantes, ['salario', 'beneficios'], 'faltantes lista salario y beneficios exactamente');
  assert.equal(sin.error ?? null, null, 'la forma sirve, no hay error de esquema (sólo faltantes)');

  const completa = validar.validarOferta(OFERTA_COMPLETA);
  assert.equal(completa.ok, true, 'el OfferJSON completo valida ok');
  assert.deepEqual(completa.faltantes, [], 'sin faltantes cuando está completa');

  const routes = await cargar('src/worker/routes/offers.js');
  const base = baseDeMentira();
  const { gatewayFn } = gatewayDeMentira(JSON.stringify({ ...OFERTA_COMPLETA, salario: undefined, beneficios: [] }));
  const r = await routes.respuestaDeExtract({
    body: { fuente: 'texto', texto: textoOfertaClara({ sinSalario: true, sinBeneficios: true }) },
    env: { OPENROUTER_API_KEY: 'k-arnes', LLM_MODEL_EXTRACCION: 'm-arnes' },
    db: base.db, gatewayFn, fetchImpl: fetchDeMentira, ahoraIso: '2026-10-11T00:00:00Z',
  });
  assert.equal(r.status, 201, 'la oferta se crea igual si la extracción es parcial');
  assert.equal(r.body?.oferta?.extraction_status, 'parcial', 'la respuesta marca la extracción como parcial');
  assert.deepEqual([...(r.body?.oferta?.campos_faltantes ?? [])].sort(), ['beneficios', 'salario'], 'la respuesta lista esos campos como faltantes');
  const fila = base.ofertas[0];
  assert.equal(fila?.extraction_status, 'parcial', 'extraction_status queda parcial en la fila');
  assert.deepEqual(JSON.parse(fila?.campos_faltantes_json ?? '[]').sort(), ['beneficios', 'salario'], 'campos_faltantes_json en la fila lista salario y beneficios');
});

test('C-11 · JSON inválido tras 1 reintento → fallida, con raw_text y extraction_error, y la oferta se crea igual', async () => {
  const extraer = await cargar('src/worker/llm/extract_offer.js');
  const llamadas = [];
  const gatewayFn = async ({ mensajes }) => {
    llamadas.push(mensajes);
    return { ok: true, texto: '{ no soy un JSON válido' };
  };
  const r = await extraer.extraerOferta({
    gatewayFn, texto: TXT_OFERTA,
    env: { OPENROUTER_API_KEY: 'k-arnes', LLM_MODEL_EXTRACCION: 'm-arnes' }, fetchImpl: fetchDeMentira,
  });
  assert.equal(r.estado, 'fallida', 'con dos respuestas no parseables y una reintento al vacío, la extracción queda fallida');
  assert.equal(llamadas.length, 2, `esperaba exactamente 2 llamadas (intento + 1 reintento), hubo ${llamadas.length}`);
  assert.ok(typeof r.error === 'string' && r.error.length > 0, 'fallida lleva un extraction_error con texto propio');
  const primerPrompt = JSON.stringify(llamadas[0]);
  const reintentoPrompt = JSON.stringify(llamadas[1]);
  assert.ok(reintentoPrompt.length > primerPrompt.length, 'el prompt del reintento es distinto del primero (lleva más)');
  assert.ok(reintentoPrompt.includes(r.error), 'el error de validación viaja DENTRO del prompt del reintento');
  assert.ok(!primerPrompt.includes(r.error), 'el primer prompt no lo lleva aún');

  // La oferta se crea IGUAL, aunque la extracción sea fallida:
  const routes = await cargar('src/worker/routes/offers.js');
  const base = baseDeMentira();
  const r2 = await routes.respuestaDeExtract({
    body: { fuente: 'texto', texto: TXT_OFERTA },
    env: { OPENROUTER_API_KEY: 'k-arnes', LLM_MODEL_EXTRACCION: 'm-arnes' },
    db: base.db, gatewayFn, fetchImpl: fetchDeMentira, ahoraIso: '2026-10-11T00:00:00Z',
  });
  assert.equal(r2.status, 201, `la oferta se crea igual aunque la extracción sea fallida (esperaba 201), obtuve ${r2.status}`);
  assert.equal(r2.body?.oferta?.extraction_status, 'fallida', 'la respuesta marca la extracción como fallida');
  const fila = base.ofertas[0];
  assert.equal(fila?.raw_text, TXT_OFERTA, 'raw_text queda completo y sin truncar aunque la extracción sea fallida');
  assert.ok(typeof fila?.extraction_error === 'string' && fila.extraction_error.length > 0, 'extraction_error queda registrado en la fila');
  assert.equal(r2.body?.aplicacion?.status, 'borrador', 'la aplicación en borrador se crea igual');
});

test('C-12 · URL que falla o supera 500 KB → error explícito que offre pegar el texto, sin crear la oferta', async () => {
  const routes = await cargar('src/worker/routes/offers.js');
  const url = 'https://portales.local/oferta/3003';

  const tresCasillas = [
    { nombre: 'descarga 404', fetchImpl: async () => ({ ok: false, status: 404, text: async () => '' }) },
    { nombre: 'falta de red', fetchImpl: async () => { throw new Error('caída de canal'); } },
    { nombre: 'demasiado grande', fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'x'.repeat(500_001) }) },
  ];

  for (const casilla of tresCasillas) {
    const base = baseDeMentira();
    const { gatewayFn } = gatewayDeMentira(JSON.stringify(OFERTA_COMPLETA));
    const r = await routes.respuestaDeExtract({
      body: { fuente: 'url', url },
      env: { OPENROUTER_API_KEY: 'k-arnes', LLM_MODEL_EXTRACCION: 'm-arnes' },
      db: base.db, gatewayFn, fetchImpl: casilla.fetchImpl, ahoraIso: '2026-10-11T00:00:00Z',
    });
    assert.equal(r.status, 422, `caso "${casilla.nombre}": esperaba 422 cuando la URL no descarga, obtuve ${r.status}`);
    const mensaje = typeof r.body?.error === 'string' ? r.body.error : JSON.stringify(r.body ?? {});
    assert.ok(/peg(a|ás|ar)/i.test(mensaje), `caso "${casilla.nombre}": el error debe ofrecer pegar el texto manualmente; mensaje: ${mensaje}`);
    assert.equal(base.ofertas.length, 0, `caso "${casilla.nombre}": no se crea ninguna oferta cuando la URL no sirve`);
  }
});

test('C-13 · texto de ~40.000 caracteres: al LLM le llegan ≤15.000 y queda registrado que hubo truncado', async () => {
  const routes = await cargar('src/worker/routes/offers.js');
  const MARCA_FINAL = 'MARCA_EXTERNAL_5501';
  const texto = textoOfertaClara() + '\n' + 'palabra rellena. '.repeat(1300) + ' ' + MARCA_FINAL;
  assert.ok(texto.length > 30_000, `el texto del caso debe superar 30k caracteres, tiene ${texto.length}`);

  const base = baseDeMentira();
  const { gatewayFn, llamadas } = gatewayDeMentira(JSON.stringify(OFERTA_COMPLETA));
  const r = await routes.respuestaDeExtract({
    body: { fuente: 'texto', texto },
    env: { OPENROUTER_API_KEY: 'k-arnes', LLM_MODEL_EXTRACCION: 'm-arnes' },
    db: base.db, gatewayFn, fetchImpl: fetchDeMentira, ahoraIso: '2026-10-11T00:00:00Z',
  });
  assert.equal(r.status, 201, 'la oferta se crea igual con texto grande');
  const promptDeLlamada = JSON.stringify(llamadas[0]);
  assert.ok(promptDeLlamada.length <= 15_500, `el JSON de mensajes al LLM debe medir ≤15.500 con el texto truncado, midió ${promptDeLlamada.length}`);
  assert.ok(promptDeLlamada.includes(JSON.stringify(texto).slice(1, 300)), 'el prompt trae el COMIENZO del texto pegado');
  assert.ok(!promptDeLlamada.includes(MARCA_FINAL), 'el prompt NO trae el FINAL del texto pegado cuando hubo truncado');

  // Lo almacenado: completo, sin trunques
  const fila = base.ofertas[0];
  assert.equal(fila?.raw_text, texto, 'raw_text guarda el texto COMPLETO: el truncado es solo para el prompt');
  assert.ok(/trunc/i.test(String(fila?.extraction_error ?? '')), 'extraction_error queda con la marca del truncado registrada');
  assert.equal(fila?.extraction_status, 'exitosa', 'la extracción con texto truncado al prompt sigue exitosa');
});

// ─── EXTRA: detalles del arnés que sostienen cada criterio ───────────────────

test('EXTRA · gateway: URL canónica, Authorization de la key, y modelo leído de la VARIABLE (nunca constante)', async () => {
  const gw = await cargar('src/worker/llm/gateway.js');
  assert.equal(typeof gw.llamarLlm, 'function', 'gateway debe exportar llamarLlm({ env, mensajes, fetchImpl })');
  const llamadas = [];
  const fetchImpl = async (url, init) => {
    llamadas.push({ url, init });
    return new Response('{"choices":[{"message":{"content":"hola devuelto"}}]}', { status: 200 });
  };
  const r = await gw.llamarLlm({
    env: { OPENROUTER_API_KEY: 'k-de-arnes', LLM_MODEL_EXTRACCION: 'mi-modelo/t-1' },
    mensajes: [{ role: 'user', content: 'hola' }],
    fetchImpl,
  });
  assert.equal(r.ok, true, 'el gateway devuelve ok con una respuesta válida de OpenRouter');
  assert.equal(r.texto, 'hola devuelto', 'el gateway extrae choices[0].message.content');
  const { url, init } = llamadas[0];
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions', 'la URL va contra el endpoint canónico de OpenRouter');
  const headers = init?.headers ?? {};
  const auth = headers.Authorization ?? headers.authorization;
  assert.ok(typeof auth === 'string' && auth.startsWith('Bearer ') && auth.includes('k-de-arnes'), 'Authorization va con Bearer y la key de env');
  const cuerpo = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
  assert.equal(cuerpo.model, 'mi-modelo/t-1', 'el modelo que viaja sale de la VARIABLE LLM_MODEL_EXTRACCION');
});

test('EXTRA · gateway: sin credenciales falla cerrado; el fallo de red repite UNA vez y luego devuelve la falla', async () => {
  const gw = await cargar('src/worker/llm/gateway.js');
  const sinCredencial = await gw.llamarLlm({
    env: {}, mensajes: [{ role: 'user', content: 'hola' }], fetchImpl: async () => { throw new Error('no debería llamarse'); },
  });
  assert.equal(sinCredencial.ok, false, 'sin OPENROUTER_API_KEY el gateway falla cerrado (sin llamar la red)');
  assert.ok(typeof sinCredencial.error === 'string' && sinCredencial.error.length > 0, 'la falla sin credencial lleva mensaje');

  const llamadas = [];
  const fallaUnaVez = async (url) => {
    llamadas.push(String(url));
    if (llamadas.length === 1) throw new Error('se cayó el canal');
    return new Response('{"choices":[{"message":{"content":"del reintento"}}]}', { status: 200 });
  };
  const r = await gw.llamarLlm({
    env: { OPENROUTER_API_KEY: 'k', LLM_MODEL_EXTRACCION: 'm' },
    mensajes: [{ role: 'user', content: 'hola' }], fetchImpl: fallaUnaVez,
  });
  assert.equal(r.ok, true, 'con 1 fallo el gateway reintenta y sale por el segundo intento');
  assert.equal(r.texto, 'del reintento', 'el texto del reintento llega al decisor');
  assert.equal(llamadas.length, 2, `el gateway con 1 reintento hace exactamente 2 llamadas, hubo ${llamadas.length}`);

  const fallaDosVeces = async () => { throw new Error('caída otra vez'); };
  const r2 = await gw.llamarLlm({
    env: { OPENROUTER_API_KEY: 'k', LLM_MODEL_EXTRACCION: 'm' },
    mensajes: [{ role: 'user', content: 'hola' }], fetchImpl: fallaDosVeces,
  });
  assert.equal(r2.ok, false, 'con dos fallos el gateway termina fallando');
  assert.ok(typeof r2.error === 'string' && r2.error.length > 0, 'la falla final del gateway lleva mensaje');
});

test('EXTRA · gateway: el 503 de la pasarela también gasta su único reintento', async () => {
  const gw = await cargar('src/worker/llm/gateway.js');
  const status = [503, 503];
  const fetchImpl = async () => new Response('golpeado', { status: status.shift() ?? 200 });
  const r = await gw.llamarLlm({
    env: { OPENROUTER_API_KEY: 'k', LLM_MODEL_EXTRACCION: 'm' },
    mensajes: [{ role: 'user', content: 'hola' }], fetchImpl,
  });
  assert.equal(r.ok, false, 'con dos 503 consecutivos el gateway falla');
  assert.ok(typeof r.error === 'string' && r.error.length > 0, 'el fallo por status de la pasarela lleva mensaje');
});

test('EXTRA · gateway: timeout (fetch que nunca contesta) con timeoutMs corto', async () => {
  const gw = await cargar('src/worker/llm/gateway.js');
  let suma = 0;
  const fetchImpl = async () => {
    suma += 1;
    return new Promise(() => {}); // nunca resuelve
  };
  const t0 = Date.now();
  const r = await gw.llamarLlm({
    env: { OPENROUTER_API_KEY: 'k', LLM_MODEL_EXTRACCION: 'm' },
    mensajes: [{ role: 'user', content: 'hola' }], fetchImpl, timeoutMs: 30,
  });
  assert.equal(r.ok, false, 'la respuesta callada produce una falla a tiempo');
  assert.equal(suma, 2, 'la falla por timeout también gasta su único reintento (2 llamadas)');
  assert.ok(Date.now() - t0 < 2000, `el timeout corto no puede colgar la suite (midió ${Date.now() - t0}ms)`);
});

test('EXTRA · descargarTexto: descarga fina con cap 500 KB y reporta el motivo del exceso o de la falla', async () => {
  const reduce = await cargar('src/worker/llm/reduce_html.js');
  assert.equal(typeof reduce.descargarTexto, 'function', 'reduce_html debe exportar descargarTexto({ url, fetchImpl })');
  const html = '<h1>Oferta real</h1><p>Posición: Ingeniera de Software Sr. Vacante 25002.</p>';
  const bien = await reduce.descargarTexto({
    url: 'https://lugares.local/oferta',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => html }),
  });
  assert.equal(bien.ok, true, 'la descarga exitosa devuelve ok');
  assert.ok(bien.texto.includes('Oferta real') && bien.texto.includes('Vacante 25002'), 'el texto reducido contiene lo visible');
  assert.ok(!bien.texto.includes('<h1>'), 'el texto reducido no repite etiquetas');

  const grande = await reduce.descargarTexto({
    url: 'https://lugares.local/oferta',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'x'.repeat(500_001) }),
  });
  assert.equal(grande.ok, false, 'la descarga rechaza lo que supera 500 KB');
  assert.ok(typeof grande.error === 'string' && grande.error.length > 0, 'el exceso del cap lleva mensaje');
  assert.ok(grande.motivo, 'el motivo del exceso queda registrado');

  const rota = await reduce.descargarTexto({
    url: 'https://lugares.local/oferta',
    fetchImpl: async () => { throw new Error('caída de canal'); },
  });
  assert.equal(rota.ok, false, 'la caída de red termina en falla cerrada');
});

test('EXTRA · repos de ofertas: la forma REAL de D1 {results, success, meta} y la lista vacía no se confunde', async () => {
  const repos = await cargar('src/worker/repos/offers.js');
  for (const nombre of ['insertarOferta', 'listarOfertas', 'crearPostulacion']) {
    assert.equal(typeof repos?.[nombre], 'function', `repos/offers debe exportar ${nombre}`);
  }

  // Forma 1: filas CON contenido en {results}
  const filas = [{
    id: 1, source_url: 'https://x.local/a', extraction_status: 'parcial',
    campos_faltantes_json: '["salario"]', titulo: 'Fila Acme', empresa: 'Acme',
    created_at: '2026-10-11T00:00:00Z',
  }];
  const conDatos = await repos.listarOfertas(baseDeMentira({ filas }).db);
  assert.ok(Array.isArray(conDatos) && conDatos.length === 1, 'con una fila en results listarOfertas la entrega');
  assert.deepEqual(conDatos[0]?.campos_faltantes, ['salario'], 'la lista entrega campos_faltantes como arreglo (no el JSON crudo)');

  // Forma 2: {results: []} ES una lista vacía, no "hay filas" (el defecto que(scope) fue pagado una vez)
  const vacia = await repos.listarOfertas(baseDeMentira({ filas: [] }).db);
  assert.deepEqual(vacia, [], 'con results vacío la lista queda vacía, nunca se interpreta como que hay filas');

  // Forma 3: otro driver (sin envoltorio): la bifurcación está cubierta con la base de mentira
  const bero = await repos.listarOfertas(baseDeMentira({ filas, modo: 'sql_bare' }).db);
  assert.deepEqual(bero.map((f) => f.id), [1], 'con el driver en forma distinta la bifurcación también devuelve la fila');
});

test('EXTRA · la pantalla «Nueva oferta» tiene selector URL/texto, estado de la extracción y el link de origen', () => {
  const ruta = 'src/screens/NuevaOferta.jsx';
  requerirArchivo(ruta);
  let codigo = '';
  try {
    codigo = readFileSync(ABS(ruta), 'utf8');
  } catch {
    assert.fail('no se pudo leer src/screens/NuevaOferta.jsx aunque existe');
  }
  assert.ok(codigo.includes("'url'") && codigo.includes("'texto'"), 'el selector de fuente (URL o texto) está presente en el componente');
  assert.ok(/extraction_status|estado.{0,12}extracc/i.test(codigo), 'la pantalla muestra el estado de la extracción');
  assert.ok(/source_url|link.*origen|origen/i.test(codigo), 'la pantalla muestra el link de origen de la oferta');
  assert.ok(/api\/offers\/extract/.test(codigo), 'la pantalla llama a POST /api/offers/extract');
  assert.ok(/state|useState/.test(codigo), 'el componente maneja estado local para la extracción');
});
