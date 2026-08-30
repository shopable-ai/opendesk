# Repository Documentation Map

## Purpose

This file defines the maintained documentation roots in Clawdesk and prevents historical API trees or editor artifacts from being treated as equal sources of truth.

## Current canonical stance

There are two maintained documentation roles:

- `docs/`：项目级文档根目录
  - architecture
  - implementation
  - maintenance
  - plans
  - research
  - strategy
  - MCP / internal engineering notes
- `docs-user-api/`：**唯一用户 API 文档根目录**
  - script/runtime API reference
  - HTTP API reference
  - user examples
  - editor/type usage guidance
  - machine-readable API index

These two roots are complementary rather than competing.

`types/` is a maintained **derived editor contract surface**, not a third documentation root:

- `types/*.d.ts` provides VS Code / TypeScript autocomplete and signatures.
- `jsconfig.json` wires those declarations into the repository's JavaScript editing experience.
- Explanations belong in `docs-user-api/types.md`, not in ad-hoc Markdown under `types/`.
- Type declarations must follow current source/runtime and the canonical user docs.

## Retired API documentation trees and drafts

The following historical API trees have been deliberately retired:

- `docs-api/`
- `docs-api-user/`
- `docs/api/`

The following standalone drafts are also retired:

- `dev/api.md`：旧 `.d.ts` 风格接口草稿
- repository-root `types.md`：旧的类型生成提示词/过程笔记

They existed during different TestMonkey → Clawdesk documentation/type-generation stages and created duplicate or conflicting API facts.

Rules:

- Do not recreate them as parallel API documentation roots.
- Do not use Git history copies as current API authority.
- If historical wording contains useful information, migrate the verified fact into `docs-user-api/` or the corresponding `types/*.d.ts`.
- Current source/runtime behavior remains the final API fact source.

## `docs-user-api/` role

Use for:

- `page`, input, window, screen
- Vision / OCR / ImageColor
- system / file / storage / clipboard
- http / HTTP server
- runtime / polyfills / JS libraries
- secondary runtime utilities
- editor/type guidance
- cookbook
- `runtime-api.ai.json`

When adding or changing a user-visible API:

1. confirm the current source/runtime behavior;
2. update its Markdown page or create one if needed;
3. update `index.md`;
4. update `runtime-api.ai.json` when the public object/method map changes;
5. update the corresponding `types/*.d.ts` when the callable signature or returned shape changes;
6. run the declaration check;
7. verify examples against current source/runtime;
8. avoid local absolute paths and historical project names.

## Source priority

For API facts:

1. current source/runtime behavior
2. `docs-user-api/runtime-api.ai.json`
3. `docs-user-api/*.md`
4. `types/*.d.ts`
5. Git history

`types/*.d.ts` is intentionally lower than the rendered documentation because it is an editor aid rather than explanatory product documentation.

For project architecture/history/research:

1. current maintained files under `docs/`
2. current source and test evidence
3. Git history as historical context

## Cleanup implications

When comparing machines or repositories:

- do not infer independent project evolution from deleted historical API trees;
- treat reappearance of `docs-api/`, `docs-api-user/`, `docs/api/`, `dev/api.md` or root `types.md` as a migration/regression issue unless explicitly re-approved;
- API prose work should normally land in `docs-user-api/`, not under a new parallel docs root;
- editor signatures belong in `types/*.d.ts`, not in Markdown declaration dumps.

## Default authoring rule

- Project/engineering documentation → `docs/`
- User-facing/rendered API documentation → `docs-user-api/`
- Machine-readable user API map → `docs-user-api/runtime-api.ai.json`
- VS Code / TypeScript API declarations → `types/*.d.ts`
- JavaScript editor project wiring → `jsconfig.json`
