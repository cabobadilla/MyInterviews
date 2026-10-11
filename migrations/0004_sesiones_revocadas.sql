-- T-02-fix4 · ADR-009: el logout necesita estado — la cookie es stateless.
-- Tabla mínima de revocación: el jti de la cookie cerrada y su vencimiento.
-- La purga por vencimiento NO entra en este ciclo (ADR-009): pasado el exp de
-- la cookie, la fila es ruido; el índice sobre exp deja preparada la purga.
CREATE TABLE IF NOT EXISTS sesiones_revocadas (
  jti TEXT PRIMARY KEY,
  exp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sesiones_revocadas_exp ON sesiones_revocadas (exp);
