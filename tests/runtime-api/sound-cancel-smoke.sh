#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"

binary=${OPENDESK_BINARY:-./dist/opendesk}
case "$binary" in
  /*) ;;
  *) binary="$root/$binary" ;;
esac
if [ ! -x "$binary" ]; then
  echo "OpenDesk binary is not executable: $binary" >&2
  exit 2
fi

run_dir=${OPENDESK_SOUND_CANCEL_RUN_DIR:-"$root/.runtime/tests/runtime-api/sound-cancel-$(date -u +%Y%m%dT%H%M%SZ)-$$"}
runtime_log="$run_dir/runtime-log"
stdout_log="$run_dir/stdout.log"
stderr_log="$run_dir/stderr.log"
mkdir -p "$runtime_log"

"$binary" -script tests/runtime-api/sound-cancel.js -console-mode script -timeout 0 -log-dir "$runtime_log" \
  >"$stdout_log" 2>"$stderr_log" &
pid=$!

cleanup() {
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT HUP INT TERM

ready=false
attempt=0
while [ "$attempt" -lt 200 ]; do
  if grep -q 'SOUND_SYNC_CANCEL_READY=' "$stdout_log" 2>/dev/null; then
    ready=true
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.05
done
if [ "$ready" != true ]; then
  echo "Sound cancellation probe did not reach the blocking playback" >&2
  sed -n '1,160p' "$stdout_log" >&2
  sed -n '1,160p' "$stderr_log" >&2
  exit 1
fi

kill -INT "$pid"
attempt=0
while [ "$attempt" -lt 60 ] && kill -0 "$pid" 2>/dev/null; do
  attempt=$((attempt + 1))
  sleep 0.05
done
observed_exit_ms=$((attempt * 50))
if kill -0 "$pid" 2>/dev/null; then
  echo "Sound playback did not honor SIGINT within 3000ms" >&2
  exit 1
fi

set +e
wait "$pid"
exit_status=$?
set -e
trap - EXIT HUP INT TERM

OPENDESK_SOUND_CANCEL_RUNTIME_LOG="$runtime_log" \
OPENDESK_SOUND_CANCEL_STDOUT_LOG="$stdout_log" \
OPENDESK_SOUND_CANCEL_OBSERVED_EXIT_MS="$observed_exit_ms" \
OPENDESK_SOUND_CANCEL_EXIT_STATUS="$exit_status" \
OPENDESK_SOUND_CANCEL_RUN_DIR="$run_dir" \
  "$binary" -script tests/runtime-api/sound-cancel-validation.js -console-mode script \
  -log-dir "$run_dir/validation-runtime-log"
