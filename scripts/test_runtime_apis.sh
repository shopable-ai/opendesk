#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="$*"
[[ -n "$MODE" ]] || MODE=smoke
WATCHDOG="$ROOT_DIR/tests/runtime-api/run_with_timeout.py"

if ! printenv CLAWDESK_RUNTIME_API_LIVE_FILTER >/dev/null 2>&1 && printenv HOST_API_LIVE_FILTER >/dev/null 2>&1; then
  export CLAWDESK_RUNTIME_API_LIVE_FILTER="$(printenv HOST_API_LIVE_FILTER)"
  echo "[RUNTIME-API] mapped deprecated HOST_API_LIVE_FILTER"
fi
if ! printenv CLAWDESK_RUNTIME_API_BROWSER_APP >/dev/null 2>&1 && printenv HOST_API_BROWSER_APP >/dev/null 2>&1; then
  export CLAWDESK_RUNTIME_API_BROWSER_APP="$(printenv HOST_API_BROWSER_APP)"
  echo "[RUNTIME-API] mapped deprecated HOST_API_BROWSER_APP"
fi

cd "$ROOT_DIR"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
if printenv CLAWDESK_RUNTIME_API_RUN_ID >/dev/null 2>&1 && [[ -n "$CLAWDESK_RUNTIME_API_RUN_ID" ]]; then RUN_ID="$CLAWDESK_RUNTIME_API_RUN_ID"; fi
RUN_DIR="$ROOT_DIR/.runtime/tests/runtime-api/$RUN_ID"
mkdir -p "$RUN_DIR/results" "$RUN_DIR/generated" "$RUN_DIR/processes"
CONTEXT="$RUN_DIR/context.json"
PROCESSES="$RUN_DIR/processes.json"

if printenv CLAWDESK_BINARY >/dev/null 2>&1 && [[ -n "$CLAWDESK_BINARY" ]]; then
  BINARY="$(cd "$(dirname "$CLAWDESK_BINARY")" && pwd)/$(basename "$CLAWDESK_BINARY")"
  BUILD_SOURCE=CLAWDESK_BINARY
else
  BINARY="$RUN_DIR/bin/clawdesk"
  mkdir -p "$(dirname "$BINARY")"
  go build -o "$BINARY" .
  BUILD_SOURCE="go build current working tree"
fi
[[ -x "$BINARY" ]] || { echo "CLAWDESK_BINARY is not executable: $BINARY" >&2; exit 1; }

export CLAWDESK_RUNTIME_API_RUN_ID="$RUN_ID"
export CLAWDESK_RUNTIME_API_RUN_DIR="$RUN_DIR"
export CLAWDESK_RUNTIME_API_BINARY="$BINARY"
export CLAWDESK_RUNTIME_API_BINARY_SHA256="$(shasum -a 256 "$BINARY" | awk '{print $1}')"
export CLAWDESK_RUNTIME_API_BUILD_SOURCE="$BUILD_SOURCE"
export CLAWDESK_RUNTIME_API_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export CLAWDESK_RUNTIME_API_GIT_COMMIT="$(git rev-parse HEAD)"
export CLAWDESK_RUNTIME_API_GIT_DIRTY=false
[[ -z "$(git status --porcelain)" ]] || export CLAWDESK_RUNTIME_API_GIT_DIRTY=true
if [[ "$(printenv CLAWDESK_RUNTIME_API_BROWSER_APP 2>/dev/null || true)" == "" ]]; then export CLAWDESK_RUNTIME_API_BROWSER_APP=Safari; fi

python3 - "$CONTEXT" "$PROCESSES" <<'PY'
import json, os, platform, sys
context = {
  "schemaVersion": "1.0.0", "runId": os.environ["CLAWDESK_RUNTIME_API_RUN_ID"],
  "runDir": os.environ["CLAWDESK_RUNTIME_API_RUN_DIR"], "startedAt": os.environ["CLAWDESK_RUNTIME_API_STARTED_AT"],
  "git": {"commit": os.environ["CLAWDESK_RUNTIME_API_GIT_COMMIT"], "dirty": os.environ["CLAWDESK_RUNTIME_API_GIT_DIRTY"] == "true"},
  "environment": {"os": platform.system(), "arch": platform.machine(), "browser": os.environ["CLAWDESK_RUNTIME_API_BROWSER_APP"]},
  "binary": {"path": os.environ["CLAWDESK_RUNTIME_API_BINARY"], "sha256": os.environ["CLAWDESK_RUNTIME_API_BINARY_SHA256"], "buildSource": os.environ["CLAWDESK_RUNTIME_API_BUILD_SOURCE"]},
}
json.dump(context, open(sys.argv[1], "w", encoding="utf-8"), indent=2)
json.dump({"schemaVersion": "1.0.0", "runId": context["runId"], "records": []}, open(sys.argv[2], "w", encoding="utf-8"), indent=2)
PY

record() {
  python3 - "$PROCESSES" "$1" "$2" "$3" <<'PY'
import json, sys
value = json.load(open(sys.argv[1], encoding="utf-8"))
value["records"].append({"role": sys.argv[2], "pid": int(sys.argv[3]), "source": sys.argv[4]})
json.dump(value, open(sys.argv[1], "w", encoding="utf-8"), indent=2)
PY
}

record_watchdog() {
  local gate="$1" watchdog="$2" pidfile="$RUN_DIR/processes/$1.json"
  record watchdog "$watchdog" "$gate"
  [[ -f "$pidfile" ]] || return 0
  python3 - "$PROCESSES" "$pidfile" "$gate" <<'PY'
import json, sys
records = json.load(open(sys.argv[1], encoding="utf-8"))
process = json.load(open(sys.argv[2], encoding="utf-8"))
records["records"].append({"role": "runtime", "pid": int(process["runtimePid"]), "processGroupId": int(process["processGroupId"]), "watchdogPid": int(process["watchdogPid"]), "gate": sys.argv[3], "command": process["command"]})
json.dump(records, open(sys.argv[1], "w", encoding="utf-8"), indent=2)
PY
}

generate() {
  local source="$1" output="$2" extra=""
  [[ $# -lt 3 ]] || extra="$3"
  python3 - "$CONTEXT" "$source" "$output" "$extra" <<'PY'
import json, pathlib, sys
context, source, output, extra = sys.argv[1:]
prefix = "globalThis.CLAWDESK_RUNTIME_API_CONTEXT = " + json.dumps(json.load(open(context, encoding="utf-8")), ensure_ascii=False) + ";\n"
if extra:
  data = json.load(open(extra, encoding="utf-8"))
  prefix += "globalThis.RUNTIME_API_EXTRA = " + json.dumps(data, ensure_ascii=False) + ";\n"
  if "fixture" in data:
    prefix += "globalThis.RUNTIME_API_FIXTURE = " + json.dumps(data["fixture"], ensure_ascii=False) + ";\n"
pathlib.Path(output).write_text(prefix + pathlib.Path(source).read_text(encoding="utf-8"), encoding="utf-8")
PY
}

runjs() {
  local gate="$1" source="$2" timeout="$3" deadline="$4" extra="" track=true
  [[ $# -lt 5 ]] || extra="$5"
  [[ $# -lt 6 ]] || track="$6"
  local generated="$RUN_DIR/generated/$gate.generated.js" pidfile="$RUN_DIR/processes/$gate.json"
  generate "$source" "$generated" "$extra"
  set +e
  SKIP_FYNE_INIT=1 python3 "$WATCHDOG" --seconds "$deadline" --pid-file "$pidfile" -- "$BINARY" -script "$generated" -console-mode script -timeout "$timeout" &
  local watchdog=$!
  wait "$watchdog"
  local status=$?
  set -e
  [[ "$track" != true ]] || record_watchdog "$gate" "$watchdog"
  return "$status"
}

contract() { runjs contract "$ROOT_DIR/tests/runtime-api/contract.js" 3 120; }
unit() { runjs unit "$ROOT_DIR/tests/runtime-api/unit.js" 5 180; }
coverage() { runjs coverage "$ROOT_DIR/tests/runtime-api/coverage.js" 5 180; }
smoke() { runjs smoke "$ROOT_DIR/tests/runtime-api/smoke.js" 3 120; }
negative() { runjs negative "$ROOT_DIR/tests/runtime-api/negative.js" 5 120; }

failure_exit() {
  local status=0 extra="$RUN_DIR/failure-exit.json"
  if runjs failure-exit-probe "$ROOT_DIR/tests/runtime-api/failure_exit.js" 2 15 ""; then status=0; else status=$?; fi
  python3 - "$extra" "$status" <<'PY'
import json, sys
json.dump({"exitStatus": int(sys.argv[2])}, open(sys.argv[1], "w", encoding="utf-8"))
PY
  runjs failure-exit "$ROOT_DIR/tests/runtime-api/failure_exit_result.js" 2 60 "$extra"
}

live() {
  [[ "$(uname -s)" == Darwin ]] || { echo "macOS Runtime API live tests require Darwin" >&2; return 1; }
  local ready="$RUN_DIR/fixture-ready.json" extra="$RUN_DIR/fixture-extra.json" server="" status=0
  cleanup_fixture() { [[ -z "$server" ]] || { kill "$server" >/dev/null 2>&1 || true; wait "$server" 2>/dev/null || true; }; }
  trap cleanup_fixture RETURN
  python3 "$ROOT_DIR/tests/runtime-api/fixture/server.py" --ready "$ready" --browser-app "$CLAWDESK_RUNTIME_API_BROWSER_APP" >"$RUN_DIR/fixture.stdout" 2>"$RUN_DIR/fixture.stderr" &
  server=$!
  record fixture-server "$server" loopback-fixture
  for _ in $(seq 1 100); do
    [[ -f "$ready" ]] && break
    kill -0 "$server" >/dev/null 2>&1 || { echo "Runtime API fixture exited before ready" >&2; return 1; }
    sleep 0.1
  done
  [[ -f "$ready" ]] || { echo "timed out waiting for Runtime API fixture" >&2; return 1; }
  python3 - "$ready" "$extra" <<'PY'
import json, os, sys
fixture = json.load(open(sys.argv[1], encoding="utf-8"))
fixture["liveFilter"] = [item.strip() for item in os.environ.get("CLAWDESK_RUNTIME_API_LIVE_FILTER", "").split(",") if item.strip()]
json.dump({"fixture": fixture}, open(sys.argv[2], "w", encoding="utf-8"))
PY
  if runjs live "$ROOT_DIR/tests/runtime-api/macos_live.js" 10 720 "$extra"; then status=0; else status=$?; fi
  cleanup_fixture
  trap - RETURN
  return "$status"
}

cleanup() { runjs cleanup "$ROOT_DIR/tests/runtime-api/cleanup_validation.js" 4 120 "" false; }
quality() { runjs quality "$ROOT_DIR/tests/runtime-api/quality_gate.js" 5 180 "" false; }

no_residual() {
  local residual
  # A concurrent Conformance Lab run in another worktree is not a child leak.
  # Every process this run creates contains RUN_DIR (script, pid file, or
  # fixture ready path), including a custom-named runtime binary.
  residual="$(ps -axo pid=,command= | awk -v self="$$" -v parent="$PPID" -v run="$RUN_DIR" '$1 != self && $1 != parent && index($0, run) > 0 { print }')"
  [[ -z "$residual" ]] || { echo "[RUNTIME-API] residual test process: $residual" >&2; return 1; }
  echo "[RUNTIME-API-CLEANUP] no runtime, watchdog, fixture server, or run-scoped mouse process remains"
}

live_only_with_cleanup() {
  local status=0
  if live; then :; else status=$?; fi
  if cleanup; then :; else status=$?; fi
  if no_residual; then :; else status=$?; fi
  return "$status"
}

live_suite() {
  local status=0
  if contract; then :; else status=$?; fi
  if [[ "$status" -eq 0 ]]; then if unit; then :; else status=$?; fi; fi
  if [[ "$status" -eq 0 ]]; then if smoke; then :; else status=$?; fi; fi
  if [[ "$status" -eq 0 ]]; then if failure_exit; then :; else status=$?; fi; fi
  if [[ "$status" -eq 0 ]]; then if negative; then :; else status=$?; fi; fi
  if [[ "$status" -eq 0 ]]; then if live; then :; else status=$?; fi; fi
  if [[ "$status" -eq 0 ]]; then if coverage; then :; else status=$?; fi; fi
  if cleanup; then :; else status=$?; fi
  if no_residual; then :; else status=$?; fi
  if [[ "$status" -eq 0 ]]; then if quality; then :; else status=$?; fi; fi
  return "$status"
}

case "$MODE" in
  contract) contract ;;
  unit) unit ;;
  smoke) contract; unit; smoke; failure_exit; negative ;;
  live) live_suite ;;
  live-only) live_only_with_cleanup ;;
  coverage) coverage ;;
  negative) negative ;;
  *) echo "usage: $0 [contract|unit|smoke|live|live-only|coverage|negative]" >&2; exit 2 ;;
esac
