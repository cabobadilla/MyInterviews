# ADR-003 — Esquema completo del spec en `0001_init.sql`, con las dos correcciones

- **Fecha:** 2026-10-10
- **Estado:** aceptado
- **Decisor:** Arquitecto (Hermes)

## Contexto

El spec §3.3 trae el DDL completo (perfil, experiencias, ofertas, postulaciones, documentos, entrevistas, aprendizajes) y el Ciclo 1 solo usa tres tablas. Además el DDL tiene **dos defectos** detectados en la fase 2: falta `status_previo` (necesario para «reabrir») y `idx_docs_actual` no es único (dos versiones «vigentes» a la vez).

## Decisión

**Una sola migración `0001_init.sql` con el esquema completo del spec, ya corregido**: `applications.status_previo` y `idx_docs_actual` como índice parcial **UNIQUE**.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Migrar por ciclo (solo las tablas que cada ciclo usa) | Garantiza churn de migraciones y **drift** entre lo que el spec dice y lo que existe. El esquema ya está confirmado por el usuario: escribirlo dos veces es la forma de que las dos versiones se separen. |
| Copiar el DDL del spec tal cual, sin las correcciones | Deja dos defectos conocidos dentro del producto. Un `ALTER TABLE` después es más caro que arreglar el `CREATE` ahora. |
| Migrar solo C1 y dejar las correcciones para C2 | Las dos correcciones son de tablas de C2/C3: postergarlas garantiza que se olviden. Además obligaría a que C2 empiece con una migración. |

## Consecuencias

**Positivas:**
- Una sola verdad del esquema, corregida desde el día uno.
- C2 y C3 arrancan sin migraciones ni sorpresas.

**Negativas / costo asumido:**
- Hay **siete tablas inertes** en este ciclo. Riesgo real: que alguien crea que están en uso. Se mitiga escribiendo en el contrato de T-01 que C1 solo toca tres.

**Qué se vuelve difícil después de esto:**
- Borrar una tabla que todavía no se usó no cuesta; borrar una que ya tiene datos, sí. El esquema se vuelve difícil de reordenar a partir de C2.
