# Repository Root Layout Register

## Scope and baseline

This register is the single decision record for top-level layout. It was
re-checked against the working tree and `origin/master` on 2026-08-31. The
histories had no merge base, so they were merged without a reset, rebase, or
bulk overwrite: overlapping paths retain the local version and remote-only
paths are added after review. This keeps the formal architecture target while
protecting shared work in progress.

This work changes paths only where a live producer/consumer proves the change
is safe. The primary command files are moved as a unit using their current
local content; no implementation is imported from the disconnected remote
history. It does not reorganize Runtime, HTTP, Goja, timer, or desktop
automation implementation.

## Target root

```text
.
├── AGENTS.md  README.md  QUICKSTART.md  SUPPORT.md # repository/operator/support docs
├── Makefile  .gitignore                      # supported commands and lifecycle exclusions
├── go.mod  go.sum  jsconfig.json  tm.config.js # build and runtime configuration
├── automation/  pkg/  cmd/                  # Go implementation and command entrypoints
│   └── clawdesk/                            # primary CLI/HTTP entry and same-package tests
├── polyfills/  jslibs/  public/  types/     # shipped JavaScript runtime surface
├── schemas/  prompts/                       # versioned shared contracts and prompt packs
├── examples/  scripts/  tests/               # maintained examples, tooling, and tests
├── docs/  docs-user-api/                    # engineering docs and sole user-API docs
├── blogs/                                   # external-facing drafts; never an engineering authority
├── third_party/                             # pinned locally patched Go modules
├── .archive/                                # selected historical material only
├── .runtime/                                # ignored disposable run evidence and temporary output
├── .staging-sync/                           # ignored, short-lived sync transaction state only
├── .dev/                                    # optional ignored local development state
└── dist/                                    # ignored, rebuildable local release cache
```

`SUPPORT.md` is the root project-support and customization entry. It links to
the maintained user-API documentation instead of duplicating runtime contracts.

## Decisions and migration register

| Current item | Current use and observed issue | Target and action | Path consumers affected |
| --- | --- | --- | --- |
| `AGENTS.md`, `README.md`, `QUICKSTART.md`, `SUPPORT.md` | Repository rules, human entrypoints, and support/customization guidance. `QUICKSTART.md` was the one live mismatch: its build example left a binary at root. `SUPPORT.md` directs users to maintained API docs. | Keep at root. Change the build example to `make build` / `dist/clawdesk`; do not duplicate API contracts in support material. | New users, support requests, `Makefile`, release scripts; no runtime code. |
| `Makefile`, `.gitignore` | The Makefile is the supported build/test command surface; `.gitignore` enforces the lifecycle boundary for `.runtime/`, `dist/`, `.staging-sync/`, local assistant state, and the accidental root `clawdesk` binary. | Keep both at root. Build the primary command as `./cmd/clawdesk`; keep local artifacts ignored rather than relocating them into source. | README/quickstart commands, build/package scripts, Git status and release output. |
| `go.mod`, `go.sum`, `jsconfig.json`, `tm.config.js` | Module pins, editor wiring, and root-discovered runtime config. The primary command resolves `tm.config.js` from its working directory. | Keep at root. | Go module resolution, TypeScript declarations, CLI runtime config lookup. |
| `automation/`, `pkg/`, `cmd/` | Application primitives, reusable packages, and command entrypoints. The formal baseline owns the primary executable in `cmd/clawdesk/`; auxiliary commands remain separate siblings. | Keep these boundaries. Move the current primary command and its same-package tests together to `cmd/clawdesk/`, retaining their local content; do not merge implementation from the disconnected remote history. | Go imports, `go build ./cmd/clawdesk`, command-specific tests and scripts. |
| `docs/`, `docs-user-api/` | Engineering docs and the sole maintained user API root. `docs/` already has only `README.md` at its direct root; API documents have their own canonical root. The stale 2026-06 local-sync scope record had no incoming links and contradicted the current remote baseline. | Keep the two roots separate; archive that record under `.archive/reports/`; do not recreate `docs-api/`, `docs-api-user/`, or `docs/api/`. | README links, user API publication, Runtime API checks. |
| `blogs/` | External-facing drafts and published-copy candidates. Its README explicitly says it is not the source of engineering truth and no runtime, test, or documentation tooling imports it. | Keep as a separate communication root, with `drafts/` now and `published/` only when real released content needs repository retention. Do not merge it into `docs/` or treat it as an API contract. | External content workflow only; no build, runtime, or test consumer. |
| `prompts/` | 26 reusable, domain-grouped prompt templates with stable artifact mappings; active docs link to them. They are not dated handoffs or runtime snapshots. | Keep as a dedicated shared prompt-pack root. Put one-off handoffs in `.archive/notes/` and generated snapshots in `.runtime/`. | Prompt-linked docs, automation/golden-sample/WeChat/MCP workflows. |
| `schemas/` | Nineteen valid Draft 2020-12 JSON Schemas under `automation/` and `runtime-api/`; they describe cross-domain, versioned artifact contracts rather than instances. | Keep as source-adjacent shared data contracts. Do not move to API prose, `tests/`, or `docs/`; instances belong in domain fixtures or `.runtime/`. | Runtime API catalog validation, contract reviews, future schema consumers. |
| `third_party/` | Two complete local Go modules, not anonymous copies. `go.mod` has active `replace` directives for RobotGo and kbinani/screenshot; source imports RobotGo. | Keep. Do not delete or flatten. Review local patches only against the exact pinned module versions. | `go mod`, automation input/screen code, macOS build and focused compatibility tests. |
| `tests/` and Go `_test.go` files | Cross-package JS/fixture/replay domains live under `tests/`. Go white-box tests live beside the Go package they exercise. The primary-command white-box tests now live beside `cmd/clawdesk/main.go`; the dated WeChat progressive-recognition results document was a historical report, not current test guidance. | Keep `tests/` as the sole top-level test root; do not create a root `test/`. Keep primary command tests in `cmd/clawdesk/`, not at root; move the historical report to `.archive/reports/wechat-layout/`. | `scripts/test_runtime_apis.sh`, `go test ./cmd/clawdesk`, package-private test access. |
| `tests/*/fixtures/` and `tests/runtime-api/fixture/` | Every current fixture is domain-owned: desktop vision, LocateAnything, OpenCV, semantic execution, WeChat, or Runtime API. The Runtime API's singular fixture is still inside its owning domain. | Keep in place. Do not create a generic root `fixtures/`; normalize a singular name only with all consumer paths in the same change. | Domain test scripts, fixture README/manifest/pair registries. |
| `examples/` and `scripts/` | Examples are runnable user/developer demonstrations; scripts are stable build, permission, smoke, and test entrypoints. Some example names are test-like, but their live documentation references make them examples rather than orphaned output. The dated WeChat testing guide was not an executable example or a current contract. | Keep responsibilities separate. Move that stale guide to `.archive/legacy-docs/wechat/`; new disposable probes must start in `.runtime/debug/` and be promoted deliberately. | README/quickstart/runbook commands, macOS and Runtime API tooling. |
| `polyfills/`, `jslibs/`, `public/`, `types/` | Runtime loader loads polyfills and JS libraries; app packaging copies them. `public/` holds shipped media/static files. `types/` plus `jsconfig.json` supplies editor signatures. | Keep as distinct runtime assets/contracts; do not merge into docs or examples. | `cmd/clawdesk/main.go` asset lookup, macOS app packaging, `docs-user-api/`, TypeScript tooling. |
| `.runtime/` | Ignored 3.4 GB local evidence/cache/build/test output. Producers already write runs, smoke, debug, and Runtime API evidence there. | Keep as disposable local output only; never commit or use as a stable fixture. No bulk cleanup of its shared contents in this change. | Scripts, runtime artifact writers, local debugging and evidence. |
| `dist/` and root `clawdesk` | `dist/` is ignored, rebuildable release cache. A current 42 MB root `clawdesk` executable was produced by the obsolete quickstart instruction and differs from the older `dist/clawdesk`. | Keep `dist/`; move the root executable into `dist/clawdesk` after recording its hash. Ignore `/clawdesk` so it cannot be committed again. | `Makefile`, macOS build/open/run scripts, quickstart. |
| `.archive/` | Tracked historical notes/reports plus untracked recovery snapshots and recent historical material. It must not be a second source tree or runtime dump. | Keep the root and its policy. Preserve the dated WeChat guide at `.archive/legacy-docs/wechat/testing-guide-2026-03-17.md`; retain other shared/untracked content untouched and decide any removal only after owner review and reference checks. | Historical research only; production and tests must not import it. |
| `.staging-sync/` | Absent now and ignored. Its only valid role is a short-lived local sync intermediate. | Keep absent/ignored; document the boundary. Never use it for regular output, fixtures, or history. | Synchronization workflow only. |
| `.hermes/`, `.omx/`, `.vscode/`, `.git/` | Local assistant/editor/Git state; `.hermes` and `.omx` are ignored. `.vscode` is small editor configuration. | Keep local state ignored; keep `.vscode` only for shareable editor configuration; never relocate Git metadata. | Local tooling/editor behavior only. |
| Legacy root names: `test/`, `fixtures/`, `artifacts/`, `temp/`, `assets/` | No active top-level directory exists for these names. A nested `third_party/robotgo/test/` belongs to the vendored module and is not a project test-root conflict. | Do not recreate any of them. Continue to route stable fixtures to `tests/<domain>/fixtures/`, generated output to `.runtime/`, and external manifests to `docs/research/external/`. | Tests, lifecycle documentation, `.gitignore`. |

## Main executable decision — evaluated last

The formal target is `cmd/clawdesk/main.go`, not root `main.go`. Latest
`origin/master` already has `cmd/clawdesk/main.go`, its command-local
`main_*_test.go` files, a `Makefile` that builds `./cmd/clawdesk`, and packaging,
smoke, and Runtime API scripts that use that command path. Its
`scripts/audit_repo_layout.sh` fails if root `main.go` or a root `*_test.go`
exists.

The current local command has now moved as a four-file unit to
`cmd/clawdesk/`: `main.go` and its three same-package tests. The local and
remote command implementations differ, so the move retains the local bytes and
does not copy or merge remote implementation. This resolves the root-layout
violation without changing Runtime, HTTP, Goja, timer, or desktop-automation
behavior. The remaining history reconciliation is a separate Git operation;
after that operation, run the formal `make audit-layout` from the integrated
tree. This working tree must run `go build ./cmd/clawdesk` and `go test
./cmd/clawdesk` now.

## Required checks after a future path move

For each nontrivial move: search old paths, patch consumers, search old paths
again, run `git diff --check`, build the primary entry into `.runtime/`, and run
only affected package/domain tests. Do not stage `.runtime/`, `dist/`, local
tool state, screenshots, logs, or generated smoke evidence.
