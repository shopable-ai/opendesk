# OpenDesk Examples

`apps/example-explorer` is the repository-side developer application for discovering, reading, and running curated OpenDesk examples.

It is intentionally outside `examples/`: the application consumes `examples/` and `docs/api/`, but it is not itself an example.

## Run

From the repository root:

```bash
./dist/opendesk -ui -script apps/example-explorer/main.js -console-mode script -log-dir .runtime/apps/example-explorer
```

The application:

- recursively scans JavaScript under `examples/` only to detect repository changes and validate catalog entries;
- shows only canonical examples explicitly registered in `examples/catalog.json` in the normal user list;
- treats `aliases` as compatibility paths and never displays them as duplicate examples;
- keeps helpers, support scripts, tests, smoke files and unregistered JavaScript hidden from the normal list;
- enables one-click execution only for entries explicitly registered with `runPolicy: "safe"`;
- exposes `manual` entries for source/prerequisite discovery without enabling one-click Run;
- runs safe examples in a separate OpenDesk process through `Command.run()`;
- supports Stop through `AbortController`;
- shows source and completed stdout/stderr in the UI and mirrors completed output to the launching terminal;
- checks a lightweight examples directory signature every five seconds and refreshes the curated model when files change.

`Command.run()` currently returns output when the child process finishes; this application therefore does not claim streaming console support.

## Ownership boundaries

- `apps/example-explorer/`: explorer application code.
- `examples/<domain>/`: canonical user-facing example implementations.
- `examples/catalog.json`: canonical discovery metadata, safety policy and compatibility aliases.
- root-level legacy `examples/*.js`: compatibility or pending-classification paths, not new canonical locations.
- `docs/api/examples/README.md`: public website/navigation entry for examples.
- `tests/`: correctness gates; example success is not equivalent to test success.
- `.runtime/apps/example-explorer/`: transient run logs and artifacts.

## Catalog policy

A catalog entry points to exactly one canonical file. Use `aliases` for published old paths instead of registering the same behavior twice.

`runPolicy: "safe"` is intentionally narrow: the example must be suitable for direct execution from the Explorer without unexpected desktop input, visible-pixel capture, persistent mutation, external-service requirements, audio output, native UI interaction or similar prerequisites. Other reviewed examples use `manual` and remain useful for learning without turning discovery into execution authorization.

Do not broaden one-click execution by extension or directory alone. A newly discovered `.js` file stays hidden from the ordinary list until its purpose, prerequisites, side effects, platform support and canonical location have been reviewed and registered.
