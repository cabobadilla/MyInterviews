# 01 — Idea

- **Proyecto:** MyInterviews
- **Fecha:** 2026-10-10
- **Origen:** mensaje de Telegram + documento `SPEC-v3-CONFIRMADA.md` (spec adjunto, versión 3 CONFIRMADA con el usuario el 2026-10-10)

## Requerimiento (verbatim)

> Transcripción literal, sin editar.

Mensaje del usuario (2026-10-10):

    necesito crear un nuevo proyecto, llamado MyInterviews crea el repo y jala el
    Hermes Harnes para iniciar un nuevo proyecto desde vero

    Tengo este spec para el proyecto, revisalo y usalo para contruir el producto
    (contiene muchas definiciones, considera todo)

Adjunto: `Spec — TrackingInterviews web app de seguimiento de postulaciones.md`
(guardado tal cual en `docs/spec/SPEC-v3-CONFIRMADA.md`, 10 secciones).

**Nota del PO sobre el nombre (se dice, no se decide):** el spec se titula
*TrackingInterviews* y declara como repo previsto `cabobadilla/TrackingInterviews`;
el usuario pidió el proyecto como **MyInterviews**. Se construye en este repo
(`cabobadilla/MyInterviews`). `cabobadilla/TrackingInterviews` (creado hoy, solo
README) queda **intacto y sin usar**, por decisión explícita del usuario.

## Respuestas a las tres preguntas

> Una sola ronda. El usuario delegó ("considera todo") y no respondió P1–P3, así que
> van **supuestos escritos del PO**, marcados como tales, para que se corrijan en G1.
> P3 sí está respondida por el usuario dentro del spec (§1 no-goals y §9 decisiones).

**P1 — ¿Quién lo usa, y en qué momento concreto?**
> **Supuesto del PO.** Un único usuario: el propio Christian (no multiusuario, §1).
> El momento concreto es una sesión de búsqueda de trabajo activa: cuando aparece una
> oferta (pega la URL en el momento), cuando arma la postulación (esa misma noche,
> fuera del horario de la empresa) y cuando vuelve de una entrevista (registra el
> resultado el mismo día, mientras lo recuerda). La app se usa **poco y en ráfagas**:
> lo que se rompe si no existe es el hilo entre una postulación y la siguiente.
> **Si es falso:** si es multiusuario o si el uso es intensivo/diario, cambia el diseño
> de auth (§7) y el modelo de datos entero.

**P2 — ¿Cómo sabremos que funcionó?**
> **Supuesto del PO.** Dos observables, en orden:
> 1. **Reemplazo del hábito actual:** el usuario deja de mantener el seguimiento en su
>    método previo (planilla/notas) durante ≥4 semanas de búsqueda activa.
> 2. **Ciclo completo real:** al menos **una** postulación recorre entera la máquina de
>    estados (`borrador → … → cerrada`) con aprendizajes registrados al cierre.
> La métrica de §4.5 (<US$2/mes a 50 postulaciones) es de coste, no de éxito: no cuenta.
> **Si es falso:** si el usuario sigue llevando el seguimiento aparte, el producto
> funciona pero no gana.

**P3 — ¿Qué haría que esto sea un fracaso? ¿Qué queda explícitamente afuera?**
> **Respondido por el usuario** (§1 no-goals, §9, ambos confirmados): multiusuario/
> roles/compartir datos · integraciones de calendario y correo, recordatorios
> automáticos · métricas globales (funnel, tiempos por etapa) · scraping de portales,
> alertas, auto-postulación · app móvil nativa · negociación de oferta y onboarding
> posterior a aceptar · traducción automática · scoring automático de match.
> **Fracaso en términos del usuario:** que la extracción de la oferta o el texto
> generado por LLM obligue a revisar y corregir más de lo que ahorra. El spec ya lo
> mitiga (§10): validación Zod + 1 reintento + edición manual siempre disponible y
> "la extracción nunca bloquea el flujo".

## Contexto adicional

- El spec **no es una idea suelta**: viene con esquema D1 completo (§3.3), superficie
  de API (§6), 9 pantallas (§5) y 14 criterios de aceptación (§8). Es material de
  fases 2–4, no de fase 1. El trabajo del ciclo es **hacerlo verificable**, no
  re-diseñarlo.
- Herencia declarada (§3.1): patrones de `AgenticCMS` (Workers Hono + D1 + bindings,
  y su `middleware/auth.ts` como referencia) y `Bridgelist` (Pages, single-user, UI en
  español).
- La decisión LLM cambió en v3: OpenRouter con modelos económicos tipo DeepSeek,
  Anthropic directo descartado por coste. Despliegue sigue en Cloudflare.
- **Queda un pendiente declarado por el usuario** (§10): el contenido final de las 2
  plantillas de CV. Mientras tanto se implementan con estructura base razonable, como
  archivos editables del repo.

## Lo que explícitamente se pidió

- [x] Crear el repo del proyecto y arrancarlo con el HermesHarness
- [x] Tomar el spec v3 CONFIRMADA como fuente del requerimiento
- [x] Considerar todas las definiciones que trae el spec
- [ ] *(pendiente del usuario, declarado en el propio spec)* contenido final de `cv_tecnica.md` y `cv_ejecutiva.md`

---

**Gate G0:** existe esta idea, sin interpretación agregada; **las tres preguntas
están formuladas y cada una tiene respuesta del usuario o supuesto escrito del PO.**
