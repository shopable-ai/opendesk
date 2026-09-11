# Recorder Simple history

`recording-console-simple` keeps Recorder capture facts under the existing repository-local root:

```text
.runtime/recordings/rec-*/
```

History is a view over those directories. It does not create a second recording database or copy Recorder facts.

## UI

The simple native toolbar adds one `list.bullet` button named **历史录制**. The existing toolbar controller remains in
`controller-core.js`; `controller.js` is a thin compatibility layer that widens the one-row toolbar from 7 to 8 content
slots, loads `recording-history.js`, and attaches the history button before the toolbar is shown.

The history button opens a bounded `ui.createWindow()` list. Each recording is one horizontal row with only the display
name, recording time, and four compact icon actions. The action icons are `play.fill` (运行), `pencil` (改名),
`folder.fill` (打开目录), and `trash.fill` (删除). Their visible button text is cleared before the window is shown while
tooltip/Accessibility labels keep the Chinese action names. Each icon action keeps a 32×32 hit target, pointer/hover
feedback, an obvious disabled state, and the row remains single-line with long names ellipsized. Recorder state, issue
count, generated-script state, and the immutable `recordingId` stay out of the normal list row; they remain internal data
for validation and destructive-action confirmation. Closing an idle history window does not close the recording toolbar.
If a History recipe is currently running, closing its History window cancels that child execution so a hidden automation
cannot continue without its row-level control surface. Reopening creates a new Custom UI window id because closed window
ids cannot be reused within one execution.

## Discovery and naming

Only immediate children matching `rec-[A-Za-z0-9][A-Za-z0-9._-]*` under `.runtime/recordings` are considered. A parsed
`manifest.json` whose `recordingId` disagrees with the directory name is rejected from the list. Rows are sorted newest
first by `manifest.startedAt`, falling back to directory `File.stat().modifiedAt`.

A user-visible rename never changes the recording directory or `recordingId`. It writes only:

```text
<recordingDir>/ui-metadata.json
```

with `schemaVersion`, `recordingId`, `displayName`, and `updatedAt`. The display name is presentation metadata, not Recorder
evidence and not an execution input. Rename uses the currently displayed row title as the prompt default, trims the result,
and accepts only 1–80 visible characters. Cancel, invalid input, or a recording that disappears while the prompt is open
leaves Recorder facts untouched. A successful write immediately refreshes the current list and survives reopening History.

## Generated script selection

Run first prefers the canonical Recorder output:

```text
<recordingDir>/generated/basic.recipe.js
```

If that file is absent, History chooses a regular `*.recipe.js` in the same `generated` directory deterministically by
newest `File.stat().modifiedAt`, then filename. It never executes a path from `ui-metadata.json` or from user-entered text.
A row without a generated recipe has its Run control disabled and does not receive a click handler. Run re-resolves the
recording and generated script again when clicked; it never generates a recipe as a side effect of Run.

## Run and cancel

A history row never auto-runs. Clicking the `play.fill` action starts a 3/2/1 preparation countdown and then uses the same
child Runtime shape as the simple console replay:

```text
Command.run(<dist/opendesk>, [
  "-script", <generated recipe>,
  "-console-mode", "script",
  "-log-dir", <history run log dir>
], { cwd: Execution.workdir, timeout, maxOutputBytes, signal })
```

History run logs are written under:

```text
.runtime/examples/custom-ui/recording-console-simple/history-runs/<recordingId>/<run timestamp>/
```

The History manager claims the active run before its first asynchronous UI update, so rapid repeated Run clicks cannot
start parallel child executions. While a history run is active, all History row actions and Refresh are disabled, and the
main capture/replay/Agent-prompt and pointer-motion controls are locked. The existing main toolbar **Stop** button is
intercepted only for that interval and aborts the History child execution through the same `AbortController` passed to
`Command.run()`; when no history run is active it calls the original Recorder Stop callback unchanged, including its
existing control-click exclusion boundary. Success, failure, cancel, and History-window close all settle the same run
lifecycle and restore button state. Exit code 0 means only that the child Runtime finished; it does not qualify the target
application's business result.

## Delete and open directory

Delete always uses `Dialog.confirm()` with cancel as the default action. The confirmation names both the current display
name and immutable `recordingId`, and explicitly states that the whole Recording package is removed, including raw,
manifest, actions, generated, evidence, and `ui-metadata`. After confirmation History re-resolves the row from its validated
`recordingId`, removes only that `rec-*` immediate child, verifies that it no longer exists, and immediately refreshes the
list. A per-row pending-operation guard prevents rapid double-clicks from producing repeated destructive confirmations.

The Runtime `File.removeDir()` implementation uses Go `os.RemoveAll`, so a final `rec-*` entry that is itself a symbolic
link is removed as a link rather than recursively traversing its target; interaction coverage verifies the external target
survives. `File.stat()` follows symbolic links and the public File API currently exposes no `lstat/realpath`, so a recordings
root that has itself been replaced by a symbolic link cannot be fully proven as a physical containment boundary in this JS
layer; that remains an explicit residual risk rather than an assumed guarantee.

Open-directory uses `/usr/bin/open` on macOS, `explorer.exe` on Windows, and `xdg-open` on Linux. The path always comes from
the validated `recordingId` under the recordings root, never from `displayName`. On Windows the history list itself uses the
existing `ui.createWindow()` HTML surface, so the same WebView2 Runtime requirement documented for Custom UI windows
applies; the native `FloatingWindow` toolbar does not gain that dependency.

## Pagination and large-history performance

The current implementation is intentionally simple but does not scale with the number of recordings: `scanRecordings()`
inspects every valid recording directory, `buildWindowHTML()` emits every row, `bindWindow()` installs four action controls
for every row, icon setup crosses the Custom UI bridge for every action, and `refresh()` closes and recreates the complete
window. Pagination must therefore bound the UI work as well as the amount of data visible on one page; adding only Previous
and Next buttons while still constructing all rows is not considered a completed performance fix.

This section freezes the target design. It is a design contract until the corresponding JavaScript and interaction tests
are updated.

### P0 paging contract

- Use a fixed default `PAGE_SIZE = 10`. Do not add a page-size chooser in P0.
- Keep newest-first ordering unchanged. Opening History starts on page 1.
- The footer contains **上一页**, `第 X / Y 页 · 共 N 条`, **下一页**, and the existing Refresh action. Previous and Next are
  disabled at their respective boundaries. With zero rows, the pager is disabled and the existing empty-state message is
  shown.
- The History window is created once per open session. Normal page turns do not close or recreate the `ui.createWindow()`
  instance, so window position, focus, and the active History surface remain stable.
- Build only ten reusable row slots. The number of list action controls is therefore bounded at 40 plus pager/header
  controls regardless of the total recording count. The last page hides unused slots.
- Bind the row-slot handlers once. A handler must resolve `visibleRows[slotIndex]` when the click occurs; it must not close
  over the row object that happened to occupy the slot when the window was created. This prevents Run/Rename/Open/Delete
  from targeting a stale recording after a page turn.
- A page turn updates slot name, time, action availability, visibility, pager text, and Previous/Next disabled state in
  place. Action icons are installed once for the ten slots instead of being re-applied for every recording on every page.
- Busy/run state changes only update the currently rendered slots plus pager/Refresh. Runtime work for
  `setHistoryActionsDisabled()` becomes `O(PAGE_SIZE)` rather than `O(total recordings)`.
- Refresh and successful Rename preserve the current page when possible. Delete preserves the page and then clamps it to
  the new last page, so deleting the only item on the final page moves to the preceding page instead of showing an invalid
  page number.
- Page navigation is disabled while a History run is active or while a row mutation is pending. Existing Run cancellation,
  row mutation guards, recording-id validation, generated-script selection, and destructive confirmation rules remain
  unchanged.

The manager state should be explicit rather than inferred from control ids:

```text
allRows        = newest-first discovered rows
pageIndex      = zero-based selected page
pageSize       = 10
pageCount      = max(1, ceil(allRows.length / pageSize))
visibleRows    = allRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
```

The intended internal responsibilities are:

```text
loadHistory()          scan and sort the current catalog
clampPage()            keep pageIndex inside the catalog bounds
pageRows()             derive visibleRows from current catalog/pageIndex
renderPage()           update the ten reusable slots and pager in place
setPage(nextPage)      clamp + render only; never rescan the filesystem
refresh(message)       rescan once, clamp, then render in the existing window
resolveSlot(index)     return the current visible row for an action callback
```

### First-open scan boundary

UI paging alone makes render/binding work bounded, but the current `scanRecordings()` remains `O(N)` filesystem work. It
reads each recording's manifest and UI metadata and searches its generated directory before the first page can be shown.
This is a separate first-open bottleneck and must remain visible in performance reporting instead of being hidden behind the
word "pagination".

P0 should first land bounded in-place rendering because it removes the unbounded Custom UI element/event/icon cost without
changing Recorder evidence semantics. If first-open latency remains material with large real histories, the next step is a
separate catalog-loading optimization with these constraints:

- preserve `manifest.startedAt` (directory `modifiedAt` only as fallback) as the ordering contract;
- do not infer correctness from the `rec-*` directory name;
- do not create a second authoritative recording database;
- if a cache/index is introduced, treat it as rebuildable presentation data and validate entries against the underlying
  recording directory before Run/Rename/Open/Delete;
- measure directory discovery, manifest/metadata inspection, generated-script resolution, window creation, and first-page
  render separately before choosing an index/cache format.

This split prevents a premature history index from silently becoming another source of truth while still leaving a clear
path to optimize the remaining filesystem scan.

### Required regression coverage

Pagination implementation is not complete until tests cover at least these catalog sizes and transitions:

- 0, 1, 10, 11, and 25 recordings, including correct `pageCount` and newest-first slicing;
- Previous/Next disabled state on first, middle, and final pages;
- page turn does not call filesystem scan and does not create a second History window;
- action callbacks after a page turn target the row currently occupying the slot, not the previous page's row;
- a recording without a generated script keeps Run disabled after page changes;
- Rename refresh keeps the user on the same valid page and displays the new name;
- deleting the final row of the final page clamps to the new last page;
- active History Run locks Previous/Next/Refresh and visible row actions, and unlocks them after success/failure/cancel;
- malformed/stale recording entries retain the existing validation behavior;
- icon setup and action-control count remain bounded by `PAGE_SIZE`, not total recording count.

For performance smoke, create a disposable fixture with at least 100 history directories and report separate timings for
scan, History window creation, and first-page render. The acceptance criterion for the paging layer is structural: page
render/binding/icon work must stay approximately constant as N grows. A separate measured target for first-open scan should
only be frozen after that evidence is collected on macOS and Windows.

## Tests

From the repository root:

```bash
node tests/custom-ui/recording-history.test.js
node --test tests/custom-ui/recording-history-presentation.test.js
node --test tests/custom-ui/recording-history-icon-adapter.test.js
node --test tests/custom-ui/recording-history-interaction.test.js
```

The original fixture tests keep covering File `stat().type` handling, newest-first discovery, canonical/fallback recipe
selection, manifest identity mismatch, display-name sidecar writes, scoped deletion, unique window ids, Windows directory
opening, shared Stop cancellation, the one-row list shape, the `list.bullet` toolbar entry, and the four icon-only row
actions.

`recording-history-interaction.test.js` is the UI-event layer: it begins at the registered `control.listeners.click(...)`
callbacks for `rename0`, `delete0`, `open0`, and `run0`, then verifies Dialog/File/Command side effects and the resulting UI
state. It covers rename cancel/validation/trim/persistence, delete cancel/confirm/duplicate suppression/stale rows/sibling
retention/final-symlink safety, Windows directory opening, disabled Run with no recipe, duplicate Run suppression, row
locking, main-toolbar Stop cancellation, and History-window-close cancellation. Mock/static interaction coverage is not a
substitute for real Native UI smoke; live verification must still be reported separately when a current paired Runtime/UI
host and desktop session are available.
