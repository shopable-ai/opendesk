---
title: API 文档
description: OpenDesk 用户 API 总览、全局对象地图与阅读导航。
order: 1
---

# API 文档

这套文档面向脚本作者、自动化使用者和直接生成 OpenDesk 脚本的 Agent。

## 一句话理解

OpenDesk 让你用 JavaScript 或 Agent CLI 操作真实桌面：先确定应用和窗口，再限定最小必要区域，观察目标，执行输入，最后验证结果。外部程序也可通过 HTTP 与 MCP 调用同一 Runtime。

## 先选使用入口

| 你想做什么 | 从这里开始 |
| --- | --- |
| 让 Codex、Claude Code 或 shell Agent 操作桌面 | [AI CLI](ai-cli.md)：先运行 `opendesk ai capabilities` 和 `opendesk ai schema` |
| 写或维护 JavaScript 桌面自动化 | [Geometry API](geometry.md) → [Desktop UI API](desktop-ui.md) → [Mouse API](mouse.md) → [Window API](window.md) |
| 查找屏幕文本、按钮或图片 | [Desktop UI API](desktop-ui.md) 的文本/图片接口 |
| 观察或执行完整原生菜单路径 | [Desktop UI API](desktop-ui.md#原生菜单-api) 的 `UI.getMenuItems()` / `UI.findMenuItem()` / `UI.tapMenuItem()` |
| 直接操作原生语义元素 | [Accessibility API](accessibility.md) |
| 从服务或其他程序触发任务 | [HTTP Server API](http-server.md) 或 MCP |
| 把已探索流程重复执行 | 保存 recipe，再使用 [AI CLI](ai-cli.md) 的 `run` |
| 人工录制非敏感测试操作并生成基础 JS | [Recorder Runtime API](recorder-runtime.md) |
| 运行带 tray / menu bar 的单实例桌面脚本应用 | [automation.app API](app-shell.md) |
| 管理环境变量和默认输出 | [Environment Configuration](environment.md) |

## 推荐阅读路径

- 写桌面脚本：[Geometry API](geometry.md) → [Desktop UI API](desktop-ui.md) → [Mouse API](mouse.md) → [Input APIs](input.md) → [Window API](window.md)
- 做 OCR / 找按钮：[Desktop UI API](desktop-ui.md)；底层 OCR provider 见 [Vision API](vision.md)
- 做模板匹配：[Desktop UI API](desktop-ui.md#图片-api)；底层图像能力见 [ImageColor API](image-color.md)
- 做完整菜单路径：[Desktop UI API](desktop-ui.md#原生菜单-api)（Experimental）
- 做底层 Accessibility snapshot/find/read/perform：[Accessibility API](accessibility.md)（Experimental；可信本地 execution）
- 做同尺寸图像差异、模板或颜色判断：[ImageColor API](image-color.md)
- 做系统、路径与文件操作：[System API](system.md)、[Path API](path.md)、[File API](file.md)、[SQLite API](sqlite.md)、[AppStorage](storage.md)
- 在本地 JavaScript execution 中运行命令行程序：[Command API](command.md)
- 读写系统剪贴板：[Clipboard API](clipboard.md)
- 订阅窗口、应用、剪贴板和显示器变化：[Desktop Events API](events.md)
- 启动、等待、终止与重启应用：[App Lifecycle API](app.md)
- 控制当前 App Mode tray、菜单与退出：[automation.app API](app-shell.md)
- 控制系统音频与发现设备：[Audio API](audio.md)
- 播放提示音或本地音频：[Sound API](sound.md)
- 读取显示器、选择区域或录屏：[Screen API](screen.md)
- 在脚本中发起网络请求：[HTTP and Axios](http.md)
- 从外部程序调用 OpenDesk：[HTTP Server API](http-server.md)
- 发送系统通知：[notify](notify.md)
- 观察 OpenDesk 自身已投递通知：[Notifications API](notifications.md)
- 显示需用户确认的异步原生窗口：[Dialog API](dialog.md)
- 使用 console、计时器、等待等全局能力：[Global APIs](global-apis.md)
- 调用、安装或编写 manifest 插件：[Native Extension Plugin](native-extension.md)
- 创建 OpenDesk 自己的窗口/面板：[Custom UI](custom-ui.md)
- 定时执行 JavaScript：[Scheduler](scheduler.md)；外部管理协议见 [Scheduler HTTP API](scheduler-api.md)
- 人工采集输入、制作 actions 并生成 basic JS：[Recorder Runtime API](recorder-runtime.md)
- 记录 Agent 工具动作并提炼 Flow：[Agent-first Recorder MCP API](recorder.md)
- 查找仓库示例：[Examples 快速索引](examples/README.md)
- 读取 Execution ID、输入和 artifact 上下文：[Execution Context](execution.md)
- 理解 JavaScript 生命周期与取消：[JavaScript Runtime](runtime.md)
- 直接拿范例：[Cookbook](cookbook.md)
- 给 Agent / 工具读取：[runtime-api.ai.json](runtime-api.ai.json)

## 当前用户可见 API 地图

| 对象 / 能力 | 可用位置 | 状态 | 主要用途 | 文档 |
| --- | --- | --- | --- | --- |
| `page` | JavaScript Runtime | Stable | 截图、打开 URL/App、等待、权限 | [Page API](page.md) |
| `mouse` / `page.mouse` | JavaScript Runtime | Stable | 全局鼠标移动、点击、拖拽、位置与滚轮 | [Mouse API](mouse.md) |
| `Geometry` | JavaScript Runtime | Stable | screen logical coordinate 与相对区域 | [Geometry API](geometry.md) |
| `UI` | JavaScript Runtime | Stable visual / Experimental menu | 文本、图片与完整原生菜单路径 | [Desktop UI API](desktop-ui.md) |
| `Accessibility` | 可信本地 JavaScript Runtime | Experimental | 明确 scope 内 snapshot/find/read/perform/release 原生元素 | [Accessibility API](accessibility.md) |
| `keyboard` / `touchscreen` | JavaScript Runtime | Stable | 键盘与触屏输入 | [Input APIs](input.md) |
| `globalShortcut` | JavaScript Runtime | Stable（macOS / Windows） | 系统快捷键触发 JavaScript callback | [Global Shortcut API](global-shortcut.md) |
| `Recorder` | 可信本地 JavaScript Runtime | Experimental | 人工输入采集、actions 制作与 basic 普通 JS 生成 | [Recorder Runtime API](recorder-runtime.md) |
| `Events` | JavaScript Runtime | Experimental | 外部桌面状态 watcher | [Desktop Events API](events.md) |
| `App` | JavaScript Runtime | Experimental | 按稳定 identity 启动、等待、终止与重启应用 | [App Lifecycle API](app.md) |
| `automation.app` | 显式 App Mode Runtime | P0 macOS / Windows | 当前应用 tray action、菜单状态、reopen 与退出 | [automation.app API](app-shell.md) |
| `window` | JavaScript Runtime | Stable reads / platform-partial actions | 窗口读取、能力矩阵与控制 | [Window API](window.md) |
| `Screen` | JavaScript Runtime | Stable；部分 macOS Experimental | 显示器、像素、区域选择与录屏 | [Screen API](screen.md) |
| `Vision` | JavaScript Runtime | Stable | OCR、UI 文本检测、provider | [Vision API](vision.md) |
| `OCR` | JavaScript Runtime | Secondary | 本地 Tesseract 纯文本 OCR | [Vision API](vision.md) |
| `ImageColor` | JavaScript Runtime | Secondary | 图像差异、模板匹配与颜色分析 | [ImageColor API](image-color.md) |
| `Audio` | JavaScript Runtime | Native / Experimental pattern | 系统音量、mute、设备与固定声音模式匹配 | [Audio API](audio.md) |
| `Sound` | JavaScript Runtime | Secondary / Native | 播放提示音和本地音频 | [Sound API](sound.md) |
| `System` | JavaScript Runtime | Stable reads / Experimental actions | 系统、进程、网络、指标与 session capability | [System API](system.md) |
| `Execution` | JavaScript Runtime | Stable | ID、输入、环境、工作目录、来源与 artifact | [Execution Context](execution.md) |
| `Command` | 本地 JavaScript Runtime | Conditional | 运行命令行程序 | [Command API](command.md) |
| `path` | JavaScript Runtime | Stable | 平台路径字符串处理 | [Path API](path.md) |
| `File` | JavaScript Runtime | Stable | 文件与目录操作 | [File API](file.md) |
| `SQLite` | 本地 JavaScript Runtime | Stable（可信本地 execution） | execution-owned SQLite | [SQLite API](sqlite.md) |
| `AppStorage` | JavaScript Runtime | Secondary | 持久化键值存储 | [AppStorage](storage.md) |
| `clipboard` | JavaScript Runtime | Stable text / Experimental rich | 系统剪贴板 | [Clipboard API](clipboard.md) |
| `console` | JavaScript Runtime | Stable | 日志与事件输出 | [Global APIs](global-apis.md) |
| `http` / `axios` | JavaScript Runtime | Stable | 脚本内 HTTP 客户端 | [HTTP and Axios](http.md) |
| HTTP Server | 外部调用入口 | Stable | 创建、查询、取消 OpenDesk execution | [HTTP Server API](http-server.md) |
| `NativeExtensions` | 本机 CLI | Experimental | 发现并调用本地 manifest plugin | [Native Extension Plugin](native-extension.md) |
| `notify()` | JavaScript Runtime | Secondary | 发送系统通知 | [notify](notify.md) |
| `Notifications` | JavaScript Runtime | Experimental（macOS own-app） | 观察和移除 OpenDesk 自身通知 | [Notifications API](notifications.md) |
| `Dialog` / `alert()` / `confirm()` / `prompt()` | JavaScript Runtime | Conditional | 异步原生模态提示与输入 | [Dialog API](dialog.md) |
| `ui` / `FloatingWindow` | JavaScript Runtime | Conditional | OpenDesk 自己的受限 HTML/CSS 原生窗口 | [Custom UI](custom-ui.md) |
| Global APIs | JavaScript Runtime | Stable | 计时器、等待、console、取消与参数工具 | [Global APIs](global-apis.md) |
| lodash / moment / query-string / cheerio / beautify | JavaScript Runtime | Secondary | 脚本辅助库 | [JS Libraries](libs.md) |
| `opendesk ai` | CLI | Stable | Coding Agent JSON desktop-tool surface 与 recipe 入口 | [AI CLI](ai-cli.md) |
| Scheduler | HTTP 模式 | Conditional | 持久化定时 JavaScript | [Scheduler](scheduler.md) / [Scheduler HTTP API](scheduler-api.md) |

## 文档组织原则

`docs/api/` 以用户真正看到的公开边界组织，而不是按实现文件数量或章节长度拆页：

1. **同一公开对象/namespace，优先一个主文档。** `UI` 的文本、图片和菜单方法统一在 `desktop-ui.md`。
2. **不同对象可以独立。** `Audio` 与 `Sound`、`notify()` 与 `Notifications` 的职责和调用对象不同。
3. **不同运行方向可以独立。** `http.md` 是脚本发起请求，`http-server.md` 是外部客户端调用 OpenDesk。
4. **独立协议可以独立。** `scheduler-api.md` 是 Scheduler HTTP 协议契约，不是把同一个 JavaScript 类硬拆成两页。

篇幅不是拆文件的理由。共享参数可以集中说明，但每个公开方法应有独立方法小节，方便阅读、链接和 Agent 检索。

## 使用边界

- 新脚本优先使用 **Stable** API；Conditional / Experimental 能力先检查 capability 和前置条件。
- 新脚本省略 `-stack`。早期 `upgraded` / `playwright` facade 不属于维护中的用户 API。
- `page.$`、`page.$$` 与旧 DOM 风格 `page.click(selector)` / `page.type(selector, text)` 不属于稳定桌面 API。
- `SQLite` 仅供可信本地 execution；HTTP、MCP、Scheduler 不注入通用 SQL remote route/tool。
- `Accessibility` 与 `UI` 菜单方法仅在可信本地 execution 启用；HTTP、MCP、Scheduler 当前只看到禁用 capability，不会读取目标。
- Scheduler 的产品能力与生命周期见 `scheduler.md`；HTTP 字段和响应合同见 `scheduler-api.md`。

`runtime-api.ai.json` 是给 Agent 的紧凑机器索引，不替代本目录各页面的用户调用契约。Runtime 内部注入与 polyfill 组成见 [Runtime API composition](../implementation/runtime/runtime-api-composition.md)，文档与类型同步规则见 [API documentation maintenance](../maintenance/docs-user-api-editme-toc-maintenance.md)。
