# Button-first Floating Toolbar v1 acceptance

Date: 2026-09-01 (Asia/Shanghai)  
Status: accepted; Git closeout pending separate user confirmation  
Scope: `FloatingWindow` only. Generic `ui.createWindow()` remains the restricted WKWebView Custom UI implementation.

## Product boundary

`FloatingWindow` sends a structured `ToolbarSpec` with ordered `ButtonSpec` and
revisioned `ButtonState` values to the native host. On macOS the production
tree is `NSPanel -> CDToolbarView -> NSStackView rows -> CDToolbarButton :
NSButton`. The native-toolbar branch returns before generic WKWebView overlays
or Accessibility proxy controls are allocated.

This historical acceptance run exercised `play.fill`, `pause.fill`, `stop.fill`,
`gearshape.fill`, `paperplane.fill`, and `timer`. The current curated registry
contains 150 entries; Go, Objective-C, and TypeScript maps are generated from
`pkg/customui/assets/toolbar-icons-v1.json`.

## Formal JavaScript evidence

The sole entry point was:

```bash
scripts/test_runtime_apis.sh custom-ui
```

Fresh passing run: `.runtime/tests/runtime-api/20260901T104006Z-80698/`.

- `RUNTIME-API-CUSTOM-UI-BEHAVIOR`: 5/5 passed; the final `custom-ui` gate
  remains absent/running until all post-suite lifecycle checks finish.
- Real native layouts: 1 = 60x81, 5 = 252x81, 20 = 960x129, 32 = 960x129.
- All buttons are 40x40 with an 8pt gap; 20/32 preserve order and wrap after 19.
- Five semantic Accessibility names are `开始`, `停止`, `设置`, `发信`, `定时`;
  the 32-button run has 32 unique, non-empty native bounds.
- Pointer mouse down/up and PID-directed `AXPress` both reach the same
  `CDToolbarButton` target/action and execute distinct user JavaScript callbacks.
- Callback counts are `{startPause:2, stop:1, settings:1, send:1, timer:1}` with
  `start,pause` branches; the start callback calls `System.getSystemInfo()`.
- normal, hover, pressed, active, busy, error, and disabled screenshots are
  fresh and visually distinct. State transitions preserve 40x40 bounds.
- Focus PID remains the Codex foreground process before show, after Pointer,
  and after AXPress; it never becomes the toolbar host PID.
- normal close, user close, controller close, script exception, one-second
  execution timeout with an unresolved callback Promise, HTTP cancel, and
  SIGTERM server shutdown all emit zero resource counts.
- The gate ends with `no_residual` and reports no run-scoped process.
- The final gate records `behaviorFinishedAt=10:40:20.900Z`,
  `finishedAt=10:40:26Z`, `postSuite.finalized=true`, and seven passing
  lifecycle/no-residual probes. Coverage and acceptance reject failed or
  unfinalized Custom UI envelopes.
- The five split JavaScript test files are copied into the run-local evidence
  directory before execution, executed from those copies, and bound by a
  SHA-256/size manifest whose hashes were independently recomputed.

Primary evidence:

- `runtime-logs/custom-ui/floating-toolbar/result.json`
- `runtime-logs/custom-ui/floating-toolbar/accessibility.json`
- `runtime-logs/custom-ui/floating-toolbar/resources.json`
- `runtime-logs/custom-ui/floating-toolbar/test-sources.json`
- `normal.png`, `hover.png`, `pressed.png`, `active.png`, `busy.png`,
  `error.png`, `disabled.png`, `twenty-buttons.png`, `thirty-two-buttons.png`

## Internal and package evidence

Final focused race runs passed for `pkg/customui/...`, the FloatingWindow
reducer, execution teardown, HTTP cancel/server shutdown, and CLI activation.
The unambiguous final logs are
`.runtime/tests/floating-window-v1/final-race-{customui,automation,execution,http,cmd}.log`.

The current catalog/contract run is
`.runtime/tests/runtime-api/20260901T104212Z-87539/` (250/250 passed). The
current negative conformance run is
`.runtime/tests/runtime-api/20260901T104135Z-85779/` (10/10 passed), including
failed and unfinalized Custom UI gate rejection.

The local app package is
`.runtime/tests/floating-window-v1/package/OpenDesk.app`. It contains executable
`Contents/Helpers/opendesk-ui-host`; `codesign --verify --deep --strict` passed.
The signature is local ad-hoc (`Signature=adhoc`), not notarization or a public
release.

## Audit status

Independent native architecture review scored 99/100. Independent
JavaScript/evidence re-review scored 98/100 after its original three P1
findings were fixed and reverified. Both reviews report P0=0, P1=0, no
89-point cap, and recommend acceptance; the mean score is 98.5/100.

The native review's remaining P2 notes that `active` deliberately has draw
priority over the extra hover/pressed shade and that an explicitly combined
error+busy state draws red with the spinner; the seven standalone required
states remain visually distinct. The evidence review's remaining P2 notes are
that a complete same-run aggregate `coverage.json` was not produced (the
fail-closed behavior is proven by source and the 10/10 formal negative gate),
and that shared `MM` files require explicit hunk review at Git closeout.
