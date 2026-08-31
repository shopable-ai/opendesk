# Clawdesk

Clawdesk 是一个以 Go 为核心、向 JavaScript 注入桌面自动化能力的运行时。它可以通过脚本、HTTP 和 MCP 使用窗口、输入、截图、视觉/OCR、文件、网络和系统能力，并提供 execution evidence、日志与回放相关基础设施。

## 快速开始

### 运行脚本

```bash
go run . -script examples/notify.js
```

直接执行 JavaScript：

```bash
go run . -script-text "console.log('hello from clawdesk')"
```

从 stdin 执行：

```bash
printf "console.log('hello from stdin')\n" | go run . -script-stdin
```

三种脚本入口一次只使用一个：

```text
-script
-script-text
-script-stdin
```

### Agent 友好输出

```bash
go run . \
  -script-text "console.log('agent run')" \
  -console-mode agent
```

或：

```bash
go run . \
  -script-text "console.log('agent run')" \
  -output-format json
```

默认执行产物位于：

```text
.runtime/runs/<executionId>/
```

包括：

```text
script_snapshot.js
stdout.log
stderr.log
summary.json
agent_summary.json
events.ndjson
```

### Browser compatibility stack

```bash
go run . -script examples/browser_stack_legacy_smoke.js -stack legacy
go run . -script examples/browser_stack_upgraded_smoke.js -stack upgraded
go run . -script examples/browser_stack_playwright_smoke.js -stack playwright
```

`upgraded` / `playwright` 是 compatibility facade，不应理解为完整 Playwright 浏览器引擎。详细边界见：

```text
docs-user-api/runtime.md
docs/architecture/browser-automation/
```

## HTTP 服务

启动：

```bash
go run . -http -port 60844
```

当前默认 container 模式提供：

```text
POST /SCRIPT_RUN
POST /executions
GET  /executions/{id}
GET  /executions/{id}/summary
GET  /executions/{id}/events
GET  /status
POST /vision/ocr
POST /vision/detect-ui
```

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

完整接口说明：

```text
docs-user-api/http-server.md
```

`USE_DI_CONTAINER=0` 会切换到历史兼容 HTTP 实现；新开发不要依赖 legacy-only 路由差异。

## Vision / OCR CLI

OCR：

```bash
go run . \
  -vision-ocr-image fixtures/desktopvision/legacy-testmonkey-desktop.png \
  -vision-provider paddle \
  -vision-lang ch
```

UI 文本检测：

```bash
go run . \
  -vision-detect-ui-image fixtures/desktopvision/legacy-testmonkey-desktop.png \
  -vision-target-text 发送 \
  -vision-provider paddle \
  -vision-lang ch
```

用户 API：

```text
docs-user-api/vision.md
docs-user-api/image-color.md
```

## macOS

长期使用桌面自动化时，建议使用固定 App 身份，避免 `go run` 临时可执行路径导致 TCC 权限主体变化。

构建：

```bash
./scripts/build_macos_app.sh
```

启动：

```bash
open dist/Clawdesk.app
```

需要带脚本参数时可使用：

```bash
./scripts/open_macos_app.sh -script examples/mac/request-macos-permissions.js -timeout 2
```

相关文档：

```text
docs/implementation/macos/automation-config.md
docs/implementation/macos/screenshot-troubleshooting.md
docs/implementation/macos/gocv-build-guide.md
```

## 测试

基础回归：

```bash
go test ./...
```

项目已有 e2e smoke 入口：

```bash
./scripts/e2e_smoke.sh
```

浏览器自动化质量与 smoke：

```text
docs/quality/browser-automation/test-matrix.md
docs/quality/browser-automation/http-smoke.md
```

整体质量规则：

```text
docs/quality/gates-and-evidence.md
docs/quality/testing-guide.md
docs/quality/failure-taxonomy.md
```

## 文档

### 项目与工程文档

入口：

```text
docs/README.md
```

当前分类：

```text
docs/
├── project/
├── architecture/
├── implementation/
├── quality/
├── integrations/
├── scenarios/
├── research/
├── plans/
└── maintenance/
```

### 用户 API 文档

唯一正式用户 API 文档根：

```text
docs-user-api/
```

推荐入口：

```text
docs-user-api/index.md
docs-user-api/cookbook.md
docs-user-api/runtime-api.ai.json
```

JavaScript Runtime API contract、unit、safe smoke、Safari live 与 acceptance 测试位于
`tests/runtime-api/`，入口为 `scripts/test_runtime_apis.sh`；一次性证据只写入
`.runtime/tests/runtime-api/`。旧 `scripts/test_host_apis.sh` 仅保留为 deprecated 兼容包装器。

编辑器声明位于：

```text
types/*.d.ts
jsconfig.json
```

## 仓库主要目录

```text
automation/      # 桌面/视觉/系统等 runtime primitives
pkg/             # execution、HTTP、container 等核心包
polyfills/       # JavaScript runtime polyfills
jslibs/          # 内置 JS libraries
types/           # VS Code / TypeScript 声明
examples/        # 可执行示例
scripts/         # 构建、权限和 smoke 脚本
docs/            # 项目/工程文档
docs-user-api/   # 用户 API 文档
tests/**/fixtures # 按测试领域归属的可复用 fixture
docs/quality/    # 正式质量报告与评审结论
docs/research/external/ # 外部参考 manifest
.runtime/        # 运行期输出
.archive/        # 历史材料
prompts/         # 仍维护的 AI orchestration prompts
```

## 文档与事实规则

- 当前源码和可复现测试/运行证据优先于历史文档。
- 用户 API 只维护在 `docs-user-api/`；任何退役接口文档均不得恢复或作为事实源。
- 报告、Prompt、运行日志和历史总结不要直接堆进 `docs/` 根目录；正式质量报告归入 `docs/quality/` 对应领域，运行报告归入 `.runtime/`。
- 当前文档不要使用 `_V2`、`FINAL`、`COMPLETE_SUMMARY` 等文件名保存版本历史；版本历史由 Git 负责。

仓库文档治理规则见：

```text
docs/maintenance/repository-documentation-map.md
docs/maintenance/repo-file-lifecycle-policy.md
```
