#!/usr/bin/env bash
#
# update-status.sh — Refresca el tablero y (opcional) lo PUBLICa en Cloudflare.
#
# Uso:
#   ./scripts/update-status.sh <ruta-del-proyecto> [--publicar]
#
# Hace:
#   1. collect-status.mjs  → deriva la mitad mecánica de docs/estado.json
#   2. render-status.mjs   → escribe tablero/public/index.html
#   3. (--publicar)         → wrangler deploy del Worker solo-assets y registra la URL
#
# Pensado para correrlo tras cada hito, mientras el Coder avanza. El tablero es un
# Worker SEPARADO del producto: una caída del producto no se lleva puesta la vista del
# avance. Todo lo publicable vive en Cloudflare; el mockup es la única excepción.
#
# El alias de publicación a Pages se retiró a propósito: un alias a Pages es una
# invitación a que el tablero se congele en silencio otra vez.

set -uo pipefail

PROJECT_DIR="${1:-}"
PUBLICAR=0
[ "${2:-}" = "--publicar" ] && PUBLICAR=1

[ -z "$PROJECT_DIR" ] && { echo "uso: update-status.sh <ruta-del-proyecto> [--publicar]" >&2; exit 1; }
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$PROJECT_DIR/docs/estado.json" ] || {
  echo "Falta $PROJECT_DIR/docs/estado.json — el estado vive ahí, no en el HTML." >&2
  echo "  (lo escribe collect-status.mjs; la narrativa va en docs/estado-manual.json)" >&2
  exit 1
}

# 1. La mitad mecánica se DERIVA del repo, no se redacta (regla 12 → [L-05]).
if [ -f "$SCRIPT_DIR/collect-status.mjs" ]; then
  node "$SCRIPT_DIR/collect-status.mjs" "$PROJECT_DIR" || exit 1
fi

# 2. El tablero.
node "$SCRIPT_DIR/render-status.mjs" "$PROJECT_DIR" || exit 1

[ "$PUBLICAR" -eq 1 ] || exit 0

# 3. Publicar. Guardia de privacidad: en el directorio de assets TODO es público.
TABLERO="$PROJECT_DIR/tablero"
[ -f "$TABLERO/wrangler.jsonc" ] || {
  echo "Falta tablero/wrangler.jsonc — sin Worker no hay tablero que publicar." >&2
  exit 1
}
if [ ! -d "$TABLERO/public" ]; then
  echo "Falta tablero/public/ — nada que publicar." >&2
  exit 1
fi
EXTRA="$(find "$TABLERO/public" -type f ! -name 'index.html' -print)"
if [ -n "$EXTRA" ]; then
  echo "❌ tablero/public/ debe contener EXACTAMENTE un archivo, index.html." >&2
  printf '   sobra: %s\n' "$EXTRA" >&2
  echo "   Todo lo que está ahí es PÚBLICO: rechazo y no publico." >&2
  exit 1
fi

echo
echo "── publicando el tablero ──"
OUT="$(cd "$PROJECT_DIR" && npx --yes wrangler deploy --config "tablero/wrangler.jsonc" 2>&1)"
RC=$?
printf '%s\n' "$OUT" | grep -viE 'token|bearer|cfat_' | tail -6
if [ "$RC" -ne 0 ]; then
  echo "❌ El despliegue del tablero falló (exit $RC)." >&2
  exit 1
fi

URL="$(printf '%s' "$OUT" | grep -oE 'https://[A-Za-z0-9._-]+\.workers\.dev' | head -1)"
[ -z "$URL" ] && { echo "❌ No pude leer la URL del tablero." >&2; exit 1; }

# Registrar la URL en estado.json (tablero.url) — para que no viva solo en este output.
node -e '
const fs = require("fs");
const [f, url] = process.argv.slice(1);
try {
  const s = JSON.parse(fs.readFileSync(f, "utf8"));
  s.tablero = s.tablero || {};
  s.tablero.url = url;
  fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
} catch (e) {}
' "$PROJECT_DIR/docs/estado.json" "$URL" 2>/dev/null || true

echo "  publicado: $URL"
