/**
 * browser.mjs — Helper SELLADO para verificar comportamiento y forma de verdad.
 *
 * Por qué existe (v0.40, aprendizaje #80):
 *   El prompt del Coder traía una receta de ~10 líneas —servidor `node:http`, Chrome
 *   headless con la ruta hardcodeada de macOS, CDP por WebSocket— que el Coder
 *   re-implementaba EN CADA TAREA de comportamiento. Era la parte más cara y frágil
 *   de todo lo que se le pide. El harness provee el helper; el Coder lo importa.
 *
 * Se sella con freeze-tests.sh junto con los tests: es INFRAESTRUCTURA, no contrato de
 * la tarea. El Coder NO lo edita; si falla, es un hallazgo del arnés, no del entregable.
 *
 * Expone EXACTAMENTE cuatro funciones y nada más:
 *   await abrir(rutaHtml)   → sirve el archivo, levanta el navegador, devuelve una página
 *   pagina.click(sel)
 *   pagina.texto(sel)
 *   pagina.caja(sel)        → getBoundingClientRect() — es lo que mide la clase `forma`
 *   pagina.cerrar()         → cierra navegador y servidor; idempotente
 *
 * La ruta del navegador sale de acá, no del prompt, y se resuelve por entorno
 * (CHROME_BIN, con el default de macOS como último recurso).
 *
 * Sin dependencias: `node:http`, `node:child_process`, `node:fs`, WebSocket global.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const EXT = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Candidatos de binario de Chrome/Chromium, en orden de preferencia. */
function buscarNavegador() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const candidatos = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
  return candidatos.find((c) => existsSync(c)) || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Conecta por CDP a una URL de WebSocket y devuelve un cliente {send, close}. */
async function conectar(wsUrl) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('browser.mjs necesita el WebSocket global (Node ≥ 22).');
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error(`no pude conectar a ${wsUrl}`)), { once: true });
  });
  let id = 0;
  const pendientes = new Map();
  ws.addEventListener('message', (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id && pendientes.has(m.id)) {
      const { res, rej } = pendientes.get(m.id);
      pendientes.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pendientes.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { send, close: () => ws.close() };
}

/** Sirve el directorio del archivo en un puerto libre y devuelve {server, url}. */
function servir(rutaHtml) {
  const raiz = resolve(join(rutaHtml, '..'));
  const archivo = resolve(rutaHtml);
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    const destino = resolve(join(raiz, rel)); // el fixture es de confianza: es una prueba
    if (!destino.startsWith(raiz) || !existsSync(destino)) {
      res.writeHead(404); res.end('404'); return;
    }
    res.writeHead(200, { 'content-type': EXT[extname(destino)] || 'application/octet-stream' });
    createReadStream(destino).pipe(res);
  });
  return new Promise((res) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      res({ server, url: `http://127.0.0.1:${port}/${archivo.slice(raiz.length + 1)}` });
    });
  });
}

async function esperarDevtools(puerto, limiteMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < limiteMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${puerto}/json/version`);
      if (r.ok) return;
    } catch { /* todavía no levanta */ }
    await sleep(150);
  }
  throw new Error('el navegador no expuso el puerto de DevTools a tiempo');
}

/**
 * Abre un HTML en un navegador headless y devuelve una página manejable.
 * @param {string} rutaHtml
 */
export async function abrir(rutaHtml) {
  const navegador = buscarNavegador();
  if (!navegador) {
    throw new Error('No encontré Chrome/Chromium. Definí CHROME_BIN o instalá uno.');
  }
  const perfil = join(process.cwd(), '.tmp', `browser-${process.pid}-${Date.now()}`);
  mkdirSync(perfil, { recursive: true });

  const { server, url } = await servir(rutaHtml);
  const puerto = 9000 + Math.floor(Math.random() * 1000);

  const proc = spawn(navegador, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${perfil}`,
    `--remote-debugging-port=${puerto}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let cerrado = false;
  const limpiar = async () => {
    if (cerrado) return;
    cerrado = true;
    try { proc.kill('SIGKILL'); } catch { /* ya murió */ }
    await new Promise((res) => server.close(res));
    try { rmSync(perfil, { recursive: true, force: true }); } catch { /* best effort */ }
  };

  const cerrarTodo = async (cliente) => {
    try { cliente && cliente.close(); } catch { /* ya cerrado */ }
    await limpiar();
  };

  try {
    await esperarDevtools(puerto);
    const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
    const objetivo = lista.find((t) => t.type === 'page') || lista[0];
    if (!objetivo || !objetivo.webSocketDebuggerUrl) {
      throw new Error('el navegador no expuso ninguna página por CDP');
    }
    const cdp = await conectar(objetivo.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url });

    // Esperar a que la página termine de cargar (poll del readyState).
    const t0 = Date.now();
    let listo = false;
    while (Date.now() - t0 < 10000) {
      const r = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (r.result && r.result.value === 'complete') { listo = true; break; }
      await sleep(100);
    }
    if (!listo) throw new Error(`la página no terminó de cargar: ${url}`);

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || 'error al evaluar en la página');
      }
      return r.result ? r.result.value : undefined;
    };

    const pagina = {
      async click(sel) {
        await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
          if (!e) throw new Error('no existe ' + ${JSON.stringify(sel)}); e.click(); return true; })()`);
      },
      async texto(sel) {
        return await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
          return e ? (e.innerText ?? e.value ?? '') : null; })()`);
      },
      async caja(sel) {
        return await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
          if (!e) return null; const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
      },
      async cerrar() { await cerrarTodo(cdp); },
    };
    return pagina;
  } catch (err) {
    await cerrarTodo(null);
    throw err;
  }
}
