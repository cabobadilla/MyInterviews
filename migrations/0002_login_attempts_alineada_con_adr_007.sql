-- ADR-007: la tabla login_attempts quedó mal creada en 0001_init.sql (con
-- `email TEXT NOT NULL`), pero el diseño fijó después que la clave del límite
-- es la IP y no hay columna email; aquí la implementación inserta
-- (ip, exito, created_at). Ejemplo del humo: SQLITE_CONSTRAINT en email.
--
-- SQLite no permite quitar un NOT NULL con ALTER: se crea la tabla nueva
-- alineada al ADR-007, se copian las filas, se borra la vieja y se renombra.
-- (Este archivo corre antes que 0002_login_attempts_ip_index.sql por orden
-- lexicográfico; ese índice se declara acá y allá queda IF NOT EXISTS.)

CREATE TABLE login_attempts_nueva (
  ip         TEXT NOT NULL,
  exito      INTEGER NOT NULL DEFAULT 0 CHECK (exito IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO login_attempts_nueva (ip, exito, created_at)
  SELECT ip, exito, created_at FROM login_attempts;

DROP TABLE login_attempts;
ALTER TABLE login_attempts_nueva RENAME TO login_attempts;

CREATE INDEX idx_login_attempts_ip_fecha ON login_attempts (ip, created_at);
