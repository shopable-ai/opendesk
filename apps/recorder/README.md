# OpenDesk Recorder entry

`apps/recorder` is intentionally a thin local artifact inspector. Live Recorder
session control and action association are provided by `cmd/opendesk-mcp` using
`tm_recorder_start`, `tm_recorder_annotate`, `tm_recorder_status`,
`tm_recorder_verify`, `tm_recorder_stop`, `tm_recorder_distill`, and
`tm_recorder_compile`.

Example:

```bash
go run ./apps/recorder \
  -session rec-20260831T202346.031873000Z-438b6ac8 \
  -artifact manifest
```

All session data remains under `.runtime/recordings/<session-id>/`.
