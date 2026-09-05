#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="$*"
[[ -n "$MODE" ]] || MODE=smoke
WATCHDOG="$ROOT_DIR/tests/runtime-api/run_with_timeout.py"

if ! printenv OPENDESK_RUNTIME_API_LIVE_FILTER >/dev/null 2>&1 && printenv HOST_API_LIVE_FILTER >/dev/null 2>&1; then
  export OPENDESK_RUNTIME_API_LIVE_FILTER="$(printenv HOST_API_LIVE_FILTER)"
  echo "[RUNTIME-API] mapped deprecated HOST_API_LIVE_FILTER"
fi
if ! printenv OPENDESK_RUNTIME_API_BROWSER_APP >/dev/null 2>&1 && printenv HOST_API_BROWSER_APP >/dev/null 2>&1; then
  export OPENDESK_RUNTIME_API_BROWSER_APP="$(printenv HOST_API_BROWSER_APP)"
  echo "[RUNTIME-API] mapped deprecated HOST_API_BROWSER_APP"
fi

cd "$ROOT_DIR"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
if printenv OPENDESK_RUNTIME_API_RUN_ID >/dev/null 2>&1 && [[ -n "$OPENDESK_RUNTIME_API_RUN_ID" ]]; then RUN_ID="$OPENDESK_RUNTIME_API_RUN_ID"; fi
if [[ ! "$RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "invalid Runtime API run id: $RUN_ID" >&2
  exit 1
fi
RUN_DIR="$ROOT_DIR/.runtime/tests/runtime-api/$RUN_ID"
if [[ -e "$RUN_DIR" ]]; then
  rm -rf -- "$RUN_DIR"
fi
mkdir -p "$RUN_DIR/results" "$RUN_DIR/generated" "$RUN_DIR/processes" "$RUN_DIR/runtime-logs"
CONTEXT="$RUN_DIR/context.json"
PROCESSES="$RUN_DIR/processes.json"
BINARY="$RUN_DIR/bin/opendesk"
mkdir -p "$(dirname "$BINARY")"
BINARY_ORIGINAL_PATH=""
BINARY_ORIGINAL_SHA256=""

if printenv OPENDESK_BINARY >/dev/null 2>&1 && [[ -n "$OPENDESK_BINARY" ]]; then
  [[ -f "$OPENDESK_BINARY" ]] || { echo "OPENDESK_BINARY is not a regular file: $OPENDESK_BINARY" >&2; exit 1; }
  [[ -x "$OPENDESK_BINARY" ]] || { echo "OPENDESK_BINARY is not executable: $OPENDESK_BINARY" >&2; exit 1; }
  BINARY_ORIGINAL_PATH="$(cd "$(dirname "$OPENDESK_BINARY")" && pwd)/$(basename "$OPENDESK_BINARY")"
  BINARY_ORIGINAL_SHA256="$(shasum -a 256 "$BINARY_ORIGINAL_PATH" | awk '{print $1}')"
  BINARY_STAGE="$RUN_DIR/bin/.opendesk-stage-$$"
  cp -p "$BINARY_ORIGINAL_PATH" "$BINARY_STAGE"
  mv "$BINARY_STAGE" "$BINARY"
  BINARY_PROVENANCE="external_binary_copy"
  BUILD_SOURCE="verified run-local copy of OPENDESK_BINARY"
else
  go build -o "$BINARY" ./cmd/opendesk
  BINARY_PROVENANCE="source_build"
  BUILD_SOURCE="go build ./cmd/opendesk"
fi
[[ -f "$BINARY" ]] || { echo "run-local OpenDesk binary is not a regular file: $BINARY" >&2; exit 1; }
[[ -x "$BINARY" ]] || { echo "run-local OpenDesk binary is not executable: $BINARY" >&2; exit 1; }
BINARY_SHA256="$(shasum -a 256 "$BINARY" | awk '{print $1}')"
if [[ "$BINARY_PROVENANCE" == "external_binary_copy" && "$BINARY_SHA256" != "$BINARY_ORIGINAL_SHA256" ]]; then
  echo "run-local OpenDesk binary hash does not match OPENDESK_BINARY" >&2
  exit 1
fi

GO_BASIC_BUNDLE="$RUN_DIR/bin/native-extensions/com.example.go-basic"
GO_BASIC_EXTENSION="$GO_BASIC_BUNDLE/bin/native-ext-go-basic"

export OPENDESK_RUNTIME_API_RUN_ID="$RUN_ID"
export OPENDESK_RUNTIME_API_RUN_DIR="$RUN_DIR"
export OPENDESK_RUNTIME_API_BINARY="$BINARY"
export OPENDESK_RUNTIME_API_BINARY_SHA256="$BINARY_SHA256"
export OPENDESK_RUNTIME_API_BUILD_SOURCE="$BUILD_SOURCE"
export OPENDESK_RUNTIME_API_BINARY_PROVENANCE="$BINARY_PROVENANCE"
export OPENDESK_RUNTIME_API_BINARY_ORIGINAL_PATH="$BINARY_ORIGINAL_PATH"
export OPENDESK_RUNTIME_API_BINARY_ORIGINAL_SHA256="$BINARY_ORIGINAL_SHA256"
export OPENDESK_RUNTIME_API_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export OPENDESK_RUNTIME_API_GIT_COMMIT="$(git rev-parse HEAD)"
export OPENDESK_RUNTIME_API_GIT_DIRTY=false
[[ -z "$(git status --porcelain)" ]] || export OPENDESK_RUNTIME_API_GIT_DIRTY=true
if [[ "$(printenv OPENDESK_RUNTIME_API_BROWSER_APP 2>/dev/null || true)" == "" ]]; then export OPENDESK_RUNTIME_API_BROWSER_APP=Safari; fi

python3 - "$CONTEXT" "$PROCESSES" <<'PY'
import json, os, platform, sys
context = {
  "schemaVersion": "1.0.0", "runId": os.environ["OPENDESK_RUNTIME_API_RUN_ID"],
  "runDir": os.environ["OPENDESK_RUNTIME_API_RUN_DIR"], "startedAt": os.environ["OPENDESK_RUNTIME_API_STARTED_AT"],
  "git": {"commit": os.environ["OPENDESK_RUNTIME_API_GIT_COMMIT"], "dirty": os.environ["OPENDESK_RUNTIME_API_GIT_DIRTY"] == "true"},
  "environment": {"os": platform.system(), "arch": platform.machine(), "browser": os.environ["OPENDESK_RUNTIME_API_BROWSER_APP"]},
  "binary": {
    "path": os.environ["OPENDESK_RUNTIME_API_BINARY"],
    "sha256": os.environ["OPENDESK_RUNTIME_API_BINARY_SHA256"],
    "buildSource": os.environ["OPENDESK_RUNTIME_API_BUILD_SOURCE"],
    "provenance": os.environ["OPENDESK_RUNTIME_API_BINARY_PROVENANCE"],
    "originalPath": os.environ.get("OPENDESK_RUNTIME_API_BINARY_ORIGINAL_PATH") or None,
    "originalSha256": os.environ.get("OPENDESK_RUNTIME_API_BINARY_ORIGINAL_SHA256") or None,
  },
  "nativeExtensions": {},
}
json.dump(context, open(sys.argv[1], "w", encoding="utf-8"), indent=2)
json.dump({"schemaVersion": "1.0.0", "runId": context["runId"], "records": []}, open(sys.argv[2], "w", encoding="utf-8"), indent=2)
PY

prepare_native_extension() {
  local extension_stage manifest_stage types_stage
  extension_stage="$GO_BASIC_EXTENSION.stage.$$"
  manifest_stage="$GO_BASIC_BUNDLE/.extension.json.stage.$$"
  types_stage="$GO_BASIC_BUNDLE/types/.index.d.ts.stage.$$"
  mkdir -p "$(dirname "$GO_BASIC_EXTENSION")" "$GO_BASIC_BUNDLE/types"
  go -C "$ROOT_DIR/examples/native-extensions/go-basic" build -o "$extension_stage" .
  cp "$ROOT_DIR/examples/native-extensions/go-basic/extension.json" "$manifest_stage"
  cp "$ROOT_DIR/examples/native-extensions/go-basic/types/index.d.ts" "$types_stage"
  mv "$extension_stage" "$GO_BASIC_EXTENSION"
  mv "$manifest_stage" "$GO_BASIC_BUNDLE/extension.json"
  mv "$types_stage" "$GO_BASIC_BUNDLE/types/index.d.ts"
  [[ -x "$GO_BASIC_EXTENSION" ]] || { echo "Go basic Native Extension is not executable: $GO_BASIC_EXTENSION" >&2; return 1; }
  local sha256 build_source
  sha256="$(shasum -a 256 "$GO_BASIC_EXTENSION" | awk '{print $1}')"
  build_source="go -C $ROOT_DIR/examples/native-extensions/go-basic build -o $GO_BASIC_EXTENSION ."
  python3 - "$CONTEXT" "$GO_BASIC_BUNDLE" "$GO_BASIC_EXTENSION" "$sha256" "$build_source" <<'PY'
import json, sys
path, bundle, executable, sha256, build_source = sys.argv[1:]
value = json.load(open(path, encoding="utf-8"))
value["nativeExtensions"] = {"goBasic": {
  "id": "com.example.go-basic", "namespace": "goBasic", "bundlePath": bundle,
  "path": executable, "sha256": sha256, "buildSource": build_source,
}}
json.dump(value, open(path, "w", encoding="utf-8"), indent=2)
PY
}

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

command() {
  runjs command "$ROOT_DIR/tests/runtime-api/command.js" 2 90
  verify_zero_cleanup command

  if [[ "$(uname -s)" != MINGW* && "$(uname -s)" != MSYS* ]]; then
    startjs command-cancel "$ROOT_DIR/tests/runtime-api/command-cancel.js" 2 90
    local stdout="$RUN_DIR/results/command-cancel.stdout.log" pidfile="$RUN_DIR/processes/command-cancel.json"
    local runtime_pid="" child_pid="" descendant_pid=""
    for _ in $(seq 1 160); do
      if [[ -f "$stdout" && -f "$pidfile" ]] && grep -q 'COMMAND_CANCEL_READY=' "$stdout"; then
        runtime_pid="$(python3 - "$pidfile" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["runtimePid"])
PY
)"
        child_pid="$(sed -n 's/.*COMMAND_CHILD_PID=\([0-9][0-9]*\).*/\1/p' "$stdout" | tail -n 1)"
        descendant_pid="$(sed -n 's/.*COMMAND_DESCENDANT_PID=\([0-9][0-9]*\).*/\1/p' "$stdout" | tail -n 1)"
        [[ -n "$runtime_pid" && -n "$child_pid" && -n "$descendant_pid" ]] && break
      fi
      sleep 0.05
    done
    [[ -n "$runtime_pid" && -n "$child_pid" && -n "$descendant_pid" ]] || {
      echo "Command cancellation probe did not expose runtime/child/descendant PIDs" >&2
      return 1
    }
    kill -0 "$child_pid" && kill -0 "$descendant_pid" || {
      echo "Command cancellation fixture exited before SIGINT" >&2
      return 1
    }
    kill -INT "$runtime_pid"
    local cancel_status=0
    if finish_startedjs; then cancel_status=0; else cancel_status=$?; fi
    [[ "$cancel_status" -ne 0 && "$cancel_status" -ne 124 ]] || {
      echo "Command cancellation did not produce a bounded canceled execution (status $cancel_status)" >&2
      return 1
    }
    for _ in $(seq 1 60); do
      if ! kill -0 "$child_pid" 2>/dev/null && ! kill -0 "$descendant_pid" 2>/dev/null; then break; fi
      sleep 0.05
    done
    ! kill -0 "$child_pid" 2>/dev/null && ! kill -0 "$descendant_pid" 2>/dev/null || {
      echo "Command teardown left child $child_pid or descendant $descendant_pid alive" >&2
      return 1
    }
    verify_zero_cleanup command-cancel
  fi
  no_residual
}

# Start a public JavaScript Runtime API test without waiting for it. Dialog's
# native Promise intentionally keeps an observed top-level await pending while
# the same formal gate verifies the real AX control and starts a second public
# JavaScript controller to press it.
STARTED_WATCHDOG=""
STARTED_GATE=""
startjs() {
  local gate="$1" source="$2" timeout="$3" deadline="$4" extra="" track=true stack="legacy" enable_ui=false
  [[ $# -lt 5 ]] || extra="$5"
  [[ $# -lt 6 ]] || track="$6"
  [[ $# -lt 7 ]] || stack="$7"
  [[ $# -lt 8 ]] || enable_ui="$8"
  local generated="$RUN_DIR/generated/$gate.generated.js" pidfile="$RUN_DIR/processes/$gate.json"
  generate "$source" "$generated" "$extra"
  local runtime_args=(-script "$generated" -stack "$stack" -console-mode script -timeout "$timeout" -log-dir "$RUN_DIR/runtime-logs/$gate")
  [[ "$enable_ui" != true ]] || runtime_args=(-ui "${runtime_args[@]}")
  python3 "$WATCHDOG" --seconds "$deadline" --pid-file "$pidfile" -- "$BINARY" "${runtime_args[@]}" >"$RUN_DIR/results/$gate.stdout.log" 2>"$RUN_DIR/results/$gate.stderr.log" &
  STARTED_WATCHDOG=$!
  STARTED_GATE="$gate"
}

finish_startedjs() {
  [[ -n "$STARTED_WATCHDOG" && -n "$STARTED_GATE" ]] || { echo "no Runtime API test is running" >&2; return 1; }
  local watchdog="$STARTED_WATCHDOG" gate="$STARTED_GATE" status=0
  set +e
  wait "$watchdog"
  status=$?
  set -e
  record_watchdog "$gate" "$watchdog"
  STARTED_WATCHDOG=""
  STARTED_GATE=""
  return "$status"
}

contract() { runjs contract "$ROOT_DIR/tests/runtime-api/contract.js" 3 120; }
unit() { prepare_native_extension; runjs unit "$ROOT_DIR/tests/runtime-api/unit.js" 5 180 "" true legacy false; }
coverage() { runjs coverage "$ROOT_DIR/tests/runtime-api/coverage.js" 5 180; }
smoke() { runjs smoke "$ROOT_DIR/tests/runtime-api/smoke.js" 3 120; }
negative() { runjs negative "$ROOT_DIR/tests/runtime-api/negative.js" 5 120; }

environment() {
  local environment_dir="$RUN_DIR/environment" env_file="$RUN_DIR/environment/project.env"
  local generated="$RUN_DIR/generated/environment.generated.js" pidfile="$RUN_DIR/processes/environment.json"
  local acceptance_stdout="$RUN_DIR/results/environment-ai-run.stdout.json"
  local acceptance_stderr="$RUN_DIR/results/environment-ai-run.stderr.log"
  local acceptance_pidfile="$RUN_DIR/processes/environment-ai-run.json"
  local example_stdout="$RUN_DIR/results/environment-example.stdout.log"
  local example_stderr="$RUN_DIR/results/environment-example.stderr.log"
  local example_pidfile="$RUN_DIR/processes/environment-example.json"
  local default_project="$RUN_DIR/environment/default-project"
  local default_stdout="$RUN_DIR/results/environment-default-files.stdout.log"
  local default_stderr="$RUN_DIR/results/environment-default-files.stderr.log"
  local default_pidfile="$RUN_DIR/processes/environment-default-files.json"
  local http_request="$RUN_DIR/environment/http-request.json" http_response="$RUN_DIR/environment/http-response.json"
  local http_status="$RUN_DIR/environment/http-status.json" port base execution_id server=""
  local watchdog status

  cleanup_environment_server() {
    if [[ -n "$server" ]] && kill -0 "$server" >/dev/null 2>&1; then
      kill -TERM "$server" >/dev/null 2>&1 || true
      wait "$server" 2>/dev/null || true
    fi
  }
  trap cleanup_environment_server RETURN

  mkdir -p "$environment_dir"
  python3 - "$env_file" <<'PY'
import pathlib, sys
pathlib.Path(sys.argv[1]).write_text(
    "OPENDESK_ENV_FILE_ONLY=file-value\n"
    "OPENDESK_ENV_PRECEDENCE=file-value\n"
    "OPENDESK_ENV_LITERAL=${SHOULD_NOT_EXPAND}\n"
    "OPENDESK_ENV_EMPTY=\n"
    "export OPENDESK_ENV_QUOTED='quoted value'\n"
    "__proto__=literal-key\n",
    encoding="utf-8",
)
PY
  python3 - "$default_project" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
(root / ".env").write_text(
    "OPENDESK_ENV_DOTENV_ONLY=dotenv-value\n"
    "OPENDESK_ENV_DEFAULT_PRECEDENCE=dotenv-value\n",
    encoding="utf-8",
)
(root / ".opendesk.env").write_text(
    "OPENDESK_ENV_OPENDESK_ONLY=opendesk-value\n"
    "OPENDESK_ENV_DEFAULT_PRECEDENCE=opendesk-value\n",
    encoding="utf-8",
)
PY
  export OPENDESK_ENV_PRECEDENCE=shell-value
  export OPENDESK_ENV_SYSTEM_ONLY='system=a=b'
  export OPENDESK_ENV_DEFAULT_PRECEDENCE=system-value
  generate "$ROOT_DIR/tests/runtime-api/environment.js" "$generated"
  set +e
  python3 "$WATCHDOG" --seconds 120 --pid-file "$pidfile" -- "$BINARY" \
    -env-file "$env_file" -script "$generated" -console-mode script -timeout 3 \
    -log-dir "$RUN_DIR/runtime-logs/environment" &
  watchdog=$!
  wait "$watchdog"
  status=$?
  set -e
  record_watchdog environment "$watchdog"
  [[ "$status" -eq 0 ]] || return "$status"
  verify_zero_cleanup environment

  set +e
  (
    cd "$default_project"
    exec python3 "$WATCHDOG" --seconds 120 --pid-file "$default_pidfile" -- \
      "$BINARY" -script "$ROOT_DIR/tests/runtime-api/acceptance/environment-default-files.js" \
      -console-mode script -timeout 3 -log-dir "$RUN_DIR/runtime-logs/environment-default-files"
  ) >"$default_stdout" 2>"$default_stderr" &
  watchdog=$!
  wait "$watchdog"
  status=$?
  set -e
  record_watchdog environment-default-files "$watchdog"
  [[ "$status" -eq 0 ]] || return "$status"
  grep -Fq '[RUNTIME-API-ENVIRONMENT] .env and .opendesk.env discovery passed' "$default_stdout" || {
    echo "environment default file discovery marker is missing" >&2
    return 1
  }
  verify_zero_cleanup environment-default-files

  set +e
  OPENDESK_EXAMPLE_MODE=runtime-gate python3 "$WATCHDOG" --seconds 120 --pid-file "$example_pidfile" -- \
    "$BINARY" -script "$ROOT_DIR/examples/environment.js" -console-mode script -timeout 3 \
    -log-dir "$RUN_DIR/runtime-logs/environment-example" \
    >"$example_stdout" 2>"$example_stderr" &
  watchdog=$!
  wait "$watchdog"
  status=$?
  set -e
  record_watchdog environment-example "$watchdog"
  [[ "$status" -eq 0 ]] || return "$status"
  python3 - "$example_stdout" <<'PY'
import json, pathlib, sys
marker = "[ENVIRONMENT-EXAMPLE] "
lines = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
matches = [line.split(marker, 1)[1] for line in lines if marker in line]
if len(matches) != 1:
    raise SystemExit("environment public example did not emit exactly one summary")
value = json.loads(matches[0])
if (value.get("mode") != "runtime-gate"
        or value.get("pathAvailable") is not True
        or value.get("snapshotFrozen") is not True):
    raise SystemExit("environment public example summary is invalid: " + json.dumps(value, sort_keys=True))
print("[RUNTIME-API-ENVIRONMENT] public example passed")
PY
  verify_zero_cleanup environment-example

  set +e
  python3 "$WATCHDOG" --seconds 120 --pid-file "$acceptance_pidfile" -- "$BINARY" ai run \
    "$ROOT_DIR/tests/runtime-api/acceptance/environment-ai-run.js" --env-file "$env_file" \
    >"$acceptance_stdout" 2>"$acceptance_stderr" &
  watchdog=$!
  wait "$watchdog"
  status=$?
  set -e
  record_watchdog environment-ai-run "$watchdog"
  [[ "$status" -eq 0 ]] || return "$status"

  python3 - "$acceptance_stdout" <<'PY'
import json, pathlib, sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if payload.get("ok") is not True or payload.get("command") != "run":
    raise SystemExit("environment ai run did not return a successful envelope")
run_dir = pathlib.Path(((payload.get("result") or {}).get("artifacts") or {}).get("runDir") or "")
report = run_dir / "environment-acceptance.json"
if not report.is_file() or json.loads(report.read_text(encoding="utf-8")).get("ok") is not True:
    raise SystemExit("environment ai run report is missing or invalid: " + str(report))
print("[RUNTIME-API-ENVIRONMENT] ai run report=" + str(report))
PY

  export OPENDESK_ENV_HOST_SECRET=must-not-leak
  port="$(python3 - <<'PY'
import socket
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
print(sock.getsockname()[1])
sock.close()
PY
)"
  base="http://127.0.0.1:$port"
  "$BINARY" -http -port "$port" -scheduler-db "$RUN_DIR/environment/scheduler.db" -console-mode agent \
    >"$RUN_DIR/environment/http-server.stdout.log" 2>"$RUN_DIR/environment/http-server.stderr.log" &
  server=$!
  record runtime "$server" environment-http-server
  for _ in $(seq 1 100); do
    /usr/bin/curl --silent --max-time 1 "$base/status" >/dev/null 2>&1 && break
    kill -0 "$server" >/dev/null 2>&1 || { echo "environment HTTP server exited before ready" >&2; return 1; }
    sleep 0.05
  done
  /usr/bin/curl --fail --silent --show-error --max-time 2 "$base/status" >/dev/null
  python3 - "$ROOT_DIR/tests/runtime-api/acceptance/environment-http-isolation.js" "$http_request" "$RUN_DIR/runtime-logs/environment-http" <<'PY'
import json, pathlib, sys
source, request, log_dir = sys.argv[1:]
payload = {
    "script": pathlib.Path(source).read_text(encoding="utf-8"),
    "timeout": 10,
    "consoleMode": "script",
    "logDir": log_dir,
}
pathlib.Path(request).write_text(json.dumps(payload), encoding="utf-8")
PY
  /usr/bin/curl --fail --silent --show-error --max-time 5 -H 'Content-Type: application/json' \
    --data-binary "@$http_request" "$base/executions" >"$http_response"
  execution_id="$(python3 - "$http_response" <<'PY'
import json, sys
value = json.load(open(sys.argv[1], encoding="utf-8"))
print((value.get("data") or {}).get("executionId") or "")
PY
)"
  [[ -n "$execution_id" ]] || { echo "environment HTTP execution ID is missing" >&2; return 1; }
  for _ in $(seq 1 100); do
    /usr/bin/curl --fail --silent --show-error --max-time 2 "$base/executions/$execution_id" >"$http_status"
    status="$(python3 - "$http_status" <<'PY'
import json, sys
print((json.load(open(sys.argv[1], encoding="utf-8")).get("data") or {}).get("status", ""))
PY
)"
    [[ "$status" == succeeded || "$status" == failed || "$status" == timed_out || "$status" == canceled ]] && break
    sleep 0.05
  done
  [[ "$status" == succeeded ]] || { echo "environment HTTP isolation failed with status $status" >&2; return 1; }
  cleanup_environment_server
  server=""
  no_residual
  trap - RETURN
}
sound_cancel() {
  OPENDESK_BINARY="$BINARY" \
    OPENDESK_SOUND_CANCEL_RUN_DIR="$RUN_DIR/sound-cancel" \
    "$ROOT_DIR/tests/runtime-api/sound-cancel-smoke.sh"
  no_residual
}

notify_icon_live() {
  [[ "$(uname -s)" == Darwin ]] || { echo "macOS notify icon live test requires Darwin" >&2; return 1; }
  local installed="${OPENDESK_BINARY:-/Applications/OpenDesk.app/Contents/MacOS/opendesk}"
  [[ -f "${installed}" && -x "${installed}" ]] || { echo "installed OpenDesk.app executable is missing or not executable: ${installed}" >&2; return 1; }
  [[ "${installed}" == */OpenDesk.app/Contents/MacOS/opendesk ]] || { echo "notify-icon-live requires the executable inside OpenDesk.app: ${installed}" >&2; return 1; }
  local installed_sha generated log_dir pidfile watchdog status=0
  installed_sha="$(shasum -a 256 "${installed}" | awk '{print $1}')"
  python3 - "${CONTEXT}" "${installed}" "${installed_sha}" <<'PY'
import json, sys
path, binary, sha256 = sys.argv[1:]
value = json.load(open(path, encoding="utf-8"))
value["binary"].update({
    "path": binary,
    "sha256": sha256,
    "buildSource": "installed OpenDesk.app executable",
    "provenance": "installed_app",
    "originalPath": binary,
    "originalSha256": sha256,
})
json.dump(value, open(path, "w", encoding="utf-8"), indent=2)
PY
  generated="$RUN_DIR/generated/notify-icon-live.generated.js"
  log_dir="$RUN_DIR/runtime-logs/notify-icon-live"
  pidfile="$RUN_DIR/processes/notify-icon-live.json"
  generate "$ROOT_DIR/tests/runtime-api/live/notify-icon.test.js" "$generated"
  set +e
  python3 "$WATCHDOG" --seconds 60 --pid-file "$pidfile" -- "$installed" \
    -script "$generated" -console-mode script -timeout 1 -log-dir "$log_dir" &
  watchdog=$!
  wait "$watchdog"
  status=$?
  set -e
  record_watchdog notify-icon-live "$watchdog"
  return "$status"
}

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

async_stacks() {
  local ready="$RUN_DIR/async-fixture-ready.json" extra="$RUN_DIR/async-fixture-extra.json" server="" status=0
  cleanup_async_fixture() { [[ -z "$server" ]] || { kill "$server" >/dev/null 2>&1 || true; wait "$server" 2>/dev/null || true; }; }
  trap cleanup_async_fixture RETURN
  python3 "$ROOT_DIR/tests/runtime-api/fixture/server.py" --ready "$ready" --browser-app "runtime-async" >"$RUN_DIR/async-fixture.stdout" 2>"$RUN_DIR/async-fixture.stderr" &
  server=$!
  record fixture-server "$server" loopback-async-fixture
  for _ in $(seq 1 100); do
    [[ -f "$ready" ]] && break
    kill -0 "$server" >/dev/null 2>&1 || { echo "Runtime async fixture exited before ready" >&2; return 1; }
    sleep 0.1
  done
  [[ -f "$ready" ]] || { echo "timed out waiting for Runtime async fixture" >&2; return 1; }
  python3 - "$ready" "$extra" <<'PY'
import json, sys
json.dump({"fixture": json.load(open(sys.argv[1], encoding="utf-8"))}, open(sys.argv[2], "w", encoding="utf-8"))
PY
  for stack in legacy upgraded playwright; do
    if runjs "async-$stack" "$ROOT_DIR/tests/runtime-api/async-lifecycle.js" 5 120 "$extra" true "$stack"; then :; else status=$?; fi
  done
  cleanup_async_fixture
  trap - RETURN
  return "$status"
}

cleanup() { runjs cleanup "$ROOT_DIR/tests/runtime-api/cleanup_validation.js" 4 120 "" false; }
quality() { runjs quality "$ROOT_DIR/tests/runtime-api/quality_gate.js" 5 180 "" false; }

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

dialog() {
  [[ "$(uname -s)" == Darwin ]] || { echo "Dialog native tests require Darwin" >&2; return 1; }
  local ui_host="$RUN_DIR/bin/clawdesk-ui-host" observer="$RUN_DIR/bin/dialog-native-window-observer"
  local flow_evidence_dir="$ROOT_DIR/.runtime/tests/dialog/$RUN_ID-flow"
  mkdir -p "$flow_evidence_dir"
  go build -o "$ui_host" ./cmd/opendesk-ui-host
  [[ -x "$ui_host" ]] || { echo "Dialog native host was not built: $ui_host" >&2; return 1; }
  go build -o "$observer" ./tests/dialog/tools/native-window-observer
  [[ -x "$observer" ]] || { echo "Dialog native WindowServer observer was not built: $observer" >&2; return 1; }

  dialog_host_pid() {
    local candidate
    for _ in $(seq 1 100); do
      # `command` includes this awk invocation (and therefore the host path),
      # so it can match its own helper process. `comm` is the executable path
      # with no arguments and identifies only the actual native host child.
      candidate="$(ps -axo pid=,comm= | awk -v host="$ui_host" '$2 == host { print $1 }')"
      if [[ "$(printf '%s\n' "$candidate" | sed '/^$/d' | wc -l | tr -d ' ')" == 1 ]]; then
        printf '%s\n' "$candidate"
        return 0
      fi
      sleep 0.05
    done
    echo "Dialog native host was not found at $ui_host" >&2
    return 1
  }

  dialog_wait_and_press() {
    local gate title button evidence_path before_press_screenshot input_text press_delay secondary_button host_pid extra
    gate="$1"
    title="$2"
    button="$3"
    evidence_path="$4"
    before_press_screenshot="${5:-}"
    input_text="${6:-}"
    press_delay="${7:-0}"
    secondary_button="${8:-}"
    host_pid=""
    extra="$RUN_DIR/generated/$gate.controller.json"
    for _ in $(seq 1 160); do
      host_pid="$(dialog_host_pid 2>/dev/null || true)"
      if [[ -n "$host_pid" ]]; then
        if [[ -n "$secondary_button" ]]; then
          if "$observer" -pid "$host_pid" -title "$title" -button "$button" -button "$secondary_button" -output "$evidence_path" >"$RUN_DIR/results/$gate.observer.stdout.log" 2>"$RUN_DIR/results/$gate.observer.stderr.log"; then break; fi
        elif "$observer" -pid "$host_pid" -title "$title" -button "$button" -output "$evidence_path" >"$RUN_DIR/results/$gate.observer.stdout.log" 2>"$RUN_DIR/results/$gate.observer.stderr.log"; then
          break
        fi
      fi
      sleep 0.05
    done
    [[ -s "$evidence_path" ]] || { echo "Dialog $gate never exposed reviewed native AX button $button" >&2; return 1; }
    python3 - "$evidence_path" "$title" "$button" "$extra" "$input_text" <<'PY'
import json, math, sys
evidence_path, wanted_title, wanted_button, extra_path, input_text = sys.argv[1:]
value = json.load(open(evidence_path, encoding="utf-8"))
ax = value.get("accessibility") or {}
bounds = ax.get("bounds") or {}
if value.get("hostPid", 0) <= 0 or not value.get("onScreen") or value.get("alpha", 0) <= 0:
    raise SystemExit("native dialog WindowServer state is not visible")
if ax.get("windowTitle") != wanted_title or ax.get("buttonTitle") != wanted_button or not ax.get("supportsPress"):
    raise SystemExit("native dialog AX identity or AXPress capability changed")
x = bounds.get("x", 0) + bounds.get("width", 0) / 2
y = bounds.get("y", 0) + bounds.get("height", 0) / 2
if not all(math.isfinite(item) for item in (x, y)) or bounds.get("width", 0) <= 0 or bounds.get("height", 0) <= 0:
    raise SystemExit("native dialog AX button bounds are invalid")
target = {"hostPid": value["hostPid"], "x": x, "y": y, "title": wanted_title, "button": wanted_button}
if input_text:
    target["inputText"] = input_text
json.dump({"dialogAX": target}, open(extra_path, "w", encoding="utf-8"), indent=2)
PY
    if [[ "$gate" == "dialog-lifecycle-alert" ]]; then
      for _ in $(seq 1 100); do
        grep -q 'event-loop-tick-before-settlement' "$RUN_DIR/results/dialog-lifecycle.stdout.log" 2>/dev/null && break
        sleep 0.02
      done
      grep -q 'event-loop-tick-before-settlement' "$RUN_DIR/results/dialog-lifecycle.stdout.log" || {
        echo "Dialog alert was visible but the owner EventLoop tick was not observed before AXPress" >&2
        return 1
      }
    fi
    if [[ -n "$before_press_screenshot" ]]; then
      screencapture -x "$before_press_screenshot"
      [[ -s "$before_press_screenshot" ]] || { echo "Dialog layout screenshot was not written" >&2; return 1; }
    fi
    if [[ "$press_delay" != "0" ]]; then sleep "$press_delay"; fi
    runjs "$gate-controller" "$ROOT_DIR/tests/runtime-api/dialog-ax-controller.js" 3 60 "$extra"
  }

  dialog_layout_probe() {
    local evidence_dir evidence screenshot
    evidence_dir="$ROOT_DIR/.runtime/tests/dialog/$RUN_ID-layout"
    evidence="$evidence_dir/windowserver-ax.json"
    screenshot="$evidence_dir/screen.png"
    mkdir -p "$evidence_dir"
    startjs dialog-layout-probe "$ROOT_DIR/tests/runtime-api/dialog-layout-probe.js" 5 120 "" true legacy true
    dialog_wait_and_press dialog-layout-probe "OpenDesk" "Save" "$evidence" "$screenshot" "" 0 "Cancel"
    local finish_status=0
    if finish_startedjs; then :; else finish_status=$?; return "$finish_status"; fi
    python3 - "$evidence" "$screenshot" "$evidence_dir/summary.json" <<'PY'
import json, os, sys
evidence_path, screenshot, summary = sys.argv[1:]
value = json.load(open(evidence_path, encoding="utf-8"))
window = value["bounds"]
buttons = value.get("accessibilityButtons") or []
by_title = {item["buttonTitle"]: item for item in buttons}
if set(by_title) != {"Save", "Cancel"}:
    raise SystemExit("prompt did not expose both reviewed native AX buttons")
save = by_title["Save"]
cancel = by_title["Cancel"]
save_bounds = save["bounds"]
cancel_bounds = cancel["bounds"]
right_margin = window["x"] + window["width"] - (save_bounds["x"] + save_bounds["width"])
bottom_margin = window["y"] + window["height"] - (save_bounds["y"] + save_bounds["height"])
button_gap = save_bounds["x"] - (cancel_bounds["x"] + cancel_bounds["width"])
if window["width"] != 440 or window["height"] != 184:
    raise SystemExit("prompt dimensions changed from the reviewed compact native layout")
if not 20 <= right_margin <= 32:
    raise SystemExit("prompt action is no longer right aligned with compact margin")
if not 14 <= bottom_margin <= 24 or not 8 <= button_gap <= 14:
    raise SystemExit("prompt action spacing is no longer compact")
for item in (save, cancel):
    bounds = item["bounds"]
    if not item.get("supportsPress") or bounds["width"] < 80 or bounds["height"] < 30:
        raise SystemExit("prompt AX action is no longer pressable at the reviewed size")
center_offset = value.get("centerOffset") or {}
if abs(center_offset.get("x", 999)) > 2 or not -80 <= center_offset.get("y", 999) <= 40:
    raise SystemExit("prompt is no longer centered on its active display")
json.dump({
    "liveDialogLayout": "passed",
    "window": window,
    "displayBounds": value.get("displayBounds"),
    "centerOffsetFromFullDisplay": center_offset,
    "actionRightMargin": right_margin,
    "actionBottomMargin": bottom_margin,
    "actionGap": button_gap,
    "accessibilityButtons": buttons,
    "screenshot": screenshot,
    "screenshotBytes": os.path.getsize(screenshot),
}, open(summary, "w", encoding="utf-8"), indent=2)
PY
    cp "$evidence" "$RUN_DIR/results/dialog-layout-windowserver-ax.json"
    cp "$evidence_dir/summary.json" "$RUN_DIR/results/dialog-layout-summary.json"
  }

  dialog_adaptive_layout_probe() {
    local evidence_dir confirm_evidence prompt_evidence confirm_screenshot prompt_screenshot
    evidence_dir="$ROOT_DIR/.runtime/tests/dialog/$RUN_ID-adaptive-layout"
    confirm_evidence="$evidence_dir/confirm-windowserver-ax.json"
    prompt_evidence="$evidence_dir/prompt-windowserver-ax.json"
    confirm_screenshot="$evidence_dir/confirm.png"
    prompt_screenshot="$evidence_dir/prompt.png"
    mkdir -p "$evidence_dir"
    startjs dialog-adaptive-layout-probe "$ROOT_DIR/tests/runtime-api/dialog-adaptive-layout-probe.js" 5 120 "" true legacy true
    dialog_wait_and_press dialog-adaptive-layout-confirm "Dialog adaptive long confirm" "Continue" "$confirm_evidence" "$confirm_screenshot" "" 0 "Cancel"
    dialog_wait_and_press dialog-adaptive-layout-prompt "Dialog adaptive long prompt" "Save" "$prompt_evidence" "$prompt_screenshot" "adaptive-layout-focus" 0 "Cancel"
    local finish_status=0
    if finish_startedjs; then :; else finish_status=$?; return "$finish_status"; fi
    python3 - "$confirm_evidence" "$prompt_evidence" "$confirm_screenshot" "$prompt_screenshot" "$evidence_dir/summary.json" <<'PY'
import json, os, sys
confirm_path, prompt_path, confirm_screenshot, prompt_screenshot, summary_path = sys.argv[1:]
confirm = json.load(open(confirm_path, encoding="utf-8"))
prompt = json.load(open(prompt_path, encoding="utf-8"))

def inspect(name, value, minimum_height):
    window = value["bounds"]
    buttons = value.get("accessibilityButtons") or []
    if window["width"] != 440 or window["height"] <= minimum_height or window["height"] > 400:
        raise SystemExit(f"{name} did not grow from its compact minimum to a bounded adaptive height")
    if len(buttons) != 2 or any(not item.get("supportsPress") for item in buttons):
        raise SystemExit(f"{name} did not expose both native AXPress actions")
    ordered = sorted((item["bounds"] for item in buttons), key=lambda bounds: bounds["x"])
    right = ordered[-1]
    right_margin = window["x"] + window["width"] - (right["x"] + right["width"])
    bottom_margin = window["y"] + window["height"] - (right["y"] + right["height"])
    gap = ordered[1]["x"] - (ordered[0]["x"] + ordered[0]["width"])
    if not 20 <= right_margin <= 32 or not 14 <= bottom_margin <= 24 or not 8 <= gap <= 14:
        raise SystemExit(f"{name} action row lost its compact right-aligned spacing")
    center = value.get("centerOffset") or {}
    if abs(center.get("x", 999)) > 2 or not -80 <= center.get("y", 999) <= 40:
        raise SystemExit(f"{name} is no longer centered on the active display")
    return {
        "window": window,
        "growthFromMinimum": window["height"] - minimum_height,
        "actionRightMargin": right_margin,
        "actionBottomMargin": bottom_margin,
        "actionGap": gap,
        "accessibilityButtons": buttons,
    }

if any(not os.path.isfile(path) or os.path.getsize(path) <= 0 for path in (confirm_screenshot, prompt_screenshot)):
    raise SystemExit("adaptive Dialog screenshots are incomplete")
result = {
    "liveAdaptiveDialogLayout": "passed",
    "confirm": inspect("confirm", confirm, 146),
    "prompt": inspect("prompt", prompt, 184),
    "screenshots": [
        {"path": confirm_screenshot, "bytes": os.path.getsize(confirm_screenshot)},
        {"path": prompt_screenshot, "bytes": os.path.getsize(prompt_screenshot)},
    ],
}
json.dump(result, open(summary_path, "w", encoding="utf-8"), indent=2)
PY
    cp "$evidence_dir/summary.json" "$RUN_DIR/results/dialog-adaptive-layout-summary.json"
  }

  runjs dialog-no-ui "$ROOT_DIR/tests/runtime-api/dialog-no-ui.js" 3 60
  runjs dialog-validation "$ROOT_DIR/tests/runtime-api/dialog-validation.js" 3 90 "" true legacy true
  startjs dialog-lifecycle "$ROOT_DIR/tests/runtime-api/dialog-lifecycle.js" 5 120 "" true legacy true
  dialog_wait_and_press dialog-lifecycle-alert "Dialog lifecycle alert" "Acknowledge alert" "$RUN_DIR/results/dialog-lifecycle-alert.json" "$flow_evidence_dir/nonblocking-alert.png" "" 0.2
  dialog_wait_and_press dialog-lifecycle-busy "Dialog lifecycle busy" "Acknowledge busy" "$RUN_DIR/results/dialog-lifecycle-busy.json"
  dialog_wait_and_press dialog-lifecycle-continuation "Dialog lifecycle continuation" "Confirm continuation" "$RUN_DIR/results/dialog-lifecycle-continuation.json" "" "" 0 "Cancel cancellation"
  dialog_wait_and_press dialog-lifecycle-cancellation "Dialog lifecycle cancellation" "Cancel" "$RUN_DIR/results/dialog-lifecycle-cancellation.json" "" "" 0 "Continue"
  dialog_wait_and_press dialog-lifecycle-prompt "Dialog lifecycle prompt" "Save" "$flow_evidence_dir/prompt-input-windowserver-ax.json" "" "dialog-runtime-api-typed" 0 "Cancel"
  dialog_wait_and_press dialog-lifecycle-typed-result "Dialog typed result: dialog-runtime-api-typed" "Acknowledge typed result" "$flow_evidence_dir/prompt-value-alert-windowserver-ax.json" "$flow_evidence_dir/prompt-value-alert.png"
  dialog_wait_and_press dialog-lifecycle-prompt-cancel "Dialog lifecycle prompt cancellation" "Cancel prompt" "$flow_evidence_dir/prompt-cancel-windowserver-ax.json" "" "" 0 "Save"
  dialog_wait_and_press dialog-lifecycle-null-result "Dialog canceled result: null" "Acknowledge null result" "$flow_evidence_dir/prompt-null-alert-windowserver-ax.json" "$flow_evidence_dir/prompt-null-alert.png"
  finish_startedjs
  verify_zero_cleanup dialog-lifecycle
  python3 - "$flow_evidence_dir" "$RUN_DIR/results/dialog-lifecycle-flow-summary.json" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
summary_path = pathlib.Path(sys.argv[2])
typed = json.loads((root / "prompt-value-alert-windowserver-ax.json").read_text(encoding="utf-8"))
canceled = json.loads((root / "prompt-null-alert-windowserver-ax.json").read_text(encoding="utf-8"))
if (typed.get("accessibility") or {}).get("windowTitle") != "Dialog typed result: dialog-runtime-api-typed":
    raise SystemExit("typed prompt result was not presented by the observed second native alert")
if (canceled.get("accessibility") or {}).get("windowTitle") != "Dialog canceled result: null":
    raise SystemExit("prompt null cancellation was not presented by the observed second native alert")
screenshots = [root / "nonblocking-alert.png", root / "prompt-value-alert.png", root / "prompt-null-alert.png"]
if any(not path.is_file() or path.stat().st_size <= 0 for path in screenshots):
    raise SystemExit("Dialog lifecycle screenshot evidence is incomplete")
summary = {
    "liveDialogFlow": "passed",
    "typedValue": "dialog-runtime-api-typed",
    "typedResultWindowTitle": typed["accessibility"]["windowTitle"],
    "canceledPromptValue": None,
    "nullResultWindowTitle": canceled["accessibility"]["windowTitle"],
    "screenshots": [{"path": str(path), "bytes": path.stat().st_size} for path in screenshots],
    "evidenceDir": str(root),
}
summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
(root / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
PY
  runjs dialog-unobserved "$ROOT_DIR/tests/runtime-api/dialog-unobserved.js" 3 90 "" true legacy true
  verify_zero_cleanup dialog-unobserved
  dialog_layout_probe
  verify_zero_cleanup dialog-layout-probe
  dialog_adaptive_layout_probe
  verify_zero_cleanup dialog-adaptive-layout-probe
  no_residual
}

custom_ui_config() {
  local root="$RUN_DIR/custom-ui-config-cli"
  local source="$ROOT_DIR/tests/runtime-api/custom-ui-config.js"
  local script_dir="$root/script-adjacent"
  local empty_dir="$root/default-disabled"
  local tm_source_dir="$root/tm-source"
  local tm_work_dir="$root/tm-work"
  local config_dir="$root/configs"
  mkdir -p "$script_dir" "$empty_dir" "$tm_source_dir" "$tm_work_dir" "$config_dir"

  python3 - "$script_dir/clawdesk.runtime.json" "$tm_source_dir/clawdesk.runtime.json" "$tm_work_dir/clawdesk.runtime.json" \
    "$config_dir/disabled.json" "$config_dir/invalid-host-path.json" "$config_dir/unknown-capability.json" <<'PY'
import json, pathlib, sys

def write(path, value):
    pathlib.Path(path).write_text(json.dumps(value), encoding="utf-8")

enabled = {"schemaVersion": 1, "runtime": {"capabilities": ["ui"]}}
disabled = {"schemaVersion": 1, "runtime": {"capabilities": []}}
write(sys.argv[1], enabled)
write(sys.argv[2], disabled)
write(sys.argv[3], enabled)
write(sys.argv[4], disabled)
write(sys.argv[5], {"schemaVersion": 1, "runtime": {"capabilities": ["ui"], "hostPath": "/tmp/untrusted"}})
write(sys.argv[6], {"schemaVersion": 1, "runtime": {"capabilities": ["mouse"]}})
PY

  custom_ui_config_success() {
    local gate="$1" workdir="$2" script="$3" enabled="$4" source_name="$5"
    shift 5
    local extra="$root/$gate.expectation.json"
    local stdout="$root/$gate.stdout.log"
    local stderr="$root/$gate.stderr.log"
    local pidfile="$RUN_DIR/processes/$gate.json"
    python3 - "$extra" "$enabled" "$source_name" <<'PY'
import json, sys
enabled = sys.argv[2] == "true"
json.dump({
    "enabled": enabled,
    "activationSource": sys.argv[3],
    "executionActivationSource": sys.argv[3],
    "floatingWindowDefined": enabled,
}, open(sys.argv[1], "w", encoding="utf-8"), indent=2)
PY
    generate "$source" "$script" "$extra"
    set +e
    (
      cd "$workdir"
      python3 "$WATCHDOG" --seconds 60 --pid-file "$pidfile" -- "$BINARY" "$@" \
        -script "$script" -console-mode script -timeout 2 -log-dir "$RUN_DIR/runtime-logs/$gate"
    ) >"$stdout" 2>"$stderr" &
    local watchdog=$!
    wait "$watchdog"
    local status=$?
    set -e
    printf '%s\n' "$status" >"$root/$gate.exit-status"
    record_watchdog "$gate" "$watchdog"
    if [[ "$status" -ne 0 ]] || ! grep -q 'CUSTOM_UI_CONFIG_OK=' "$stdout"; then
      echo "Custom UI CLI case $gate failed with status $status" >&2
      sed -n '1,160p' "$stdout" >&2
      sed -n '1,160p' "$stderr" >&2
      return 1
    fi
  }

  custom_ui_config_error() {
    local gate="$1" config_path="$2" expected_code="$3"
    local script="$root/$gate.js"
    local stdout="$root/$gate.stdout.log"
    local stderr="$root/$gate.stderr.log"
    local pidfile="$RUN_DIR/processes/$gate.json"
    cp "$source" "$script"
    set +e
    python3 "$WATCHDOG" --seconds 60 --pid-file "$pidfile" -- "$BINARY" \
      -config "$config_path" -script "$script" -console-mode script -timeout 2 \
      -log-dir "$RUN_DIR/runtime-logs/$gate" >"$stdout" 2>"$stderr" &
    local watchdog=$!
    wait "$watchdog"
    local status=$?
    set -e
    printf '%s\n' "$status" >"$root/$gate.exit-status"
    record_watchdog "$gate" "$watchdog"
    if [[ "$status" -eq 0 ]] || ! grep -q "$expected_code" "$stdout" "$stderr"; then
      echo "Custom UI CLI error case $gate did not expose $expected_code (status $status)" >&2
      sed -n '1,160p' "$stdout" >&2
      sed -n '1,160p' "$stderr" >&2
      return 1
    fi
  }

  custom_ui_config_http_error() {
    local gate="$1" config_path="$2" expected_code="$3"
    local stdout="$root/$gate.stdout.log"
    local stderr="$root/$gate.stderr.log"
    local pidfile="$RUN_DIR/processes/$gate.json"
    set +e
    python3 "$WATCHDOG" --seconds 60 --pid-file "$pidfile" -- "$BINARY" \
      -http -port 0 -config "$config_path" -console-mode script >"$stdout" 2>"$stderr" &
    local watchdog=$!
    wait "$watchdog"
    local exit_status=$?
    set -e
    printf '%s\n' "$exit_status" >"$root/$gate.exit-status"
    record_watchdog "$gate" "$watchdog"
    if [[ "$exit_status" -eq 0 || "$exit_status" -eq 124 ]] || ! grep -q "$expected_code" "$stdout" "$stderr"; then
      echo "Custom UI HTTP CLI error case $gate did not fail closed with $expected_code (status $exit_status)" >&2
      sed -n '1,160p' "$stdout" >&2
      sed -n '1,160p' "$stderr" >&2
      return 1
    fi
  }

  custom_ui_config_success custom-ui-config-script-adjacent "$ROOT_DIR" "$script_dir/task.js" true projectConfig
  custom_ui_config_success custom-ui-config-default-disabled "$ROOT_DIR" "$empty_dir/task.js" false disabled
  custom_ui_config_success custom-ui-config-explicit-over-auto "$ROOT_DIR" "$script_dir/explicit.js" false disabled \
    -config "$config_dir/disabled.json"
  custom_ui_config_success custom-ui-config-cli-over-missing "$ROOT_DIR" "$script_dir/cli.js" true cli \
    -ui -config "$config_dir/does-not-exist.json"
  custom_ui_config_success custom-ui-config-no-ui-wins "$ROOT_DIR" "$script_dir/no-ui.js" false disabled \
    -no-ui -ui -config "$script_dir/clawdesk.runtime.json"
  custom_ui_config_success custom-ui-config-working-directory "$tm_work_dir" "$tm_source_dir/tm.config.js" true projectConfig
  custom_ui_config_error custom-ui-config-invalid-host-path "$config_dir/invalid-host-path.json" RUNTIME_CONFIG_INVALID
  custom_ui_config_error custom-ui-config-unknown-capability "$config_dir/unknown-capability.json" RUNTIME_CONFIG_UNSUPPORTED
  custom_ui_config_error custom-ui-config-explicit-missing "$config_dir/does-not-exist.json" RUNTIME_CONFIG_NOT_FOUND
  custom_ui_config_http_error custom-ui-config-http-invalid "$config_dir/invalid-host-path.json" RUNTIME_CONFIG_INVALID
  echo "[RUNTIME-API-CUSTOM-UI-CONFIG] CLI priority and strict errors passed"
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
  if [[ "$status" -eq 0 ]]; then if async_stacks; then :; else status=$?; fi; fi
  if [[ "$status" -eq 0 ]]; then if live; then :; else status=$?; fi; fi
  if [[ "$status" -eq 0 ]]; then if custom_ui; then :; else status=$?; fi; fi
  if [[ "$status" -eq 0 ]]; then if custom_ui_config; then :; else status=$?; fi; fi
  if [[ "$status" -eq 0 ]]; then if coverage; then :; else status=$?; fi; fi
  if cleanup; then :; else status=$?; fi
  if no_residual; then :; else status=$?; fi
  if [[ "$status" -eq 0 ]]; then if quality; then :; else status=$?; fi; fi
  return "$status"
}

case "$MODE" in
  contract) contract ;;
  unit) unit ;;
  smoke) contract; unit; smoke; async_stacks; failure_exit; negative ;;
  live) live_suite ;;
  live-only) live_only_with_cleanup ;;
  coverage) coverage ;;
  negative) negative ;;
  sound-cancel) sound_cancel ;;
  notify-icon-live) notify_icon_live ;;
  custom-ui) custom_ui ;;
  custom-ui-config) custom_ui_config ;;
  dialog) dialog ;;
  command) command ;;
  environment) environment ;;
  *) echo "usage: $0 [contract|unit|smoke|live|live-only|coverage|negative|sound-cancel|command|environment|custom-ui|custom-ui-config|dialog]" >&2; exit 2 ;;
esac
