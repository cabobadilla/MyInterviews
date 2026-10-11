# ADR-008 — PBKDF2: 100.000 iteraciones, porque es el techo de la plataforma

- **Estado:** aceptado
- **Fecha:** 2026-10-10

## Contexto

La contraseña del único usuario se guarda como `pbkdf2:<iteraciones>:<saltB64>:<hashHex>` y el
Worker la verifica con `pbkdf2Sync` de `node:crypto`. El número de iteraciones se lee de `env`
(`PBKDF2_ITERATIONS`), no del código.

El diseño había marcado un riesgo en la dirección equivocada: «600k iteraciones pueden exceder
el **CPU** del plan». Se parametrizó por eso y se despachó con 200.000.

La primera corrida contra el edge real lo desmintió, con la causa textual del log del Worker:

```
NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 200000).
```

No es CPU ni un límite del plan: **la implementación de PBKDF2 de Cloudflare rechaza cualquier
valor por encima de 100.000**. Es un techo duro del runtime.

## Decisión

`PBKDF2_ITERATIONS = 100000`. Es el máximo que la plataforma acepta, así que es también el
valor más fuerte que se puede usar: no hay margen para elegir, solo para equivocarse hacia arriba.

El número sigue viviendo en `env` y no en el código. La razón no cambió, se reforzó: un valor
que el runtime puede rechazar **no puede estar en una constante**, o cambiarlo exige un deploy
de código en vez de un cambio de configuración.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Dejar 600k o 200k «y ver»** | Ya se vio: la app entera responde **500**. El límite no degrada el hash, **rompe el login**. |
| **Bajar a un valor cómodamente por debajo (50k)** | Regala la mitad de la fuerza de hash que la plataforma **sí** permite, sin ganar nada a cambio. |
| **Verificar en un Worker aparte sin `nodejs_compat`** | Es el mismo runtime con otro nombre. El techo es de PBKDF2, no del flag. |
| **Argon2 o scrypt** | También disponibles, pero el formato ya está implementado, probado y en producción. Cambiar de función por un techo que se respeta con un número es coste sin beneficio. |

## Consecuencias

- **Lo que se verifica tiene que incluir el runtime real.** La suite verde en local era
  compatible con un login **imposible de satisfacer en el edge**: miniflare no aplica este techo.
  Es la segunda vez en este ciclo que el mismo patrón aparece (la primera fue `node:crypto`
  exigiendo `nodejs_compat`), y es la razón por la que el **smoke contra la URL desplegada** es
  parte del entregable y no un extra.
- Si algún día hacen falta más iteraciones, el cambio **no** es subir el número: es cambiar de
  función de hash, y eso es un ADR nuevo.
- El hash de producción se regeneró a 100.000. La contraseña no cambió; su representación sí.
