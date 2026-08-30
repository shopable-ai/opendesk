# Repository Documentation Map

## Purpose

This file defines the maintained documentation surfaces in Clawdesk and prevents historical docs, editor artifacts, reports or prompts from becoming competing sources of truth.

## Maintained documentation roots

Clawdesk has two maintained documentation roots with different responsibilities.

### `docs/` — project and engineering documentation

Current top-level categories:

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

Roles:

- `project/` — project overview, current context, operator/runbook entrypoints.
- `architecture/` — current system structures, boundaries, contracts and ADRs.
- `implementation/` — current implementation mechanisms, platform notes and troubleshooting.
- `quality/` — gates, testing, failure taxonomy, review rules and maintained evidence indexes.
- `integrations/` — external protocols/services/tool integrations such as MCP.
- `scenarios/` — application/business-specific requirements, scenario architecture and action/baseline rules.
- `research/` — option analysis, comparisons, exploratory studies and architecture reviews.
- `plans/` — active roadmaps and not-yet-completed work.
- `maintenance/` — repository/documentation governance.

`docs/README.md` is the canonical navigation entrypoint.

### `docs-user-api/` — sole maintained user API documentation

Use for:

- script/runtime API reference;
- HTTP API reference;
- user examples and cookbook;
- editor/type usage guidance;
- machine-readable API index (`runtime-api.ai.json`).

Do not create another user-facing API root under `docs/`.

## Derived editor contract surface

`types/` is maintained but is **not a third documentation root**.

- `types/*.d.ts` provides VS Code / TypeScript autocomplete and signatures.
- `jsconfig.json` wires declarations into the JavaScript editing experience.
- explanatory API prose belongs in `docs-user-api/`.
- type declarations must follow current source/runtime and canonical user API docs.

## Retired documentation/API surfaces

The following must not be recreated as current authorities:

```text
docs-api/
docs-api-user/
docs/api/
dev/api.md
repository-root types.md
```

The following former project-doc working areas were also removed from the maintained `docs/` surface during the 2026-08 cleanup:

```text
docs/desktop-automation/
docs/discuz/
docs/golden_sample_strategy/
docs/optimization/
docs/strategy/
docs/mcp/
```

Their useful content has been moved into lifecycle-based categories; historical process material lives in `.archive/`.

## Source priority

### User API facts

```text
1. current source/runtime behavior
2. docs-user-api/runtime-api.ai.json
3. docs-user-api/*.md
4. types/*.d.ts
5. Git history
```

`types/*.d.ts` is intentionally below rendered user documentation because it is an editor aid rather than the explanatory product documentation surface.

### Project / architecture / implementation facts

```text
1. current source, tests and reproducible runtime evidence
2. current canonical docs under docs/
3. research/plans and preserved reports as supporting context
4. .archive/ and Git history
```

If current source and a current docs file disagree, investigate the source/test behavior and correct the canonical document rather than preserving a stale statement for consistency with history.

## Lifecycle routing

| Material | Canonical destination |
|---|---|
| Current project/architecture/implementation/quality knowledge | `docs/<category>/` |
| User-facing API prose | `docs-user-api/` |
| Machine-readable user API map | `docs-user-api/runtime-api.ai.json` |
| Editor signatures | `types/*.d.ts` |
| Active research | `docs/research/` |
| Active plans | `docs/plans/` |
| Application-specific scenario docs | `docs/scenarios/<scenario>/` |
| External/tool integration docs | `docs/integrations/<integration>/` |
| Durable test/review evidence | `artifacts/reports/` |
| Reusable fixtures / golden baselines | `artifacts/fixtures/` |
| Generated runtime/debug/smoke output | `.runtime/` |
| Local development state | `.dev/` |
| Superseded but valuable historical material | `.archive/` |
| Reusable AI orchestration prompt | `prompts/` |
| Low-value completed prompt/workpad | delete after extracting durable knowledge; rely on Git history |

## Canonical vs supporting material

A topic should normally have one current canonical document.

Supporting material can exist, but its role must be obvious:

```text
Research -> Decision -> Canonical Architecture / Implementation
Plan     -> Implementation -> Verification -> update canonical docs
Run      -> Runtime evidence -> promote reusable evidence only when justified
```

Do not let a Research file, phase report or Prompt silently become the effective specification just because it is longer or newer-looking.

## Naming rules

Current maintained docs should normally use semantic, unversioned names:

```text
lower-kebab-case.md
```

Avoid current-document names such as:

```text
*_V2.md
*_V3.md
*_FINAL.md
*_COMPLETE_SUMMARY.md
```

Use Git for version history. Dates are appropriate for research, reports and other intentionally temporal material.

## Authoring rules

When adding or changing a user-visible API:

1. verify source/runtime behavior;
2. update `docs-user-api/` prose;
3. update `docs-user-api/index.md` where needed;
4. update `runtime-api.ai.json` when public object/method routing changes;
5. update `types/*.d.ts` when callable signatures/return shapes change;
6. run the declaration checks;
7. verify examples.

When adding or changing project/engineering documentation:

1. determine the lifecycle/type first;
2. update an existing Source of Truth whenever one exists;
3. keep app-specific semantics in `scenarios/` or adapters rather than generic architecture;
4. keep reports and generated evidence out of canonical docs;
5. do not create flat topic files in `docs/` root.

## Migration status

The 2026-08 `docs/` cleanup is structurally complete.

See:

```text
docs/maintenance/docs-migration-map.md
```

for the completion record and migration rationale.
