#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"
VERIFY=0
VERIFY_AI=0
VERIFY_CONTROLLED=0
QUERY_CONFIG="${OPENDESK_SUPPORT_QUERY_CONFIG:-}"
QUERY_HOLD_MS=0
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --verify) VERIFY=1; shift ;;
    --verify-ai) VERIFY_AI=1; shift ;;
    --verify-controlled) VERIFY_CONTROLLED=1; shift ;;
    --with-query) QUERY_CONFIG="${QUERY_CONFIG:-.runtime/ai-customer-support/query-config.json}"; shift ;;
    --query-config) [[ "$#" -ge 2 ]] || exit 2; QUERY_CONFIG="$2"; shift 2 ;;
    --query-test-response-hold-ms) [[ "$#" -ge 2 ]] || exit 2; QUERY_HOLD_MS="$2"; shift 2 ;;
    *) echo 'Usage: run-desktop.sh [--verify|--verify-ai|--verify-controlled] [--with-query|--query-config PATH] [--query-test-response-hold-ms MS]' >&2; exit 2 ;;
  esac
done
[[ "$((VERIFY+VERIFY_AI+VERIFY_CONTROLLED))" -le 1 ]] || { echo 'Choose one verification mode.' >&2; exit 2; }
[[ "$QUERY_HOLD_MS" =~ ^[0-9]+$ && "${#QUERY_HOLD_MS}" -le 5 && "$QUERY_HOLD_MS" -le 10000 ]] || { echo 'Test response hold must be 0..10000ms.' >&2; exit 2; }
[[ "$QUERY_HOLD_MS" == 0 || "$VERIFY_AI" == 1 ]] || { echo 'Response holds are only available to --verify-ai.' >&2; exit 2; }
[[ "$QUERY_HOLD_MS" == 0 || -n "$QUERY_CONFIG" ]] || { echo 'Test response hold requires an owned Query deployment.' >&2; exit 2; }
[[ -z "$QUERY_CONFIG" || "$((VERIFY+VERIFY_CONTROLLED))" == 0 ]] || { echo 'Disable Query for isolated fixture gates.' >&2; exit 2; }
[[ -z "$QUERY_CONFIG" || ( -z "${OPENDESK_SUPPORT_QUERY_PORT:-}" && -z "${OPENDESK_SUPPORT_PROJECT_ID:-}" ) ]] || { echo 'Choose managed Query config or an existing Query port/project, not both.' >&2; exit 2; }
CHAT="$ROOT_DIR/.runtime/apps/OpenDeskSupportChat.app"
CHAT_BIN="$CHAT/Contents/MacOS/support-chat"
PREVIEW="$ROOT_DIR/examples/ai-customer-support/preview/index.html"
[[ -f "$PREVIEW" ]] || { echo 'React preview missing; run npm run build in examples/ai-customer-support.' >&2; exit 1; }
if [[ ! -x "$CHAT_BIN" || tests/custom-ui/tools/support-chat/main.swift -nt "$CHAT_BIN" ]]; then
  tests/custom-ui/tools/support-chat/build.sh
fi
source scripts/macos_signing.sh
macos_signing_load verify
macos_signing_verify_app "$CHAT" com.opendesk.test.support-chat
macos_signing_verify_app "$ROOT_DIR/dist/OpenDesk.app" com.opendesk.cli
# A fixed fixture identity is never shared by two runs. Do not kill an existing
# owner or silently attach to its possibly edited conversation.
if /usr/bin/pgrep -f '/OpenDeskSupportChat.app/Contents/MacOS/support-chat$' >/dev/null; then
  echo 'A test chat already runs. Close that owned demo before starting another.' >&2
  exit 1
fi
RUN_ID="$(date '+%Y%m%d-%H%M%S')-$$"
EVIDENCE="$ROOT_DIR/.runtime/tests/ai-customer-support/desktop/runs/$RUN_ID"
mkdir -p "$EVIDENCE"
CHAT_PID=''
QUERY_PID=''
RUNTIME_PID=''
cleanup_demo() {
  local exit_status=$?
  trap - EXIT INT TERM
  # Only direct children of this still-running launcher are owned here. There is
  # no process-name cleanup or reattachment to a previous run's PID file.
  for owned_pid in "$RUNTIME_PID" "$CHAT_PID" "$QUERY_PID"; do
    [[ -n "$owned_pid" ]] || continue
    if [[ "$(/bin/ps -p "$owned_pid" -o ppid= 2>/dev/null | tr -d ' ')" == "$$" ]]; then
      kill -TERM "$owned_pid" 2>/dev/null || true
    fi
    wait "$owned_pid" 2>/dev/null || true
  done
  node --input-type=module - "$EVIDENCE" "$exit_status" "$RUNTIME_PID" "$CHAT_PID" "$QUERY_PID" <<'JS'
import {writeFileSync} from 'node:fs';
const [dir,status,...pids]=process.argv.slice(2);
const children=pids.filter(Boolean).map(Number).map(pid=>{let running=false;try{process.kill(pid,0);running=true;}catch{}return {pid,running};});
writeFileSync(dir+'/launcher-cleanup.json',JSON.stringify({exitCode:Number(status),children,allOwnedChildrenExited:children.every(c=>!c.running)},null,2)+'\n');
JS
  exit "$exit_status"
}
trap cleanup_demo EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ -n "$QUERY_CONFIG" ]]; then
  python3 examples/ai-customer-support/scripts/local-query.py serve --config "$QUERY_CONFIG" \
    --run-dir "$EVIDENCE/query" --test-response-hold-ms "$QUERY_HOLD_MS" >"$EVIDENCE/query.log" 2>&1 &
  QUERY_PID=$!
  for ((attempt=0; attempt<300; attempt++)); do
    [[ ! -s "$EVIDENCE/query/ready.json" ]] || break
    kill -0 "$QUERY_PID" 2>/dev/null || { cat "$EVIDENCE/query.log" >&2; exit 1; }
    sleep 0.1
  done
  [[ -s "$EVIDENCE/query/ready.json" ]] || { echo 'Owned Query startup timed out; see query.log.' >&2; exit 1; }
  python3 examples/ai-customer-support/scripts/local-query.py check --run-dir "$EVIDENCE/query"
  OPENDESK_SUPPORT_QUERY_PORT="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).port' "$EVIDENCE/query/ready.json")"
  OPENDESK_SUPPORT_PROJECT_ID="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).projectId' "$EVIDENCE/query/ready.json")"
  export OPENDESK_SUPPORT_QUERY_PORT OPENDESK_SUPPORT_PROJECT_ID
  export OPENDESK_SUPPORT_QUERY_PROVIDER=auto
fi
OPENDESK_SUPPORT_CHAT_ORACLE="$EVIDENCE/fixture-oracle.json" "$CHAT_BIN" >"$EVIDENCE/chat.log" 2>&1 &
CHAT_PID=$!
# Wait for this child's AppKit window creation before per-PID observer setup.
# This diagnostic file supplies readiness only; the adapter never reads it.
for ((attempt=0; attempt<150; attempt++)); do
  [[ ! -s "$EVIDENCE/fixture-oracle.json" ]] || break
  kill -0 "$CHAT_PID" 2>/dev/null || { echo 'Test chat exited before readiness.' >&2; exit 1; }
  sleep 0.1
done
[[ -s "$EVIDENCE/fixture-oracle.json" ]] || { echo 'Test chat startup timed out.' >&2; exit 1; }
node --input-type=module - "$CHAT_PID" "$CHAT_BIN" "$PREVIEW" "$EVIDENCE" "$VERIFY" "$VERIFY_AI" "$VERIFY_CONTROLLED" <<'JS'
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [pid,exePath,preview,evidence,verify,verifyAI,verifyControlled]=process.argv.slice(2);
const config={schemaVersion:1,pid:Number(pid),exePath,evidence,verify:verify==='1',
  verifyAI:verifyAI==='1',
  verifyControlled:verifyControlled==='1',
  previewSha256:createHash('sha256').update(readFileSync(preview)).digest('hex')};
// Explicit per-launch project mapping. No arbitrary URL, remote host or UI-supplied
// project ID is accepted. Never include credentials in the evidence folder.
const portText=(process.env.OPENDESK_SUPPORT_QUERY_PORT||'').trim();
const projectId=(process.env.OPENDESK_SUPPORT_PROJECT_ID||'').trim();
const provider=(process.env.OPENDESK_SUPPORT_QUERY_PROVIDER||'auto').trim();
if(portText||projectId){
  const port=Number(portText);
  if(verify==='1'||verifyControlled==='1')throw Error('Disable Query API for the isolated fixture gates.');
  if(!/^[1-9][0-9]{0,4}$/.test(portText)||!Number.isSafeInteger(port)||port>65535||
     !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(projectId)||
     !['auto','http','codex_cli'].includes(provider))
    throw Error('Query API requires valid OPENDESK_SUPPORT_QUERY_PORT, OPENDESK_SUPPORT_PROJECT_ID and provider.');
  config.queryApi={port,projectId,modelProvider:provider};
}
if(verifyAI==='1'&&!config.queryApi)throw Error('--verify-ai requires an explicitly verified local Query API and test project.');
writeFileSync(evidence+'/launch.json',JSON.stringify(config,null,2));
JS
git rev-parse HEAD > "$EVIDENCE/head.txt"
git diff --stat > "$EVIDENCE/dirty-stat.txt"
shasum -a 256 "$CHAT_BIN" dist/OpenDesk.app/Contents/MacOS/opendesk "dist/OpenDesk.app/Contents/Helpers/OpenDesk UI.app/Contents/MacOS/opendesk-ui-host" "$PREVIEW" > "$EVIDENCE/artifact-sha256.txt"
shasum -a 256 examples/ai-customer-support/native-demo.js examples/ai-customer-support/desktop/native-adapter.js examples/ai-customer-support/desktop/query-api-adapter.js tests/custom-ui/ai-customer-support-r23-native.js tests/custom-ui/tools/support-chat/main.swift > "$EVIDENCE/source-sha256.txt"
shasum -a 256 examples/ai-customer-support/desktop/controlled-reply.js examples/ai-customer-support/desktop/fixture-automation.js examples/ai-customer-support/desktop/business-validator.generated.js >> "$EVIDENCE/source-sha256.txt"
shasum -a 256 examples/ai-customer-support/scripts/run-desktop.sh examples/ai-customer-support/scripts/local-query.py >> "$EVIDENCE/source-sha256.txt"
if [[ "$VERIFY_CONTROLLED" == 1 ]]; then
  shasum -a 256 tests/custom-ui/ai-customer-support-controlled-native.js >> "$EVIDENCE/source-sha256.txt"
fi
if [[ "$VERIFY_AI" == 1 ]]; then
  shasum -a 256 tests/custom-ui/ai-customer-support-r30b-native.js >> "$EVIDENCE/source-sha256.txt"
fi
printf 'R2.3 evidence: %s\n' "$EVIDENCE"
OPENDESK_SUPPORT_LAUNCH="$EVIDENCE/launch.json" ./scripts/run_macos_stable.sh -ui \
  -script examples/ai-customer-support/native-demo.js -console-mode script > >(tee "$EVIDENCE/runtime.log") 2>&1 &
RUNTIME_PID=$!
node --input-type=module - "$EVIDENCE" "$$" "$RUNTIME_PID" "$CHAT_PID" "$QUERY_PID" <<'JS'
import {writeFileSync} from 'node:fs';
const [dir,launcher,runtime,fixture,query]=process.argv.slice(2);
writeFileSync(dir+'/owned-processes.json',JSON.stringify({launcher:Number(launcher),runtime:Number(runtime),fixture:Number(fixture),query:query?Number(query):null},null,2)+'\n');
JS
wait "$RUNTIME_PID"
