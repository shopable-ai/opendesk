#!/usr/bin/env bash
set -euo pipefail

# Explicit macOS live fixture lifecycle seam. The Runtime JS runner owns mode
# selection, context, assertions, and final cleanup reporting.
ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT_DIR"
RUN_ID="${OPENDESK_RUNTIME_API_RUN_ID:?missing OPENDESK_RUNTIME_API_RUN_ID}"
RUN_DIR="${OPENDESK_RUNTIME_API_RUN_DIR:?missing OPENDESK_RUNTIME_API_RUN_DIR}"
CONTEXT="$RUN_DIR/context.json"
PROCESSES="$RUN_DIR/processes.json"
BINARY="${OPENDESK_RUNTIME_API_BINARY:?missing OPENDESK_RUNTIME_API_BINARY}"
WATCHDOG="$ROOT_DIR/tests/runtime-api/run_with_timeout.py"
OPENDESK_RUNTIME_API_BROWSER_APP="${OPENDESK_RUNTIME_API_BROWSER_APP:-Safari}"

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
prefix = "globalThis.OPENDESK_RUNTIME_API_CONTEXT = " + json.dumps(json.load(open(context, encoding="utf-8")), ensure_ascii=False) + ";\n"
if extra:
  data = json.load(open(extra, encoding="utf-8"))
  prefix += "globalThis.RUNTIME_API_EXTRA = " + json.dumps(data, ensure_ascii=False) + ";\n"
  if "fixture" in data:
    prefix += "globalThis.RUNTIME_API_FIXTURE = " + json.dumps(data["fixture"], ensure_ascii=False) + ";\n"
pathlib.Path(output).write_text(prefix + pathlib.Path(source).read_text(encoding="utf-8"), encoding="utf-8")
PY
}

runjs() {
  local gate="$1" source="$2" timeout="$3" deadline="$4" extra="" track=true stack="legacy" enable_ui=false
  [[ $# -lt 5 ]] || extra="$5"
  [[ $# -lt 6 ]] || track="$6"
  [[ $# -lt 7 ]] || stack="$7"
  [[ $# -lt 8 ]] || enable_ui="$8"
  local generated="$RUN_DIR/generated/$gate.generated.js" pidfile="$RUN_DIR/processes/$gate.json"
  generate "$source" "$generated" "$extra"
  set +e
  local runtime_args=(-script "$generated" -stack "$stack" -console-mode script -timeout "$timeout" -log-dir "$RUN_DIR/runtime-logs/$gate")
  [[ "$enable_ui" != true ]] || runtime_args=(-ui "${runtime_args[@]}")
  python3 "$WATCHDOG" --seconds "$deadline" --pid-file "$pidfile" -- "$BINARY" "${runtime_args[@]}" &
  local watchdog=$!
  wait "$watchdog"
  local status=$?
  set -e
  [[ "$track" != true ]] || record_watchdog "$gate" "$watchdog"
  return "$status"
}

# Start a public JavaScript Runtime API test without waiting for it. Dialog's
# native Promise intentionally keeps an observed top-level await pending while
# the same formal gate verifies the real AX control and starts a second public
# JavaScript controller to press it.
STARTED_WATCHDOG=""
STARTED_GATE=""
live() {
  [[ "$(uname -s)" == Darwin ]] || { echo "macOS Runtime API live tests require Darwin" >&2; return 1; }
  local ready="$RUN_DIR/fixture-ready.json" extra="$RUN_DIR/fixture-extra.json" server="" status=0
  cleanup_fixture() { [[ -z "$server" ]] || { kill "$server" >/dev/null 2>&1 || true; wait "$server" 2>/dev/null || true; }; }
  trap cleanup_fixture RETURN
  python3 "$ROOT_DIR/tests/runtime-api/fixture/server.py" --ready "$ready" --browser-app "$OPENDESK_RUNTIME_API_BROWSER_APP" >"$RUN_DIR/fixture.stdout" 2>"$RUN_DIR/fixture.stderr" &
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
fixture["liveFilter"] = [item.strip() for item in os.environ.get("OPENDESK_RUNTIME_API_LIVE_FILTER", "").split(",") if item.strip()]
json.dump({"fixture": fixture}, open(sys.argv[2], "w", encoding="utf-8"))
PY
  if runjs live "$ROOT_DIR/tests/runtime-api/macos_live.js" 10 720 "$extra"; then status=0; else status=$?; fi
  cleanup_fixture
  trap - RETURN
  return "$status"
}


live
