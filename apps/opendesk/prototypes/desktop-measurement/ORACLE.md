# Desktop Measurement Product Oracle

> Stable, low-token product contract extracted from the approved HTML/CSS/JavaScript prototype in this directory.
>
> **Authority:** when this document conflicts with `index.html`, `prototype.css`, `model.js`, or `interaction-core.js`, the executable HTML Oracle wins. Production code must not be used to reinterpret this document.

## 0. Scope and authority

This document describes product-visible UI hierarchy, state, interaction, visual relations, evidence semantics, and acceptance criteria. It does **not** prescribe native capture APIs, thread models, AX/UIA calls, DPI implementation, or Runtime internals.

Primary trace sources:

- `index.html`: product-visible hierarchy, controls, labels, shortcuts.
- `prototype.css`: visual hierarchy and show/hide rules.
- `interaction-core.js`: state machine, tool behavior, candidate/magnet semantics, snapshot lifecycle, evidence shape.
- `model.js`: geometry semantics used by the prototype.
- `tests/desktop-measurement/browser.test.py`: executable Oracle acceptance scenarios.

## 1. Product mental model

```text
real desktop
  -> one Measurement Session
  -> lock Reference Window / capture frozen source
  -> Frozen Snapshot
  -> Measurement Surface
       + pointer coordinates/pixel
       + Candidate Stack / Magnet preview
       + Target / Local Reference
       + measurement tools
       + HUD / annotations
       + optional Inspector
  -> Update: same session, replace snapshot
  -> Adjust: temporarily remove Measurement UI, operate real desktop
  -> Continue: same session, capture a new snapshot
  -> Exit: destroy current measurement state/resources
```

Terms:

- **Real desktop**: the live underlying application state. It is not paused by Measurement.
- **Frozen Snapshot**: one immutable capture generation used as the visible/measurable source until Update/Adjust/Continue replaces it.
- **Reference Window**: the selected target window used as the primary coordinate and margin reference.
- **Candidate**: one current snap-able region/control hypothesis under the pointer.
- **Candidate Stack**: the ordered candidates under the pointer for the current snapshot/provider; only one is highlighted at a time.
- **Target**: the user-confirmed region/control used for measurement. It may come from a semantic candidate or manual drag.
- **Local Reference**: at most one useful parent/layout region associated with a semantic Target; it is optional and never fabricated for manual/visual Targets.
- **Selection**: transient pointer/drag/candidate preview before or while confirming a result.
- **Measurement**: confirmed point, target region, two-point relation, or two-region relation plus derived evidence.
- **Inspector**: optional detailed structured evidence view; it is not the default measurement UI.

## 2. UI hierarchy

```text
Measurement Surface
├─ Frozen Snapshot layer
├─ Measurement overlay
│  ├─ outside-window mask
│  ├─ Reference Window outline
│  ├─ Candidate preview
│  ├─ locked Target
│  ├─ optional Local Reference
│  ├─ one active set of margin lines
│  └─ distance/drag annotations
├─ pointer micro HUD
├─ corner HUD
├─ status / transient toast
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

`ADJUSTING` is deliberately different: Frozen Snapshot, overlay, micro HUD, corner HUD, Toolbar, status and Inspector are hidden; the real desktop is interactive and a minimal Continue control is available.

## 3. State machine

The executable Oracle uses these externally meaningful phases:

```text
IDLE
  -> PREPARING
  -> FREEZING
  -> MEASURING
       -> FREEZING -> MEASURING          (Update)
       -> ADJUSTING -> FREEZING -> MEASURING (Adjust + Continue)
       -> IDLE                            (Exit)
```

`PREPARING` and `FREEZING` may be short-lived. There is no separate persistent `UPDATING` or `CLOSING` product state in the Oracle.

### Lifecycle requirements

| ID | Contract | Acceptance | Source |
|---|---|---|---|
| DM-LIFECYCLE-001 | Developer menu, Recorder button, and global shortcut all address the same active Measurement Session. Re-entry while measuring must not create a second session. | Repeated entry keeps the same session/snapshot token. | `index.html#entry-*`, `begin()` |
| DM-LIFECYCLE-002 | A new session passes through preparing/freezing and becomes `MEASURING` with a valid frozen snapshot. | Surface is measurable only after a snapshot exists. | `begin()`, `captureSnapshot()` |
| DM-LIFECYCLE-003 | Session identity, generation and snapshot identity are distinct. A snapshot replacement advances generation/snapshot without changing the session. | Token exposes all three concepts. | `token()` |
| DM-LIFECYCLE-004 | Re-entry while `ADJUSTING` means Continue/refreeze of the same session, not a second session. | Same session id; new snapshot. | `begin()`, `continueMeasurement()` |
| DM-LIFECYCLE-005 | Exit clears current snapshot, overlays, candidate/target state, drag state, Inspector and temporary caches. | Surface disappears and a later entry creates a new session. | `exitMeasurement()` |
| DM-LIFECYCLE-006 | Async candidate results are snapshot-scoped. Stale token/epoch results must never mutate the current snapshot. | Old async candidate is rejected after Update/Adjust/Continue. | `sameToken()`, `invalidateAsync()`, `applyAsyncCandidate()` |

## 4. Surface and freeze contract

| ID | Contract | Acceptance | Source |
|---|---|---|---|
| DM-FREEZE-001 | Measurement operates on a frozen visual source; the underlying application is not logically paused. | Visible measurement pixels stay tied to one snapshot generation. | `captureSnapshot()`, README |
| DM-FREEZE-002 | Color sampling comes from the frozen source pixels, never from Measurement mask/HUD/overlay compositing. | Point/pointer color identifies frozen-source provenance. | `rawColor()` |
| DM-SURFACE-001 | The Reference Window is visually distinguished from the rest of the frozen desktop using an outside-window weak mask plus a window outline. | Both mask and outline are visible while measuring. | `drawMask()`, `.mask`, `.window-outline` |
| DM-SURFACE-002 | The Measurement overlay is the interaction plane in `MEASURING`; the underlying desktop is not pointer-interactive through it. | Pointer/drag events go to overlay. | `#overlay`, `.measuring .desktop-layer` |
| DM-SURFACE-003 | Default product UI includes a floating bottom Toolbar, pointer micro HUD, corner HUD, and status hint. | All are visible in normal measuring state subject to pointer/result availability. | `index.html`, `prototype.css` |
| DM-SURFACE-004 | Transient toast is informational and must not intercept pointer input. | `pointer-events:none`. | `.toast` |

## 5. Tool contract

The prototype starts in **Region** on first load. Lifecycle actions do not themselves reset an explicitly selected tool.

| ID | Tool / contract | Acceptance | Source |
|---|---|---|---|
| DM-TOOL-001 | Tool switching supports exactly Point, Region, Point↔Point, Region↔Region in the Oracle. Switching tool clears prior tool result/Target/drag/candidate state. | One active tool button; stale result does not leak into new tool. | `setMode()` |
| DM-TOOL-002 | Region is the prototype's initial mode on first load. Update, Adjust/Continue, and Exit/re-entry do not themselves force-reset a user-selected tool; the selected mode remains until explicitly changed. | First load starts in Region; after selecting another tool, lifecycle actions do not implicitly reset it to Region. | initial `E.mode='region'`, `setMode()`, absence of mode reset in `begin()`, `refreshSnapshot()`, `adjustInterface()` / `continueMeasurement()`, `exitMeasurement()` |
| DM-TOOL-003 | **Point** continuously exposes pointer coordinates/color; click confirms one point and frozen-source color. | HUD reports point and color after click. | `pointerUp()` point branch |
| DM-TOOL-004 | **Region** with Magnet candidate: click locks the current candidate as Target. | Target becomes locked candidate; local reference may be derived. | `lockCandidate()` |
| DM-TOOL-005 | **Region** without a usable candidate: dragging a positive area of at least 5×5 creates a user-confirmed manual Target. | Manual Target has no fabricated semantic/local-reference evidence. | `manualTarget()`, region branch |
| DM-TOOL-006 | A Region click with no candidate does not invent a result; UI instructs the user to drag. | No Target created. | region branch in `pointerUp()` |
| DM-TOOL-007 | The current Oracle does not define post-lock resize/edit handles for a Region. Production must not claim this as Oracle parity unless the HTML Oracle changes. | Region contract ends at candidate lock/manual drag result. | absence in `interaction-core.js` |
| DM-TOOL-008 | **Point↔Point** accepts two clicks; after the second point it reports straight distance, signed ΔX/ΔY, and absolute H/V distance. A third click starts a new pair. | Two-point evidence is non-null only for a pair. | `M.points()`, pp branch |
| DM-TOOL-009 | **Region↔Region** accepts two dragged positive-size regions; a click without a valid drag is rejected. A third valid drag starts a new pair. | Two-region relation exists only after two regions. | rr branch |
| DM-TOOL-010 | Region↔Region reports horizontal gap, vertical gap, overlap, and center delta. | HUD/evidence exposes these relation values. | `M.rectangles()`, `renderHUD()` |
| DM-TOOL-011 | Margin display is a relationship view for the current Target, not a fifth measurement mode. | Margin toggle changes reference without replacing tool mode/Target. | `margin-toggle`, `drawMarginLines()` |
| DM-TOOL-012 | A Target may expose at most two margin reference sets: entire Reference Window plus one Local Reference. | HUD shows one or two rows only. | `renderHUD()` |
| DM-TOOL-013 | Overlay emphasizes only one margin reference at a time, using four edge lines. | Exactly one four-line set is emphasized; toggle switches window/local. | `drawMarginLines()`, `marginView` |

## 6. Magnet contract

| ID | Contract | Acceptance | Source |
|---|---|---|---|
| DM-MAGNET-001 | Magnet is ON by default for every new session. | Toolbar Magnet is active at entry. | initial/begin state |
| DM-MAGNET-002 | While Magnet is on and no Target is locked, pointer movement schedules candidate resolution for the current snapshot. | Candidate can follow pointer. | `scheduleResolve()` |
| DM-MAGNET-003 | Candidate preview is visual only until user locks/clicks it; snapping must not move the system pointer. | Highlight changes, pointer position does not. | candidate rendering/absence of pointer warp |
| DM-MAGNET-004 | Alt/Option temporarily suspends Magnet: current candidate/stack are cleared and pending resolution invalidated. | While key is held there is no candidate snap preview. | keydown Alt |
| DM-MAGNET-005 | Releasing Alt/Option resumes candidate resolution if Magnet is still enabled. | Candidate can reappear without toggling Magnet. | keyup Alt |
| DM-MAGNET-006 | Explicit Magnet OFF clears candidate/stack and prevents snapping; manual Region drag remains available. | No candidate resolution while off. | magnet toggle, `scheduleResolve()` |
| DM-MAGNET-007 | When no reliable candidate is available, the product says so and offers manual framing rather than fabricating semantics. | Status indicates no reliable candidate. | `resolveNow()` |

## 7. Candidate Stack contract

| ID | Contract | Acceptance | Source |
|---|---|---|---|
| DM-CANDIDATE-001 | Semantic provider Candidate Stack is the ordered set of containing UI-tree nodes under the pointer, from smaller/more specific to larger ancestors. | A pointer over input can cycle input → parent regions → window. | `semanticAt()` |
| DM-CANDIDATE-002 | Visual provider may return an estimated pixel-region candidate, but must label it as visual/estimated and must not invent semantic roles. | visual `role=null`, reliability `estimated-not-semantic`. | `visualAt()` |
| DM-CANDIDATE-003 | Candidate Stack is snapshot/pointer/provider state, not a synonym for capture-frame targets or persistent locators. | Evidence retains provider/reliability and current snapshot scope. | `E.stack`, structured evidence |
| DM-CANDIDATE-004 | Only one candidate is highlighted at a time. | Overlay has one candidate preview rather than all ancestors. | `renderOverlay()` |
| DM-CANDIDATE-005 | Pointer movement greater than 3 logical px resets candidate index to the first/smallest candidate before rebuilding/resolving. | New pointer area starts at layer 0. | `pointerMove()` |
| DM-CANDIDATE-006 | Tab/Shift+Tab cycle only the existing current Candidate Stack; they do not create a second Target or new session. | Candidate index wraps within stack. | `cycleCandidate()` |
| DM-CANDIDATE-007 | Locking a semantic candidate may derive one useful non-trivial parent as Local Reference; visual/manual Targets do not fabricate one. | Local Reference is optional and source-honest. | `chooseLocalReference()` |

## 8. Keyboard contract

| ID | Contract | Acceptance | Source |
|---|---|---|---|
| DM-KEY-001 | Tab cycles forward through the current Candidate Stack and is consumed by Measurement while measuring. | Candidate changes and browser/focus traversal is prevented. | keydown Tab |
| DM-KEY-002 | Shift+Tab cycles backward through the same stack. | Previous candidate restored when applicable. | keydown Tab + `shiftKey` |
| DM-KEY-003 | Alt/Option keydown/keyup implements temporary Magnet suspension/resume; it does not permanently change Magnet setting. | `magnet` stays unchanged while `alt` toggles. | key handlers |
| DM-KEY-004 | Escape closes Inspector first when Inspector is open; otherwise it exits Measurement. | First Esc closes panel, next Esc exits. | keydown Escape |
| DM-KEY-005 | `1`/`2`/`3`/`4` select Point/Region/Point↔Point/Region↔Region. | Active mode changes accordingly. | keydown mode map |
| DM-KEY-006 | `I` toggles Inspector during measuring. | Inspector visibility toggles without snapshot/Target mutation. | keydown `i` |
| DM-KEY-007 | Measurement keyboard handling is inactive while `ADJUSTING` and after Exit, so underlying desktop input is not consumed by this Oracle state. | Tab/etc. no longer mutate Measurement state. | keydown early return |

## 9. Update contract

| ID | Contract | Acceptance | Source |
|---|---|---|---|
| DM-UPDATE-001 | Update keeps the same Measurement Session. | session id unchanged. | `refreshSnapshot()` |
| DM-UPDATE-002 | Update advances generation and creates a new snapshot id. | both values differ from prior snapshot. | `refreshSnapshot()`, `captureSnapshot()` |
| DM-UPDATE-003 | Update invalidates pending async candidate work and clears snapshot-bound Target, Local Reference, tool results, candidate stack, drag state and pixel cache. | old result/candidate does not survive into new snapshot. | `invalidateAsync()`, `captureSnapshot()` |
| DM-UPDATE-004 | Update returns to `MEASURING` on the newly frozen source; it is not a new session. | Surface remains the same product session. | `refreshSnapshot()` |

## 10. Adjust contract

| ID | Contract | Acceptance | Source |
|---|---|---|---|
| DM-ADJUST-001 | Adjust exists so the user can temporarily operate the real desktop/application before continuing measurement. | Underlying desktop becomes interactive. | `adjustInterface()`, `live-controls` |
| DM-ADJUST-002 | Entering Adjust immediately invalidates the visible snapshot identity and enters `ADJUSTING`; old frozen pixels are not current evidence. | `snapshotId=null`; structured snapshot is null. | `adjustInterface()` |
| DM-ADJUST-003 | During Adjust, Frozen Snapshot, overlay, micro HUD, corner HUD, Toolbar, status and Inspector are hidden. | Measurement chrome is absent. | `.adjusting ... {display:none}` |
| DM-ADJUST-004 | Entering Adjust clears snapshot-bound Target, Local Reference, point/pair results and Candidate Stack; Inspector closes. | No old selection/evidence remains active. | `adjustInterface()` |
| DM-ADJUST-005 | Continue keeps the same session, advances generation and captures a new Frozen Snapshot before returning to `MEASURING`. | same session id, new snapshot id. | `continueMeasurement()` |

## 11. Inspector contract

| ID | Contract | Acceptance | Source |
|---|---|---|---|
| DM-INSPECTOR-001 | Inspector is closed by default and appears only on explicit user action (`详情` or `I`). | No default side panel. | index + `renderInspector()` |
| DM-INSPECTOR-002 | Inspector is a right-side detailed panel over the Measurement Surface; opening it does not replace/change Target or Snapshot. | Snapshot token/Target remain stable. | `.inspector`, details handler |
| DM-INSPECTOR-003 | Inspector exposes structured Measurement Evidence including phase/snapshot token, coordinate spaces/display mapping, Target/reference geometry, margins, pointer/pixel, point/distance/spacing, candidate provenance, stable relocation evidence and runtime evidence. | JSON evidence contains these sections when applicable. | `structuredData()` |
| DM-INSPECTOR-004 | Inspector supports explicit close, Escape-first close, and structured-data copy; clipboard failure must not destroy the evidence view. | close/copy behavior is non-destructive. | details close, Escape, copy handler |

## 12. Coordinate and evidence contract

| ID | Contract | Acceptance | Source |
|---|---|---|---|
| DM-COORD-001 | Pointer micro HUD exposes three user coordinate levels: Screen, Reference Window-relative, and current reliable Region-relative. | all three labels exist; Region shows `—` when unavailable. | `coordinateTriple()`, `renderMicro()` |
| DM-COORD-002 | Pointer micro HUD also exposes the frozen-source pixel color. | hex color shown beside coordinates. | `renderMicro()` |
| DM-COORD-003 | Detailed evidence may additionally expose capture-image pixel mapping and percentage geometry; these are detail/export concepts, not extra default HUD coordinate rows. | Inspector evidence contains mapping/percentage data. | `structuredData()`, `model.js` |
| DM-COORD-004 | Screen coordinates are logical desktop coordinates and may be negative; display scale may be non-integer or mixed across displays. | negative/mixed fixtures preserve logical geometry and per-display pixel scale. | `displayLayout()`, `logicalToPixel()` |
| DM-COORD-005 | Absolute geometry is runtime evidence only and must not automatically become stable relocation/locator evidence. | export explicitly separates stable relocation evidence from runtime geometry. | `stableRelocationEvidence`, `runtimeEvidence` |
| DM-COORD-006 | Semantic and visual provenance must remain honest: semantic candidate evidence may carry role/id/label; visual region-growing evidence is estimated visual evidence only. | visual candidate never masquerades as semantic control. | `visualAt()`, `structuredData()` |

## 13. Visual contract

These requirements are relational, not pixel-perfect browser-copy requirements.

| ID | Contract | Acceptance | Source |
|---|---|---|---|
| DM-VIS-001 | Frozen desktop/snapshot is the full visual base layer of the Measurement Surface. | Measurement chrome floats over it rather than replacing it with a form/window. | `.stage`, snapshot/overlay layers |
| DM-VIS-002 | Toolbar is a compact independent floating bar centered near the bottom of the Surface. | Main tools and lifecycle actions are grouped in one floating bar. | `.tools` |
| DM-VIS-003 | Current measurement tool has an unmistakable active state. | exactly the selected mode is visually active. | `renderButtons()`, `button.active` |
| DM-VIS-004 | Magnet ON/OFF is visible on the Toolbar and also summarized in the HUD; temporary Alt suspension is distinguishable from Magnet OFF. | HUD can show `开（临时暂停）`. | `renderHUD()` |
| DM-VIS-005 | Candidate preview and locked Target are visually distinguishable; locked Target is emphasized more strongly. | preview vs locked stroke treatment differs. | `.candidate`, `.candidate.locked` |
| DM-VIS-006 | Local Reference, when present, uses a separate visual treatment from Candidate/Target. | dashed/secondary reference outline. | `.local-reference` |
| DM-VIS-007 | Distance relations and margin relations use distinct annotation styles from selection outlines. | distance/margin lines are visually differentiable. | `.distance-line`, `.margin-line` |
| DM-VIS-008 | Pointer micro HUD follows the pointer while avoiding obvious edge overflow; it contains only concise coordinates/color. | small floating readout stays near pointer. | `renderMicro()`, `.micro` |
| DM-VIS-009 | Corner HUD presents the current result as the main information block and at most two margin-reference rows. | result size/value dominates; margins are compact. | `.corner-hud`, `renderHUD()` |
| DM-VIS-010 | Inspector is visually secondary and off by default; when shown it is a right-side scrollable detail panel, not a replacement for HUD. | measuring remains visible behind it. | `.inspector` |
| DM-VIS-011 | Outside-window area is de-emphasized while the Reference Window remains readable and outlined. | weak mask + window outline, not full blackout. | `.mask`, `.window-outline` |
| DM-VIS-012 | Adjust mode removes Measurement chrome rather than leaving an opaque full-screen measurement layer over the real desktop. | only minimal continuation UI remains. | `.adjusting` CSS |

## 14. Product acceptance scenarios

The following scenarios are the minimum parity suite; individual checks should cite Requirement IDs above.

1. **Initial Freeze**: on first prototype load Region is active; entry from any of the three entry points addresses one session; Magnet is on; snapshot, mask/window outline, Toolbar and HUD are visible. After an explicit tool change, Update/Adjust/Exit re-entry must not implicitly reset the selected mode.
2. **Point**: choose Point; move pointer; verify three coordinate levels + frozen-source pixel color; click and retain point result.
3. **Region**: with candidate, click to lock; without candidate/Magnet, drag to create manual Target; no invented semantic Local Reference.
4. **Candidate**: hover a nested semantic control; only one candidate is highlighted; Tab/Shift+Tab cycle the same stack.
5. **Magnet**: ON resolves candidates; Alt suspends temporarily; release resumes; OFF disables snapping while manual drag remains usable.
6. **Point↔Point**: two clicks produce distance/Δ/H/V evidence.
7. **Region↔Region**: two drags produce H/V gaps, overlap and center delta.
8. **Margins**: semantic Target may show Window + one Local Reference; overlay emphasizes only one four-line relation at a time.
9. **Inspector**: default closed; explicit open displays structured evidence; close/Escape/copy do not mutate Target/Snapshot.
10. **Update**: same session, new generation/snapshot; old candidate/result state cleared; stale async candidate rejected.
11. **Adjust**: snapshot identity invalidated, Measurement chrome hidden, real desktop interactive; Continue refreezes into same session with new snapshot.
12. **Exit**: all Measurement chrome/current state/resources disappear; Measurement keys stop consuming input; next entry creates a new session.

## 15. Explicit non-contracts / boundaries

- The prototype's synthetic WeChat scene, synthetic UI tree, pixel-region-growing implementation, canvas pixels, browser clipboard, and display fixtures are test substitutes, not native implementations.
- Production does not need browser-identical pixels. It **does** need the same hierarchy, visibility/state relations, active/preview/locked distinctions, and tool/lifecycle behavior.
- The Oracle does not define a second Measurement Runtime, Locator Runtime, Evidence Runtime, or Session model.
- The Oracle does not equate Candidate Stack with `CaptureFrame.Targets`.
- The Oracle does not require visual candidates to become semantic controls.
- The Oracle does not define post-selection Region resize/edit behavior at the time this contract was extracted.
- Native correctness still owns capture exclusion, input routing, monitor/DPI conversion, accessibility calls, resource/thread lifetime, Dock/Taskbar behavior, and platform-specific surface mechanics.

## 16. Change discipline

1. Requirement IDs are stable. Wording may improve without renumbering existing IDs.
2. Add a new ID only for a genuinely new stable product requirement.
3. If a requirement is disputed, inspect only its listed source area first.
4. If executable HTML and this Markdown differ, correct this Markdown; do not change HTML to fit Production.
5. Automated Production/qualification tests should cite the relevant `DM-*` IDs so failures map back to product behavior rather than implementation structure.
