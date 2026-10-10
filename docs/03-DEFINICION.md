# 03 — Definición

- **Proyecto:** MyInterviews
- **Fecha:** 2026-10-10
- **Iteración:** **Ciclo 1 — MVP: cargar oferta + pipeline**
- **Fuente:** `docs/spec/SPEC-v3-CONFIRMADA.md` (§§ citadas por número) + `docs/02-ANALISIS.md`
- **Aprobación:** **G1 aprobado por el usuario el 2026-10-10** («me gusta el mockup» +
  «Desarrolla el C1»), con dos cambios definidos por él: el corte de 3 ciclos y los
  requisitos Q11 (el agente propone el CV) y Q12 (brief desde los datos del entrevistador).

> **Qué entra en este ciclo.** Solo los criterios marcados **`· C1`**. Los de C2 y C3
> quedan escritos y numerados —**no se borran**— porque son el contrato de los ciclos
> siguientes y porque G2 necesita ver que ningún criterio del spec se perdió.
>
> **Cobertura de los 14 criterios del spec (§8):**
> en este ciclo entran **ACC-02, ACC-03, ACC-04, ACC-13 y ACC-14**.
> Diferidos: ACC-01, ACC-05..ACC-08 → Ciclo 2 · ACC-09..ACC-12 → Ciclo 3.
> Los 14 están cubiertos abajo: ninguno se perdió en el corte.

## Clases y cómo se verifica cada una

| Clase | Verifica | Observable |
|---|---|---|
| `existencia` | que el elemento está | `document.querySelector('#pipeline') !== null` |
| `comportamiento` | que hace lo que debe | `POST /api/offers/extract` → `200` y `extraction_status` ∈ {exitosa, parcial, fallida} |
| `forma` | cómo se ve / se dispone | `getBoundingClientRect()` con la tolerancia medida (M-1..M-4) |

---

# Ciclo 1 — MVP: cargar oferta + pipeline

## HU-1 · C1 — Acceso de un solo usuario

**Como** dueño de mis datos **quiero** entrar con mi propia credencial y que nadie más
pueda **para** publicar la app en una URL sin exponerla.

- **C-01** · `existencia` · `· C1`
  CUANDO un visitante abre la app sin sesión EL SISTEMA DEBE mostrar el formulario `#login`
- **C-02** · `comportamiento` · `· C1` · `[ACC-13]`
  SI se pide cualquier `/api/*` distinto de `POST /api/auth/login` sin sesión válida
  ENTONCES EL SISTEMA DEBE responder `401` y NO DEBE ejecutar ninguna consulta contra D1
- **C-03** · `comportamiento` · `· C1` · `[ACC-13]`
  CUANDO el login falla EL SISTEMA DEBE responder un error **genérico**, sin revelar si
  el email existe ni distinguirlo de una contraseña incorrecta
- **C-04** · `comportamiento` · `· C1` · `[ACC-14]`
  CUANDO ocurren 5 intentos fallidos desde la misma IP en 15 minutos EL SISTEMA DEBE
  rechazar el 6º intento con `429` **sin evaluar la contraseña**
- **C-05** · `comportamiento` · `· C1`
  CUANDO el login es correcto EL SISTEMA DEBE emitir una cookie `HttpOnly; Secure;
  SameSite=Strict`, y `POST /api/auth/logout` DEBE invalidar esa sesión
- **C-06** · `comportamiento` · `· C1`
  SI la cookie de sesión tiene firma inválida o venció (>30 días) ENTONCES EL SISTEMA
  DEBE responder `401` y DEBE emitir la cookie borrada

## HU-2 · C1 — Cargar una oferta (link o texto)

**Como** usuario **quiero** pegar el link o el texto de una oferta y que la app me saque
los campos **para** no copiarlos a mano.

- **C-07** · `existencia` · `· C1`
  CUANDO el usuario abre «Nueva oferta» EL SISTEMA DEBE mostrar el contenedor `#nueva-oferta`
- **C-08** · `comportamiento` · `· C1` · `[ACC-02]`
  CUANDO el usuario guarda el **texto** de una oferta EL SISTEMA DEBE crear la fila de
  `job_offers`, DEBE crear una postulación en estado `borrador` ligada a ella, y los
  campos `titulo`/`empresa` DEBEN quedar visibles y editables
- **C-09** · `comportamiento` · `· C1` · `[ACC-02]`
  CUANDO el usuario pega una **URL** EL SISTEMA DEBE descargarla server-side, reducir el
  HTML a texto y extraer sobre ese texto — y el resultado DEBE ser indistinguible en la
  UI del camino de texto pegado
- **C-10** · `comportamiento` · `· C1` · `[ACC-03]`
  SI la extracción devuelve el JSON sin `salario` ni `beneficios` ENTONCES EL SISTEMA
  DEBE guardar `extraction_status = 'parcial'` y DEBE listar esos campos en
  `campos_faltantes_json`
- **C-11** · `comportamiento` · `· C1` · `[ACC-04]`
  SI el JSON no valida tras **1 reintento** (que incluye el error de validación en el
  prompt) ENTONCES EL SISTEMA DEBE guardar `extraction_status = 'fallida'`, DEBE
  conservar `raw_text` y `extraction_error`, y la pantalla DEBE permitir completar los
  campos a mano
- **C-12** · `comportamiento` · `· C1` · `[ACC-04]`
  SI la descarga de la URL falla, está bloqueada o supera 500 KB ENTONCES EL SISTEMA
  DEBE responder un error explícito que ofrece el camino de pegar texto, **sin** crear
  la oferta
- **C-13** · `comportamiento` · `· C1` · `[PO]`
  CUANDO el texto a extraer supera ~15.000 caracteres EL SISTEMA DEBE truncarlo del
  final antes de llamar al LLM y DEBE quedar registrado que hubo truncado

## HU-3 · C1 — Revisar y editar la oferta extraída

- **C-14** · `existencia` · `· C1`
  CUANDO el usuario abre el detalle de una oferta EL SISTEMA DEBE mostrar la pantalla
  con los campos extraídos
- **C-15** · `comportamiento` · `· C1`
  CUANDO el usuario edita a mano los campos de la oferta EL SISTEMA DEBE guardarlos
  **aunque** `extraction_status` sea `fallida` o `parcial`
- **C-16** · `comportamiento` · `· C1`
  MIENTRAS `extraction_status` es `parcial` o `fallida` EL SISTEMA DEBE resaltar
  visualmente los campos listados en `campos_faltantes_json`
- **C-17** · `comportamiento` · `· C1`
  CUANDO el usuario abre el detalle de la oferta EL SISTEMA DEBE permitir ver el
  `raw_text` original y el `source_url` si existe

## HU-4 · C1 — Ver el pipeline

**Como** usuario **quiero** ver todas mis postulaciones agrupadas por estado **para**
saber dónde está cada proceso sin buscar.

- **C-18** · `existencia` · `· C1`
  CUANDO el usuario entra autenticado EL SISTEMA DEBE mostrar el contenedor `#pipeline`
- **C-19** · `comportamiento` · `· C1`
  CUANDO el pipeline se renderiza EL SISTEMA DEBE agrupar las postulaciones por `status`
  y DEBE mostrar el contador de **cada uno de los 7 estados**, incluidos los que están
  en cero
- **C-20** · `comportamiento` · `· C1`
  CUANDO se crea una postulación nueva EL SISTEMA DEBE aparecer en el pipeline en la
  columna de `borrador` **sin recargar la página**
- **C-21** · `comportamiento` · `· C1`
  CUANDO hay entrevistas con `scheduled_at` futuro EL SISTEMA DEBE listarlas ordenadas
  por fecha ascendente *(en este ciclo la lista se muestra vacía: ninguna postulación
  pasa de `borrador`, pero el bloque existe y se mide)*
- **C-22** · `forma` · `· C1` · `[PO]`
  MIENTRAS el pipeline se muestra con su tablero por estado EL SISTEMA DEBE alinear las
  columnas: mismo `top` ±4px, mismo ancho ±4px y `left` estrictamente creciente
  (medición **M-1**)
- **C-23** · `forma` · `· C1` · `[PO]`
  MIENTRAS la app muestra su layout principal EL SISTEMA DEBE tener la barra lateral de
  navegación en `240px ±6` y el contenido arrancando en `sidebar.right + 24px ±6`
  (medición **M-2**)
- **C-24** · `forma` · `· C1` · `[PO]`
  MIENTRAS el pipeline lista próximas entrevistas EL SISTEMA DEBE alinear la fecha de
  cada fila en la misma columna: `left` ±3px entre filas (medición **M-4**)

---

# Criterios ya definidos para el Ciclo 2 — perfil, CV y carta

> Escritos y numerados ahora para que el corte no los pierda. **No se despachan** en
> este ciclo.

## HU-5 · C2 — Importar mi experiencia desde un `.md`
- **C-25** · `comportamiento` · `[ACC-01]` CUANDO el usuario envía un `.md` a
  `POST /api/profile/import-md` EL SISTEMA DEBE responder el perfil y N experiencias
  detectadas **sin escribir** en `profile` ni en `experiences`
- **C-26** · `comportamiento` · `[ACC-01]` CUANDO el usuario confirma con
  `import-md/apply` EL SISTEMA DEBE crear el perfil y las filas confirmadas, y el
  conteo de `experiences` DEBE crecer **exactamente** en el número enviado
- **C-27** · `comportamiento` · `[ACC-01]` CUANDO importa sobre un perfil que ya tiene
  experiencias EL SISTEMA DEBE **agregar** y NO DEBE modificar ni borrar ninguna fila
  preexistente
- **C-28** · `comportamiento` CUANDO el usuario crea, edita, borra o reordena una
  experiencia EL SISTEMA DEBE persistir el cambio y `GET /api/experiences` DEBE
  devolverla en el orden guardado
- **C-29** · `comportamiento` CUANDO se escribe una experiencia con `tipo` fuera de
  {`laboral`,`proyecto`,`educacion`,`certificacion`} EL SISTEMA DEBE rechazar la
  operación sin tocar la fila

## HU-6 · C2 — CV y carta, con el agente proponiendo
- **C-30** · `comportamiento` · `[ACC-05]` **`[Q11]`** CUANDO el usuario pide preparar
  el CV de una postulación EL SISTEMA DEBE devolver una **propuesta del agente** con
  las experiencias candidatas, su **orden de prioridad** y la razón de cada una —
  **sin** haberlas seleccionado el usuario a mano
- **C-31** · `comportamiento` · `[Q11]` CUANDO el usuario acepta, quita o reordena
  experiencias de la propuesta EL SISTEMA DEBE respetar **su** decisión y no la del
  agente al generar el documento
- **C-32** · `comportamiento` · `[ACC-05]` CUANDO se genera un documento EL SISTEMA
  DEBE insertar una fila en `generated_documents` con `experience_ids_json` =
  exactamente las experiencias incluidas, y el Markdown DEBE contener la estructura de
  la plantilla y esas experiencias **y ninguna otra**
- **C-33** · `comportamiento` · `[ACC-05]` CUANDO se genera un documento EL SISTEMA
  DEBE registrar el `modelo` usado y el `prompt_version` de la plantilla aplicada
- **C-34** · `comportamiento` · `[ACC-06]` CUANDO el usuario edita y guarda un CV que
  era v1 EL SISTEMA DEBE dejar v1 con `es_actual=0`, DEBE insertar v2 con `es_actual=1`
  y `origen='manual'`, y v1 DEBE seguir siendo consultable
- **C-35** · `comportamiento` · `[ACC-06]` CUANDO el usuario restaura v1 EL SISTEMA
  DEBE insertar una **versión nueva** con el contenido de v1 como actual, **sin**
  modificar ni borrar v1 ni v2
- **C-36** · `comportamiento` · `[PO]` Q3 CUANDO se inserta un documento EL SISTEMA
  DEBE garantizar que exista **una sola** fila con `es_actual=1` por
  `(application_id, tipo)` — el índice es parcial **único**
- **C-37** · `comportamiento` · `[PO]` CUANDO se genera el primer CV o carta de una
  postulación en `borrador` EL SISTEMA DEBE moverla a `preparando`
- **C-38** · `forma` · `[PO]` MIENTRAS la app muestra un documento en modo edición EL
  SISTEMA DEBE disponer editor y vista previa **lado a lado** (medición **M-3**)

## HU-7 · C2 — Exportar PDF y marcar «Enviada»
- **C-39** · `comportamiento` · `[ACC-07]` SI la postulación tiene CV vigente pero **no**
  carta vigente ENTONCES EL SISTEMA DEBE rechazar el paso a `enviada` dejándola en su
  estado previo
- **C-40** · `comportamiento` · `[ACC-07]` CUANDO tiene CV **y** carta vigentes EL
  SISTEMA DEBE permitir el paso a `enviada` y DEBE registrar `fecha_enviada`
- **C-41** · `comportamiento` · `[ACC-08]` CUANDO el usuario exporta un PDF EL SISTEMA
  DEBE guardarlo en R2 con la clave
  `applications/{application_id}/documents/{doc_id}_v{version}.pdf` y DEBE registrar
  `pdf_r2_key` en esa versión
- **C-42** · `comportamiento` · `[ACC-08]` SI se pide el PDF sin sesión válida ENTONCES
  EL SISTEMA DEBE responder `401` **sin leer de R2**; con sesión DEBE responder
  `Content-Type: application/pdf`

---

# Criterios ya definidos para el Ciclo 3 — entrevistas y cierre

## HU-8 · C3 — Entrevistas con brief
- **C-43** · `comportamiento` · `[ACC-09]` CUANDO se crea la primera entrevista de una
  postulación en `enviada` EL SISTEMA DEBE moverla a `entrevistas` y asignar
  `secuencia = 1`
- **C-44** · `comportamiento` CUANDO se crean entrevistas sucesivas EL SISTEMA DEBE
  asignar `secuencia` 2, 3, … **sin límite de N** y DEBE rechazar una `secuencia` ya
  usada en esa postulación
- **C-45** · `comportamiento` · `[ACC-10]` CUANDO la entrevista 1 queda `aprobada` EL
  SISTEMA DEBE permitir agendar la 2 con fecha/link y guardar research propio de esa
  entrevista
- **C-46** · `comportamiento` · `[ACC-10]` · **`[Q12]`** CUANDO el usuario entrega los
  **datos del entrevistador** (nombre, rol, y lo que tenga de la empresa) y pide el
  brief EL SISTEMA DEBE devolver un brief anclado a la oferta y al CV vigente, que
  incluya al menos: preguntas probables según el tipo, puntos a destacar mapeados a
  requisitos de la oferta, qué preguntarle al entrevistador y un checklist
- **C-47** · `comportamiento` · `[ACC-11]` CUANDO el usuario confirma el resultado
  `rechazada` de una entrevista EL SISTEMA DEBE mover la postulación a `rechazada` y
  ofrecer el cierre con aprendizajes
- **C-48** · `comportamiento` CUANDO se registra el resultado de una entrevista EL
  SISTEMA DEBE aceptar solo uno de {`pendiente`,`aprobada`,`rechazada`,`sin_respuesta`}
  y DEBE guardar las notas

## HU-9 · C3 — Cerrar con aprendizajes
- **C-49** · `comportamiento` · `[ACC-12]` SI se pide cerrar sin `que_funciono`, sin
  `que_mejorar` y sin gaps y **sin** la casilla `omitir_aprendizajes` ENTONCES EL
  SISTEMA DEBE rechazar el cierre y dejar la postulación abierta
- **C-50** · `comportamiento` · `[ACC-12]` CUANDO se cierra con
  `omitir_aprendizajes = true` EL SISTEMA DEBE cerrar y DEBE registrar la omisión de
  forma explícita, no como campos vacíos
- **C-51** · `comportamiento` CUANDO se cierra el proceso EL SISTEMA DEBE pasar la
  postulación a `cerrada`, registrar `fecha_cierre`, el `resultado` final y guardar
  `status_previo` `[PO] Q2`
- **C-52** · `comportamiento` · `[PO] Q2` CUANDO el usuario «reabre» una postulación
  `cerrada` EL SISTEMA DEBE devolverla a `status_previo` conservando los aprendizajes
- **C-53** · `comportamiento` CUANDO una postulación está `cerrada` EL SISTEMA DEBE
  rechazar cualquier edición que no sea «reabrir»
- **C-54** · `comportamiento` CUANDO se pide `GET /api/learnings` EL SISTEMA DEBE
  devolver los aprendizajes de todas las postulaciones cerradas

---

## Ciclos (el corte)

- **Ciclo 1 (este) — MVP:** HU-1 a HU-4, criterios **C-01..C-24**. El usuario entra,
  pega un link o un texto, revisa y corrige los campos extraídos, y ve la postulación
  en el pipeline.
- **Ciclo 2 — C-25..C-42:** perfil y biblioteca de experiencia, propuesta del agente
  para el CV, versionado, PDF y «Enviada».
- **Ciclo 3 — C-43..C-54:** entrevistas con brief desde los datos del entrevistador,
  cierre con aprendizajes y vista global.

Por qué el Ciclo 1 es una unidad y no un recorte arbitrario: entrega el motor más
riesgoso —**la extracción LLM con validación**— funcionando sobre una URL pública. El
análisis dice que el producto pierde si la extracción obliga a corregir más de lo que
ahorra; eso se prueba **acá**, antes de invertir en las pantallas de documentos.

**Lo que se cobra por cortar así:** el pipeline del Ciclo 1 muestra una máquina de 7
estados que todavía nadie recorre más allá de `borrador`. Se acepta a cambio de ver la
extracción real antes.

## Mockup (cierre de la fase 3)

- **URL:** **https://myinterviews-mockup.mkvs.workers.dev** — Worker solo-assets
  `myinterviews-mockup` (versión `b036bf34-8087-42c1-b169-0ba136dbaf3b`); smoke: `200`,
  `text/html`. Fuente en `docs/mockup/public/index.html`. Cada pantalla lleva su marca de
  ciclo (**C1**/**C2**/**C3**) en la barra lateral; `#pipeline` abre directo una pantalla.
- **Criterios de clase `forma` extraídos:** C-22 (M-1), C-23 (M-2), C-24 (M-4) y C-38
  (M-3, del Ciclo 2). **Entran al Ciclo 1 las mediciones M-1, M-2 y M-4.**

### Mediciones extraídas del mockup

> **Medido sobre el DOM renderizado** (Chrome headless + CDP vía
> `tests/helpers/browser.mjs`), no leído del CSS. Comando:
> `node docs/mockup/medir-forma.mjs` → **14/14 OK**. Los números son los medidos; la
> tolerancia se escribe después de medir.

- **M-1 · Columnas del tablero** → alimenta **C-22**
  Mismo `top` ±4px, mismo ancho ±4px, `left` estrictamente creciente.
  *Medido:* 5 columnas · `top` = 178,1 ×5 · ancho = 82,4 c/u · `left` creciente ✔
- **M-2 · Navegación lateral** → alimenta **C-23**
  Barra lateral `240px ±6`; contenido a `sidebar.right + 24px ±6`.
  *Medido:* ancho = **240,0** · contenido a **24,0** px ✔
- **M-4 · Próximas entrevistas** → alimenta **C-24**
  La fecha de cada fila comparte `left` ±3px.
  *Medido:* 3 filas · `left` = 264,5 / 264,5 / 264,5 ✔
- **M-3 · Editor y vista previa** → alimenta **C-38** *(Ciclo 2)*
  *Medido:* `top` = 183,2 / 183,2 · alto = 779,4 / 779,4 · hueco = **16,0** ✔

**El mockup queda congelado.** Cambiarlo reabre G1.

## Casos borde y de error del Ciclo 1

| Caso | Comportamiento esperado | Criterio |
|---|---|---|
| El LLM devuelve JSON inválido dos veces | `fallida`, `raw_text` y `extraction_error` guardados; se completa a mano | C-11 |
| La URL es un portal que bloquea el fetch | error explícito que ofrece pegar texto; **no** se crea oferta | C-12 |
| La URL devuelve 3 MB de HTML | se corta en 500 KB y se reduce a texto | C-12 |
| La oferta trae 200 KB de texto | se trunca del final a ~15k y queda registrado | C-13 |
| La extracción vuelve sin `salario` | `parcial`, con `salario` listado en faltantes y resaltado | C-10, C-16 |
| Sesión vencida en medio del flujo | `401` en la API y vuelta a `#login` | C-06 |
| 6º intento fallido de login | `429` sin evaluar la contraseña | C-04 |
| Pipeline sin ninguna postulación | los 7 contadores en cero, sin errores de render | C-19 |

## Definición de "terminado" del Ciclo 1

- [ ] Los criterios **C-01..C-24** tienen test que los **nombra** (`check-coverage.sh` sin huecos)
- [ ] La suite falla primero **por aserción** (RED reproducido, no leído de un `.txt`)
- [ ] El sello de tests queda **INTACTO** tras la implementación
- [ ] **Una URL pública** con el Ciclo 1 desplegado, con smoke ejecutado contra esa URL
- [ ] Las mediciones de `forma` **M-1, M-2 y M-4** verificadas con `getBoundingClientRect()` real
- [ ] Los **casos ocultos** del ciclo ejecutados tras el commit final del Coder
- [ ] El tablero publicado, con `commit_sha` = HEAD

## Fuera de esta iteración

- Los criterios **C-25..C-54** (Ciclos 2 y 3) — definidos arriba, no despachados.
- Todo el anti-alcance confirmado en `02-ANALISIS.md` §Anti-alcance.

---

## Aprobación

- [x] **Aprobado por el usuario** — 2026-10-10 («me gusta el mockup» · «Desarrolla el C1»)
- [x] Cambios solicitados en la primera vuelta de G1, todos incorporados:
  1. Las ofertas entran **como link pegado o como texto** → C-08, C-09, C-12
  2. Al preparar el CV el usuario **jala de su experiencia** lo relevante y **un agente
     le hace propuestas** con prioridad → C-30, C-31
  3. Para la entrevista **entrega los datos del entrevistador** y la app prepara un
     **brief** → C-46
  4. **Ciclo 1 = MVP hasta el pipeline y cargar oferta** → el corte de §Ciclos

---

**Gate G1 ⭐ (humano):** cada criterio está en EARS, declara su clase y se puede
convertir en un test; los de clase `forma` traen su medición. **Aprobado.**
