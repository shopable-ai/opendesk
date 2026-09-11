# Script Runner Simple

`script-runner-simple.js` is the lightweight production/user-facing launcher for ordinary OpenDesk JavaScript recipes. It is intentionally separate from `recording-console-simple.js`, which remains the developer/Recorder surface.

## Run

From the repository root, use the default production directory `<Execution.workdir>/recipes`:

```bash
./dist/opendesk -ui -script examples/custom-ui/script-runner-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/script-runner-simple
```

To use another script directory on macOS/Linux:

```bash
OPENDESK_SCRIPT_RUNNER_DIR=/absolute/path/to/recipes ./dist/opendesk -ui -script examples/custom-ui/script-runner-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/script-runner-simple
```

On PowerShell:

```powershell
$env:OPENDESK_SCRIPT_RUNNER_DIR='C:\path\to\recipes'; .\dist\opendesk.exe -ui -script examples/custom-ui/script-runner-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/script-runner-simple
```

The script root is not scanned recursively. Direct, non-hidden `*.js` files are production entries.

## Main toolbar

The compact native toolbar is anchored at the active display's right-center edge and contains only:

```text
[Run] [Stop] [current/default script] [Script List]
```

- `Run` always launches script `#1`.
- `Stop` cancels the current child OpenDesk execution and the unstarted remainder of a queue; it does not close the Runner.
- The label shows `#1` while idle and the current script while running.
- `Script List` opens the lower-frequency management surface.

Recorder, Generate, Replay, mouse/debug controls, realtime terminal and Scheduler controls are deliberately not part of this production toolbar.

## Script list and order

The Script List supports:

- one-row Run;
- checkbox selection + `Run Selected`;
- deterministic serial execution in current list order;
- fail-fast after the first failed script;
- `↑` / `↓` order changes;
- rescan;
- open script directory;
- explicit recovery when `.opendesk-runner.json` is invalid.

Order is persisted in the script root:

```json
{
  "schemaVersion": 1,
  "order": ["erp.js", "report.js"]
}
```

`order[0]` is the default script; there is no separate `defaultScript` state. If the config is missing, direct `*.js` names are deterministically sorted. New files are appended after configured existing files. Deleted files are ignored. A damaged config disables Run until the user explicitly restores or changes the order.

## Execution and evidence

Target scripts are never evaluated inside the Runner execution. The Runner uses the current `System.getExecutablePath()` and starts a fresh standard OpenDesk process through `Command.run()`:

```text
Runner -> current OpenDesk executable -> -script <recipe.js>
```

Each child run receives an independent log directory under:

```text
.runtime/examples/custom-ui/script-runner-simple/runs/
```

The parent emits stable records such as `SCRIPT_RUNNER_READY`, `SCRIPT_RUNNER_ORDER_CHANGED`, `SCRIPT_RUNNER_RUN_START`, `SCRIPT_RUNNER_RUN_FINISH`, `SCRIPT_RUNNER_RUN_CANCELED`, and `SCRIPT_RUNNER_ERROR`.

`Command.run()` is not a realtime terminal API, so P0 does not pretend to stream stdout/stderr. Windows uses the native `FloatingWindow` toolbar without WebView2; opening the Script List uses `ui.createWindow()` and therefore requires WebView2 on Windows, matching the existing Custom UI capability contract.
