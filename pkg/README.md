# Clawdesk Package Library

This directory contains reusable packages that implement the core architecture improvements for Clawdesk.

## Packages

### 📦 runtime
Thread-safe runtime pooling for concurrent JavaScript execution.

**Key Features:**
- Pool-based runtime management
- Context-aware acquisition
- Automatic cleanup of idle runtimes
- 79.7% test coverage

**Usage:**
```go
import "clawdesk/pkg/runtime"

pool := runtime.NewRuntimePool(10, func() *goja.Runtime {
    return goja.New()
})
defer pool.Close()

rt, _ := pool.Get(context.Background())
defer pool.Put(rt)

result, _ := rt.RunString("1 + 1")
```

### 📦 container
Dependency injection container for managing application services.

**Key Features:**
- Centralized dependency management
- Lifecycle management
- Easy testing and mocking
- 85.7% test coverage

**Usage:**
```go
import "clawdesk/pkg/container"

cfg := &container.Config{
    RuntimePoolSize: 10,
}

c, _ := container.NewContainer(cfg)
defer c.Close()

// Access services
rt, _ := c.GetRuntime(ctx)
vision := c.Vision()
```

### 📦 http
HTTP handlers using the container architecture.

**Key Features:**
- Container-based handlers
- Concurrent request handling
- Vision API endpoints
- 45.3% test coverage

**Usage:**
```go
import pkgHttp "clawdesk/pkg/http"

server := pkgHttp.NewServer(container, "8080")
server.Start()
```

### 📦 feature
Feature flags for gradual rollout and A/B testing.

**Key Features:**
- Environment variable configuration
- Easy rollback mechanism
- Zero-downtime deployment

**Usage:**
```go
import "clawdesk/pkg/feature"

if feature.UseDIContainer {
    // Use new architecture
} else {
    // Use legacy code
}
```

### 📦 visionrun
Run-id artifact bundle generation for the visual recovery pipeline.

**Key Features:**
- Creates `.runtime/runs/<run-id>/` skeleton
- Copies `preflight.json` into each run bundle
- Seeds `requirement.json`, `audit.ndjson`, `decision.json`
- Blocks downstream execution automatically when preflight status is `fail`

**Usage:**
```go
import "clawdesk/pkg/visionrun"

bundle, err := visionrun.InitBundle(visionrun.InitOptions{
    RepoRoot: ".",
    RunID: "example-run",
})
if err != nil {
    panic(err)
}
_ = bundle
```

## Architecture Benefits

### Before
- ❌ Global state (not thread-safe)
- ❌ Tight coupling
- ❌ Hard to test
- ❌ Race conditions

### After
- ✅ Thread-safe concurrent execution
- ✅ Loose coupling via DI
- ✅ Easy to test and mock
- ✅ No race conditions
- ✅ 15% faster, 36% less memory

## Testing

### Run All Package Tests
```bash
go test ./pkg/... -v -cover
```

### Run Specific Package
```bash
go test ./pkg/runtime/... -v
go test ./pkg/container/... -v
go test ./pkg/http/... -v
```

### Run Benchmarks
```bash
go test ./pkg/runtime/... -bench=. -benchmem
```

## Performance

### Benchmark Results
```
BenchmarkRuntimePoolGetPut-8    917472    1328 ns/op    3312 B/op    40 allocs/op
BenchmarkRuntimeDirect-8        835947    1536 ns/op    5216 B/op    50 allocs/op
```

**Improvements:**
- Speed: ~15% faster
- Memory: ~36% less
- Allocations: 20% fewer

## Documentation

- [Implementation Guide](../docs/architecture/implementation.md)
- [Architecture Refactoring Plan](../docs/optimization/round-03-architecture-refactoring.md)
- [Testing Strategy](../docs/optimization/round-02-testing-strategy.md)

## Contributing

When adding new packages:

1. Create package directory under `pkg/`
2. Add comprehensive tests (target: 80%+ coverage)
3. Document public APIs with godoc comments
4. Update this README
5. Add usage examples

## License

Same as parent project.
