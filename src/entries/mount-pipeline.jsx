// Fixture del pipeline (T-05): monta el App REAL con un api doble de datos
// fijos, elegido por query param (?caso=…). La suite corre pelada: ninguna
// función del doble toca red. El doble tiene la MISMA forma que la costura real
// (estadoSesion/entrar/salir de App + listarAplicaciones/listarEntrevistasProximas
// de la pantalla + extraerOferta del alta), así que la geometría y los
// contadores que se miden son los de la SPA, no los de una copia.
//
//   ?caso=pipeline-con-datos  → postulaciones en varios estados + entrevistas
//   ?caso=nueva-postulacion   → arranca vacío; el alta agrega una en borrador
//   ?caso=pipeline-vacio      → todo vacío
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import App from '../App.jsx';
import '../styles.css';

const ESTADOS = ['borrador', 'preparando', 'enviada', 'entrevistas', 'oferta', 'rechazada', 'cerrada'];
const AHORA = '2026-10-15T00:00:00Z';

const APPS_CON_DATOS = [
  { id: 1, status: 'borrador', titulo: 'Frontend Engineer', empresa: 'Acme' },
  { id: 2, status: 'borrador', titulo: 'Data Analyst', empresa: 'Beta' },
  { id: 3, status: 'enviada', titulo: 'Backend Developer', empresa: 'Gamma' },
  { id: 4, status: 'oferta', titulo: 'SRE', empresa: 'Delta' },
];

const ENTREVISTAS = [
  { id: 11, scheduled_at: '2026-10-20T15:00:00Z', tipo: 'tecnica', titulo: 'Frontend Engineer' },
  { id: 12, scheduled_at: '2026-10-18T09:00:00Z', tipo: 'screening', titulo: 'Data Analyst' },
  { id: 13, scheduled_at: '2026-10-25T11:30:00Z', tipo: 'cultural', titulo: 'SRE' },
];

function contadoresDe(aplicaciones) {
  const c = {};
  for (const e of ESTADOS) c[e] = 0;
  for (const a of aplicaciones) if (c[a.status] != null) c[a.status] += 1;
  return c;
}

function proximasDe(entrevistas, ahora) {
  return entrevistas
    .filter((e) => typeof e.scheduled_at === 'string' && e.scheduled_at >= ahora)
    .sort((a, b) => (a.scheduled_at < b.scheduled_at ? -1 : a.scheduled_at > b.scheduled_at ? 1 : a.id - b.id));
}

const caso = new URLSearchParams(location.search).get('caso') || 'pipeline-con-datos';
const store = { aplicaciones: [], entrevistas: [] };
if (caso === 'pipeline-con-datos') {
  store.aplicaciones = APPS_CON_DATOS.map((a) => ({ ...a }));
  store.entrevistas = ENTREVISTAS.map((e) => ({ ...e }));
}

let proximoId = 100;
const api = {
  estadoSesion: async () => ({ autenticado: true }),
  entrar: async () => ({ ok: true, status: 200, data: {} }),
  salir: async () => ({ ok: true, status: 200 }),
  listarAplicaciones: async () => ({
    aplicaciones: store.aplicaciones.map((a) => ({ ...a })),
    contadores: contadoresDe(store.aplicaciones),
  }),
  listarEntrevistasProximas: async () => ({ entrevistas: proximasDe(store.entrevistas, AHORA) }),
  extraerOferta: async (cuerpo) => {
    proximoId += 1;
    const primera = String(cuerpo?.texto ?? '').trim().split('\n')[0];
    const titulo = cuerpo?.fuente === 'url' ? 'Oferta cargada por URL' : (primera || 'Oferta nueva');
    store.aplicaciones.push({ id: proximoId, status: 'borrador', titulo, empresa: 'Nueva' });
    return {
      status: 201,
      data: { oferta: { id: proximoId, titulo, empresa: 'Nueva', extraction_status: 'exitosa', campos_faltantes: [] } },
    };
  },
};

const arbol = <App api={api} vistaInicial="pipeline" />;
const root = document.getElementById('root');
root.innerHTML = renderToString(arbol);
hydrateRoot(root, arbol);
