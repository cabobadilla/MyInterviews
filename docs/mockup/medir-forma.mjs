/**
 * docs/mockup/medir-forma.mjs — Mide M-1..M-4 sobre el mockup RENDERIZADO.
 * No es evidencia de producto: es el cierre de la fase 3 (criterios de clase `forma`).
 */
import { abrir } from '../../tests/helpers/browser.mjs';

const cerca = (a, b, tol) => Math.abs(a - b) <= tol;
const p = await abrir('docs/mockup/public/index.html');
const res = [];
const chk = (id, nombre, ok, detalle) => res.push({ id, nombre, ok, detalle });

try {
  // ---------- M-2 · navegación lateral (pantalla Pipeline) ----------
  const sb = await p.caja('#sidebar');
  const cont = await p.caja('#contadores');
  const gapLateral = cont.x - (sb.x + sb.width);
  chk('M-2', 'barra lateral 240±6 y contenido a +24±6',
    cerca(sb.width, 240, 6) && cerca(gapLateral, 24, 6),
    `ancho=${sb.width.toFixed(1)} (240±6) · contenido arranca ${gapLateral.toFixed(1)}px tras la barra (24±6)`);

  // ---------- M-1 · columnas del tablero ----------
  const cols = [];
  for (let i = 1; i <= 5; i++) cols.push(await p.caja(`#board .col:nth-child(${i})`));
  const tops = cols.map(c => c.y), anchos = cols.map(c => c.width);
  const mismoTop = tops.every(t => cerca(t, tops[0], 4));
  const mismoAncho = anchos.every(a => cerca(a, anchos[0], 4));
  const creciente = cols.every((c, i) => i === 0 || c.x > cols[i - 1].x);
  chk('M-1', 'columnas del tablero: mismo top ±4, mismo ancho ±4, left creciente',
    mismoTop && mismoAncho && creciente,
    `top=[${tops.map(t => t.toFixed(1)).join(', ')}] · ancho=[${anchos.map(a => a.toFixed(1)).join(', ')}] · left creciente=${creciente}`);

  // ---------- M-4 · próximas entrevistas: fecha en la misma columna ----------
  const filas = [];
  for (let i = 2; i <= 4; i++) filas.push(await p.caja(`#agenda tr:nth-child(${i}) td.d`));
  const izq = filas.map(f => f.x);
  chk('M-4', 'fecha de próximas entrevistas alineada (left ±3)',
    izq.length === 3 && izq.every(v => cerca(v, izq[0], 3)),
    `left=[${izq.map(v => v.toFixed(1)).join(', ')}] (tol 3)`);

  // ---------- M-3 · editor y vista previa lado a lado ----------
  await p.click('#sidebar button[data-s="editor"]');
  const p1 = await p.caja('#editor .pane:nth-child(1)');
  const p2 = await p.caja('#editor .pane:nth-child(2)');
  const gap = p2.x - (p1.x + p1.width);
  chk('M-3', 'editor y vista previa: mismo top ±4, mismo alto ±6, gap 16±4',
    cerca(p1.y, p2.y, 4) && cerca(p1.height, p2.height, 6) && cerca(gap, 16, 4),
    `top=[${p1.y.toFixed(1)}, ${p2.y.toFixed(1)}] · alto=[${p1.height.toFixed(1)}, ${p2.height.toFixed(1)}] · gap=${gap.toFixed(1)} (16±4)`);

  // ---------- existencia de las 9 pantallas ----------
  for (const s of ['pipeline', 'nueva', 'oferta', 'perfil', 'app', 'editor', 'entrevistas', 'cierre', 'login']) {
    const ok = (await p.caja(`#s-${s}`)) !== null;
    chk('E-' + s, `existe la pantalla #s-${s}`, ok, ok ? 'presente' : 'AUSENTE');
  }

  // ---------- contadores: los 7 estados visibles ----------
  const kpis = await p.texto('#contadores');
  const estados = ['Borrador', 'Preparando', 'Enviada', 'Entrevistas', 'Oferta', 'Rechazada', 'Cerrada'];
  const faltan = estados.filter(e => !kpis.includes(e));
  chk('E-kpi', 'los 7 estados aparecen en el tablero', faltan.length === 0,
    faltan.length ? 'faltan: ' + faltan.join(', ') : 'los 7 presentes');
} finally {
  await p.cerrar();
}

let fallos = 0;
for (const r of res) {
  if (!r.ok) fallos++;
  console.log(`${r.ok ? '✔' : '✘'} ${r.id} ${r.nombre}\n    ${r.detalle}`);
}
console.log(`\n${res.length - fallos}/${res.length} mediciones OK`);
process.exit(fallos ? 1 : 0);
