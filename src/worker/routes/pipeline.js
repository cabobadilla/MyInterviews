// routes/pipeline.js — decisores del pipeline (ADR-007): SOLO módulos puros
// del proyecto, sin hono ni node_modules. El cableado vive en index.js y los
// tests corren en el árbol pelado.
//
//   GET /api/applications        → 200 { aplicaciones, contadores }
//   GET /api/interviews/proximas → 200 { entrevistas } (futuras, ascendente)
//
// C-19: `contadores` SIEMPRE lleva los 7 estados, con los ceros incluidos —
// son los mismos del CHECK de `applications`. El conteo se deriva de la lista
// (una sola lectura de D1), así el cero no puede desincronizarse del vacío.

import { ESTADOS, listarAplicaciones } from '../repos/applications.js';
import { listarProximasEntrevistas } from '../repos/interviews.js';

export async function respuestaDeAplicaciones({ db }) {
  if (!db) return { status: 500, body: { error: 'la base de postulaciones no está disponible' } };

  const aplicaciones = await listarAplicaciones(db);
  const contadores = {};
  for (const estado of ESTADOS) contadores[estado] = 0;
  for (const a of aplicaciones) {
    if (Object.prototype.hasOwnProperty.call(contadores, a.status)) contadores[a.status] += 1;
  }

  return { status: 200, body: { aplicaciones, contadores } };
}

export async function respuestaDeProximasEntrevistas({ db, ahoraIso }) {
  if (!db) return { status: 500, body: { error: 'la base de entrevistas no está disponible' } };
  const entrevistas = await listarProximasEntrevistas(db, ahoraIso);
  return { status: 200, body: { entrevistas } };
}
