# Local Commit And Sync Scope

## Current baseline

Repository root:
- `/Users/a0000/Documents/workspace/clawdesk`

Remote comparison result:
- `mac4g:~/Documents/workspace/clawdesk` is at the same `HEAD` commit as local
- remote tracked diff count is `0`
- remote has many untracked files, but no evidence of independent tracked code work

Conclusion:
- current local machine is the code source of truth
- remote machine should be treated as a stale working copy, not as an authoritative branch of development

## Local worktree classification

### A. Tracked modified code already in progress

Key tracked modified files:
- `main.go`
- `automation/browser.go`
- `automation/clipboard.go`
- `automation/console.go`
- `automation/imageColor.go`
- `automation/page.go`
- `automation/screen.go`
- `automation/script_engine.go`
- `automation/types.go`
- `automation/utils.go`
- `go.mod`
- `go.sum`
- `polyfills/000-page.js`
- `types/ImageColor.d.ts`
- `types/Screen.d.ts`
- `types/page.d.ts`
- `README.md`

Interpretation:
- this is not a docs-only dirty tree
- there is real code evolution in progress and it must be handled before syncing to the remote machine

### B. Untracked source trees that look like real project code

High-confidence source-like additions:
- `pkg/http/`
- `pkg/mcpserver/`
- `pkg/runtime/`
- `pkg/semanticexec/`
- `pkg/execution/`
- `pkg/container/`
- `pkg/operator/`
- `pkg/benchmark/`
- `pkg/visionrun/`
- `pkg/feature/`
- `cmd/visionrun/`
- `cmd/semantic-maintenance/`
- multiple new `automation/*.go` files
- `scripts/*.sh` and several `scripts/*.js` support tools
- `docs/`, `docs-user-api/`, `docs-api/`, `docs-api-user/`

Interpretation:
- these are not just runtime leftovers
- they represent an expanded project surface that likely belongs in version control, but should not all be committed as one undifferentiated batch

### C. High-noise or generated material that should not drive commit scope

Examples:
- `.runtime/`
- `.hermes/`
- `.omx/`
- `.playwright-cli/`
- `.playwright-mcp/`
- `.runtime/tests/automation/image-layout/`
- `test_images_output/`
- `coverage.out`
- png output files and ad hoc result dumps

## Cleanup already applied

### `.gitignore`

The ignore file was expanded so commit scoping is less distorted by local-only state.

Newly ignored classes include:
- `.DS_Store`
- `.hermes/`
- `.omx/`
- `.playwright-cli/`
- `.playwright-mcp/`
- `.runtime/`
- `dist/`
- `coverage.out`
- `__pycache__/`
- generated image/test output paths

### Documentation map

Added:
- `docs/maintenance/repository-documentation-map.md`

Purpose:
- mark `docs/` as the primary documentation tree
- mark `docs-user-api/`, `docs-api/`, and `docs-api-user/` as transitional or historical trees
- reduce future sync confusion

## Verification status

### Passing targeted Go packages

Verified with:
- `go test ./pkg/http ./pkg/mcpserver ./pkg/runtime ./pkg/semanticexec ./pkg/execution ./pkg/container`

Result:
- pass

### Partially failing packages

Verified with:
- `go test ./automation/...`
- `go test ./pkg/visionrun ./pkg/operator ./pkg/benchmark`

Observed failures:
- `automation`: `TestLevel7_MixedContent` failing in image layout progressive tests
- `pkg/visionrun`: tests still reference old path `/Users/a0000/Documents/workspace/testMonkey-go` and one send-safety test expects a missing `capture_contract.json`

Interpretation:
- core execution and service layers are in better shape than the higher-level visual validation surface
- a single mega-commit would mix stable platform work with known failing advanced workflow areas

## Recommended commit batching

### Batch 1: foundational runtime and service layer

Highest-confidence slice:
- tracked modifications in `main.go`, selected `automation/*.go`, `go.mod`, `go.sum`, `polyfills/000-page.js`, `types/*.d.ts`
- untracked packages that already pass targeted tests:
  - `pkg/http/`
  - `pkg/mcpserver/`
  - `pkg/runtime/`
  - `pkg/semanticexec/`
  - `pkg/execution/`
  - `pkg/container/`
  - `pkg/operator/`
  - `pkg/benchmark/`
- related command entrypoints as needed

Goal:
- establish the expanded runtime / HTTP / MCP service layer in a verifiable commit

### Batch 2: documentation and runbook layer

Scope:
- `docs/`
- `docs-user-api/`
- `docs-api/`
- `docs-api-user/`
- `QUICKSTART.md`
- `.archive/notes/handoffs/project-handoff-prompt.md`
- selected operator docs and maintenance docs

Goal:
- keep the large docs surface out of the core runtime commit
- allow later sync without forcing code reviewers to parse hundreds of doc files inside one mixed commit

### Batch 3: advanced visual pipeline and remaining automation surface

Scope:
- `pkg/visionrun/`
- new image/layout/vision automation files
- visual tests and advanced examples

Gate:
- should be handled only after the currently failing tests are either fixed or explicitly quarantined

## Sync recommendation for mac4g

Do not sync the full dirty tree immediately.

Preferred order:
1. form at least Batch 1 as a clean local commit
2. optionally form Batch 2 as a separate commit
3. sync the committed state to `mac4g`
4. only then decide whether to copy non-versioned artifacts or local fixtures

## Practical next action

Next best step:
- build the exact file list for Batch 1
- run one more targeted verification for that staged slice
- create a scoped commit without pulling in docs noise or unstable visionrun work
