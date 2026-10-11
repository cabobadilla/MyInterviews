import { useEffect, useState } from 'react';
import Login from './screens/Login.jsx';
import Pipeline from './screens/Pipeline.jsx';
import NuevaOferta from './screens/NuevaOferta.jsx';
import DetalleOferta from './screens/DetalleOferta.jsx';

const VISTAS = [
  { id: 'login', etiqueta: 'Iniciar sesión', Componente: Login },
  { id: 'pipeline', etiqueta: 'Pipeline', Componente: Pipeline },
  { id: 'nueva-oferta', etiqueta: 'Nueva oferta', Componente: NuevaOferta },
  { id: 'detalle-oferta', etiqueta: 'Detalle de oferta', Componente: DetalleOferta },
];

// Implementación real de la costura: fetch contra los endpoints de sesión que
// ya existen (todos hablan JSON). Los doses (tests/fixtures/app.html) inyectan
// un objeto con esta misma forma para montar App sin red.
const apiReal = {
  async estadoSesion() {
    const r = await fetch('/api/session');
    return r.json();
  },
  async entrar(email, password) {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    let data = {};
    try {
      data = await r.json();
    } catch {
      data = {};
    }
    return { ok: r.ok, status: r.status, data };
  },
  async salir() {
    const r = await fetch('/api/auth/logout', { method: 'POST' });
    return { ok: r.ok, status: r.status };
  },
};

const MENSAJE_GENERICO = 'No se pudo iniciar sesión';

function extraerErro(r) {
  return r && r.data && typeof r.data.error === 'string' && r.data.error ? r.data.error : MENSAJE_GENERICO;
}

export default function App({ api = apiReal } = {}) {
  // 'pendiente': estadoSesion está en vuelo — ninguna vista decide todavía.
  const [vista, setVista] = useState('pendiente');
  const [errorLogin, setErrorLogin] = useState('');

  const decidirPorSesion = async () => {
    try {
      const sesion = await api.estadoSesion();
      setVista(sesion && sesion.autenticado ? 'pipeline' : 'login');
    } catch {
      setVista('login');
    }
  };

  useEffect(() => {
    decidirPorSesion();
  }, []);

  const entrar = async (email, password) => {
    setErrorLogin('');
    let r = null;
    try {
      r = await api.entrar(email, password);
    } catch {
      setErrorLogin(MENSAJE_GENERICO);
      return;
    }
    if (r && r.ok) {
      setVista('pipeline');
      return;
    }
    setErrorLogin(extraerErro(r));
  };

  const salir = async () => {
    let r = null;
    try {
      r = await api.salir();
    } catch {
      return;
    }
    if (r && r.ok) {
      setVista('login');
      setErrorLogin('');
    }
  };

  return (
    <>
      <aside className="sidebar">
        <div className="marca">MyInterviews</div>
        {vista !== 'pendiente' && (
          <nav>
            {VISTAS.map(({ id, etiqueta }) => (
              <a key={id} href="#" id={`nav-${id}`} className={vista === id ? 'activo' : ''} onClick={(e) => { e.preventDefault(); setVista(id); }}>
                {etiqueta}
              </a>
            ))}
          </nav>
        )}
        {vista === 'pipeline' && (
          <button id="logout-boton" type="button" className="boton" onClick={salir}>Salir</button>
        )}
      </aside>
      <div className="contenido">
        {vista === 'login' && <Login onEntrar={entrar} error={errorLogin} />}
        {vista === 'pipeline' && <Pipeline />}
        {vista === 'nueva-oferta' && <NuevaOferta />}
        {vista === 'detalle-oferta' && <DetalleOferta />}
      </div>
    </>
  );
}
