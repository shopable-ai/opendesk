# App Package contract tests

These tests qualify `opendesk.app.json` at two different layers.

From the repository root, run the complete deterministic contract gate:

```bash
make test-app-package-contract
```

The target builds the current Runtime with the repository `VERSION`, runs the
Go semantic/path contract in `pkg/appshell`, compiles the Draft 2020-12 authoring
schema and checks Schema/Runtime parity in `internal/appcli`, validates both
maintained App Mode packages through the real `dist/opendesk app validate
--json` CLI, and then runs `runtime-contract.test.js` against the real binary.

Schema parity uses a pinned test-only standards implementation rather than a
handwritten partial JSON Schema interpreter. The dependency is not linked into
the Runtime binary; production validation remains `pkg/appshell.ValidatePackage()`.

The Runtime smoke covers:

| Fixture | Expected result |
| --- | --- |
| `fixtures/valid-v1` | schema v1 loads, App Shell is available, entry exits successfully |
| `fixtures/valid-legacy` | manifest without `schemaVersion` remains compatible |
| `fixtures/runtime-too-old` | `APP_RUNTIME_TOO_OLD` before entry output |
| `fixtures/schema-unsupported` | `APP_PACKAGE_SCHEMA_UNSUPPORTED` before entry output |

CI additionally validates `examples/app-mode/basic` and `apps/opendesk` through
the built macOS/Windows CLI before distribution or App Shell launch.

Machine-readable evidence is written to:

```text
.runtime/tests/app-package/runtime-contract.json
```

For repository-wide release qualification, also run:

```bash
go test ./cmd/opendesk
go test ./...
go vet ./...
node scripts/audit_test_architecture.js
```

Those broader commands can reveal unrelated repository regressions. Do not
replace the real Runtime smoke with a host-only manifest parser test.
