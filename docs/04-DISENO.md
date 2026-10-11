# 04 — Diseño · Ciclo 1 (MVP: cargar oferta + pipeline)

- **Proyecto:** MyInterviews
- **Fecha:** 2026-10-10
- **Basado en:** `docs/03-DEFINICION.md` (C-01..C-24, aprobados en G1) + `docs/spec/SPEC-v3-CONFIRMADA.md`
- **Dueño:** Arquitecto
- **ADRs:** `docs/ADR-001` … `docs/ADR-007`

---

## 1. Qué se construye en este ciclo

Un Worker de Cloudflare que sirve **una SPA y su API**, con base D1, donde un único
usuario entra con su credencial, pega el link o el texto de una oferta, obtiene los
campos extraídos por LLM (revisables y corregibles a mano) y ve la postulación creada en
el pipeline.

**No entra:** perfil, experiencia, CV, carta, PDF, entrevistas, cierre. Sus criterios ya
están definidos en `03-DEFINICION.md` (los ciclos 2 y 3) y esperan a sus ciclos.

## 2. Arquitectura

### Componentes

| Componente | Responsabilidad | Límite |
|---|---|---|
| `worker/index.js` | app Hono: monta rutas, aplica el middleware de sesión, sirve la SPA | no habla D1 directo |
| `worker/middleware/auth.js` | verifica la cookie firmada; sin sesión → `401` | no decide negocio |
| `worker/routes/*` | HTTP: valida entrada, llama repos y llm, arma respuesta | no conoce SQL |
| `worker/repos/*` | **único** acceso a D1 | no conoce HTTP |
| `worker/llm/*` | habla con OpenRouter, reduce HTML, valida con Zod | no conoce D1 ni HTTP |
| `worker/lib/*` | sesión (HMAC), rate limit, esquemas Zod | sin efectos |
| `app/*` (SPA) | UI | **nunca** llama a OpenRouter: todo pasa por la API |
| `tests/fixtures/*.html` | una por pantalla: monta los componentes reales con datos fijos → verifican `existencia` y `forma` (ADR-005) | **importa** los componentes, no los reimplementa |
| `tests/helpers/browser.mjs` | infraestructura **sellada** del harness | el Coder **no** lo edita |

### Flujo de datos — cargar una oferta

1. La SPA manda `POST /api/offers/extract` con `{fuente:'texto'|'url', texto?|url?}` y la cookie.
2. `middleware/auth` valida la cookie; si no, `401` **antes** de tocar nada.
3. Si es `url`: `llm/reduce_html.js` descarga (cap 500 KB) y reduce a texto.
4. Se trunca a ~15.000 caracteres **solo para el prompt** si hace falta, y se registra el
   truncado. **`raw_text` guarda el texto completo**: lo que se recorta es lo que ve el
   modelo, nunca lo que queda almacenado.
5. `llm/extract_offer.js` llama al gateway; valida con Zod; si falla, **1 reintento**
   incluyendo el error de validación en el prompt.
6. Se guarda `job_offers` con `extracted_json`, `extraction_status` y `campos_faltantes_json`.
7. Se crea la `applications` ligada, en `borrador`.
8. La SPA refresca el pipeline; la nueva fila aparece **sin recargar**.

### Contratos

```
POST /api/auth/login      Entrada: {email, password}
                          Salida 200: {ok:true} + Set-Cookie de sesión
                          Errores: 401 genérico · 429 si superó 5/15min
POST /api/auth/logout     Salida 200 y cookie invalidada
GET  /api/session         Salida 200 {autenticado:true|false}   (para decidir login vs app)

POST /api/offers/extract  Entrada: {fuente:'texto'|'url', texto?, url?}
                          Salida 201: {oferta, aplicacion}
                          Errores: 400 sin fuente · 422 URL no descargable o >500 KB · 502 LLM caído
GET  /api/offers          Salida 200: {ofertas:[…]}
GET  /api/offers/:id      Salida 200: {oferta} · 404
PUT  /api/offers/:id      Entrada: campos de la oferta   Salida 200: {oferta}

GET  /api/applications    Salida 200: {aplicaciones:[…], contadores:{borrador:n, …}}  (los 7 estados, siempre)
POST /api/applications    Entrada: {offer_id}            Salida 201: {aplicacion} en borrador
GET  /api/interviews/proximas  Salida 200: {entrevistas:[]} ordenadas ascendente
```

### Esquemas de datos

`OfferJSON` (canónico, spec §4.1) validado con Zod:

```
{ titulo, empresa, ubicacion, modalidad, seniority,
  salario:{texto,min,max,moneda} | ausente,
  resumen, responsabilidades[], requisitos_obligatorios[],
  requisitos_deseables[], skills[{nombre,obligatoria}],
  beneficios[], proceso_entrevistas[{paso,descripcion}],
  campos_faltantes[], confianza{titulo,empresa} }
```

Tablas del ciclo: `job_offers`, `applications`, `login_attempts`. El esquema completo
(incluidas las tablas de C2/C3) entra en `0001_init.sql` — ver **ADR-003**.

## 3. Stack y dependencias

| Elección | Versión | Justificación |
|---|---|---|
| Hono | última estable | el spec §3.1 lo fija; ya probado en `AgenticCMS` |
| React + Vite | última estable | confirmado por el usuario (spec §9) |
| Zod | última estable | validación del JSON del LLM (spec §4) |
| D1 (binding `DB`) | — | spec §3.1 |
| OpenRouter | API estable | spec §9 (v3) |
| Node `node:test` | el del entorno | la suite del harness ya corre así |
| `npx wrangler` | última | dev local y deploy |

**Gestor de paquetes: npm** — ver **ADR-002**.

## 4. Despliegue  ⭐

### Todo lo que se publica

| Qué | Dónde | Quién | Cómo |
|---|---|---|---|
| **El producto** (ciclo 1) | Cloudflare Workers (`myinterviews.mkvs.workers.dev`) | el Orquestador | `npx wrangler deploy` |
| **La vista previa del ciclo** | la **misma URL** del producto (ver abajo) | el Orquestador | `npx wrangler deploy` + smoke |
| **El tablero** | Cloudflare Worker `myinterviews-tablero` | el Orquestador | `./scripts/update-status.sh . --publicar` |
| **El mockup congelado** | Cloudflare Worker `myinterviews-mockup` | el Arquitecto | `npx wrangler deploy` en `docs/mockup/` |

### Qué plataforma

**Cloudflare Workers.** El artefacto tiene **código en runtime** (API, D1, secretos), y
eso descarta GitHub Pages: Pages no corre un script. Además el repo del proyecto es
**público**, así que la restricción de Pages (solo repos públicos) no aplica, pero la
razón de fondo sí: hay API.

### Vista previa por ciclo

- **Mecanismo:** como el Ciclo 1 es el **primer** deploy del producto, la URL de
  producción *es* la vista previa. El Worker se despliega en el **dominio propio** del
  Worker, no en producción de nadie más, así que la revisión del PO es directa.
- **Quién publica:** el **Orquestador**. El Coder **no despliega** y **no tiene token**.
- **Cuándo:** al cerrar el ciclo, junto con el smoke.
- **Dónde queda:** en el tablero y en el handoff — **la URL se entrega, no se describe.**
- ⚠️ **Para los ciclos siguientes** (donde ya hay producción que no hay que pisar) el
  mecanismo pasa a **Workers Builds / Preview URL por rama**. `--preview-alias` está
  **descartado** (Cloudflare lo desaconseja) y las **Version URLs** también (usan
  recursos de producción). Se declara acá para no improvisarlo después.

### Forma del Worker

| Opción | Cuándo |
|---|---|
| A · Solo assets | app estática |
| **B · Assets + Worker** | app estática **y** API ← **elegida** |
| C · Worker + bindings | B más almacenamiento ← **parcialmente**: además hay D1 |

**Elegida: B/C — un solo Worker con `main` (Hono) y `assets` apuntando a la SPA
compilada.** Por qué: un deploy, un origen, **cero CORS**, y una sola URL que entregar.
Ver **ADR-001** (incluye las alternativas descartadas, entre ellas Pages).

### Entornos

| | Local | Cloudflare |
|---|---|---|
| Comando | `npx wrangler dev --port 8787` | `npx wrangler deploy` |
| Qué corre | Worker real + **D1 local** (Miniflare) + la SPA compilada | Worker + D1 real + assets |
| **Qué NO corre igual** | no aplica los límites del plan (CPU, cuotas); el D1 local arranca **vacío** y sin migrar hasta correr `d1 migrations apply --local` | los límites del plan **sí** aplican |

**Paridad declarada, no supuesta:** el emulador **no** aplica el techo de CPU, así que
un login que pasa en local puede dar **Error 1102** en el edge. Por eso el presupuesto de
CPU de abajo es explícito y se mide.

### Dónde corren las pruebas  ⭐

| | **Suite** | **Smoke** |
|---|---|---|
| **Dónde** | **Local** (`wrangler dev` en `127.0.0.1:8787`) | **Cloudflare** (la URL real) |
| **Cuándo** | antes de integrar, en cada tarea | después de cada deploy |
| **Qué prueba** | el comportamiento de la matriz (C-01..C-24) | que lo desplegado es lo construido |
| **Quién la corre** | el **Coder** (Hermes la verifica) | **Hermes** |

La suite **no** corre contra producción: es determinista y no gasta cuota. El smoke es
chico: la URL responde `200`, la SPA carga, `POST /api/auth/login` con las credenciales
reales devuelve cookie, un `GET /api/offers` **sin** cookie devuelve `401`, y el
`#pipeline` se ve autenticado. **Los casos ocultos** corren después, también contra
local, tras el commit final del Coder.

### Bindings

| Binding | Tipo | Para qué |
|---|---|---|
| `DB` | D1 | `job_offers`, `applications`, `login_attempts` |

**R2 no se declara en este ciclo** (no hay PDFs todavía): un binding que nadie usa es un
permiso de más.

### Límite que puede romperlo

- **Límite: CPU por request (10 ms en Free) contra PBKDF2 a 600k iteraciones.**
  Consecuencia: el login devuelve **Error 1102** y nadie entra — la app queda inaccesible
  por completo, porque sin sesión no hay nada. **Mitigación:** `PBKDF2_ITERATIONS` es
  variable, se mide con el smoke y se baja si hace falta, dejándolo escrito.
- **Límite: tamaño de fila de D1 contra `raw_text`.**
  Consecuencia: una oferta enorme no se puede guardar. **Mitigación:** cap de 500 KB en la
  descarga y truncado a ~15k para el prompt.

### Presupuesto de CPU

- **Camino del request normal:** leer la cookie, verificar HMAC (barato), una o dos
  consultas D1, serializar JSON. Holgado dentro del techo.
- **El caso caro es el login:** PBKDF2. Es el único lugar con criptografía en bucle; queda
  aislado en `lib/session.js` y parametrizado justamente por esto.
- **La extracción LLM no consume CPU del Worker:** espera al `fetch`. El tiempo de espera
  cuenta contra el límite de **duración**, no de CPU.

### Secretos

| Secreto | Dónde | Quién lo pone |
|---|---|---|
| `OPENROUTER_API_KEY` | Secret del Worker | el Orquestador, desde `~/.hermes/.env` |
| `APP_EMAIL`, `APP_PASSWORD_HASH` | Secrets del Worker | idem |
| `SESSION_SECRET` (32 bytes) | Secret del Worker | idem |
| `PBKDF2_ITERATIONS`, `LLM_MODEL_EXTRACCION` | **vars** públicas de `wrangler.jsonc` | versionadas (no son secretos) |

Local: `.dev.vars` (en `.gitignore`). **Nunca** en el repo, **nunca** en el directorio de
assets. El valor de `APP_PASSWORD_HASH` se genera **fuera** del entorno del Coder.

### Rollback

- `npx wrangler rollback <version-id>` → restaura el **código** del deploy anterior.
- **El esquema no se revierte** (las migraciones de D1 no van hacia atrás). Se documenta
  la migración aplicada y, si hubo error, se corrige hacia adelante con una nueva.

### ¿Hay algo en el directorio de assets que NO debe ser público?

- El directorio de assets es `public/`, que es **salida de `vite build`**. Riesgos a
  vigilar: **source maps** (se desactivan en el build de producción) y `.dev.vars`
  (fuera de `public/`, en `.gitignore`). No hay claves en el front: la de OpenRouter vive
  en un Secret y solo la lee el Worker.

## 5. Decisiones (ADRs)

- `ADR-001-un-solo-worker-hono-assets.md` — un Worker con `main` + `assets`, **no** Pages
- `ADR-002-npm-no-pnpm.md` — npm en lugar de pnpm
- `ADR-003-esquema-completo-en-la-primera-migracion.md` — `0001_init.sql` con todo el esquema + 2 correcciones
- `ADR-004-los-tests-corren-contra-wrangler-dev.md` — sin mocks, contra el Worker real
- `ADR-005-la-forma-se-mide-sobre-un-fixture.md` — cómo se mide la clase `forma`
- `ADR-006-extraccion-prompt-zod-reintento.md` — la estrategia de salida estructurada
- `ADR-007-rate-limit-en-d1.md` — el contador de intentos vive en D1

## 6. Matriz de casos de prueba  ⭐

| ID | Caso | Criterio de origen | Clase | Observable esperado |
|---|---|---|---|---|
| **C-01** | Sin sesión se ve el login | C-01 | existencia | `pagina.caja('#login') !== null` en el fixture `login.html` |
| `C-02` | `/api/*` sin cookie | C-02 | comportamiento | `GET /api/offers` sin cookie → `401`; **0** consultas D1 |
| `C-02` | `GET /api/session`, la excepción | C-02 | comportamiento | sin cookie → `200 {autenticado:false}`; con cookie válida → `200 {autenticado:true}` |
| `C-05` | logout invalida de verdad | C-05 | comportamiento | tras el logout, una ruta protegida con **esa misma cookie** → `401` (ADR-009: hace falta estado) |
| `C-03` | Login falla, error genérico | C-03 | comportamiento | email inexistente y contraseña mala → **mismo status y mismo cuerpo** |
| `C-04` | 6º intento bloqueado | C-04 | comportamiento | 5 fallos → 6º responde `429` **sin verificar la contraseña** |
| `C-05` | Cookie de sesión y logout | C-05 | comportamiento | `Set-Cookie` con `HttpOnly`, `Secure`, `SameSite=Strict`; tras logout la cookie vieja → `401` |
| `C-06` | Cookie manipulada o vencida | C-06 | comportamiento | firma alterada → `401` + cookie de borrado |
| **C-07** | Pantalla de nueva oferta | C-07 | existencia | `#nueva-oferta` existe en el fixture `nueva-oferta.html` |
| `C-08` | Texto → oferta + postulación | C-08 | comportamiento | `POST /api/offers/extract` → oferta con `titulo`/`empresa` **y** `applications.status='borrador'` |
| `C-09` | URL → descarga y reduce | C-09 | comportamiento | con fetch inyectado que devuelve HTML, la oferta sale con los campos del texto |
| `C-10` | Extracción sin salario → parcial | C-10 | comportamiento | `extraction_status='parcial'` y `campos_faltantes_json` ⊇ {salario, beneficios} |
| `C-11` | JSON inválido tras 1 reintento | C-11 | comportamiento | LLM falso devuelve basura 2 veces → `fallida`, con `raw_text` y `extraction_error`, **y la oferta se crea igual** |
| `C-12` | URL no descargable | C-12 | comportamiento | fetch que falla → error explícito que ofrece pegar texto y **0** filas nuevas |
| `C-13` | Texto de 40.000 caracteres | C-13 | comportamiento | al LLM le llegan **≤15.000** y la fila registra el truncado |
| **C-14** | Detalle de la oferta | C-14 | existencia | el fixture `detalle-oferta.html` muestra los campos de la oferta |
| `C-15` | Editar una oferta `fallida` | C-15 | comportamiento | `PUT /api/offers/:id` → `200` y el valor persiste |
| `C-16` | Campos faltantes resaltados | C-16 | comportamiento | los inputs de `campos_faltantes_json` llevan la clase de resalte |
| `C-17` | Texto original consultable | C-17 | comportamiento | el detalle expone `raw_text` y `source_url` tal como se guardaron |
| **C-18** | Pantalla de pipeline | C-18 | existencia | `#pipeline` existe en el fixture `pipeline.html` |
| `C-19` | 7 contadores por estado | C-19 | comportamiento | 7 contadores presentes, cada uno con su número, incluidos los ceros |
| `C-20` | Alta en vivo | C-20 | comportamiento | tras crear la oferta, la fila nueva está en el pipeline **sin reload** |
| `C-21` | Próximas entrevistas ordenadas | C-21 | comportamiento | 3 entrevistas futuras desordenadas → lista ascendente; sin entrevistas → lista vacía |
| `C-22` | Columnas del tablero alineadas | C-22 | forma | **M-1**: mismo `top` ±4px, mismo ancho ±4px, `left` creciente |
| `C-23` | Barra lateral y contenido | C-23 | forma | **M-2**: sidebar `240px ±6`; contenido a `sidebar.right + 24px ±6` |
| `C-24` | Fecha alineada | C-24 | forma | **M-4**: `left` de la fecha igual entre filas ±3px |

### Cobertura combinada

No hay ejes que se multipliquen dentro del Ciclo 1: los 3 resultados de extracción
(`exitosa`/`parcial`/`fallida`) están cubiertos uno por uno (`C-08`, `C-10`, `C-11`) y no
se combinan con un segundo eje. El segundo eje (7 estados × documentos) llega en C2/C3.

### Casos ocultos

**3**, en el harness: `oculto/MyInterviews/ciclo-1.test.mjs`. Mismo momento, distinto
destino — endurecen criterios ya visibles. Se ejecutan en **G5**, después del commit
final del Coder, con `./scripts/hidden-cases.sh run <proyecto> 1`.

### Clase de criterio

Cada fila declara la clase de su criterio de origen. Las de clase `existencia`
(`C-01`, `C-07`, `C-14`, `C-18`) y las de clase `forma` (`C-22`, `C-23`, `C-24`) se
verifican **sobre los fixtures** que montan los componentes reales (**ADR-005**): la
`existencia` consultando el DOM renderizado y la `forma` midiendo geometría con
`getBoundingClientRect()`. Ninguna se verifica leyendo el HTML del artefacto.

## 7. Trazabilidad

| Criterio (fase 3) | Casos | Tarea(s) |
|---|---|---|
| C-01, C-07, C-14, C-18 | `C-01`, `C-07`, `C-14`, `C-18` | T-01 |
| C-02, C-03, C-04, C-05, C-06 | `C-02`, `C-03`, `C-04`, `C-05`, `C-06` | T-02 |
| C-08, C-09, C-10, C-11, C-12, C-13 | `C-08`, `C-09`, `C-10`, `C-11`, `C-12`, `C-13` | T-03 |
| C-15, C-16, C-17 | `C-15`, `C-16`, `C-17` | T-04 |
| C-19, C-20, C-21, C-22, C-23, C-24 | `C-19`, `C-20`, `C-21`, `C-22`, `C-23`, `C-24` | T-05 |

Cada criterio tiene ≥1 caso; cada caso nace de un criterio; cada tarea apunta a ≥1 caso.
**Sin huérfanos en ninguna dirección.**

## 8. Corte y complejidad combinada

Hay complejidad combinada (4 pantallas × 7 estados × 2 caminos de entrada × 3 resultados
de extracción). **El corte es el que fijó el usuario en G1:** el Ciclo 1 entrega cargar la
oferta y el pipeline; los ciclos 2 y 3 ya están definidos y numerados en `03`. El diseño
**no anticipa** pantallas ni lógica de C2/C3 más allá del esquema (**ADR-003**).

---

**Gate G2:** todo criterio tiene ≥1 caso con observable; todo caso nace de un criterio;
toda tarea apunta a ≥1 caso; cada ADR tiene alternativas descartadas; y está la sección
de Despliegue con local y cloud, la forma del Worker y el límite del plan que podría
romperlo.
