# ADR-004 — Los tests corren contra `wrangler dev` real, no contra mocks

- **Fecha:** 2026-10-10
- **Estado:** aceptado
- **Decisor:** Arquitecto (Hermes)

## Contexto

La matriz tiene 21 casos de comportamiento que tocan HTTP, D1 y una sesión con cookie. Hay que elegir dónde corren. El entorno local de `wrangler dev` levanta el Worker con **D1 local** y **sin cuenta ni credenciales** (ROLES.md), y el harness ya probó este patrón en Hornada (sus casos ocultos son tests HTTP contra `127.0.0.1:8787`).

## Decisión

**La suite y los casos ocultos corren contra un `wrangler dev` local en `127.0.0.1:8787`**, con D1 local. Los casos de forma corren aparte, contra un fixture (ADR-005).

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Inyección de repos falsos y llamar `app.request()` en Node | Rápido y sin proceso externo, pero **no prueba D1 ni el binding**: la capa donde viven los errores reales queda sin ejercer. El RED sería verde y la producción podría fallar. |
| Correr la suite contra la URL desplegada | Depende de la red, gasta cuota y **cambia el veredicto según el día**. Además el Coder no despliega: no tendría contra qué correr. |
| `@cloudflare/vitest-pool-workers` | Otra cadena de dependencias para una suite que `node:test` ya cubre, y obliga a otro runner que el resto del harness no usa. |

## Consecuencias

**Positivas:**
- La suite ejerce el artefacto de verdad: bindings, D1, cookies, status codes.
- El Coder no necesita credenciales para probar.
- El mismo patrón que los casos ocultos, así que no hay dos maneras de correr las cosas.

**Negativas / costo asumido:**
- La suite **necesita el dev server levantado**: es un requisito de entorno que el contrato de cada tarea declara explícitamente.
- El emulador local **no aplica los límites del plan**: un verde local no garantiza el edge. Por eso el smoke contra la URL real sigue siendo obligatorio.

**Qué se vuelve difícil después de esto:**
- Los tests son de integración, no unitarios: más lentos y con más superficie. Si alguna vez hace falta aislar una función pura, se agrega un test unitario **además**, no en lugar de.
