# Desktop Measurement Product Oracle

> Structured UI / Interaction contract extracted from the approved executable HTML/CSS/JavaScript prototype in this directory.
>
> **Authority:** `index.html` + `prototype.css` + `model.js` + `interaction-core.js` are the only primary UI / Interaction evidence for this document. When this document conflicts with those executable sources, the executable prototype wins. Production code, architecture documents, README text, and tests may verify or consume this Oracle, but must not redefine it.

> **ORACLE STATUS: NOT YET FROZEN**
>
> The HTML → Oracle conversion is now traceable and substantially complete, but the executable prototype still contains four product-significant internal conflicts listed in §20. Those conflicts must be resolved in the prototype before this Oracle can be frozen for Production Gap Closure.

## 0. Scope, evidence boundary, and source hierarchy

This document describes product-visible UI hierarchy, state, interaction, state transitions, pointer/keyboard behavior, visual feedback, measurement semantics, structured evidence, and explicit non-contracts.

It does **not** prescribe native capture APIs, AX/UIA/OCR implementation, thread models, DPI implementation, Runtime internals, or production ownership.

### Primary evidence

- `index.html`: visible hierarchy, controls, labels, tooltips, simulated entry points, Inspector/Adjust/Idle harness UI.
- `prototype.css`: visibility, active/disabled/hover/focus states, visual hierarchy, responsive show/hide behavior.
- `interaction-core.js`: executable state machine, pointer/keyboard handling, candidate/magnet behavior, snapshot lifecycle, result/reset/persistence behavior, structured evidence and clipboard copy behavior.
- `model.js`: geometry values actually consumed by the prototype/export.

### Secondary verification only

- `tests/desktop-measurement/browser.test.py`: verifies executable behavior but is not allowed to invent Oracle behavior.
- `README.md`: explains intent and maintenance boundaries but is not primary UI / Interaction evidence.
- Production implementation and qualification files: consumers of this Oracle, never sources for it.

### Prototype harness vs product behavior

The page contains both Measurement behavior and synthetic harness controls. The following are **prototype harness only** unless separately expressed as a Measurement semantic contract below:

- the page header and three clickable simulated entry buttons;
- automatic first entry via `requestAnimationFrame(() => begin('prototype-auto'))`;
- the synthetic WeChat desktop and synthetic UI tree;
- footer fixture selectors (`候选来源`, `显示器`, `视觉容差`) and footer keyboard legend;
- ADJUSTING-only synthetic buttons (`模拟滚动`, `切换 Tab`, `展开 / 收起菜单`);
- the post-exit `idle` card and its `重新进入` button;
- browser clipboard implementation details;
- responsive demo-page layout rules whose only purpose is fitting the browser fixture.

These harness elements may demonstrate a real product contract (for example, three entry sources must address one session), but Production must not copy harness chrome simply because it appears in this page.

## 1. Product mental model

```text
entry source
  -> one Measurement Session
  -> PREPARING
  -> FREEZING
       -> establish current Reference Window fixture
       -> capture one immutable Frozen Snapshot generation
  -> MEASURING
       + pointer coordinates / source pixel
       + Candidate Stack / Magnet preview
       + Target / optional Local Reference
       + Point / Region / Point↔Point / Region↔Region
       + HUD / status / annotations
       + optional Inspector
  -> Update
       -> same session, replace snapshot, clear snapshot-bound result state
  -> Adjust
       -> invalidate snapshot identity, hide Measurement chrome, operate live desktop
  -> Continue
       -> same session, capture a new frozen generation
  -> Exit
       -> IDLE, destroy snapshot-bound state
```

Terms:

- **Measurement Session**: one logical measuring lifetime. Re-entry while active addresses the same session.
- **Frozen Snapshot**: one immutable capture generation used as the visible/measurable source until Update, Adjust/Continue, or Exit invalidates it.
- **Reference Window**: the current window fixture used as primary coordinate/margin reference. The prototype does **not** contain a user-facing Reference selection/reselection interaction; see §6.
- **Candidate**: the one currently highlighted snap-able region/control hypothesis under the pointer.
- **Candidate Stack**: ordered candidates under the pointer for the current snapshot/provider; only one is highlighted at a time.
- **Target**: user-confirmed region/control used for Region measurement and margins. It may come from a semantic/visual candidate or manual drag.
- **Local Reference**: at most one useful semantic parent/layout region associated with a semantic Target. It is optional and never fabricated for manual/visual Targets.
- **Selection**: transient candidate or drag preview, or an incomplete pair measurement.
- **Measurement**: confirmed point, Target region, two-point relation, or two-region relation plus derived evidence.
- **Inspector**: optional right-side structured evidence view; never the default measurement UI.

## 2. UI hierarchy

```text
Measurement Surface
├─ Frozen Snapshot layer
├─ Measurement overlay
│  ├─ outside-window weak mask
│  ├─ Reference Window outline
│  ├─ Candidate / drag preview
│  ├─ locked Target / region pair rectangles
│  ├─ optional Local Reference
│  ├─ one active four-line margin relation
│  ├─ point-pair handle / distance line
│  └─ region-pair center distance line
├─ pointer micro HUD
├─ corner HUD
├─ status hint
├─ transient toast
├─ bottom floating Toolbar
│  ├─ Point
│  ├─ Region
│  ├─ Point ↔ Point
│  ├─ Region ↔ Region
│  ├─ Magnet
│  ├─ Margin reference toggle
│  ├─ Update
│  ├─ Adjust
│  ├─ Inspector
│  └─ Exit
└─ optional Inspector panel
```

`ADJUSTING` is deliberately different: snapshot layer, overlay, micro HUD, corner HUD, Toolbar, status and Inspector are hidden; the synthetic live desktop becomes pointer-interactive and the harness exposes a minimal Continue control.

## 3. Control inventory and visible states

### 3.1 Measuring Toolbar

| Control | Visible label | Tooltip / shortcut evidence | Selected / disabled behavior | Action |
|---|---|---|---|---|
| Point | `点` | `1 · 点 / 取色` | active when `mode=point` | selects/resets Point mode |
| Region | `区域` | `2 · 区域` | active when `mode=region`; initial mode | selects/resets Region mode |
| Point↔Point | `两点` | `3 · 两点距离` | active when `mode=pp` | selects/resets two-point mode |
| Region↔Region | `两区域` | `4 · 两区域距离` | active when `mode=rr` | selects/resets two-region mode |
| Magnet | `磁吸定位` | `Alt / Option 临时暂停` | active iff persistent Magnet setting is ON | toggles persistent Magnet setting |
| Margin reference | `边距：窗口` or `边距：<Local Reference>` | `只切换当前重点绘制的一组边距` | disabled when no Local Reference; class `optional` hides it at demo width ≤700px | toggles active Window/Local margin relation |
| Update | `更新画面` | `重新冻结当前真实界面，不退出 Measurement` | no selected state | same-session refreeze |
| Adjust | `调整界面` | `隐藏冻结快照与全部 Measurement UI，恢复真实桌面交互` | no selected state | enter ADJUSTING |
| Inspector | `详情` | `I · 按需查看完整数据` | no active CSS state even while Inspector is open | opens Inspector |
| Exit | `退出` | `Esc · 退出 Measurement` | danger text treatment | exits Measurement when clicked |

The prototype uses **text controls, not icons**. It does not define production iconography for these controls.

### 3.2 Generic control feedback

- buttons have a visible hover background change;
- keyboard focus uses a distinct `focus-visible` outline;
- disabled buttons use reduced opacity and default cursor;
- active tool/Magnet state uses a stronger selected treatment;
- the margin-table row corresponding to the active margin reference receives a selected treatment;
- negative margin values receive a distinct warning treatment;
- transient toast is non-interactive (`pointer-events:none`).

### 3.3 Harness-only visible controls

The header entry buttons, footer fixture selectors, ADJUSTING synthetic controls, and `idle` restart card are not production toolbar requirements. They remain traceable because they exercise session/state semantics.

## 4. State model

Externally meaningful phases:

```text
IDLE
  -> PREPARING
  -> FREEZING
  -> MEASURING
       -> FREEZING -> MEASURING                 (Update)
       -> ADJUSTING -> FREEZING -> MEASURING   (Adjust + Continue)
       -> IDLE                                   (Exit)
```

`PREPARING` and `FREEZING` may be short-lived. There is no separate persistent `UPDATING`, `UNFROZEN`, `CLOSING`, or `EXPORTING` phase.

Product-significant state carried by the executable prototype includes:

```text
active / adjusting / phase
session / generation / snapshotId
mode
magnet + temporary alt suspension
pointer
candidate / stack / layer
Target / Local Reference / marginView
pointResult / pointPair / regionPair
dragStart / dragCurrent
Inspector open/closed
status
async candidate epoch/pending state
snapshot-bound pixel cache
```

## 5. Session and entry contract

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-LIFECYCLE-001 | Developer-menu, Recorder, and global-shortcut entry sources must address the same active Measurement Session. | Re-entry while `MEASURING` does not create a second session or snapshot. | `#entry-dev`, `#entry-rec`, `#entry-key`, `begin()` |
| DM-LIFECYCLE-002 | A new session passes through PREPARING/FREEZING and becomes `MEASURING` with a valid snapshot. | Measuring UI is usable only after snapshot creation. | `begin()`, `captureSnapshot()` |
| DM-LIFECYCLE-003 | Session identity, generation and snapshot identity are distinct. | token exposes all three. | `token()` |
| DM-LIFECYCLE-004 | Re-entry while `ADJUSTING` means Continue/refreeze of the same session. | same session id, new snapshot. | `begin()`, `continueMeasurement()` |
| DM-LIFECYCLE-005 | Exit enters `IDLE`, invalidates snapshot identity and clears snapshot-bound target/result/candidate/drag/Inspector/pixel-cache state. | later entry creates a new session. | `exitMeasurement()` |
| DM-LIFECYCLE-006 | Async candidate results are snapshot-scoped. | stale token/epoch results cannot mutate a newer snapshot. | `sameToken()`, `invalidateAsync()`, `applyAsyncCandidate()` |
| DM-ENTRY-001 | The visible simulated global shortcut label is `⌘ / Ctrl + Shift + M`. | label is present in the entry harness. | `#entry-key` |
| DM-ENTRY-002 | The HTML page does not itself capture the OS-global shortcut; its button only simulates that entry source. | no `Meta/Ctrl+Shift+M` key handler exists in prototype. | `index.html`, keyboard handlers |
| DM-ENTRY-003 | Re-entry while measuring produces a transient “same session” toast and returns the current token. | token unchanged. | `begin()`, `notify()` |
| DM-ENTRY-004 | Auto-entry on page load is prototype harness behavior, not a fourth production entry point. | auto call is excluded from production parity. | final `requestAnimationFrame()` |

## 6. Reference Window contract and explicit boundary

The prototype has a current Reference Window, but **does not define user-facing Reference selection or reselection**.

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-REFERENCE-001 | The current Reference Window is established from the synthetic scene before each capture and is used by window-relative coordinates, mask/outline and Target→Window margins. | `win` is current before structured geometry is produced. | `defineScene()`, `captureSnapshot()` |
| DM-REFERENCE-002 | Reference Window is visually distinguished by a weak outside-window mask plus an outline. | mask and outline appear while measuring. | `drawMask()`, `.mask`, `.window-outline` |
| DM-REFERENCE-003 | Update/Continue recompute the current synthetic scene/reference before producing the new snapshot. | newly frozen geometry follows the current live scene. | `captureSnapshot()`, `defineScene()` |
| DM-REFERENCE-004 | No control, shortcut, pointer gesture, or state transition in the prototype lets the user select a different Reference Window or “reselect Reference”. | Production must not invent Reference acquisition/reselection UX and claim HTML parity. | absence from `index.html` and handlers |

Therefore these requested behaviors are **NOT_SUPPORTED_BY_HTML** as user interactions: “select Reference”, “change Reference before Freeze”, “reselect Reference after Freeze”. The Oracle can only constrain how the already-current Reference participates in measurement.

## 7. Freeze / Update / Adjust / Continue contract

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-FREEZE-001 | Measurement uses frozen source pixels; the synthetic underlying desktop is not logically paused. | measured pixels stay tied to one snapshot generation. | `captureSnapshot()`, separate live/snapshot canvases |
| DM-FREEZE-002 | Pixel color is sampled from frozen raw canvases, not overlay/HUD/mask compositing. | provenance says frozen source. | `rawColor()` |
| DM-FREEZE-003 | There is no standalone Freeze/Unfreeze toggle. Entry, Update, and Continue trigger freezing; Adjust is the temporary live-desktop phase. | only those actions change freeze lifecycle. | handlers + lifecycle functions |
| DM-UPDATE-001 | Update keeps the same Measurement Session. | session id unchanged. | `refreshSnapshot()` |
| DM-UPDATE-002 | Update advances generation and creates a new snapshot id. | new generation/snapshot. | `refreshSnapshot()`, `captureSnapshot()` |
| DM-UPDATE-003 | Update invalidates pending candidate work and clears Target, Local Reference, point/pair results, candidate stack, drag state and pixel cache. | snapshot-bound state does not survive. | `invalidateAsync()`, `captureSnapshot()` |
| DM-UPDATE-004 | Update returns to `MEASURING` on the newly frozen source. | phase returns to MEASURING. | `refreshSnapshot()` |
| DM-UPDATE-005 | Update does not reset the selected tool, persistent Magnet setting, Inspector-open state, or pointer position. | those states persist unless separately changed. | absence of reset in `refreshSnapshot()` / `captureSnapshot()` |
| DM-ADJUST-001 | Adjust exists so the user can operate the live underlying desktop before continuing. | live desktop becomes pointer-interactive. | `adjustInterface()`, `.adjusting .desktop-layer` |
| DM-ADJUST-002 | Entering Adjust immediately invalidates snapshot identity. | `snapshotId=null`, structured `snapshot=null`. | `adjustInterface()` |
| DM-ADJUST-003 | During Adjust, snapshot, overlay, micro HUD, corner HUD, Toolbar, status and Inspector are hidden. | Measurement chrome absent. | `.adjusting ... {display:none}` |
| DM-ADJUST-004 | Entering Adjust clears Target, Local Reference, point/pair results and Candidate Stack; Inspector closes; pointer becomes null. | old selection is not current evidence. | `adjustInterface()` |
| DM-ADJUST-005 | Continue keeps the same session and captures a new Frozen Snapshot before returning to MEASURING. | same session, newer generation/snapshot. | `continueMeasurement()` |
| DM-ADJUST-006 | The three live-edit buttons inside the demo are synthetic harness controls, not production Adjustment controls. | Production needs live desktop interaction + Continue semantics, not those exact buttons. | `#live-scroll`, `#live-tab`, `#live-menu` |

## 8. Tool selection, reset, and result lifetime

The first prototype load starts in **Region**.

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-TOOL-001 | Exactly four measurement tools are defined: Point, Region, Point↔Point, Region↔Region. | one active tool button. | `data-mode`, `setMode()` |
| DM-TOOL-002 | Region is initial mode. Explicitly selected mode persists through Update, Adjust/Continue, Exit and later new-session entry until the user selects another mode. | lifecycle functions do not reset `E.mode`. | initial state + absence of mode reset |
| DM-TOOL-003 | Selecting any tool clears current Target/Local Reference, point/pair results, drag state and candidate stack. | fresh result state after selection. | `setMode()` |
| DM-TOOL-004 | Selecting the **already-active** tool also runs `setMode()` and therefore acts as a lightweight clear/reset for current measurement results. | same-mode click/key removes current result. | click handler + `setMode()` |
| DM-TOOL-005 | No dedicated Clear/Reset button or shortcut exists. | Production must not infer one from the HTML. | control/keyboard absence |

Lifecycle result clearing:

- **tool selection/reselection**: clears result/Target/candidate/drag, preserves pointer, mode becomes selected mode;
- **Update**: clears snapshot-bound result state, preserves mode/Magnet/Inspector-open/pointer;
- **Adjust**: clears result state, pointer and Inspector, preserves mode/Magnet;
- **Exit**: clears snapshot-bound result state and Inspector/pointer; mode persists into the next session;
- **re-entry while already measuring**: preserves the current result because no new session/snapshot is created.

## 9. Pointer and selection contract

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-MOUSE-001 | Overlay is the pointer interaction plane while measuring; underlying desktop is not pointer-interactive through it. | overlay receives pointer events. | `#overlay`, `.measuring .desktop-layer` |
| DM-MOUSE-002 | Pointer move updates the current logical screen point, updates drag preview, and schedules candidate resolution when allowed. | micro HUD/candidate can follow pointer. | `pointerMove()` |
| DM-MOUSE-003 | Pointer down starts a drag origin for every tool; individual tools interpret pointer-up differently. | `dragStart/dragCurrent` set. | `pointerDown()` |
| DM-MOUSE-004 | A drag is considered a Region/Region↔Region rectangle only when both width and height are at least 5 logical px. | smaller motion is treated as click/invalid according to tool. | `pointerUp()` |
| DM-MOUSE-005 | Region drag wins over candidate click semantics: a valid drag creates/replaces a manual Target even if a candidate was visible. | manual Target result. | Region branch order in `pointerUp()` |
| DM-MOUSE-006 | Point and Point↔Point use pointer-up position even if the user moved while holding the pointer; drag rectangle itself is ignored. | endpoint is confirmed point. | Point/PP branches |
| DM-MOUSE-007 | Region↔Region requires valid drags; a click/small drag is rejected with status feedback. | pair unchanged on invalid input. | RR branch |

There is no `pointercancel`/pointer-leave product flow in the prototype. Escape is not an intermediate selection-cancel command: it closes Inspector first, otherwise exits the whole session. Partial pair/drag state can instead be cleared by tool reselection/switch, Update, Adjust, or Exit.

## 10. Point / Region / pair tools

| ID | Tool / contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-TOOL-006 | **Point** continuously exposes pointer coordinates/color; pointer-up confirms one point and frozen-source color. | HUD reports confirmed point/color. | Point branch |
| DM-TOOL-007 | **Region** with a current candidate: click locks that candidate as Target. | candidate becomes Target; semantic Target may derive Local Reference. | `lockCandidate()` |
| DM-TOOL-008 | **Region** valid drag creates a manual Target, regardless of candidate presence. | provider=`manual`, reliability=`user-confirmed`, no Local Reference. | `manualTarget()` |
| DM-TOOL-009 | Region click with no candidate does not invent a result. | status asks for manual drag. | Region branch |
| DM-TOOL-010 | Current prototype defines no post-lock resize/edit handles for a Region. | Region result is replaced/reset, not handle-edited. | absence in handlers/rendering |
| DM-TOOL-011 | **Point↔Point** accepts two pointer-up points; after second point it exposes straight distance, signed ΔX/ΔY and absolute H/V distance. A third point starts a new pair. | pair length cycles 1→2→1. | PP branch, `M.points()` |
| DM-TOOL-012 | **Region↔Region** accepts two valid dragged regions; a third valid drag starts a new pair. | pair length cycles 1→2→1. | RR branch |
| DM-TOOL-013 | Structured Region↔Region evidence contains H/V gaps, projection overlaps, overlap area, center delta and B-relative-to-A geometry. | `spacing` object contains those fields. | `M.rectangles()`, `structuredData()` |
| DM-TOOL-014 | Overlay shows first/second Region↔Region rectangles and a center-to-center distance line once both exist. | relation is visually present on overlay. | `renderOverlay()` |
| DM-TOOL-015 | Region↔Region HUD summary is currently internally conflicted; see `HTML-CONFLICT-001`. | do not freeze expected HUD content yet. | `targetBounds()`, `renderHUD()` |

## 11. Magnet, Snap, and Candidate Stack

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-MAGNET-001 | Persistent Magnet setting is reset ON by `begin()` for every new session. | `E.magnet=true`. | `begin()` |
| DM-MAGNET-002 | While Magnet is on, Alt is not held, pointer exists, no Target is locked and session is measuring, pointer movement schedules candidate resolution. | candidate can follow pointer. | `scheduleResolve()` |
| DM-MAGNET-003 | “Snap” is a visual Candidate highlight; it never warps/moves the system pointer. | highlight changes without pointer mutation. | rendering + absence of pointer warp |
| DM-MAGNET-004 | Alt/Option keydown temporarily clears candidate/stack and suspends candidate resolution without changing persistent `magnet`. | temporary pause. | keydown Alt |
| DM-MAGNET-005 | Alt/Option keyup resumes resolution if still active/measuring. | candidate may return. | keyup Alt |
| DM-MAGNET-006 | Explicit Magnet OFF clears candidate/stack and prevents snapping; manual Region drag remains available. | no candidate resolution while off. | magnet toggle + scheduler |
| DM-MAGNET-007 | No reliable candidate produces explicit status and manual-framing guidance rather than fabricated semantics. | status text reflects unavailable candidate. | `resolveNow()` |
| DM-MAGNET-008 | Candidate resolution is not gated by current tool mode. Candidate preview can therefore appear in Point, Region, Point↔Point and Region↔Region while no Target is locked; only Region click consumes the Candidate as a Target. | cross-tool preview may be visible; non-Region tools ignore it on pointer-up. | `scheduleResolve()`, `pointerUp()` |

Candidate Stack:

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-CANDIDATE-001 | Semantic stack is containing synthetic UI-tree nodes under pointer, ordered smaller/more specific → larger ancestors. | nested control can cycle outward to window. | `semanticAt()` |
| DM-CANDIDATE-002 | Visual provider may return one estimated pixel-region Candidate and may not invent semantic role. | role is null; reliability=`estimated-not-semantic`. | `visualAt()` |
| DM-CANDIDATE-003 | Candidate Stack is snapshot/pointer/provider state, not a persistent locator list. | source/reliability remain explicit. | state + structured evidence |
| DM-CANDIDATE-004 | Only one Candidate is highlighted at a time. | one preview rectangle. | `renderOverlay()` |
| DM-CANDIDATE-005 | Pointer movement >3 logical px resets layer index to the first/smallest candidate before new resolution. | layer reset. | `pointerMove()` |
| DM-CANDIDATE-006 | Tab/Shift+Tab wrap within the **existing** current stack; they do not create targets/sessions. | current candidate changes only. | `cycleCandidate()` |
| DM-CANDIDATE-007 | Semantic Target may derive one useful non-trivial parent as Local Reference; visual/manual Target never fabricates one. | zero or one Local Reference. | `chooseLocalReference()` |
| DM-CANDIDATE-008 | Once a Target is locked, pointer movement stops candidate resolution until Target is cleared/replaced by an allowed reset path. | no new Candidate follows pointer while Target exists. | `scheduleResolve()` guard |

## 12. Coordinates, pixels, and geometry

### 12.1 Pointer coordinate display

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-COORD-001 | Pointer micro HUD exposes Screen, Reference Window-relative, and Region-relative rows. | three labels visible after pointer exists. | `coordinateTriple()`, `renderMicro()` |
| DM-COORD-002 | Region-relative pointer coordinate exists only when pointer is inside the current locked Target or current highlighted Candidate; otherwise it displays `—`. | region row is conditional. | `currentRegionForPointer()` |
| DM-COORD-003 | Micro HUD also shows frozen-source pixel color. | hex readout. | `renderMicro()` |
| DM-COORD-004 | Screen coordinates are logical desktop coordinates and may be negative. | negative fixture changes origin. | `displayLayout()` |
| DM-COORD-005 | Capture image mapping is per display and may have non-integer or mixed scale. | display mapping carries logical bounds, pixel size and scaleX/scaleY. | `displayLayout()`, `logicalToPixel()` |
| DM-COORD-006 | `rawColor()` returns image pixel coordinate, display id, scale, color space, source provenance and no interpolation. | Inspector pointer evidence can expose it. | `rawColor()` |
| DM-COORD-007 | Absolute geometry is runtime evidence only and is separated from stable semantic relocation evidence. | structured evidence separates both. | `stableRelocationEvidence`, `runtimeEvidence` |
| DM-COORD-008 | Visual candidate provenance remains estimated visual evidence, never semantic control evidence. | role remains null. | `visualAt()`, `structuredData()` |
| DM-COORD-009 | Percentage-vs-normalized numeric convention is internally conflicted; see `HTML-CONFLICT-002`. | do not freeze 0–1 vs 0–100 convention yet. | `M.relative()`, `coordinateSpace.percentage` |
| DM-COORD-010 | The prototype does not expose a separate normalized-coordinate field distinct from its `percentage` geometry. | Production must not invent one and claim parity. | structured evidence shape |

### 12.2 Target-relative geometry actually exported

For `M.relative(target, reference)` the executable model emits:

- `absolute`: Target screen-logical rectangle;
- `relative`: Target x/y relative to reference origin plus unchanged width/height;
- `percentage`: x/y/width/height derived from reference dimensions (numeric convention blocked by `HTML-CONFLICT-002`);
- `signedEdges`;
- `centerOffset`;
- `alignmentDelta`;
- `aspectRatio`;
- `areaRatio`;
- `coverageRatio`;
- `insideRatio`.

`windowRelative` always uses the Reference Window when Target exists. `localRelative` exists only when a Local Reference exists.

### 12.3 Two-point geometry

`M.points(a,b)` emits:

- signed `dx`, `dy`;
- absolute `horizontalDistance`, `verticalDistance`;
- Euclidean `straightDistance`.

### 12.4 Two-region geometry

`M.rectangles(a,b)` emits:

- rectangles `a`, `b`;
- non-negative `horizontalGap`, `verticalGap`;
- `projectionOverlapX`, `projectionOverlapY`;
- `overlapArea`;
- signed `centerDelta` from A center to B center;
- `bRelativeToA`, using the same relative-geometry shape above.

Unused model helpers (`pointRelative()`, `placePanel()`) are not automatically product contracts merely because they exist in `model.js`; this Oracle only freezes model semantics actually consumed by the executable interaction/evidence flow.

## 13. Margin contract

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-MARGIN-001 | Margin is a relationship view for current Target/latest RR region, not a fifth tool mode. | margin toggle does not change tool mode. | `targetBounds()`, margin toggle |
| DM-MARGIN-002 | A semantic Target may expose at most two reference sets: Reference Window plus one Local Reference. | HUD has one or two rows. | `renderHUD()` |
| DM-MARGIN-003 | Overlay emphasizes one reference set at a time with exactly four edge lines. | Window/Local toggle keeps four lines. | `drawMarginLines()` |
| DM-MARGIN-004 | Margin toggle is disabled when no Local Reference exists. | disabled state visible. | `renderButtons()` |
| DM-MARGIN-005 | Locking/replacing a Target resets active margin reference to Window. | `marginView='window'`. | `lockCandidate()`, `manualTarget()` |
| DM-MARGIN-006 | Signed margins use: left=`target.left-reference.left`; top=`target.top-reference.top`; right=`reference.right-target.right`; bottom=`reference.bottom-target.bottom`. Negative values mean Target extends beyond that reference edge. | negative value receives warning treatment. | `M.relative().signedEdges`, `.negative` |
| DM-MARGIN-007 | Manual Target is not clipped to the Reference Window by the prototype; signed margins can therefore legitimately be negative. | geometry remains source-honest. | pointer/drag + no clipping |

## 14. HUD, status, annotations, and visual semantics

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-VIS-001 | Frozen snapshot is the visual base layer while measuring. | Measurement chrome overlays it. | snapshot/overlay stacking |
| DM-VIS-002 | Toolbar is a compact independent floating bar centered near bottom. | one grouped bar. | `.tools` |
| DM-VIS-003 | Selected measurement tool has unmistakable active state. | selected tool active. | `renderButtons()`, `.active` |
| DM-VIS-004 | Persistent Magnet ON/OFF is visible on Toolbar and HUD; temporary Alt suspension is separately visible as `（临时暂停）`. | states distinguishable. | `renderHUD()` |
| DM-VIS-005 | Candidate/drag preview and locked Target differ visually; locked stroke is stronger. | preview vs locked. | `.candidate`, `.candidate.locked` |
| DM-VIS-006 | Local Reference uses a separate dashed visual treatment. | distinct reference outline. | `.local-reference` |
| DM-VIS-007 | Margin and distance lines use distinct annotation classes from selection outlines. | relation types visually distinguishable. | `.margin-line`, `.distance-line` |
| DM-VIS-008 | One-point-pair first point uses a small handle; second point replaces that with a distance line. | progressive pair feedback. | `renderOverlay()` |
| DM-VIS-009 | Pointer micro HUD follows pointer and flips side near stage edges. | concise readout avoids obvious overflow. | `renderMicro()` |
| DM-VIS-010 | Corner HUD is top-right and is the normal result summary; Inspector is secondary/off by default. | main summary remains visible behind Inspector. | `.corner-hud`, `.inspector` |
| DM-VIS-011 | Outside Reference Window is weakly de-emphasized, not blacked out. | readable source remains visible. | `.mask` |
| DM-VIS-012 | Status is a small non-interactive hint near lower-left (moves above toolbar at narrower demo width). | current interaction guidance visible. | `.status`, media query |
| DM-VIS-013 | Transient toast appears top-center, does not intercept input and auto-hides after the prototype timeout. | informational only. | `notify()`, `.toast` |
| DM-VIS-014 | When no measurement result is active, HUD meta exposes current `snapshotId` and generation. | snapshot lifecycle visibly inspectable. | `renderHUD()` |
| DM-VIS-015 | HUD result priority is Target/latest RR region → Point → two-point relation → two-region relation → no-result snapshot meta. | conditional order is observable. | `renderHUD()` |
| DM-VIS-016 | Because RR `targetBounds()` is non-null once an RR region exists, current two-region HUD branch is conflicted/unreachable; see `HTML-CONFLICT-001`. | no frozen expected summary yet. | `targetBounds()`, `renderHUD()` |

## 15. Inspector, Snapshot evidence, and Export boundary

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-INSPECTOR-001 | Inspector is closed by default and opens only by explicit `详情` action or `I`. | no default side panel. | state + handlers |
| DM-INSPECTOR-002 | Inspector is a right-side scrollable detail panel over Measurement Surface; opening it does not mutate snapshot/Target. | state stable. | `.inspector`, handlers |
| DM-INSPECTOR-003 | Inspector renders current `structuredData()` as formatted JSON. | JSON refreshes when render occurs. | `renderInspector()` |
| DM-INSPECTOR-004 | Explicit close and first Escape while open close Inspector without exiting session. | second Escape may exit. | close/Escape handlers |
| DM-INSPECTOR-005 | Inspector remains open across tool switch and Update, but Adjust/Exit/new-session begin close it. | visibility follows state functions. | lifecycle functions |

Structured evidence includes, when applicable:

- schema/version + prototype flag + phase;
- snapshot token (`sessionId`, `generation`, `snapshotId`) when a current snapshot exists;
- coordinate-space declarations and display mapping;
- Target + Window/Local relative geometry;
- Window Reference + optional Local Reference;
- margins + currently emphasized relation;
- pointer coordinate triple + frozen-source pixel sample;
- confirmed Point;
- two-point result;
- two-region `spacing` result;
- current Candidate provenance;
- stable semantic relocation evidence;
- runtime-evidence flags.

### Snapshot boundary

The prototype uses “Snapshot” as the current frozen measurement source/token. It has **no user control to save, name, browse, or export a screenshot image**. `更新画面` replaces the current Frozen Snapshot; `调整界面 → 继续测量` invalidates then replaces it.

### Export boundary

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-EXPORT-001 | The only explicit export-like UI is `复制结构化数据` in Inspector. | current structured JSON is copied as text when browser clipboard is available. | `#copy-json` handler |
| DM-EXPORT-002 | Clipboard success shows a transient success toast. | evidence view remains open. | copy handler + `notify()` |
| DM-EXPORT-003 | Clipboard unavailable/failure shows a non-destructive unavailable toast and leaves JSON visible. | no evidence loss. | catch branch |
| DM-EXPORT-004 | No file export, PNG export, JSON-file save, filesystem chooser, or Snapshot-image export is defined by the HTML prototype. | Production must not infer those behaviors from the word “Export”. | absence from DOM/handlers |

## 16. Keyboard contract

| ID | Contract | Acceptance | HTML evidence |
|---|---|---|---|
| DM-KEY-001 | Tab is consumed while measuring and cycles forward within current Candidate Stack. | browser focus traversal prevented. | keydown Tab |
| DM-KEY-002 | Shift+Tab cycles backward within same stack. | prior candidate restored when stack permits. | keydown Tab + shift |
| DM-KEY-003 | Alt/Option keydown/keyup implements temporary Magnet suspension/resume without changing persistent `magnet`. | `alt` toggles separately. | key handlers |
| DM-KEY-004 | Escape closes Inspector first; otherwise it exits Measurement. | not an intermediate-result cancel action. | keydown Escape |
| DM-KEY-005 | `1`/`2`/`3`/`4` select/reset Point/Region/Point↔Point/Region↔Region. | active mode changes; result state clears. | mode map + `setMode()` |
| DM-KEY-006 | `I` toggles Inspector while measuring. | panel opens/closes. | keydown i |
| DM-KEY-007 | Measurement key handling is inactive while ADJUSTING and after Exit. | these handlers stop mutating measurement state. | early return |
| DM-KEY-008 | The displayed `⌘ / Ctrl + Shift + M` global shortcut is not implemented by this page’s keydown handler; it is represented by a simulated entry button. | OS-global capture remains outside this HTML implementation. | `#entry-key`, key handlers |

## 17. Error / invalid / unavailable states

| ID | State | Required visible behavior | HTML evidence |
|---|---|---|---|
| DM-ERROR-001 | no reliable Candidate | status says no reliable candidate and suggests manual framing | `resolveNow()` |
| DM-ERROR-002 | Region click without Candidate | no Target is invented; status asks user to drag | Region branch |
| DM-ERROR-003 | RR click/small drag | pair does not advance; status says positive-size drag is required | RR branch |
| DM-ERROR-004 | no Local Reference | margin toggle disabled; only Window margin relation is available | `renderButtons()` |
| DM-ERROR-005 | pointer outside mapped display/source | raw color may be unavailable and HUD shows `—` instead of fabricating a value | `rawColor()`, `renderMicro()` |
| DM-ERROR-006 | clipboard unavailable | structured JSON remains in Inspector; toast reports unavailability | copy catch branch |
| DM-ERROR-007 | stale async Candidate | result is ignored, never applied to current snapshot | `applyAsyncCandidate()` |

## 18. State persistence matrix

| State | Tool select/reselect | Update | Adjust → Continue | Re-entry while measuring | Exit → new session |
|---|---|---|---|---|---|
| selected tool | becomes selected tool | persists | persists | persists | **persists** |
| persistent Magnet | persists | persists | persists | persists | resets ON in `begin()` |
| temporary Alt | unchanged by tool/update | unchanged | key handling inactive during Adjust | unchanged | **conflicted edge case; see HTML-CONFLICT-004** |
| pointer | persists | persists | cleared entering Adjust; new snapshot starts with null | persists | cleared |
| Candidate/stack | cleared | cleared | cleared | preserved | cleared |
| Target / measurement result | cleared | cleared | cleared | preserved | cleared |
| Local Reference | cleared | cleared | cleared | preserved | cleared |
| active margin relation | effectively reset when new Target is locked; may remain latent without Local Reference | latent value not explicitly reset | latent value not explicitly reset | preserved | new session sets Window |
| Inspector | unchanged | persists open | closes entering Adjust | preserved | closes |
| snapshot token | same until lifecycle action | replaced | invalidated then replaced | same | destroyed then new session/new token |

The prototype does not define a separate persistent-history list of prior Measurements or Snapshots.

## 19. Bidirectional HTML ↔ Oracle traceability matrix

Status values intentionally use the audit vocabulary requested for this conversion.

| Prototype capability / behavior | Primary HTML evidence | Oracle section | Status after this revision |
|---|---|---|---|
| Measurement Session | `begin()`, `exitMeasurement()`, token | §5 | PASS |
| three entry sources + same-session re-entry | `#entry-*`, `begin()` | §5 | PASS |
| displayed global shortcut | `#entry-key` | §5, §16 | PASS |
| actual OS-global shortcut capture | no matching key handler | §5, §16 | NOT_SUPPORTED_BY_HTML |
| Toolbar labels/tooltips/states | `index.html#tools`, `renderButtons()`, CSS | §3 | PASS |
| icons | text-only buttons | §3 | NOT_SUPPORTED_BY_HTML |
| tool selection + same-tool reset | `setMode()` | §8 | PASS |
| user Reference selection/reselection | no control/handler | §6 | NOT_SUPPORTED_BY_HTML |
| Reference highlight + Window relation | `drawMask()`, coordinates/margins | §6, §13 | PASS |
| Freeze lifecycle | `begin()`, `captureSnapshot()` | §7 | PASS |
| standalone Unfreeze toggle | none; Adjust is live phase | §7 | NOT_SUPPORTED_BY_HTML |
| Update | `refreshSnapshot()` | §7 | PASS |
| Adjust / Continue | `adjustInterface()`, `continueMeasurement()` | §7 | PASS |
| Magnet/Snap | scheduler + toggle/Alt | §11 | PASS |
| Candidate resolution/provenance | `semanticAt()`, `visualAt()` | §11 | PASS |
| Candidate cycling | `cycleCandidate()`, Tab handlers | §11, §16 | PASS |
| Point | Point branch | §10 | PASS |
| Region candidate lock | `lockCandidate()` | §10 | PASS |
| Region manual drag | `manualTarget()`, Region branch | §9–§10 | PASS |
| post-lock Region resize/edit handles | absent | §10 | NOT_SUPPORTED_BY_HTML |
| Point↔Point | PP branch + `M.points()` | §10, §12 | PASS |
| Region↔Region structured relation | RR branch + `M.rectangles()` | §10, §12 | PASS |
| Region↔Region HUD summary | conditional order in `renderHUD()` | §10, §14 | HTML_INTERNAL_CONFLICT |
| pointer screen/window/region coordinates | `coordinateTriple()`, `renderMicro()` | §12 | PASS |
| Reference-relative geometry | `M.relative(target, win.rect)` | §12 | PASS |
| percentage / normalized convention | `M.relative()` vs structured coordinate metadata | §12 | HTML_INTERNAL_CONFLICT |
| separate normalized coordinates | absent | §12 | NOT_SUPPORTED_BY_HTML |
| geometry ratios/alignment/coverage | `M.relative()` | §12 | PASS |
| Window + Local margins | `signedMargins()`, `renderHUD()` | §13 | PASS |
| one active four-line margin overlay | `drawMarginLines()` | §13 | PASS |
| Inspector | DOM + `renderInspector()` | §15 | PASS |
| HUD/status/toast | DOM/CSS/render functions | §14 | PASS except conflicts listed in §20 |
| Frozen Snapshot token | capture/token/HUD | §7, §15 | PASS |
| save/export screenshot | absent | §15 | NOT_SUPPORTED_BY_HTML |
| structured data clipboard copy | `#copy-json` handler | §15 | PASS |
| file JSON export | absent | §15 | NOT_SUPPORTED_BY_HTML |
| keyboard shortcuts | key handlers + titles | §16 | PASS |
| pointer interactions | overlay pointer handlers | §9 | PASS |
| intermediate Escape cancel | Escape exits after Inspector-close | §9, §16 | NOT_SUPPORTED_BY_HTML |
| dedicated Clear/Reset control | absent; same-tool selection resets | §8 | NOT_SUPPORTED_BY_HTML |
| close/Exit state cleanup | `exitMeasurement()` + CSS/render | §5, §20 | HTML_INTERNAL_CONFLICT |
| invalid/unavailable feedback | status/toast/disabled states | §17 | PASS |
| state persistence within session | lifecycle functions | §18 | PASS except Alt conflict |
| active/hover/disabled/selected visual state | CSS + renderButtons/margin table | §3, §14 | PASS |
| responsive hiding of optional/harness controls | media queries | §3 / harness boundary | PASS (prototype presentation only) |

This table is also the minimal proof that important product semantics were not silently lost between executable prototype and Markdown.

## 20. HTML internal conflict register — freeze blockers

The following are **not** Oracle guesses. They are contradictions or product-significant inconsistencies inside the executable prototype. This document records them instead of silently choosing a preferred behavior.

### HTML-CONFLICT-001 — Region↔Region HUD relation branch is unreachable

Evidence:

1. `targetBounds()` returns the latest `regionPair` rectangle whenever RR has at least one region.
2. `renderHUD()` first executes `if (target) { ... region size + margins ... }`.
3. Its later `else if (E.regionPair.length === 2) { ... H gap / V gap / overlap / center Δ ... }` therefore cannot execute after two RR regions exist.
4. `structuredData().spacing` and overlay relation line **do** expose the two-region relation.

Consequence: HTML unambiguously computes the relation, but does not unambiguously define the intended normal-HUD presentation because an explicit RR-summary branch exists yet is shadowed by earlier logic.

Required before freeze: correct/clarify the executable prototype, then update DM-TOOL-015 / DM-VIS-016 accordingly.

### HTML-CONFLICT-002 — `percentage` numeric convention contradicts coordinate metadata

Evidence:

- `M.relative()` computes each `percentage` field as `100 * value / referenceDimension`, i.e. 0–100 percentage units in ordinary in-reference cases.
- `structuredData().coordinateSpace.percentage` declares `'ratio-0-1'`.

Consequence: Production cannot know whether the frozen contract is normalized ratio (0–1) or percentage units (0–100). The prototype also has no second explicit normalized field.

Required before freeze: choose one convention in the executable prototype and make value + metadata agree.

### HTML-CONFLICT-003 — Exit enters IDLE but leaves Toolbar/status visible and partly interactive

Evidence:

- `exitMeasurement()` sets `active=false`, removes snapshot/overlay, hides micro HUD/corner HUD/Inspector/live controls and shows the `idle` harness card through `render()`.
- It does **not** hide `#tools` or `#status`.
- CSS hides Toolbar/status only under `.adjusting`, not under IDLE/non-active state.
- some visible tool controls can still mutate prototype state while idle (`setMode()`, Magnet toggle), even though lifecycle actions such as Update/Adjust are no-ops.

Consequence: “Exit/Close” does not currently define a coherent final Measurement-chrome state. The previous Oracle statement that all Measurement chrome disappears was therefore incorrect.

Required before freeze: make the executable IDLE visibility/interaction behavior explicit and internally coherent.

### HTML-CONFLICT-004 — temporary Alt suspension can leak across Exit → new session

Evidence:

- Alt keydown sets `E.alt=true`.
- `exitMeasurement()` does not reset `E.alt`.
- Alt keyup resets it only when `E.active && !E.adjusting`; a keyup after Exit is ignored.
- `begin()` resets `magnet=true` but does not reset `alt`.

Consequence: if the user exits while Alt is held and releases it after Exit, a later new session can start with persistent Magnet ON but the stale temporary `alt` flag still true, suppressing candidate resolution and showing `开（临时暂停）`.

Required before freeze: define/reset transient-modifier state coherently in the executable prototype.

## 21. Corrections made by this audit

The previous `ORACLE.md` was directionally strong but incomplete for Production Gap use. This revision corrects these conversion defects:

- **INCORRECT_IN_ORACLE**: removed tests/README from primary-authority status; only executable HTML/CSS/JS remains authoritative.
- **INCOMPLETE_IN_ORACLE**: added full toolbar label/tooltip/selected/disabled/hover/focus inventory and explicit “no icons” boundary.
- **AMBIGUOUS_IN_ORACLE**: clarified that Reference Window exists but user Reference selection/reselection is not defined by HTML.
- **INCOMPLETE_IN_ORACLE**: distinguished Snapshot lifecycle from screenshot-save/export behavior.
- **INCOMPLETE_IN_ORACLE**: distinguished structured clipboard copy from file/JSON/PNG export.
- **INCOMPLETE_IN_ORACLE**: added detailed pointer semantics, minimum drag threshold, Region drag-over-candidate precedence and lack of intermediate Escape cancellation.
- **INCOMPLETE_IN_ORACLE**: documented same-tool reselection as the only direct lightweight clear/reset behavior and recorded absence of a dedicated reset control.
- **INCOMPLETE_IN_ORACLE**: documented cross-tool Candidate preview behavior and Target-lock suppression of subsequent resolution.
- **INCOMPLETE_IN_ORACLE**: expanded geometry to the actual relative/alignment/ratio/coverage and two-region fields emitted by `model.js`.
- **INCOMPLETE_IN_ORACLE**: made margin sign convention, negative visual feedback and no-clipping behavior explicit.
- **INCOMPLETE_IN_ORACLE**: added state persistence across tool change, Update, Adjust/Continue, re-entry and Exit/new-session.
- **INCORRECT_IN_ORACLE / HTML_INTERNAL_CONFLICT**: replaced the prior unconditional claim that RR HUD exposes relation metrics with the actual conflict in `renderHUD()`.
- **HTML_INTERNAL_CONFLICT**: surfaced percentage 0–100 computation vs `'ratio-0-1'` metadata contradiction.
- **INCORRECT_IN_ORACLE / HTML_INTERNAL_CONFLICT**: removed the prior claim that Exit makes all Measurement chrome disappear; current HTML leaves Toolbar/status visible.
- **HTML_INTERNAL_CONFLICT**: surfaced stale Alt transient state across Exit/new-session edge case.
- **INCOMPLETE_IN_ORACLE**: added a single bidirectional Traceability Matrix covering the requested product areas.

## 22. Acceptance scenarios after conflict resolution

These scenarios are the minimum future frozen-Oracle parity suite. Items marked BLOCKED depend on §20.

1. **Initial Freeze**: Region active, Magnet ON, one session, valid snapshot, weak outside mask, Reference outline, Toolbar/HUD visible.
2. **Entry reuse**: developer/Recorder/global-shortcut sources address one active session; re-entry returns same token and shows same-session toast.
3. **Point**: move pointer → three coordinate rows + source pixel; pointer-up → confirmed point/color.
4. **Region candidate**: click highlighted Candidate → locked Target; semantic Target may derive one Local Reference.
5. **Region manual**: valid drag → manual Target even if Candidate was visible; no fabricated Local Reference.
6. **Candidate cycle**: only one highlighted candidate; Tab/Shift+Tab wraps current stack; Alt temporary suspension; persistent Magnet toggle independent.
7. **Point↔Point**: two points → signed ΔX/ΔY + H/V + straight distance; third point starts new pair.
8. **Region↔Region**: two drags → structured gap/overlap/center/B-relative evidence + overlay relation; **HUD summary BLOCKED by HTML-CONFLICT-001**.
9. **Margins**: Window + optional one Local Reference; margin toggle disabled without Local Reference; overlay shows exactly one four-line relation.
10. **Inspector**: default closed; Details/I opens; close/Escape closes without mutating Target/Snapshot; Update preserves open state; Adjust closes.
11. **Structured copy**: success/unavailable toast is non-destructive; no file export is assumed.
12. **Update**: same session, newer generation/snapshot, snapshot-bound result/candidate state cleared, mode/Magnet/Inspector-open/pointer preserved.
13. **Adjust**: snapshot invalid immediately; Measurement chrome hidden; Continue refreezes same session and clears old result state.
14. **Exit**: snapshot-bound data cleared and next entry creates a new session; **final Toolbar/status visibility BLOCKED by HTML-CONFLICT-003**.
15. **Percentage/normalized evidence**: **BLOCKED by HTML-CONFLICT-002**.
16. **Alt transient lifecycle**: **BLOCKED by HTML-CONFLICT-004**.

## 23. Explicit non-contracts / boundaries

- No user-facing Reference selection/reselection behavior is defined.
- No standalone Freeze/Unfreeze toggle is defined.
- No Region resize/edit handles are defined after lock.
- No dedicated Clear/Reset button or shortcut is defined.
- Escape is not an intermediate-result cancel command.
- No saved Snapshot gallery/history is defined.
- No screenshot/PNG export is defined.
- No JSON file export or filesystem save flow is defined; only clipboard copy of structured JSON exists.
- No separate normalized-coordinate field is defined.
- No production icons are defined; prototype Toolbar is text-based.
- The synthetic WeChat scene/UI tree, pixel-region-growing implementation, browser clipboard, display fixtures and responsive browser demo chrome are test substitutes.
- Candidate Stack is not equivalent to `CaptureFrame.Targets` or a persistent locator list.
- Visual Candidate is not semantic control evidence.
- Native correctness still owns real capture exclusion, input routing, monitor/DPI conversion, accessibility/OCR/Vision calls, resource/thread lifetime, Dock/Taskbar behavior and platform-specific surface mechanics.

## 24. Change discipline and freeze rule

1. Requirement IDs already present remain stable; wording may improve without renumbering.
2. New IDs are added only for stable product-visible requirements or explicit boundaries.
3. Every important Oracle claim must identify executable HTML/CSS/JS evidence.
4. Tests and Production may validate the Oracle but cannot override it.
5. If executable prototype and Markdown differ, correct Markdown unless the prototype itself is internally contradictory.
6. When the prototype is internally contradictory, record an `HTML_INTERNAL_CONFLICT`; do not silently choose a preferred Production behavior.
7. Production Gap Closure may start only after all freeze-blocking conflicts in §20 are resolved and this header changes to:

```text
ORACLE STATUS: FROZEN
```

Until then:

```text
ORACLE STATUS: NOT YET FROZEN
Production Gap Closure: BLOCKED on the four HTML internal conflicts in §20
```
