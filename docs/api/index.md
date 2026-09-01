---
title: OpenDesk API 文档
description: OpenDesk 用户 API 总览、全局对象地图与阅读导航。
order: 1
---

# OpenDesk API 文档

这套文档面向脚本作者、自动化使用者和直接生成 OpenDesk 脚本的 Agent。

## 一句话理解

OpenDesk 让你用 JavaScript 或 Agent CLI 操作真实桌面：先找窗口，再截取最小必要区域，执行输入，最后验证结果。外部程序也可通过 HTTP 与 MCP 调用同一 Runtime。

## 先选使用入口

| 你想做什么 | 从这里开始 |
| --- | --- |
| 让 Codex、Claude Code 或 shell Agent 操作桌面 | [AI CLI](ai-cli.md)：先运行 `opendesk ai capabilities` 和 `opendesk ai schema`。 |
| 写或维护 JavaScript 自动化脚本 | [Page API](page.md) → [Mouse API](mouse.md) → [Input APIs](input.md) → [Window API](window.md)。 |
| 识别屏幕上的文本、按钮或颜色 | [Vision API](vision.md) 或 [ImageColor API](image-color.md)。 |
| 从服务或外部程序触发任务 | [HTTP Server API](http-server.md) 或 MCP。 |
| 把已探索流程重复执行 | 保存 recipe，然后使用 [AI CLI](ai-cli.md) 的 `run`。 |

## 先读哪些

- 写桌面脚本：[Page API](page.md) → [Mouse API](mouse.md) → [Input APIs](input.md) → [Window API](window.md)
- 做 OCR / 找按钮：[Vision API](vision.md)
- 做模板匹配 / 颜色判断：[ImageColor API](image-color.md)
- 做系统与文件操作：[System API](system.md)、[File API](file.md)、[AppStorage](storage.md)
- 读写系统剪贴板：[Clipboard API](clipboard.md)
- 订阅窗口、应用、剪贴板和显示器变化：[Desktop Events API](events.md)
- 启动、等待、终止与重启桌面应用：[App Lifecycle API](app.md)
- 控制音量、mute 并发现音频设备：[Audio API](audio.md)
- 交互选择区域并录制本地 QuickTime 文件：[Screen API](screen.md)（录屏为 macOS Experimental）
- 做网络调用：[HTTP and Axios](http.md)
- 发送系统通知：[notify](notify.md)
- 显示需用户确认的异步原生窗口：[Dialog API](dialog.md)
- 使用 console、计时器、等待、剪贴板快捷函数等全局能力：[Global APIs](global-apis.md)
- 调用、安装或编写 manifest 插件：[Native Extension Plugin V1.0.1](native-extension.md)（Experimental；本机 CLI 默认从程序相对目录发现，低层 Native Process V0 仅用于诊断）；作者步骤见 [native-extensions/README.md](../../examples/native-extensions/README.md) 和 [quickstart.js](../../examples/native-extensions/quickstart.js)
- 从外部服务触发：[HTTP Server API](http-server.md)
- 显示原生对话框、图标工具栏或受控面板：[Native UI](native-ui.md)
- 定时执行文件或内联 JavaScript：[Scheduler](scheduler.md)；程序化管理接口：[Scheduler HTTP API](scheduler-api.md)
- 录制并生成可确定性回放的流程：[OpenDesk Agent-first Recorder MCP API](recorder.md)
- 理解 legacy / upgraded / playwright：[Runtime Stacks](runtime.md)
- 直接拿范例：[Cookbook](cookbook.md)
- 用结构化、低 Token 的桌面 Agent CLI：[AI CLI](ai-cli.md)
- 给 Agent / 工具读取：[runtime-api.ai.json](runtime-api.ai.json)

## 当前用户可见 API 地图

| 对象 / 能力 | 可用位置 | 状态 | 主要用途 | 文档 |
| --- | --- | --- | --- | --- |
| `page` | JavaScript Runtime | Stable | 截图、打开 URL/App、等待、权限 | [Page API](page.md) |
| `mouse` / `page.mouse` | JavaScript Runtime | Stable | 全局鼠标移动、点击、拖拽、位置与滚轮 | [Mouse API](mouse.md) |
| `keyboard` / `touchscreen` | JavaScript Runtime | Stable | 键盘与触屏输入控制 | [Input APIs](input.md) |
| `globalShortcut` | JavaScript Runtime | Stable（macOS / Windows） | 系统快捷键触发 JavaScript callback | [Global Shortcut API](global-shortcut.md) |
| `Events` | JavaScript Runtime | Experimental | 外部桌面状态 watcher；当前明确使用 polling backend | [Desktop Events API](events.md) |
| `App` | JavaScript Runtime | Experimental | 按稳定 identity 启动、等待、终止与重启应用 | [App Lifecycle API](app.md) |
| `Audio` | JavaScript Runtime | Experimental（macOS） | 默认输出音量、mute 与音频设备发现 | [Audio API](audio.md) |
| `window` | JavaScript Runtime | Stable reads / platform-partial actions | 窗口读取、能力矩阵与控制 | [Window API](window.md) |
| `Screen` | JavaScript Runtime | Stable；录屏为 Experimental（macOS） | 显示器、像素、截图别名、区域选择与录屏 | [Screen API](screen.md) |
| `Vision` | JavaScript Runtime | Stable | OCR、UI 文本检测、provider 能力 | [Vision API](vision.md) |
| `OCR` | JavaScript Runtime | Secondary | 本地 Tesseract 纯文本 OCR | [Vision API](vision.md) |
| `ImageColor` | JavaScript Runtime | Secondary | 模板匹配、颜色、图像辅助分析 | [ImageColor API](image-color.md) |
| `System` | JavaScript Runtime | Stable | 系统、进程、网络、指标 | [System API](system.md) |
| `File` | JavaScript Runtime | Stable | 文件与目录操作 | [File API](file.md) |
| `AppStorage` | JavaScript Runtime | Secondary | 持久化键值存储 | [AppStorage](storage.md) |
| `clipboard` | JavaScript Runtime | Stable text / Experimental rich (macOS) | 文本及富格式系统剪贴板 | [Clipboard API](clipboard.md) |
| `console` | JavaScript Runtime | Stable | 日志与事件输出 | [Global APIs](global-apis.md) |
| `http` | JavaScript Runtime | Stable | 底层 HTTP 请求 | [HTTP and Axios](http.md) |
| `axios` | JavaScript Runtime | Stable | 日常 HTTP 请求 | [HTTP and Axios](http.md) |
| `NativeExtensions` | 本机 CLI 默认 | Experimental | 从程序相对目录发现并调用本地 manifest plugin | [Native Extension Plugin V1.0.1](native-extension.md) |
| `notify()` | JavaScript Runtime | Secondary | 系统通知 | [notify](notify.md) |
| `Dialog` / `alert()` / `confirm()` / `prompt()` | JavaScript Runtime | Conditional | 异步原生模态提示与短文本输入 | [Dialog API](dialog.md) |
| `Sound` | JavaScript Runtime | Secondary | 播放提示音 / 音频文件 | [Sound API](sound.md) |
| `ui` | JavaScript Runtime | Conditional | 受限 HTML/CSS + JavaScript controller 的原生窗口 | [Native UI](native-ui.md) |
| `FloatingWindow` | JavaScript Runtime | Conditional | 简单图标工具栏 | [Native UI](native-ui.md) |
| Global APIs | JavaScript Runtime | Stable | 计时器、等待、console 日志、剪贴板快捷函数、取消控制与 URL 参数 | [Global APIs](global-apis.md) |
| lodash / moment / query-string / cheerio / beautify | JavaScript Runtime | Secondary | 脚本辅助库 | [JS Libraries](libs.md) |
| `browser` / `context` / upgraded facade | Compatibility stack | Compatibility | 浏览器风格迁移接口 | [Runtime Stacks](runtime.md) |
| `opendesk ai` | CLI | Stable | 给 Coding Agent 的 JSON desktop-tool surface 与 recipe 入口 | [AI CLI](ai-cli.md) |

## 使用边界

- 新脚本优先使用标记为 **Stable** 的 API；**Conditional** API 必须先满足页面写明的前置条件。
- `legacy`、`upgraded`、`playwright` 是迁移兼容栈，不是完整浏览器或 DOM 自动化引擎；选择规则和边界见 [Runtime Stacks](runtime.md)。
- `page.$`、`page.$$` 与旧 DOM 风格的 `page.click(selector)` / `page.type(selector, text)` 不属于当前稳定桌面 API。
- HTTP 的路由、请求和响应见 [HTTP Server API](http-server.md)；Scheduler 的专用 HTTP 契约见 [Scheduler HTTP API](scheduler-api.md)。

`runtime-api.ai.json` 是给 Agent 的紧凑机器索引；它不替代本目录各页面的用户调用契约。Runtime
内部注入、polyfill 和 facade 组成见 [Runtime API composition](../implementation/runtime/runtime-api-composition.md)，
文档与类型的同步规则见 [API documentation maintenance](../maintenance/docs-user-api-editme-toc-maintenance.md)。
