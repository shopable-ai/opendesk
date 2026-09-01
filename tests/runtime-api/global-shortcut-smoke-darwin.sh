#!/bin/sh
# Real macOS global-shortcut gate. It starts the JavaScript smoke in one
# process, makes TextEdit foreground, and injects the key from a different
# System Events process. This is intentionally separate from the Runtime's
# own keyboard API: macOS does not classify a process's self-injected key as a
# system-global event for its listener.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"

binary=${OPENDESK_BINARY:-./opendesk}
case "$binary" in
  /*) ;;
  *) binary="$root/$binary" ;;
esac

if [ ! -x "$binary" ]; then
  echo "OpenDesk binary is not executable: $binary" >&2
  exit 2
fi

run_dir=${OPENDESK_GLOBAL_SHORTCUT_RUN_DIR:-"$root/.runtime/tests/runtime-api/global-shortcut"}
mkdir -p "$run_dir"
log="$run_dir/global-shortcut-smoke.log"
"$binary" -script tests/runtime-api/global-shortcut-smoke.js -console-mode script >"$log" 2>&1 &
pid=$!

cleanup() {
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

ready=false
attempt=0
while [ "$attempt" -lt 100 ]; do
  if grep -q 'GLOBAL_SHORTCUT_EXTERNAL_TRIGGER_READY' "$log" 2>/dev/null; then
    ready=true
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.1
done
if [ "$ready" != true ]; then
  cat "$log" >&2
  exit 1
fi

# macOS virtual key code 25 is the physical 9 key; System Events runs out of
# process, so this proves the system-global listener rather than an in-runtime
# direct callback.
osascript -e 'tell application "System Events" to key code 25 using {command down, shift down}'

if ! wait "$pid"; then
  cat "$log" >&2
  exit 1
fi
if ! grep -q 'GLOBAL_SHORTCUT_SMOKE_OK' "$log"; then
  cat "$log" >&2
  exit 1
fi
trap - EXIT INT TERM
cat "$log"
