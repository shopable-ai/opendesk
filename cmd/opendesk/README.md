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

Custom UI project activation uses `opendesk.runtime.json` as the canonical
configuration filename. Discovery accepts `clawdesk.runtime.json` only as a
legacy fallback when no canonical file exists in the same directory; projects
should rename the legacy file. A built CLI locates `opendesk-ui-host` beside the
runtime binary, while the macOS app locates it in `Contents/Helpers/`.
