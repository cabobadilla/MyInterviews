# ADR-005 — La forma y la existencia se miden sobre fixtures que montan los componentes reales

- **Fecha:** 2026-10-10
- **Estado:** aceptado
- **Decisor:** Arquitecto (Hermes)

## Contexto

C-22, C-23 y C-24 son de clase `forma` y hay que medirlas con `getBoundingClientRect()` sobre el DOM renderizado. El helper sellado `tests/helpers/browser.mjs` **sirve un archivo HTML**, no una URL: no puede apuntar a un dev server con SPA y datos.

## Decisión

Los casos de **`forma`** y **`existencia`** se miden con `browser.mjs` sobre
**fixtures por pantalla** en `tests/fixtures/` (`login.html`, `pipeline.html`,
`nueva-oferta.html`, `detalle-oferta.html`), que **montan los componentes reales de la
SPA con datos fijos**.

**Por qué también `existencia` y no solo `forma`:** una SPA renderiza en el cliente. El
DOM no existe hasta que corre el JS, así que «el elemento está» **no se puede verificar
leyendo el HTML del Worker ni el `index.html` construido** — hay que renderizarlo. Y
`browser.mjs` sirve un archivo, no una URL, así que tampoco puede apuntar al dev server.
Sin fixtures, un criterio de `existencia` sobre una SPA no tiene forma de verificarse, y
el Coder lo terminaría resolviendo con un `includes()` sobre el HTML — justo lo que el
harness prohíbe por tautológico.

Los fixtures son **entradas extra de Vite** (cada uno un HTML con su script): se
construyen con el resto de la SPA, así que montan el mismo código y el mismo CSS.

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
- Hay **un fixture por pantalla** que mantener: si un componente cambia, su fixture tiene que montarlo igual. Se mitiga haciendo que el fixture **importe** el componente, en vez de copiar su HTML.
- No mide el layout con datos reales ni con sesión iniciada: eso lo cubre el smoke.

**Qué se vuelve difícil después de esto:**
- Un fixture que se desincronice del componente mediría una app que ya no existe. Es el riesgo asumido de este ADR y hay que vigilarlo.
