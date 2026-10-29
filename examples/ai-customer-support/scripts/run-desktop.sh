#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"
VERIFY=0
VERIFY_AI=0
[[ "${1:-}" != --verify ]] || { VERIFY=1; shift; }
[[ "${1:-}" != --verify-ai ]] || { VERIFY_AI=1; shift; }
[[ "$#" == 0 && "$VERIFY$VERIFY_AI" != 11 ]] || { echo 'Usage: run-desktop.sh [--verify|--verify-ai]' >&2; exit 2; }
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
EVIDENCE="$ROOT_DIR/.runtime/tests/ai-customer-support/r23/runs/$RUN_ID"
mkdir -p "$EVIDENCE"
OPENDESK_SUPPORT_CHAT_ORACLE="$EVIDENCE/fixture-oracle.json" "$CHAT_BIN" >"$EVIDENCE/chat.log" 2>&1 &
CHAT_PID=$!
cleanup_demo() {
  # Graceful SIGTERM is only for the exact child created by this launcher.
  if kill -0 "$CHAT_PID" 2>/dev/null; then kill -TERM "$CHAT_PID"; fi
  wait "$CHAT_PID" 2>/dev/null || true
}
trap cleanup_demo EXIT INT TERM
# Wait for this child's AppKit window creation before per-PID observer setup.
# This diagnostic file supplies readiness only; the adapter never reads it.
for ((attempt=0; attempt<150; attempt++)); do
  [[ ! -s "$EVIDENCE/fixture-oracle.json" ]] || break
  kill -0 "$CHAT_PID" 2>/dev/null || { echo 'Test chat exited before readiness.' >&2; exit 1; }
  sleep 0.1
done
[[ -s "$EVIDENCE/fixture-oracle.json" ]] || { echo 'Test chat startup timed out.' >&2; exit 1; }
node --input-type=module - "$CHAT_PID" "$CHAT_BIN" "$PREVIEW" "$EVIDENCE" "$VERIFY" "$VERIFY_AI" <<'JS'
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [pid,exePath,preview,evidence,verify,verifyAI]=process.argv.slice(2);
const config={schemaVersion:1,pid:Number(pid),exePath,evidence,verify:verify==='1',
  verifyAI:verifyAI==='1',
  previewSha256:createHash('sha256').update(readFileSync(preview)).digest('hex')};
// Explicit per-launch project mapping. No arbitrary URL, remote host or UI-supplied
// project ID is accepted. Never include credentials in the evidence folder.
const portText=(process.env.OPENDESK_SUPPORT_QUERY_PORT||'').trim();
const projectId=(process.env.OPENDESK_SUPPORT_PROJECT_ID||'').trim();
const provider=(process.env.OPENDESK_SUPPORT_QUERY_PROVIDER||'auto').trim();
if(portText||projectId){
  const port=Number(portText);
  if(verify==='1')throw Error('Disable Query API for the isolated native --verify demo.');
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
shasum -a 256 "$CHAT_BIN" dist/OpenDesk.app/Contents/MacOS/opendesk dist/OpenDesk.app/Contents/Helpers/opendesk-ui-host "$PREVIEW" > "$EVIDENCE/artifact-sha256.txt"
shasum -a 256 examples/ai-customer-support/native-demo.js examples/ai-customer-support/desktop/native-adapter.js examples/ai-customer-support/desktop/query-api-adapter.js tests/custom-ui/ai-customer-support-r23-native.js tests/custom-ui/tools/support-chat/main.swift > "$EVIDENCE/source-sha256.txt"
if [[ "$VERIFY_AI" == 1 ]]; then
  shasum -a 256 tests/custom-ui/ai-customer-support-r30b-native.js >> "$EVIDENCE/source-sha256.txt"
fi
printf 'R2.3 evidence: %s\n' "$EVIDENCE"
OPENDESK_SUPPORT_LAUNCH="$EVIDENCE/launch.json" ./scripts/run_macos_stable.sh -ui \
  -script examples/ai-customer-support/native-demo.js -console-mode script 2>&1 | tee "$EVIDENCE/runtime.log"
