# 02 — Análisis

- **Proyecto:** MyInterviews
- **Fecha:** 2026-10-10
- **Dueño:** PO (contexto principal)

## El problema en una frase

Cuando Christian busca trabajo en paralelo en varias ofertas, **el hilo se pierde**:
qué mandó a cada empresa, con qué CV, qué le preguntaron, en qué quedó — y no hay un
lugar donde eso se acumule para la próxima búsqueda.

## ¿Quién lo sufre y con qué frecuencia?

Una sola persona, en ráfagas. Una búsqueda activa son **3–8 procesos abiertos** a la
vez durante 2–4 meses, y después **meses sin tocarlo**. El dolor no está en ninguna
tarea puntual: está en retomar el contexto de un proceso después de una semana, y en
que la experiencia ya escrita (logros, métricas) se reescribe a mano en cada CV.

## ¿Qué pasa si no hacemos nada?

**Cero.** El usuario ya tiene un método (planilla/notas) y funciona lo suficiente. Esto
no es un proyecto de necesidad: es de **calidad de búsqueda**. Consecuencia directa para
el diseño: **el producto pierde contra no usarlo si la generación de documentos obliga a
corregir más de lo que ahorra.** De ahí que §10 tenga razón al poner la revisión manual
como camino permanente y no como parche.

## Preguntas abiertas — resueltas

> El PO **decide con benchmark rápido** cuando puede y deja el supuesto escrito. Solo
> sube al usuario lo caro de revertir.

| # | Pregunta | Resolución | Cómo |
|---|---|---|---|
| Q1 | ¿El spec es implementable tal cual? | **Sí, con 3 huecos** (abajo). No se re-diseña. | lectura completa del spec §3–§8 |
| Q2 | ¿Hueco 1 — «reabrir» una postulación `cerrada`? | **Gap real de esquema.** §2.1 exige volver al «estado previo» pero `applications` (§3.3) no tiene dónde guardarlo. **Decisión: columna `status_previo`**, escrita al cerrar. | lectura del DDL |
| Q3 | ¿Hueco 2 — dos versiones «actuales» a la vez? | **Gap real de integridad.** `idx_docs_actual` es **no único**; dos filas con `es_actual=1` para el mismo `(application_id, tipo)` son posibles. **Decisión: índice parcial ÚNICO.** | lectura del DDL |
| Q4 | ¿Hueco 3 — rate limit del login sin almacén? | D1 en cada intento es escritura por request; §7 no dice dónde vive. **Decisión: es decisión de Arquitecto (G2), no de alcance.** Se anota como contrato a resolver. | spec §7 |
| Q5 | ¿Una oferta puede tener >1 postulación? | **Sí** (§3.3 lo declara: reintentos). Es N:1 y el front debe poder crear una segunda. | spec §3.3 |
| Q6 | ¿PBKDF2 600k iteraciones cabe en un Worker? | Riesgo real de límite de CPU. **Decisión: el número es parametrizable**; se mide en el ciclo y se ajusta por binding, sin cambiar el contrato de auth. | spec §7 |
| Q7 | ¿Se corta el spec en etapas? | **Sí, y el corte lo fijó el usuario en G1** (2026-10-10): *«un ciclo 1 de MVP hasta el pipeline y cargar oferta, luego avanzamos»*. Tres ciclos. | decisión del usuario |
| Q8 | ¿La 2ª plantilla de CV y el resto de la generación de documentos? | **Ciclo 2.** No es una decisión nueva: es consecuencia directa de que el Ciclo 1 termina en el pipeline. | Q7 |
| Q9 | ¿El «prep» de entrevista por LLM? | **Ciclo 3.** Igual: fuera del Ciclo 1 por el corte de Q7. | Q7 |
| Q10 | ¿Hay ambigüedad en el estado `preparando`? | Menor: se dispara «al generar o editar el primer CV o carta». **Decisión: cualquier inserción de `generated_documents` con `origen ∈ {llm, manual}`.** *(Ciclo 2: en el Ciclo 1 ninguna postulación pasa de `borrador`.)* | spec §2.1 |
| Q11 | ¿El CV lo arma el usuario o un agente? | **El agente propone, el usuario decide** (pedido explícito del usuario). El flujo del spec (§2.3, «el usuario marca qué experiencias incluir») deja de ser el camino principal: el LLM **propone** qué experiencias incluir y **con qué prioridad**, y el usuario acepta, saca o reordena. | feedback G1 |
| Q12 | ¿De dónde sale el brief de la entrevista? | El usuario **entrega los datos del entrevistador** (nombre, rol, y lo que tenga de la empresa) y la app devuelve un **brief**. Research manual y datos del entrevistador se suman como contexto. | feedback G1 |

Q2 y Q3 **no** son escaladas: son defectos que se corrigen con un `ALTER TABLE` y no
cambian la propuesta de valor. Se resuelven acá y se confirman en G2.

## Supuestos

1. **Un solo usuario.** El login no tiene registro ni recuperación de contraseña: las
   credenciales las define el usuario en los Secrets. Si hay que rotarlas, es
   redeploy, no pantalla. *(spec §1, §7)*
2. **El usuario está cómodo revisando JSON editado a mano.** La app no promete
   extracción perfecta: promete no bloquear. *(spec §4.1)*
3. **Los datos son del usuario y suyos son los costes.** El presupuesto <US$2/mes se
   acepta; no hay techo duro implementado en v1. *(spec §4.5)*
4. **La experiencia previa del usuario está en Markdown.** Si su CV fuente fuera
   PDF/Word, el Flujo 0 no aplica y hay que pegar texto a mano. *(spec §1, fuera de alcance: PDF/Word → v2)*
5. **Los modelos siguen siendo baratos y con nombres estables.** Los slugs de OpenRouter
   se verifican al implementar; el modelo es variable de entorno, no constante de código.
   *(spec §4)*
6. **El usuario no necesita la vista global de aprendizajes en el Ciclo 1.** Ve los
   aprendizajes dentro de cada postulación cerrada. *(decisión de corte, Q7)*

## Alcance propuesto

**Tres ciclos. El corte lo fijó el usuario en G1** (2026-10-10): *«un ciclo 1 de MVP
hasta el pipeline y cargar oferta, luego avanzamos»*.

**Ciclo 1 (este ciclo) — el camino mínimo con valor real: cargar oferta → pipeline.**
El usuario puede entrar, pegar una oferta (link o texto), ver los campos extraídos y
editarlos, y verla aparecer en el pipeline agrupada por estado.

- Login del único usuario (la app se publica: sin auth no hay URL que entregar).
- **Cargar oferta por URL o texto** con extracción LLM → JSON editable; estados
  `exitosa`/`parcial`/`fallida` que **nunca bloquean**.
- Detalle de la oferta: campos editables, `campos_faltantes` resaltados, texto original.
- Nace la **postulación en `borrador`** ligada a la oferta.
- **Pipeline** con los contadores de los 7 estados y el tablero por estado; lista de
  próximas entrevistas (vacía en este ciclo, pero el bloque existe y está medido).

**Ciclo 2 — perfil, CV y carta.** Importación desde `.md`, biblioteca de experiencia,
y la generación de documentos con el cambio que pidió el usuario (**Q11**): el **agente
propone** qué experiencias incluir y con qué prioridad, y el usuario acepta, saca o
reordena. Incluye versionado, edición manual, PDF, «Enviada» (que exige CV **y** carta
vigentes) y el paso a `preparando`.

**Ciclo 3 — entrevistas y cierre.** Entrevistas 1..N con research, y el **brief** que
pidió el usuario (**Q12**): se entregan los datos del entrevistador y la app devuelve un
brief anclado a la oferta y al CV vigente. Más el cierre con aprendizajes y la vista
global filtrable.

Por qué el Ciclo 1 es una unidad honesta y no un recorte arbitrario: entrega el motor
más riesgoso del producto —**la extracción LLM con validación y el estado que la
acompaña**— funcionando sobre una URL pública, que es exactamente lo que permite juzgar
si el resto vale la pena. El coste de inacción del análisis dice que el producto pierde
si la extracción obliga a corregir más de lo que ahorra: eso se prueba acá, antes de
invertir en 8 pantallas.

Lo que **se cobra** por cortar así: el pipeline del Ciclo 1 muestra una máquina de
estados que todavía nadie recorre más allá de `borrador`. Se acepta a cambio de ver la
extracción real antes.

## Anti-alcance (lo que NO entra)

**Confirmado por el usuario** (spec §1 no-goals + §9): multiusuario/roles/compartir ·
integraciones de calendario y correo, recordatorios automáticos · métricas globales
(funnel, tiempos por etapa) · scraping de portales, alertas, auto-postulación · app
móvil nativa · negociación de oferta y onboarding posterior a aceptar · traducción
automática de documentos · scoring automático de match candidato–oferta.

**Añadido por el PO (no pedido, y se dice):**

- **Recuperación de contraseña, registro, 2º factor.** Single-user por decisión: si se
  pierde la contraseña, se rota por Secret.
- **Tests con navegador real en la Etapa 1.** La forma se mide con
  `getBoundingClientRect()`; no se monta una granja de E2E.
- **Migraciones hacia atrás.** D1 avanza con `wrangler d1 migrations apply`; no hay
  *down*.
- **Multi-idioma de UI.** UI en español; solo el idioma del *documento* es parametrizable.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Extracción LLM mediocre → más corrección que ahorro | Mata el producto (es el criterio de éxito real) | §4.1 Zod + 1 reintento + edición manual; **y el usuario decide en G1 si la calidad se prueba antes de seguir** |
| PBKDF2 600k iter. excede el CPU del plan | Login caído | Q6: parámetro por binding, medido en el ciclo |
| PDF por diálogo de impresión del navegador | Fidelidad variable | §10: CSS `@media print` probado; Browser Rendering queda para v2 |
| Datos personales (CV) viajan a OpenRouter | Privacidad | §7: revisar retención/entrenamiento en la cuenta; no se envían otras postulaciones |
| D1 y `raw_text` de 500 KB | Límite de fila | cap 500 KB + truncado a ~15k para el prompt |
| Ocho pantallas en un solo ciclo | Entrega tardía, sin valor hasta el final | **Corte en etapas (Q7)** — decisión ya tomada, no diferida |
| `es_actual` no único (Q3) | Dos CV «vigentes» → documento ambiguo | Índice parcial único (corrección de esquema) |
| «Reabrir» sin estado previo (Q2) | El estado se pierde | Columna `status_previo` |

## Veredicto

- [x] **Vale la pena** — con una condición.
- [ ] No vale la pena → razón:
- [ ] Todavía no → qué falta:

**Razón:** el coste de inacción es cero y el producto compite contra una planilla que ya
funciona, así que el proyecto solo se justifica si **la generación de documentos ahorra
tiempo neto**. El spec ya está diseñado para eso y el alcance de Etapa 1 es una búsqueda
completa de punta a punta. **La condición:** en G1 el usuario debe poder decir «generá el
CV de una oferta real y mostrame el resultado» antes de que se invierta en las 8
pantallas — si la salida del LLM no le sirve con correcciones menores, el resto del
producto no lo salva.

---

**Gate G1a:** hay ≥1 pregunta abierta o supuesto declarado, hay anti-alcance, hay
veredicto con razón. ✔ (10 preguntas resueltas · 6 supuestos · 12 anti-alcance · 8 riesgos)
