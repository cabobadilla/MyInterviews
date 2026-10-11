# 05 — Tareas · Ciclo 1

- **Proyecto:** MyInterviews
- **Fecha:** 2026-10-10
- **Entrada:** `docs/04-DISENO.md` (matriz C-01..C-24) + `docs/03-DEFINICION.md`
- **Contratos:** `docs/contratos/T-01.md` … `docs/contratos/T-06.md` — **el contrato es lo
  que se le pasa al Coder**, no esta lista completa.

## Reglas

1. Cada tarea es ejecutable de forma independiente y es **un ciclo TDD**.
2. Cada tarea apunta a ≥1 criterio de `03-DEFINICION.md`.
3. **Tests primero.** Implementación antes que tests → se descarta y se repite.
4. Una tarea a la vez, en el workdir del Coder, **commiteando en `main` en pasos chicos y
   sin pushear** (`main` local; `origin/main` es lo verificado y solo lo pushea Hermes).
5. Cada tarea declara los IDs de la matriz que **debe** cubrir. El Coder puede agregar
   casos; no puede dejar ninguno sin cubrir (`scripts/check-coverage.sh` lo comprueba).
6. **Los temporales viven en `.tmp/` del proyecto.** Escribir fuera del workdir aborta.
7. El Coder **no toca los tests después de sellarlos** (`scripts/freeze-tests.sh`).
8. El Coder **no despliega** y no tiene el token.

## Orden y dependencias

`T-01` (shell) es la base de todas. `T-02` (auth) es requisito de `T-03`, `T-04` y `T-05`:
sin sesión no hay nada que probar. `T-03` precede a `T-04` (sin oferta no hay detalle) y a
`T-05` (sin ofertas no hay pipeline con datos).

`T-06` va al final y **no** depende del contenido de las demás: cablea la SPA contra la API que
ya existe. Se agrega tarde porque el hueco apareció **probando la app publicada**, no leyendo el
código: con C-01 clasificado como `existencia`, la suite verificaba que el formulario existiera y
nunca que la app eligiera la vista, así que el login podía quedar inerte con todo en verde.

```
T-01 → T-02 → T-03 → { T-04, T-05 } → T-06
```

## Tareas

### T-01 — Shell del proyecto, Worker con Hono y SPA que carga

- **Cubre:** C-01, C-07, C-14, C-18
- **Casos que debe cubrir:** `C-01`, `C-07`, `C-14`, `C-18`
- **Entrada:** repo con `wrangler.jsonc` y `package.json` por crear
- **Salida:** Worker con Hono (`main`) + assets, SPA React/Vite compilada, migración
  `0001_init.sql`, pantalla de login y las 4 pantallas del ciclo navegables
- **Test primero:** `GET /` devuelve la SPA y el DOM contiene `#login`; autenticado
  contiene `#pipeline`, `#nueva-oferta` y el detalle de oferta
- **Criterio de terminado:** `npx wrangler dev --port 8787` levanta y las 4 pantallas
  existen; `C-01`, `C-07`, `C-14`, `C-18` en verde

### T-02 — Sesión de un solo usuario

- **Cubre:** C-02, C-03, C-04, C-05, C-06
- **Casos que debe cubrir:** `C-02`, `C-03`, `C-04`, `C-05`, `C-06`
- **Entrada:** T-01 terminada
- **Salida:** `lib/session.js`, `lib/rate_limit.js`, `middleware/auth.js`,
  `routes/auth.js`, tabla `login_attempts`
- **Test primero:** sin cookie, `/api/offers` → `401` **sin tocar D1**; 5 fallos → el 6º
  `429` sin evaluar la contraseña
- **Criterio de terminado:** los 5 casos en verde y el login medido en el smoke

### T-03 — Cargar oferta y extraer con LLM

- **Cubre:** C-08, C-09, C-10, C-11, C-12, C-13
- **Casos que debe cubrir:** `C-08`, `C-09`, `C-10`, `C-11`, `C-12`, `C-13`
- **Entrada:** T-02 terminada
- **Salida:** `llm/gateway.js`, `llm/extract_offer.js`, `llm/reduce_html.js`,
  `lib/schema.js`, `routes/offers.js`, `repos/offers.js`, pantalla Nueva oferta
- **Test primero:** `POST /api/offers/extract` con texto → `201` con oferta y aplicación
  en `borrador`; sin salario → `parcial` con los faltantes listados
- **Criterio de terminado:** los 6 casos en verde, y **la extracción nunca bloquea**

### T-04 — Revisar y editar la oferta extraída

- **Cubre:** C-15, C-16, C-17
- **Casos que debe cubrir:** `C-15`, `C-16`, `C-17`
- **Entrada:** T-03 terminada
- **Salida:** `GET/PUT /api/offers/:id`, pantalla Detalle de oferta con resalte de faltantes
- **Test primero:** `PUT` sobre una oferta `fallida` → `200` y el valor persiste
- **Criterio de terminado:** los 3 casos en verde

### T-05 — Pipeline

- **Cubre:** C-19, C-20, C-21, C-22, C-23, C-24
- **Casos que debe cubrir:** `C-19`, `C-20`, `C-21`, `C-22`, `C-23`, `C-24`
- **Entrada:** T-03 terminada
- **Salida:** `GET /api/applications` con los 7 contadores, `GET /api/interviews/proximas`,
  pantalla Pipeline, `components/Sidebar/Tablero/Contadores/ProximasEntrevistas`,
  `tests/fixtures/pipeline.html`
- **Test primero:** con 2 postulaciones en estados distintos hay 7 contadores con su
  número; crear una oferta la muestra **sin reload**
- **Criterio de terminado:** los 6 casos en verde, incluidos los 3 de `forma` medidos

### T-06 — La SPA contra la API: arranque, transición y error en pantalla

- **Cubre:** C-01 (reclasificado a `comportamiento`), C-03, C-05
- **Casos que debe cubrir:** `C-01`, `C-03` (los nuevos observables) — los sellados `C-01` de T-01 quedan como están
- **Entrada:** T-01..T-05. La API ya responde; lo que falta es del lado de la SPA
- **Salida:** la SPA pregunta `GET /api/session` al arrancar y elige vista; el login exitoso entra a
  la app sin recargar; el error de login se ve en pantalla; el logout vuelve al login
- **Test primero:** con la API **inyectada como doble** (no se pega a la red: la suite corre en árbol
  pelado), la vista mostrada depende de `{autenticado}`; el `200` del login cambia la vista; el `401`
  deja el mensaje genérico en pantalla
- **Criterio de terminado:** los observables nuevos en verde y los **18** sellados siguen verdes
- **Por qué existe:** apareció probando la app publicada, no leyendo código. Con C-01 como
  `existencia` la suite medía que el formulario existiera, nunca que la app eligiera la vista: el
  login podía quedar inerte con todo en verde. Un criterio mal clasificado es un criterio que no se
  verifica.

---

## Estado

| Tarea | Estado | Gate G3 (tests primero) | Notas |
|---|---|---|---|
| T-01 | **completa** | RED válido | reproducido en `99eaad7` por `verify-red`; sello `seal-from-commit` intacto; mutar `id="login"` pone rojo **solo** C-01 |
| T-02 | **completa** | RED válido | cinco defectos que solo el runtime mostraba; el último, `{results}` de D1 leído como fila; smoke del edge en 14/21 |
| T-03 | **en curso** | — | cargar oferta y extraer con LLM (C-08..C-13) |
| T-04 | pendiente | — | — |
| T-05 | pendiente | — | — |
| T-06 | pendiente | — | la SPA contra la API: hueco encontrado probando la app publicada |
| T-05 | pendiente | — | — |

---

**Gate G2 (salida de fase 4):** trazabilidad completa definición ↔ tareas.
