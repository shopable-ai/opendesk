# Built-in Recorder runtime assets

This directory belongs to the compiled OpenDesk runtime, not to an App package.

- `controller.js`, `controller-core.js`, and `recording-history.js` are generated mirrors of the canonical JavaScript under `apps/opendesk/recorder/`. Run `go generate ./internal/recorderbundle` after changing those sources.
- Generic toolbar icons are not stored as PNG/SVG here. Recorder source consumes semantic icon IDs from `pkg/customui/assets/toolbar-icons-v1.json` directly through FloatingWindow / Custom UI.
- Product/App package source must not import this internal directory.

`go test ./internal/recorderbundle` enforces source/mirror parity, direct Runtime icon usage, and keeps Go implementation files/private icon directories out of `apps/opendesk/**`.
