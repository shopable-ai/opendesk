# Repository Migration Map and P0 Batch

## Purpose

This document turns the layout policy into an execution-facing migration map for the current repository.

It focuses on:
- current path -> target path mapping
- path dependency hotspots
- a lowest-risk P0 migration batch
- what should wait until later because of code/docs coupling

This is not the full move execution yet. It is the controlled pre-migration layer.

## Current clutter concentrations

Observed high-noise areas:

- `artifacts/runs/` is the largest churn-heavy artifact subtree.
- `artifacts/external/` is already a meaningful preserved subtree and should stay under `artifacts/`.
- both `artifacts/golden-samples/` and `artifacts/golden_samples/` exist and should be unified.
- `temp/WeChatWeb/` is by far the largest temp subtree and behaves more like a disposable local workspace/cache than a canonical project directory.
- `temp/mac/` contains many screenshots, probes, and audit files that are runtime output, not source.
- root markdown status/report files are still part of the main project surface.

## Current -> target path mapping

### A. Runtime outputs

These are strong candidates for early migration.

| Current path | Target path | Reason | Priority |
|---|---|---|---|
| `artifacts/runs/` | `.runtime/runs/` | execution logs, summaries, snapshots, event streams | P0 |
| `artifacts/mcp-smoke/` | `.runtime/smoke/mcp/` | smoke output, screenshots, report residue | P0 |
| `artifacts/preflight/` | `.runtime/preflight/` | generated preflight results | P0 |
| `artifacts/browser_stack_finish/` | `.runtime/debug/browser_stack_finish/` | debug/test-result residue, not canonical fixtures | P0 |
| `artifacts/browser-stack-http-smoke/` | `.runtime/smoke/browser-stack-http/` | smoke-run output | P0 |
| `temp/mac/` | `.runtime/temp/mac/` | screenshots, probes, jsonl audit residue | P0 |
| `temp/e2e/` | `.runtime/temp/e2e/` | disposable e2e residue | P0 |
| `temp/qianniuShip/` | `.runtime/temp/qianniuShip/` | disposable test/debug residue | P0 |
| `temp/file/` | `.runtime/temp/file/` | temporary output | P0 |
| `temp/file-demo/` | `.runtime/temp/file-demo/` | temporary output | P0 |

### B. Reusable preserved artifacts

These should remain under `artifacts/`, but be normalized.

| Current path | Target path | Reason | Priority |
|---|---|---|---|
| `artifacts/external/` | keep | curated external references already match intended role | keep |
| `artifacts/golden-samples/` | `artifacts/fixtures/golden-samples/` | canonical reusable baseline assets | P0/P1 |
| `artifacts/golden_samples/` | merge into `artifacts/fixtures/golden-samples/` | duplicate naming style | P0/P1 |
| `artifacts/macos_v1/` | `artifacts/reports/macos_v1/` | preserved stage reports/audits, not runtime trash | P1 |
| `artifacts/dev-html-samples/` | `artifacts/fixtures/dev-html-samples/` or `docs/assets/dev-html-samples/` | preserved sample assets, not runtime logs | P1 |
| `artifacts/tests/` | review: `artifacts/fixtures/tests/` or `tests/fixtures/` | depends on whether these are reusable baselines or test-owned fixtures | P1 |
| `artifacts/playwright/` | review: `artifacts/reports/playwright/` or `.runtime/debug/playwright/` | role needs confirmation | P1 |

### C. Local development state

| Current path | Target path | Reason | Priority |
|---|---|---|---|
| `.venv-paddle-ocr/` | `.dev/venv/paddle-ocr/` | local environment state | P1 |
| `.playwright-cli/` | `.dev/playwright/cli/` | helper tool cache/state | P1 |
| `.playwright-mcp/` | `.dev/playwright/mcp/` | helper tool state | P1 |

### D. Historical/project-note markdown at root

| Current path | Target path | Reason | Priority |
|---|---|---|---|
| `STATUS_REPORT.md` | `.archive/reports/2026-03-status-report.md` | historical status report | P0 |
| `WEEK5_SUMMARY.md` | `.archive/reports/2026-03-week5-summary.md` | historical summary | P0 |
| `WEEK5_COMPLETION_REPORT.md` | `.archive/reports/2026-03-week5-completion-report.md` | historical summary | P0 |
| `IMPLEMENTATION_SUMMARY.md` | `.archive/reports/implementation-summary.md` | historical summary | P0 |
| `todo.md` | `.archive/notes/todo.md` or `docs/notes/todo.md` | depends on whether still active | P0 |

### E. Larger structural normalization candidates

These should not be moved in the first risky batch without dependency review.

| Current path | Target path | Reason | Priority |
|---|---|---|---|
| `docs-user-api/` | `docs/api/user/` | reduce naming ambiguity | P2 |
| `docs-api-user/` | merge into `docs/api/user/` or source-specific variant | likely overlap | P2 |
| `docs-api/` | `docs/api/internal/` or `docs/api/runtime/` | role clarification needed | P2 |
| `test/` | partial convergence toward `tests/` | requires dependency review | P2 |
| `temp/WeChatWeb/` | likely `.runtime/temp/WeChatWeb/` or separate external workspace path | very large subtree, likely special handling | P2 |

## Path dependency hotspots

The following live code/docs currently reference old runtime paths and must be checked before any move.

### High-confidence dependency points

1. `pkg/execution/artifacts.go`
- default runtime output root is currently `artifacts/runs/<executionId>`
- this is the primary implementation source that should eventually switch to `.runtime/runs/<executionId>`

2. `README.md`
- explicitly documents the default output path as `artifacts/runs/<executionId>/`

3. `QUICKSTART.md`
- references `artifacts/runs/<executionId>/`
- links to `STATUS_REPORT.md`

4. `config/wechat_structured_send_v2.config.example.json`
- contains:
  - `artifactRunRoot: artifacts/runs/...`
  - `sendAuditPath: temp/mac/...`
  - `regionReportPath: temp/mac/...`

5. `docs-api/testmonkey-http-api.md`
- example `logDir` points to `artifacts/runs/custom`

6. `docs-api-user/testmonkey-user-http-server-api.md`
- example `logDir` points to `artifacts/runs/custom`

7. `replays/round-01-minimal-loop.json`
- explicitly references:
  - `artifacts/preflight/latest.json`
  - `artifacts/runs/<run-id>/...`

### Generated artifacts that embed old paths

These do not block migration policy, but they mean old snapshots will continue to mention historical paths:
- old `summary.json`
- old `agent_summary.json`
- saved smoke output under `artifacts/browser_stack_finish/`
- `pkg/http/artifacts/runs/...` generated files

These should be treated as historical output, not as blockers.

## P0 low-risk migration batch

This is the recommended first real migration tranche after approval.

### P0-A: Add destination directories
Create only:
- `.runtime/runs/`
- `.runtime/temp/`
- `.runtime/smoke/`
- `.runtime/preflight/`
- `.runtime/debug/`
- `.archive/reports/`
- `.archive/notes/`
- `artifacts/fixtures/`

Low risk because it adds structure without moving behavior yet.

### P0-B: Archive root historical markdown
Move:
- `STATUS_REPORT.md`
- `WEEK5_SUMMARY.md`
- `WEEK5_COMPLETION_REPORT.md`
- `IMPLEMENTATION_SUMMARY.md`
- `todo.md` if confirmed non-active

Before move:
- update any links, especially `QUICKSTART.md`

Why low risk:
- mostly documentation/reference impact
- no runtime code behavior changes

### P0-C: Normalize preserved golden sample naming
Action:
- create canonical target: `artifacts/fixtures/golden-samples/`
- merge `artifacts/golden_samples/` into it
- migrate `artifacts/golden-samples/` into the same canonical location

Before move:
- search/patch references to both spellings

Why relatively low risk:
- narrower scope than runtime-root migration
- strong clarity gain

### P0-D: Move clearly disposable smoke/debug subtrees
Recommended first subtrees:
- `artifacts/mcp-smoke/` -> `.runtime/smoke/mcp/`
- `artifacts/preflight/` -> `.runtime/preflight/`
- `artifacts/browser-stack-http-smoke/` -> `.runtime/smoke/browser-stack-http/`
- `artifacts/browser_stack_finish/` -> `.runtime/debug/browser_stack_finish/`

Before move:
- patch docs/scripts/config references if any

Why still acceptable in P0:
- these are obviously generated/debug-oriented
- smaller dependency surface than `artifacts/runs/`

## What should NOT be in the first migration batch

### 1. `artifacts/runs/`
Do not move first until implementation and doc references are patched together.

Reason:
- runtime code defaults point here
- docs, configs, and replay specs point here
- moving without changing generators will create immediate drift

### 2. `temp/WeChatWeb/`
Do not move first.

Reason:
- huge subtree
- likely contains a quasi-workspace, local npm state, and browser assets
- deserves classification first: disposable temp clone vs active experiment workspace

### 3. docs tree convergence
Do not merge `docs-user-api`, `docs-api`, `docs-api-user` in P0.

Reason:
- possible external publishing/render pipeline dependencies
- needs slower normalization

### 4. `.venv-paddle-ocr` and Playwright tool directories
Do not move in the same batch as runtime path rewrites.

Reason:
- local tool path assumptions may exist
- better as a separate environment-cleanup tranche

## Recommended implementation order after this map

### Step 1
Create `.runtime/`, `.archive/`, and `artifacts/fixtures/` destination scaffolding.

### Step 2
Patch docs that reference root reports and historical markdown.

### Step 3
Move root historical markdown files into `.archive/`.

### Step 4
Patch references to `golden_samples` and `golden-samples`, then unify them under `artifacts/fixtures/golden-samples/`.

### Step 5
Patch references to smoke/preflight/debug subtrees, then move the P0 generated-output directories.

### Step 6
Only after that, tackle the larger runtime root migration:
- patch `pkg/execution/artifacts.go`
- patch docs/examples/configs/replays
- then move `artifacts/runs/` -> `.runtime/runs/`

## Success criteria for the first real migration batch

P0 is successful when:
- root historical markdown is out of the top-level surface
- duplicate golden-sample naming is resolved
- obvious smoke/debug/preflight outputs are removed from `artifacts/`
- the repository gains `.runtime/` and `.archive/` as visible lifecycle buckets
- no core runtime behavior is broken because `artifacts/runs/` was not moved prematurely
