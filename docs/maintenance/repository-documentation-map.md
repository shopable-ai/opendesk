# Repository Documentation Map

## Purpose

This file defines the maintained documentation surfaces in OpenDesk and prevents historical docs, editor artifacts, reports or prompts from becoming competing sources of truth.

## Maintained documentation roots

OpenDesk has two maintained documentation roots with different responsibilities.

### `docs/` — project and engineering documentation

Current top-level categories:

```text
project/
frameworks/
architecture/
implementation/
quality/
integrations/
scenarios/
research/
plans/
maintenance/
```

`docs/README.md` is the canonical navigation entrypoint.

### `docs/api/` — sole maintained user API documentation

Use for directly rendered, user-facing material:

- script/runtime API reference;
- HTTP API reference;
- user examples and cookbook;
- concise navigation to supporting machine/editor assets.

Do not create another user-facing API root under `docs/`, and do not create a dedicated rendered page merely to explain internal `.d.ts` maintenance.

## Derived API assets

These are maintained but are **not additional documentation roots**:

- `docs/api/agent/` — deterministic Agent navigation generated from canonical Reference, types and the small routing map; it is not a second API database.
- `types/*.d.ts` — VS Code / TypeScript autocomplete and callable signatures.
- `jsconfig.json` — connects repository JavaScript with the declaration files.

Long-form explanation belongs in the relevant user API Markdown or in `docs/maintenance/`, depending on whether it is user-facing behavior or maintenance policy.

## Retired documentation/API surfaces

The following must not be recreated as current authorities:

```text
docs-api/
docs-api-user/
dev/api.md
repository-root types.md
docs/api/types.md
```

Former working areas and old-path redirect Markdown are historical only. Once current references point to the canonical file, do not retain a placeholder page solely to explain where content moved.

## Source priority

### User API facts

```text
1. current source/runtime behavior
2. docs/api/*.md canonical Reference
3. types/*.d.ts
4. Git history
```

The Markdown layer is the canonical rendered user documentation. JSON and `.d.ts` are derived consumption formats and must be corrected when they drift.

### Project / architecture / implementation facts

```text
1. current source, tests and reproducible runtime evidence
2. current canonical docs under docs/
3. research/plans and preserved reports as supporting context
4. .archive/ and Git history
```

## Lifecycle routing

| Material | Canonical destination |
|---|---|
| Current project/framework/architecture/implementation/quality knowledge | `docs/<category>/` |
| User-facing API prose | `docs/api/` |
| Generated Agent API navigation | `docs/api/agent/` |
| Editor signatures | `types/*.d.ts` |
| Editor project wiring | `jsconfig.json` |
| Active research | `docs/research/` |
| Active plans | `docs/plans/` |
| Application-specific scenario docs | `docs/scenarios/<scenario>/` |
| External/tool integration docs | `docs/integrations/<integration>/` |
| Durable test/review evidence | `docs/quality/<domain>/` or `tests/<domain>/reports/` |
| Reusable fixtures / golden baselines | Owning `tests/<domain>/fixtures/` |
| Generated runtime/debug/smoke output | `.runtime/` |
| Local development state | `.dev/` |
| Superseded but valuable historical material | `.archive/` |
| Reusable AI orchestration prompt | `prompts/` |
| Low-value completed prompt/workpad/migration notice | delete after extracting durable knowledge; rely on Git history |

## Canonical vs supporting material

A topic should normally have one current canonical document.

```text
Research -> Decision -> Canonical Architecture / Implementation
Plan     -> Implementation -> Verification -> update canonical docs
Run      -> Runtime evidence -> promote reusable evidence only when justified
```

Do not let a Research file, phase report, Prompt, JSON index or `.d.ts` silently become the effective specification just because it is longer or easier for a tool to consume.

A completed move does not need a permanent Markdown redirect inside the repository. Update inbound links, keep one canonical document, delete the transition file, and use Git history when the move itself needs to be audited.

## Naming rules

Current maintained docs should normally use semantic, unversioned names:

```text
lower-kebab-case.md
```

Avoid current-document names such as `*_V2.md`, `*_V3.md`, `*_FINAL.md`, `*_COMPLETE_SUMMARY.md`. Use Git for version history. Dates are appropriate for intentionally temporal research and reports.

## Authoring rules

When adding or changing a user-visible API:

1. verify current source/runtime behavior;
2. update the corresponding rendered Markdown;
3. update `docs/api/index.md` if navigation or object ownership changed;
4. update `types/*.d.ts` whenever callable signatures, return shapes, optionality or sync/Promise behavior changed;
5. run `scripts/api-docs.js check/generate` when API routing or discoverability changed;
6. run the declaration checks;
7. verify examples.

Do not create a new API explanation file merely because a new type declaration was added. Deprecated/Compatibility names belong in the canonical Reference; do not create a separate old-path page for them.

When adding or changing project/engineering documentation:

1. determine the lifecycle/type first;
2. update an existing Source of Truth whenever one exists;
3. keep app-specific semantics in `scenarios/` or adapters rather than generic architecture;
4. keep reports and generated evidence out of canonical docs;
5. do not create flat topic files in `docs/` root;
6. remove completed migration plans, path maps and transition-only pages after durable rules and current links have been updated.

## Current maintenance entrypoints

Repository/document governance is maintained by the current rules, not by completed migration logs:

- `docs/maintenance/repository-documentation-map.md`
- `docs/maintenance/repo-file-lifecycle-policy.md`
- `docs/maintenance/repository-root-layout.md`
- `docs/maintenance/release-artifact-workflow.md`

Historical cleanup and path-move details are available through Git history and do not require a separate maintained migration map.
