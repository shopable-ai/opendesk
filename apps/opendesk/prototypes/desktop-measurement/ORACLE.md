# Desktop Measurement UI / Interaction Oracle

**ORACLE STATUS: FROZEN — Controlled Amendment `DM-AMEND-2026-09-17-01`.**

Frozen applies to the executable **synthetic** interaction contract, not to Native completion. Production gaps remain open. Read this file before implementation or qualification.

## 1. Authority and preserved history

This amendment implements the user's explicit correction: select a Reference Window on a Live desktop **before** creating a Frozen Snapshot; restore hover measurement; bound visual work; collect multiple explicit measurements in one session.

The former complete Oracle is preserved byte-for-byte as `ORACLE.baseline-2026-09-16.md`, Git blob `9ea08d96dc00ae40f1eb596b4221626964686245`, read at master `8d4e6a9231ba95c9483b692785305e7e331ec540`. It is an **inherited baseline**, not a competing current Oracle. Its unchanged numbered contracts remain normative. This amendment replaces only the rows and unnumbered boundaries listed below. In particular the old “no user Reference selection”, “only current-result clipboard export”, “no history” and “initial Freeze” statements are superseded, including their repetitions in baseline §§15,18–24 and its traceability/acceptance tables. Do not silently delete or rewrite the archived record.

Authority: explicit user amendment → executable Prototype → this Oracle plus inherited unchanged contracts → Architecture → Production → tests/qualification. A native implementation must not redefine the Oracle to match its limitations.

Sources: `index.html`, `prototype.css`, unchanged `model.js`, `interaction-core.js`, `visual-resolver.js`, `records.js`. `template.html` stays redirect-only. The new modules are prototype helpers, not a second Runtime, Recorder, Geometry or Locator implementation.

## 2. Engineering decision

| Option | Determinism / evidence | Cost and UX | Decision |
|---|---|---|---|
| A: Live Reference selection → Freeze → Measurement | One immutable pixel/geometry source for color, regions, margins and authoring | One capture per confirmation/update; no premature frozen desktop | **Implemented** |
| B: fully Live measurement | Scrolling, animation, moving windows and colors can disagree across results; every confirmed record still needs an atomic capture | Repeated capture/segmentation, stale async and coordinate races | Not this amendment |
| C: Live Preview + confirmation Freeze | Preview can be useful, but must never masquerade as evidence | Extra preview/capture consistency machinery | Only its minimal window-preview aspect is included in A; no live pixel segmentation |

A does not pause the target application: it freezes the Measurement source. A suggested foreground window is not a confirmed reference.

## 3. Amended inherited Contract IDs

| IDs | Previous behavior | New binding behavior |
|---|---|---|
| DM-LIFECYCLE-002; DM-REFERENCE-001/003/004; DM-FREEZE-003 | Entry captures immediately; no explicit window selection | Entry reaches `REFERENCE_SELECTING`, with no snapshot or source pixel evidence. Pointer previews a window; a valid same-window click locks identity and creates the first snapshot. Update/Continue revalidate the **same** identity; reselection is explicit. |
| DM-LIFECYCLE-005/006 | Cleanup/current-snapshot invalidation only | Temporary current state is cleaned up; already exported files are not deleted. Historical records keep their original tokens. Async candidates additionally match request epoch, pointer revision and provider configuration. |
| DM-CANDIDATE-002/005 | Visual single region; >3px movement resets candidate layer | Bounded visual region plus separately proven Window ancestor is allowed; never invent semantic visual parents. Stable containment/cache hits retain the selected layer; entering a different semantic child invalidates the stack instead of sticking to an ancestor. |
| DM-MARGIN-001/002/004; DM-ERROR-004 | Margin summary is primarily locked-result only | A provisional candidate also shows size, Window margins and one trustworthy Local Reference where available. Preview margins are not formal result evidence. No Local means a disabled Local toggle. |
| DM-VIS-010/015 | Corner HUD primarily summarizes locked results | Corner HUD distinguishes `候选预览 · 未确认` from `已锁定 · 待记录`, with source/layer, dimensions, ratios and up to two margin rows. Completed RR summary still precedes generic region; Point/PP result priority is preserved. |
| DM-INSPECTOR-003/005 | Current result/snapshot JSON | Inspector also shows explicit records, label, Copy All and Save Session. Reselection closes Inspector; Update preserves its open state; current and historical JSON are separate. |
| DM-EXPORT-001/004 | Only current structured clipboard copy; no file flow | Preserve current copy, add Copy All and explicit browser JSON save/download. Only completed writable-close acknowledgement marks captured record IDs `saved`. Download request or clipboard success is not a durable-save acknowledgement. |
| DM-KEY-001/002 | Tab consumed by measuring page | Tab/Shift+Tab cycle when the Measurement plane owns keyboard input. Label/select/editable fields retain normal text/focus behavior; composition is not hijacked. |

The old unnumbered statement that `pointRelative()` is unused is superseded only for confirmed Point record serialization. Its existing mathematics are unchanged.

## 4. New reference lifecycle contracts

```text
IDLE
  → REFERENCE_SELECTING (Live; snapshotId=null)
  → FREEZING (only after explicit confirmation)
  → MEASURING (Frozen Snapshot)
       → Update → FREEZING → MEASURING
       → Adjust → ADJUSTING → Continue → FREEZING → MEASURING
       → Inspector / Reselect → REFERENCE_SELECTING
       → Exit → IDLE
```

| ID | Requirement / executable witness |
|---|---|
| DM-SELECT-001 | `begin()` creates/reuses one session without capture; duplicate menu/Recorder/shortcut entries never create a second session or implicitly confirm a suggestion. |
| DM-SELECT-002 | `windowAt()` + `renderOverlay()/renderHUD()` preview the topmost synthetic window, its label and bounds while the live scene remains mutable. No Micro pixel HUD or frozen mask in this phase. |
| DM-SELECT-003 | Pointer down/up must name the same existing window, same bounds and a click-size movement. Blank desktop/changed candidate does not freeze. Esc cancels. |
| DM-SELECT-004 | `confirmReference()` is the only initial capture gate. `captureSnapshot()` rejects absent reference, binds geometry/display mapping/source canvases to a fresh session/generation/snapshot token. |
| DM-SELECT-005 | Explicit Inspector reselection invalidates current state but retains records. Update never silently substitutes a same-title window; the native identity/revalidation gap is listed in the architecture amendment. |

The browser draws two **synthetic** windows (chat and notes). This proves selection UX, not real OS window enumeration, transparency or capture permissions.

## 5. Resolver / performance contracts

| ID | Binding behavior |
|---|---|
| DM-RESOLVE-001 | Resolution order is valid cache → semantic fixture → visual frozen-pixel fixture → manual selection. Semantic and visual provenance remain distinct. A known Window ancestor is not a flood-fill result. |
| DM-RESOLVE-002 | `visual-resolver.js` owns centralized `DEFAULTS`: 64ms trailing throttle, 7 logical-pixel local negative-cache distance, 768×384 logical-analysis ROI, 60,000 maximum visited pixels, 50,000 maximum bounding-box area and at most 50% Reference area, 12ms cooperative time budget, eight positive cache entries, minimum side 12, fill ratio ≥0.70, opaque seed. Thresholds are calibrated fixture defaults, not universal segmentation guarantees. |
| DM-RESOLVE-003 | No pointer-driven capture. Analysis pixels are created once per snapshot. Flood fill allocates only bounded ROI/queue buffers; connected component uses 4-neighbours and RGB RMS tolerance (default 8, accepted 0–64), not RGB equality. |
| DM-RESOLVE-004 | Same-snapshot positive candidate containment + compatible seed color reuses the result. Small same-color failed seeds reuse a local negative result. Semantic stack signatures detect child transitions; Tab-selected ancestors are not blindly retained across different child contexts. |
| DM-RESOLVE-005 | The latest-pointer trailing timer is not restarted by every event. Continuous movement cannot indefinitely starve resolution. Pointer/Micro HUD updates do not wait for segmentation. |
| DM-RESOLVE-006 | OFF/Alt/locked Target/non-Measuring/outside Reference ownership means no new visual work. Alt clears preview, not pointer HUD. On release, resolution may resume. |
| DM-RESOLVE-007 | ROI/source boundary contact, oversized/transparent/small/sparse component, pixel/area/time budget or cancellation returns **no visual candidate**. Never return the whole window as guessed flood-fill output. Irregular gradients/text/shadows may require manual selection. |
| DM-RESOLVE-008 | Snapshot/generation/epoch/provider/pointer-revision mismatch rejects stale async application; Update/Adjust/reselection/Exit invalidate pending work. Visual work samples source canvases, never HUD/mask pixels. |
| DM-RESOLVE-009 | Metrics expose pointerMoveCount, semanticResolveCount, visualResolveCount, visualCacheHit/Miss, floodFillRuns, visited/time maxima and rejection reasons. Regression must prove 100 inside pointer events do not cause 100 fills. |

Micro HUD remains only Screen/Window/Region coordinates plus source color, pointer-events:none and edge flip. Corner HUD carries the object summary. The main Toolbar retains the original ten controls; Record is a secondary Corner/Inspector action. Window + **one** useful Local Reference, no third margin group; overlay emphasizes exactly one four-edge relation.

## 6. Session record / export contracts

| ID | Binding behavior |
|---|---|
| DM-RECORD-001 | Click locks the measurement; it does not append or save. Enter (non-repeat, unmodified, outside editable controls) / Record explicitly appends a completed Region/Point/PP/RR. Preview or incomplete pairs cannot enter records. |
| DM-RECORD-002 | Successful append deep-copies the confirmed result and source snapshot, then clears only the current result so the next measurement can be collected. Repeated Enter cannot duplicate the consumed result. |
| DM-RECORD-003 | `desktop-measurement-session/v1` contains sessionId, prototypeOnly, coordinate-space declarations, snapshots[] and measurements[]. Every record has id/type/label/status/token/snapshotId/geometry/coordinates/margins/candidate/sourcePixel/stableRelocationEvidence/runtimeEvidence as applicable. No invented semantic evidence for manual/visual regions. |
| DM-RECORD-004 | Records are `confirmed` with memory persistence; preview stays outside the journal. Explicit successful file commit may change captured IDs to `saved`. Copy/download does not. Label defaults can be edited before Record. |
| DM-RECORD-005 | Snapshot sources are retained once per referenced snapshot. Update/Adjust/reselection preserves historical records and their original reference/display mappings; no automatic cross-snapshot relocation or relabeling. |
| DM-RECORD-006 | Bounds: 100 records, 16 retained snapshots, 20MiB encoded snapshot budget. Invalid geometry/token, retention limit or serialization failure rejects append atomically, preserves prior records and asks the user to save/start a new session. No hidden eviction. |
| DM-RECORD-007 | Copy All copies the complete session JSON. Clipboard failure leaves full session JSON visibly available in Inspector without replacing current-result JSON. |
| DM-RECORD-008 | Save uses user-selected browser file where supported, otherwise JSON Blob download. Cancellation/write/close failure does not mark records saved; abort the writable when possible. Plain browser download only becomes `download-requested`. No automatic filesystem writes on hover/click/Record. |
| DM-RECORD-009 | Exit destroys unsaved memory/current state; visible Record feedback warns “only in memory; copy/save before exit”. Exported files remain. No new Esc confirmation hierarchy or complex Recorder is introduced. |

Prototype snapshots include PNG data URLs to make one exported JSON self-contained. They remain `prototypeOnly:true`. Existing Go `measurement-evidence/v1` / Authoring loaders must not accept these fixtures as native evidence. Production integration must reuse validated canonical Evidence rather than create a second Geometry/Locator model.

## 7. Contracts still frozen and unchanged

The inherited baseline remains binding for all contracts not explicitly amended above, including the four measurement tools, valid ≥5×5 drag, signed geometry and 0–100 percentage vs true 0–1 ratios; source-pixel mapping/desktop holes; one Session; Adjust/Continue; Inspector default closed, Details=open and I=toggle; Escape closes Inspector otherwise exits; no Region eight handles/body editing, no Arrow nudge, no intermediate Escape cancel, no fifth margin tool and no standalone Freeze/Unfreeze toolbar toggle. DM-MARGIN-003/005/006/007 remain unchanged. Semantic fixture is not real AX/UIA. Native capture/input/Recorder isolation/platform qualification remains separate.

## 8. Evidence and release gate

`tests/desktop-measurement/browser.test.py` exercises the exact checked-in modules via Chromium set_content, including entry/reference selection, hover size/margins, Tab/Alt, cache/throttle, multiple records across snapshots, actual Blob download, mocked picker failure/success, old four-mode/cleanup/geometry cases. File-URI navigation was restricted in the execution environment; this is not a claim of tested native/direct-file permissions.

Actual run: browser **97/97**, existing geometry **16/16**, new visual/record model **34/34**; no browser page errors. Runtime evidence is under `.runtime/tests/desktop-measurement/`, not in this source directory. Source hashes and scope are in `tests/desktop-measurement/amendment-manifest.json`.

Production gates are tracked in `docs/architecture/desktop-automation/desktop-measurement-amendment-2026-09-17.md`. A browser PASS does **not** close native Live Reference selection, production visual scheduling/ROI, Corner HUD or Session Records/Authoring integration. macOS/Windows qualification stays NOT_RUN.
