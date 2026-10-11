// Cableado del Worker (T-02). Hono vive ACÁ: las decisiones de sesión y
// límite de intentos viven en los módulos puros de lib/, middleware/ y la
// parte decisora de routes/auth.js. Este archivo no decide nada propio.
import { Hono } from 'hono';
import { exigirSesion } from './middleware/auth.js';
import { borrarSesion, leerCookie, serializarSesion } from './lib/cookie.js';
import { VENTANA_SEG } from './lib/rate_limit.js';
import { esPublica } from './lib/rutas_publicas.js';
import { respuestaSesion, respuestaSesionActiva } from './lib/respuesta_sesion.js';
import { respuestaDeLogin, respuestaDeLogout, consultarIntentos, registrarIntento } from './routes/auth.js';
import { estaRevocadoDesdeDb } from './lib/revocacion.js';

const app = new Hono();
app.get('/api/health', (c) => c.json({ ok: true }));

// Barrera de sesión: TODO /api/* salvo lo público (lista única en lib/rutas_publicas.js):
// POST /api/auth/login y GET /api/session.
// C-02: sin sesión → 401 sin tocar D1 (el decisor corta antes de cualquier repo).
app.use('/api/*', async (c, next) => {
  if (esPublica(c.req.method, c.req.path)) return next();

  const cookieHeader = c.req.header('Cookie') ?? null;
  const secreto = c.env?.SESSION_SECRET;
  // ADR-009: después de validar la firma, la barrera consulta la revocación
  // del jti contra D1. Sin sesión → 401 sin tocar D1 (C-02, primera barrera).
  const ahoraSeg = Math.floor(Date.now() / 1000);
  const r = await exigirSesionActiva(
    leerCookie(cookieHeader ?? ''),
    secreto,
    ahoraSeg,
    { estaRevocado: estaRevocadoDesdeDb(c.env?.DB) },
  );
  if (r.status === 401) {
    c.header('Set-Cookie', borrarSesion());
    return c.json({ error: 'sesión requerida' }, 401);
  }
  c.set('claims', r);
  return next();
});

// GET /api/session — C-02, la excepción: la ruta INFORMA estado, no bloquea.
// SIEMPRE 200: {autenticado:true} con cookie válida, {autenticado:false} sin
// ella (nunca 401: la SPA debe distinguir «no hay sesión» de «no puedo
// preguntar»). La forma de la respuesta sale del cableado y pasa al decisor;
// si la cookie es inválida/vencida se borra la vieja.
app.get('/api/session', async (c) => {
  const r = await respuestaSesionActiva(
    leerCookie(c.req.header('Cookie') ?? ''),
    c.env?.SESSION_SECRET,
    Math.floor(Date.now() / 1000),
    // ADR-009: una sesión firmada pero revocada se informa como no autenticada.
    // La ruta sigue siendo pública y SIEMPRE 200 (C-02, la excepción).
    estaRevocadoDesdeDb(c.env?.DB),
  );
  if (r.borrarCookie) c.header('Set-Cookie', borrarSesion());
  return c.json(r.cuerpo, r.status);
});

// POST /api/auth/login — C-03 (error genérico), C-04 (429 sin mirar la contraseña).
app.post('/api/auth/login', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'credenciales inválidas' }, 401);
  }
  const ip = c.req.header('CF-Connecting-IP') ?? '0.0.0.0';
  const ahoraSeg = Math.floor(Date.now() / 1000);
  const db = c.env?.DB;
  if (!db) return c.json({ error: 'sesión no disponible' }, 500);

  const intentos = await consultarIntentos(db, ip, ahoraSeg - VENTANA_SEG);
  const r = await respuestaDeLogin({ body, env: c.env, intentos, ahoraSeg });

  if (r.status === 200) {
    c.header('Set-Cookie', serializarSesion(r.setCookie));
    await registrarIntento(db, ip, 1);
    return c.json(r.body, 200);
  }
  await registrarIntento(db, ip, 0);
  return c.json(r.body, r.status);
});

// POST /api/auth/logout — C-05 + ADR-009: invalidar la sesión de VERDAD.
// Borrar la cookie le pide al navegador que la olvide; el jti de la sesión se
// inserta en sesiones_revocadas para que, con la cookie copiada en otro lado,
// la barrera y el estado de sesión la nieguen. La decisión vive en el decisor.
app.post('/api/auth/logout', async (c) => {
  const r = await respuestaDeLogout({
    cookie: leerCookie(c.req.header('Cookie') ?? ''),
    secreto: c.env?.SESSION_SECRET,
    ahoraSeg: Math.floor(Date.now() / 1000),
    db: c.env?.DB,
  });
  if (r.borrarCookie) c.header('Set-Cookie', borrarSesion());
  return c.json(r.body, r.status);
});

export default app;
