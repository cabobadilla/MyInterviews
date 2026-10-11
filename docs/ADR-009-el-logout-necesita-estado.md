# ADR-009 — El logout necesita estado: una cookie stateless no se puede invalidar

- **Estado:** aceptado
- **Fecha:** 2026-10-10

## Contexto

**C-05** dice, textual: *«`POST /api/auth/logout` DEBE invalidar esa sesión»*.

La implementación firmó la sesión con HMAC y la guardó **solo en la cookie**. El logout borra la
cookie y contesta `200`. Eso cumple la parte fácil —el navegador deja de mandarla— y **no cumple
nada más**:

```
$ curl -X POST …/api/auth/logout -b <cookie>        → 200   (borra la cookie)
$ curl …/api/session -b <la misma cookie>            → 200 {"autenticado":true}
```

Una cookie firmada **no deja de ser válida porque el servidor le diga al navegador que la borre**.
Si la cookie se copió (otro dispositivo, un log, un backup del perfil), quien la tenga conserva
acceso **30 días** aunque el usuario haya cerrado sesión. El servidor no tiene dónde recordar que
esa sesión ya no vale, así que no puede negarla: solo puede pedirle al cliente que se olvide.

Encontrado por el **smoke contra la URL desplegada**. Y hay un detalle que importa: el check
figuraba como **verde** en la corrida anterior, pero por el **motivo equivocado** —`/api/session`
devolvía `401` por otro defecto, así que el reuso nunca llegó a evaluarse—. Un verde que pasa por
la razón incorrecta es indistinguible de un verde real hasta que lo arreglás.

## Decisión

El logout pasa a tener **estado del lado del servidor**: una tabla `sesiones_revocadas` con el
identificador de sesión (`jti`) y su vencimiento. El login emite un `jti` aleatorio dentro de la
cookie firmada; el logout lo inserta; la barrera, después de validar la firma, comprueba que el
`jti` no esté revocado.

- La firma sigue siendo la primera barrera: sin firma válida no se consulta nada (C-02 intacto).
- La consulta de revocación es **una lectura por índice** por request autenticado.
- La revocación se puede purgar por vencimiento: pasado el `exp` de la cookie, la fila es ruido.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Dejar el logout como está y bajar C-05 a «borra la cookie»** | Es exactamente lo que el spec **no** quiere, y cambiar el criterio a lo que el código hace es dejar de tener especificación. Ahora, con el defecto medido, es una decisión de producto — no una salida técnica. |
| **Sesiones con estado completo** (una fila por sesión activa) | Es la solución natural en multiusuario, y acá es maquinaria para una sola persona: revocación es todo lo que C-05 pide, y una lista de revocados es más chica y más simple que el registro de todas las sesiones. |
| **Bajar el vencimiento de 30 días a minutos** | Cambia la duración de la sesión para esquivar el problema de la revocación: arregla la ventana de exposición y no la invalidación, que es lo que se pidió. |
| **Cookie con estado en memoria del Worker** | Un Worker es stateless y tiene muchas instancias: la memoria no es un lugar donde guardar algo que tiene que sobrevivir al request. |

## Consecuencias

- **C-05 ahora es verificable de verdad**: el observable pasa a ser «con la cookie de una sesión
  cerrada, una ruta protegida responde `401`», y eso se mide contra el edge.
- La barrera sigue siendo un decisor **puro**: recibe una función `estaRevocado(jti)` inyectada, así
  que la lógica se prueba sin base y la base se prueba con `node:sqlite` contra el esquema real.
- Aparece una tabla más en el Ciclo 1. Su purga por vencimiento **no** entra en este ciclo
  (es ruido, no un problema) y queda anotada.
- Regla que se desprende y vale más que el arreglo: **un check verde que pasa por el motivo
  equivocado miente igual que un check que falta.** Cuando se arregla el defecto que lo tapaba, hay
  que volver a mirarlo.
