/**
 * Suite T-06 — la SPA contra la API: arranque, transición y error en pantalla
 * (C-01 reclasificado, C-03, C-05 · docs/contratos/T-06.md).
 *
 * La suite corre en un árbol pelado (sin node_modules, sin servidor, sin red),
 * así que los casos montan el App REAL con un api doble inyectado por el
 * fixture `tests/fixtures/app.html` (entrada extra de Vite). El doble devuelve
 * lo que cada caso necesita y expone el comportamiento elegido por query param
 * (?caso=sin-sesion | con-sesion | login-ok | login-falla | logout-ok).
 *
 * Los casos miden CONDUCTA con tests/helpers/browser.mjs: texto(), click() y
 * caja(). Nota: la detección de "sin recargar" sale del propio doble — si la
 * página recargara, el doble vuelve a correr estadoSesion() (que en login-ok es
 * autenticado:false) y la vista volvería a #login: ver #pipeline tras el click
 * prueba la transición sin recarga.
 *
 * Si el artefacto todavía no existe, cada caso debe fallar por ASERCIÓN y con
 * su mensaje propio — nunca con una excepción suelta imprimiendo texto crudo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { abrir } from './helpers/browser.mjs';

const FIXTURE = (nombre) => `public/fixtures/${nombre}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requerirArchivo(ruta) {
  assert.ok(
    existsSync(new URL(`../${ruta}`, import.meta.url)),
    `falta ${ruta}: la SPA (y su fixture de app) todavía no se construyó`,
  );
}



/** Espera (con reintento) a que un selector esté —o no— en el DOM decidido. */
async function esperarVista(pagina, sel, presente) {
  for (let i = 0; i < 60; i++) {
    const caja = await pagina.caja(sel);
    if (presente ? caja != null : caja == null) return;
    await sleep(100);
  }
  assert.fail(
    `la vista no quedó como se esperaba: ${presente ? 'falta' : 'sobra'} ${sel} (timeout de espera)`,
  );
}

test('C-01 · arranque sin sesión muestra el login y NO el pipeline', async () => {
  requerirArchivo(FIXTURE('app.html'));
  let pagina;
  try {
    pagina = await abrir(FIXTURE('app.html?caso=sin-sesion'));
  } catch {
    assert.fail('no se pudo abrir public/fixtures/app.html en el navegador de pruebas');
    return;
  }
  try {
    await esperarVista(pagina, '#login', true);
    const login = await pagina.caja('#login');
    assert.notEqual(login, null, 'sin sesión esperaba que #login esté en el DOM');
    const pipeline = await pagina.caja('#pipeline');
    assert.equal(pipeline, null, 'sin sesión esperaba que #pipeline NO esté en el DOM');
  } finally {
    await pagina.cerrar();
  }
});

test('C-01 · arranque con sesión muestra el pipeline y NO el login', async () => {
  requerirArchivo(FIXTURE('app.html'));
  let pagina;
  try {
    pagina = await abrir(FIXTURE('app.html?caso=con-sesion'));
  } catch {
    assert.fail('no se pudo abrir public/fixtures/app.html en el navegador de pruebas');
    return;
  }
  try {
    await esperarVista(pagina, '#pipeline', true);
    const pipeline = await pagina.caja('#pipeline');
    assert.notEqual(pipeline, null, 'con sesión esperaba que #pipeline esté en el DOM');
    const login = await pagina.caja('#login');
    assert.equal(login, null, 'con sesión esperaba que #login NO esté en el DOM');
  } finally {
    await pagina.cerrar();
  }
});

test('C-01 · login exitoso entra a la app sin recargar', async () => {
  requerirArchivo(FIXTURE('app.html'));
  let pagina;
  try {
    pagina = await abrir(FIXTURE('app.html?caso=login-ok'));
  } catch {
    assert.fail('no se pudo abrir public/fixtures/app.html en el navegador de pruebas');
    return;
  }
  try {
    await esperarVista(pagina, '#login', true);
    await pagina.click('#login-boton');
    await esperarVista(pagina, '#pipeline', true);
    await esperarVista(pagina, '#login', false);
    const pipeline = await pagina.caja('#pipeline');
    assert.notEqual(pipeline, null, 'tras el login exitoso esperaba #pipeline en el DOM sin recargar');
    const login = await pagina.caja('#login');
    assert.equal(login, null, 'tras el login exitoso esperaba #login fuera del DOM (sin recargar)');
  } finally {
    await pagina.cerrar();
  }
});

test('C-03 · login fallido deja el mensaje genérico en pantalla', async () => {
  requerirArchivo(FIXTURE('app.html'));
  let pagina;
  try {
    pagina = await abrir(FIXTURE('app.html?caso=login-falla'));
  } catch {
    assert.fail('no se pudo abrir public/fixtures/app.html en el navegador de pruebas');
    return;
  }
  try {
    await esperarVista(pagina, '#login', true);
    await pagina.click('#login-boton');
    await esperarVista(pagina, '#login-error', true);
    const mensaje = await pagina.texto('#login-error');
    assert.equal(
      mensaje,
      'credenciales inválidas',
      'esperaba el mensaje devuelto por la API en #login-error, no un texto propio de la SPA',
    );
    const login = await pagina.caja('#login');
    assert.notEqual(login, null, 'tras el rechazo esperaba que #login siga en el DOM');
    const boton = await pagina.caja('#login-boton');
    assert.notEqual(boton, null, 'tras el rechazo esperaba el formulario usable para reintentar (#login-boton en el DOM)');
  } finally {
    await pagina.cerrar();
  }
});

test('C-05 · el logout vuelve al login', async () => {
  requerirArchivo(FIXTURE('app.html'));
  let pagina;
  try {
    pagina = await abrir(FIXTURE('app.html?caso=logout-ok'));
  } catch {
    assert.fail('no se pudo abrir public/fixtures/app.html en el navegador de pruebas');
    return;
  }
  try {
    await esperarVista(pagina, '#pipeline', true);
    await pagina.click('#logout-boton');
    await esperarVista(pagina, '#login', true);
    await esperarVista(pagina, '#pipeline', false);
    const login = await pagina.caja('#login');
    assert.notEqual(login, null, 'tras el logout esperaba #login en el DOM sin recargar');
    const pipeline = await pagina.caja('#pipeline');
    assert.equal(pipeline, null, 'tras el logout esperaba #pipeline fuera del DOM (sin recargar)');
  } finally {
    await pagina.cerrar();
  }
});
