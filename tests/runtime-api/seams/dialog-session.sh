#!/usr/bin/env bash
set -euo pipefail

# Explicit native Dialog lifecycle seam. It owns concurrent Runtime/AX observer
# processes, WindowServer screenshots, and external presses while Dialog Promises
# remain pending.
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

dialog
