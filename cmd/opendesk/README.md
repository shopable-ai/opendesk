# OpenDesk command

This directory owns the primary `opendesk` executable. Run it from the
repository root with:

```bash
go run ./cmd/opendesk <flags>
```

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
