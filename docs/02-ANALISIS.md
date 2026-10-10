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
| Q7 | ¿Se corta el spec en etapas? | **Sí.** Ver «Alcance propuesto». Ocho pantallas y siete estados en un solo ciclo es complejidad combinada sin valor visible hasta el final. | `PROCESS.md` §4 |
| Q8 | ¿La segunda plantilla de CV entra en la Etapa 1? | **No.** Es una *variante* del mismo mecanismo; el mecanismo se prueba con una. | `LEARNINGS` corte en etapas |
| Q9 | ¿El «prep» de entrevista por LLM entra en la Etapa 1? | **No.** Mismo motivo: es una segunda generación LLM sobre un mecanismo que ya se probó con CV/carta. | idem Q8 |
| Q10 | ¿Hay ambigüedad en el estado `preparando`? | Menor: se dispara «al generar o editar el primer CV o carta». **Decisión: cualquier inserción de `generated_documents` con `origen ∈ {llm, manual}`.** | spec §2.1 |

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
6. **El usuario no necesita el panel de aprendizajes global en la Etapa 1.** Ve los
   aprendizajes dentro de cada postulación cerrada. *(propuesta de corte, Q7)*

## Alcance propuesto

**Etapa 1 — el mecanismo completo, con las mínimas variantes.** Una búsqueda de trabajo
real puede correrse de punta a punta en la app:

- Perfil + biblioteca de experiencia (CRUD de los 4 tipos) e **importación desde `.md`** con revisión y confirmación.
- Registrar oferta por **URL o texto** con extracción LLM → JSON editable, estados `exitosa`/`parcial`/`fallida` que **nunca bloquean**.
- Generar **CV (1 plantilla: `cv_tecnica`) y carta** anclados a las experiencias seleccionadas, con **versionado** (v1..vN, restaurar) y edición manual.
- **Exportar PDF** a R2 (solo con sesión) y marcar **«Enviada»** (exige CV y carta vigentes).
- Los **7 estados** de la postulación con transiciones y cierre con aprendizajes.
- **Entrevistas 1..N** como registro: tipo, fecha, lugar/link, entrevistadores, research, resultado. *(sin «generar prep» por LLM)*
- Pipeline con contadores por estado y próximas entrevistas.

**Diferido a la Etapa 2 — las variantes y los segundos usos:**

- 2ª plantilla de CV (`cv_ejecutiva`) y contenido final de las 2 plantillas.
- «Generar prep» de entrevista por LLM con streaming SSE.
- Vista global de aprendizajes filtrable (para detectar patrones entre procesos).
- Streaming SSE en la generación de documentos (en Etapa 1: respuesta completa).
- Rotación de credenciales por UI.

Por qué se puede diferir sin romper la Etapa 1: cada diferido es **una variante de un
mecanismo que la Etapa 1 ya entrega completo** (una plantilla prueba el motor de
plantillas; CV/carta prueban el motor LLM; los aprendizajes por postulación prueban el
registro; la vista global solo lo agrega). Ajustar plantilla sigue siendo editar un
archivo del repo: **no hay deuda de código** por no implementar la segunda.

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
