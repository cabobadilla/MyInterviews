# 03 — Definición

- **Proyecto:** MyInterviews
- **Fecha:** 2026-10-10
- **Iteración:** Ciclo 1 — Etapa 1
- **Fuente:** `docs/spec/SPEC-v3-CONFIRMADA.md` (§§ citadas por número) + `docs/02-ANALISIS.md`

> Los 14 criterios de aceptación del spec (§8) están **todos** cubiertos abajo. Se
> conserva su numeración como `[ACC-nn]` para poder auditarlos uno por uno.
> Lo que el PO decidió **además** de lo que el spec dice queda marcado `[PO]`.

## Clases y cómo se verifica cada una

| Clase | Verifica | Observable |
|---|---|---|
| `existencia` | que el elemento está | `document.querySelector('#pipeline') !== null` |
| `comportamiento` | que hace lo que debe | `POST /api/offers/extract` con texto → `200` y `extraction_status` ∈ {exitosa, parcial, fallida} |
| `forma` | cómo se ve / se dispone | `getBoundingClientRect()` con tolerancia declarada |

---

## HU-1 — Importar mi experiencia desde un `.md`

**Como** usuario **quiero** pegar mi CV en Markdown y que la app lo estructure
**para** no cargar 20 años de experiencia a mano.

- **C-01** · `comportamiento` · `[ACC-01]`
  CUANDO el usuario envía un `.md` a `POST /api/profile/import-md` EL SISTEMA DEBE
  responder el perfil y N experiencias detectadas **sin escribir en `profile` ni en
  `experiences`**
- **C-02** · `comportamiento` · `[ACC-01]`
  CUANDO el usuario confirma la vista previa con `POST /api/profile/import-md/apply`
  EL SISTEMA DEBE crear el perfil y las filas de `experiences` confirmadas, y el
  conteo de filas DEBE crecer exactamente en el número de experiencias enviadas
- **C-03** · `comportamiento` · `[ACC-01]`
  CUANDO se aplica una importación sobre un perfil que ya tiene experiencias EL
  SISTEMA DEBE **agregar** lo confirmado y NO DEBE modificar ni borrar ninguna fila
  preexistente
- **C-04** · `comportamiento`
  SI el LLM devuelve algo que no valida contra el esquema ENTONCES EL SISTEMA DEBE
  responder el error de validación y NO DEBE guardar nada

## HU-2 — Mantener el perfil y la biblioteca de experiencia

**Como** usuario **quiero** editar y ordenar mi experiencia en un solo lugar
**para** reutilizarla en cada postulación.

- **C-05** · `existencia`
  CUANDO el usuario abre la pantalla de Perfil EL SISTEMA DEBE mostrar el contenedor
  `#profile`
- **C-06** · `comportamiento`
  CUANDO el usuario crea, edita o borra una experiencia (`/api/experiences`) EL
  SISTEMA DEBE persistir el cambio en D1 y reflejarlo en el siguiente `GET`
- **C-07** · `comportamiento`
  CUANDO el usuario reordena experiencias EL SISTEMA DEBE persistir `orden` y
  `GET /api/experiences` DEBE devolverlas en ese orden
- **C-08** · `comportamiento`
  CUANDO se lee o escribe una experiencia con `tipo` fuera de
  {`laboral`,`proyecto`,`educacion`,`certificacion`} EL SISTEMA DEBE rechazar la
  operación sin tocar la fila

## HU-3 — Registrar una oferta y extraer sus campos

**Como** usuario **quiero** pegar la URL o el texto de una oferta y obtener los campos
**para** no copiarlos a mano.

- **C-09** · `existencia`
  CUANDO el usuario abre «Nueva oferta» EL SISTEMA DEBE mostrar el contenedor `#nueva-oferta`
- **C-10** · `comportamiento` · `[ACC-02]`
  CUANDO el usuario guarda el texto de una oferta EL SISTEMA DEBE crear la oferta, y
  DEBE crear una postulación en estado `borrador` ligada a ella, y los campos
  `titulo`/`empresa` DEBEN quedar visibles y editables
- **C-11** · `comportamiento` · `[ACC-03]`
  SI la extracción devuelve el JSON sin salario ni beneficios ENTONCES EL SISTEMA
  DEBE guardar `extraction_status = 'parcial'` y DEBE listar esos campos en
  `campos_faltantes_json`
- **C-12** · `comportamiento` · `[ACC-04]`
  SI el JSON no valida tras 1 reintento ENTONCES EL SISTEMA DEBE guardar
  `extraction_status = 'fallida'`, DEBE conservar `raw_text`, y la pantalla DEBE
  permitir completar los campos a mano
- **C-13** · `comportamiento`
  CUANDO el usuario edita a mano `extracted_json` EL SISTEMA DEBE guardarlo **aunque**
  `extraction_status` sea `fallida` o `parcial`
- **C-14** · `comportamiento` · `[PO]`
  CUANDO el usuario pega una URL EL SISTEMA DEBE intentar la descarga server-side, y
  SI la descarga falla o excede 500 KB ENTONCES DEBE responder un error explícito que
  ofrece el camino de pegar texto, **sin** crear la oferta
- **C-15** · `comportamiento` · `[PO]`
  CUANDO el texto a extraer supera ~15.000 caracteres EL SISTEMA DEBE truncarlo del
  final antes de llamar al LLM y DEBE registrar en la oferta que hubo truncado

## HU-4 — Preparar la postulación: CV y carta con versionado

**Como** usuario **quiero** generar y versionar mis documentos por oferta
**para** no reescribir mi experiencia en cada postulación.

- **C-16** · `existencia`
  CUANDO el usuario abre el detalle de una postulación EL SISTEMA DEBE mostrar las
  pestañas `#tab-oferta`, `#tab-cv`, `#tab-carta`, `#tab-entrevistas`, `#tab-aprendizajes`
- **C-17** · `comportamiento` · `[ACC-05]`
  CUANDO el usuario genera un CV con N experiencias marcadas y una plantilla de
  `llm/prompts/templates/` EL SISTEMA DEBE insertar una fila en `generated_documents`
  con `experience_ids_json` = exactamente esos N ids, y el Markdown DEBE contener la
  estructura de esa plantilla y las N experiencias **y ninguna otra**
- **C-18** · `comportamiento` · `[ACC-05]`
  CUANDO se genera un documento EL SISTEMA DEBE registrar en la fila el `modelo` usado
  y el `prompt_version` de la plantilla aplicada
- **C-19** · `comportamiento` · `[ACC-06]`
  CUANDO el usuario edita y guarda un CV que era v1 EL SISTEMA DEBE dejar v1 con
  `es_actual=0`, DEBE insertar v2 con `es_actual=1` y `origen='manual'`, y v1 DEBE
  seguir siendo consultable
- **C-20** · `comportamiento` · `[ACC-06]`
  CUANDO el usuario restaura v1 EL SISTEMA DEBE insertar una **versión nueva** (v3) con
  el contenido de v1 como actual, **sin** modificar ni borrar v1 ni v2
- **C-21** · `comportamiento` · `[PO]`
  CUANDO se inserta un documento EL SISTEMA DEBE garantizar que exista **una sola**
  fila con `es_actual=1` por `(application_id, tipo)`
- **C-22** · `comportamiento`
  CUANDO el usuario pide el CV de una postulación EL SISTEMA DEBE devolver el Markdown
  generado y DEBE permitir editarlo con vista previa
- **C-23** · `comportamiento` · `[PO]`
  CUANDO se genera el primer CV o carta de una postulación en `borrador` EL SISTEMA
  DEBE moverla a `preparando`

## HU-5 — Exportar PDF y marcar «Enviada»

- **C-24** · `comportamiento` · `[ACC-07]`
  SI la postulación tiene CV vigente pero **no** carta vigente ENTONCES EL SISTEMA
  DEBE rechazar el paso a `enviada` y DEBE dejar la postulación en su estado previo
- **C-25** · `comportamiento` · `[ACC-07]`
  CUANDO la postulación tiene CV **y** carta vigentes EL SISTEMA DEBE permitir el paso
  a `enviada` y DEBE registrar `fecha_enviada`
- **C-26** · `comportamiento` · `[ACC-08]`
  CUANDO el usuario exporta un PDF EL SISTEMA DEBE guardar el objeto en R2 con la clave
  `applications/{application_id}/documents/{doc_id}_v{version}.pdf` y DEBE registrar
  `pdf_r2_key` en la fila de esa versión
- **C-27** · `comportamiento` · `[ACC-08]`
  SI se pide `GET /api/documents/:id/pdf` sin sesión válida ENTONCES EL SISTEMA DEBE
  responder `401` y NO DEBE leer de R2
- **C-28** · `comportamiento` · `[ACC-08]`
  CUANDO se pide un PDF con sesión válida EL SISTEMA DEBE responder
  `Content-Type: application/pdf`
- **C-29** · `forma` · `[PO]`
  MIENTRAS la app muestra un documento en modo edición EL SISTEMA DEBE disponer editor
  y vista previa **lado a lado** (medición en §Mockup: M-3)

## HU-6 — Ver el pipeline y las próximas entrevistas

- **C-30** · `existencia` · `[ACC-…none]`
  CUANDO el usuario abre la app autenticado EL SISTEMA DEBE mostrar el contenedor `#pipeline`
- **C-31** · `comportamiento`
  CUANDO el pipeline se renderiza EL SISTEMA DEBE agrupar las postulaciones por
  `status` y DEBE mostrar el contador de cada uno de los 7 estados
- **C-32** · `comportamiento`
  CUANDO hay entrevistas con `scheduled_at` futuro EL SISTEMA DEBE listarlas ordenadas
  por fecha ascendente
- **C-33** · `forma` · `[PO]`
  MIENTRAS el pipeline muestra el tablero por estado EL SISTEMA DEBE alinear las
  columnas (medición en §Mockup: M-1)

## HU-7 — Planificar y registrar N entrevistas

- **C-34** · `comportamiento` · `[ACC-09]`
  CUANDO se crea la primera entrevista de una postulación en `enviada` EL SISTEMA DEBE
  moverla a `entrevistas` y DEBE asignar `secuencia = 1`
- **C-35** · `comportamiento`
  CUANDO se crean entrevistas sucesivas EL SISTEMA DEBE asignar `secuencia` 2, 3, …
  **sin límite de N** y DEBE rechazar una `secuencia` ya usada en esa postulación
- **C-36** · `comportamiento` · `[ACC-10]`
  CUANDO la entrevista 1 queda `aprobada` EL SISTEMA DEBE permitir agendar la 2 con
  fecha/link e investigar/research propio de esa entrevista
- **C-37** · `comportamiento` · `[ACC-11]`
  CUANDO el usuario confirma el resultado `rechazada` de una entrevista EL SISTEMA
  DEBE mover la postulación a `rechazada` y DEBE ofrecer el cierre con aprendizajes
- **C-38** · `comportamiento`
  CUANDO el usuario registra el resultado de una entrevista EL SISTEMA DEBE aceptar
  solo uno de {`pendiente`,`aprobada`,`rechazada`,`sin_respuesta`} y DEBE guardar las notas

## HU-8 — Cerrar el proceso con aprendizajes

- **C-39** · `comportamiento` · `[ACC-12]`
  SI se pide cerrar una postulación sin `que_funciono`, sin `que_mejorar` y sin gaps y
  **sin** la casilla `omitir_aprendizajes` ENTONCES EL SISTEMA DEBE rechazar el cierre y
  DEBE dejar la postulación abierta
- **C-40** · `comportamiento` · `[ACC-12]`
  CUANDO se cierra con `omitir_aprendizajes = true` EL SISTEMA DEBE cerrar la
  postulación y DEBE registrar la omisión de forma explícita, no como campos vacíos
- **C-41** · `comportamiento`
  CUANDO se cierra el proceso EL SISTEMA DEBE pasar la postulación a `cerrada`, DEBE
  registrar `fecha_cierre`, el `resultado` final y DEBE guardar `status_previo` `[PO]` Q2
- **C-42** · `comportamiento` · `[PO]` Q2
  CUANDO el usuario «reabre» una postulación `cerrada` EL SISTEMA DEBE devolverla a
  `status_previo` y DEBE conservar los aprendizajes ya registrados
- **C-43** · `comportamiento` · `[ACC-…]`
  CUANDO una postulación está `cerrada` EL SISTEMA DEBE rechazar cualquier edición que
  no sea «reabrir»
- **C-44** · `comportamiento`
  CUANDO se pide `GET /api/learnings` EL SISTEMA DEBE devolver los aprendizajes de
  todas las postulaciones cerradas *(vista filtrable = Etapa 2)*

## HU-9 — Acceso de un solo usuario

**Como** dueño de mis datos **quiero** que la app no tenga registro ni multiusuario
**para** que nadie más entre.

- **C-45** · `existencia`
  CUANDO un visitante abre la app sin sesión EL SISTEMA DEBE mostrar el formulario `#login`
- **C-46** · `comportamiento` · `[ACC-13]`
  SI se pide cualquier `/api/*` distinto de `POST /api/auth/login` sin sesión válida
  ENTONCES EL SISTEMA DEBE responder `401` y NO DEBE ejecutar ninguna consulta contra D1
- **C-47** · `comportamiento` · `[ACC-13]`
  CUANDO el login falla EL SISTEMA DEBE responder un error **genérico**, sin revelar si
  el email existe
- **C-48** · `comportamiento` · `[ACC-14]`
  CUANDO ocurren 5 intentos fallidos desde la misma IP en 15 minutos EL SISTEMA DEBE
  rechazar el 6º intento con `429` sin evaluar la contraseña
- **C-49** · `comportamiento`
  CUANDO el login es correcto EL SISTEMA DEBE emitir la cookie `HttpOnly; Secure;
  SameSite=Strict` y `POST /api/auth/logout` DEBE invalidar la sesión
- **C-50** · `comportamiento`
  SI la cookie de sesión tiene firma inválida o está vencida (>30 días) ENTONCES EL
  SISTEMA DEBE responder `401` y DEBE emitir la cookie borrada

---

## Etapas

**Etapa 1 (este ciclo) — valor visible rápido: una búsqueda de trabajo real de punta a punta.**

- Entra: HU-1 a HU-9 **con una sola plantilla de CV** (`cv_tecnica`), sin «generar prep»
  por LLM, sin streaming SSE, sin vista global filtrable de aprendizajes.
- Por qué esto prueba el mecanismo completo: los cuatro motores del producto —
  extracción LLM con validación (C-09..C-15), generación de documentos anclada y
  versionada (C-16..C-23), máquina de 7 estados con cierre (C-34..C-43) y auth
  single-user (C-45..C-50) — quedan ejercidos. Lo que se difiere son **variantes**
  (2ª plantilla, prep, streaming, vista global), no motores.

**Diferido a la Etapa 2:**

- `cv_ejecutiva` y el contenido final de las dos plantillas (pendiente declarado por el
  usuario, spec §10).
- «Generar prep» de entrevista por LLM (C-marginal sobre el motor LLM ya probado).
- Streaming SSE en generación de documentos.
- Vista global de aprendizajes filtrable para detectar patrones (C-44 queda en su forma
  mínima: existe el endpoint).
- Rotación de credenciales por UI.

Por qué se puede diferir sin romper la Etapa 1: cada diferido es una variante o un
segundo uso de un mecanismo ya entregado; las plantillas son **archivos editables del
repo** (spec §4.2), así que agregar la segunda no toca código.

## Mockup (cierre de la fase 3)

- **URL del mockup:** **https://myinterviews-mockup.mkvs.workers.dev** (Worker solo-assets `myinterviews-mockup`, versión `4badacb1-a3a6-4636-a3c5-49bd7c5c4677`; smoke: `200`, 26.701 bytes, `text/html`). Fuente versionada en `docs/mockup/public/index.html`. Los 9 flujos se recorren desde la barra lateral; el botón *«Mediciones de forma»* mide M-1..M-4 en vivo en el navegador.
- **Criterios de clase `forma` extraídos:** C-29 (M-3) y C-33 (M-1), más M-2 y M-4.

### Mediciones extraídas del mockup

> **Medido sobre el DOM renderizado** (Chrome headless + CDP vía
> `tests/helpers/browser.mjs`), no leído del CSS. Comando:
> `docs/mockup/medir-forma.mjs` (desde la raíz del proyecto) → **14/14 OK**. Los números
> de abajo son lo medido; la tolerancia se escribe después de medir.

- **M-1 · Pipeline/tablero** → alimenta **C-33**
  Las columnas del tablero comparten `top` ±4px, tienen el mismo ancho ±4px, y el `left`
  de cada una es estrictamente creciente.
  *Medido:* 5 columnas · `top` = 178,1 / 178,1 / 178,1 / 178,1 / 178,1 · ancho = 82,4 c/u ·
  `left` creciente ✔
- **M-2 · Navegación lateral** → alimenta **C-30**
  La barra lateral mide `240px ±6` de ancho y el área de contenido arranca en
  `sidebar.right + 24px ±6`.
  *Medido:* ancho = **240,0** · contenido arranca **24,0** px tras la barra ✔
- **M-3 · Editor de documento** → alimenta **C-29**
  Editor y vista previa están lado a lado: comparten `top` ±4px, mismo alto ±6px,
  `preview.left − editor.right = 16px ±4`.
  *Medido:* `top` = 183,2 / 183,2 · alto = 779,4 / 779,4 · hueco = **16,0** ✔
- **M-4 · Próximas entrevistas** → alimenta **C-32**
  La fecha de cada fila comparte `left` ±3px y las filas van en orden de fecha
  ascendente de arriba hacia abajo.
  *Medido:* 3 filas · `left` = 264,5 / 264,5 / 264,5 ✔

**El mockup queda congelado** a partir de acá: es evidencia de la revisión de fase 3, no
un contrato vivo. Cambiarlo reabre G1.

## Casos borde y de error

| Caso | Comportamiento esperado | Criterio |
|---|---|---|
| El LLM devuelve JSON inválido 2 veces | `fallida`, `raw_text` guardado, se puede cargar a mano | C-12 |
| La URL es un portal que bloquea el fetch | error explícito que ofrece pegar texto; no se crea oferta | C-14 |
| La oferta trae 200 KB de texto | se trunca del final a ~15k y queda registrado | C-15 |
| Importar un `.md` sobre perfil ya cargado | agrega lo confirmado, no pisa lo existente | C-03 |
| Dos pestañas generan el CV a la vez | una sola fila con `es_actual=1` | C-21 |
| Restaurar una versión vieja | inserta versión nueva; no borra las intermedias | C-20 |
| Marcar «Enviada» sin carta | bloqueado, estado intacto | C-24 |
| Pedir un PDF sin sesión | `401`, sin lectura de R2 | C-27 |
| 6º intento de login fallido | `429` sin evaluar la contraseña | C-48 |
| Editar una postulación `cerrada` | rechazado salvo «reabrir» | C-43 |
| Cerrar sin aprendizajes ni casilla | rechazado | C-39 |
| `secuencia` de entrevista repetida | rechazado | C-35 |

## Definición de "terminado" para esta iteración

- [ ] Los criterios C-01..C-50 tienen test que los **nombra** (`check-coverage.sh` sin huecos)
- [ ] La suite falla primero por aserción (RED reproducido, no leído)
- [ ] El sello de tests queda **INTACTO** tras la implementación
- [ ] **Una URL pública** con la Etapa 1 desplegada y smoke ejecutado contra esa URL
- [ ] Las 4 mediciones de `forma` (M-1..M-4) verificadas con `getBoundingClientRect()` real
- [ ] Los casos ocultos del ciclo ejecutados tras el commit final del Coder
- [ ] El tablero publicado, con `commit_sha` = HEAD

## Fuera de esta iteración

- Las 4 variantes de Etapa 2 (2ª plantilla, prep LLM, streaming SSE, vista global filtrable)
- Todo el anti-alcance confirmado en `02-ANALISIS.md` (§Anti-alcance)

---

## Aprobación

- [ ] **Aprobado por el usuario** — fecha:
- [ ] Cambios solicitados:

---

**Gate G1 ⭐ (humano):** cada criterio está en EARS, declara su clase y se puede
convertir en un test; los de clase `forma` traen su medición. Sin aprobación explícita
del usuario, no se avanza a diseño.
