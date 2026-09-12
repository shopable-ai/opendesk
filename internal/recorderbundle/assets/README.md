# Built-in Recorder runtime assets

This directory belongs to the compiled OpenDesk runtime, not to an App package.

- `controller.js`, `controller-core.js`, `recording-history.js`, and `runtime-icon-adapter.js` are generated mirrors of the canonical JavaScript under `apps/opendesk/recorder/`. Run `go generate ./internal/recorderbundle` after changing those sources.
- Generic toolbar icons are not stored as PNG/SVG here. The Recorder runtime adapter resolves the legacy image descriptors to semantic IDs from `pkg/customui/assets/toolbar-icons-v1.json`.
- Product/App package source must not import this internal directory.

`go test ./internal/recorderbundle` enforces source/mirror parity and keeps Go implementation files/private icon directories out of `apps/opendesk/**`.
