# Quick Start Guide - New Architecture

## For Developers

### Using the Runtime Pool

```go
import (
    "context"
    "clawdesk/pkg/runtime"
    "github.com/dop251/goja"
)

// Create pool
pool := runtime.NewRuntimePool(10, func() *goja.Runtime {
    return goja.New()
})
defer pool.Close()

// Get runtime
ctx := context.Background()
rt, err := pool.Get(ctx)
if err != nil {
    // Handle error
}
defer pool.Put(rt)

// Use runtime
result, _ := rt.RunString("1 + 1")
```

### Using the Container

```go
import (
    "clawdesk/pkg/container"
)

// Create container
cfg := &container.Config{
    RuntimePoolSize: 10,
}
c, err := container.NewContainer(cfg)
if err != nil {
    // Handle error
}
defer c.Close()

// Get runtime
rt, _ := c.GetRuntime(ctx)
defer c.PutRuntime(rt)

// Access services
vision := c.Vision()
```

### Creating HTTP Server

```go
import (
    pkgHttp "clawdesk/pkg/http"
    "clawdesk/pkg/container"
)

// Create container
container, _ := container.NewContainer(&container.Config{
    RuntimePoolSize: 10,
})
defer container.Close()

// Create server
server := pkgHttp.NewServer(container, "8080")

// Start server
server.Start()
```

## For Users

### Running the Application

```bash
# Default mode (container-based)
./clawdesk -http -port 60844

# Legacy mode
export USE_DI_CONTAINER=0
./clawdesk -http -port 60844
```

### Agent-Driven CLI Execution

CLI now supports an agent-friendly output layer for direct execution without requiring a pre-written `.js` file.

```bash
# Execute inline JavaScript directly
./clawdesk -script-text "console.log('inline run')" -timeout 4

# Execute JavaScript streamed from stdin
printf "console.log('stdin run')\n" | ./clawdesk -script-stdin -timeout 4

# Save the exact stdin payload for replay/promotion
printf "console.log('stdin run')\n" | \
  ./clawdesk \
  -script-stdin \
  -save-last-script artifacts/last-agent-script.js \
  -timeout 4
```

For macOS permission-stable runs, use the fixed binary wrapper:

```bash
printf "console.log('stable stdin run')\n" | \
  REBUILD=1 ./scripts/run_macos_stable.sh \
  -script-stdin \
  -save-last-script artifacts/last-agent-script.js \
  -timeout 4
```

Rules:

- choose exactly one of `-script`, `-script-text`, `-script-stdin`
- `run_macos_stable.sh` is a stable-binary wrapper; when new CLI flags are added, first run with `REBUILD=1`
- direct runs now default to `.runtime/runs/<executionId>/`
- each run emits `script_snapshot.js`, `stdout.log`, `stderr.log`, `summary.json`, `agent_summary.json`, `events.ndjson`

Recommended output views:

```bash
# Human-friendly terminal output
./clawdesk -script-text "console.log('hello')" -console-mode script -timeout 1

# Minimal summary-only terminal output
./clawdesk -script-text "console.log('hello')" -console-mode summary -timeout 1

# Agent-friendly structured output
./clawdesk -script-text "console.log('hello')" -output-format json -timeout 1

# Agent mode also returns the structured JSON summary
./clawdesk -script-text "console.log('hello')" -console-mode agent -timeout 1
```

Behavior summary:

- `-console-mode script`: show script logs, summary, and errors
- `-console-mode summary`: show summary and errors only
- `-console-mode agent`: emit the compact structured summary instead of noisy terminal logs
- `-output-format json`: emit the compact agent summary as JSON on stdout
- full raw stdout/stderr are still preserved in the run artifact directory

Verified commands:

```bash
REBUILD=1 ./scripts/run_macos_stable.sh -script-text "console.log('hello')" -console-mode script -timeout 1

printf "console.log('hello from stdin')\n" | \
  REBUILD=1 ./scripts/run_macos_stable.sh \
    -script-stdin \
    -save-last-script /tmp/clawdesk-last.js \
    -console-mode summary \
    -timeout 1

REBUILD=1 ./scripts/run_macos_stable.sh -script-text "console.log('json')" -output-format json -timeout 1
```

Repeatable smoke test:

```bash
# Maintainer-mode validation
./scripts/test_agent_direct_execution.sh

# User-mode validation without relying on Go tests
./scripts/test_agent_direct_execution_user_mode.sh
```

### API Examples

#### Create Execution
```bash
curl -X POST http://localhost:60844/executions \
  -H "Content-Type: application/json" \
  -d '{
    "script": "for (let i = 0; i < 3; i++) { console.log(\"tick-\" + i); await page.waitFor(120); }",
    "timeout": 120
  }'
```

#### Read Execution Status
```bash
curl http://localhost:60844/executions/<executionId>
```

#### Stream Execution Events (SSE)
```bash
curl -N http://localhost:60844/executions/<executionId>/events
```

#### Read Final Agent Summary
```bash
curl http://localhost:60844/executions/<executionId>/summary
```

#### Legacy Compatibility Endpoints
```bash
curl -X POST http://localhost:60844/SCRIPT_RUN \
  -H "Content-Type: application/json" \
  -d '{
    "script": "console.log(\"Hello\")",
    "timeout": 30
  }'

curl http://localhost:60844/status
```

#### OCR
```bash
curl -X POST http://localhost:60844/vision/ocr \
  -F "image=@screenshot.png" \
  -F "provider=paddle" \
  -F "lang=ch"
```

## Testing

### Run All Tests
```bash
go test ./pkg/... -v -cover
```

### Run with Race Detector
```bash
go test ./pkg/... -race
```

### Run Benchmarks
```bash
go test ./pkg/runtime/... -bench=. -benchmem
```

## Troubleshooting

### Issue: Race condition detected
**Solution**: Make sure SKIP_FYNE_INIT is set in test environment

### Issue: Pool exhausted
**Solution**: Increase RuntimePoolSize in container config

### Issue: Tests fail with Fyne errors
**Solution**: Run tests with `SKIP_FYNE_INIT=1 go test ./...`

## Performance Tips

1. **Pool Size**: Set to 2x expected concurrent requests
2. **Timeout**: Set appropriate timeout for long-running scripts
3. **Context**: Always use context for cancellation support
4. **Cleanup**: Always defer Put() after Get()

## Migration from Legacy

### Before (Legacy)
```go
var jsRuntime *goja.Runtime

func handler(w http.ResponseWriter, r *http.Request) {
    result, _ := jsRuntime.RunString(script)
}
```

### After (Container)
```go
func handler(w http.ResponseWriter, r *http.Request) {
    rt, _ := container.GetRuntime(r.Context())
    defer container.PutRuntime(rt)
    result, _ := rt.RunString(script)
}
```

## Resources

- [Implementation Guide](docs/architecture/implementation.md)
- [Package Documentation](pkg/README.md)
- [Round 3 Discussion](docs/optimization/round-03-architecture-refactoring.md)
- [Status Report](.archive/reports/2026-03-status-report.md)
