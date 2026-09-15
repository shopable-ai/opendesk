# Script Runner Prototype

This directory contains the **main interaction prototype** for the compact OpenDesk Script Runner toolbar.

## Main prototype

- `index.html` — standalone interactive HTML prototype and current UI / interaction candidate.

The earlier exploratory HTML is intentionally not archived as a variant. It was only a disposable exploration and is not a design reference.

The production implementation that existed before this redesign is preserved separately at:

- `apps/opendesk/script-runner-v1/`

## Problem being solved

The production Script Runner has a compact floating toolbar, but changing the active script requires opening the full Script Runner list window. The toolbar therefore does not yet support the common loop:

```text
choose script → run → choose another script → run
```

The compact selector keeps this high-frequency loop in the floating toolbar while leaving sorting, multi-select and batch operations in the full management window.

## Main interaction contract

Toolbar order:

```text
Run → Stop → Previous → Current Script Selector → Next
```

Key decisions:

- **Run / Stop remain stable primary operations.** They do not move around based on selection state.
- **Previous / Current / Next form one navigation group.** Previous and Next use thin chevrons, not play-shaped triangles.
- **Selecting and running are separate actions.** Clicking a row in the popover only changes the current script. It never runs it automatically.
- **No per-row Run button.** Execution returns to the single toolbar Run action, reducing accidental execution and duplicate action affordances.
- The selector shows current script, index / total and run state.
- The popover shows roughly five rows before scrolling and opens upward from the bottom-anchored toolbar.
- Mouse wheel interaction only scrolls the open list. It does not change the active script while collapsed.
- `Manage scripts…` opens the existing full Script Runner list / management window.
- During execution, script switching controls are disabled; Stop remains available.

## Status

This is the preferred main prototype candidate. It should be used as the UI / interaction source when the production Script Runner is updated. Before production replacement, the previous production implementation is kept in `apps/opendesk/script-runner-v1/` for side-by-side verification and rollback/reference purposes.
