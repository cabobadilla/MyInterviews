# ADR-002 — npm como gestor de paquetes, no pnpm

- **Fecha:** 2026-10-10
- **Estado:** aceptado
- **Decisor:** Arquitecto (Hermes)

## Contexto

El spec §3.1 dice «monorepo pnpm». En el entorno real (macOS, Node instalado por Homebrew) **`pnpm` no está instalado**; `npx` y `npm` sí. El Coder corre en un sandbox donde cada herramienta extra es un punto de fallo.

## Decisión

**npm**, con **un solo paquete** (sin monorepo en este ciclo).

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| `pnpm` vía `corepack enable` | Agrega un paso que puede fallar en el sandbox del Coder y una descarga de red antes de poder instalar nada. Sin monorepo que lo justifique. |
| Monorepo con `npm workspaces` | Tres paquetes para un ciclo que tiene una SPA y un Worker. La ceremonia del monorepo se paga en cada tarea y no resuelve nada de este ciclo. |
| Bun | Otra herramienta que no está instalada y otro runtime a explicar. |

## Consecuencias

**Positivas:**
- Cero instalaciones previas: `npm` viene con Node.
- Un `package.json`, un `node_modules`, un `npm test`.

**Negativas / costo asumido:**
- Se **desvía del spec §3.1** (decía pnpm + monorepo). Cuando el proyecto crezca a varios paquetes, este ADR se revisa — no se estira en silencio.

**Qué se vuelve difícil después de esto:**
- Migrar a workspaces después implica mover rutas de import: más barato hacerlo cuando haya un segundo paquete real.
