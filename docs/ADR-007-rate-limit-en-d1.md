# ADR-007 — El contador de intentos de login vive en D1

- **Fecha:** 2026-10-10
- **Estado:** aceptado
- **Decisor:** Arquitecto (Hermes)

## Contexto

C-04 exige bloquear el 6º intento en 15 minutos por IP. El spec §7 lo pide pero **no dice dónde vive el contador**. Un login single-user no necesita infraestructura de borde.

## Decisión

Una tabla `login_attempts` en **D1**, con la IP y el instante del intento; la ventana se consulta por rango de tiempo.

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| **KV** | Consistencia eventual: dos intentos simultáneos pueden leer el contador viejo y el bloqueo se vuelve probabilístico. Un límite que a veces no aplica no es un límite. |
| **Durable Object** | Es la solución correcta para contadores concurrentes y es **exactamente la maquinaria que un usuario no necesita**. Suma una clase, un binding y un estado más que operar. |
| En memoria del Worker | Las instancias son efímeras y hay varias: el contador se reinicia solo. No sirve. |
| Cloudflare Access (delegar el login entero) | El usuario ya lo descartó explícitamente en el spec §7 y §9. |

## Consecuencias

**Positivas:**
- Un almacén que ya está en el diseño: cero infraestructura nueva.
- Consistente dentro de la misma base: el bloqueo no depende de la réplica que atienda.

**Negativas / costo asumido:**
- Cada intento de login es una **escritura** en D1. Con single-user es irrelevante (unos pocos por día), y se acepta a cambio de la simplicidad.
- La tabla necesita limpieza de filas viejas; en C1 no se implementa la purga (el volumen no lo justifica) y queda declarado.

**Qué se vuelve difícil después de esto:**
- Si el login se volviera multiusuario de verdad, este ADR se cae y hay que mover el contador a un Durable Object. No es el caso hoy.
