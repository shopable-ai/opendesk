#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/.runtime/tests/custom-ui/ui-components"
mkdir -p "${OUTPUT_DIR}"
cd "${ROOT_DIR}"

run_logged() {
  local name="$1"
  shift
  echo "[custom-ui] ${name}"
  "$@" 2>&1 | tee "${OUTPUT_DIR}/${name}.log"
}

run_logged static-node-tests \
  node --test \
    tests/custom-ui/ui-components.test.js \
    tests/custom-ui/native-ui-components.test.js \
    tests/test-architecture/example-explorer-catalog.test.js

if [[ ! -x "${ROOT_DIR}/dist/opendesk" ]]; then
  echo "[custom-ui] missing ${ROOT_DIR}/dist/opendesk; run 'make build' first" >&2
  exit 2
fi

run_logged runtime-api-custom-ui \
  env OPENDESK_RUNTIME_API_MODE=custom-ui \
    "${ROOT_DIR}/dist/opendesk" -script scripts/test_runtime_apis.js -console-mode script

echo "[custom-ui] checks passed; logs are under ${OUTPUT_DIR}"
