# OpenDesk

OpenDesk 是一个以 Go 为核心、向 JavaScript 注入桌面自动化能力的运行时。它可以通过脚本、HTTP 和 MCP 使用窗口、输入、截图、视觉/OCR、文件、网络和系统能力，并提供 execution evidence、日志与回放相关基础设施。

第一次以普通用户方式使用 Mac 桌面应用时，请先阅读
[`QUICKSTART.md`](QUICKSTART.md) 的“先理解 OpenDesk 是什么”和“Mac 安装与第一次使用”
两节；那里说明了 App、常驻 HTTP 服务、Scheduler 和一次性脚本之间的区别。

## 快速开始

### 运行脚本

```bash
go run ./cmd/opendesk -script examples/notify.js
```

直接执行 JavaScript：

```bash
go run ./cmd/opendesk -script-text "console.log('hello from opendesk')"
```

从 stdin 执行：

```bash
printf "console.log('hello from stdin')\n" | go run ./cmd/opendesk -script-stdin
```

三种脚本入口一次只使用一个：

```text
-script
-script-text
-script-stdin
```

### 全局快捷键示例

从仓库根目录先刷新一次可执行文件：

```bash
make build
```

随后运行这一条命令：

```bash
./dist/opendesk -script examples/global-shortcut.js -console-mode script
```

在 macOS 按 `Command+Shift+9`，终端会显示 `copied`，并把示例文本写入剪贴板；按
`Ctrl-C` 正常停止脚本会自动注销快捷键。这个普通体验不需要运行测试控制器、WindowServer
工具或 System Events 脚本。首次配置时，运行下列单独的引导（它调用
`page.requestPermissions({ section: 'globalShortcut', openSettings: true, strict: false })`）：

```bash
./dist/opendesk -script examples/global-shortcut-permission-setup.js -console-mode script
```

它只会为缺少的 Accessibility / Input Monitoring 权限打开设置；两项已授权时不会重复弹窗。
普通 `globalShortcut.register()` 不会隐式弹权限，也不需要 Screen Recording 或 Automation。
完整 API 契约见 [`docs/api/global-shortcut.md`](docs/api/global-shortcut.md)。

### 原生 Dialog 示例（macOS）

根目录已有由当前源码构建的 `./opendesk` 和同级 `./opendesk-ui-host` 时，可直接运行：

```bash
./opendesk -ui -script examples/dialog.js -console-mode script
```

Promise 链式 `.then()` / `.catch()` / `.finally()` 版本：

```bash
./opendesk -ui -script examples/dialog-promise-chain.js -console-mode script
```

两条命令任选其一。普通体验不需要切换到 `dist/`，也不需要运行 AX/窗口控制工具；完整的
操作顺序、预期终端输出、构建物新鲜度和自动化验收说明见
[`examples/README.md`](examples/README.md) 与
[`docs/api/dialog.md`](docs/api/dialog.md)。

### 客服纵向快捷回复示例（macOS）

工作目录必须是仓库根目录 `/Users/mac/Documents/workspace/clawdesk`。先按当前源码准备一次
主程序和 UI host：

```bash
go build -o ./opendesk ./cmd/opendesk && go build -o ./opendesk-ui-host ./cmd/opendesk-ui-host
```

构建物与当前源码对应后，原样执行下面这一行；它会打开五个从上到下排列的原生按钮，用户
点击按钮即可把不同快捷回复复制到系统剪贴板，关闭窗口后脚本结束：

```bash
./opendesk -ui -script examples/custom-ui/toolbar-vertical-quick-replies.js -console-mode script -log-dir .runtime/tests/custom-ui-vertical
```

vertical 工具栏固定为单列、最多五个按钮，超过上限会以 `INVALID_SPEC` 失败。正式
WindowServer/Accessibility gate 与截图证据使用 `./scripts/test_runtime_apis.sh custom-ui`，不要求
普通用户手工运行控制器或 watchdog。

### Agent 友好输出

```bash
go run ./cmd/opendesk \
  -script-text "console.log('agent run')" \
  -console-mode agent
```

或：

```bash
go run ./cmd/opendesk \
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

### AI / Coding Agent CLI

OpenDesk 也提供 `opendesk ai`：一个为 Codex、Claude Code 与 shell-based coding agents 设计的
低 Token JSON desktop-tool surface。

```bash
go run ./cmd/opendesk ai capabilities
go run ./cmd/opendesk ai windows
go run ./cmd/opendesk ai screenshot --window-title "TextEdit"
go run ./cmd/opendesk ai mouse click --window-title "TextEdit" --x 300 --y 200
go run ./cmd/opendesk ai keyboard type --text "Hello"
go run ./cmd/opendesk ai run examples/ai-cli/write-to-focused-app.js --input '{"text":"Hello"}'
```

运行 `go run ./cmd/opendesk ai schema` 可从 CLI 本身发现命令与参数。截图默认只返回 PNG artifact
路径，不在 stdout 输出 Base64。完整的 JSON contract、坐标空间、权限、Vision 和 recipe workflow
见 [`docs/api/ai-cli.md`](docs/api/ai-cli.md)。

### Browser compatibility stack

```bash
go run ./cmd/opendesk -script examples/browser_stack_legacy_smoke.js -stack legacy
go run ./cmd/opendesk -script examples/browser_stack_upgraded_smoke.js -stack upgraded
go run ./cmd/opendesk -script examples/browser_stack_playwright_smoke.js -stack playwright
```

`upgraded` / `playwright` 是 compatibility facade，不应理解为完整 Playwright 浏览器引擎。详细边界见：

```text
docs/api/runtime.md
docs/architecture/browser-automation/
```

## HTTP 服务

启动：

```bash
go run ./cmd/opendesk -http -port 60844
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
docs/api/http-server.md
```

`USE_DI_CONTAINER=0` 保留为 HTTP 路由兼容别名；它与默认模式共享同一执行、超时、事件、产物和错误语义。

## Vision / OCR CLI

OCR：

```bash
make build
./dist/opendesk \
	-vision-ocr-image tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png \
	-vision-provider apple \
  -vision-lang ch
```

UI 文本检测：

```bash
./dist/opendesk \
	-vision-detect-ui-image tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png \
	-vision-target-text 你好 \
	-vision-provider apple \
  -vision-lang ch
```

用户 API：

```text
docs/api/vision.md
docs/api/image-color.md
```

## macOS

长期使用桌面自动化时，建议使用固定 App 身份，避免 `go run` 临时可执行路径导致 TCC 权限主体变化。
OpenDesk.app 的主要作用是承载这个稳定身份，并可在无参数启动时提供本机 HTTP 服务和
Scheduler；它不是一个会自动操作其他 App 的业务窗口。双击安装在
`/Applications/OpenDesk.app` 的 App 后，服务真正监听 `60844` 且 Scheduler 就绪时，菜单栏会
显示带图标的 **OpenDesk** 状态项；其中可以打开状态页、Scheduler 或选择退出。没有业务窗口
和没有 Dock 图标是此后台服务的正常状态，不是启动失败。

构建：

```bash
./scripts/build_macos_app.sh
```

安装到 `/Applications` 后启动：

```bash
open /Applications/OpenDesk.app
```

启动完成以 `http://127.0.0.1:60844/status` 返回 `"status":"ok"` 与
`"scheduler":true` 为准；Scheduler 页面是 `http://127.0.0.1:60844/scheduler`。菜单栏选择
**Quit OpenDesk** 可优雅退出。Finder 的“应用程序”网格应显示彩色 OpenDesk 图标；构建者可从
仓库根目录运行 `APP_BUNDLE=/Applications/OpenDesk.app bash scripts/test_app_icons.sh` 检查图标
资源、Info.plist 和 ad-hoc 签名。首次辅助功能、屏幕录制或自动化授权应针对固定的
`com.opendesk.cli` App 身份，而不是 Terminal 或临时二进制。

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
docs/api/
```

推荐入口：

```text
docs/api/index.md
docs/api/cookbook.md
docs/api/runtime-api.ai.json
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
docs/api/   # 用户 API 文档
schemas/         # 分领域维护的 JSON Schema 数据契约
tests/**/fixtures # 按测试领域归属的可复用 fixture
docs/quality/    # 正式质量报告与评审结论
docs/research/external/ # 外部参考 manifest
.runtime/        # 运行期输出
.archive/        # 历史材料
prompts/         # 分领域维护的 AI orchestration prompts
```

## 文档与事实规则

- 当前源码和可复现测试/运行证据优先于历史文档。
- 用户 API 只维护在 `docs/api/`；任何退役接口文档均不得恢复或作为事实源。
- 报告、Prompt、运行日志和历史总结不要直接堆进 `docs/` 根目录；正式质量报告归入 `docs/quality/` 对应领域，运行报告归入 `.runtime/`。
- 当前文档不要使用 `_V2`、`FINAL`、`COMPLETE_SUMMARY` 等文件名保存版本历史；版本历史由 Git 负责。

仓库文档治理规则见：

```text
docs/maintenance/repository-documentation-map.md
docs/maintenance/repo-file-lifecycle-policy.md
```
