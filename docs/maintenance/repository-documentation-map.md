# Repository Documentation Map

## Purpose

This file defines the current documentation directory roles for `clawdesk` so local cleanup, sync, and future refactors do not treat several historical doc trees as equal sources of truth.

## Current canonical stance

Primary documentation tree:
- `docs/`

Supporting but transitional trees:
- `docs-user-api/`
- `docs-api/`
- `docs-api-user/`

Rule:
- New maintained project documentation should default to `docs/` unless there is a strong toolchain reason to keep a document in one of the transitional trees.

## Directory roles

### `docs/`
Canonical project documentation root.

Use for:
- architecture
- maintenance rules
- plans
- research
- MCP notes
- runtime and browser automation docs
- future normalized API docs under stable subpaths

Preferred subtrees already present:
- `docs/api/`
- `docs/architecture/`
- `docs/implementation/`
- `docs/maintenance/`
- `docs/plans/`
- `docs/research/`
- `docs/strategy/`

### `docs-user-api/`
Current user-facing API writing set.

Status:
- usable
- closer to current source than older `testmonkey`-named API docs
- still a transitional top-level tree, not the final normalized home

Interpretation:
- keep using it only when an existing doc flow depends on it
- when normalizing structure, the likely long-term destination is under `docs/api/user/`

### `docs-api/`
Older runtime/API documentation set with `testmonkey` naming.

Status:
- legacy but still useful as reference
- not the preferred destination for new docs

Interpretation:
- preserve for compatibility/reference until a deliberate migration retires it
- do not treat it as equal to `docs/` for new authoring

### `docs-api-user/`
Older user API document set.

Status:
- legacy reference surface
- superseded in practice by `docs-user-api/`

Interpretation:
- avoid adding new files here
- keep only until specific consumers are migrated or retired

## Sync and cleanup implications

When comparing machines or deciding what to sync:
- treat `docs/` as the primary repo-level document source
- treat `docs-user-api/`, `docs-api/`, and `docs-api-user/` as historical or transitional side trees
- do not infer independent project evolution merely because these trees differ in file count or naming style

When deciding whether a remote copy has meaningful new work:
- prioritize git-tracked code changes first
- then check whether `docs/` has unique maintained content
- only after that inspect transitional doc trees

## Default authoring rule

If no stronger constraint exists:
1. put new project docs in `docs/`
2. keep old doc trees stable rather than expanding them
3. normalize into `docs/api/...` during deliberate migration work, not opportunistically during unrelated code sync
