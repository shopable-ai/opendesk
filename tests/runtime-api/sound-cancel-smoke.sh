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

if [ "$exit_status" -eq 0 ]; then
  echo "Sound cancellation probe exited successfully instead of canceled" >&2
  exit 1
fi
if grep -q 'SOUND_SYNC_CANCEL_UNEXPECTED_RETURN' "$stdout_log"; then
  echo "Sound.play returned normally after the cancellation marker" >&2
  exit 1
fi
if ! grep -q 'status=canceled' "$stdout_log"; then
  echo "Sound cancellation probe did not report canceled status" >&2
  sed -n '1,160p' "$stdout_log" >&2
  exit 1
fi

python3 - "$runtime_log/events.ndjson" "$runtime_log/summary.json" "$run_dir/result.json" "$observed_exit_ms" "$exit_status" <<'PY'
import json
import pathlib
import sys

events_path, summary_path, result_path = map(pathlib.Path, sys.argv[1:4])
observed_exit_ms = int(sys.argv[4])
exit_status = int(sys.argv[5])
summary = json.loads(summary_path.read_text(encoding="utf-8"))
if summary.get("status") != "canceled":
    raise SystemExit("summary status is not canceled")
cleanup = None
for line in events_path.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    event = json.loads(line)
    if event.get("kind") == "cleanup":
        cleanup = event.get("fields") or {}
if cleanup is None:
    raise SystemExit("runtime cleanup event is missing")
sound_counts = {key: cleanup.get(key) for key in ("soundWorkers", "soundPending", "soundPlaybacks")}
if any(value != 0 for value in sound_counts.values()):
    raise SystemExit("sound resources were not drained: " + json.dumps(sound_counts, sort_keys=True))
result = {
    "schemaVersion": 1,
    "status": "passed",
    "runtimeStatus": summary["status"],
    "exitStatus": exit_status,
    "observedSignalToExitMsUpperBound": observed_exit_ms,
    "maximumAllowedMs": 3000,
    "soundResources": sound_counts,
    "events": str(events_path),
    "summary": str(summary_path),
}
result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
print("[RUNTIME-API-SOUND-CANCEL] " + json.dumps(result, sort_keys=True))
PY
