#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
cd "$root"

generated=${1:?usage: command-cancel.sh generated-script.js}
run_dir=${OPENDESK_RUNTIME_API_RUN_DIR:?missing OPENDESK_RUNTIME_API_RUN_DIR}
binary=${OPENDESK_RUNTIME_API_BINARY:?missing OPENDESK_RUNTIME_API_BINARY}
watchdog="$root/tests/runtime-api/run_with_timeout.py"
stdout="$run_dir/results/command-cancel.stdout.log"
stderr="$run_dir/results/command-cancel.stderr.log"
pidfile="$run_dir/processes/command-cancel.json"
observation="$run_dir/results/command-cancel-observation.json"
watchdog_pid=""

cleanup() {
  if [ -n "$watchdog_pid" ] && kill -0 "$watchdog_pid" 2>/dev/null; then
    kill -TERM "$watchdog_pid" 2>/dev/null || true
    wait "$watchdog_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT HUP INT TERM

python3 "$watchdog" --seconds 90 --pid-file "$pidfile" -- \
  "$binary" -script "$generated" -stack legacy -console-mode script -timeout 2 \
  -log-dir "$run_dir/runtime-logs/command-cancel" >"$stdout" 2>"$stderr" &
watchdog_pid=$!

ready=false
runtime_pid=""
child_pid=""
descendant_pid=""
attempt=0
while [ "$attempt" -lt 160 ]; do
  if [ -f "$stdout" ] && [ -f "$pidfile" ] && grep -q 'COMMAND_CANCEL_READY=' "$stdout"; then
    runtime_pid=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["runtimePid"])' "$pidfile")
    child_pid=$(sed -n 's/.*COMMAND_CHILD_PID=\([0-9][0-9]*\).*/\1/p' "$stdout" | tail -n 1)
    descendant_pid=$(sed -n 's/.*COMMAND_DESCENDANT_PID=\([0-9][0-9]*\).*/\1/p' "$stdout" | tail -n 1)
    if [ -n "$runtime_pid" ] && [ -n "$child_pid" ] && [ -n "$descendant_pid" ]; then ready=true; break; fi
  fi
  attempt=$((attempt + 1))
  sleep 0.05
done

alive_before=false
if [ "$ready" = true ] && kill -0 "$child_pid" 2>/dev/null && kill -0 "$descendant_pid" 2>/dev/null; then
  alive_before=true
  kill -INT "$runtime_pid" 2>/dev/null || true
fi

set +e
wait "$watchdog_pid"
exit_status=$?
set -e
watchdog_pid=""

attempt=0
while [ "$attempt" -lt 60 ]; do
  child_alive=false
  descendant_alive=false
  [ -n "$child_pid" ] && kill -0 "$child_pid" 2>/dev/null && child_alive=true
  [ -n "$descendant_pid" ] && kill -0 "$descendant_pid" 2>/dev/null && descendant_alive=true
  [ "$child_alive" = false ] && [ "$descendant_alive" = false ] && break
  attempt=$((attempt + 1))
  sleep 0.05
done

python3 - "$observation" "$ready" "$alive_before" "$exit_status" "${runtime_pid:-0}" "${child_pid:-0}" "${descendant_pid:-0}" "$child_alive" "$descendant_alive" <<'PY'
import json, sys
path, ready, alive_before, status, runtime, child, descendant, child_after, descendant_after = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump({
        "ready": ready == "true", "aliveBefore": alive_before == "true",
        "exitStatus": int(status), "runtimePid": int(runtime), "childPid": int(child),
        "descendantPid": int(descendant), "childAliveAfter": child_after == "true",
        "descendantAliveAfter": descendant_after == "true",
    }, handle, indent=2)
PY

trap - EXIT HUP INT TERM
