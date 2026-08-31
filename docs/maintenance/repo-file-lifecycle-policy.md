# Repository File Lifecycle Policy

## Purpose

This repository needs explicit rules for where files belong.

Without lifecycle rules, AI-assisted development and repeated debugging produce large amounts of screenshots, logs, probe files, reports, temporary scripts, prompts, research notes and phase summaries that quickly pollute the maintained project surface.

This policy defines the canonical destination for each file class and the authority boundary between project documentation and user API documentation.

## Canonical documentation roots

Clawdesk currently has two maintained documentation roles:

- `docs/` — project and engineering documentation.
- `docs-user-api/` — **sole maintained user API documentation root**.

Retired API documentation trees:

- `docs-api/`
- `docs-api-user/`
- `docs/api/`

Do not recreate the retired trees as parallel sources of truth.

For API facts, use this priority:

1. current source/runtime behavior
2. `docs-user-api/runtime-api.ai.json`
3. `docs-user-api/*.md`
4. Git history

For project architecture, implementation and quality facts:

1. current canonical documents under `docs/`
2. current source/test/runtime evidence
3. research and plans
4. archive/Git history

## Canonical lifecycle buckets

### A. Source of truth

Use for maintained code, canonical engineering docs and project-owned assets.

Examples:

- `cmd/`
- `pkg/`
- `automation/`
- `scripts/`
- `examples/` for real maintained examples
- `docs/`
- `docs-user-api/`
- `schemas/`
- `polyfills/`
- `types/`

Rule:

- if a file must be versioned, maintained, reviewed and understood by future developers, it may belong here;
- being Markdown does **not** automatically make a file canonical documentation.

### B. Domain-owned test assets and reports

Reusable material belongs to the domain that consumes it. The repository does
not use a generic top-level `artifacts/` bucket.

Canonical paths:

- `tests/<domain>/fixtures/` — stable test inputs, golden samples and expected baselines
- `tests/<domain>/reports/` — test-specific maintained reports when they are part of the test package
- `docs/quality/<domain>/` — formal quality, validation and review conclusions
- `docs/research/external/` — external source manifests and provenance

Use these locations only for material that is stable, reviewable and owned by
the corresponding domain. A test fixture must not depend on a disposable run
directory.

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

- if you are unsure whether generated output deserves long-term preservation, put it in `.runtime/` first.

Promotion rule:

- only promote runtime output into an owning test fixture or canonical quality
  document after review establishes durable value.

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
- local browser/MCP helper state

Rule:

- these files should not dominate the repository root or masquerade as project source.

### E. Historical and archival material

Use for superseded material that remains worth preserving.

Canonical path root:

- `.archive/`

Suggested subpaths:

- `.archive/reports/`
- `.archive/notes/`
- `.archive/legacy-docs/`

Use this for:

- phase completion reports
- old status docs
- superseded architecture or policy documents with historical value
- old plans that matter for decision traceability

Do **not** archive everything automatically. Low-value intermediate AI output should normally be deleted after useful facts are merged because Git history already preserves it.

### F. Prompts

Reusable AI prompts are a separate lifecycle class from canonical engineering documentation.

Preferred root when the repository intentionally maintains prompts:

- `prompts/`

Examples:

- reusable execution prompts
- domain inference/review prompts
- task-generation prompts with stable input/output contracts

Rules:

- prompts should not live in `docs/` merely because they were used during development;
- one-time prompts can be deleted after the task if they provide no reusable value;
- historically useful handoff and dated strategy prompts belong under `.archive/notes/`, not `prompts/`;
- prompts that encode an actual engineering rule should have that rule separately represented in canonical documentation.

## Internal `docs/` information architecture

The target project-document structure is:

```text
docs/
  README.md
  project/
  architecture/
    execution/
    desktop-automation/
    browser-automation/
    decisions/
  implementation/
    macos/
    layout/
    ocr/
    runtime/
  quality/
    review/
  integrations/
    mcp/
  scenarios/
    wechat/
    discuz/
  research/
  plans/
  maintenance/
```

Directory rules:

- `project/` — project overview, current context, operator entrypoints.
- `architecture/` — current system design and decisions.
- `implementation/` — current implementation guides and platform details.
- `quality/` — gates, tests, failure taxonomy, review rules.
- `integrations/` — integration-specific maintained documentation.
- `scenarios/` — application/scenario-specific maintained requirements and execution specs.
- `research/` — decision inputs, comparisons, exploratory analysis.
- `plans/` — active plans and roadmaps only.
- `maintenance/` — repository and documentation governance.

`docs/` root should converge to `README.md` plus classified directories, not remain a flat worklog.

## Routing rules

When creating or touching a file, decide using this order:

1. Is it maintained project code or canonical project documentation?
   - source areas or `docs/`
2. Is it maintained user-facing API documentation?
   - `docs-user-api/`
3. Is it a stable reusable fixture or report?
   - owning `tests/**/fixtures/`, `tests/**/reports/` or `docs/quality/`
4. Is it generated during execution, debugging, probing or smoke testing?
   - `.runtime/`
5. Is it local environment/tool state?
   - `.dev/`
6. Is it a reusable prompt?
   - `prompts/`
7. Is it old but historically useful?
   - `.archive/`
8. Is it low-value superseded intermediate material?
   - extract unique value and delete; rely on Git history

## Repository root rules

Allowed at repository root:

- true project entrypoints
- root build/config files such as `go.mod`, `go.sum`
- project README / quickstart when intentionally maintained
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

### Documentation root names

Use the two established roots:

- `docs/`
- `docs-user-api/`

Do not recreate:

- `docs-api/`
- `docs-api-user/`
- `docs/api/`

### Canonical document filenames

Prefer semantic, unversioned kebab-case names:

```text
action-target-model.md
failure-taxonomy.md
testing-guide.md
```

Avoid using filenames as version control:

```text
*_V2.md
*_V3.md
FINAL_*.md
*_COMPLETE_SUMMARY.md
```

Update the canonical file; Git owns historical versions.

### Time-scoped material

Research, plans and reports may use a date when the time context matters:

```text
2026-08-31-topic.md
2026-08-31-topic-report.md
```

### Prefer one canonical spelling

If two paths differ only by naming style, converge to one.

Example:

- choose one canonical form for `golden-samples` vs `golden_samples`.

## Examples

### Example 1: new smoke run output

Generated files:

- screenshot PNG
- `summary.json`
- `stdout.log`

Destination:

- `.runtime/smoke/...`

### Example 2: verified stable golden image baseline

Destination:

- owning test package, for example `tests/opencv/fixtures/...`

### Example 3: temporary experiment script

If short-lived:

- `.runtime/debug/...`

If promoted to a maintained example:

- `examples/...`

### Example 4: project stage completion memo

If evidence matters historically:

- `.archive/reports/...` or `docs/quality/<domain>/...` depending on whether it is a narrative history or a maintained quality conclusion.

If it contains no unique durable value:

- merge useful facts and delete it.

### Example 5: user-visible API page

Destination:

- `docs-user-api/`

Not:

- `docs/api/`
- `docs-api/`
- `docs-api-user/`

### Example 6: one-time implementation prompt

If reusable:

- `prompts/...`

If not reusable:

- remove after completion rather than leaving it in `docs/`.

## Promotion and cleanup model

Lifecycle should generally be:

```text
.runtime output
  -> reviewed
  -> promoted to an owning test fixture or docs/quality report if reusable
  -> otherwise disposable

research/options
  -> decision
  -> canonical architecture/implementation
  -> old intermediate material archived only when historically valuable

prompt
  -> reusable prompts/ asset OR deleted after task
```

Do not skip directly from ad hoc execution to scattering files into root or `docs/`.

## Enforcement

Recommended checks:

- keep and use `scripts/audit_repo_layout.sh`;
- consult `docs/README.md` before creating new project docs;
- consult `docs/maintenance/docs-migration-map.md` while the current docs cleanup is in progress;
- run periodic repository layout audits;
- search references before moving maintained files;
- update docs/examples when output paths intentionally change.

## Default bias

When in doubt:

- user API -> `docs-user-api/`
- canonical project knowledge -> classified subtree under `docs/`
- research -> `docs/research/`
- active plan -> `docs/plans/`
- reusable test asset -> owning `tests/**/fixtures/`
- durable quality conclusion -> `docs/quality/<domain>/`
- runtime/debugging output -> `.runtime/`
- reusable prompt -> `prompts/`
- local tool state -> `.dev/`
- valuable history -> `.archive/`
- low-value superseded intermediate material -> delete after merge
