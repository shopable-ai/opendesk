#!/bin/sh
# Backward-compatible wrapper. The live gate is an OpenDesk Runtime recipe.
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
BINARY="${OPENDESK_BINARY:-$ROOT_DIR/dist/opendesk}"
cd "$ROOT_DIR"
exec "$BINARY" ai run scripts/test_ai_calculator_recipe.js "$@"
