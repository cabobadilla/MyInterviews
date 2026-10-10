-- Ciclo 1 · migración única con el esquema completo (spec §3.3)
-- + las dos correcciones de ADR-003: applications.status_previo
--   y idx_docs_actual como índice parcial UNIQUE.
-- Note: la tabla login_attempts no existe en §3.3; el contrato T-01 declara
-- que el Ciclo 1 la usa, así que se crea acá con el mínimo necesario para
-- el registro de intentos de login (T-02 la consumirá).

-- Perfil único del usuario (siempre fila id=1)
CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nombre TEXT NOT NULL,
  contacto_json TEXT NOT NULL DEFAULT '{}',   -- {email, telefono, ubicacion}
  links_json TEXT NOT NULL DEFAULT '{}',      -- {linkedin, github, portafolio, ...}
  resumen TEXT NOT NULL DEFAULT '',
  idiomas_json TEXT NOT NULL DEFAULT '[]',    -- [{idioma, nivel}]
  skills_json TEXT NOT NULL DEFAULT '[]',     -- [{nombre, nivel?, anios?}]
  updated_at TEXT NOT NULL
);

-- Biblioteca de experiencia: laboral, proyectos, educación, certificaciones
CREATE TABLE experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('laboral','proyecto','educacion','certificacion')),
  titulo TEXT NOT NULL,                       -- cargo, título de estudio o certificación
  organizacion TEXT,                          -- empresa/institución (opcional en proyectos)
  fecha_inicio TEXT,                          -- 'YYYY-MM'
  fecha_fin TEXT,                             -- NULL = presente
  ubicacion TEXT,
  logros_json TEXT NOT NULL DEFAULT '[]',     -- [{texto, metrica?}]
  skills_json TEXT NOT NULL DEFAULT '[]',
  dominio TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_experiences_tipo ON experiences(tipo, orden);

-- Registro de intentos de login (contrato T-01: Ciclo 1 usa login_attempts)
CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip TEXT,
  exito INTEGER NOT NULL DEFAULT 0 CHECK (exito IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);

-- Oferta registrada (fuente de la postulación)
CREATE TABLE job_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT,
  raw_text TEXT NOT NULL,                     -- texto pegado o HTML reducido a texto
  extracted_json TEXT,                        -- JSON canónico §4.1
  extraction_status TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (extraction_status IN ('pendiente','exitosa','parcial','fallida')),
  extraction_error TEXT,
  campos_faltantes_json TEXT NOT NULL DEFAULT '[]',
  titulo TEXT, empresa TEXT,                  -- denormalizados para listados
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Postulación (proceso completo por oferta)
CREATE TABLE applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id INTEGER NOT NULL REFERENCES job_offers(id),
  status TEXT NOT NULL DEFAULT 'borrador'
      CHECK (status IN ('borrador','preparando','enviada','entrevistas','oferta','rechazada','cerrada')),
  status_previo TEXT,                         -- corrección ADR-003: estado anterior al último avance
  resultado TEXT CHECK (resultado IN ('aceptada','rechazada','retirada','sin_respuesta')),
  fecha_enviada TEXT,
  fecha_cierre TEXT,
  notas TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_applications_status ON applications(status);

-- CV y cartas generados, con versiones y plantilla
CREATE TABLE generated_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('cv','cover_letter')),
  plantilla TEXT NOT NULL DEFAULT 'cv_tecnica',  -- cv_tecnica | cv_ejecutiva | cover_letter
  version INTEGER NOT NULL DEFAULT 1,
  origen TEXT NOT NULL DEFAULT 'llm' CHECK (origen IN ('llm','manual')),
  contenido_md TEXT NOT NULL,
  experience_ids_json TEXT NOT NULL DEFAULT '[]',  -- anclaje a experiences.id
  modelo TEXT, prompt_version TEXT,
  es_actual INTEGER NOT NULL DEFAULT 1,
  pdf_r2_key TEXT,                            -- clave R2 del PDF de esta versión
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_docs_app_tipo_version ON generated_documents(application_id, tipo, version);
-- Corrección ADR-003: índice parcial UNIQUE, una sola versión "actual" por (application_id, tipo)
CREATE UNIQUE INDEX idx_docs_actual ON generated_documents(application_id, tipo) WHERE es_actual = 1;

-- Entrevistas del proceso (1..N)
CREATE TABLE interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  secuencia INTEGER NOT NULL,
  tipo TEXT,                                  -- screening|tecnica|cultural|final|otra
  scheduled_at TEXT, duracion_min INTEGER,
  lugar_link TEXT,
  entrevistadores_json TEXT NOT NULL DEFAULT '[]',
  research_md TEXT NOT NULL DEFAULT '',
  prep_md TEXT NOT NULL DEFAULT '',
  checklist_json TEXT NOT NULL DEFAULT '[]',
  resultado TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (resultado IN ('pendiente','aprobada','rechazada','sin_respuesta')),
  resultado_notas TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_interviews_app_sec ON interviews(application_id, secuencia);

-- Aprendizajes del cierre (1 a 1 con la postulación cerrada)
CREATE TABLE learnings (
  application_id INTEGER PRIMARY KEY REFERENCES applications(id),
  que_funciono TEXT NOT NULL DEFAULT '',
  que_mejorar TEXT NOT NULL DEFAULT '',
  gaps_json TEXT NOT NULL DEFAULT '[]',       -- [{skill, prioridad}]
  resultado_final TEXT,
  closed_at TEXT,
  updated_at TEXT NOT NULL
);
