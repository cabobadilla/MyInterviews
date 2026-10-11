// rutas_publicas.js — la única fuente de la lista de rutas públicas (C-02).
// El middleware de index.js consulta acá; la lista no se repite en el cableado.
// No importa nada (regla de importabilidad, ADR-004).

// [método, ruta] exactos que quedan FUERA de la barrera de sesión.
// GET /api/session es pública: la SPA consulta si hay sesión para decidir entre
// login y app. POST /api/auth/login obvio. Logout NO: no se cierra lo que no hay.
const RUTAS_PUBLICAS = [
  ['POST', '/api/auth/login'],
  ['GET', '/api/session'],
];

export function esPublica(metodo, ruta) {
  const m = String(metodo ?? '').toUpperCase();
  return RUTAS_PUBLICAS.some(([pm, pr]) => pm === m && pr === ruta);
}
