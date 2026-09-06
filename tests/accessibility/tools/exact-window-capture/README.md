# Exact-window capture test helper

This macOS-only test tool creates a visual receipt for one already-reviewed
window. It is not a Runtime API and is not a user workflow. It accepts only
two fixed test scenarios: the repository-owned AppKit fixture and the one
controlled macOS Chess About scenario. It cannot be pointed at an arbitrary
application.

The caller must supply the fixed scenario plus the exact PID, launch time,
`CGWindowID`, and bounds obtained from a fresh `WindowInfo`. The direct-launched
fixture is verified by its fixed executable path in the helper plus its Runtime
gate before and after capture; for Chess, the helper also verifies the fixed
bundle, executable path, and launch fingerprint. It then re-reads the one
CoreGraphics row and rejects any mismatch
in PID, ID, normal layer, onscreen state, sharing state, or bounds. It then uses `CGWindowListCreateImage` with
`kCGWindowListOptionIncludingWindow`; Apple documents that option as using only
the supplied window. It has no region, screen, OCR, mouse, RobotGo, or
`screencapture` fallback. The raw exact-window image must have alpha plus
non-black, non-uniform pixels; a blank or unreadable result is rejected.
The helper calls the non-prompting screen-capture preflight, validates the same
application and row before and after the in-memory capture, then composites the
verified target image over white in memory. Transparent pixels are therefore
deterministic white rather than pixels from the desktop or another window. It
atomically publishes its PNG only after both checks pass. Output paths are fixed
below `.runtime/tests/accessibility/` and existing files are never overwritten.

Build output is intentionally local:

```sh
cd /Users/mac/Documents/workspace/clawdesk
sh tests/accessibility/tools/exact-window-capture/build.sh
```

Run the static guard and no-desktop self-test before any controlled live use:

```sh
node tests/accessibility/tools/exact-window-capture/static-contract.test.js
.runtime/tests/accessibility/tools/exact-window-capture/exact-window-capture --self-test
.runtime/tests/accessibility/tools/exact-window-capture/exact-window-capture --preflight
```
