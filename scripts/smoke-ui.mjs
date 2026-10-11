/**
 * smoke-ui.mjs — el smoke que abre la app publicada EN UN NAVEGADOR y la maneja.
 *
 * Por qué existe: el smoke de `smoke.mjs` habla HTTP, y el usuario no aprieta HTTP: aprieta un
 * botón. Todo el camino de acceso estaba verde por HTTP y el login quedaba inerte en pantalla —
 * el `200` llegaba, la cookie se ponía, y no pasaba nada. Un chequeo que no maneja el artefacto
 * no puede ver eso.
 *
 * Uso:  MYINTERVIEWS_URL=<url> MYINTERVIEWS_EMAIL=<mail> MYINTERVIEWS_PASSWORD=<clave> node scripts/smoke-ui.mjs
 * Requiere Chrome/Chromium (CHROME_BIN, o el default de macOS) y Node ≥ 22 (WebSocket global).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const URL_APP = process.env.MYINTERVIEWS_URL;
const EMAIL = process.env.MYINTERVIEWS_EMAIL;
const CLAVE = process.env.MYINTERVIEWS_PASSWORD;
if (!URL_APP || !EMAIL || !CLAVE) {
  console.error('Faltan MYINTERVIEWS_URL, MYINTERVIEWS_EMAIL o MYINTERVIEWS_PASSWORD.');
  process.exit(2);
}

function buscarNavegador() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const candidatos = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidatos.find((c) => existsSync(c)) || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function conectar(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error(`no pude conectar a ${wsUrl}`)), { once: true });
  });
  let id = 0;
  const pendientes = new Map();
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id && pendientes.has(m.id)) {
      const { res, rej } = pendientes.get(m.id); pendientes.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pendientes.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { send, close: () => ws.close() };
}

async function esperarDevtools(puerto, limiteMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < limiteMs) {
    try { if ((await fetch(`http://127.0.0.1:${puerto}/json/version`)).ok) return; } catch { /* todavía no */ }
    await sleep(150);
  }
  throw new Error('el navegador no expuso el puerto de DevTools a tiempo');
}

const resultados = [];
const t = (nombre, ok, detalle) => {
  resultados.push({ nombre, ok, detalle });
  console.log(`  ${ok ? '✓' : '✗'} ${nombre}${ok || !detalle ? '' : ` — ${detalle}`}`);
};

// Antes de abrir el navegador: ¿la IP está limitada por intentos fallidos (C-04)? Este sondeo
// usa la contraseña CORRECTA, que no se registra como fallo, así que no gasta intentos. Sin
// esto, una corrida bloqueada reporta «la app no entra» cuando la app está defendiéndose.
try {
  const s = await fetch(`${URL_APP}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: CLAVE }),
  });
  if (s.status === 429) {
    console.log(`\n  ⚠ 429: la IP está limitada por intentos fallidos — es C-04 funcionando, no un defecto.`);
    console.log('    La ventana son 15 minutos. Este resultado no dice nada de la interfaz.\n');
    process.exit(3);
  }
  if (s.status !== 200) {
    console.log(`\n  ⚠ el sondeo de login devolvió ${s.status}: sin sesión no se puede probar la interfaz.\n`);
    process.exit(3);
  }
} catch (err) {
  console.error(`\nNo se pudo sondear el login: ${err.message}\n`);
  process.exit(3);
}

const navegador = buscarNavegador();
if (!navegador) { console.error('No encontré Chrome/Chromium. Definí CHROME_BIN.'); process.exit(2); }

const perfil = join(process.cwd(), '.tmp', `smoke-ui-${process.pid}`);
mkdirSync(perfil, { recursive: true });
const puerto = 9100 + Math.floor(Math.random() * 800);
const proc = spawn(navegador, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${perfil}`, `--remote-debugging-port=${puerto}`, 'about:blank',
], { stdio: 'ignore' });

let cdp = null;
const limpiar = async () => {
  try { cdp && cdp.close(); } catch { /* ya */ }
  try { proc.kill('SIGKILL'); } catch { /* ya */ }
  try { rmSync(perfil, { recursive: true, force: true }); } catch { /* best effort */ }
};

console.log(`\nSmoke de la interfaz contra ${URL_APP}\n`);

try {
  await esperarDevtools(puerto);
  const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
  const objetivo = lista.find((x) => x.type === 'page') || lista[0];
  cdp = await conectar(objetivo.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: URL_APP });

  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'error al evaluar');
    return r.result ? r.result.value : undefined;
  };
  const existe = (sel) => ev(`!!document.querySelector(${JSON.stringify(sel)})`);
  const texto = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
    return e ? (e.innerText ?? e.value ?? '') : null; })()`);

  /** Espera hasta que la expresión sea verdadera, o se agota. */
  const esperar = async (expr, limiteMs = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < limiteMs) {
      if (await ev(expr)) return true;
      await sleep(200);
    }
    return false;
  };

  // 1 · la app arranca sin sesión y muestra el login
  const hayLogin = await esperar('!!document.querySelector("#login")');
  t('1 · la app abre en el login (sin sesión)', hayLogin, 'no apareció #login');

  const hayPipelineAntes = await existe('#pipeline');
  t('2 · sin sesión NO se ve el pipeline', hayPipelineAntes === false, `#pipeline presente: ${hayPipelineAntes}`);

  // 3 · contraseña equivocada: el error se ve en pantalla y no se entra
  if (hayLogin) {
    await ev(`(() => { const e = document.querySelector('#login-email'); const p = document.querySelector('#login-password');
      if (e) { e.value = ${JSON.stringify(EMAIL)}; e.dispatchEvent(new Event('input', { bubbles: true })); }
      if (p) { p.value = 'equivocada-a-proposito'; p.dispatchEvent(new Event('input', { bubbles: true })); }
      return true; })()`);
    await ev(`(() => { const b = document.querySelector('#login-boton'); if (b) b.click(); return true; })()`);
    const hayError = await esperar('!!document.querySelector("#login-error") && document.querySelector("#login-error").innerText.trim().length > 0', 12000);
    t('3 · con la clave mal, el error SE VE en pantalla', hayError, 'no apareció texto en #login-error');
    t('4 · con la clave mal, NO se entra', (await existe('#pipeline')) === false, '#pipeline apareció con credenciales malas');
  } else {
    t('3 · con la clave mal, el error SE VE en pantalla', false, 'no había login para probar');
    t('4 · con la clave mal, NO se entra', false, 'no había login para probar');
  }

  // 5 · credenciales correctas: se entra de verdad, sin recargar
  await ev(`(() => { const p = document.querySelector('#login-password');
    if (p) { p.value = ${JSON.stringify(CLAVE)}; p.dispatchEvent(new Event('input', { bubbles: true })); }
    const b = document.querySelector('#login-boton'); if (b) b.click(); return true; })()`);
  const entra = await esperar('!!document.querySelector("#pipeline")', 15000);
  t('5 · con las credenciales correctas la app ENTRA (aparece #pipeline)', entra,
    `seguía sin #pipeline. Texto del login: ${JSON.stringify(await texto('#login'))}`);
  t('6 · al entrar, el login deja de mostrarse', (await existe('#login')) === false, '#login sigue visible con sesión');

  // 7 · el logout vuelve al login
  if (entra) {
    const haySalir = await existe('#logout') || await existe('#logout-boton');
    if (haySalir) {
      await ev(`(() => { const b = document.querySelector('#logout') || document.querySelector('#logout-boton');
        if (b) b.click(); return true; })()`);
      const volvio = await esperar('!!document.querySelector("#login")', 12000);
      t('7 · el logout vuelve al login', volvio, 'no volvió a #login');
    } else {
      t('7 · el logout vuelve al login', false, 'no encontré ningún control de salida (#logout / #logout-boton)');
    }
  } else {
    t('7 · el logout vuelve al login', false, 'no se entró: no se puede probar la salida');
  }
} catch (err) {
  console.error(`\nNo se pudo completar el smoke de interfaz: ${err.message}\n`);
} finally {
  await limpiar();
}

const ok = resultados.filter((r) => r.ok).length;
const fallaron = resultados.filter((r) => !r.ok).map((r) => r.nombre);
console.log(`\n${ok} ok / ${resultados.length - ok} fail / ${resultados.length} corridos`);
if (fallaron.length) console.log(`Fallaron: ${fallaron.join(' · ')}`);
process.exit(fallaron.length ? 1 : 0);
