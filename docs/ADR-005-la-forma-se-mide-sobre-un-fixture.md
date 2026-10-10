# ADR-005 — La forma se mide sobre un fixture que monta los componentes reales

- **Fecha:** 2026-10-10
- **Estado:** aceptado
- **Decisor:** Arquitecto (Hermes)

## Contexto

C-22, C-23 y C-24 son de clase `forma` y hay que medirlas con `getBoundingClientRect()` sobre el DOM renderizado. El helper sellado `tests/helpers/browser.mjs` **sirve un archivo HTML**, no una URL: no puede apuntar a un dev server con SPA y datos.

## Decisión

Los casos de forma se miden con `browser.mjs` sobre **`tests/fixtures/pipeline.html`**, un fixture que **monta los componentes reales de la SPA con datos fijos**.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Medir el dev server con Chrome apuntando a `http://127.0.0.1:8787` | Requiere un cliente CDP propio: el helper sellado no lo soporta y no se edita. Duplicar el helper es peor que un fixture. |
| Medir solo en el smoke, contra la URL desplegada | La medición llegaría **después** del deploy, cuando ya nadie puede corregirla sin un ciclo nuevo. Y el Coder no tendría forma de saber si cumple. |
| Capturar un PNG y mirarlo | Es lo que el harness prohíbe: una captura se interpreta, no se mide. 'Se ve alineado' no es una medición. |

## Consecuencias

**Positivas:**
- Se mide el **CSS real** de los componentes que se envían, sin depender de un deploy.
- El Coder puede correrlo en cada tarea, así que el criterio de forma es corregible antes de integrar.
- El mismo helper sellado, sin editarlo.

**Negativas / costo asumido:**
- El fixture es un archivo más que mantener: si los componentes cambian de forma, el fixture tiene que montarlos igual. Se mitiga montando las **mismas** piezas, no una copia del HTML.
- No mide el layout con datos reales ni con sesión iniciada: eso lo cubre el smoke.

**Qué se vuelve difícil después de esto:**
- Un fixture que se desincronice del componente mediría una app que ya no existe. Es el riesgo asumido de este ADR y hay que vigilarlo.
