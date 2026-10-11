-- ADR-007: el límite de intentos se consulta por IP y rango de tiempo.
-- La tabla ya existe en 0001_init.sql (Ciclo 1); acá se declara el índice
-- que el decisor consume. La purga de filas viejas queda para Cíclo 2
-- (ADR-007: "no se implementa la purga en C1").
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_fecha ON login_attempts (ip, created_at);
