# Archive policy

`.archive/` keeps superseded material whose history is still useful. It is not a
runtime-output directory and it is not a second source tree.

## Structure

- `legacy-docs/` — superseded project documentation.
- `legacy/` — historical implementation or fixture snapshots.
- `reports/` — completed reports that no longer describe current behavior.
- `notes/` — historical notes and one-time handoff context.
- `batch*-sync-blockers-*` — preserved recovery snapshots from earlier sync work.

New logs, screenshots, generated scripts, probes and smoke output must go to
`.runtime/`, not here. Before archiving a document, move any still-current rule
or fact into canonical source or `docs/`. Archive paths must never be imported by
production code or used as test fixtures.
