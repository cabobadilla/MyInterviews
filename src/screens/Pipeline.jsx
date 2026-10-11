// Pantalla «Pipeline» (T-05): contadores por estado, tablero con una columna
// por cada uno de los 7 estados, y el bloque de próximas entrevistas.
//
// La pantalla NO inventa datos: pide `api.listarAplicaciones()` (GET
// /api/applications) y `api.listarEntrevistasProximas()` (GET
// /api/interviews/proximas). El api es inyectable para que el fixture
// (tests/fixtures/pipeline.html) monte este MISMO componente con datos fijos y
// sin red. Si el api no trae esos métodos (por ejemplo, el doble mínimo de la
// suite de sesión) la pantalla queda con los contadores en cero y no rompe.
//
// Reusa la barra lateral y los tokens de T-01: la barra vive en App y aquí sólo
// se usa el ancho de contenido y la paleta de styles.css.
import { useEffect, useState } from 'react';
import { ESTADOS } from '../worker/repos/applications.js';

const apiReal = {
  async listarAplicaciones() {
    const r = await fetch('/api/applications');
    return r.json();
  },
  async listarEntrevistasProximas() {
    const r = await fetch('/api/interviews/proximas');
    return r.json();
  },
};

function ceros() {
  return Object.fromEntries(ESTADOS.map((e) => [e, 0]));
}

function fechaVisible(iso) {
  if (typeof iso !== 'string' || !iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Pipeline({ api = apiReal } = {}) {
  const [aplicaciones, setAplicaciones] = useState([]);
  const [contadores, setContadores] = useState(ceros);
  const [entrevistas, setEntrevistas] = useState([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (typeof api?.listarAplicaciones === 'function') {
        try {
          const r = await api.listarAplicaciones();
          if (!vivo) return;
          if (Array.isArray(r?.aplicaciones)) setAplicaciones(r.aplicaciones);
          if (r?.contadores && typeof r.contadores === 'object') {
            setContadores({ ...ceros(), ...r.contadores });
          }
        } catch {
          /* la pantalla queda en ceros: no se inventan datos */
        }
      }
      if (typeof api?.listarEntrevistasProximas === 'function') {
        try {
          const r = await api.listarEntrevistasProximas();
          if (!vivo) return;
          if (Array.isArray(r?.entrevistas)) setEntrevistas(r.entrevistas);
        } catch {
          /* sin entrevistas la lista queda vacía */
        }
      }
    })();
    return () => { vivo = false; };
  }, [api]);

  return (
    <section id="pipeline" className="pantalla">
      <h1>Pipeline</h1>
      <p className="desc">Postulaciones por estado, con sus contadores y las próximas entrevistas.</p>

      <div id="contadores" className="contadores">
        {ESTADOS.map((estado) => (
          <div key={estado} className="contador" data-estado={estado}>
            <span id={`contador-${estado}`} className="contador-numero">{contadores[estado] ?? 0}</span>
            <span className="contador-etiqueta">{estado}</span>
          </div>
        ))}
      </div>

      <div id="tablero" className="tablero">
        {ESTADOS.map((estado) => (
          <section key={estado} className="columna-estado" data-estado={estado}>
            <h2 className="columna-titulo">{estado}</h2>
            <div className="columna-tarjetas">
              {aplicaciones.filter((a) => a.status === estado).map((a) => (
                <article key={a.id} className="tarjeta-postulacion" data-postulacion={a.id}>
                  <p className="tarjeta-titulo">{a.titulo ?? 'Sin título'}</p>
                  <p className="tarjeta-empresa">{a.empresa ?? ''}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section id="proximas-entrevistas" className="proximas">
        <h2>Próximas entrevistas</h2>
        {entrevistas.length === 0 ? (
          <p className="proximas-vacio">No hay entrevistas futuras.</p>
        ) : (
          <ul className="lista-entrevistas">
            {entrevistas.map((e) => (
              <li key={e.id} className="entrevista-fila" data-entrevista={e.id}>
                <span className="entrevista-fecha">{fechaVisible(e.scheduled_at)}</span>
                <span className="entrevista-titulo">{e.titulo ?? 'Postulación'}</span>
                <span className="entrevista-tipo">{e.tipo ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
