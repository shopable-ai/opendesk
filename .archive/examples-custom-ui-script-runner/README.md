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

The default `<Execution.workdir>/recipes` directory is managed by Script Runner and is created automatically when missing. An explicitly configured `OPENDESK_SCRIPT_RUNNER_DIR` is treated as an external path: if it is missing, unreadable, or not a directory, the List Page shows an error state instead of silently creating a replacement directory.

## Main list page and toolbar

Script Runner opens its List Page on startup even when there are zero scripts. Empty is a normal list state, not an error or a reason to close the window.

The compact native toolbar is anchored at the active display's right-center edge and contains only:

```text
[Run] [Stop] [current/default script] [Script List]
```

- `Run` launches script `#1` and is disabled when the list is empty, the script directory is unavailable, the ordering config is invalid, or a run is already active.
- `Stop` is enabled only while a child run is active. It cancels the current child OpenDesk execution and the unstarted remainder of a queue; it does not close the Runner.
- The label shows `#1` while idle and the current script while running.
- `Script List` re-shows the same management surface when it has been hidden or closed.

Recorder, Generate, Replay, mouse/debug controls, realtime terminal and Scheduler controls are deliberately not part of this production toolbar.

## List states and refresh

The List Page keeps one state model for normal startup, refresh, execution, and failures:

```text
loading -> empty | ready | error
ready <-> empty      (Refresh)
ready -> running -> ready
```

When no direct `*.js` files exist, the page shows an Empty State with `Open Script Directory` and `Refresh`. `Run` and `Run Selected` are disabled, while Refresh and directory access remain available.

Refresh rescans in place. Removing all scripts clears stale selection and transitions `ready -> empty`; adding scripts transitions `empty -> ready` without restarting Script Runner. The page keeps a stable row-control pool for normal refreshes. If a refresh grows beyond the current row capacity, the list window is recreated once with a larger capacity rather than adding a pagination/database subsystem in P0.

A successful scan with zero JavaScript files is `empty`. Directory/configuration failures are `error` and remain visually distinct. A damaged `.opendesk-runner.json` keeps the discovered scripts visible but disables execution until the user explicitly restores the default order.

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

`Command.run()` is not a realtime terminal API, so P0 does not pretend to stream stdout/stderr. Windows uses the native `FloatingWindow` toolbar without WebView2; the List Page uses `ui.createWindow()` and therefore requires WebView2 on Windows, matching the existing Custom UI capability contract.
