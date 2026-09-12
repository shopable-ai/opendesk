# OpenDesk Examples

`apps/example-explorer` is the repository-side developer application for discovering, reading, and running curated OpenDesk examples.

It intentionally lives outside `examples/`: the application consumes `examples/` and `docs/api/`, but it is not itself an example.

## Run

From the repository root:

```bash
./dist/opendesk -ui -script apps/example-explorer/main.js -console-mode script -log-dir .runtime/apps/example-explorer
```

The application:

- recursively scans JavaScript under `examples/` only to detect repository changes and validate catalog entries;
- shows only canonical examples explicitly registered in `examples/catalog.json` in the normal user list;
- treats catalog `legacyNames` as historical names/search metadata, not as physical compatibility files, and includes them in search;
- keeps helpers, support scripts, tests, smoke files and unregistered JavaScript hidden from the normal list;
- enables one-click execution only for entries explicitly registered with `runPolicy: "safe"`;
- exposes `manual` entries for source/prerequisite discovery without enabling one-click Run;
- runs safe examples in a separate OpenDesk process through `Command.run()`;
- supports Stop through `AbortController`;
- builds one structured launch spec for both Runner argv and Copy Run Command;
- keeps the action bar visible with an explicit `Direct run available`, `Manual run required`, or `Unsupported on this platform` status and the reason for that state;
- displays platform support, launch mode, UI requirement, run policy, prerequisites, required environment and expected result;
- disables Run when the current `System.getPlatformInfo().os` is not in the entry's `platforms`, while keeping a platform-correct manual command visible;
- shows source and completed stdout/stderr in the UI and mirrors completed output to the launching terminal;
- checks a lightweight examples directory signature every five seconds and refreshes the curated model when files change.

`Command.run()` currently returns output when the child process finishes; this application therefore does not claim streaming console support.

## UI theme

Custom UI currently provides the built-in `system` and `dark` window themes. The Explorer uses `theme: "dark"` and keeps its visual tokens in `styles.css`; it does not depend on a remote or third-party stylesheet. The category menu remains a native `<select>` for keyboard and accessibility behavior.

## Ownership boundaries

- `apps/example-explorer/`: Explorer application code.
- `examples/<domain>/`: canonical user-facing example implementations.
- `examples/catalog.json`: canonical discovery metadata, launch contract, platform policy and historical names.
- `examples/*.js`: no new canonical files and no compatibility wrappers; any remaining root-level JavaScript is pending explicit classification/removal.
- `docs/api/examples/README.md`: public website/navigation entry for examples.
- `tests/`: correctness gates; example success is not equivalent to test success.
- `.runtime/apps/example-explorer/`: transient run logs and artifacts.

## Catalog policy

A catalog entry points to exactly one canonical file. Historical names may remain in `legacyNames` so search and migration context are understandable, but the old files themselves are retired.

Multi-file examples use the nested `path/to/main.js` as that canonical file; the recursive scanner preserves the full path, while the example may keep assets, configuration, and support JavaScript beside it. Source inspection reads that nested `main.js`, and the launch spec passes its absolute path to the child process while displaying the repository-relative command.

`launch.kind` is either `script` (`-script`, with optional `-ui` and `-console-mode`) or `ai-run` (`ai run`, with optional input-file metadata). `runPolicy: "safe"` is intentionally narrow: the example must be suitable for direct execution from the Explorer without unexpected desktop input, visible-pixel capture, persistent mutation, external-service requirements, audio output, native UI interaction or similar prerequisites. Other reviewed examples use `manual` and remain useful for learning without turning discovery into execution authorization.

Do not broaden one-click execution by extension or directory alone. A newly discovered `.js` file stays hidden from the ordinary list until its purpose, prerequisites, side effects, platform support and canonical location have been reviewed and registered.
