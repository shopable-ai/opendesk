#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
cd "$root"

stack=${1:?usage: async-fixture-session.sh legacy|upgraded|playwright|http-download|http-response-types}
source="$root/tests/runtime-api/async-lifecycle.js"
case "$stack" in
  legacy|upgraded|playwright) ;;
  http-download) source="$root/tests/runtime-api/http-download.js" ;;
  http-response-types) source="$root/tests/runtime-api/http-response-types.js" ;;
  *) echo "invalid Runtime stack: $stack" >&2; exit 2 ;;
esac

run_dir=${OPENDESK_RUNTIME_API_RUN_DIR:?missing OPENDESK_RUNTIME_API_RUN_DIR}
binary=${OPENDESK_RUNTIME_API_BINARY:?missing OPENDESK_RUNTIME_API_BINARY}
context=${OPENDESK_RUNTIME_API_CONTEXT_PATH:-"$run_dir/context.json"}
watchdog="$root/tests/runtime-api/run_with_timeout.py"
if [ "$stack" = "http-download" ] || [ "$stack" = "http-response-types" ]; then
  gate="http-download"
  if [ "$stack" = "http-response-types" ]; then gate="http-response-types"; fi
else
  gate="async-$stack"
fi
ready="$run_dir/$gate-fixture-ready.json"
extra="$run_dir/$gate-fixture-extra.json"
generated="$run_dir/generated/$gate.generated.js"
fixture_pid_file="$run_dir/processes/$gate-fixture.pid"
fixture=""

cleanup() {
  if [ -n "$fixture" ] && kill -0 "$fixture" 2>/dev/null; then
    kill -TERM "$fixture" 2>/dev/null || true
    wait "$fixture" 2>/dev/null || true
  fi
}
trap cleanup EXIT HUP INT TERM

python3 "$root/tests/runtime-api/fixture/server.py" --ready "$ready" --browser-app runtime-async \
  >"$run_dir/$gate-fixture.stdout" 2>"$run_dir/$gate-fixture.stderr" &
fixture=$!
printf '%s\n' "$fixture" >"$fixture_pid_file"

attempt=0
while [ "$attempt" -lt 100 ] && [ ! -f "$ready" ]; do
  kill -0 "$fixture" 2>/dev/null || { echo "Runtime async fixture exited before ready" >&2; exit 1; }
  attempt=$((attempt + 1))
  sleep 0.1
done
[ -f "$ready" ] || { echo "timed out waiting for Runtime async fixture" >&2; exit 1; }

python3 - "$context" "$ready" "$extra" "$source" "$generated" <<'PY'
import json, pathlib, sys
context, ready, extra, source, generated = map(pathlib.Path, sys.argv[1:])
fixture = json.loads(ready.read_text(encoding="utf-8"))
extra.write_text(json.dumps({"fixture": fixture}), encoding="utf-8")
prefix = "globalThis.OPENDESK_RUNTIME_API_CONTEXT = " + json.dumps(json.loads(context.read_text(encoding="utf-8"))) + ";\n"
prefix += "globalThis.RUNTIME_API_EXTRA = " + json.dumps({"fixture": fixture}) + ";\n"
prefix += "globalThis.RUNTIME_API_FIXTURE = " + json.dumps(fixture) + ";\n"
generated.write_text(prefix + source.read_text(encoding="utf-8"), encoding="utf-8")
PY

python3 "$watchdog" --seconds 120 --pid-file "$run_dir/processes/$gate.json" -- \
  "$binary" -script "$generated" -stack "$stack" -console-mode script -timeout 5 \
  -log-dir "$run_dir/runtime-logs/$gate"

cleanup
fixture=""
trap - EXIT HUP INT TERM
