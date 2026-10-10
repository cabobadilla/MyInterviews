#!/usr/bin/env node
/**
 * collect-status.mjs — Deriva la mitad MECÁNICA del estado del proyecto.
 *
 * Uso:  node scripts/collect-status.mjs <ruta-del-proyecto>
 *
 * Escribe <proyecto>/docs/estado.json fusionando:
 *   - la narrativa humana  → docs/estado-manual.json  (se escribe a mano)
 *   - la parte mecánica    → derivada del repo (este script)
 *
 * Por qué existe (v0.40, §5.3): actualizar el tablero era un acto de autoría —
 * Hermes tenía que acordarse de editar estado.json con la verdad. Un tablero que
 * depende de la memoria se atrasa exactamente como se atrasó VERSION. Separar las dos
 * mitades permite refrescar la mecánica sin tocar la narrativa.
 *
 * Prohibido: rutas absolutas, `.hermes`, tokens. Todo lo que sale de acá es público.
 * Determinista: dos corridas seguidas dan bytes idénticos salvo `generado_en`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const P = resolve(process.argv[2] || '.');
const DOCS = join(P, 'docs');
const estadoPath = join(DOCS, 'estado.json');
const manualPath = join(DOCS, 'estado-manual.json');

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const git = (args) => {
  try { return execFileSync('git', ['-C', P, ...args], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
};

// ── narrativa humana ─────────────────────────────────────────────────────────
// Preferimos estado-manual.json; si no existe, tomamos el estado.json actual sin los
// campos que este script deriva (así una corrida no pisa la narrativa de la anterior).
let manual = {};
if (existsSync(manualPath)) {
  manual = JSON.parse(read(manualPath));
} else if (existsSync(estadoPath)) {
  manual = JSON.parse(read(estadoPath));
}
for (const k of ['mecanica', 'generado_en', 'commit_sha']) delete manual[k];

// ── tareas: de 05-TAREAS.md (+ el estado que declare la narrativa) ───────────
const tareasMd = read(join(DOCS, '05-TAREAS.md'));
const narrTareas = new Map((manual.tareas || []).map((t) => [t.id, t]));
const tareas = [];
const vistos = new Set();
for (const linea of tareasMd.split('\n')) {
  const m = linea.match(/(T-\d+)\b/);
  if (!m) continue;
  const id = m[1];
  if (vistos.has(id)) continue;
  vistos.add(id);
  const hecho = /\[x\]/i.test(linea);
  const nar = narrTareas.get(id) || {};
  const titulo = linea
    .replace(/^\s*[-*]\s*\[[ xX]\]\s*/, '')
    .replace(id, '')
    .replace(/^[\s—:–-]+/, '')
    .trim()
    .slice(0, 120);
  tareas.push({
    id,
    titulo: nar.titulo || titulo,
    estado: nar.estado || (hecho ? 'listo' : 'pendiente'),
    nota: nar.nota || '',
  });
}
// Tareas que la narrativa declara y el archivo no lista: no se pierden.
for (const [id, t] of narrTareas) if (!vistos.has(id)) tareas.push(t);

// ── criterios C-xx: de la matriz + cobertura por grep ────────────────────────
const diseno = read(join(DOCS, '04-DISENO.md'));
let ids = new Set();
for (const m of diseno.matchAll(/C-(\d+)\.\.C-(\d+)/g)) {
  for (let i = Number(m[1]); i <= Number(m[2]); i++) ids.add(`C-${String(i).padStart(2, '0')}`);
}
for (const m of diseno.matchAll(/C-\d+/g)) ids.add(m[0]);
const testsSrc = (() => {
  const dir = join(P, 'tests');
  if (!existsSync(dir)) return '';
  return readdirSync(dir).filter((f) => f.endsWith('.mjs'))
    .map((f) => read(join(dir, f))).join('\n');
})();
const ocultoSrc = (() => {
  const dir = join(P, 'tests', 'oculto');
  if (!existsSync(dir)) return '';
  return readdirSync(dir).map((f) => read(join(dir, f))).join('\n');
})();
const claseDe = (id) => {
  const fila = diseno.split('\n').find((l) => l.includes(id)) || '';
  if (/comportamiento/i.test(fila)) return 'comportamiento';
  if (/\bforma\b/i.test(fila)) return 'forma';
  if (/existencia/i.test(fila)) return 'existencia';
  return '—';
};
const criterios = [...ids].sort().map((id) => ({
  id,
  clase: claseDe(id),
  cubierto: new RegExp(`['"\`]${id}\\b`).test(testsSrc),
  oculto: new RegExp(`['"\`]${id}\\b`).test(ocultoSrc),
}));

// ── suite: verde/roja por CÓDIGO DE SALIDA ───────────────────────────────────
let suite = { corre: false, verde: false };
if (existsSync(join(P, 'tests'))) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // heredado, el runner anidado da falso verde
  try {
    execFileSync('node', ['--test', 'tests/'], { cwd: P, encoding: 'utf8', stdio: 'pipe', env });
    suite = { corre: true, verde: true };
  } catch {
    suite = { corre: true, verde: false };
  }
}

// ── integridad: sello, árbol limpio, mutación (dato de G5) ───────────────────
const arbolLimpio = git(['status', '--porcelain'])
  .split('\n')
  // estado.json lo escribe ESTE script: contarlo daría "sucio" siempre, y no es señal.
  .filter((l) => l.trim() && !l.includes('docs/estado.json'))
  .length === 0;
let sello = 'sin sello';
if (existsSync(join(P, '.tmp', '.tests-seal'))) {
  try {
    execFileSync('bash', [join(P, 'scripts', 'freeze-tests.sh'), 'verify', P], { stdio: 'pipe' });
    sello = 'intacto';
  } catch { sello = 'cambiado'; }
}
const integridad = {
  sello,
  red: sello === 'intacto' ? 'verify-red' : 'tests-finales vs implementación previa',
  mutacion: read(join(DOCS, '06-QA-REPORT.md')).match(/mutaci[oó]n[^\n]*mordi/i) ? 'mordió' : 'sin dato',
  arbol_limpio: arbolLimpio,
};

// ── costo y histórico: de docs/corridas/*.json (nunca estimado) ──────────────
const corridasDir = join(DOCS, 'corridas');
const corridas = existsSync(corridasDir)
  ? readdirSync(corridasDir).filter((f) => f.endsWith('.json')).sort()
      .map((f) => { try { return JSON.parse(read(join(corridasDir, f))); } catch { return null; } })
      .filter(Boolean)
  : [];
let entIn = 0, entOut = 0, usd = 0, faltan = 0, noAtribuibles = 0;
for (const c of corridas) {
  const ni = Number(c.tokens_in), no = Number(c.tokens_out), cu = Number(c.costo_usd);
  if (Number.isFinite(ni) && Number.isFinite(no) && Number.isFinite(cu)) { entIn += ni; entOut += no; usd += cu; }
  else if (c.costo_usd === 'no atribuible') noAtribuibles++;
  else faltan++;
}
const costo = {
  usd: Number.isFinite(usd) ? Number(usd.toFixed(4)) : 0,
  tokens_in: entIn,
  tokens_out: entOut,
  corridas: corridas.length,
  no_atribuibles: noAtribuibles,
  sin_medir: faltan,
};

// ── salida ───────────────────────────────────────────────────────────────────
const estado = {
  ...manual,
  proyecto: manual.proyecto || P.split('/').pop(),
  tareas,
  gates: manual.gates || {},
  despliegue: manual.despliegue || {},
  mockup: manual.mockup || {},
  generado_en: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  commit_sha: git(['rev-parse', '--short', 'HEAD']) || 'sin-commit',
  mecanica: { criterios, integridad, costo, historico: corridas, suite },
};

mkdirSync(DOCS, { recursive: true });
writeFileSync(estadoPath, JSON.stringify(estado, null, 2) + '\n');

console.log(`✓ ${estadoPath}`);
console.log(`  ${tareas.length} tarea(s) · ${criterios.length} criterio(s) · ${corridas.length} corrida(s)`);
console.log(`  suite ${suite.verde ? 'verde' : 'roja'} · sello ${sello} · árbol ${arbolLimpio ? 'limpio' : 'sucio'}`);
