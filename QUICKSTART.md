# OpenDesk Quick Start

本页只保留当前可验证的启动和调试主路径。完整 API 说明见 `docs/api/`，项目设计与质量规范见 `docs/`。

## 0. 先选择正确入口

OpenDesk（不是 `opendesc`）是本地桌面自动化 Runtime，同时提供官方 Desktop 产品、脚本入口、
HTTP/MCP/AI CLI 等调用方式。不要把这些入口混成一个概念：

| 目标 | 推荐入口 | 说明 |
| --- | --- | --- |
| 普通用户使用 OpenDesk Desktop | 启动 `OpenDesk.app` | 自动加载 bundle 内官方 App Mode，显示 OpenDesk 主界面和统一 Tray/App Shell |
| 一次运行确定性自动化 | `opendesk -script task.js` | 普通 JavaScript Runtime execution |
| 开发/验证自定义 App Mode | `opendesk -app ./my-app` | `opendesk.app.json` + `main.js` + assets |
| 让其他本机程序触发任务 | `opendesk -http -port 60844` | 显式 headless/integration 模式 |
| Coding Agent / Codex 调桌面能力 | `opendesk ai ...` | 低 Token JSON CLI surface |

核心分层是：

```text
Product / User Task
→ Runtime / Execution Mode
→ Public API
→ Protocol / CLI
→ Internal implementation
```

因此：

```text
OpenDesk Desktop != -http
App Mode          != automation.app API
automation.app    != App（外部桌面应用自动化）
```

App Mode 与 App Shell 的正式说明见 `docs/api/app-shell.md`；当前 App Mode execution 的
JavaScript API 见 `docs/api/automation-app.md`。

## 1. macOS Desktop 安装与第一次使用

### 已经拿到 `OpenDesk.app`

1. 在 Finder 中把 `OpenDesk.app` 拖到“应用程序”目录。只保留并长期使用一个固定副本，例如：

   ```text
   /Applications/OpenDesk.app
   ```

2. 启动：

   ```bash
   open /Applications/OpenDesk.app
   ```

   当前官方发行构建默认把 `apps/opendesk` 打包到：

   ```text
   OpenDesk.app/Contents/Resources/AppMode/
   ```

   无参数启动时 Runtime 会自动发现这个 bundled App Mode。正常产品链路是：

   ```text
   OpenDesk.app
   → OpenDesk Runtime
   → bundled App Mode
   → 一个 App Shell / Tray
   → OpenDesk 主界面（自动化）
      + Recorder
      + Scheduler Center
      + Developer / Official actions
   ```

   所以“OpenDesk.app 只启动固定 `60844` HTTP/Scheduler、没有业务窗口”属于旧模型，不要再按
   这个模型判断启动是否成功。主窗口关闭/隐藏也不等于 Quit；正式退出由 OpenDesk Tray/Menu
   的退出动作负责。

3. 第一次截图、录制或控制其他应用时，按 macOS 提示授予对应权限。长期使用时权限应绑定固定的
   `/Applications/OpenDesk.app`（当前 Bundle ID `com.opendesk.cli`），而不是 Terminal、Codex 或
   临时 `go run` 二进制。权限说明见
   [`docs/implementation/macos/automation-config.md`](docs/implementation/macos/automation-config.md)。

### 从源码构建并安装

下面命令均从仓库根目录执行。构建者需要 Go；普通用户只需要已经构建好的 App：

```bash
./scripts/build_macos_app.sh
```

输出是：

```text
dist/opendesk
dist/OpenDesk.app
```

官方 builder 在 `APP_MODE_PACKAGE` 未显式覆盖时默认选择 `apps/opendesk`，并只把该 package 的
release runtime payload 放入 bundle。验证源码 package：

```bash
./dist/opendesk app validate apps/opendesk --json
```

启动本次构建：

```bash
open dist/OpenDesk.app
```

安装到 `/Applications` 后可验证图标资源、Info.plist 和签名：

```bash
APP_BUNDLE=/Applications/OpenDesk.app bash scripts/test_app_icons.sh
```

### 开发时显式运行官方 App Mode

正式 bundle 无需手工提供 `-app`；源码开发或验收时可以显式运行同一个 package：

```bash
./dist/opendesk -app apps/opendesk -allow-recorder-capture -console-mode script
```

`-console-mode script` 只是开发时的终端输出选择，不定义正式 Desktop UX。

### 使用 OpenDesk Inspector

Inspector 由当前 OpenDesk Runtime 提供。从 Desktop 产品的 **Developer** 菜单打开 Inspector
最稳妥，不要猜测内部 Runtime 端口。本机 `local-only` 页面会自动连接，失败时可使用页面上的重试动作；
开发模式下也可以根据 Runtime 输出的实际地址（endpoint）打开对应页面。菜单会为每次打开附加一个不含
凭证的唯一 `launch` 查询，以强制已有浏览器标签重新导航；页面加载后会立即清除该查询。

正式 App Mode P0 保持 local-only，只监听 `127.0.0.1`，Developer 菜单不提供 LAN 开关或 LAN URL。
不要使用反向代理、Host 改写、端口转发或公网地址扩大该边界。LAN 能力只有在同一 App Local Services
listener 上完成受保护 control 与 child-execution token isolation 后才会作为后续版本进入产品。
Inspector 不授予脚本执行、Scheduler、MCP 或通用 Runtime 权限。更完整的安全边界见
[`docs/integrations/desktop-agent.md`](docs/integrations/desktop-agent.md)。

### 一次性运行脚本

一次性脚本可以直接使用 Runtime CLI：

```bash
./dist/opendesk -script /absolute/path/to/task.js
```

如果希望通过已安装 App 的固定 macOS 身份执行，可以把参数传给 bundle executable：

```bash
open -n /Applications/OpenDesk.app --args -script /absolute/path/to/task.js -timeout 30
```

### 可选：安装全局 `opendesk` 命令

如果经常从终端运行脚本，可以在仓库根目录安装一个**每用户**的 `opendesk` 命令：

```bash
bash scripts/install_macos_cli.sh
```

它默认写入 `~/.local/bin/opendesk`，不会复制主程序，也不会改写 shell 配置或覆盖别的同名
命令。这个启动器始终执行 `/Applications/OpenDesk.app/Contents/MacOS/opendesk`，因此替换同一路径
下的新版 App 后无需重新安装命令。

确认 `~/.local/bin` 已在 PATH 后，可直接运行：

```bash
opendesk -script examples/notifications/send.js
```

刷新受管理启动器使用 `--update`，移除它使用：

```bash
bash scripts/install_macos_cli.sh --uninstall
```

### 可选：显式 HTTP 集成模式

HTTP 适合让其他本机程序触发 OpenDesk，它不是 Desktop App Mode 的产品主入口。显式启动：

```bash
./dist/opendesk -http -port 60844
```

检查状态：

```bash
curl http://127.0.0.1:60844/status
```

提交 JavaScript execution：

```bash
curl -X POST http://127.0.0.1:60844/executions \
  -H 'Content-Type: application/json' \
  -d '{"script":"console.log(\"hello from HTTP\")","timeout":30}'
```

不要把这个显式 `-http` 的 `60844` 默认端口反推成 Desktop 内部 Runtime 的固定端口。
HTTP 接口也不是登录型公网 API；不要直接暴露到互联网或不可信网络。

### Scheduler

普通 Desktop 用户优先使用 **Scheduler Center**。它属于官方 `apps/opendesk` App Mode 的产品 UI，
不是要求用户先打开旧 Web Scheduler 才能使用计划任务。

显式 `-http` 模式仍保留 Scheduler HTTP/Web 集成能力，供 headless/外部程序场景使用。Scheduler
行为、协议边界和实现架构分别见：

```text
docs/api/scheduler.md
docs/api/scheduler-api.md
docs/architecture/scheduler-runtime-concurrency.md
```

## 2. 构建

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

## 3. 执行 JavaScript

### 文件

```bash
./dist/opendesk -script examples/notifications/send.js
```

### Inline source

```bash
./dist/opendesk -script-text "console.log('inline run')"
```

### stdin

```bash
printf "console.log('stdin run')\n" | ./dist/opendesk -script-stdin
```

规则：`-script`、`-script-text`、`-script-stdin` 一次只能选择一个。

## 4. 输出与执行证据

低噪音 Agent 模式：

```bash
./dist/opendesk \
  -script-text "console.log('agent run')" \
  -console-mode agent
```

JSON 输出：

```bash
./dist/opendesk \
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

交互终端默认按日志类别自动配色；管道和重定向自动保持纯文本。可按单次命令覆盖：

```bash
./dist/opendesk -script-text "console.log('colored')" -color always
./dist/opendesk -script-text "console.log('plain')" -color never
```

非空 `NO_COLOR` 会关闭默认的 `auto` 配色；未设置它时也可用 `FORCE_COLOR=1` 强制开启。
Agent/JSON 输出始终无颜色控制码。

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
./dist/opendesk \
  -script-text "console.log('custom logs')" \
  -log-dir .runtime/debug/my-run
```

保存本次执行脚本：

```bash
./dist/opendesk \
  -script-text "console.log('snapshot')" \
  -save-last-script .runtime/debug/last-script.js
```

## 5. JavaScript Runtime 与 Execution

新脚本直接使用默认 Runtime，不要指定 `-stack`。查看本次运行上下文：

```bash
./dist/opendesk -script-text "console.log(JSON.stringify({id: Execution.id, artifactDir: Execution.artifactDir}))"
```

`Execution.input`、`workdir`、源码 hash 和 artifact 规则见 `docs/api/execution.md`；异步完成、
取消和资源清理见 `docs/api/runtime.md`。

当前 Runtime 已支持 `.mjs` 入口、静态相对 `import` / `export` 和可见 profile `node_modules` 中的
package resolution；不要把它描述成“全部 ESM 都不支持”。当前 P0 仍不承诺任意动态 `import()`、
module-level top-level await、Node 内置模块、native `.node`、远程 URL import 或 npm 自动安装。

## 6. HTTP 模式

启动：

```bash
./dist/opendesk -http -port 60844
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
docs/api/http-server.md
```

### Scheduler

显式 HTTP 模式提供 Scheduler 的 Web/API 集成入口；普通 Desktop 使用优先走 Scheduler Center。
完整用户说明见 `docs/api/scheduler.md`，HTTP protocol 见 `docs/api/scheduler-api.md`。

### Legacy HTTP

只有需要验证历史兼容行为时才使用：

```bash
USE_DI_CONTAINER=0 ./dist/opendesk -http -port 60844
```

新开发应以默认模式和 `docs/api/http-server.md` 为准。

## 7. Vision CLI

OCR：

```bash
./dist/opendesk \
  -vision-ocr-image tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png \
  -vision-provider apple \
  -vision-lang ch
```

检测目标文字：

```bash
./dist/opendesk \
  -vision-detect-ui-image tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png \
  -vision-target-text 你好 \
  -vision-provider apple \
  -vision-lang ch
```

可调：

```text
-vision-min-confidence
-vision-include-raw
```

阅读：

```text
docs/api/vision.md
docs/implementation/ocr/provider-integration.md
```

## 8. App Mode、App Builder 与 macOS 权限

### App Mode 开发

一个普通 App Mode package 的核心是：

```text
my-app/
├── opendesk.app.json
├── main.js
└── assets/...
```

开发时：

```bash
./dist/opendesk app validate ./my-app
./dist/opendesk app doctor ./my-app
./dist/opendesk -app ./my-app -console-mode script
```

App Mode 是 Runtime execution mode；`automation.app.*` 是当前 App Mode execution 与自己 App Shell
通信的 JavaScript API。不要通过 `automation.app.getCapabilities()`“启动 App Mode”或创建 Shell。

### macOS 固定 App

构建官方固定 App：

```bash
./scripts/build_macos_app.sh
```

默认输出：

```text
dist/opendesk
dist/OpenDesk.app
```

启动：

```bash
open dist/OpenDesk.app
```

需要重新处理权限时查看：

```text
scripts/reset_macos_permissions.sh
scripts/run_permission_bootstrap.sh
docs/implementation/macos/screenshot-troubleshooting.md
docs/implementation/macos/automation-config.md
```

完整 App Mode/App Builder 文档：

```text
docs/api/app-shell.md
docs/api/automation-app.md
docs/api/script-app-packaging.md
docs/api/app-builder.md
docs/api/app-package-cli.md
```

## 9. AI / Coding Agent CLI

常用命令：

```bash
./dist/opendesk ai capabilities
./dist/opendesk ai windows
./dist/opendesk ai screenshot --window-title "TextEdit"
./dist/opendesk ai mouse click --window-title "TextEdit" --x 300 --y 200
./dist/opendesk ai keyboard type --text "Hello"
./dist/opendesk ai run workflows/macos/calculator/calculate-and-reuse-result.js
```

完整 contract：

```text
docs/api/ai-cli.md
```

## 10. 测试

Go 回归：

```bash
go test ./...
```

Runtime API contract：

```bash
make check-api-docs-contract
./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

项目非 UI smoke：

```bash
./dist/opendesk -script scripts/e2e_smoke.js -console-mode script
```

真实 macOS App probe 仅在显式 opt-in 时运行，且仍需检查生成截图才能给出视觉结论：

```bash
OPENDESK_LIVE_E2E=1 ./dist/opendesk -script scripts/e2e_smoke.js -console-mode script
```

整体质量门禁：

```text
docs/quality/gates-and-evidence.md
docs/quality/testing-guide.md
```

## 11. 下一步阅读

脚本/API 使用：

```text
docs/api/agent/README.md
docs/api/index.md
docs/api/cookbook.md
```

Agent 从 `docs/api/agent/README.md` 按当前业务步骤展开；用户总导航与 Cookbook 按需读取，不是顺序必读清单。`docs/api/runtime-api.ai.json` 保留程序解析与校验用途，不作为默认全文阅读输入。

项目工程文档：

```text
docs/README.md
```

桌面自动化架构：

```text
docs/architecture/desktop-automation/
```

MCP：

```text
docs/integrations/mcp/
```

## 12. 文档事实规则

遇到冲突时按以下顺序判断：

```text
当前源码 / 测试 / 运行证据
-> 当前 canonical docs
-> Research / Plans / Reports
-> Archive / Git history
```

不要从历史 TestMonkey 文档、已归档报告或旧 Prompt 反推当前 API 行为。
