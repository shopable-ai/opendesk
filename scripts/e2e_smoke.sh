#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
REPORT_DIR="$ROOT_DIR/.runtime/smoke/e2e"
REPORT_FILE="$REPORT_DIR/smoke_${STAMP}.md"
mkdir -p "$REPORT_DIR"
RUN_MAC_UI="${RUN_MAC_UI:-1}"

PASS_COUNT=0
FAIL_COUNT=0

log() {
  printf '%s\n' "$*"
}

run_step() {
  local name="$1"
  shift
  log "==> $name"
  if "$@"; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf -- "- [PASS] %s\n" "$name" >>"$REPORT_FILE"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf -- "- [FAIL] %s\n" "$name" >>"$REPORT_FILE"
  fi
}

{
  printf '# clawdesk e2e smoke report\n\n'
  printf -- '- time: `%s`\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
  printf -- '- root: `%s`\n\n' "$ROOT_DIR"
} >"$REPORT_FILE"

run_step "go test ./automation" go test ./automation
run_step "go test ./..." go test ./...

SMOKE_SCRIPT="$ROOT_DIR/.runtime/temp/e2e/clawdesk_script_smoke_${STAMP}.js"
mkdir -p "$(dirname "$SMOKE_SCRIPT")"
cat >"$SMOKE_SCRIPT" <<'EOF'
console.log('script-smoke-start');
await page.waitFor(100);
console.log('script-smoke-end');
EOF
run_step "go run ./cmd/clawdesk -script smoke.js" go run ./cmd/clawdesk -script "$SMOKE_SCRIPT"

if [[ "$(uname -s)" == "Darwin" && "$RUN_MAC_UI" == "1" ]]; then
  run_step "go run ./cmd/clawdesk -script examples/mac/safari_url_input_flow.js" \
    go run ./cmd/clawdesk -script examples/mac/safari_url_input_flow.js
  run_step "go run ./cmd/clawdesk -script examples/mac/wechat_probe_chatlist_scan.js" \
    go run ./cmd/clawdesk -script examples/mac/wechat_probe_chatlist_scan.js
elif [[ "$(uname -s)" == "Darwin" ]]; then
  printf -- "- [SKIP] mac UI scripts disabled by RUN_MAC_UI=%s\n" "$RUN_MAC_UI" >>"$REPORT_FILE"
else
  printf -- "- [SKIP] mac scripts on non-Darwin host\n" >>"$REPORT_FILE"
fi

{
  printf '\n## Summary\n\n'
  printf -- '- pass: `%d`\n' "$PASS_COUNT"
  printf -- '- fail: `%d`\n' "$FAIL_COUNT"
} >>"$REPORT_FILE"

log ""
log "Smoke finished. pass=$PASS_COUNT fail=$FAIL_COUNT"
log "Report: $REPORT_FILE"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
