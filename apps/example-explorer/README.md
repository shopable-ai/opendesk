# OpenDesk Examples

`apps/example-explorer` is the repository-side developer application for discovering, reading, and running curated OpenDesk examples.

It is intentionally outside `examples/`: the application consumes `examples/` and `docs/api/`, but it is not itself an example.

## Run

From the repository root:

```bash
./dist/opendesk -ui -script apps/example-explorer/main.js -console-mode script -log-dir .runtime/apps/example-explorer
```

The application:

- recursively discovers JavaScript under `examples/`;
- merges discovered files with `examples/catalog.json` metadata;
- enables one-click execution only for entries explicitly registered with `runPolicy: "safe"`;
- shows unregistered JavaScript as read-only entries instead of silently executing it;
- runs examples in a separate OpenDesk process through `Command.run()`;
- supports Stop through `AbortController`;
- shows source and completed stdout/stderr in the UI and mirrors completed output to the launching terminal;
- checks a lightweight examples directory signature every five seconds and refreshes the model when files change.

`Command.run()` currently returns output when the child process finishes; this application therefore does not claim streaming console support.

## Ownership boundaries

- `apps/example-explorer/`: explorer application code.
- `examples/`: user-facing runnable examples and `catalog.json` execution metadata.
- `docs/api/examples/README.md`: public website/navigation entry for examples.
- `tests/`: correctness gates; example success is not equivalent to test success.
- `.runtime/apps/example-explorer/`: transient run logs and artifacts.

Do not broaden one-click execution by extension alone. A newly discovered `.js` file remains read-only until its behavior, prerequisites, side effects, platform support, and documentation have been reviewed and registered in `examples/catalog.json`.
