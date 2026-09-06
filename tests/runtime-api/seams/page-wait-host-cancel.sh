#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
cd "$root"

generated=${1:?usage: page-wait-host-cancel.sh generated-script.js}
run_dir=${OPENDESK_RUNTIME_API_RUN_DIR:?missing OPENDESK_RUNTIME_API_RUN_DIR}
binary=${OPENDESK_RUNTIME_API_BINARY:?missing OPENDESK_RUNTIME_API_BINARY}
watchdog="$root/tests/runtime-api/run_with_timeout.py"
stdout="$run_dir/results/page-wait-host-cancel.stdout.log"
stderr="$run_dir/results/page-wait-host-cancel.stderr.log"
pidfile="$run_dir/processes/page-wait-host-cancel.json"
observation="$run_dir/results/page-wait-host-cancel-observation.json"
runtime_log="$run_dir/runtime-logs/page-wait-host-cancel"
watchdog_pid=""

mkdir -p "$run_dir/results" "$run_dir/processes" "$runtime_log"

cleanup() {
  if [ -n "$watchdog_pid" ] && kill -0 "$watchdog_pid" 2>/dev/null; then
    kill -TERM "$watchdog_pid" 2>/dev/null || true
    wait "$watchdog_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT HUP INT TERM

python3 "$watchdog" --seconds 30 --pid-file "$pidfile" -- \
  "$binary" -script "$generated" -stack legacy -console-mode script -timeout 0 \
  -log-dir "$runtime_log" >"$stdout" 2>"$stderr" &
watchdog_pid=$!

ready=false
runtime_pid=""
attempt=0
while [ "$attempt" -lt 200 ]; do
  if [ -f "$stdout" ] && [ -f "$pidfile" ] && grep -q 'PAGE_WAIT_HOST_CANCEL_READY=' "$stdout"; then
    runtime_pid=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["runtimePid"])' "$pidfile")
    if [ -n "$runtime_pid" ]; then
      ready=true
      break
    fi
  fi
  if ! kill -0 "$watchdog_pid" 2>/dev/null; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.05
done

signal_sent=false
signal_count=0
if [ "$ready" = true ] && kill -0 "$runtime_pid" 2>/dev/null; then
  if kill -INT "$runtime_pid" 2>/dev/null; then
    signal_sent=true
    signal_count=1
  fi
fi

if [ "$ready" != true ] && kill -0 "$watchdog_pid" 2>/dev/null; then
  kill -TERM "$watchdog_pid" 2>/dev/null || true
fi

set +e
wait "$watchdog_pid"
exit_status=$?
set -e
watchdog_pid=""

python3 - "$observation" "$ready" "$signal_sent" "$signal_count" "$exit_status" "${runtime_pid:-0}" <<'PY'
import json
import sys

path, ready, signal_sent, signal_count, exit_status, runtime_pid = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "ready": ready == "true",
            "signalSent": signal_sent == "true",
            "signalCount": int(signal_count),
            "exitStatus": int(exit_status),
            "runtimePid": int(runtime_pid),
        },
        handle,
        indent=2,
    )
PY

trap - EXIT HUP INT TERM
