// Cableado del Worker (T-02). Hono vive ACÁ: las decisiones de sesión y
// límite de intentos viven en los módulos puros de lib/, middleware/ y la
// parte decisora de routes/auth.js. Este archivo no decide nada propio.
import { Hono } from 'hono';
import { exigirSesion } from './middleware/auth.js';
import { borrarSesion, leerCookie, serializarSesion } from './lib/cookie.js';
import { verificar } from './lib/session.js';
import { VENTANA_SEG } from './lib/rate_limit.js';
import { respuestaDeLogin, consultarIntentos, registrarIntento } from './routes/auth.js';

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

// Barrera de sesión: TODO /api/* salvo POST /api/auth/login y GET /api/session.
// C-02: sin sesión → 401 sin tocar D1 (el decisor corta antes de cualquier repo).
app.use('/api/*', async (c, next) => {
  const ruta = c.req.path;
  if (ruta === '/api/auth/login' || (ruta === '/api/session' && c.req.method === 'GET')) return next();

  const cookieHeader = c.req.header('Cookie') ?? null;
  const secreto = c.env?.SESSION_SECRET;
  const r = exigirSesion(leerCookie(cookieHeader ?? ''), secreto, Math.floor(Date.now() / 1000));
  if (r.status === 401) {
    c.header('Set-Cookie', borrarSesion());
    return c.json({ error: 'sesión requerida' }, 401);
  }
  c.set('claims', r);
  return next();
});

// GET /api/session → los claims de la cookie, o 401 con la cookie borrada (C-06).
app.get('/api/session', (c) => {
  const secreto = c.env?.SESSION_SECRET;
  const claims = verificar(leerCookie(c.req.header('Cookie') ?? ''), secreto, Math.floor(Date.now() / 1000));
  if (!claims) {
    c.header('Set-Cookie', borrarSesion());
    return c.json({ error: 'sesión requerida' }, 401);
  }
  return c.json({ session: claims });
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

// POST /api/auth/logout — C-05: invalida la sesión borrando la cookie.
app.post('/api/auth/logout', (c) => {
  c.header('Set-Cookie', borrarSesion());
  return c.json({ ok: true }, 200);
});

export default app;
