# Repository Documentation Map

## Purpose

This file defines the maintained documentation roots in Clawdesk and prevents historical API trees from being treated as equal sources of truth.

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
  - machine-readable API index

These two roots are complementary rather than competing.

## Retired API documentation trees

The following historical API trees have been deliberately retired:

- `docs-api/`
- `docs-api-user/`
- `docs/api/`

They existed during different TestMonkey → Clawdesk documentation reorganizations and created duplicate or conflicting API facts.

Rules:

- Do not recreate them as parallel API documentation roots.
- Do not use Git history copies as current API authority.
- If historical wording contains useful information, migrate the verified fact into `docs-user-api/`.
- Current source/runtime behavior remains the final API fact source.

## `docs-user-api/` role

Use for:

- `page`, input, window, screen
- Vision / OCR / ImageColor
- system / file / storage / clipboard
- http / HTTP server
- runtime / polyfills / JS libraries
- secondary runtime utilities
- cookbook
- `runtime-api.ai.json`

When adding a user-visible API:

1. update its Markdown page or create one if needed;
2. update `index.md`;
3. update `runtime-api.ai.json`;
4. verify examples against current source/runtime;
5. avoid local absolute paths and historical project names.

## Source priority

For API facts:

1. current source/runtime behavior
2. `docs-user-api/runtime-api.ai.json`
3. `docs-user-api/*.md`
4. Git history

For project architecture/history/research:

1. current maintained files under `docs/`
2. current source and test evidence
3. Git history as historical context

## Cleanup implications

When comparing machines or repositories:

- do not infer independent project evolution from deleted historical API trees;
- treat reappearance of `docs-api/`, `docs-api-user/`, or `docs/api/` as a migration/regression issue unless explicitly re-approved;
- API work should normally land in `docs-user-api/`, not under a new parallel docs root.

## Default authoring rule

- Project/engineering documentation → `docs/`
- User-facing API documentation → `docs-user-api/`
- Machine-readable user API map → `docs-user-api/runtime-api.ai.json`
