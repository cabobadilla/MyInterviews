// smoke-myinterviews.mjs — smoke del Ciclo 1 contra la URL DESPLEGADA.
//
// Vive fuera del repo del proyecto hasta que el ciclo esté cerrado: mientras el Coder
// trabaja, cualquier archivo nuevo adentro lo barre su `git add -A`.
//
// Uso:
//   MYINTERVIEWS_URL=https://... MYINTERVIEWS_EMAIL=... MYINTERVIEWS_PASSWORD=... \
//     node smoke-myinterviews.mjs
//
// Por qué existe: los tests corren en local y el emulador local NO aplica los límites
// del plan ni el runtime real. Esto es lo único que dice si la app vive donde vive.

const BASE = process.env.MYINTERVIEWS_URL || 'http://127.0.0.1:8787';
const EMAIL = process.env.MYINTERVIEWS_EMAIL;
const PASSWORD = process.env.MYINTERVIEWS_PASSWORD;

let ok = 0, fail = 0;
const fallos = [];

function t(nombre, cond, detalle = '') {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fail++; fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ' — ' + detalle : ''}`); }
}

async function req(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  let json = null;
  const texto = await res.text();
  try { json = JSON.parse(texto); } catch { /* html o vacío */ }
  return { status: res.status, json, texto, setCookie: res.headers.get('set-cookie') || '',
           tipo: res.headers.get('content-type') || '' };
}

async function main() {
  console.log(`\nSmoke del Ciclo 1 contra ${BASE}\n`);

  // ── 1-2 · la app vive y sirve ──────────────────────────────────────────────
  const home = await req('/');
  t('1 · GET / devuelve la SPA', home.status === 200 && home.tipo.includes('text/html'),
    `status ${home.status}, tipo ${home.tipo}`);
  t('2 · la SPA monta en un contenedor', home.texto.includes('<div id="root"') || home.texto.includes('<div id="app"'),
    'no encontré el contenedor de montaje');

  const salud = await req('/api/health');
  t('3 · GET /api/health responde 200 {ok:true}', salud.status === 200 && salud.json?.ok === true,
    `status ${salud.status}, cuerpo ${JSON.stringify(salud.json)}`);

  // ── 4-6 · sin sesión no se ve nada, y no se filtra nada ────────────────────
  for (const [n, ruta] of [[4, '/api/offers'], [5, '/api/applications'], [6, '/api/offers/1']]) {
    const r = await req(ruta);
    const cuerpo = JSON.stringify(r.json ?? '');
    t(`${n} · ${ruta} sin cookie da 401 sin filtrar datos`,
      r.status === 401 && !/titulo|empresa|raw_text|contadores/.test(cuerpo),
      `status ${r.status}, cuerpo ${cuerpo.slice(0, 120)}`);
  }

  const falsa = await req('/api/offers', { cookie: 'sesion=abc.def.ghi' });
  t('7 · una cookie sin firma válida da 401', falsa.status === 401, `status ${falsa.status}`);

  const sesionAnon = await req('/api/session');
  t('8 · /api/session sin cookie es público y dice autenticado:false',
    sesionAnon.status === 200 && sesionAnon.json?.autenticado === false,
    `status ${sesionAnon.status}, cuerpo ${JSON.stringify(sesionAnon.json)}`);

  // ── 9-10 · login ───────────────────────────────────────────────────────────
  // El límite de intentos (C-04) es por IP y son 5 fallos en 15 minutos. Este smoke manda una
  // contraseña mala a propósito, así que CADA CORRIDA GASTA UN INTENTO: corriéndolo en bucle se
  // bloquea la IP propia y todo lo que depende del login falla en cascada, con la apariencia de
  // una app rota. Cuando eso pasa, esto NO se puede evaluar y hay que decirlo, no contarlo como
  // 14 defectos.
  const porLimite = (r) => r.status === 429;
  const abortarPorLimite = (donde) => {
    console.log(`\n  ⚠ 429 en ${donde}: la IP está limitada por intentos fallidos — es C-04 funcionando,`);
    console.log('    no un defecto. La ventana son 15 minutos desde el último fallo.');
    console.log('    Los chequeos que necesitan sesión NO se evaluaron: este resultado no dice nada de la app.\n');
    console.log(`  ${ok} ok / ${fail} fail / ${ok + fail} corridos — INCOMPLETO por límite de intentos\n`);
    process.exit(3);
  };

  const malo = await req('/api/auth/login', { method: 'POST', body: { email: EMAIL || 'x@y.invalid', password: 'mala-a-proposito' } });
  t('9 · login con contraseña mala da 401', malo.status === 401, `status ${malo.status}`);
  if (porLimite(malo)) abortarPorLimite('el login con contraseña mala');

  if (!EMAIL || !PASSWORD) {
    console.log('\n  ⚠ sin MYINTERVIEWS_EMAIL/MYINTERVIEWS_PASSWORD: los chequeos que necesitan sesión se saltan.');
    console.log(`\n${ok} ok / ${fail} fail / ${ok + fail} corridos\n`);
    process.exit(fail ? 1 : 0);
  }

  const bueno = await req('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  if (porLimite(bueno)) abortarPorLimite('el login correcto');
  const ck = (bueno.setCookie || '').split(';')[0];
  t('10 · login correcto da 200 con cookie', bueno.status === 200 && ck.includes('='),
    `status ${bueno.status}, set-cookie ${bueno.setCookie.slice(0, 60)}`);
  t('11 · la cookie es HttpOnly, Secure y SameSite=Strict',
    /HttpOnly/i.test(bueno.setCookie) && /Secure/i.test(bueno.setCookie) && /SameSite=Strict/i.test(bueno.setCookie),
    bueno.setCookie);
  t('12 · la cookie vencida es a 30 días', /Max-Age=2(5|6)\d{5}/.test(bueno.setCookie) || /Expires=/i.test(bueno.setCookie),
    bueno.setCookie);

  const sesion = await req('/api/session', { cookie: ck });
  t('13 · /api/session con cookie dice autenticado:true',
    sesion.status === 200 && sesion.json?.autenticado === true, JSON.stringify(sesion.json));

  // ── 14-17 · cargar una oferta ──────────────────────────────────────────────
  const sinFuente = await req('/api/offers/extract', { method: 'POST', cookie: ck, body: {} });
  t('14 · extract sin fuente da 400', sinFuente.status === 400, `status ${sinFuente.status}`);

  const marca = `SMOKE-${Date.now()}`;
  const nuevo = await req('/api/offers/extract', {
    method: 'POST', cookie: ck,
    body: {
      fuente: 'texto',
      texto: `Backend Engineer — Empresa ${marca}\nBuscamos una persona para el equipo de plataforma.\nModalidad: remoto. Ubicación: Buenos Aires.\nSalario: a convenir. Beneficios: obra social, días extra.`,
    },
  });
  t('15 · extract con texto crea la oferta (201)', nuevo.status === 201,
    `status ${nuevo.status}, cuerpo ${JSON.stringify(nuevo.json)?.slice(0, 160)}`);
  const id = nuevo.json?.oferta?.id;
  t('16 · la respuesta trae la oferta y su postulación en borrador',
    Boolean(id) && (nuevo.json?.aplicacion?.estado === 'borrador' || nuevo.json?.aplicacion?.status === 'borrador'),
    JSON.stringify(nuevo.json)?.slice(0, 200));

  // ── 22-23 · que la extracción NO haya fallado ──────────────────────────────
  // Van con el número adelante a propósito: se agregaron después, y renumerar 17-21
  // borraría la correspondencia con las corridas anteriores.
  //
  // Por qué existen: un `201` con la extracción **fallida** es el fracaso más engañoso de
  // todos. La oferta se crea, el status HTTP es el correcto, la postulación queda en
  // borrador, y el usuario recibe una oferta vacía. Los checks 15 y 16 daban verde con
  // eso. Pasó de verdad: el Worker no tenía `LLM_MODEL_EXTRACCION` entre sus secretos, así
  // que la extracción fallaba **solo en producción** mientras en local andaba.
  const estadoExtraccion = nuevo.json?.oferta?.extraction_status;
  t('22 · la extracción de una oferta bien formada no falla',
    estadoExtraccion === 'exitosa' || estadoExtraccion === 'parcial',
    `extraction_status ${estadoExtraccion}, error: ${nuevo.json?.oferta?.extraction_error}`);
  t('23 · la extracción devolvió al menos un campo de la oferta',
    Boolean(nuevo.json?.oferta?.titulo || nuevo.json?.oferta?.empresa),
    JSON.stringify({ titulo: nuevo.json?.oferta?.titulo, empresa: nuevo.json?.oferta?.empresa }));

  const detalle = await req(`/api/offers/${id}`, { cookie: ck });
  t('17 · el detalle de la oferta conserva el texto pegado',
    detalle.status === 200 && String(detalle.json?.oferta?.raw_text || '').includes(marca),
    `status ${detalle.status}, raw_text ${String(detalle.json?.oferta?.raw_text || '').length} chars`);

  // ── 18-21 · el pipeline y el cierre de sesión ──────────────────────────────
  const pipe = await req('/api/applications', { cookie: ck });
  const contadores = pipe.json?.contadores || {};
  const siete = ['borrador', 'preparando', 'enviada', 'entrevistas', 'cerrada', 'rechazada', 'descartada'];
  t('18 · el pipeline trae los 7 contadores por estado',
    pipe.status === 200 && siete.every((e) => e in contadores),
    `status ${pipe.status}, contadores ${JSON.stringify(contadores)}`);
  t('19 · la oferta recién cargada aparece en el pipeline',
    Array.isArray(pipe.json?.aplicaciones) && pipe.json.aplicaciones.some((a) => a.offer_id === id),
    `${(pipe.json?.aplicaciones || []).length} postulaciones`);

  const editada = await req(`/api/offers/${id}`, {
    method: 'PUT', cookie: ck,
    // Campos PLANOS: el contrato de T-04 fija que el cliente dice qué campos cambia y la
    // mezcla la hace el servidor. Mandar {extracted_json:{…}} convertía esto en un 400 —
    // el smoke codificaba una suposición que el contrato no tenía escrita.
    body: { titulo: `Editado ${marca}`, empresa: 'SMOKE SA' },
  });
  t('20 · editar la oferta a mano se guarda', editada.status === 200, `status ${editada.status}`);

  const fuera = await req('/api/auth/logout', { method: 'POST', cookie: ck });
  const reuso = await req('/api/session', { cookie: ck });
  t('21 · el logout invalida la cookie', fuera.status === 200 && reuso.json?.autenticado !== true,
    `logout ${fuera.status}, reuso ${JSON.stringify(reuso.json)}`);

  console.log(`\n${ok} ok / ${fail} fail / ${ok + fail} corridos`);
  if (fail) console.log(`Fallaron: ${fallos.join(' · ')}`);
  console.log();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('smoke roto:', e); process.exit(1); });
