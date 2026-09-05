# WeChat layout tests

This domain contains maintained JavaScript scenarios, stable golden fixtures and
small standalone Go generators for WeChat layout recognition.

## Run

Run commands from the repository root:

```bash
make build
./dist/opendesk -script tests/wechat/wechat_visualization.js
./dist/opendesk -script tests/wechat/e2e.js -console-mode script
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
```

`tests/wechat/e2e.js` 使用 `Command.run()` 调用 fixture generator 与可视化工具，并为 simple/complex
各启动一次 `opendesk -script` 子场景。阈值断言和 JSON summary 均在 JavaScript 中完成，
不需要 `ai run` 或 shell 入口。

The public layout contract is tested by JavaScript Runtime scenarios. Offline
pixel annotation is a standalone developer tool, not a package test:

```bash
go run ./tests/wechat/tools/visualize-layout \
  --image .runtime/tests/wechat/wechat_validation/wechat_original.png \
  --output .runtime/tests/wechat/wechat_validation
```

The tool calls the same exported `automation.ImageColor` implementation that
the JavaScript `ImageColor.analyzeLayout` binding uses. It does not replace the
JavaScript Runtime test and it does not access package-private implementation
details.

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
