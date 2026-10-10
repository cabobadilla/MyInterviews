# ADR-001 — Un solo Worker con `main` + `assets`, no Pages

- **Fecha:** 2026-10-10
- **Estado:** aceptado
- **Decisor:** Arquitecto (Hermes)

## Contexto

El spec §3.1 fija Front en Cloudflare Pages y API en un Worker, con D1. El harness (GATES.md, G2) exige que el Arquitecto **declare la forma del Worker**. La app es single-user, con una sola pantalla de datos y sin CDN propio por delante.

## Decisión

**Un único Worker con `main` (Hono) + `assets`** que sirve la API y la SPA compilada desde el mismo origen.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Front en **Cloudflare Pages** + Worker aparte (lo que dice el spec §3.1) | Dos targets de deploy, dos URLs, CORS que configurar y una sesión con cookie cross-origin (`SameSite=Strict` deja de ser gratis). Para un usuario y una app, es maquinaria sin dueño. |
| **Worker solo-assets** + API en otro Worker | Igual que la anterior, más un salto de red entre ambos. Además el primer Worker no tendría `main`, así que no podría aplicar el middleware de sesión a los assets. |
| Todo estático **sin** API (el LLM desde el navegador) | La clave de OpenRouter quedaría expuesta en el front. Descartado de plano. |

## Consecuencias

**Positivas:**
- Un origen: la sesión funciona con `SameSite=Strict` sin CORS.
- Un solo deploy y una sola URL que entregarle al PO.
- La SPA y la API comparten el mismo ciclo de vida y el mismo smoke.

**Negativas / costo asumido:**
- Se **desvía del spec §3.1** (que decía Pages). Queda declarado acá y en `03`/`04`, no escondido.
- La SPA compilada entra como assets dentro del Worker: conviene vigilar el tamaño del bundle (los assets tienen límite por archivo).

**Qué se vuelve difícil después de esto:**
- Volver a Pages después obliga a reintroducir CORS y a separar el deploy: el costo crece, no baja.
