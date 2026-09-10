# Custom UI notifications and Windows host

## Scope and ownership

`ui.notify()` is an execution-owned native surface, not the OS `notify()` backend. The existing Go CustomUIRuntime, Session, versioned NDJSON process driver and event-loop handoff own authorization, mutation, cancellation and cleanup. Native timers drive display expiry and animation. Protocol is 1.8.0; old hosts fail version negotiation rather than silently accepting new fields. No second JavaScript execution or Fyne app is created.

No `-ui` does not imply disabled: existing per-script `clawdesk.runtime.json` can grant `ui`. No flag and no grant remains UI_DISABLED; `-no-ui` wins. Noninteractive HTTP UI authorization is unchanged. Notification display is optional UI evidence, never business success.

## Native implementations

macOS adds an AppKit nonactivating NSPanel and a bounded native notification view to the existing host. Windows adds a self-contained .NET 8 WinForms/Win32 sidecar in `pkg/customui/winhost/`. It renders FloatingWindow controls and notifications natively. Both hosts measure platform text and clamp width to 280–480pt/DIP and height to 52–124pt/DIP; short text uses the minimum width, while longer text expands only to the maximum. Main text is limited to three lines and caption text to two. It uses WebView2 only for the existing restricted HTML/DOM controller and Dialog surfaces. Document scripts, host objects, browser permissions, popups, downloads and external navigation are disabled. Only the reviewed fixed bridge is executed by the host. Images are confined to the validated content root, and late symlinks/junctions are rejected.

Build Windows sidecar from repository root with `pwsh -File scripts/build_windows_ui.ps1`; ship the complete `dist/ui-host/` publish closure next to the normal Windows Runtime. No macOS backend build is required on Windows. HTML/Dialog requires WebView2 Runtime; toolbar/notifications do not. Main binary and host must come from matching source/protocol. The Windows publisher records source SHA, dirty status and executable hash; a dirty build is not provenance for a pristine commit.

All 160 public icon keys have an explicit Windows glyph mapping. The macOS SF Symbols appearance is not promised on Windows. `iconPresentation.kind:windowsGlyph` reports the actual glyph/font selection; local raster icons preserve original/template modes. Public names and control operations remain stable.

## Position, capture and lifecycle

Global frames use the platform's native desktop coordinate space (macOS points; Windows PMv2 Win32 logical screen coordinates, numerically physical pixels). Internal Windows content DIP geometry is scaled per window DPI, not by dividing the virtual desktop by the primary scale. Existing anchor placement remains one-shot; notification relative follow is an explicit separate mode. Edge fitting, target loss, monitor migration and declared-position failures are observable.

Current-process `page.screenshot` suspends visible notification windows, confirms `onScreen:false`, captures, then restores only still-live windows. It does not remove another OpenDesk process's overlay or every human Recorder capture route. Do not claim global capture exclusion or desktop privacy. Interactive close buttons can be captured by human Recorder unless that route explicitly excludes them; passive mode remains the default for timed hints, while persistent hints are necessarily closable. Full message text should not contain secrets.

There is currently no global Recorder exclusion for every OpenDesk-owned native surface. `RecorderSession.excludeControlClick(event)` establishes an auditable boundary only when a Custom UI controller receives and forwards that exact control event; the host-owned notification close button has no such public control event. This is a Recorder qualification blocker for clicking the close button during active capture, although the unmatched input remains visible and blocks generation rather than being silently replayed. The minimum Runtime-owned follow-up is to register the current execution's UI-host PID/native window identities with Recorder, resolve pointer envelopes against those identities, and append a first-class `RECORDER_OWNED_UI_INPUT` raw boundary containing the exact event IDs, window identity, bounds and timestamp. `buildActions()` may exclude only validated referenced envelopes; unresolved or partial matches must stay blocked. Native listener filtering or screenshot redaction without this evidence is not an acceptable substitute.

Host expiry and user close release UI resources. Go removes ephemeral notification records and terminal driver sinks; native closed snapshots are bounded to 64. Normal execution teardown closes every resource. At most three simultaneous notifications are accepted; closed handles do not resurrect. Task progress and timeout progress are different fields. Timed hints default to three seconds; `timeoutMs:0` is normalized to `closable:true`, so every persistent hint has an explicit manual exit. Persistent hints do not keep completed executions alive without an explicit observed wait.

## Recording console

Recorder toolbars express ready, recording, paused, stopping, generated and replay state through their own native controls and readback; they do not mirror these control phases into `ui.notify()`. A separately launched replay process does not automatically stream per-action business progress to its parent, and the controller does not parse console output or infer business steps. Semantic Recipes may reuse one optional notification handle at Business Episode granularity under the Human-to-Recipe rules; notification failure or user close must degrade to console observation without changing business behavior or reopening the surface.

## Verification boundary

Public JavaScript contract: `tests/runtime-api/custom-ui-notify.js` and `custom-ui-notify-disabled.js`. Internal normalization, placement, ownership, quota and capture seams: `pkg/customui/notification_test.go`. Real native process protocol checks: `tests/custom-ui/tools/native-host-smoke.cjs`; these do not replace public Runtime JS testing. Existing recorder controller unit tests remain separate from desktop tests.

A successful compile or protocol smoke does not constitute human visual acceptance or prove every DPI/monitor/accessibility/input case. Windows status is Experimental until the interactive matrix (all controls, events, focus, close/expiry, mixed DPI, monitor removal, capture, WebView2 absence and disposal) is recorded against matching main/host binaries. No numerical expert score is claimed without this evidence.
