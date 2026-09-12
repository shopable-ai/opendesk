# Built-in Recorder runtime assets

This directory belongs to the compiled OpenDesk runtime, not to an App package.

- `controller.js`, `controller-core.js`, and `recording-history.js` are generated mirrors of the canonical JavaScript under `apps/opendesk/recorder/`. Run `go generate ./internal/recorderbundle` after changing those sources.
- `icons/*.png` are built-in Recorder binary resources materialized only for the internal Recorder execution. They must not be copied back into `apps/opendesk/recorder/`.
- Generic toolbar icons do not belong here. Use semantic IDs from `pkg/customui/assets/toolbar-icons-v1.json` instead.

`go test ./internal/recorderbundle` enforces source/mirror parity and keeps Go implementation files out of `apps/opendesk/**`.
