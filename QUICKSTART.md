# OpenDesk Quick Start

本页只保留当前可验证的启动和调试主路径。完整 API 说明见 `docs/api/`，项目设计与质量规范见 `docs/`。

## 0. 先理解 OpenDesk 是什么

OpenDesk（不是 `opendesc`）不是被操作的微信、Safari、Finder 等目标应用，也不是安装后
自动替用户完成任务的聊天机器人。它是一个运行在本机的桌面自动化运行时：JavaScript
脚本可以通过它操作窗口、鼠标、键盘、截图、OCR、文件、网络和系统能力；外部程序还可以
通过 HTTP，Agent 可以通过 MCP，调用同一套执行能力。

### Mac 桌面应用解决什么问题

`OpenDesk.app` 主要提供三个价值：

1. **固定的 macOS 应用身份**：桌面自动化需要“辅助功能”“屏幕录制”和按场景需要的
   “自动化”权限。长期使用固定的 App 身份，比反复从 `go run`、Terminal 或临时二进制
   启动更容易保持权限稳定。
2. **常驻的本机服务入口**：无参数双击启动时，App 默认启动 HTTP 服务，监听
   `60844` 端口，供本机脚本、其他程序或管理页面调用。
3. **持久化定时任务**：HTTP 模式内置 Scheduler，任务保存在
   `~/.opendesk/opendesk/scheduler.db`，重启 OpenDesk 后可以恢复任务状态。

它不等于以下功能：

- 不会自动识别并操作任意桌面应用；必须由 JavaScript、HTTP 请求、Scheduler 任务或 MCP
  调用触发；
- 不会替代微信、Safari、Finder 等目标应用；
- 当前版本不会自动安装 launchd、systemd 或 Windows Task Scheduler，也不负责崩溃后自动
  重启；
- 它的 HTTP 服务不是登录型云服务。默认监听 `:60844`，不要把它直接暴露到互联网或不
  可信局域网；Scheduler 管理页和 Scheduler API 只允许 loopback 请求。

### “长时间运行”具体指什么

这里的长时间运行，指 **OpenDesk 进程持续在线等待请求或定时任务**，不是指某一个脚本
必须一直占用进程。进程空闲时不会主动操作桌面；收到 HTTP execution 或 Scheduler 到期
后才启动一次 JavaScript 执行。单次执行完成后，HTTP 服务仍继续运行，直到用户退出 App
或停止进程。

普通使用可以按下面三种方式选择：

| 需求 | 使用方式 | 结果 |
| --- | --- | --- |
| 偶尔运行一次脚本 | App 带 `-script` 参数启动 | 执行完成后退出 |
| 从另一个本机程序触发 OpenDesk | App 无参数常驻，再调用 `/executions` | OpenDesk 等待并执行 HTTP 请求中的 JS |
| 每天/每隔一段时间执行 | App 无参数常驻，打开 `/scheduler` | 在管理页创建并管理持久化任务 |

如果只是第一次体验，建议先走“安装并启动”与 Scheduler 管理页；不需要先学习所有 API。

## 1. Mac 安装与第一次使用

### 已经拿到 `OpenDesk.app`

1. 在 Finder 中把 `OpenDesk.app` 拖到“应用程序”目录。只保留并长期使用一个固定副本，
   例如 `/Applications/OpenDesk.app`。
2. 双击这个 App。它的主要入口不是业务操作窗口，而是本机 HTTP 服务。HTTP socket 和
   Scheduler 都就绪后，菜单栏会出现带 OpenDesk 图标的 **OpenDesk** 状态项；点击它可以
   打开状态页、Scheduler 或退出服务。这个状态项出现才表示启动完成：App 不会保留 Dock
   图标，也不会打开业务窗口，这是常驻后台服务的正常行为，不是卡死。

   状态页是：

   ```text
   http://127.0.0.1:60844/status
   ```

   能返回 `"status":"ok"` 且 `"scheduler":true` 的 JSON 就表示服务已启动。定时任务管理页是：

   ```text
   http://127.0.0.1:60844/scheduler
   ```

   正常再次双击会复用已运行的 OpenDesk，不会再启动第二个 HTTP 服务。若仍弹出
   “OpenDesk did not start”，说明端口由未知或不健康的进程占用；可先检查
   `http://127.0.0.1:60844/status`，再从菜单栏选择 **Quit OpenDesk** 或改用其他端口。
   不要把无窗口或无 Dock 图标当成失败。

3. 第一次执行截图或控制其他应用时，按 macOS 提示授予“辅助功能”“屏幕录制”和需要的
   “自动化”权限。权限应授予固定的 `/Applications/OpenDesk.app`（Bundle ID
   `com.opendesk.cli`），而不是 Terminal、Codex 或临时 `go run` 二进制。权限排查见
   [`docs/implementation/macos/automation-config.md`](docs/implementation/macos/automation-config.md)。

### 从源码构建并安装

下面命令均从仓库根目录执行。构建者需要 Go；普通用户只需要得到构建好的 App：

```bash
./scripts/build_macos_app.sh
```

输出是 `dist/OpenDesk.app`。构建脚本不会自动复制到系统“应用程序”目录；请在 Finder
中把它拖入 `/Applications`，然后从该固定位置启动：

```bash
open /Applications/OpenDesk.app
```

安装完成后，Finder 的“应用程序”图标网格应显示 OpenDesk 的彩色应用图标，而不是通用空白
App 图标。构建者还可以从仓库根目录验证已安装 bundle 的图标资源、Info.plist 和签名：

```bash
APP_BUNDLE=/Applications/OpenDesk.app bash scripts/test_app_icons.sh
```

### 一次性运行脚本

一次性脚本使用绝对路径最稳妥。下面命令会使用固定 App 身份执行脚本，执行完成后退出，
不会把 OpenDesk 作为 HTTP 服务长期挂起：

```bash
open -n /Applications/OpenDesk.app --args -script /absolute/path/to/task.js -timeout 30
```

### 可选：安装全局 `opendesk` 命令

如果经常从终端运行脚本，可以在仓库根目录安装一个**每用户**的 `opendesk` 命令：

```bash
bash scripts/install_macos_cli.sh
```

它默认写入 `~/.local/bin/opendesk`，不会复制主程序，也不会改写 shell 配置或覆盖别的同名
命令。这个小型启动器始终执行 `/Applications/OpenDesk.app/Contents/MacOS/opendesk`，所以 macOS
权限身份和 App bundle 内的 `opendesk-ui-host` 保持匹配；把新版 App 替换到同一位置后，下次运行
会自动使用新版，无须重新安装命令。

确认 `~/.local/bin` 已在新开的终端 PATH 中后，可从仓库根目录直接运行交互示例：

```bash
opendesk -ui -script examples/custom-ui/floating-toolbar-wrap-demo.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-wrap-demo
```

安装器发现已有但不带 OpenDesk 管理标记的 `opendesk` 时会停止，不会覆盖它。指定另一个 App
或命令目录时使用 `--app-bundle /absolute/path/OpenDesk.app --bin-dir /absolute/path/bin`；刷新受
管理启动器使用 `--update`，移除它使用：

```bash
bash scripts/install_macos_cli.sh --uninstall
```

若你曾按旧版临时步骤在 `/usr/local/bin/opendesk` 创建了启动器，安装器不会自动接管它。只有
该文件与旧版临时启动器逐字一致时，才可显式迁移：

```bash
bash scripts/install_macos_cli.sh --adopt-legacy-launcher --bin-dir /usr/local/bin
```

全局命令只适合固定的 `/Applications/OpenDesk.app`。开发当前源码、调试未安装 build 或需要成对
验证主程序和 UI host 时，仍应使用 `./scripts/build_macos_app.sh` 生成的 bundle 或仓库内成对 build。

### 常驻服务与 HTTP 调用

无参数启动后，OpenDesk 会持续运行 HTTP 服务。菜单栏的 OpenDesk 状态项是日常的启动完成
提示；先检查状态：

```bash
curl http://127.0.0.1:60844/status
```

再由其他本机程序提交一段 JavaScript：

```bash
curl -X POST http://127.0.0.1:60844/executions \
  -H 'Content-Type: application/json' \
  -d '{"script":"console.log(\"hello from HTTP\")","timeout":30}'
```

HTTP 响应中的 `executionId`、`statusUrl`、`summaryUrl` 和 `streamUrl` 可用于查询执行
状态、摘要和实时事件。HTTP 是“让其他程序触发 OpenDesk”的集成方式；它不是 OpenDesk
必须依赖的运行方式，直接运行 JavaScript 仍然可以完成同样的桌面操作。

### 用 Scheduler 做定时任务

浏览器打开：

```text
http://127.0.0.1:60844/scheduler
```

普通用户优先选择“内联代码”，输入要执行的 JavaScript，再选择一次执行、间隔或 Cron。
内联代码会保存到 Scheduler 数据库，重启 OpenDesk 后仍可恢复。脚本文件任务则要求脚本
位于 OpenDesk 进程当前工作目录内；如果从 Finder 启动安装在 `/Applications` 的 App，
第一次使用建议先用内联代码，避免工作目录造成混淆。

Scheduler 只在 OpenDesk 进程运行时实际调度；退出 App 后不会继续执行，重新启动 App
后会按任务的 misfire 策略恢复。完整说明见 [`docs/api/scheduler.md`](docs/api/scheduler.md)。

### 退出和安全提醒

- 不需要服务时，在菜单栏点击 **OpenDesk → Quit OpenDesk**。它会向主进程发送正常的
  终止信号并停止 HTTP 和 Scheduler；正在运行的执行会进入关闭流程。
- HTTP 端口默认是 `60844`。正常再次双击会复用现有 OpenDesk；如果端口由未知进程占用，
  请先检查并停止该进程，或用其他端口启动：`open -n /Applications/OpenDesk.app --args -http -port 60845`。
- 不要把 `0.0.0.0:60844` 当成可直接提供给公网或不可信设备的 API；当前 HTTP 接口没有
  用户登录认证。

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

## 4. 输出与执行证据

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

## 5. Browser compatibility stack

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
docs/api/runtime.md
docs/architecture/browser-automation/capabilities.md
docs/architecture/browser-automation/stack.md
```

## 6. HTTP 模式

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
docs/api/http-server.md
```

### Scheduler

HTTP 模式会自动创建并恢复内置 Scheduler。打开：

```text
http://127.0.0.1:60844/scheduler
```

它支持一次执行、fixed-delay 间隔与五字段 Cron，并可暂停、恢复、立即运行和删除。
任务保存在 `~/.opendesk/opendesk/scheduler.db`；SQLite 已嵌入二进制，无需另行安装。
完整说明见 `docs/api/scheduler.md`。

### Legacy HTTP

只有需要验证历史兼容行为时才使用：

```bash
USE_DI_CONTAINER=0 go run ./cmd/opendesk -http -port 60844
```

Legacy 模式和默认 container 模式存在路由/行为差异，新开发应以默认模式和 `docs/api/http-server.md` 为准。

## 7. Vision CLI

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
docs/api/vision.md
docs/implementation/ocr/provider-integration.md
```

## 8. macOS App 与权限

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

## 9. 测试

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

## 10. 下一步阅读

脚本/API 使用：

```text
docs/api/index.md
docs/api/cookbook.md
docs/api/runtime-api.ai.json
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

## 11. 文档事实规则

遇到冲突时按以下顺序判断：

```text
当前源码 / 测试 / 运行证据
-> 当前 canonical docs
-> Research / Plans / Reports
-> Archive / Git history
```

不要从历史 TestMonkey 文档、已归档报告或旧 Prompt 反推当前 API 行为。
