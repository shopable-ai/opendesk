# Clawdesk command

This directory owns the primary `clawdesk` executable. Run it from the
repository root with:

```bash
go run ./cmd/clawdesk <flags>
```

Go white-box tests for command-only parsing and orchestration helpers stay next
to `cmd/clawdesk/main.go`. Cross-package and end-to-end suites belong under the top-level
`tests/` tree. If command orchestration is later extracted into an importable
package, move the corresponding implementation and tests together.
