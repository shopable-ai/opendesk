# Docs Migration Completion Record

## Status

**Completed.**

This document records the 2026-08 cleanup of the OpenDesk project documentation surface.

Before cleanup, `docs/` contained **61 direct files** plus overlapping topic/process directories. Those files mixed:

- current architecture and implementation docs;
- research and option analysis;
- plans and roadmaps;
- test/review reports;
- reusable and one-off prompts;
- `V2`, `FINAL`, completion summaries and raw workpads.

The migration is now complete at the structural/lifecycle level.

## Result

Current top-level `docs/` shape:

```text
docs/
├── README.md
├── project/
├── architecture/
├── implementation/
├── quality/
├── integrations/
├── scenarios/
├── research/
├── plans/
└── maintenance/
```

There are no longer topic documents directly scattered in `docs/` root.

## Original 61-file plan

The original P0 inventory classified the 61 root files as:

| Planned action | Count |
|---|---:|
| MOVE | 41 |
| REPORT | 9 |
| MERGE | 5 |
| PROMPT | 3 |
| ARCHIVE | 2 |
| DELETE_AFTER_MERGE | 1 |
| **Total** | **61** |

The complete original per-file planning table remains available in Git history before this completion rewrite.

During P2, several destinations were deliberately refined after reading the contents and current source. The original migration map was therefore treated as a plan, not as immutable truth.

## Completed migration groups

### Project

Moved current project-level material into:

```text
docs/project/
```

including project overview, current context and runbook.

### Architecture

Current reusable architecture material now lives under:

```text
docs/architecture/desktop-automation/
docs/architecture/browser-automation/
docs/architecture/execution/
```

Desktop App Adapter Contract was promoted into the canonical desktop-automation architecture area.

The old runtime-pool / DI “implementation” report was not retained as current architecture and was archived instead.

### Implementation

Current implementation material now lives under:

```text
docs/implementation/layout/
docs/implementation/macos/
docs/implementation/ocr/
docs/implementation/runtime/
```

Notable semantic cleanup:

- `layout-recognition.md` was recalibrated against current `automation/image_layout.go`;
- current `cellColorMode` default is documented as `median`;
- current boundary score weights are documented as `0.40 / 0.25 / 0.35`;
- `trimmed` / `dominant` are no longer presented as distinct implemented algorithms when the current runtime falls back to mean for non-median modes.

### Quality

Quality material was consolidated under:

```text
docs/quality/
```

Key outcomes:

- bootstrap gate archived;
- V2 and Golden Gate rules merged into one canonical `gates-and-evidence.md`;
- failure taxonomy and failure cases moved under quality;
- reusable expert review / red-team material moved under `quality/review/`;
- one-time review output moved to `docs/quality/review/`;
- a reusable `blindspot-checklist.md` was extracted from the one-time blindspot audit;
- browser automation test/evidence material moved under `quality/browser-automation/`.

### Browser automation

Flat browser automation files were split by lifecycle:

```text
docs/architecture/browser-automation/
docs/quality/browser-automation/
docs/plans/browser-automation/
```

The capability evidence manifest was reassessed as a maintained quality/evidence index rather than a disposable generated report.

### WeChat

Scenario-owned material now lives under:

```text
docs/scenarios/wechat/
```

Research moved to:

```text
docs/research/wechat/
```

Historical test output moved to:

```text
docs/quality/wechat/
```

The reusable execution master prompt was reduced to a thin orchestration entrypoint and moved to:

```text
prompts/wechat/execution-master.md
```

It now references canonical docs instead of copying the whole architecture into a prompt.

### Layout project history

The following duplicate project-summary style files were removed from the current docs surface:

```text
FINAL_STATUS_REPORT.md
FINAL_SUMMARY.md
PROJECT_COMPLETE_SUMMARY.md
```

Their useful historical result was consolidated into:

```text
.archive/reports/2026-layout-improvement-summary.md
```

Detailed test evidence lives under:

```text
docs/quality/layout/
```

### MCP

The former:

```text
docs/mcp/
```

was moved to:

```text
docs/integrations/mcp/
```

This makes MCP an integration instead of a parallel top-level documentation taxonomy.

### Legacy topic/process directories

The following old working-area directories were removed from the current `docs/` surface:

```text
docs/desktop-automation/
docs/discuz/
docs/golden_sample_strategy/
docs/optimization/
docs/strategy/
```

Their contents were classified into current docs, research/plans, reports or `.archive/` according to lifecycle.

Examples:

- old round-by-round optimization history -> `.archive/legacy-docs/optimization-2026/`;
- old golden-sample dated work -> `.archive/legacy-docs/golden-sample-strategy/`;
- old TestMonkey v2 upgrade discussion/task list -> `.archive/legacy-docs/`;
- Peekaboo runtime/MCP design draft -> `docs/research/desktop-automation/`;
- media transport design/current implementation note -> `docs/implementation/runtime/media-transport.md`.

## Deleted low-value work products

The cleanup intentionally did **not** archive every historical AI artifact.

Deleted after extracting or superseding their useful content:

- old completed Layout new-session prompt;
- old Layout implementation prompt;
- raw `think.md` workpad.

Git history remains sufficient for these artifacts.

## API documentation boundary

This migration did not merge user API docs into project docs.

Canonical rule remains:

```text
docs/          -> project and engineering docs
docs/api/ -> sole maintained user API docs
```

Retired and must not be recreated:

```text
docs-api/
docs-api-user/
docs/api/
```

## Ongoing rules

The migration is complete, but documentation hygiene is continuous.

For new work:

```text
canonical project knowledge -> docs/<category>/
user API                     -> docs/api/
research                     -> docs/research/
active plan                  -> docs/plans/
reusable test asset          -> owning tests/**/fixtures/
durable quality conclusion   -> docs/quality/<domain>/
runtime output               -> .runtime/
historical material          -> .archive/
reusable prompt              -> prompts/
```

Do not recreate:

- flat topic files in `docs/` root;
- `_V2`, `_V3`, `FINAL`, `FINAL_FINAL`, `COMPLETE_SUMMARY` naming for current docs;
- parallel API documentation roots;
- process-history directories that compete with current architecture or implementation docs.

## Validation completed

- `docs/` root contains `README.md` plus classified directories only;
- the former 61 root files are no longer present there;
- the major legacy second-level working directories have been removed;
- current Gate and Layout documents have one canonical path;
- reports, prompts and historical material no longer compete with current docs.

A broader link audit should continue whenever older Research or archive material is promoted back into current documentation; historical files may intentionally preserve historical path/context references.
