# OpenDesk JavaScript Runtime API Conformance Lab

页面产品名为 **OpenDesk Runtime API Test Lab**。`tests/runtime-api/` 是稳定、可维护的
JavaScript Runtime API 测试源码；任何一次性日志、截图、生成脚本、状态和运行证据只写入
`.runtime/tests/runtime-api/<runId>/`，不得纳入版本控制。

API 事实源按优先级为：当前源码和实际 Runtime 行为、`docs/api/*.md`、
`docs/api/runtime-api.ai.json`、`types/*.d.ts`。只有这些正式来源可以作为测试输入；
不得恢复或使用任何退役接口文档。

## 分层和机器结果

| Gate | JavaScript 证明 | 机器结果 |
| --- | --- | --- |
| contract | 实际 Runtime、catalog、文档和类型声明没有未允许漂移 | `results/contract.json` |
| unit | 每个 API family 的独立 `.test.js` 安全行为 | `results/unit.json` |
| coverage | 每方法 contract、已通过 tier、required tier、风险理由和用例 | `results/coverage.json` |
| smoke | 安全公共路径与错误路径 | `results/smoke.json` |
| failure-exit | 普通 JS throw 快速非零、且不是 watchdog 124 | `results/failure-exit.json` |
| live | Safari、权限、窗口身份、输入、剪贴板、HTTP 和截图 | `results/live.json` |
| notify-icon-live | 已安装 macOS Runtime 提交通知并保活 15 秒供图标取证 | `results/runtime-api-notify-icon-live.json` + 截图 |
| composition | 多控件、DOM/像素、截图、state/events 和移动窗口重放 | `results/composition.json` |
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

## 安全边界与版本控制

关机、重启、睡眠、杀进程、关闭窗口、`AppStorage.clear`、通知、内置声音、未配置 provider
的 OCR/UI 识别、FloatingWindow loop 和 `mouse.clickForPID` 成功路径，默认只能做 contract 或
安全错误路径。`clickForPID` 不能以 HTML 元素冒充 AXPress 成功；真实成功路径需要已审核的
原生 AX 控件、PID、窗口、AX capability 和业务结果。

建议纳入版本控制的正式资产：`tests/runtime-api/`、`scripts/test_runtime_apis.sh`、
`scripts/test_host_apis.sh`、`schemas/runtime-api/*.schema.json`、相关 Makefile/README/AGENTS、
以及 `docs/api/`、`types/` 修订。`.runtime/tests/runtime-api/` 中的任何文件都是本地运行产物。
