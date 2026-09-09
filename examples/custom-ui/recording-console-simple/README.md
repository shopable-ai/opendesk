# Simple recording console

From the repository root, run:

```bash
./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console-simple
```

The always-on-top native `FloatingWindow` keeps one compact row of icon controls: start/re-record, pause/resume, stop, replay/test-run, details, and reveal artifact in Finder. Native separators divide capture, output, and inspection actions. There is no HTML/WKWebView surface or visible status label. Hovering an icon exposes its accessible tooltip. After start, the start icon becomes `3`, `2`, `1`; the initial window context is read only after the countdown ends.

Stopping is the single completion action: the controller saves the immutable recording, builds its internal Actions representation, and automatically generates the JavaScript file. Actions remain available in the details dialog for diagnostics but are not a user-facing workflow step. Generation never starts replay. The replay button becomes available only after the script exists, so injecting real input always requires a separate explicit click. If automatic generation fails, the same output button changes to a generation-retry action instead of adding a permanent generation button. Finder reveals the generated script after success; before that it opens the recording directory rather than presenting `actions.json` as the primary result.

The details icon opens a native `Dialog.alert()` with the target, errors, compact saved paths, counts, and bounded previews of generated source and test-run output. Full generated source and run output remain available at the displayed artifact and log paths. Generated scripts preserve every non-pause recorded action gap at 1× speed, with a default 500ms floor and 30s ceiling; each `sleep` keeps the raw gap in an inline comment for later review or AI adjustment. Closing the dialog does not stop capture. Closing the toolbar safely stops capture and cancels an in-flight generated-script run.

Pause, resume, and stop clicks are registered with `RecorderSession.excludeControlClick()` before their control action runs. The raw package keeps that explicit boundary while `buildActions()` excludes the matching native pointer envelope, so toolbar controls cannot silently become generated target clicks. Details are disabled during active capture so a modal dialog cannot interfere with the recorded desktop interaction.

The six normal controls use the built-in icon registry: `play.fill`, `pause.fill`, `stop.fill`, `repeat`, `info.circle`, and `folder.fill`. The replay position temporarily uses `ai.generate` while automatic generation is running or needs retry. Only the countdown uses three local template PNGs. Re-render those maintained assets on macOS with:

```bash
swift examples/custom-ui/recording-console-simple/icons/render-countdown-icons.swift examples/custom-ui/recording-console-simple/icons
```

`Recorder.start()` retains the selected PID and title as initial provenance. A second foreground read is best-effort: a startup race is reported as a warning, not a rejection. Capture is desktop-global, so changing a window title, focusing another window, or switching applications does not stop the session or filter subsequent input. Because keyboard capture follows the foreground application when explicitly enabled, keep the entire recorded desktop sequence non-sensitive and pause or stop before unrelated work.

Generated basic scripts enforce the recorded operating system and display-coordinate assumptions, but recorded PID and title are provenance only. They never block replay because process IDs are not stable across executions and a cross-application sequence necessarily changes foreground identity. Pressing replay starts a three-second preparation countdown so you can restore the intended starting desktop and application state; the basic candidate does not infer that state or verify business results.
