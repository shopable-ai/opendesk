# WeChat layout tests

This domain contains maintained JavaScript scenarios, stable golden fixtures and
small standalone Go generators for WeChat layout recognition.

## Run

Run commands from the repository root:

```bash
make build
./dist/clawdesk -script tests/wechat/wechat_visualization.js
./tests/wechat/run_e2e_test.sh
```

Real-window scripts require a visible, logged-in WeChat window and the macOS
permissions documented by the project. They must fail rather than guess when a
window or target cannot be identified.

## Layout

```text
tests/wechat/
  fixtures/                  stable golden samples and web fixtures
  tools/<tool>/main.go       one standalone Go tool per package
  docs/                      maintained domain guidance
  *.js                       JavaScript test and diagnostic scenarios
  *.sh                       orchestration and verification entrypoints
```

The Go white-box visualization test lives with its implementation at
`automation/wechat_visualization_test.go`; placing it here would create a
different Go package and prevent access to package internals.

## Generated output

All disposable screenshots, JSON results and visualizations belong under
`.runtime/tests/wechat/`. No script should recreate `tests/wechat/output/`.

The deterministic images consumed by LocateAnything are owned by that test
domain at `tests/locateanything/fixtures/wechat/`; they are fixtures, not run
output.

## Standalone Go tools

Examples:

```bash
go run ./tests/wechat/tools/generate-simple-image
go run ./tests/wechat/tools/generate-mock-image
go run ./tests/wechat/tools/visualize-result .runtime/tests/wechat/viz_config_simple.json
```

See `docs/visualization.md` for maintained guidance. The 2026-03 progressive
recognition experiment report is preserved under `.archive/`; it is historical
evidence, not a current test contract.
