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
tooltip/Accessibility labels keep the Chinese action names. Recorder state, issue count, generated-script state, and the
immutable `recordingId` stay out of the normal list row; they remain internal data for validation and destructive-action
confirmation. Closing the history window does not close the recording toolbar. Reopening creates a new Custom UI window id
because closed window ids cannot be reused within one execution.

## Discovery and naming

Only immediate children matching `rec-[A-Za-z0-9][A-Za-z0-9._-]*` under `.runtime/recordings` are considered. A parsed
`manifest.json` whose `recordingId` disagrees with the directory name is rejected from the list. Rows are sorted newest
first by `manifest.startedAt`, falling back to directory `File.stat().modifiedAt`.

A user-visible rename never changes the recording directory or `recordingId`. It writes only:

```text
<recordingDir>/ui-metadata.json
```

with `schemaVersion`, `recordingId`, `displayName`, and `updatedAt`. The display name is presentation metadata, not Recorder
evidence and not an execution input.

## Generated script selection

Run first prefers the canonical Recorder output:

```text
<recordingDir>/generated/basic.recipe.js
```

If that file is absent, History chooses a regular `*.recipe.js` in the same `generated` directory deterministically by
newest `File.stat().modifiedAt`, then filename. It never executes a path from `ui-metadata.json` or from user-entered text.

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

While a history run is active, capture/replay/Agent-prompt and pointer-motion controls are locked. The existing main toolbar
**Stop** button is intercepted only for that interval and aborts the history child execution through `AbortController`;
when no history run is active it calls the original Recorder Stop callback unchanged, including its existing control-click
exclusion boundary. Exit code 0 means only that the child Runtime finished; it does not qualify the target application's
business result.

## Delete and open directory

Delete always uses `Dialog.confirm()` with cancel as the default action, re-resolves the row from its validated
`recordingId`, removes only that recording directory, and verifies that it no longer exists. It deletes raw, manifest,
actions, generated files, and `ui-metadata.json` together; it is intentionally destructive and cannot be undone.

Open-directory uses `/usr/bin/open` on macOS, `explorer.exe` on Windows, and `xdg-open` on Linux. On Windows the history
list itself uses the existing `ui.createWindow()` HTML surface, so the same WebView2 Runtime requirement documented for
Custom UI windows applies; the native `FloatingWindow` toolbar does not gain that dependency.

## Tests

From the repository root:

```bash
node tests/custom-ui/recording-history.test.js
node --test tests/custom-ui/recording-history-presentation.test.js
```

The fixture tests cover File `stat().type` handling, newest-first discovery, canonical/fallback recipe selection, manifest
identity mismatch, display-name sidecar writes, confirmed scoped deletion, unique window ids, Windows directory opening,
Stop-driven cancellation of a history child run without invoking the original Recorder Stop callback, the one-row list
shape, the `list.bullet` toolbar entry, and the four icon-only row actions.
