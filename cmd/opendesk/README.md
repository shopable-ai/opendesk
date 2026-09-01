# OpenDesk command

This directory owns the primary `opendesk` executable. Run it from the
repository root with:

```bash
go run ./cmd/opendesk <flags>
```

For coding-agent desktop execution, keep the legacy flags intact and use the
separate first-argument router:

```bash
go run ./cmd/opendesk ai schema
```

`opendesk ai` emits a single JSON envelope on stdout and writes action evidence
below `.runtime/ai/`. Its command registry drives routing and schema output;
see [`docs/api/ai-cli.md`](../../docs/api/ai-cli.md).

Go white-box tests for command-only parsing and orchestration helpers stay next
to `cmd/opendesk/main.go`. Cross-package and end-to-end suites belong under the top-level
`tests/` tree. If command orchestration is later extracted into an importable
package, move the corresponding implementation and tests together.

The normal **Experimental** Native Extension entry point is the strict registry:

- `-experimental-native-extension -script ...` enables strict manifest
  discovery and immutable `NativeExtensions` bindings for that trusted local
  JavaScript execution only.

Two deliberately separate low-level diagnostic compatibility paths follow; they
are not the daily plugin API:

- `-native-extension ... -native-method ...` calls the Protocol V0 Host directly.
- `-experimental-unsafe-native-extension-call -script ...` enables the low-level
  V0 `NativeExtension.call()` compatibility surface for explicit local
  diagnostics.

See `docs/api/native-extension.md` for the Runtime contract and
`examples/native-extensions/README.md` for build and copy-paste usage. The
feature is default-closed and is not enabled for HTTP or MCP execution.

Custom UI project activation uses `opendesk.runtime.json` as the canonical
configuration filename. Discovery accepts `clawdesk.runtime.json` only as a
legacy fallback when no canonical file exists in the same directory; projects
should rename the legacy file. A built CLI locates `opendesk-ui-host` beside the
runtime binary, while the macOS app locates it in `Contents/Helpers/`.

HTTP mode also owns the persistent local Scheduler lifecycle. Start it with
`-http -port 60844`, then use `http://127.0.0.1:60844/scheduler` to create file
or inline JavaScript tasks. The command wires Scheduler directly to the shared
Execution and JavaScript Runtime; it does not execute tasks through an HTTP
self-call. See [`scheduler.md`](../../docs/api/scheduler.md) and
[`scheduler-api.md`](../../docs/api/scheduler-api.md) for the user and
local-control-plane contracts.
