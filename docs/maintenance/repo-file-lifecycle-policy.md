# Repository File Lifecycle Policy

## Purpose

This repository needs explicit rules for where files belong.

Without lifecycle rules, AI-assisted development and repeated debugging produce large amounts of screenshots, logs, probe files, reports, and temporary scripts that quickly pollute the main project surface.

This policy defines the canonical destination for each file class.

## Canonical buckets

### A. Source of truth
Use for maintained code, stable docs, and project-owned assets.

Examples:
- `cmd/`
- `pkg/`
- `automation/`
- `scripts/`
- `examples/` for real examples
- `docs/`
- `schemas/`
- `polyfills/`
- `types/`
- `config/`

Rule:
- if a file must be versioned, maintained, reviewed, and understood by future developers, it probably belongs here.

### B. Reusable preserved artifacts
Use for durable sample assets and intentionally preserved references.

Canonical paths:
- `artifacts/fixtures/`
- `artifacts/external/`
- `artifacts/reports/`

Use this for:
- golden samples
- stable baselines
- curated external reference repos
- reports intentionally kept for future comparison

Do not use this for:
- every debug run
- ad hoc screenshots
- smoke logs
- transient execution output

### C. Runtime output
Use for generated outputs that are disposable unless later promoted.

Canonical path root:
- `.runtime/`

Suggested subpaths:
- `.runtime/runs/`
- `.runtime/temp/`
- `.runtime/smoke/`
- `.runtime/preflight/`
- `.runtime/debug/`
- `.runtime/captures/`

Use this for:
- `stdout.log`
- `stderr.log`
- `summary.json`
- `agent_summary.json`
- `events.ndjson`
- screenshots
- probe `.json` files
- smoke test output
- temporary captures
- AI-generated intermediate files not yet promoted

Default rule:
- if you are unsure whether an output deserves long-term preservation, put it in `.runtime/` first.

Promotion rule:
- only move a runtime file into `artifacts/` or `docs/` if it becomes a stable fixture, a reusable baseline, or a document-owned asset.

### D. Local development environment state
Use for machine-local tool state and environments.

Canonical path root:
- `.dev/`

Suggested subpaths:
- `.dev/venv/`
- `.dev/playwright/`

Use this for:
- local Python virtual environments
- local helper tooling caches
- local browser/mcp helper state

Rule:
- these files should not dominate the repository root or masquerade as project source.

### E. Historical and archival material
Use for old reports and superseded but potentially useful notes.

Canonical path root:
- `.archive/`

Suggested subpaths:
- `.archive/reports/`
- `.archive/notes/`
- `.archive/legacy-docs/`

Use this for:
- phase completion reports
- old status docs
- one-time analysis summaries
- superseded plans not needed in the main project flow

Rule:
- root-level historical markdown should be migrated here unless it is still an active operator document.

## Routing rules

When creating or touching a file, decide using this order:

1. Is it maintained project code or canonical documentation?
   - put it in source areas
2. Is it a stable reusable fixture/reference/report?
   - put it in `artifacts/`
3. Is it generated during execution, debugging, probing, or smoke testing?
   - put it in `.runtime/`
4. Is it local environment/tooling state?
   - put it in `.dev/`
5. Is it old but possibly useful historical material?
   - put it in `.archive/`

## Root directory rules

Allowed at root:
- true project entrypoints
- root build/config files such as `go.mod`, `go.sum`
- project README
- a very small number of canonical top-level config files

Avoid placing at root:
- screenshots
- temporary scripts
- one-off reports
- phase summaries
- ad hoc test results
- runtime logs
- generated JSON reports

## Naming rules

### Prefer semantic lifecycle names over source-history names
Prefer:
- `docs/api/user/`
- `docs/api/internal/`
- `docs/maintenance/`

Avoid proliferating names like:
- `docs-user-api`
- `docs-api-user`
- `docs-api`

### Prefer one canonical spelling
If two paths differ only by naming style, converge to one.

Example:
- choose one canonical form for `golden-samples` vs `golden_samples`

## Examples

### Example 1: new smoke run output
Generated files:
- screenshot png
- `summary.json`
- `stdout.log`

Destination:
- `.runtime/smoke/...`

### Example 2: a verified stable golden image baseline
Destination:
- `artifacts/fixtures/...`

### Example 3: a temporary experiment script created during debugging
If short-lived:
- `.runtime/debug/...` or a dedicated experiments location

If promoted to a real example:
- `examples/...`

### Example 4: a project stage completion memo
Destination:
- `.archive/reports/...`

## Promotion and cleanup model

Lifecycle should generally be:

```text
.runtime output
  -> reviewed
  -> promoted to artifacts/fixtures or artifacts/reports if reusable
  -> otherwise remains disposable and can be cleaned later
```

Do not skip directly from ad hoc execution to scattering files into root or random subdirectories.

## Enforcement suggestions

Recommended follow-up:
- keep and use `scripts/audit_repo_layout.sh`
- run periodic repo layout audits
- check new output paths when adding scripts
- update docs/examples whenever output paths are intentionally changed

## Default bias

When in doubt:
- runtime/debugging output -> `.runtime/`
- local tool state -> `.dev/`
- historical markdown -> `.archive/`
- only stable maintained assets stay in the main source surface
