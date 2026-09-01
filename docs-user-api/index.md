---
title: OpenDesk API 文档
description: OpenDesk 用户 API 总览、全局对象地图与阅读导航。
order: 1
---

# OpenDesk API 文档

这套文档面向脚本作者、自动化使用者和直接生成 OpenDesk 脚本的 Agent。

## 一句话理解

OpenDesk 在 JavaScript 运行时中注入桌面自动化、窗口、视觉、文件、网络和系统对象，再加载运行时增强与内置 JS 库；外部程序还可以通过 HTTP 与 MCP 使用更高层能力。

## 先读哪些

- 写桌面脚本：`page.md` → `input.md` → `window.md`
- 做 OCR / 找按钮：`vision.md`
- 做模板匹配 / 颜色判断：`image-color.md`
- 做系统与文件操作：`system.md`、`file.md`、`storage.md`
- 做网络调用：`http.md`
- 发送系统通知：[`notify.md`](notify.md)
- 显示需用户确认的异步原生窗口：[`dialog.md`](dialog.md)
- 使用计时器、等待、剪贴板快捷函数等全局能力：[`global-apis.md`](global-apis.md)
- 调用 manifest 插件：[Native Extension Plugin V1](native-extension.md)（Experimental；低层 Native Process V0 仅用于诊断）
- 从外部服务触发：`http-server.md`
- 创建受控原生面板：`custom-ui.md`
- 定时执行文件或内联 JavaScript：`scheduler.md`；程序化管理接口：`scheduler-api.md`
- 理解 legacy / upgraded / playwright：`runtime.md`
- 直接拿范例：`cookbook.md`
- 给 Agent / 工具读取：`runtime-api.ai.json`

## 当前用户可见 API 地图

| 对象 / 能力 | 类型 | 状态 | 主要用途 | 文档 |
| --- | --- | --- | --- | --- |
| `page` | Native + Polyfill | Stable | 截图、打开 URL/App、等待、权限 | `page.md` |
| `mouse` / `keyboard` / `touchscreen` | Native | Stable | 输入控制 | `input.md` |
| `window` | Native + Polyfill | Stable | 窗口读取与控制 | `window.md` |
| `Screen` | Native | Stable | 显示器、像素、截图别名 | `screen.md` |
| `Vision` | Native | Stable | OCR、UI 文本检测、provider 能力 | `vision.md` |
| `OCR` | Native | Secondary | 本地 Tesseract 纯文本 OCR | `vision.md` |
| `ImageColor` | Native | Secondary | 模板匹配、颜色、图像辅助分析 | `image-color.md` |
| `System` | Native | Stable | 系统、进程、网络、指标 | `system.md` |
| `File` | Native | Stable | 文件与目录操作 | `file.md` |
| `AppStorage` | Native | Secondary | 持久化键值存储 | `storage.md` |
| `clipboard` | Native | Stable | 系统剪贴板 | `clipboard-console.md` |
| `console` | Native/Runtime wrapper | Stable | 日志与事件输出 | `clipboard-console.md` |
| `http` | Native | Stable | 底层 HTTP 请求 | `http.md` |
| `axios` | Polyfill | Stable | 日常 HTTP 请求 | `http.md` |
| `NativeExtensions` | Manifest registry + immutable binding | Experimental | CLI opt-in；自动发现严格 bundle，日常调用不传 executable/extension/wire method | [native-extension.md](native-extension.md) |
| `notify()` | Polyfill + Native bridge | Secondary | 系统通知 | [`notify.md`](notify.md) |
| `Dialog` / `alert()` / `confirm()` / `prompt()` | Native binding + Polyfill aliases | Conditional | 异步原生模态提示与短文本输入 | [`dialog.md`](dialog.md) |
| `Sound` | Native | Secondary | 播放提示音 / 音频文件 | `runtime-utilities.md` |
| `ui` | Native bridge | Conditional / v1 | 受限 HTML/CSS + JavaScript controller 的原生窗口 | `custom-ui.md` |
| `FloatingWindow` | Button-first facade | Conditional v1 | 简单图标工具栏；仅 `run()` deprecated | `runtime-utilities.md` |
| Global APIs | Native + Polyfill | Stable | 计时器、等待、剪贴板快捷函数、取消控制与 URL 参数 | [`global-apis.md`](global-apis.md) |
| lodash / moment / query-string / cheerio / beautify | JS Libraries | Secondary | 脚本辅助库 | `libs.md` |
| `browser` / `context` / upgraded facade | Native + Compatibility facade | Compatibility | 浏览器风格迁移接口 | `runtime.md` |

## 三层接口来源

### 1. 原生对象

由 Go 运行时注入，例如：

`page`、`mouse`、`keyboard`、`window`、`Screen`、`System`、`File`、`AppStorage`、`Vision`、`ImageColor`、`Sound`、`http`，以及 Experimental `NativeExtensions`。

`NativeExtensions` 默认不注入；只有受信任的本机 CLI JavaScript execution 显式传入
`-experimental-native-extension` 才会从 portable/app-bundled 与 current-user roots
发现严格 `extension.json` bundle，并生成冻结的 namespace/method closure。正常调用是
`NativeExtensions.goBasic.hello({name: "OpenDesk"})`，不传 path、extension 或 wire
method。Discovery/list/get/diagnostics 不启动 child，也不执行第三方 JS。完整契约见
[Native Extension Plugin V1](native-extension.md)。低层 `NativeExtension.call` 仅保留在
独立 `-experimental-unsafe-native-extension-call` 本机诊断 gate 中。
current-user root 分别采用 macOS Application Support、Linux XDG data 和 Windows
LocalAppData Known Folder；独立 machine-wide discovery 当前为 **Not Implemented**。

### 2. Runtime 增强与全局接口

运行时会加载 `polyfills/*.js`，用于：

- 包装原生对象
- 提供 `page.waitForTimeout()`、`page.ensurePermissions()` 等最终用户 API
- 提供 `axios`
- 提供 `notify()`、Promise、timers、sleep、URLSearchParams 等；用户层导航见 [`global-apis.md`](global-apis.md)，`notify()` 的完整契约见 [`notify.md`](notify.md)

### 3. Compatibility facade

`legacy` / `upgraded` / `playwright` stack 会改变 `page` / `browser` / `context` 的默认指向。

这些 facade 主要提供迁移友好的 API 形状，**不等于完整 Playwright 浏览器引擎**。

## 文档与配套接口资产

正式用户说明就是本目录的 Markdown 页面。

另外维护：

- `runtime-api.ai.json`：Agent 使用的机器索引。
- 仓库根 `types/*.d.ts`：VS Code / TypeScript 使用的类型声明。
- `jsconfig.json`：让 JavaScript 编辑器加载上述声明。

这些都是当前 Runtime 的派生表达。新增、删除、改名或改变主要 API 签名时，应在同一变更中同步校准，而不是新增另一份接口说明页。

## HTTP 服务接口

`http-server.md` 记录 OpenDesk 自身服务端接口，包括：

- `POST /SCRIPT_RUN`
- `POST /executions`
- `GET /executions/{id}`
- `GET /executions/{id}/summary`
- `GET /executions/{id}/events`
- `GET /status`
- `POST /vision/ocr`
- `POST /vision/detect-ui`
- `GET /scheduler`
- `/api/scheduler/jobs` 创建 file/inline 任务、查看、暂停、恢复、立即运行、删除与运行历史

Scheduler 的完整 HTTP 契约见 [Scheduler HTTP API](scheduler-api.md)。

## 事实与兼容原则

- 当前源码 / Runtime 行为优先。
- 正式可渲染 Markdown 是用户文档主表达。
- 新脚本优先采用标记为 Stable 的接口。
- `page.$`、`page.$$`、旧 DOM 风格 `page.click(selector)` / `page.type(selector, text)` 不属于当前稳定桌面 API。
- upgraded / playwright facade 只按 `runtime.md` 描述理解，不推断不存在的浏览器能力。
- 历史 TestMonkey 文档仅保留在 Git 历史中，不再参与当前文档解析。
- `dev/api.md` 与仓库根旧 `types.md` 属于已经退役的历史草稿，不应恢复。
