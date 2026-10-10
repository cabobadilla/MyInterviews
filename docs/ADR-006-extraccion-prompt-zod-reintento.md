# ADR-006 — Extracción: prompt + Zod + 1 reintento; `response_format` solo si el modelo lo soporta

- **Fecha:** 2026-10-10
- **Estado:** aceptado
- **Decisor:** Arquitecto (Hermes)

## Contexto

El spec §4 fija OpenRouter con modelos económicos configurables por variable. El soporte de **salida estructurada (`json_schema`) varía según el modelo** de la pasarela, y el modelo se elige por entorno, no en el código.

## Decisión

El gateway intenta `response_format` **solo si el modelo declarado lo soporta**; en todos los casos **valida con Zod** y hace **1 reintento incluyendo el error de validación dentro del prompt**. El modelo y la versión del prompt se guardan en la fila.

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
