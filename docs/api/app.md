---
title: App Lifecycle API
description: Launch, find, wait for, terminate, and restart desktop applications by stable identity.
order: 14
---

# App Lifecycle API

`App` 是 JavaScript Runtime 中的实验性应用生命周期原语。它把已有的 `page.openApp()`、
`System.getProcessList()` / `killProcess()`、Window/PID 和 macOS `NSWorkspace` snapshot 组合成薄层；
没有创建第二套 Process、Window、EventLoop 或快捷键系统。

优先使用稳定 identity：macOS bundle id 或 `.app` bundle path；PID 只标识一次运行实例，显示名称
可能变化。一个 identity 匹配多个进程时，`App.get()`、`launch()` 和 `restart()` 返回一个 group，
其 `pids` 和 `instances` 保留全部匹配项。

## 快速开始

```js
const target = { bundleId: 'com.apple.calculator' };
const app = await App.launch(target, { waitUntilReady: 'window', timeout: 10000 });
console.log({ pids: app.pids, name: app.name });

await App.terminate(target); // graceful
await App.waitForExit(target, { timeout: 10000 });
```

工作目录必须是仓库根目录。示例只在 Calculator 原本未运行时启动、restart 并清理它；若已运行会
fail closed，避免终止用户原有实例：

```bash
./opendesk -script examples/app-lifecycle.js -console-mode script
```

示例 evidence 写入：

```text
.runtime/tests/platform-primitives/task-007-app-lifecycle/example.json
```

## `App.list()` / `App.get()` / `App.isRunning()` / `App.launch()` / `App.waitForLaunch()` / `App.waitForExit()` / `App.terminate()` / `App.restart()` / `App.getCapabilities()`：API 总览

| 方法 | 返回 | 语义 |
| --- | --- | --- |
| `App.list()` | instance[] | 当前 app/process snapshot；macOS 来自 NSWorkspace |
| `App.get(target)` | group / `null` | 按 identity 分组全部匹配进程 |
| `App.isRunning(target)` | boolean | 当前 snapshot 是否存在匹配实例 |
| `App.launch(target, options?)` | Promise\<group> | 启动或激活；已运行时不制造平行 OpenDesk 进程系统 |
| `App.waitForLaunch(target, options?)` | Promise\<group> | 等待 process 或 window readiness |
| `App.waitForExit(target, options?)` | Promise\<true> | 等待该 identity 当前不再运行 |
| `App.terminate(target, options?)` | Promise\<result> | 向开始时匹配的全部 PID 发出 graceful 或 force 请求并等待退出 |
| `App.restart(target, options?)` | Promise\<group> | 终止匹配实例后用 stable identity 重启；PID 输入会先解析为 bundle/path/name |
| `App.getCapabilities()` | object | 平台、backend、identity、readiness 和 mutation 支持矩阵 |

`target` 支持 number PID、字符串，以及只含一个字段的
`{ pid }` / `{ name }` / `{ bundleId }` / `{ path }`。字符串绝对路径视为 path；macOS 上含点且不含
路径分隔符的字符串视为 bundle id，其他平台视为 name（例如 `notepad.exe`）；有歧义时使用显式对象。

## macOS 系统应用别名

当前 macOS + cgo 的 native-identity backend 只为下列系统应用名提供精确别名；它们不是通用名称
翻译或模糊匹配：

| 输入 `name`（字符串或 `{ name }`） | 规范化 identity |
| --- | --- |
| `计算器` | `com.apple.calculator` |
| `Calculator` | `com.apple.calculator` |

规范化发生在解析后、启动前，因此会持续用于 `launch`、`get`、`isRunning`、`waitForLaunch`、
`waitForExit`、`terminate`、`restart`、进程匹配和窗口 readiness。它复用 macOS 的 bundle-ID launcher
和平台身份查询，不硬编码系统应用安装目录，也不依赖 `App.list()` 里已有的运行实例，所以可用于冷启动。

显式 `{ bundleId }`、`{ path }` 和 PID 从不翻译；未知 name 保留原有 name 行为，绝不会回退为
Calculator。第三方同名应用应使用显式 `bundleId` 或 `path`。别名调用的 `group.identity` 返回规范化后的
`{ kind: 'bundleId', value: 'com.apple.calculator' }`；`name`、`bundleId`、`pids` 和 `instances` 仍是
实际 snapshot 观察值，不会伪造为输入的“计算器”。

## Readiness、timeout 与 cancellation

- `waitUntilReady: 'process'`：snapshot 中至少出现一个匹配 PID；默认值。
- `waitUntilReady: 'window'`：匹配 PID 中至少一个出现在现有 `window.list()` facade。
- custom predicate 当前明确为 unsupported；capability 为 `false`。
- timeout 默认 10 秒，最大 5 分钟；execution 取消或 teardown 会取消 worker 并清理 Promise callback。
- `args`、`env`、`cwd` 已保留为候选字段，但当前会返回 `NOT_SUPPORTED`，不会 silent ignore。

`terminate({ force: false })` 请求应用级 graceful termination；`force: true` 是明确的立即 force 请求，
不是隐式 fallback。若 graceful 超时，返回 `TIMEOUT`，由调用方决定是否再明确调用 force。

## 错误

Promise rejection 的 `error.code` 为：`INVALID_ARGUMENT`、`NOT_SUPPORTED`、`NOT_FOUND`、
`LAUNCH_FAILED`、`TERMINATE_FAILED`、`TIMEOUT`、`CANCELED` 或 `BACKEND_FAILED`。
同步 `list/get/isRunning` 的无效参数或 backend 失败会直接 throw 同样的结构化错误。

## 平台矩阵

| 平台 | list / identity | launch | terminate | window readiness | 本轮验证 |
| --- | --- | --- | --- | --- | --- |
| macOS + cgo | NSWorkspace；PID/name/bundle/path；支持本文两个 Calculator 别名 | `open -a/-b` 或 `.app` path | NSRunningApplication graceful/force | 复用现有 Window facade | real fixture verified |
| macOS 无 cgo | process fallback；不规范化本文别名 | 同上 | gopsutil signal/kill | partial | not live verified |
| Windows | process fallback | name/path | gopsutil signal/kill | existing Window facade | not live verified |
| Linux | process fallback | executable name/path | gopsutil signal/kill | capability false | not live verified |

## 兼容与边界

- `page.openApp(name)` 和 AI CLI `app.open` 保持原签名，并改为共享同一 launcher bridge。
- `page.openURLInApp()` 仍是 URL 行为，不混入 `App` core。
- `System.getProcessList()` / `killProcess()` 和 Window/PID API 保持兼容；`App` 不取代完整 Process API。
- 当前没有新增 HTTP/MCP surface；脚本 Runtime 是本轮公共入口。
- `Events` 继续负责外部 app launched/terminated 变化；`App` 不复制 watcher 或 `globalShortcut`。

## 正式 macOS fixture gate

工作目录为仓库根目录。该 gate 编译仓库自带的无用户数据 AppKit fixture，执行 launch →
window-ready → second launch → restart → graceful terminate → force terminate，并保存窗口截图和脱敏 JSON：

```bash
OPENDESK_LIVE_APP_LIFECYCLE=1 ./dist/opendesk -script scripts/test_app_lifecycle.js -console-mode script
```

未设置 opt-in 时 runner 会安全 `[SKIP]`，不能记为 live pass。正式 runner 会先核对实际启动的
`dist/opendesk` 与配套 `dist/opendesk-ui-host` 是否来自同一次当前构建，再编译 fixture。功能通过后
仍需检查 `.runtime/tests/platform-primitives/task-007-app-lifecycle/window.png`；进程、Promise 和
JSON evidence 通过不等于视觉通过。

产物目录：

```text
.runtime/tests/platform-primitives/task-007-app-lifecycle/
```
