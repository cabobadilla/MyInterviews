#!/usr/bin/env bash
#
# smoke.sh — verifica lo PUBLICADO, no lo construido.
#
# Uso:  bash scripts/smoke.sh <url>
# Lo llama scripts/deploy.sh con la URL que devolvió wrangler.
#
# Por qué existe: el emulador local no aplica los límites del plan ni el runtime real,
# así que la suite verde en local no dice si la app vive donde vive. Esto sí.
#
# Necesita credenciales para los chequeos que requieren sesión. Se leen de ~/.hermes/.env
# (el orquestador las tiene; el Coder no). Sin ellas, esos chequeos se saltean y lo dice.

set -uo pipefail

URL="${1:-}"
[ -z "$URL" ] && { echo "uso: smoke.sh <url>" >&2; exit 1; }

ENV_FILE="${HOME}/.hermes/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null  # la ruta es dinámica por diseño ($HOME)
  . "$ENV_FILE"
  set +a
fi

export MYINTERVIEWS_URL="$URL"

# El smoke vive junto al proyecto para poder correr solo.
SMOKE_JS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/smoke.mjs"
[ -f "$SMOKE_JS" ] || { echo "falta $SMOKE_JS" >&2; exit 1; }

node "$SMOKE_JS"
