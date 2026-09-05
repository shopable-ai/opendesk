#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
cd "$root"

run_dir=${OPENDESK_RUNTIME_API_RUN_DIR:?missing OPENDESK_RUNTIME_API_RUN_DIR}
binary=${OPENDESK_RUNTIME_API_BINARY:?missing OPENDESK_RUNTIME_API_BINARY}
server=""

cleanup() {
  if [ -n "$server" ] && kill -0 "$server" 2>/dev/null; then
    kill -TERM "$server" 2>/dev/null || true
    wait "$server" 2>/dev/null || true
  fi
}
trap cleanup EXIT HUP INT TERM

port=$(python3 - <<'PY'
import socket
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
print(sock.getsockname()[1])
sock.close()
PY
)
base="http://127.0.0.1:$port"
"$binary" -http -port "$port" -scheduler-db "$run_dir/environment/scheduler.db" -console-mode agent \
  >"$run_dir/environment/http-server.stdout.log" 2>"$run_dir/environment/http-server.stderr.log" &
server=$!
printf '%s\n' "$server" >"$run_dir/processes/environment-http-server.pid"

attempt=0
while [ "$attempt" -lt 100 ]; do
  /usr/bin/curl --silent --max-time 1 "$base/status" >/dev/null 2>&1 && break
  kill -0 "$server" 2>/dev/null || { echo "environment HTTP server exited before ready" >&2; exit 1; }
  attempt=$((attempt + 1))
  sleep 0.05
done
/usr/bin/curl --fail --silent --show-error --max-time 2 "$base/status" >/dev/null

OPENDESK_RUNTIME_API_HTTP_BASE="$base" \
  "$binary" -script tests/runtime-api/seams/environment-http-controller.js -console-mode script -timeout 15 \
  -log-dir "$run_dir/runtime-logs/environment-http-controller"

cleanup
server=""
trap - EXIT HUP INT TERM
