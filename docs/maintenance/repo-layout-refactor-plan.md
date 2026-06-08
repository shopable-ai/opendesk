# Repository Layout Refactor Plan

## Goal

Reduce directory chaos in `testMonkey-go` by separating long-lived source assets from runtime outputs, local development environments, temporary captures, and historical reports.

This plan is intentionally practical for the current repository shape: it focuses on creating a durable file-lifecycle model first, then migrating noisy directories in stages without blocking active development.

## Why this is needed now

Current repository inspection shows the largest clutter sources are not core source directories but runtime and environment spillover:

- `temp/` contains a very large amount of execution residue and screenshots.
- `artifacts/` mixes reusable fixtures, external references, reports, and ephemeral run logs.
- `.venv-paddle-ocr/`, `.playwright-cli/`, `.playwright-mcp/` live directly in the repo surface.
- top-level historical markdown files such as `STATUS_REPORT.md`, `WEEK5_SUMMARY.md`, `WEEK5_COMPLETION_REPORT.md`, and `IMPLEMENTATION_SUMMARY.md` break the main project view.
- docs and test surfaces are split across overlapping names such as `docs-user-api`, `docs-api`, `docs-api-user`, `test`, and `tests`.

The result is that the repository does not clearly communicate:

1. what is source of truth
2. what is generated runtime output
3. what is local-only environment state
4. what is historical reference material

## Target layout

Preferred top-level steady-state shape:

```text
/
  cmd/
  pkg/
  automation/
  scripts/
  examples/
  docs/
  schemas/
  polyfills/
  types/
  config/
  tests/
  dist/
  artifacts/
    fixtures/
    external/
    reports/
  .runtime/
    runs/
    temp/
    smoke/
    preflight/
    debug/
    captures/
  .dev/
    venv/
    playwright/
  .archive/
    reports/
    notes/
    legacy-docs/
```

Notes:
- `artifacts/` should hold reusable or intentionally preserved outputs.
- `.runtime/` should hold disposable execution outputs.
- `.dev/` should hold local environment/tooling state that should not dominate the repo.
- `.archive/` should hold historical reports and legacy documents not needed in the main source surface.

## File-lifecycle policy

Every new file should fall into one of these buckets:

### 1. Source
Long-lived maintained project code or canonical docs.

Examples:
- `pkg/`
- `automation/`
- `cmd/`
- `docs/`
- `schemas/`
- `scripts/`

### 2. Reusable asset
Reusable baselines, golden samples, structured references, external curated references.

Examples:
- `artifacts/fixtures/`
- `artifacts/external/`
- `artifacts/reports/`

### 3. Runtime output
Generated during runs, debugging, smoke tests, captures, logs, or AI execution.

Examples:
- screenshots
- `stdout.log`
- `stderr.log`
- `summary.json`
- `agent_summary.json`
- `events.ndjson`
- probe JSON/PNG files

These belong in `.runtime/`.

### 4. Local environment state
Developer-local venvs, tool caches, browser helper assets.

These belong in `.dev/`.

### 5. Historical material
Stage reports, one-time summaries, outdated but potentially useful design notes.

These belong in `.archive/`.

## Staged migration plan

### Phase 1: Create the directory policy surface

Objective: add explicit governance before moving lots of files.

Files to create:
- `docs/maintenance/repo-layout-refactor-plan.md`
- `docs/maintenance/repo-file-lifecycle-policy.md`
- `scripts/audit_repo_layout.sh`

Verification:
- documents clearly explain where new files should go
- audit script provides a quick layout summary for future hygiene checks

### Phase 2: Move runtime noise out of the main surface

Objective: isolate disposable run outputs.

Planned moves:
- `temp/` -> `.runtime/temp/`
- `artifacts/runs/` -> `.runtime/runs/`
- `artifacts/mcp-smoke/` -> `.runtime/smoke/`
- `artifacts/preflight/` -> `.runtime/preflight/`
- `artifacts/browser_stack_finish/` -> `.runtime/debug/browser_stack_finish/`

Additional rule:
- any new screenshot/probe/log output should default to `.runtime/`, not `docs/`, root, or `examples/`.

Risk:
- scripts or docs may hardcode old paths.

Mitigation:
- search for path references before moving
- migrate in one tranche per subtree
- add compatibility notes in docs if needed

### Phase 3: Separate reusable assets from disposable outputs

Objective: keep `artifacts/` meaningful.

Planned structure:
- `artifacts/fixtures/` for golden samples / baselines
- `artifacts/external/` for curated reference repos
- `artifacts/reports/` for intentionally preserved reports

Specific cleanup:
- merge `artifacts/golden-samples` and `artifacts/golden_samples` into one canonical path, preferably `artifacts/fixtures/golden-samples/`

Verification:
- `artifacts/` should no longer contain high-churn run logs
- reusable sample assets should be clearly distinguished from debug residue

### Phase 4: Move local development environments out of the primary repo view

Objective: reduce non-source file dominance.

Planned moves:
- `.venv-paddle-ocr/` -> `.dev/venv/paddle-ocr/`
- `.playwright-cli/` -> `.dev/playwright/cli/`
- `.playwright-mcp/` -> `.dev/playwright/mcp/`

Caution:
- if scripts assume current relative paths, update them in the same change.
- if some tooling strongly expects a top-level venv name, either keep a documented symlink strategy or defer until script references are updated.

### Phase 5: Archive historical top-level markdown files

Objective: restore a clean root project view.

Planned moves:
- `STATUS_REPORT.md` -> `.archive/reports/2026-03-status-report.md`
- `WEEK5_SUMMARY.md` -> `.archive/reports/2026-03-week5-summary.md`
- `WEEK5_COMPLETION_REPORT.md` -> `.archive/reports/2026-03-week5-completion-report.md`
- `IMPLEMENTATION_SUMMARY.md` -> `.archive/reports/implementation-summary.md`
- `todo.md` -> `.archive/notes/todo.md` or `docs/notes/todo.md` depending on whether it remains active

Rule after migration:
- no new phase-summary markdown files should be created in the repo root.

### Phase 6: Normalize docs structure

Objective: reduce naming ambiguity and duplicate surfaces.

Current ambiguity:
- `docs-user-api`
- `docs-api`
- `docs-api-user`
- `docs/`

Preferred direction:
- converge toward `docs/api/user/`
- use `docs/api/internal/` or `docs/api/runtime/` where needed
- keep maintenance material under `docs/maintenance/`
- keep architecture under `docs/architecture/`
- move one-off research into `docs/research/` or `.archive/legacy-docs/`

Important constraint:
- because some of these doc trees may feed external tooling or Editme flows, normalize only after checking build/render dependencies.

### Phase 7: Normalize tests and examples

Objective: separate package tests from script/e2e/manual flows.

Preferred direction:
- keep Go `_test.go` files near their packages
- consolidate script/e2e/manual verification under `tests/`
- likely move `test/wechat/` toward `tests/wechat/` after dependency checks

For examples:
- keep true examples under `examples/`
- move throwaway probes/temporary experiments out of `examples/` if they are not user-facing
- if needed, add an `experiments/` directory or a dedicated subtree under `.runtime/debug/`

## Exact first implementation batch

This first batch should be non-destructive and create the governance layer only.

### Files to add now
1. `docs/maintenance/repo-layout-refactor-plan.md`
2. `docs/maintenance/repo-file-lifecycle-policy.md`
3. `scripts/audit_repo_layout.sh`

### What the audit script should report
- top-level file and directory counts
- large noisy directories such as `temp`, `artifacts`, `.venv-*`, `.playwright-*`
- root markdown files that should be reviewed for archive/migration
- duplicate naming patterns such as `golden-samples` vs `golden_samples`
- counts of runtime-style files like `.png`, `.log`, `.ndjson`, `.json` under temp/output zones

## Likely files to inspect before Phase 2 path moves

These are likely to contain path assumptions and should be checked before moving runtime directories:
- `pkg/execution/artifacts.go`
- `README.md`
- `scripts/run_macos_stable.sh`
- `scripts/test_agent_direct_execution.sh`
- `scripts/test_agent_direct_execution_user_mode.sh`
- `scripts/e2e_smoke.sh`
- docs under `docs/maintenance/`, `docs/mcp/`, `docs/browser-automation-*`
- examples that mention artifact or temp paths

## Validation approach

For the governance-doc phase:
- confirm documents exist and are internally consistent
- run `scripts/audit_repo_layout.sh`
- ensure the script exits successfully on macOS shell

For later migration phases:
- search repo for old path references before moves
- move one subtree at a time
- rerun targeted tests/scripts after each path migration
- verify docs and example commands still point to correct locations

## Risks and tradeoffs

### Risk 1: path breakage
Many scripts and docs likely assume current runtime paths.

Mitigation:
- move generated-output trees in stages
- grep/search references before each move
- if needed, keep short-lived compatibility notes or wrappers during transition

### Risk 2: over-normalizing docs too early
Some doc trees may exist because of external render pipelines.

Mitigation:
- defer doc-tree merge until dependency mapping is complete
- document canonical target structure first, then migrate carefully

### Risk 3: mixing archive and active documents
Some top-level markdown files may still be actively referenced.

Mitigation:
- check references first
- if uncertain, move to `docs/maintenance/legacy/` before final archive placement

## Recommended execution order

1. add governance docs and audit script
2. run audit script and confirm it reflects the current mess accurately
3. inspect path references for runtime output directories
4. migrate `.runtime/` targets first
5. split `artifacts/` into reusable assets vs runtime residue
6. relocate `.dev/` tool/environment directories
7. archive root historical markdown
8. normalize docs/tests/examples only after dependency checks

## Success criteria

The refactor is successful when:
- the repo root is mostly source and core project entrypoints
- runtime output no longer dominates the visible working surface
- `artifacts/` means reusable assets, not generic dump zone
- new files have an obvious destination based on lifecycle
- future AI-assisted runs default to `.runtime/` rather than scattering files across the repo
