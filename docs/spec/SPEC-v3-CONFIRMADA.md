# Spec — TrackingInterviews v3 \(CONFIRMADA\)
> Estado: CONFIRMADA — todas las decisiones cerradas con el usuario \(2026\-10\-10\)\. Único pendiente: contenido final de las 2 plantillas de CV \(§4\.2\), que el usuario definirá después; mientras tanto se implementan con estructuras base razonables\.
> Repo previsto: `cabobadilla/TrackingInterviews` \(por crear; la app de la fábrica no tiene permiso `createRepository`\)\. Elaborada por el agente de especificación de ChrisBob's Factory\.
> Cambios v1→v2→v3: LLM vía pasarela compatible con OpenAI con modelos económicos tipo DeepSeek \(Anthropic directo descartado por coste\); pasarela confirmada como OpenRouter; login propio confirmado; métricas globales y recordatorios por correo fuera de v1; 2 plantillas de CV en v1; importación de experiencia desde \.md en v1; «Enviada» exige CV y carta vigentes\.
## 1\. Resumen del producto y objetivos
**Qué es\.** Aplicación web de un solo usuario, en español, para gestionar el ciclo completo de postulaciones a ofertas de trabajo: registrar la oferta, preparar la postulación \(CV y carta personalizados a partir de la experiencia guardada en la app\), preparar y planificar las entrevistas del proceso \(1\.\.N, con investigación y preparación de cada reunión\) y cerrar el proceso registrando los aprendizajes\.
**Objetivos v1** \(testeables\):
1. Registrar una oferta pegando una URL o el texto de la publicación; el sistema extrae automáticamente los campos a un JSON editable y revisable\.
2. Mantener un perfil y una biblioteca de experiencia \(laboral, proyectos, educación, certificaciones\) persistente y reutilizable\.
3. Importar la experiencia inicial desde un documento Markdown \(\.md\) existente del usuario, con revisión antes de guardar\.
4. Generar CV y carta de postulación personalizados por oferta, anclados a las experiencias que el usuario selecciona, con plantillas \(2 en v1\), versionado, edición manual y exportación a Markdown y PDF\.
5. Registrar N entrevistas por postulación con tipo, fecha, lugar/link y entrevistadores; guardar research y prep de cada una \(prep asistida por LLM\)\.
6. Registrar el resultado de cada entrevista y cerrar el proceso con un registro estructurado de aprendizajes \(qué funcionó, qué mejorar, gaps\)\.
7. Visualizar el pipeline de postulaciones por estado, con próximas entrevistas a la vista\.
**Fuera de alcance \(no\-goals\) de v1** \(confirmado por el usuario\):
* Multiusuario, roles o compartir datos\.
* Integraciones con Google Calendar / Outlook, envío de correos ni recordatorios automáticos\.
* Métricas globales \(funnel, tiempos por etapa\)\.
* Scraping automático de portales de empleo, alertas o auto\-postulación\.
* App móvil nativa \(la web será responsive\)\.
* Negociación de oferta, onboarding o seguimiento posterior a aceptar\.
* Traducción automática de documentos; UI en español, idioma del documento parametrizable\.
* Scoring automático de match candidato\-oferta \(solo se listan gaps en los aprendizajes\)\.
## 2\. Flujos de usuario de extremo a extremo
### 2\.0 Flujo 0 — Primera vez: importar experiencia desde \.md
1. En «Perfil», el usuario pega o sube su CV actual en formato Markdown\.
2. El sistema usa el LLM económico para estructurarlo en perfil \+ experiencias \(mismo formato que §3\.3\) y muestra una vista previa editable de lo detectado\.
3. El usuario corrige, descarta lo que no corresponda y confirma; se guardan el perfil y las filas de `experiences`\. La importación nunca sobrescribe automáticamente lo ya guardado \(solo agrega lo confirmado\)\.
### 2\.1 Estados de la postulación
Enum fijo en v1: `borrador → preparando → enviada → entrevistas → (oferta | rechazada) → cerrada`\.
* `borrador`: creada desde una oferta; permite editar oferta y preparación\.
* `preparando`: al generar o editar el primer CV o carta\.
* `enviada`: al marcar enviada se registra `fecha_enviada`\. Requiere CV **y carta** vigentes \(confirmado: la carta siempre se necesita\)\.
* `entrevistas`: al crear la primera entrevista; admite entrevistas adicionales \(secuencia 1\.\.N\) y resultados\.
* `oferta`: recibió una propuesta; se cierra con resultado `aceptada` o `retirada`\.
* `rechazada`: por rechazo del proceso o autorretiro desde `enviada` o `entrevistas`\.
* `cerrada`: cierre final con resultado y aprendizajes; no admite edición salvo «reabrir» \(acción explícita que devuelve el estado previo\)\.
### 2\.2 Flujo A — Registrar oferta
1. El usuario pega una URL o el texto de la publicación en «Nueva oferta»\.
2. Si es URL: el Worker descarga el HTML, lo reduce a texto \(límite 500 KB\) y llama al LLM; si es texto: va directo al LLM\.
3. El LLM devuelve el JSON canónico \(§4\.1\); el sistema valida y guarda con `extraction_status` = `exitosa` o `parcial` \(con `campos_faltantes`\)\. Si la validación falla tras 1 reintento, queda `fallida` con el texto original guardado\.
4. El usuario revisa/edita los campos extraídos y guarda\. La oferta siempre es editable a mano, incluso si la extracción falló\.
5. Con «Crear postulación» nace una `Application` en `borrador` ligada a la oferta\.
### 2\.3 Flujo B — Preparar postulación \(CV y carta\)
1. En la pestaña CV de la postulación, el usuario elige plantilla \(técnica o ejecutiva en v1\) y marca qué experiencias incluir\.
2. «Generar» llama al LLM con la oferta extraída \+ perfil \+ plantilla \+ solo las experiencias seleccionadas y produce Markdown \(§4\.2\)\.
3. El usuario edita el Markdown con vista previa; cada guardado o generación crea una versión nueva conservando las anteriores; puede restaurar cualquiera\.
4. Igual para la carta \(una única plantilla de carta en v1\)\.
5. «Exportar PDF» abre la vista de impresión del navegador \(CSS de impresión incluido\) y guarda el PDF en R2 asociado a la versión \(§3\.4\)\.
6. Con CV y carta vigentes, marca «Enviada» \(puede anotar link o comprobante en notas\)\.
### 2\.4 Flujo C — Planificar y ejecutar N entrevistas
1. El usuario crea entrevistas \(secuencia automática 1, 2, 3…\): tipo \(screening, técnica, cultural, final, otra\), fecha/hora, duración, lugar o link, entrevistadores\. Sin límite de N en v1\. Sin recordatorios automáticos \(confirmado\)\.
2. Por entrevista: pestaña «Research» \(notas y links sobre empresa/entrevistadores\) y botón «Generar prep» que produce un pack de preparación anclado a la oferta y al CV vigente \(§4\.3\)\.
3. Tras la reunión: registra resultado \(`aprobada`, `rechazada`, `sin_respuesta`, `pendiente`\) con notas\. La UI sugiere pasar la postulación a `oferta` o `rechazada` según resultados; el usuario confirma\.
### 2\.5 Flujo D — Cerrar con aprendizajes
1. Desde cualquier estado final, «Cerrar proceso»: elige resultado final \(`aceptada`, `rechazada`, `retirada`, `sin_respuesta`\)\.
2. Completa aprendizajes: qué funcionó, qué mejorar, gaps detectados \(skills/requisitos con prioridad\)\. Exige al menos un campo con contenido, o la casilla explícita «cerrar sin aprendizajes»\.
3. La postulación queda `cerrada` con `closed_at`; los aprendizajes quedan consultables en una vista global para detectar patrones entre procesos\.
## 3\. Arquitectura
### 3\.1 Vista general
Monorepo pnpm en TypeScript, siguiendo los patrones de `AgenticCMS` \(API Workers con Hono, D1, bindings\) y `Bridgelist` \(Pages, single\-user, UI en español\)\. Despliegue 100% en Cloudflare \(confirmado\):
* **API**: Cloudflare Worker \(Hono\)\. Todo acceso a datos, LLM y R2 pasa por aquí\.
* **Front**: Cloudflare Pages \(SPA React \+ Vite\)\. *\(confirmado\)*
* **Datos**: Cloudflare D1 \(SQLite\)\.
* **Archivos**: Cloudflare R2 \(PDFs exportados\)\.
* **LLM**: OpenRouter \(pasarela compatible con OpenAI, §4\); el Worker solo guarda la clave en Secrets\.
### 3\.2 Estructura de módulos propuesta
```warp-runnable-command
trackinginterviews/
  wrangler.jsonc            # bindings: DB (D1), R2 (docs), vars, secrets
  migrations/               # 0001_init.sql, ...
  packages/shared/src/      # tipos, esquemas Zod (OfferJSON, DTOs), estados, plantillas
  apps/worker/src/
    index.ts                # app Hono, CORS, montaje de rutas
    middleware/auth.ts      # verificación de cookie firmada
    routes/{auth,profile,experiences,offers,applications,documents,interviews,learnings}.ts
    llm/{gateway.ts,extract_offer.ts,generate_document.ts,interview_prep.ts,import_md.ts,prompts/}
    llm/prompts/templates/  # cv_tecnica.md, cv_ejecutiva.md, cover_letter.md
    repos/{profile,experiences,offers,applications,documents,interviews,learnings}.ts
    r2.ts                   # put/get de PDFs
  apps/web/src/             # SPA React: pages/, components/, api/, styles/
```
### 3\.3 Esquema D1 detallado
SQLite; migraciones con `wrangler d1 migrations apply`\. Columnas JSON en TEXT validadas con Zod en la app \(patrón simple para v1\)\.
```SQL
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
CREATE INDEX idx_docs_actual ON generated_documents(application_id, tipo) WHERE es_actual = 1;
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
```
Relaciones: `applications.offer_id → job_offers.id` \(una oferta admite más de una postulación, p\. ej\. reintentos\), `generated_documents` y `interviews` 1:N con `applications`, `learnings` 1:1\. Borrado de postulación: en cascada por la API \(documentos → entrevistas → learnings → application\) y eliminación de los PDFs asociados en R2\.
### 3\.4 R2
* Bucket `trackinginterviews-docs`, binding `R2`\.
* Clave: `applications/{application_id}/documents/{doc_id}_v{version}.pdf`\.
* Lectura/escritura solo vía API con sesión; GET sirve el PDF con `Content-Type: application/pdf` tras verificar sesión\. Sin URLs públicas\.
## 4\. Diseño de integración LLM \(OpenRouter con modelos económicos; despliegue en Cloudflare\)
**Confirmado por el usuario:** pasarela **OpenRouter** con modelos más baratos, tipo DeepSeek, en lugar de Anthropic directo\. El despliegue sigue siendo Cloudflare\.
* **Cliente común** \(`llm/gateway.ts`\): `fetch` a `https://openrouter.ai/api/v1/chat/completions` \(API compatible con OpenAI\), con `OPENROUTER_API_KEY` en Workers Secrets, timeout de 60 s y un reintento\. Cabeceras opcionales de atribución \(`HTTP-Referer`, `X-Title`\) para identificar la app en OpenRouter\.
* **Modelos parametrizados por variable** \(nunca en código\): `LLM_MODEL_EXTRACCION` y `LLM_MODEL_GENERACION`\. Default propuesto: DeepSeek serie V3\.x \(p\. ej\. `deepseek/deepseek-chat`\); el slug exacto se verifica al implementar contra el catálogo vigente de OpenRouter\. El modelo usado se guarda en cada documento \(`generated_documents.modelo`\)\.
* **Salida estructurada**: si el modelo elegido soporta `response_format` \(JSON/`json_schema`\), se usa; si no, v1 fuerza JSON por prompt \+ validación estricta con Zod y 1 reintento incluyendo el error de validación en el prompt\. Funciona con cualquier modelo de la pasarela\.
### 4\.1 Extracción de oferta
* Entrada: `raw_text` \(máx ~15\.000 caracteres efectivos; si sobra, se recorta del final\) o el texto reducido de la URL\.
* Validación con Zod sobre la salida JSON; si falla, 1 reintento incluyendo el error de validación en el prompt \(ver «Salida estructurada» en la intro de §4\)\.
* Salida JSON esperada:
```JSON
{
  "titulo": "", "empresa": "", "ubicacion": "", "modalidad": "remoto|híbrido|presencial",
  "seniority": "", "salario": {"texto": "", "min": null, "max": null, "moneda": null},
  "resumen": "",
  "responsabilidades": [""],
  "requisitos_obligatorios": [""], "requisitos_deseables": [""],
  "skills": [{"nombre": "", "obligatoria": true}],
  "beneficios": [""],
  "proceso_entrevistas": [{"paso": 1, "descripcion": ""}],
  "campos_faltantes": [""],
  "confianza": {"titulo": "alta|media|baja", "empresa": "alta|media|baja"}
}
```
* Manejo de errores y parcialidad: `exitosa` si hay título\+empresa\+requisitos; `parcial` si faltan campos \(se listan en `campos_faltantes` y la UI los resalta para edición\); `fallida` si el JSON no valida tras el reintento — se guarda `raw_text` y `extraction_error`, y la pantalla permite crear la oferta a mano\. La extracción nunca bloquea el flujo\.
### 4\.2 Generación de CV y carta
* Entrada del prompt: JSON de la oferta \+ `profile` \+ **plantilla elegida** \+ únicamente las filas de `experiences` cuyos ids vengan en `experience_ids` \(anclaje explícito: el modelo no inventa experiencia\)\.
* Plantillas con estructura fija \(`llm/prompts/templates/`, versionadas vía `prompt_version`\): `cv_tecnica.md` y `cv_ejecutiva.md` \(las 2 de v1; el usuario definirá su contenido final — las plantillas son editables como archivos del repo, sin cambios de código\), y `cover_letter.md` \(única en v1\)\. El CV sale en Markdown con encabezado de contacto, resumen alineado a la oferta, experiencias seleccionadas con logros y skills; la carta, 3–4 párrafos que conectan requisitos → logros\.
* Regeneración y versionado: cada «Generar»/«Guardar» inserta `version+1` con `es_actual=1` \(la anterior pasa a 0\); restaurar una versión inserta una copia nueva; `origen` distingue `llm` de `manual`\.
* Streaming: la respuesta llega por SSE al editor para ver el texto mientras se genera \(OpenRouter soporta streaming SSE compatible con OpenAI\)\.
### 4\.3 Prep de entrevista
* Entrada: JSON de la oferta \+ CV vigente \+ tipo de entrevista \+ research existente\. Salida en `prep_md`: preguntas probables según el tipo, puntos a destacar mapeados a requisitos de la oferta, preguntas para hacer al entrevistador y checklist\.
### 4\.4 Importación desde \.md
* Entrada: el texto del CV en Markdown del usuario\. Salida: JSON con el perfil y las experiencias detectadas \(mismo formato que §3\.3\)\. La UI muestra la estructura detectada para revisión; nada se guarda sin confirmación explícita\.
### 4\.5 Coste y latencia aproximados
\(Órdenes de grandeza con precios públicos de OpenRouter/DeepSeek vigentes; verificar al implementar\.\)
* Extracción: ~2–5 s, ~US$0,001\.
* CV: ~15–30 s, ~US$0,005–0,01\. Carta: ~10–20 s, ~US$0,003–0,006\. Prep: ~10 s, ~US$0,003\. Importación \.md: ~5–10 s, ~US$0,005 \(una sola vez\)\.
* Presupuesto realista \(50 postulaciones/mes, 2 CV \+ 2 cartas \+ 4 preps c/u\): **< US$2/mes**\.
## 5\. Pantallas del front
1. **Login** — email \+ contraseña; error genérico; sin registro público\.
2. **Pipeline \(dashboard\)** — kanban o lista agrupada por estado; contadores por estado; próximas entrevistas ordenadas por fecha; botón «Nueva oferta»\. Sin métricas globales \(confirmado\)\.
3. **Nueva oferta** — pegar URL o texto; resultado de extracción \(éxito/parcial/fallido\) y creación de postulación\.
4. **Detalle de oferta** — campos extraídos editables con resaltado de `campos_faltantes`; texto original plegable; link fuente\.
5. **Perfil y experiencia** — CRUD de perfil y de experiencias \(laboral, proyecto, educación, certificación\) con logros y skills; reordenar; **importación desde \.md** con vista previa y confirmación\.
6. **Detalle de postulación** — cabecera con estado, resultado y acciones de transición; pestañas Oferta / CV / Carta / Entrevistas / Aprendizajes\.
7. **Editor de documento** — selector de plantilla \(técnica/ejecutiva en CV\) y de experiencias con búsqueda; generar/regenerar; editor Markdown con preview lado a lado; historial de versiones con restaurar; exportar PDF\.
8. **Entrevistas** — lista por secuencia con estado y fecha; detalle con research, prep generada/editable, checklist y registro de resultado\.
9. **Cierre y aprendizajes** — formulario de cierre \(resultado \+ qué funcionó/qué mejorar/gaps\) y vista global de aprendizajes filtrable\.
## 6\. API surface \(Hono, bajo `/api`, todas con sesión salvo login\)
* POST /api/auth/login — iniciar sesión — \{email, password\}\.
* POST /api/auth/logout — cerrar sesión\.
* GET/PUT /api/profile — leer/guardar perfil \(estructura §3\.3\)\.
* POST /api/profile/import\-md — estructurar CV \.md \(solo detecta, no guarda\) — \{markdown\}\.
* POST /api/profile/import\-md/apply — guardar lo revisado — \{perfil, experiences\[\]\}\.
* GET/POST /api/experiences · GET/PUT/DELETE /api/experiences/:id — CRUD experiencia \(fila §3\.3\)\.
* POST /api/offers/extract — extraer oferta — \{fuente:'url'|'texto', url?, texto?\}\.
* GET/POST /api/offers · GET/PUT /api/offers/:id — CRUD oferta \(incluye editar extracted\_json\)\.
* GET/POST /api/applications · GET/PATCH /api/applications/:id — CRUD postulación y transición de estado — \{status?, resultado?, notas?…\}\.
* POST /api/applications/:id/documents — generar documento \(SSE\) — \{tipo, plantilla, experience\_ids\[\], idioma?\}\.
* GET /api/applications/:id/documents — versiones de CV/carta\.
* PUT /api/documents/:id — guardar edición \(nueva versión\) — \{contenido\_md\}\.
* POST /api/documents/:id/versions/:v/restore — restaurar versión\.
* POST /api/documents/:id/pdf — guardar PDF exportado en R2 \(multipart\)\.
* GET /api/documents/:id/pdf — descargar PDF\.
* GET/POST /api/applications/:id/interviews · PUT/DELETE /api/interviews/:id — CRUD entrevistas \(fila §3\.3\)\.
* POST /api/interviews/:id/prep — generar prep \(SSE\)\.
* POST /api/applications/:id/close — cerrar proceso — \{resultado, que\_funciono, que\_mejorar, gaps\[\], omitir\_aprendizajes?\}\.
* GET /api/learnings — aprendizajes de todas las postulaciones\.
## 7\. Auth y privacidad
* **Login propio usuario/contraseña \(confirmado\)**: sin registro público ni multiusuario\. Credenciales en Workers Secrets \(`APP_EMAIL`, `APP_PASSWORD_HASH` — PBKDF2\-SHA256 con salt, ~600k iteraciones, WebCrypto\) y sesión con cookie firmada HMAC \(`SESSION_SECRET`, 32 bytes\), el mismo patrón que `AgenticCMS` \(`workers/api/src/middleware/auth.ts`\)\. Cookie `HttpOnly; Secure; SameSite=Strict`, TTL 30 días\. \(Descartada la alternativa Cloudflare Access por decisión del usuario\.\)
* Login con rate\-limit simple \(5 intentos / 15 min por IP\) y mensaje de error genérico\.
* **Secretos**: solo en Workers Secrets \(`OPENROUTER_API_KEY`, `SESSION_SECRET`, credenciales\)\. Nunca en el front, el repo ni vars públicas\.
* **Privacidad de datos**: todo \(ofertas, CVs, entrevistas, aprendizajes\) vive en D1/R2 de la propia cuenta Cloudflare\. Las llamadas a OpenRouter envían la oferta y las experiencias seleccionadas \(el CV requiere nombre y contacto en el encabezado\); no se envían datos de otras postulaciones\. OpenRouter actúa como intermediario: revisar en la cuenta sus ajustes de retención/entrenamiento y desactivar el uso de datos si está disponible\.
* CORS restringido al dominio Pages \(patrón `CORS_ALLOWED_ORIGINS` de AgenticCMS\)\. Todo el tráfico por HTTPS\.
## 8\. Criterios de aceptación
1. Dado un CV en \.md pegado en «Perfil», cuando ejecuto la importación y confirmo, entonces quedan creados el perfil y N experiencias con los campos detectados, sin duplicar lo ya guardado\.
2. Dado un texto de oferta pegado, cuando guardo «Nueva oferta», entonces veo los campos extraídos \(título, empresa, requisitos, skills\) editables y una postulación en `borrador` creada\.
3. Dada una extracción que devuelve sin salario ni beneficios, cuando reviso la oferta, entonces veo `extraction_status=parcial` y esos campos resaltados como faltantes\.
4. Dado un texto sin estructura reconocible, cuando la extracción falla, entonces la oferta queda `fallida` con el texto original guardado y puedo completar los campos a mano\.
5. Dada una postulación con 3 experiencias marcadas y la plantilla «ejecutiva», cuando genero el CV, entonces el Markdown resultante usa la estructura de esa plantilla, contiene solo esas 3 experiencias y `generated_documents` registra `plantilla` y `experience_ids_json`\.
6. Dado un CV v1 generado, cuando lo edito y guardo, entonces existe v2 como versión actual, v1 sigue consultable y puedo restaurarla como v3\.
7. Dada una postulación con CV vigente pero sin carta, cuando intento marcar «Enviada», entonces la acción se bloquea hasta generar o seleccionar una carta vigente\.
8. Dado un CV vigente, cuando exporto PDF, entonces el archivo queda en R2 y es descargable solo con sesión iniciada\.
9. Dada una postulación `enviada`, cuando creo su primera entrevista, entonces el estado pasa a `entrevistas` y la entrevista queda con secuencia 1\.
10. Dadas 2 entrevistas registradas, cuando la primera queda `aprobada`, entonces puedo agendar la segunda con fecha/link y generar su prep desde la oferta y el CV actual\.
11. Dado un resultado `rechazada` en entrevista, cuando la UI lo confirma, entonces la postulación pasa a `rechazada` y pide cierre con aprendizajes\.
12. Dada una postulación a cerrar sin campos de aprendizaje, cuando no marco «omitir aprendizajes», entonces el cierre no procede hasta completar al menos un campo\.
13. Dada una sesión no iniciada, cuando pido cualquier `/api/*` distinto de login, entonces recibo 401 y ninguna query toca D1\.
14. Dadas 5 contraseñas erróneas seguidas, cuando intento la sexta, entonces el login queda bloqueado 15 minutos para esa IP\.
## 9\. Decisiones confirmadas y alternativas
* **Usuario** — confirmado: single\-user, login propio usuario/contraseña \(secrets \+ cookie firmada\)\. Descartada: Cloudflare Access\.
* **Stack / despliegue** — confirmado: Cloudflare — Workers \(Hono\) \+ Pages \+ D1 \+ R2, TypeScript \(patrón AgenticCMS\)\.
* **Front** — confirmado: React \+ Vite \(SPA\)\.
* **LLM** — confirmado: OpenRouter \(`https://openrouter.ai/api/v1`\) con modelos económicos tipo DeepSeek; Anthropic directo descartado por coste\. Impacto: coste ~5–10× menor; JSON forzado por prompt \+ Zod cubre cualquier modelo de la pasarela\.
* **Entrada de oferta** — confirmado: URL o texto pegado \(fetch server\-side\); scraping de portales fuera de v1\.
* **PDF** — confirmado: vista de impresión del navegador \+ guardado en R2\.
* **Estados** — confirmado: enum fijo de 7 estados\.
* **Educación/certificaciones** — confirmado: filas de `experiences` con `tipo`\.
* **Cierre** — confirmado: exige ≥1 aprendizaje o casilla explícita de omisión\.
* **Plantillas de CV** — confirmado: 2 en v1 \(`cv_tecnica`, `cv_ejecutiva`\); contenido final lo define el usuario después; agregar más no requiere cambios de código\.
* **Importación de CV** — confirmado: v1 incluye importar desde \.md; PDF/Word queda para v2\.
* **Métricas globales** — confirmado: fuera de v1\.
* **Recordatorios** — confirmado: fuera de v1\.
* **Carta** — confirmado: siempre CV \+ carta para marcar «Enviada»\.
* **Idioma** — confirmado: UI en español; idioma del documento parametrizable\.
## 10\. Riesgos y preguntas abiertas
**Riesgos:**
* Modelos económicos pueden extraer o redactar con menor calidad → mitigado con validación Zod \+ 1 reintento \+ revisión manual siempre disponible; los modelos son configurables por variable sin cambios de código\.
* Soporte de JSON estructurado varía según el modelo en OpenRouter → se usa `response_format` si está disponible y, si no, JSON forzado por prompt \+ Zod\.
* Fetch de URLs con contenido dinámico o bloqueos de ATS → mitigado con paste de texto como camino principal\.
* Fidelidad del PDF depende del diálogo de impresión del navegador → CSS `@media print` probado; alternativa futura: Browser Rendering\.
* Privacidad: los CVs contienen datos personales que viajan a OpenRouter en cada generación → documentado; revisar ajustes de retención/entrenamiento de la cuenta OpenRouter\.
* Fuerza bruta sobre login single\-user → rate limit \+ cookie firmada \+ HTTPS\.
* Límites de D1 \(tamaño de `raw_text`\) → cap de 500 KB por oferta y truncado a ~15k caracteres para el prompt\.
**Pendiente único:**
* Contenido de las 2 plantillas de CV \(`cv_tecnica`, `cv_ejecutiva`\): el usuario lo definirá más adelante; mientras tanto se implementan con estructuras base razonables y quedan como archivos editables en `llm/prompts/templates/` \(sin cambios de código para ajustarlas\)\.
## Decisiones cerradas con el usuario \(2026\-10\-10\)
1. LLM: pasarela OpenRouter \(`https://openrouter.ai/api/v1`\) con modelos económicos tipo DeepSeek; Anthropic directo descartado por coste\. Despliegue sigue en Cloudflare\.
2. Login propio usuario/contraseña confirmado \(descartada Cloudflare Access\)\.
3. Métricas globales fuera de v1\.
4. 2 plantillas de CV en v1 \(`cv_tecnica`, `cv_ejecutiva`\); contenido final lo definirá el usuario después \(plantillas como archivos editables del repo\)\.
5. Importación inicial de experiencia desde documento \.md incluida en v1\.
6. Recordatorios por correo fuera de v1\.
7. «Enviada» exige CV **y** carta vigentes\.
## Prerrequisitos para implementar
1. Repo `cabobadilla/TrackingInterviews` creado \(manual por el usuario o concediendo permiso `createRepository` a la app de la fábrica\) y agregado a `factory.yaml`\.
2. Spec aprobado por el usuario con ajustes \(hecho: v3 confirmada, con OpenRouter como pasarela LLM\)\.
