#!/usr/bin/env node
/**
 * render-status.mjs — Tablero de avance (Worker solo-assets de Cloudflare).
 *
 * Uso:  node scripts/render-status.mjs <ruta-del-proyecto>
 *
 * Lee   <proyecto>/docs/estado.json     (fuente de verdad; lo deriva collect-status.mjs)
 * Escribe <proyecto>/tablero/public/index.html
 *
 * Sin build, sin dependencias, sin framework, sin JS que llame a una API. Todo el dato
 * viaja en el HTML: una vista que depende de un endpoint es una vista que puede mentir
 * cuando el endpoint cae. `estado.json` es la verdad; este HTML es su foto.
 *
 * Lista BLANCA de campos: un campo desconocido NO se imprime y se reporta por stderr —
 * el fallo más caro es el que no se nota. Prohibido en la salida: rutas `/Users/` o
 * `/home/`, `.hermes`, `API_TOKEN`, `cfat_`: todo lo que publica el tablero es PÚBLICO.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectDir = resolve(process.argv[2] || '.');
const estadoPath = join(projectDir, 'docs', 'estado.json');

if (!existsSync(estadoPath)) {
  console.error(`No existe ${estadoPath} — el estado vive ahí, no en el HTML.`);
  process.exit(1);
}
const e = JSON.parse(readFileSync(estadoPath, 'utf8'));

// ── lista blanca ─────────────────────────────────────────────────────────────
const BLANCA = new Set([
  'proyecto', 'resumen', 'ciclo', 'etapa', 'fase_actual', 'perfil', 'siguiente',
  'nota_de_proceso', 'fases', 'tareas', 'historias', 'siguientes_ciclos', 'decisiones',
  'gates', 'despliegue', 'mockup', 'generado_en', 'commit_sha', 'mecanica',
]);
for (const k of Object.keys(e)) {
  if (!BLANCA.has(k)) console.error(`⚠ campo fuera de la lista blanca, no se imprime: «${k}»`);
}

const ESTADOS = {
  listo: { t: 'Listo', i: '✓', c: 'ok' },
  'en-curso': { t: 'En curso', i: '◐', c: 'run' },
  pendiente: { t: 'Pendiente', i: '○', c: 'wait' },
  diferido: { t: 'Diferido', i: '⤳', c: 'def' },
  bloqueado: { t: 'Bloqueado', i: '!', c: 'blk' },
  propuesto: { t: 'Propuesto', i: '◇', c: 'prop' },
  'en-pausa': { t: 'En pausa', i: '⏸', c: 'def' },
  aprobado: { t: 'Aprobado', i: '▶', c: 'ok' },
};
const est = (k) => ESTADOS[k] || ESTADOS.pendiente;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const tareas = e.tareas || [];
for (const t of tareas) {
  if (!Object.hasOwn(ESTADOS, t.estado)) {
    console.error(`✗ ${t.id}: estado «${t.estado}» no válido. Un estado desconocido se contaba como 0%.`);
    console.error(`  Válidos: ${Object.keys(ESTADOS).join(' · ')}`);
    process.exit(1);
  }
}
const hechas = tareas.filter((t) => t.estado === 'listo').length;
const pct = tareas.length ? Math.round((hechas / tareas.length) * 100) : 0;
const fuente = (s) => `<span class="fuente">fuente: ${esc(s)}</span>`;

// ── A · Criterios ────────────────────────────────────────────────────────────
const crit = (e.mecanica && e.mecanica.criterios) || [];
const filasCrit = crit.map((c) => `<tr>
    <td><code>${esc(c.id)}</code></td><td>${esc(c.clase)}</td>
    <td>${c.cubierto ? '✓ cubierto' : '✗ sin test'}</td>
    <td>${c.oculto ? 'promovido' : '—'}</td></tr>`).join('');

// ── B · Integridad por tarea ─────────────────────────────────────────────────
const ing = (e.mecanica && e.mecanica.integridad) || null;

// ── C · Gates ────────────────────────────────────────────────────────────────
const gates = Object.entries(e.gates || {}).sort(([a], [b]) => a.localeCompare(b));
const filasGates = gates.map(([g, v]) => {
  const ev = Number(v.evaluado) || 0, rc = Number(v.rechazo) || 0;
  const tasa = ev ? Math.round((rc / ev) * 100) : 0;
  return `<tr><td><code>${esc(g)}</code></td><td class="num">${ev}</td><td class="num">${rc}</td><td class="num">${tasa}%</td></tr>`;
}).join('');

// ── D · Costo ────────────────────────────────────────────────────────────────
const costo = (e.mecanica && e.mecanica.costo) || null;

// ── E · Lo publicado ─────────────────────────────────────────────────────────
const dep = e.despliegue || {};
const mock = e.mockup || {};
const hist = (e.mecanica && e.mecanica.historico) || [];

const listaTareas = tareas.map((t) => {
  const s = est(t.estado);
  return `<li class="${s.c}"><span class="tk-estado">${s.i}</span>
    <span class="tk-id">${esc(t.id)}</span><span class="tk-titulo">${esc(t.titulo)}</span></li>`;
}).join('');

const gen = e.generado_en || '';
const sha = e.commit_sha || '';

let html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>Avance · ${esc(e.proyecto)}</title>
<style>
  :root{--bg:#0d1117;--surface:#161b22;--surface2:#1c2128;--border:#30363d;--text:#e6edf3;
    --muted:#8b949e;--accent:#58a6ff;--ok:#3fb950;--run:#d29922;--blk:#f85149;--def:#a371f7}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .wrap{max-width:1100px;margin:0 auto;padding:32px 24px 64px}
  header.top{border-bottom:1px solid var(--border);padding-bottom:20px;margin-bottom:28px}
  h1{margin:8px 0 4px;font-size:30px}
  .sub{color:var(--muted);margin:0}
  .kpis{display:flex;flex-wrap:wrap;gap:24px;margin-top:16px}
  .kpi b{font-size:20px}
  .kpi span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
  .frescura{font-size:13px;margin-top:10px}
  .frescura.amb{color:var(--run)} .frescura.rojo{color:var(--blk)} .frescura.ok{color:var(--ok)}
  h2{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:36px 0 4px}
  .h2sub{color:var(--muted);font-size:13px;margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;padding:8px;border-bottom:1px solid var(--border)}
  td{padding:8px;border-bottom:1px solid var(--surface2)}
  td.num{font-variant-numeric:tabular-nums;text-align:right}
  code{font:12px ui-monospace,Menlo,monospace;color:var(--accent);background:var(--surface2);padding:2px 6px;border-radius:4px}
  ul.lista{list-style:none;margin:0;padding:0;display:grid;gap:6px}
  ul.lista li{display:grid;grid-template-columns:22px 52px 1fr;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px}
  .tk-estado{color:var(--muted)} .tk-id{color:var(--muted);font-variant-numeric:tabular-nums}
  li.ok .tk-estado{color:var(--ok)} li.run .tk-estado{color:var(--run)} li.blk .tk-estado{color:var(--blk)}
  .caja{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px}
  .fuente{display:block;color:var(--muted);font-size:11px;margin-top:6px}
  .chip{font-size:11px;padding:2px 8px;border-radius:99px;background:rgba(88,166,255,.15);color:var(--accent)}
  footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--border);color:var(--muted);font-size:12px}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="sub">Tablero de avance · proceso idea → pruebas</div>
    <h1>${esc(e.proyecto)}</h1>
    <p class="sub">${esc(e.resumen || '')}</p>
    <div class="kpis">
      <div class="kpi"><b>${pct}%</b><span>Tareas</span></div>
      <div class="kpi"><b>${hechas}/${tareas.length}</b><span>Completadas</span></div>
      ${e.ciclo ? `<div class="kpi"><b>${esc(e.ciclo)}</b><span>Ciclo</span></div>` : ''}
      ${e.perfil ? `<div class="kpi"><b>${esc(e.perfil)}</b><span>Perfil</span></div>` : ''}
    </div>
    <p class="frescura" id="frescura">generado_en ${esc(gen)} · commit_sha ${esc(sha)}
      · <span id="hace">calculando…</span></p>
  </header>

  <h2>A · Criterios de aceptación</h2>
  <p class="h2sub">El contrato. Un criterio cubierto pero rojo y uno sin test se ven distinto.</p>
  <table><thead><tr><th>ID</th><th>Clase</th><th>Cobertura</th><th>Oculto</th></tr></thead>
  <tbody>${filasCrit || '<tr><td colspan="4">sin matriz</td></tr>'}</tbody></table>
  ${fuente('docs/04-DISENO.md + tests/ (grep)')}

  <h2>B · Integridad por tarea</h2>
  <div class="caja">
    ${ing ? `<p>Sello: <span class="chip">${esc(ing.sello)}</span> · RED: ${esc(ing.red)} · mutación: ${esc(ing.mutacion)} · árbol: ${ing.arbol_limpio ? 'limpio' : 'sucio'}</p>` : '<p>sin datos de integridad</p>'}
  </div>
  ${fuente('freeze-tests.sh verify · git status --porcelain · docs/06-QA-REPORT.md')}

  <h2>C · Gates</h2>
  <table><thead><tr><th>Gate</th><th class="num">Evaluado</th><th class="num">Rechazó</th><th class="num">Tasa</th></tr></thead>
  <tbody>${filasGates || '<tr><td colspan="4">sin contadores</td></tr>'}</tbody></table>
  ${fuente('estado.json → gates (lo escribe review.sh)')}

  <h2>D · Costo</h2>
  <div class="caja">
    ${costo ? `<p><b>USD ${esc(costo.usd)}</b> · ${esc(costo.tokens_in)} tokens in · ${esc(costo.tokens_out)} tokens out · ${esc(costo.corridas)} corrida(s)${costo.no_atribuibles ? ` · ${esc(costo.no_atribuibles)} «no atribuible»` : ''}${costo.sin_medir ? ` · faltan ${esc(costo.sin_medir)} por medir` : ''}</p>` : '<p>sin datos de costo</p>'}
  </div>
  ${fuente('docs/corridas/*.json (sumado, nunca estimado)')}

  <h2>E · Lo publicado</h2>
  <div class="caja">
    <p>Producto: ${dep.url ? `<a href="${esc(dep.url)}">${esc(dep.url)}</a>` : 'sin URL'}${dep.smoke ? ` · smoke ${esc(dep.smoke)}` : ''}</p>
    <p>Mockup: ${mock.url ? `<a href="${esc(mock.url)}">${esc(mock.url)}</a>` : (mock.plataforma ? esc(mock.plataforma) : 'sin mockup')}</p>
  </div>
  ${fuente('estado.json → despliegue (lo escribe deploy.sh) · mockup')}

  <h2>Tareas del ciclo</h2>
  <ul class="lista">${listaTareas || '<li>sin tareas</li>'}</ul>

  <h2>Histórico de corridas</h2>
  <table><thead><tr><th>Tarea</th><th>Modelo</th><th>Desenlace</th></tr></thead>
  <tbody>${hist.map((c) => `<tr><td><code>${esc(c.tarea)}</code></td><td>${esc(c.modelo)}</td><td>${esc(c.desenlace)}</td></tr>`).join('') || '<tr><td colspan="3">sin corridas</td></tr>'}</tbody></table>
  ${fuente('docs/corridas/*.json')}

  <footer>
    ${e.siguiente ? `<p><strong>Siguiente:</strong> ${esc(e.siguiente)}</p>` : ''}
    <p>actualizado ${esc(gen)} · ${esc(sha)}</p>
  </footer>
</div>
<script>
  (() => {
    const gen = ${JSON.stringify(gen)};
    const el = document.getElementById('hace');
    const caja = document.getElementById('frescura');
    const t = Date.parse(gen);
    if (!el || !isFinite(t)) { if (el) el.textContent = 'frescura desconocida'; return; }
    const min = Math.max(0, Math.round((Date.now() - t) / 60000));
    el.textContent = min < 1 ? 'actualizado hace instantes' : 'actualizado hace ' + min + ' min';
    caja.classList.add(min >= 60 ? 'rojo' : min >= 15 ? 'amb' : 'ok');
  })();
</script>
</body>
</html>`;

// ── nada privado en una URL abierta ─────────────────────────────────────────
const PROHIBIDO = [/\/Users\//g, /\/home\//g, /\.hermes/g, /API_TOKEN/g, /cfat_/g];
for (const re of PROHIBIDO) {
  if (re.test(html)) {
    console.error(`✗ el tablero intentaba publicar «${re.source}» — se ocultó (todo lo que está acá es público).`);
    html = html.replace(re, '«oculto»');
  }
}

const outDir = join(projectDir, 'tablero', 'public');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'index.html');
writeFileSync(out, html, 'utf8');
console.log(`✓ ${out} (${hechas}/${tareas.length} tareas · ${pct}%)`);
