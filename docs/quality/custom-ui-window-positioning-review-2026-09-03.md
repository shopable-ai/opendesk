---
title: Custom UI Window Positioning Design Review
date: 2026-09-03
status: accepted
score: 97/100
scope: Custom UI and FloatingWindow initial and runtime positioning
---

# Custom UI window positioning design review

## Decision

Accept the positioning design at **97/100**. The public declaration is now an
explicit discriminated union instead of a set of mutually exclusive top-level
fields:

```js
// FloatingWindow
new FloatingWindow({
  position: { mode: 'absolute', x: 120, y: 80 }
});
new FloatingWindow({
  position: {
    mode: 'anchor', horizontal: 'right', vertical: 'center',
    margin: 16, display: 'active'
  }
});

// ui.createWindow
await ui.createWindow({
  id: 'panel',
  position: { mode: 'absolute', bounds: { x: 120, y: 80, width: 420, height: 180 } },
  content: { html: '<span id="ready">Ready</span>' }
});
await ui.createWindow({
  id: 'panel',
  position: {
    mode: 'anchor', size: { width: 420, height: 180 },
    horizontal: 'right', vertical: 'bottom', margin: 16, display: 'primary'
  },
  content: { html: '<span id="ready">Ready</span>' }
});
```

`position.mode` is the only preferred initial form. `FloatingWindow({x,y})`
and `ui.createWindow({bounds})` remain absolute-position compatibility forms;
they cannot be mixed with `position`. The unshipped top-level placement draft
(`{placement}` / `{size,placement}`) is deliberately rejected as
`INVALID_SPEC`, with a migration message; there is no hidden precedence rule.

The runtime action remains `setPlacement({horizontal, vertical, margin,
display})`: it is a verb that reanchors an existing native window, whereas
`position` is a noun that makes the initial mode discoverable to an editor.

## Official platform comparison

| System | Official surface | What it establishes for this API |
| --- | --- | --- |
| AppKit | [`NSWindow.setFrameOrigin`](https://developer.apple.com/documentation/appkit/nswindow/setframeorigin%28_%3A%29), [`NSWindow.center`](https://developer.apple.com/documentation/appkit/nswindow/center%28%29), [`NSScreen.visibleFrame`](https://developer.apple.com/documentation/appkit/nsscreen/visibleframe), [`NSScreen.frame`](https://developer.apple.com/documentation/appkit/nsscreen/frame) | AppKit exposes frame origin/frame and centering, and says visibleFrame excludes menu bar and Dock. The host anchors its outer frame in visibleFrame and identifies primary with `CGMainDisplayID`; it never uses the full screen frame for safe placement. |
| Electron | [`BrowserWindow`](https://www.electronjs.org/docs/latest/api/browser-window/), [`screen`](https://www.electronjs.org/docs/latest/api/screen/) | The mainstream cross-platform API calls the primitives `x/y`, `setPosition`, `setBounds`, and `center`; display metadata provides bounds/workArea and scale factor. This supports keeping absolute frame and runtime movement separate from anchor convenience. Electron also documents Wayland coordinate restrictions, so a framework must retain an unavailable/partial model rather than promise universal global coordinates. |
| Tauri | [`window` API](https://v2.tauri.app/reference/javascript/api/namespacewindow/), [`Positioner`](https://v2.tauri.app/plugin/positioner/) | Core Tauri uses logical/physical `setPosition`, `setSize`, `center`, `currentMonitor`, and `primaryMonitor`; its preset-position facility is a separate plugin. Monitor position/work area are physical while creation coordinates can be logical, confirming the need to document point/DPI conversion at the driver boundary. |
| Qt | [`QWindow`](https://doc.qt.io/qt-6/qwindow.html), [`QScreen`](https://doc.qt.io/qt-6/qscreen.html) | Qt uses geometry and frame position relative to virtual geometry; `availableGeometry()` excludes taskbars/system menus and `devicePixelRatio()` converts to device pixels. This supports negative virtual coordinates and a distinct usable work area. |
| WPF | [Windows in WPF overview](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/) | WPF exposes `Left`/`Top` for a live window and `WindowStartupLocation` with `Manual`, `CenterOwner`, and `CenterScreen` for startup policy. This is the closest built-in precedent for separating absolute location from a startup placement choice. |

### Terminology conclusion

No surveyed core window system makes a generic top-level parameter named
`placement` the dominant primitive. They broadly use these meanings:

| Term | Normal semantic role | Custom UI mapping |
| --- | --- | --- |
| `x` / `y` | Absolute top-left point in a desktop/virtual-screen coordinate space | `position.mode:"absolute"` for a toolbar; legacy paired `x/y` remains supported. |
| `position` | A point setter in some APIs, or the broad concept of window location | The explicit union that selects an initial positioning strategy. |
| `bounds` / `geometry` / `frame` | Location plus outer size (or a documented content/frame distinction) | `position.bounds` is an outer native frame; `WindowState.bounds` reads it back. |
| alignment / flex / grid / CSS placement | Layout of children inside a content box | Not a window API. It must remain inside HTML/CSS and never alter native frame placement. |
| anchor / preset placement | A convenience relation to a display/owner/work area | `position.mode:"anchor"` / runtime `setPlacement()`: the nine-way, display-work-area calculation. |

This vocabulary is why the final API calls the declaration `position` and the
relative mode `anchor`, while retaining `setPlacement()` only as an action.

## Behavioral contract

- Anchors cover left/center/right × top/center/bottom. `margin` affects an
  edge-aligned axis only; a centered axis stays mathematically centered.
- `active` selects the display under the pointer at each operation, `primary`
  selects the current system main display, and `current` selects the existing
  window's display. Initial `position` and pre-show `setPlacement()` accept
  only `active`/`primary`; `current` is runtime-only.
- AppKit uses each `NSScreen.visibleFrame`, so menu bar, Dock, camera housing,
  and system-reserved space are excluded. Coordinates and margins are logical
  desktop points; primary-relative top-left coordinates permit negative
  secondary-monitor origins. The driver performs Retina/DPI conversion.
- If the current outer frame plus required edge margin does not fit, resolution
  fails with structured `INVALID_SPEC`; it does not crop, shrink, wrap, or
  silently move to another display.
- A successful `setPosition`, `setBounds`, or `setSize` leaves the window at
  that absolute frame. A successful `setPlacement` resolves from its then
  current outer size. Failure leaves the prior local mode/frame intact.
- Anchoring is one-shot. User movement, resize, scale/work-area changes, and
  display removal do **not** cause an unexpected automatic jump. macOS first
  moves an orphaned window to a viable display; callers that need a fresh edge
  placement call `setPlacement({display:'current', ...})` afterward.

## Scorecard

| Area | Weight | Score | Current-source and evidence basis |
| --- | ---: | ---: | --- |
| Semantic clarity; separate window positioning from content layout | 15 | 15 | Explicit `position.mode`, documentation taxonomy, and a hard boundary between AppKit outer frames and HTML/CSS. |
| Conflict removal and type expressiveness | 15 | 15 | TypeScript discriminated unions; strict Runtime JSON decoding; negative tests reject missing/mixed members and retired draft fields with `INVALID_SPEC`. |
| Multi-display, negative coordinates, DPI/Retina, work area | 15 | 14 | `visibleFrame`, `CGMainDisplayID`, global conversion, and core negative-work-area test. One live topology is available in this run, not an automated physical unplug/DPI-switch matrix. |
| Initial positioning and runtime switching | 10 | 10 | Initial anchor/absolute paths plus successful `setPlacement` and `setPosition` exercised in the native Runtime suite. |
| Resize, topology change, and no-fit behavior | 10 | 9 | Deterministic no-auto-reanchor policy, no-fit `INVALID_SPEC`, and core overflow test. Physical display removal is documented but not hardware-injected. |
| Cross-platform mapping | 10 | 9 | Model maps to Electron/Tauri/Qt/WPF primitives; macOS is live. Windows/Linux accurately report unavailable rather than claiming an untested native implementation. |
| Backward compatibility, migration, and errors | 10 | 10 | Existing absolute forms remain; draft anchors have an explicit breaking migration and never rely on priority; structured errors retain code/operation/capability. |
| Documentation, examples, machine index, and editor types | 10 | 10 | API page, `runtime-api.ai.json`, both declaration files, exact-command README/JSON, and Runtime tests agree on `position.mode`. |
| JS Runtime, native UI, screenshots, and resource cleanup | 5 | 5 | Fresh Custom UI gate (15/15), public example AXPress/copy/close, native screenshots, and zero-resource cleanup report. |
| **Total** | **100** | **97** | Every critical item is at or above 80% of its weight; total exceeds 95. |

## Fresh validation evidence

- `gofmt` completed on all changed Go files.
- `go test ./pkg/customui/...` passed, including the nine-anchor and
  negative-work-area/no-fit core cases.
- `go test ./automation -run 'CustomUI|Floating' -count=1` passed.
- `make build` rebuilt both `dist/opendesk` and `dist/opendesk-ui-host` from
  the current Go/native source.
- `./scripts/test_runtime_apis.sh contract` passed; evidence:
  `.runtime/tests/runtime-api/20260903T093435Z-48869/`.
- `./scripts/test_runtime_apis.sh custom-ui` passed all 15 behavior tests,
  ran its expected exception/missing-host probes, and reported zero live UI
  resources at cleanup; evidence:
  `.runtime/tests/runtime-api/20260903T093447Z-49100/`.
- The documented command was run unchanged from repository root. Its final
  Runtime log reports `position.mode:"anchor"`, observed outer bounds
  `{x:1844,y:374,width:60,height:273}`, `VERTICAL_QUICK_REPLY_COPIED`, and
  normal close at `.runtime/examples/custom-ui/toolbar-vertical-quick-replies/`.
  A PID-scoped AXPress copied the welcome reply and captured the real native
  panel before/after at
  `.runtime/tests/custom-ui-placement-public/before-axpress.png` and
  `.runtime/tests/custom-ui-placement-public/after-axpress.png`.

## Remaining risks

- The native implementation is macOS AppKit only in this release; the
  cross-platform mapping is a design/driver contract, not Windows or Linux
  live Runtime evidence.
- Physical display hot-unplug, mixed-scale movement, and menu-bar/Dock
  configuration changes are not simulated by this test run. The documented
  one-shot anchor policy avoids pretending those events were live-tested.
- System window enumeration may degrade for a nonactivating panel, so the
  public-example companion controller used the fresh example process's UI-host
  PID and bounds; `mouse.clickForPID` independently verified the PID-scoped
  native AXButton before pressing it.
