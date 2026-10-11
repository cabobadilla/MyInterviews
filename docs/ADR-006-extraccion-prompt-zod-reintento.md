# ADR-006 — Extracción: prompt + Zod + 1 reintento; `response_format` solo si el modelo lo soporta

- **Fecha:** 2026-10-10
- **Estado:** aceptado
- **Decisor:** Arquitecto (Hermes)

## Contexto

El spec §4 fija OpenRouter con modelos económicos configurables por variable. El soporte de **salida estructurada (`json_schema`) varía según el modelo** de la pasarela, y el modelo se elige por entorno, no en el código.

## Decisión

El gateway intenta `response_format` **solo si el modelo declarado lo soporta**; en todos los casos
**valida con un validador propio, sin dependencias**, y hace **1 reintento incluyendo el error de
validación dentro del prompt**. El modelo y la versión del prompt se guardan en la fila.

**Por qué no Zod, aunque fuera la elección obvia.** No es preferencia: es una consecuencia de
cómo se verifica. La guardia reproduce el RED clonando el commit de tests en un worktree **sin
`node_modules`** y corriendo la suite ahí. Un módulo que importa cualquiera de `node_modules` no se
puede ni cargar en ese árbol, así que **sus casos no se pueden medir**: el test falla por error y la
corrida se rechaza. Los criterios C-10 y C-11 (qué se considera incompleto, qué se considera JSON
inválido) son justamente **el corazón de esta tarea**, y son lógica de comparación y forma: no
necesitan una librería. El validador propio vive en `lib/validar_oferta.js`, importa **nada**, y por
eso se puede probar de verdad.

La consecuencia buena: una dependencia menos en el Worker, y un validador que dice exactamente qué
campo falta — que es lo que el usuario ve resaltado en la pantalla.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Exigir `json_schema` siempre | Ata el producto a los modelos que lo soportan y rompe la premisa del spec: «modelos configurables sin cambios de código». Un cambio de modelo dejaría de funcionar sin tocar nada. |
| Parsear el JSON a mano y aceptar lo que venga | Sin validación, un campo faltante se vuelve `undefined` y aparece como un bug de la UI en vez de un dato faltante. `campos_faltantes_json` existe justamente para eso. |
| Reintentos en bucle hasta que valide | Costo y latencia sin techo, con un modelo barato. 1 reintento es lo que el spec §4 pide. |

## Consecuencias

**Positivas:**
- Funciona con cualquier modelo de la pasarela.
- El error de validación viaja al modelo, así que el reintento corrige en vez de repetir a ciegas.
- La extracción **nunca bloquea**: si falla dos veces, queda `fallida` con el texto original y se completa a mano.

**Negativas / costo asumido:**
- Un modelo flojo puede gastar dos llamadas y devolver `parcial` igual. El costo asumido es bajo (<US$2/mes estimado) y la revisión manual es el camino permanente, no el parche.

**Qué se vuelve difícil después de esto:**
- Si algún día se quiere una extracción perfecta, hay que cambiar de estrategia: este ADR apuesta a no bloquear, no a acertar siempre.
