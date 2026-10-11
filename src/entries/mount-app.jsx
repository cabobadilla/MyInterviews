import { createRoot } from 'react-dom/client';
import App from '../App.jsx';
import '../styles.css';

// Fixture de T-06: monta el App REAL con un api doble elegido por query param
// (?caso=…). La suite corre pelada: ninguna función del doble toca red.
// Shape del doble (igual al de la implementación real): estadoSesion() →
// la respuesta de /api/session; entrar(email, password) → { ok, status, data };
// salir() → { ok, status }.
const CASOS = {
  'sin-sesion': {
    estadoSesion: async () => ({ autenticado: false }),
    entrar: async () => ({ ok: true, status: 200, data: {} }),
    salir: async () => ({ ok: true, status: 200 }),
  },
  'con-sesion': {
    estadoSesion: async () => ({ autenticado: true }),
    entrar: async () => ({ ok: true, status: 200, data: {} }),
    salir: async () => ({ ok: true, status: 200 }),
  },
  'login-ok': {
    estadoSesion: async () => ({ autenticado: false }),
    entrar: async () => ({ ok: true, status: 200, data: {} }),
    salir: async () => ({ ok: true, status: 200 }),
  },
  'login-falla': {
    estadoSesion: async () => ({ autenticado: false }),
    entrar: async () => ({ ok: false, status: 401, data: { error: 'credenciales inválidas' } }),
    salir: async () => ({ ok: true, status: 200 }),
  },
  'logout-ok': {
    estadoSesion: async () => ({ autenticado: true }),
    entrar: async () => ({ ok: true, status: 200, data: {} }),
    salir: async () => ({ ok: true, status: 200 }),
  },
};

const caso = new URLSearchParams(location.search).get('caso');
const doble = CASOS[caso] || CASOS['sin-sesion'];

const root = document.getElementById('root');
createRoot(root).render(<App api={doble} />);
