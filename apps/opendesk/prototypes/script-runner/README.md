# Script Runner Prototype

This directory contains the interaction prototype for the compact OpenDesk Script Runner toolbar.

## Current prototype

- `index.html` — standalone interactive HTML prototype.

## Problem being explored

The production Script Runner already has a compact floating toolbar, but switching the active script requires opening the separate full Script Runner list window. The toolbar label only displays the current/default script and the toolbar Run action executes the first script in the ordered list.

This prototype explores a lower-friction interaction for frequent script switching while keeping the full management window for sorting, multi-select and batch operations.

## Proposed interaction contract

The compact toolbar contains:

1. Previous script.
2. Run current script.
3. Stop current run.
4. A clickable current-script selector showing the current index, total count and run state.
5. Next script.

Clicking the current-script selector opens a compact popover adjacent to the toolbar. The popover:

- shows roughly five script rows before scrolling;
- opens upward when the toolbar is anchored at the bottom of the display;
- selects a script when the row is clicked without running it automatically;
- provides an explicit per-row Run button for direct execution;
- keeps a `Manage scripts…` secondary action that maps to the existing full Script Runner list window;
- uses the mouse wheel only for scrolling the open list, not for changing the active script while the selector is closed.

## Safety / interaction decisions

Changing the selected script and running a script are intentionally separate actions. Wheel-to-switch on the collapsed toolbar is not used because an accidental selection change can lead to running the wrong automation.

During a run, prototype script switching is disabled. Production implementation can revisit this only if the selected-next-script state is made explicit and cannot affect the currently running execution.

## Status

Prototype only. It is not the production Script Runner UI contract yet. After the interaction is confirmed, convert the approved behavior into an Oracle / implementation contract before changing `apps/opendesk/script-runner/controller.js` and the FloatingWindow APIs if required.
