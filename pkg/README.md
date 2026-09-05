# OpenDesk package library

`pkg/execution` owns JavaScript execution. Every request receives a fresh
event-loop Runtime whose Goja access stays on that loop's owner goroutine;
there is deliberately no mutable Runtime pool or container borrowing API.

## Packages

- `runtime`: `ExecutionGate`, a context-aware concurrency capacity primitive.
  It never creates or returns JavaScript runtimes.
- `container`: owns shared host services and reports execution capacity. It
  cannot return a Runtime handle.
- `execution`: unified CLI and HTTP script execution, artifacts, events,
  deadlines, Interrupt coordination, and lifecycle teardown.
- `http`: `/SCRIPT_RUN` compatibility route and `/executions` API, both backed
  by the same execution request semantics.
- `visionrun`: run-id artifact bundle generation for visual workflows.

## Runtime ownership

Workers carry request/response Go data only. HTTP completion is posted by
`EventLoop.RunOnLoop`; `Runtime.Interrupt` is the sole cross-goroutine Runtime
operation and is synchronized with teardown. The Runtime API surface is an
explicit allowlist in `automation/utils.go`; a new exported Go method is not
automatically exposed to JavaScript.

## Verification

```bash
go test -race -count=50 -shuffle=on ./pkg/runtime ./pkg/container ./pkg/execution ./pkg/http ./automation
./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

Runtime API run artifacts are written below `.runtime/tests/runtime-api/`.
