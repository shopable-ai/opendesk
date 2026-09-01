# Repository Layout Refactor Plan

## Status

This plan is active, but several earlier assumptions have been superseded by later repository cleanup.

Most importantly:

```text
docs/          = project and engineering documentation
docs/api/ = sole maintained user API documentation root
```

The historical API trees `docs-api/`, `docs-api-user/` and `docs/api/` have been retired. **Do not recreate them and do not move `docs/api/` into `docs/api/user/`.**

For the current docs cleanup, also use:

- `docs/README.md`
- `docs/maintenance/docs-migration-map.md`
- `docs/maintenance/repository-documentation-map.md`
- `docs/maintenance/repo-file-lifecycle-policy.md`

## Goal

Reduce repository and documentation chaos by separating:

1. maintained source and canonical documentation;
2. reusable fixtures and reports;
3. generated runtime output;
4. local development state;
5. reusable prompts;
6. historical material;
7. low-value intermediate work that should be deleted after extraction.

The refactor should improve clarity without breaking active code, scripts, external documentation publishing or test flows.

## Why this is needed

The repository has accumulated several different classes of material in the same visible surfaces:

- runtime screenshots, logs and probe output;
- reusable golden samples and baselines;
- local Playwright/OCR environments;
- historical project reports;
- research and option documents;
- prompts and handoff files;
- canonical engineering documentation;
- scenario-specific material such as WeChat/browser automation;
- `docs/` root files that use `_V2`, `FINAL`, `COMPLETE_SUMMARY` and similar history-oriented names.

This makes it difficult to determine:

- what is the current Source of Truth;
- which files are generated versus maintained;
- which documents are current versus historical;
- which reports are evidence versus engineering guidance;
- where a new AI-assisted task should write its output.

## Target top-level repository layout

Preferred steady-state shape:

```text
/
  README.md
  QUICKSTART.md
  cmd/
  pkg/
  automation/
  scripts/
  examples/
  docs/
  docs/api/
  schemas/
  polyfills/
  types/
  tests/
  dist/
  tests/<domain>/fixtures/
  docs/quality/<domain>/
  docs/research/external/
  prompts/
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

- Reusable assets live under the owning `tests/<domain>/fixtures/` directory.
- Durable quality conclusions live under `docs/quality/<domain>/`.
- External provenance manifests live under `docs/research/external/`.
- `.runtime/` is for disposable execution output.
- `.dev/` is for local environment/tooling state.
- `.archive/` is for historically valuable superseded material, not a generic dump zone.
- `prompts/` is only for reusable prompts that the repository intentionally maintains.
- `docs/api/` remains independent from project engineering docs.

## Target `docs/` layout

The project-document surface should converge toward:

```text
docs/
├── README.md
├── project/
├── architecture/
│   ├── execution/
│   ├── desktop-automation/
│   ├── browser-automation/
│   └── decisions/
├── implementation/
│   ├── macos/
│   ├── layout/
│   ├── ocr/
│   └── runtime/
├── quality/
│   └── review/
├── integrations/
│   └── mcp/
├── scenarios/
│   ├── wechat/
│   └── discuz/
├── research/
├── plans/
└── maintenance/
```

The current 61 direct files under `docs/` are mapped individually in `docs/maintenance/docs-migration-map.md`.

## File lifecycle model

Every new file should fall into one of these classes.

### 1. Canonical source / documentation

Long-lived maintained code or Source-of-Truth docs.

Examples:

- `pkg/`
- `automation/`
- `cmd/`
- classified subtrees under `docs/`
- `docs/api/` for user API facts

### 2. Domain-owned test asset or evidence

Examples:

- `tests/<domain>/fixtures/`
- `docs/quality/<domain>/`

### 3. Runtime output

Examples:

- screenshots
- logs
- event streams
- smoke/preflight output
- temporary JSON/PNG captures

Destination:

- `.runtime/`

### 4. Local environment state

Destination:

- `.dev/`

### 5. Reusable prompt

Destination:

- `prompts/`

Do not leave execution prompts in `docs/` merely because a task used them.

### 6. Historical material

Destination:

- `.archive/`

Only preserve history with real traceability value.

### 7. Low-value superseded intermediate material

Action:

- extract unique facts;
- merge them into the current canonical document;
- delete the old file;
- rely on Git history.

## Staged migration plan

### Phase 0: Documentation governance baseline

Status: **in progress / first batch implemented**.

Implemented governance surface:

- `docs/README.md`
- `docs/maintenance/docs-migration-map.md`
- updated `repo-file-lifecycle-policy.md`
- updated repository layout/migration guidance to preserve `docs/api/` as canonical API root

P0 intentionally avoids bulk file moves.

### Phase 1: Low-semantic-risk docs migration

Objective:

- move/rename current documents into topic/lifecycle subtrees;
- update references in the same batch;
- avoid changing document meaning unless required for link correctness.

Recommended topic order:

1. quality core;
2. browser automation;
3. macOS implementation;
4. desktop automation architecture/research;
5. WeChat scenario;
6. layout research/reports;
7. MCP integration;
8. remaining project/execution docs.

Use `docs/maintenance/docs-migration-map.md` as the exact source-to-target list.

### Phase 2: Semantic deduplication

Objective:

- eliminate competing Sources of Truth;
- merge V2/FINAL/summary clusters;
- separate reports and prompts from canonical docs;
- archive only material with real historical value.

Priority clusters:

```text
GATES_AND_EVIDENCE.md
GATES_AND_EVIDENCE_V2.md
GOLDEN_GATES.md

FINAL_SUMMARY.md
FINAL_STATUS_REPORT.md
PROJECT_COMPLETE_SUMMARY.md
LAYOUT_IMPROVEMENTS.md
layout_improvement_implementation.md

GOLDEN_SAMPLE_STRATEGY.md
GOLDEN_SAMPLE_STRATEGY_REVIEW_20260405.md
LANGGRAPH_GOLDEN_SAMPLE_GRAPH_20260405.md
docs/golden_sample_strategy/
```

### Phase 3: Runtime-output cleanup

Objective:

- move generated output out of source and artifact surfaces;
- patch producers before moving high-coupling directories.

Strong candidates:

```text
legacy generated paths           -> .runtime/smoke/ or .runtime/debug/
temp/mac/                         -> .runtime/temp/mac/
temp/e2e/                         -> .runtime/temp/e2e/
```

Do not move `.runtime/runs/` until implementation, docs, configs and replay references are patched together.

### Phase 4: Domain ownership normalization

Objective:

- remove the generic `artifacts/` namespace and place every maintained asset with its owner.

Preferred normalization:

```text
artifacts/opencv/image-color/
    -> tests/opencv/fixtures/image-color/
test/wechat/fixtures/golden-samples/
    -> tests/wechat/fixtures/golden-samples/
docs/quality/<domain>/
    -> docs/quality/<domain>/
```

Review other artifact subtrees individually before moving them.

### Phase 5: Local environment cleanup

Candidate moves:

```text
.venv-paddle-ocr/ -> .dev/venv/paddle-ocr/
.playwright-cli/  -> .dev/playwright/cli/
.playwright-mcp/  -> .dev/playwright/mcp/
```

Patch local scripts and assumptions in the same tranche.

### Phase 6: Historical root cleanup

Historical repository-root markdown should not remain mixed with active entrypoints.

Before any move:

- confirm the file still exists;
- search current references;
- decide whether it deserves archive or deletion.

No new phase-summary markdown should be created at repository root.

### Phase 7: Tests and examples normalization

Preferred direction:

- keep Go `_test.go` files near packages;
- consolidate script/e2e/manual verification under `tests/` where appropriate;
- keep true user/developer examples under `examples/`;
- move disposable probes to `.runtime/debug/`.

## API documentation rule — supersedes older plan text

Earlier drafts proposed converging API docs to `docs/api/user/`. That direction is retired.

Current rule:

```text
docs/api/ = keep and maintain
```

Retired:

```text
docs-api/
docs-api-user/
docs/api/
```

If historical wording from retired trees is useful, verify it against current source/runtime and migrate the fact into `docs/api/`; do not restore the old tree.

## Validation approach

For docs moves:

```text
search old path
-> create target
-> update references
-> verify target
-> remove old path
-> search old path again
```

For runtime/artifact moves:

- identify producer code and config defaults first;
- patch producer and consumers together;
- run targeted tests/smoke checks after each subtree migration.

For semantic merges:

- compare overlapping files;
- validate still-current claims against code/tests where relevant;
- preserve only unique facts, decisions and evidence.

## Risks

### Risk 1: path breakage

Mitigation:

- migrate one topic/subtree at a time;
- patch references before deletion;
- verify repository search no longer finds live old paths.

### Risk 2: turning archive into another junk drawer

Mitigation:

- archive only material with real history/decision/evidence value;
- delete low-value intermediate AI output after extraction.

### Risk 3: research becoming accidental Source of Truth

Mitigation:

- formal decisions belong in architecture/decisions or canonical implementation docs;
- research remains explicitly non-authoritative.

### Risk 4: API documentation regression

Mitigation:

- keep `docs/api/` as the sole maintained user API root;
- reject reintroduction of `docs-api/`, `docs-api-user/` or `docs/api/`.

## Success criteria

The refactor is successful when:

- repository root is mostly source and real entrypoints;
- `docs/` root contains only `README.md` plus classified directories;
- `docs/api/` remains the sole user API documentation root;
- there is one current Source of Truth per engineering topic;
- prompts, reports and runtime output no longer compete with canonical docs;
- no generic `artifacts/` directory remains;
- every maintained test asset has an owning test directory;
- new files have an obvious lifecycle destination;
- repository searches find no live references to removed paths.
