# Repository Migration Map and P0 Batch

## Status

This document covers repository-level file lifecycle migration.

For the dedicated `docs/` cleanup, the authoritative per-file map is now:

```text
docs/maintenance/docs-migration-map.md
```

Important correction to earlier versions of this document:

```text
docs/api/ = sole maintained user API documentation root
```

The following historical trees have already been retired and must not be recreated:

```text
docs-api/
docs-api-user/
```

## Purpose

Turn repository layout policy into controlled migration batches while avoiding path breakage.

The migration separates:

- generated runtime output;
- reusable preserved artifacts;
- local development state;
- historical material;
- project engineering docs;
- user API docs;
- reusable prompts.

## Current documentation P0

The documentation-governance tranche establishes:

- `docs/README.md` as the project-doc entrypoint;
- `docs/maintenance/docs-migration-map.md` as the 61-file root cleanup map;
- `docs/api/` as the only maintained user API root;
- no bulk document moves until path references are checked.

This is intentionally lower risk than immediately renaming dozens of files.

## Runtime outputs

Strong migration candidates:

| Current path | Target path | Reason | Priority |
|---|---|---|---|
| `.runtime/runs/` | `.runtime/runs/` | execution logs, summaries, snapshots, event streams | later coupled batch |
| legacy `artifacts/mcp-smoke/` | `.runtime/smoke/mcp/` | historical mapping; no new output | completed |
| legacy `artifacts/preflight/` | `.runtime/preflight/` | historical mapping; no new output | completed |
| legacy `artifacts/browser_stack_finish/` | `.runtime/debug/browser_stack_finish/` | historical mapping; no new output | completed |
| legacy `artifacts/browser-stack-http-smoke/` | `.runtime/smoke/browser-stack-http/` | historical mapping; no new output | completed |
| `temp/mac/` | `.runtime/temp/mac/` | screenshots, probes, audit residue | P1 |
| `temp/e2e/` | `.runtime/temp/e2e/` | disposable e2e residue | P1 |
| `temp/qianniuShip/` | `.runtime/temp/qianniuShip/` | disposable test/debug residue | P1 |
| `temp/file/` | `.runtime/temp/file/` | temporary output | P1 |
| `temp/file-demo/` | `.runtime/temp/file-demo/` | temporary output | P1 |

`.runtime/runs/` remains a special case because runtime code, docs, configs and replay files may reference it. Patch producers and consumers before moving it.

## Domain-owned assets after migration

| Current path | Target path | Reason | Priority |
|---|---|---|---|
| `artifacts/external/` | `.runtime/cache/external/` + `docs/research/external/` | external cache plus provenance manifest | completed |
| `artifacts/fixtures/opencv/` | `tests/opencv/fixtures/` | OpenCV test assets | completed |
| `test/wechat/fixtures/golden-samples/` | `tests/wechat/fixtures/golden-samples/` | WeChat test baselines | completed |
| `artifacts/dev-html-samples/` | `tests/wechat/fixtures/wechatweb/` + `.runtime/runs/` | source fixture plus derived run output | completed |
| `artifacts/reports/<domain>/` | `docs/quality/<domain>/` | maintained quality conclusions | completed |

## Local development state

| Current path | Target path | Reason | Priority |
|---|---|---|---|
| `.venv-paddle-ocr/` | `.dev/venv/paddle-ocr/` | local environment state | P2 |
| `.playwright-cli/` | `.dev/playwright/cli/` | helper tool cache/state | P2 |
| `.playwright-mcp/` | `.dev/playwright/mcp/` | helper tool state | P2 |

Move these only after checking local script assumptions.

## Documentation structure

### Project / engineering docs

Canonical root:

```text
docs/
```

Target internal categories:

```text
project/
architecture/
implementation/
quality/
integrations/
scenarios/
research/
plans/
maintenance/
```

The current 61 direct files under `docs/` are individually classified in `docs/maintenance/docs-migration-map.md`.

### User API docs

Canonical root:

```text
docs/api/
```

Keep it independent from `docs/`.

Retired:

```text
docs-api/
docs-api-user/
```

Do not use old Git-history copies as current API authority.

## Historical/project-note Markdown at repository root

Older audits identified root status/summary files as cleanup candidates.

Because repository state has changed since those audits, do not blindly execute old move tables. For each candidate:

1. confirm the file still exists;
2. search live references;
3. determine whether it is still active;
4. archive only if historical value exists;
5. otherwise extract unique value and delete.

General rule after cleanup:

- no new one-off phase-summary Markdown at repository root.

## Current path dependency hotspots

Before runtime-output migrations, inspect current references in at least:

- `pkg/execution/artifacts.go`
- `README.md`
- `QUICKSTART.md`
- active config examples
- replay specifications
- scripts that generate screenshots/logs/reports
- `docs/maintenance/`
- browser automation and MCP docs
- `docs/api/` examples where output paths are user-visible

Historical references inside old generated reports do not necessarily block migration; classify them as historical evidence rather than active consumers.

## P0: governance first

P0 is intentionally non-destructive.

### Documentation governance

Implemented/maintained surface:

```text
docs/README.md
docs/maintenance/docs-migration-map.md
docs/maintenance/repository-documentation-map.md
docs/maintenance/repo-file-lifecycle-policy.md
docs/maintenance/repo-layout-refactor-plan.md
```

### Why no bulk move in P0

A file move through GitHub is effectively create + reference patch + delete. Doing dozens of those without dependency checks risks:

- broken relative links;
- stale README/quickstart references;
- duplicated Source-of-Truth files during partial migration;
- publishing regressions;
- loss of clarity over which version is current.

## P1: structural cleanup

Recommended order:

### P1-A: docs topic batches

Use `docs-migration-map.md` and migrate:

1. quality core;
2. browser automation;
3. macOS implementation;
4. desktop automation;
5. WeChat scenario;
6. layout research/reports;
7. MCP integration;
8. remaining project/execution docs.

Per batch:

```text
search old references
-> create target paths
-> patch links
-> verify target content
-> delete old paths
-> search old paths again
```

### P1-B: obvious runtime smoke/debug output

Candidates:

```text
legacy generated output -> .runtime/smoke/ or .runtime/debug/
```

Patch references first.

### P1-C: golden sample naming

Converge:

```text
tests/opencv/fixtures/image-color/ -> tests/opencv/fixtures/image-color/
test/wechat/fixtures/golden-samples/ -> tests/wechat/fixtures/golden-samples/
artifacts/reports/<domain>/ -> docs/quality/<domain>/
```

Search both spellings before and after migration.

## P2: semantic and high-coupling cleanup

### `.runtime/runs/`

Do not move until producer code and consumers are patched together.

### `temp/WeChatWeb/`

Classify first: disposable temp clone, external reference, or active workspace. Its size and mixed role make blind migration unsafe.

### Docs merges/deletions

P2 handles clusters such as:

- `GATES_AND_EVIDENCE*` / `GOLDEN_GATES`;
- layout `FINAL_*` / `PROJECT_COMPLETE_SUMMARY`;
- layout implementation/research duplicates;
- golden-sample strategy duplicate histories;
- raw prompts and `think.md`.

Do not archive all of these mechanically. Extract current facts first; preserve history only when useful.

### Local environments

Move `.venv-*` and `.playwright-*` only after local tooling assumptions are patched.

## What must not happen

Do not:

- recreate `docs-api/` or `docs-api-user`;
- move `docs/api/` to `docs/api/user/`;
- move `.runtime/runs/` without changing its producers/consumers;
- convert `.archive/` into a dump of every old AI-generated Markdown file;
- leave both old and new canonical documentation paths indefinitely;
- create new `*_V2.md`, `FINAL_*.md` or `*_COMPLETE_SUMMARY.md` as a substitute for Git history.

## Validation

### Documentation migration

- repository search for old path before move;
- patch incoming links;
- verify content/relative links at target;
- delete source only after target is verified;
- repository search for old path after move.

### Runtime/artifact migration

- identify producer code/config;
- patch default paths;
- migrate one subtree at a time;
- run targeted test/smoke workflows.

### API documentation

- verify user-visible API changes against current source/runtime;
- update `docs/api/*.md` and `runtime-api.ai.json` together where required;
- ensure retired API trees do not reappear.

## Success criteria

The repository migration succeeds when:

- project root primarily exposes source and real entrypoints;
- `docs/` root converges to `README.md` plus classified directories;
- `docs/api/` remains the sole maintained user API root;
- generated output defaults to `.runtime/`;
- the generic `artifacts/` namespace is retired;
- prompts and historical notes no longer pollute canonical docs;
- one current Source of Truth exists per engineering topic;
- repository search finds no live references to removed paths.
