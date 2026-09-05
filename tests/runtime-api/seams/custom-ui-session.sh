#!/usr/bin/env bash
set -euo pipefail

# Explicit Custom UI process lifecycle seam. It remains shell because the HTTP
# server must stay alive while separate executions cancel it or receive SIGTERM.
ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT_DIR"
RUN_ID="${OPENDESK_RUNTIME_API_RUN_ID:?missing OPENDESK_RUNTIME_API_RUN_ID}"
RUN_DIR="${OPENDESK_RUNTIME_API_RUN_DIR:?missing OPENDESK_RUNTIME_API_RUN_DIR}"
CONTEXT="$RUN_DIR/context.json"
PROCESSES="$RUN_DIR/processes.json"
BINARY="${OPENDESK_RUNTIME_API_BINARY:?missing OPENDESK_RUNTIME_API_BINARY}"
WATCHDOG="$ROOT_DIR/tests/runtime-api/run_with_timeout.py"

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
custom_ui_http_lifecycle() {
  local ui_host="$1" floating_evidence="$2" port server="" base
  local source="$ROOT_DIR/tests/runtime-api/custom-ui/floating-window-http-lifecycle.probe.js"
  local server_root="$RUN_DIR/runtime-logs/custom-ui-http-server"
  mkdir -p "$server_root" "$RUN_DIR/custom-ui-http"
  port="$(python3 - <<'PY'
import socket
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
print(sock.getsockname()[1])
sock.close()
PY
)"
  base="http://127.0.0.1:$port"
  cleanup_custom_ui_http_server() {
    if [[ -n "$server" ]] && kill -0 "$server" >/dev/null 2>&1; then
      kill -TERM "$server" >/dev/null 2>&1 || true
      wait "$server" 2>/dev/null || true
    fi
  }
  trap cleanup_custom_ui_http_server RETURN
  "$BINARY" -http -ui -ui-host "$ui_host" -port "$port" \
    -scheduler-db "$RUN_DIR/custom-ui-http/scheduler.db" -console-mode agent \
    >"$server_root/stdout.log" 2>"$server_root/stderr.log" &
  server=$!
  record runtime "$server" custom-ui-http-server
  for _ in $(seq 1 150); do
    /usr/bin/curl --silent --max-time 1 "$base/status" >/dev/null 2>&1 && break
    kill -0 "$server" >/dev/null 2>&1 || { echo "Custom UI HTTP server exited before ready" >&2; return 1; }
    sleep 0.1
  done
  /usr/bin/curl --fail --silent --show-error --max-time 2 "$base/status" >/dev/null

  submit_custom_ui_http_probe() {
    local probe="$1" log_dir="$2" request="$3" response="$4" timeout="${5:-120}"
    mkdir -p "$log_dir"
    python3 - "$source" "$probe" "$log_dir" "$request" "$timeout" <<'PY'
import json, pathlib, sys
source, probe, log_dir, output, timeout = sys.argv[1:]
script = "globalThis.RUNTIME_API_EXTRA = " + json.dumps({"lifecycleProbe": probe}) + ";\n" + pathlib.Path(source).read_text(encoding="utf-8")
payload = {"script": script, "timeout": int(timeout), "stack": "legacy", "consoleMode": "script", "logDir": log_dir, "capabilities": ["ui"]}
pathlib.Path(output).write_text(json.dumps(payload), encoding="utf-8")
PY
    /usr/bin/curl --fail --silent --show-error --max-time 5 -H 'Content-Type: application/json' \
      --data-binary "@$request" "$base/executions" >"$response"
    python3 - "$response" <<'PY'
import json, sys
value = json.load(open(sys.argv[1], encoding="utf-8"))
if value.get("code") != 0 or not (value.get("data") or {}).get("executionId"):
    raise SystemExit("HTTP execution creation failed: " + json.dumps(value))
print(value["data"]["executionId"])
PY
  }

  wait_custom_ui_http_ready() {
    local events="$1"
    for _ in $(seq 1 150); do
      [[ -f "$events" ]] && grep -Fq '[FLOATING-HTTP-READY]' "$events" && return 0
      kill -0 "$server" >/dev/null 2>&1 || return 1
      sleep 0.1
    done
    echo "HTTP FloatingWindow did not reach visible busy state: $events" >&2
    return 1
  }

  local timeout_log="$RUN_DIR/runtime-logs/custom-ui-http-timeout"
  local timeout_request="$RUN_DIR/custom-ui-http/timeout-request.json" timeout_response="$RUN_DIR/custom-ui-http/timeout-response.json" timeout_id
  timeout_id="$(submit_custom_ui_http_probe httpTimeoutAndUnresolvedPromise "$timeout_log" "$timeout_request" "$timeout_response" 1)"
  wait_custom_ui_http_ready "$timeout_log/events.ndjson"
  for _ in $(seq 1 150); do
    /usr/bin/curl --fail --silent --show-error --max-time 2 "$base/executions/$timeout_id" >"$RUN_DIR/custom-ui-http/timeout-status.json"
    [[ "$(python3 - "$RUN_DIR/custom-ui-http/timeout-status.json" <<'PY'
import json, sys
print((json.load(open(sys.argv[1], encoding="utf-8")).get("data") or {}).get("status", ""))
PY
)" == timed_out ]] && break
    sleep 0.1
  done
  [[ "$(python3 - "$RUN_DIR/custom-ui-http/timeout-status.json" <<'PY'
import json, sys
print((json.load(open(sys.argv[1], encoding="utf-8")).get("data") or {}).get("status", ""))
PY
)" == timed_out ]] || { echo "HTTP FloatingWindow timeout did not become terminal" >&2; return 1; }
  verify_zero_cleanup custom-ui-http-timeout timeoutAndUnresolvedPromise

  local cancel_log="$RUN_DIR/runtime-logs/custom-ui-http-cancel"
  local cancel_request="$RUN_DIR/custom-ui-http/cancel-request.json" cancel_response="$RUN_DIR/custom-ui-http/cancel-response.json" cancel_id
  cancel_id="$(submit_custom_ui_http_probe httpCancel "$cancel_log" "$cancel_request" "$cancel_response")"
  wait_custom_ui_http_ready "$cancel_log/events.ndjson"
  /usr/bin/curl --fail --silent --show-error --max-time 5 -X DELETE "$base/executions/$cancel_id" >"$RUN_DIR/custom-ui-http/cancel-delete.json"
  for _ in $(seq 1 150); do
    /usr/bin/curl --fail --silent --show-error --max-time 2 "$base/executions/$cancel_id" >"$RUN_DIR/custom-ui-http/cancel-status.json"
    [[ "$(python3 - "$RUN_DIR/custom-ui-http/cancel-status.json" <<'PY'
import json, sys
print((json.load(open(sys.argv[1], encoding="utf-8")).get("data") or {}).get("status", ""))
PY
)" == canceled ]] && break
    sleep 0.1
  done
  [[ "$(python3 - "$RUN_DIR/custom-ui-http/cancel-status.json" <<'PY'
import json, sys
print((json.load(open(sys.argv[1], encoding="utf-8")).get("data") or {}).get("status", ""))
PY
)" == canceled ]] || { echo "HTTP FloatingWindow cancellation did not become terminal" >&2; return 1; }
  verify_zero_cleanup custom-ui-http-cancel httpCancel

  local shutdown_log="$RUN_DIR/runtime-logs/custom-ui-server-shutdown"
  local shutdown_request="$RUN_DIR/custom-ui-http/shutdown-request.json" shutdown_response="$RUN_DIR/custom-ui-http/shutdown-response.json"
  submit_custom_ui_http_probe serverShutdown "$shutdown_log" "$shutdown_request" "$shutdown_response" >/dev/null
  wait_custom_ui_http_ready "$shutdown_log/events.ndjson"
  kill -TERM "$server"
  wait "$server"
  server=""
  verify_zero_cleanup custom-ui-server-shutdown serverShutdown
  python3 - "$floating_evidence/result.json" "$RUN_DIR/results/custom-ui.json" <<'PY'
import json, sys
path, gate_path = sys.argv[1:]
value = json.load(open(path, encoding="utf-8"))
value.setdefault("lifecycle", {})["httpCancel"] = "passed"
value.setdefault("lifecycle", {})["serverShutdown"] = "passed"
json.dump(value, open(path, "w", encoding="utf-8"), indent=2)
gate = json.load(open(gate_path, encoding="utf-8"))
gate["lifecycleProbes"] = {
  "scriptException": "passed", "timeout": "passed", "unresolvedPromise": "passed",
  "httpCancel": "passed", "serverShutdown": "passed", "resourceCleanup": "passed",
}
json.dump(gate, open(gate_path, "w", encoding="utf-8"), indent=2)
PY
  trap - RETURN
}

begin_custom_ui_post_suite() {
  local behavior_status="$1" behavior_path="$RUN_DIR/results/custom-ui-behavior.json" gate_path="$RUN_DIR/results/custom-ui.json"
  [[ -f "$behavior_path" ]] || return 0
  python3 - "$behavior_path" "$gate_path" "$behavior_status" <<'PY'
import json, sys
behavior_path, gate_path, behavior_status = sys.argv[1:]
gate = json.load(open(behavior_path, encoding="utf-8"))
gate["behaviorStatus"] = gate.get("status")
gate["behaviorFinishedAt"] = gate.get("finishedAt")
gate["gate"] = "custom-ui"
gate["status"] = "running" if int(behavior_status) == 0 else "failed"
gate["finishedAt"] = None
gate["postSuite"] = {"status": "running" if int(behavior_status) == 0 else "failed"}
json.dump(gate, open(gate_path, "w", encoding="utf-8"), indent=2)
PY
}

finalize_custom_ui_gate() {
  local final_status="$1" no_residual_status="$2" gate_path="$RUN_DIR/results/custom-ui.json"
  python3 - "$CONTEXT" "$gate_path" "$final_status" "$no_residual_status" <<'PY'
from datetime import datetime, timezone
import json, pathlib, sys
context_path, gate_path, final_status, no_residual_status = sys.argv[1:]
context = json.load(open(context_path, encoding="utf-8"))
path = pathlib.Path(gate_path)
if path.is_file():
    gate = json.loads(path.read_text(encoding="utf-8"))
else:
    gate = {
        "schemaVersion": "1.0.0", "runId": context["runId"], "gate": "custom-ui",
        "startedAt": context["startedAt"], "runtime": context["binary"], "tests": [],
        "behaviorStatus": "missing", "behaviorFinishedAt": None,
    }
passed = int(final_status) == 0
no_residual_passed = int(no_residual_status) == 0
gate["status"] = "passed" if passed else "failed"
gate["finishedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
gate.setdefault("lifecycleProbes", {})["noResidualProcesses"] = "passed" if no_residual_passed else "failed"
gate["postSuite"] = {
    "status": "passed" if passed else "failed",
    "noResidualProcesses": "passed" if no_residual_passed else "failed",
    "finalized": True,
}
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(gate, indent=2), encoding="utf-8")
PY
}

custom_ui() {
  [[ "$(uname -s)" == Darwin ]] || { echo "Custom UI native tests require Darwin" >&2; return 1; }
  local ui_host="$RUN_DIR/bin/clawdesk-ui-host" missing_dir="$RUN_DIR/missing-host-bin" status=0 no_residual_status=0
  local floating_evidence="$RUN_DIR/runtime-logs/custom-ui/floating-toolbar"
  mkdir -p "$floating_evidence"
  go build -o "$ui_host" ./cmd/opendesk-ui-host
  [[ -x "$ui_host" ]] || { echo "custom UI host was not built: $ui_host" >&2; return 1; }
  if runjs custom-ui "$ROOT_DIR/tests/runtime-api/custom-ui.js" 5 240 "" true legacy true; then :; else status=$?; fi
  begin_custom_ui_post_suite "$status"
  if [[ "$status" -eq 0 ]]; then
    if verify_zero_cleanup custom-ui normal; then :; else status=$?; fi
  fi

  if [[ "$status" -eq 0 ]]; then
    local lifecycle_source="$ROOT_DIR/tests/runtime-api/custom-ui/floating-window-lifecycle.probe.js"
    local exception_extra="$RUN_DIR/custom-ui-script-exception.json"
    python3 - "$exception_extra" <<'PY'
import json, sys
json.dump({"lifecycleProbe": "script-exception"}, open(sys.argv[1], "w", encoding="utf-8"))
PY
    if runjs custom-ui-script-exception "$lifecycle_source" 3 60 "$exception_extra" true legacy true; then
      echo "FloatingWindow script-exception probe unexpectedly succeeded" >&2
      status=1
    else
      local exception_status=$?
      [[ "$exception_status" -ne 124 ]] || status=1
      if verify_zero_cleanup custom-ui-script-exception scriptException; then :; else status=$?; fi
    fi
  fi

  if [[ "$status" -eq 0 ]]; then
    if custom_ui_http_lifecycle "$ui_host" "$floating_evidence"; then :; else status=$?; fi
  fi

  if [[ "$status" -eq 0 ]]; then
    mkdir -p "$missing_dir"
    cp -p "$BINARY" "$missing_dir/opendesk"
    local generated="$RUN_DIR/generated/custom-ui-missing-host.generated.js" pidfile="$RUN_DIR/processes/custom-ui-missing-host.json"
    generate "$ROOT_DIR/tests/runtime-api/custom-ui-missing-host.js" "$generated" ""
    set +e
    python3 "$WATCHDOG" --seconds 120 --pid-file "$pidfile" -- "$missing_dir/opendesk" -ui -script "$generated" -console-mode script -timeout 3 -log-dir "$RUN_DIR/runtime-logs/custom-ui-missing-host" &
    local watchdog=$!
    wait "$watchdog"
    local missing_status=$?
    set -e
    record_watchdog custom-ui-missing-host "$watchdog"
    [[ "$missing_status" -eq 0 ]] || status="$missing_status"
  fi
  if no_residual; then
    if [[ -f "$floating_evidence/result.json" ]]; then python3 - "$floating_evidence/resources.json" "$floating_evidence/result.json" <<'PY'
import json, pathlib, sys
resources_path, result_path = map(pathlib.Path, sys.argv[1:])
resources = json.loads(resources_path.read_text(encoding="utf-8")) if resources_path.is_file() else {"schemaVersion": 1}
resources["noResidualProcesses"] = "passed"
resources_path.write_text(json.dumps(resources, indent=2), encoding="utf-8")
result = json.loads(result_path.read_text(encoding="utf-8"))
result.setdefault("lifecycle", {})["noResidualProcesses"] = "passed"
result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
PY
    fi
  else
    no_residual_status=$?
    status="$no_residual_status"
  fi
  if finalize_custom_ui_gate "$status" "$no_residual_status"; then :; else status=$?; fi
  return "$status"
}

no_residual() {
  local residual
  residual="$(ps -axo pid=,command= | awk -v self="$$" -v parent="$PPID" -v run="$RUN_DIR" '$1 != self && $1 != parent && index($0, run) > 0 { print }')"
  [[ -z "$residual" ]] || { echo "[RUNTIME-API] residual test process: $residual" >&2; return 1; }
  echo "[RUNTIME-API-CLEANUP] no runtime, watchdog, fixture server, or run-scoped mouse process remains"
}

verify_zero_cleanup() {
  local gate="$1" record="${2:-$1}" events="$RUN_DIR/runtime-logs/$1/events.ndjson"
  local evidence_dir="$RUN_DIR/runtime-logs/$1"
  if [[ "$gate" == custom-ui* ]]; then evidence_dir="$RUN_DIR/runtime-logs/custom-ui/floating-toolbar"; fi
  python3 - "$events" "$evidence_dir" "$record" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
evidence_dir = pathlib.Path(sys.argv[2])
record = sys.argv[3]
if not path.is_file():
    raise SystemExit("missing lifecycle events: " + str(path))
cleanup = None
for line in path.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    event = json.loads(line)
    if event.get("kind") == "cleanup":
        cleanup = event.get("fields") or {}
if cleanup is None:
    raise SystemExit("runtime cleanup event is missing")
required = [
    "workers", "promiseCallbacks", "timers",
    "httpWorkers", "httpCallbacks",
    "soundWorkers", "soundPending", "soundPlaybacks",
    "notificationWorkers", "notificationPending",
    "uiWorkers", "uiPending", "uiQueued", "uiWindows", "uiListeners", "uiDriverSinks", "uiHostProcesses",
    "shortcutBindings", "shortcutPending",
    "eventSubscriptions", "eventPending",
    "captureWorkers", "capturePending", "captureSessions",
    "appWorkers", "appPending",
    "commandWorkers", "commandCallbacks", "commandProcesses",
    "fileJSONWorkers", "fileJSONCallbacks", "fileJSONTemps", "fileHandles",
]
bad = {key: cleanup.get(key) for key in required if cleanup.get(key) != 0}
if bad:
    raise SystemExit("runtime cleanup is not zero: " + json.dumps(bad, sort_keys=True))
counts = {key: cleanup[key] for key in required}
evidence_dir.mkdir(parents=True, exist_ok=True)
resources_path = evidence_dir / "resources.json"
resources = json.loads(resources_path.read_text(encoding="utf-8")) if resources_path.is_file() else {"schemaVersion": 1}
resources[record] = counts
resources_path.write_text(json.dumps(resources, indent=2), encoding="utf-8")
result_path = evidence_dir / "result.json"
if result_path.is_file():
    result = json.loads(result_path.read_text(encoding="utf-8"))
    result.setdefault("lifecycle", {}).setdefault("resourceZero", {})[record] = counts
    result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
print("[RUNTIME-API-UI-CLEANUP] " + json.dumps(counts, sort_keys=True))
PY
}

custom_ui
