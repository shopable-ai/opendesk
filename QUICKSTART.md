# OpenDesk Quick Start

本页只保留当前可验证的启动和调试主路径。完整 API 说明见 `docs-user-api/`，项目设计与质量规范见 `docs/`。

## 1. 构建

```bash
make build
```

等价的 Go 命令会把本地可执行文件写入可重建的 `dist/`，而不是项目根目录：

```bash
mkdir -p dist
go build -o dist/opendesk ./cmd/opendesk
```

也可以直接运行而不保留构建产物：

```bash
go run ./cmd/opendesk <flags>
```

## 2. 执行 JavaScript

### 文件

```bash
go run ./cmd/opendesk -script examples/notify.js
```

### Inline source

```bash
go run ./cmd/opendesk -script-text "console.log('inline run')"
```

### stdin

```bash
printf "console.log('stdin run')\n" | go run ./cmd/opendesk -script-stdin
```

规则：`-script`、`-script-text`、`-script-stdin` 一次只能选择一个。

## 3. 输出与执行证据

低噪音 Agent 模式：

```bash
go run ./cmd/opendesk \
  -script-text "console.log('agent run')" \
  -console-mode agent
```

JSON 输出：

```bash
go run ./cmd/opendesk \
  -script-text "console.log('agent run')" \
  -output-format json
```

主要 console mode：

```text
full
script
meta
summary
quiet
agent
```

默认产物目录：

```text
.runtime/runs/<executionId>/
```

默认包含：

```text
script_snapshot.js
stdout.log
stderr.log
summary.json
agent_summary.json
events.ndjson
```

指定自定义产物目录：

```bash
go run ./cmd/opendesk \
  -script-text "console.log('custom logs')" \
  -log-dir .runtime/debug/my-run
```

保存本次执行脚本：

```bash
go run ./cmd/opendesk \
  -script-text "console.log('snapshot')" \
  -save-last-script .runtime/debug/last-script.js
```

## 4. Browser compatibility stack

默认：

```text
legacy
```

可选：

```text
legacy
upgraded
playwright
```

示例：

```bash
go run ./cmd/opendesk -script examples/browser_stack_legacy_smoke.js -stack legacy
go run ./cmd/opendesk -script examples/browser_stack_upgraded_smoke.js -stack upgraded
go run ./cmd/opendesk -script examples/browser_stack_playwright_smoke.js -stack playwright
```

注意：`upgraded` / `playwright` 是兼容 facade，不代表完整 Playwright 浏览器运行时。

阅读：

```text
docs-user-api/runtime.md
docs/architecture/browser-automation/capabilities.md
docs/architecture/browser-automation/stack.md
```

## 5. HTTP 模式

启动：

```bash
go run ./cmd/opendesk -http -port 60844
```

DI/container 模式默认开启。

创建 execution：

```bash
curl -X POST http://127.0.0.1:60844/executions \
  -H 'Content-Type: application/json' \
  -d '{
    "script": "console.log(page.title())",
    "stack": "legacy",
    "timeout": 30
  }'
```

响应会返回：

```text
executionId
statusUrl
summaryUrl
streamUrl
artifacts
```

查询状态：

```bash
curl http://127.0.0.1:60844/executions/<executionId>
```

查询摘要：

```bash
curl http://127.0.0.1:60844/executions/<executionId>/summary
```

读取 SSE：

```bash
curl -N http://127.0.0.1:60844/executions/<executionId>/events
```

健康状态：

```bash
curl http://127.0.0.1:60844/status
```

完整 HTTP API：

```text
docs-user-api/http-server.md
```

### Legacy HTTP

只有需要验证历史兼容行为时才使用：

```bash
USE_DI_CONTAINER=0 go run ./cmd/opendesk -http -port 60844
```

Legacy 模式和默认 container 模式存在路由/行为差异，新开发应以默认模式和 `docs-user-api/http-server.md` 为准。

## 6. Vision CLI

OCR：

```bash
go run ./cmd/opendesk \
  -vision-ocr-image tests/desktopvision/fixtures/legacy-testmonkey-desktop.png \
  -vision-provider paddle \
  -vision-lang ch
```

检测目标文字：

```bash
go run ./cmd/opendesk \
  -vision-detect-ui-image tests/desktopvision/fixtures/legacy-testmonkey-desktop.png \
  -vision-target-text 发送 \
  -vision-provider paddle \
  -vision-lang ch
```

可调：

```text
-vision-min-confidence
-vision-include-raw
```

阅读：

```text
docs-user-api/vision.md
docs/implementation/ocr/provider-integration.md
```

## 7. macOS App 与权限

构建固定 App：

```bash
./scripts/build_macos_app.sh
```

默认输出：

```text
dist/opendesk
dist/OpenDesk.app
```

启动 App：

```bash
open dist/OpenDesk.app
```

带参数启动：

```bash
./scripts/open_macos_app.sh \
  -script examples/mac/request-macos-permissions.js \
  -timeout 2
```

需要重新处理权限时可查看：

```text
scripts/reset_macos_permissions.sh
scripts/run_permission_bootstrap.sh
docs/implementation/macos/screenshot-troubleshooting.md
docs/implementation/macos/automation-config.md
```

## 8. 测试

Go 回归：

```bash
go test ./...
```

项目 smoke：

```bash
./scripts/e2e_smoke.sh
```

浏览器自动化测试规范：

```text
docs/quality/browser-automation/test-matrix.md
docs/quality/browser-automation/http-smoke.md
```

整体质量门禁：

```text
docs/quality/gates-and-evidence.md
docs/quality/testing-guide.md
```

## 9. 下一步阅读

脚本/API 使用：

```text
docs-user-api/index.md
docs-user-api/cookbook.md
docs-user-api/runtime-api.ai.json
```

项目工程文档：

```text
docs/README.md
```

桌面自动化架构：

```text
docs/architecture/desktop-automation/
```

WeChat 场景：

```text
docs/scenarios/wechat/
```

MCP：

```text
docs/integrations/mcp/
```

## 10. 文档事实规则

遇到冲突时按以下顺序判断：

```text
当前源码 / 测试 / 运行证据
-> 当前 canonical docs
-> Research / Plans / Reports
-> Archive / Git history
```

不要从历史 TestMonkey 文档、已归档报告或旧 Prompt 反推当前 API 行为。
