// lib/revocacion.js — el estado del logout en D1 (ADR-009). La cookie es
// stateless: el logout tiene que DEJAR REGISTRO de que ese jti ya no vale.
// Solo el SQL exportado como constante y funciones que reciben la base: sin
// imports (regla de importabilidad, ADR-004 — carga en un árbol pelado y
// el SQL corre contra node:sqlite con el esquema real de las migraciones).

export const SQL_INSERTAR_REVOCACION = 'INSERT INTO sesiones_revocadas (jti, exp) VALUES (?, ?)';
export const SQL_REVOCADO = 'SELECT 1 AS r FROM sesiones_revocadas WHERE jti = ?';

// D1 encadena prepare().bind(...).run()/all(); node:sqlite toma los
// parámetros posicionales directo en run()/all(). Este adaptador mínimo
// soporta ambas figuras sin renunciar a ninguna.
function conParametros(db, sql, params) {
  const stmt = db.prepare(sql);
  if (typeof stmt.bind === 'function') {
    const enlazado = stmt.bind(...params);
    return {
      all: () => enlazado.all(),
      run: () => enlazado.run(),
    };
  }
  return {
    all: () => stmt.all(...params),
    run: () => stmt.run(...params),
  };
}

// revocar(db, jti, exp) — el logout inserta la revocación del jti, con el
// vencimiento de la cookie para que la fila quede purgable (no en este ciclo).
export async function revocar(db, jti, exp) {
  if (!db || !jti) return;
  await conParametros(db, SQL_INSERTAR_REVOCACION, [jti, exp]).run();
}

// verificarRevocacion(db, jti) → boolean — consulta de revocación por jti.
// El exp de la fila no entra en el filtro: una fila ya vencida solo puede
// matchear una cookie que su exp ya venció, y esa la rechaza la firma (C-06).
export async function verificarRevocacion(db, jti) {
  if (!db || !jti) return false;
  const filas = await conParametros(db, SQL_REVOCADO, [jti]).all();
  // Dos formas de respuesta: node:sqlite devuelve un array de filas; D1
  // devuelve el envoltorio { results, success, meta }. Revocado solo si hay
  // al menos una fila en cualquiera de las dos — Boolean({results: []}) es
  // true y marcaba TODA sesión como revocada.
  const rowsEn = (respuesta) =>
    Array.isArray(respuesta) ? respuesta
      : respuesta && typeof respuesta === 'object' && Array.isArray(respuesta.results) ? respuesta.results
        : [];
  return rowsEn(filas).length > 0;
}

// estaRevocadoDesdeDb(db) → (jti) => Promise<boolean> — la función INJECTADA
// que consume la barrera (middleware/auth.js) y el estado de sesión
// (lib/respuesta_sesion.js). Este arnés muere con la gracia de los locales:
// si la base falla, la revocación no putea la sesión.
export function estaRevocadoDesdeDb(db) {
  return async (jti) => {
    try {
      return await verificarRevocacion(db, jti);
    } catch {
      return false;
    }
  };
}
