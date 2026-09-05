# OpenDesk JavaScript Runtime API Conformance Lab

页面产品名为 **OpenDesk Runtime API Test Lab**。`tests/runtime-api/` 是稳定、可维护的
JavaScript Runtime API 测试源码；任何一次性日志、截图、生成脚本、状态和运行证据只写入
`.runtime/tests/runtime-api/<runId>/`，不得纳入版本控制。

API 事实源按优先级为：当前源码和实际 Runtime 行为、`docs/api/*.md`、
`docs/api/runtime-api.ai.json`、`types/*.d.ts`。只有这些正式来源可以作为测试输入；
不得恢复或使用任何退役接口文档。

## 普通示例运行与正式 gate 的边界

公开 Dialog 示例的普通体验从仓库根目录只运行一条命令，例如：

```bash
./opendesk -ui -script examples/dialog.js -console-mode script
```

这条命令必须先由维护者使用当前的一对 `opendesk` / `opendesk-ui-host` 原样验证，并人工观察
关键窗口的排版。下面的 conformance gate 会构建隔离的 run-local binary，并使用
WindowServer、AX controller、watchdog 和结构化证据验证行为；它是更严格的附加验收，但不能
证明根目录已有二进制是最新的，也不能替代公开命令和视觉质量检查。

Dialog 的视觉验收与行为验收分别判定：即使返回值、Promise 分支、exactly-once 和资源清理
全部正确，只要真实窗口出现异常拉宽、过高、大面积空白、裁切或控件错位，仍应报告视觉失败。
普通运行说明见 [`examples/README.md`](../../examples/README.md)，公开契约见
[`docs/api/dialog.md`](../../docs/api/dialog.md)。

## 分层和机器结果

| Gate | JavaScript 证明 | 机器结果 |
| --- | --- | --- |
| contract | 实际 Runtime、catalog、文档和类型声明没有未允许漂移 | `results/contract.json` |
| unit | 每个 API family 的独立 `.test.js` 安全行为 | `results/unit.json` |
| coverage | 每方法 contract、已通过 tier、required tier、风险理由和用例 | `results/coverage.json` |
| smoke | 安全公共路径与错误路径 | `results/smoke.json` |
| failure-exit | 普通 JS throw 快速非零、且不是 watchdog 124 | `results/failure-exit.json` |
| sound-cancel | 连续采样率播放后，同步 `Sound.play` 在真实 SIGINT 下快速取消并清空播放资源 | `sound-cancel/result.json` |
| command | 本地 execution 的直接程序执行、非零退出、输出上限、timeout，以及 SIGINT teardown 的进程树清理 | `results/command.json`、`runtime-logs/command*/resources.json` |
| live | Safari、权限、窗口身份、输入、剪贴板、HTTP 和截图 | `results/live.json` |
| notify-icon-live | 已安装 macOS Runtime 提交通知并保活 15 秒供图标取证 | `results/runtime-api-notify-icon-live.json` + 截图 |
| composition | 多控件、DOM/像素、截图、state/events 和移动窗口重放 | `results/composition.json` |
| custom-ui-config | 脚本旁/工作目录发现、显式配置、`-ui`/`-no-ui` 优先级及严格配置错误 | `custom-ui-config-cli/*.stdout.log`、`*.stderr.log` 与 `processes.json` |
| custom-ui | 随包 host、nonactivating show、状态/控件 round-trip、兼容 facade、缺 host 明确失败，并包含 custom-ui-config | `results/custom-ui.json`、`results/custom-ui-missing-host.json` 与 CLI 日志 |
| cleanup | 已记录 runtime/PGID/watchdog/fixture PID 均已退出 | `results/cleanup.json` |
| quality | 同 runId、同二进制 SHA 和真实证据驱动的 100/100 acceptance | `results/quality.json` 与 `summary.json` |

`contract` 仅证明公开形状；它不能代替 behavior 成功。catalog 和 coverage 会拒绝 Runtime
新增而未登记的方法、catalog 缺失的方法、重复或未知 ID、遗漏 family 文件、遗漏 required
tier，以及没有风险理由的 contract-only 接口。

## 运行

```bash
OPENDESK_BINARY=/absolute/path/to/audited/opendesk ./scripts/test_runtime_apis.sh contract
OPENDESK_BINARY=/absolute/path/to/audited/opendesk ./scripts/test_runtime_apis.sh unit
OPENDESK_BINARY=/absolute/path/to/audited/opendesk ./scripts/test_runtime_apis.sh smoke
OPENDESK_BINARY=/absolute/path/to/audited/opendesk ./scripts/test_runtime_apis.sh sound-cancel
OPENDESK_BINARY=/absolute/path/to/audited/opendesk ./scripts/test_runtime_apis.sh command
OPENDESK_BINARY=/absolute/path/to/audited/opendesk ./scripts/test_runtime_apis.sh custom-ui-config
OPENDESK_BINARY=/absolute/path/to/audited/opendesk ./scripts/test_runtime_apis.sh custom-ui
OPENDESK_BINARY=/absolute/path/to/audited/opendesk ./scripts/test_runtime_apis.sh dialog
OPENDESK_BINARY=/absolute/path/to/audited/opendesk ./scripts/test_runtime_apis.sh live
OPENDESK_BINARY=/absolute/path/to/OpenDesk.app/Contents/MacOS/opendesk ./scripts/test_runtime_apis.sh notify-icon-live
```

`dialog` 在 macOS 构建 run-local native host，并实际运行公开 JavaScript 的 disabled、严格
参数、non-blocking、single-flight、`.then/.catch/.finally`、prompt 真实键盘输入、输入值第二个
alert、prompt 取消 `null` 第二个 alert、exactly-once settlement 与 unobserved Promise teardown
测试。它的正式 run record 位于 `.runtime/tests/runtime-api/`；截图、WindowServer state 和 AX
layout/lifecycle probe 作为单独的本地实机证据保存在 `.runtime/tests/dialog/`。gate 会在首个
alert 仍可见且尚未 AXPress 时核对 owner EventLoop tick，并从 execution cleanup event 强制核对
worker、callback、timer、window、listener、driver sink 与 native host process 全部归零。
每个原生动作先由 test tool 读取当前 WindowServer/AX 状态，再由
`dialog-ax-controller.js` 按需调用公开 `keyboard.type()` 输入固定非秘密 fixture，再调用
`mouse.clickForPID()` 作一次 PID-scoped `AXPress`；
它不以 HTML mock、全局坐标 click 或脚本内 callback 冒充原生交互。

`sound-cancel` 运行正式 JavaScript 文件生成一段静音 WAV，先播放短提示音初始化共享 speaker，
再进入较长的同步 `Sound.play()`。外层 gate 看到 READY 后发送一次真实 SIGINT，并要求 Runtime
在 3 秒内以 `canceled` 结束，且 cleanup event 中的 sound worker、waiter 和 playback 全部归零。

`command` 使用本地 run-local CLI 的默认 `Command.run()` 能力。它覆盖直接执行、input/env、
stdout/stderr、非零退出、输出上限和 timeout，再启动包含后代的长时 fixture，由外层 gate 向 Runtime
发送 SIGINT，并要求 direct child、descendant、worker、Promise callback 和 process registry 全部
归零。HTTP、MCP 和 Scheduler 入口仍不会启用 `Command`。

即使设置了 `OPENDESK_BINARY`，runner 也不会直接从原目录执行它：先验证其为可执行普通
文件，记录原始绝对路径和 SHA-256，再复制到本次
`.runtime/tests/runtime-api/<runId>/bin/opendesk`，核对副本 SHA 后只执行该 run-local 副本。
这样通过名称调用的 Experimental Native Extension 会稳定解析到同级
`bin/native-extensions/`。`context.json` 的 `binary` 同时记录实际执行路径、SHA、
`provenance`、`originalPath` 和 `originalSha256`；默认源码构建也始终输出到同一个
run-local binary 路径，且 provenance 为 `source_build`。

`live` 从头执行全部 gate，最后才运行 quality/acceptance。它要求 macOS Accessibility 和
Screen Recording；Safari 必须处于可控状态。权限不足、窗口或控件身份不匹配、缺截图、证据
SHA 不一致、缺重放或清理失败都会非零退出。

`notify-icon-live` 是显式启用的 macOS 视觉检查：它必须指向已安装 `.app` 内的可执行文件，
提交带唯一 runId 的系统通知并保活 15 秒，以便捕获通知横幅。该 gate 证明通知已由 Runtime
成功提交；通知横幅中的实际图标仍需截图证据确认。

新变量：

```bash
OPENDESK_RUNTIME_API_LIVE_FILTER=page.test.js,composition.test.js
OPENDESK_RUNTIME_API_BROWSER_APP=Safari
```

旧 `HOST_API_LIVE_FILTER` 和 `HOST_API_BROWSER_APP` 可由兼容入口映射，但新文档只推荐上列
变量。`scripts/test_host_apis.sh` 只打印 deprecated 提示后 `exec` 新脚本，绝不维护第二套
测试实现。

## globalShortcut focused verification

从仓库根目录执行，并把普通体验、原生 gate 与确定性测试分开记录。

1. **普通手动体验（macOS）**：先运行一次 `make build`，再运行
   `./dist/opendesk -script examples/global-shortcut.js -console-mode script`。让另一个 App
   处于前台，按 `Command+Shift+e`，执行 `pbpaste` 确认剪贴板文本；按 `Ctrl-C` 正常结束以
   清理注册。该宿主须在 **System Settings → Privacy & Security → Accessibility** 与
   **Input Monitoring** 中允许后重启；后者支持 backend 的 HID listener（特别是 `F21`–`F24`）。
   普通快捷键测试不需要 Screen Recording 或 Automation。
2. **macOS 自动化原生 gate（维护者）**：运行
   `OPENDESK_BINARY=./dist/opendesk ./tests/runtime-api/global-shortcut-smoke-darwin.sh`。
   预期 shell log 在 `.runtime/tests/runtime-api/global-shortcut/global-shortcut-smoke.log`，
   Runtime evidence 在 `.runtime/runs/direct-*/global-shortcut-smoke.json`。运行宿主必须在
   System Settings 获得 Accessibility；若 macOS 提示，还要允许发起 System Events 的
   Automation。该 Automation 提示属于测试注入链路，不属于 `globalShortcut` API 本身。该 gate
   会切换 TextEdit 前台，不是普通使用步骤。
3. **确定性 Go / API 测试**：运行：

   ```bash
   go test ./automation -run '^(TestGlobalShortcut|TestDarwinGlobalShortcut)' -count=1
   go test ./pkg/execution -run '^TestRunJavaScriptGlobalShortcut' -count=1
   go test -race ./automation -run '^(TestGlobalShortcut|TestDarwinGlobalShortcut)' -count=1
   go test -race ./pkg/execution -run '^TestRunJavaScriptGlobalShortcut' -count=1
   ./scripts/test_runtime_apis.sh contract
   ./scripts/test_runtime_apis.sh unit
   ```

   Windows host 上可运行
   `go test ./automation -run '^TestWindowsGlobalShortcutPlatformMapping$' -count=1` 与 execution
   测试；Windows 系统级按键尚未 live verified。不要把 `go test ./...` 记录为通过：现有
   `pkg/visionrun` 仍依赖缺失的 `.runtime` preflight / real-validation artifacts。

## 安全边界与版本控制

关机、重启、睡眠、杀进程、关闭窗口、`AppStorage.clear`、通知、内置声音、未配置 provider
的 OCR/UI 识别和 `mouse.clickForPID` 成功路径，默认只能做 contract 或
安全错误路径。`clickForPID` 不能以 HTML 元素冒充 AXPress 成功；真实成功路径需要已审核的
原生 AX 控件、PID、窗口、AX capability 和业务结果。

Custom UI 的默认 unit gate 只验证 dormant `ui` 与 `UI_DISABLED`。显式 `custom-ui` gate 在
macOS 构建 run-local `clawdesk-ui-host`，运行真实原生 JavaScript 测试，包括 Button-first
五按钮顺序/自动布局、PID 定向真实点击、自定义同步/异步 callback、single-flight、状态切换、
结构化错误和非法参数；并另用无 host 的 run-local binary 证明 `UI_HOST_NOT_FOUND`。
`custom-ui-config` 使用独立 JavaScript 文件对 CLI 发现和优先级做黑盒验证；完整 `custom-ui`
gate 会同时运行它。全部仍由唯一正式入口启动。

建议纳入版本控制的正式资产：`tests/runtime-api/`、`scripts/test_runtime_apis.sh`、
`scripts/test_host_apis.sh`、`schemas/runtime-api/*.schema.json`、相关 Makefile/README/AGENTS、
以及 `docs/api/`、`types/` 修订。`.runtime/tests/runtime-api/` 中的任何文件都是本地运行产物。
