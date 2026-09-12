---
title: API 文档
description: OpenDesk 用户 API 总览、全局对象地图与阅读导航。
order: 10
---

# API 文档

这套文档面向脚本作者、自动化使用者和直接生成 OpenDesk 脚本的 Agent。

## 先缩小桌面目标，再观察、执行并验证

OpenDesk 让你用 JavaScript 或 Agent CLI 操作真实桌面：先确定应用和窗口，再限定最小必要区域，观察目标，执行输入，最后验证结果。外部程序也可通过 HTTP 与 MCP 调用同一 Runtime。

## 按任务选择入口，先走用户路径再查单个接口

| 你想做什么 | 从这里开始 |
| --- | --- |
| 让 Codex、Claude Code 或 shell Agent 操作桌面 | [AI CLI](ai-cli.md)：先运行 `opendesk ai capabilities` 和 `opendesk ai schema` |
| 写或维护 JavaScript 桌面自动化 | [Geometry API](geometry.md) → [Desktop UI API](desktop-ui.md) → [Mouse API](mouse.md) → [Window API](window.md) |
| 查找屏幕文本、按钮或图片 | [Desktop UI API](desktop-ui.md) 的大写 `UI.*` |
| 观察或执行完整原生菜单路径 | [Desktop UI API](desktop-ui.md#原生菜单选项) 的 `UI.getMenuItems()` / `UI.findMenuItem()` / `UI.tapMenuItem()` |
| 直接操作原生语义元素 | [Accessibility API](accessibility.md) |
| 显示几秒后自动消失的成功/失败/进度提示 | [Custom UI](ui.md) 的 `ui.toast()` |
| 创建 OpenDesk 自己的窗口 | [Custom UI](ui.md) 的 `ui.createWindow()` |
| 创建原生浮动工具栏 | [Custom UI](ui.md) 的 `FloatingWindow` |
| 发送操作系统通知 | [通知与提示](notify.md) |
| 让用户确认、取消或输入短文本 | [Dialog API](dialog.md) |
| 从服务或其他程序触发任务 | [HTTP Server API](http-server.md) 或 MCP |
| 把已探索流程重复执行 | 保存 recipe，再使用 [AI CLI](ai-cli.md) 的 `run` |
| 把 JavaScript 发布为 `.odpkg` 受保护包，或交接 P1/P2 License | [受保护包 CLI](protected-packages.md) |
| 在 build/launch 前静态检查 `opendesk.app.json` package | [App Package CLI](app-package-cli.md) |
| 人工录制非敏感测试操作并生成基础 JS | [Recorder Runtime API](recorder-runtime.md) |
| 运行带 tray / menu bar 的单实例桌面脚本应用 | [automation.app API](app-shell.md) |
| 管理环境变量和默认输出 | [Environment Configuration](environment.md) |

## 大写 UI 操作外部应用，小写 ui 负责 OpenDesk 自身界面

| 目标 | API | 主文档 |
| --- | --- | --- |
| 查找、读取或点击其他桌面应用 | `UI.*` | [Desktop UI API](desktop-ui.md) |
| 显示 OpenDesk 自己的轻量提示或进度 | `ui.toast()` | [Custom UI](ui.md) |
| 创建 OpenDesk 自己的窗口 | `ui.createWindow()` | [Custom UI](ui.md) |
| 创建 OpenDesk 原生浮动工具栏 | `FloatingWindow` | [Custom UI](ui.md) |
| 让用户确认或输入 | `Dialog.*` | [Dialog API](dialog.md) |
| 发送系统通知 | `notify()` | [通知与提示](notify.md) |
| 查询 OpenDesk 已投递系统通知 | `Notifications.*` | [Notifications API](notifications.md) |

大写 `UI` 与小写 `ui` 是两个不同入口：`UI` 操作外部桌面应用；`ui` 创建和管理 OpenDesk 自身界面与轻量反馈。JavaScript 大小写敏感。

## 首次阅读沿着发现、定位、动作、验证主线

- 写桌面脚本：[Geometry API](geometry.md) → [Desktop UI API](desktop-ui.md) → [Mouse API](mouse.md) → [Input APIs](input.md) → [Window API](window.md)
- 做 OCR / 找按钮：[Desktop UI API](desktop-ui.md)；底层 OCR provider 见 [Vision API](vision.md)
- 做模板匹配：[Desktop UI API](desktop-ui.md#图片选项)；底层图像能力见 [ImageColor API](image-color.md)
- 做完整菜单路径：[Desktop UI API](desktop-ui.md#原生菜单选项)（Experimental）
- 做底层 Accessibility snapshot/find/read/perform：[Accessibility API](accessibility.md)（Experimental；可信本地 execution）
- 给用户短暂状态/进度反馈：[Custom UI](ui.md) 的 `ui.toast()`
- 创建完整自定义窗口或浮动工具栏：[Custom UI](ui.md)
- 给操作系统通知中心发送提醒：[通知与提示](notify.md)
- 做同尺寸图像差异、模板或颜色判断：[ImageColor API](image-color.md)
- 做系统、路径与文件操作：[System API](system.md)、[Path API](path.md)、[File API](file.md)、[SQLite API](sqlite.md)、[AppStorage](storage.md)
- 在本地 JavaScript execution 中运行命令行程序：[Command API](command.md)
- 打包、验签、授权或执行 `.odpkg` 受保护包：[受保护包 CLI](protected-packages.md)
- 静态验证或诊断 App Mode package：[App Package CLI](app-package-cli.md)
- 读写系统剪贴板：[Clipboard API](clipboard.md)
- 订阅窗口、应用、剪贴板和显示器变化：[Desktop Events API](events.md)
- 启动、等待、终止与重启应用：[App API](app.md)
- 控制当前 App Mode tray、菜单与退出：[automation.app API](app-shell.md)
- 控制系统音频与发现设备：[Audio API](audio.md)
- 播放提示音或本地音频：[Sound API](sound.md)
- 读取显示器、选择区域或录屏：[Screen API](screen.md)
- 在脚本中发起网络请求：[HTTP and Axios](http.md)
- 从外部程序调用 OpenDesk：[HTTP Server API](http-server.md)
- 观察 OpenDesk 自身已投递通知：[Notifications API](notifications.md)
- 显示需用户确认的异步原生窗口：[Dialog API](dialog.md)
- 使用 console、计时器、等待等全局能力：[Global APIs](global-apis.md)
- 调用、安装或编写 manifest 插件：[Native Extension Plugin](native-extension.md)
- 定时执行 JavaScript：[Scheduler](scheduler.md)；外部管理协议见 [Scheduler HTTP API](scheduler-api.md)
- 人工采集输入、制作 actions 并生成 basic JS：[Recorder Runtime API](recorder-runtime.md)
- 记录 Agent 工具动作并提炼 Flow：[Agent-first Recorder MCP API](recorder.md)
- 查找仓库示例：[Examples 快速索引](examples/README.md)
- 读取 Execution ID、输入和 artifact 上下文：[Execution Context](execution.md)
- 理解 JavaScript 生命周期与取消：[JavaScript Runtime](runtime.md)
- 直接拿范例：[Cookbook](cookbook.md)
- 给 Agent / 工具读取：[runtime-api.ai.json](runtime-api.ai.json)

## 目录按五条用户任务带排列，页面不因实现细节拆散

### 桌面自动化主线先解决定位与动作

[AI CLI](ai-cli.md) → [Page API](page.md) → [Geometry API](geometry.md) → [Desktop UI API](desktop-ui.md) → [Mouse API](mouse.md) → [Input APIs](input.md) → [Window API](window.md) → [Screen API](screen.md) → [Accessibility API](accessibility.md) → [Vision API](vision.md) → [ImageColor API](image-color.md)

### 交互与状态能力跟在桌面主线之后

[Custom UI](ui.md)、[Dialog API](dialog.md)、[通知与提示](notify.md)、[Notifications API](notifications.md)、[Clipboard API](clipboard.md)、[Global Shortcut API](global-shortcut.md)、[Desktop Events API](events.md)、[App API](app.md)、[automation.app API](app-shell.md)、[Recorder Runtime API](recorder-runtime.md)、[Agent-first Recorder MCP API](recorder.md)、[Audio API](audio.md)、[Sound API](sound.md)

### Runtime 与数据页按脚本运行边界集中

[Execution Context](execution.md)、[JavaScript Runtime](runtime.md)、[Global APIs](global-apis.md)、[Environment Configuration](environment.md)、[Path API](path.md)、[File API](file.md)、[AppStorage](storage.md)、[SQLite Runtime API](sqlite.md)、[System API](system.md)、[Command API](command.md)、[JS Libraries](libs.md)、[Native Extension Plugin](native-extension.md)

### 服务协议保持独立，避免把调用方向混成一页

[HTTP and Axios](http.md)、[HTTP Server API](http-server.md)、[Scheduler](scheduler.md)、[Scheduler HTTP API](scheduler-api.md)

### 发布和范例放在可调用 Reference 之后

[Script App Packaging](script-app-packaging.md)、[App Package CLI](app-package-cli.md)、[受保护包 CLI](protected-packages.md)、[Cookbook](cookbook.md)、[Examples 快速索引](examples/README.md)

## 当前公开 API 按运行边界与稳定性归档

| 对象 / 能力 | 可用位置 | 状态 | 主要用途 | 文档 |
| --- | --- | --- | --- | --- |
| `page` | JavaScript Runtime | Stable | 截图、打开 URL/App、等待、权限 | [Page API](page.md) |
| `mouse` / `page.mouse` | JavaScript Runtime | Stable | 全局鼠标移动、点击、拖拽、位置与滚轮 | [Mouse API](mouse.md) |
| `Geometry` | JavaScript Runtime | Stable | screen logical coordinate 与相对区域 | [Geometry API](geometry.md) |
| `UI` | JavaScript Runtime | Stable visual / Experimental menu | 操作外部桌面应用：文本、图片与完整原生菜单路径 | [Desktop UI API](desktop-ui.md) |
| `ui` / `FloatingWindow` | JavaScript Runtime | Conditional | OpenDesk 自身 Toast、窗口、浮动工具栏与 UI lifecycle | [Custom UI](ui.md) |
| `Accessibility` | 可信本地 JavaScript Runtime | Experimental | 明确 scope 内 snapshot/find/read/perform/release 原生元素 | [Accessibility API](accessibility.md) |
| `keyboard` / `touchscreen` | JavaScript Runtime | Stable | 键盘与触屏输入 | [Input APIs](input.md) |
| `globalShortcut` | JavaScript Runtime | Stable（macOS / Windows） | 系统快捷键触发 JavaScript callback | [Global Shortcut API](global-shortcut.md) |
| `Recorder` | 可信本地 JavaScript Runtime | Experimental | 人工输入采集、actions 制作与 basic 普通 JS 生成 | [Recorder Runtime API](recorder-runtime.md) |
| `Events` | JavaScript Runtime | Experimental | 外部桌面状态 watcher | [Desktop Events API](events.md) |
| `App` | JavaScript Runtime | Experimental | 按稳定 identity 启动、等待、终止与重启应用 | [App API](app.md) |
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
| `notify()` | JavaScript Runtime | Secondary | 发送系统通知 | [通知与提示](notify.md) |
| `Notifications` | JavaScript Runtime | Experimental（macOS own-app） | 观察和移除 OpenDesk 自身已投递系统通知 | [Notifications API](notifications.md) |
| `Dialog` / `alert()` / `confirm()` / `prompt()` | JavaScript Runtime | Conditional | 异步原生模态提示与输入 | [Dialog API](dialog.md) |
| Global APIs | JavaScript Runtime | Stable | 计时器、等待、console、取消与参数工具 | [Global APIs](global-apis.md) |
| lodash / moment / query-string / cheerio / beautify | JavaScript Runtime | Secondary | 脚本辅助库 | [JS Libraries](libs.md) |
| `opendesk ai` | CLI | Stable | Coding Agent JSON desktop-tool surface 与 recipe 入口 | [AI CLI](ai-cli.md) |
| App package commands | 本机 CLI | P1 | App Mode package 静态 validate/doctor 与 machine-readable diagnostics | [App Package CLI](app-package-cli.md) |
| Protected package commands | 本机 CLI | P0/P1/P2；平台资格见文档 | `.odpkg` packaging、P1 offline License、P2 online activation 与执行 | [受保护包 CLI](protected-packages.md) |
| Scheduler | HTTP 模式 | Conditional | 持久化定时 JavaScript | [Scheduler](scheduler.md) / [Scheduler HTTP API](scheduler-api.md) |

## 一个公开对象保持一个主 Reference，独立协议才拆页

`docs/api/` 以用户真正看到的公开边界和实际查找任务组织，而不是按实现文件数量或章节长度拆页：

1. **同一公开对象/namespace，优先一个主文档。** 大写 `UI` 统一在 `desktop-ui.md`；小写 `ui` 统一从 `ui.md` 查找。
2. **代码入口与文档入口尽量直接对应。** 用户看到 `ui.xxx` 时应能直接打开 `ui.md`，不要求先知道内部把它称为 Custom UI。
3. **系统通知与 OpenDesk 自身 UI 分开。** `notify()` 保持在 `notify.md`；`ui.toast()` 属于小写 `ui` 的主 Reference。
4. **不同运行方向可以独立。** `http.md` 是脚本发起请求，`http-server.md` 是外部客户端调用 OpenDesk。
5. **独立协议可以独立。** `scheduler-api.md` 是 Scheduler HTTP 协议契约，不是把同一个 JavaScript 类硬拆成两页。

篇幅不是拆文件的理由。共享参数可以集中说明，但每个公开方法应有独立方法小节，方便阅读、链接和 Agent 检索。

## Stable 是默认路径，Conditional 与 Experimental 必须先检查能力

- 新脚本优先使用 **Stable** API；Conditional / Experimental 能力先检查 capability 和前置条件。
- 新脚本省略 `-stack`。早期 `upgraded` / `playwright` facade 不属于维护中的用户 API。
- `page.$`、`page.$$` 与旧 DOM 风格 `page.click(selector)` / `page.type(selector, text)` 不属于稳定桌面 API。
- `SQLite` 仅供可信本地 execution；HTTP、MCP、Scheduler 不注入通用 SQL remote route/tool。
- `Accessibility` 与 `UI` 菜单方法仅在可信本地 execution 启用；HTTP、MCP、Scheduler 当前只看到禁用 capability，不会读取目标。
- Scheduler 的产品能力与生命周期见 `scheduler.md`；HTTP 字段和响应合同见 `scheduler-api.md`。

`runtime-api.ai.json` 是给 Agent 的紧凑机器索引，不替代本目录各页面的用户调用契约。Runtime 内部注入与 polyfill 组成见 [Runtime API composition](../implementation/runtime/runtime-api-composition.md)，文档与类型同步规则见 [docs/api editme-cli TOC maintenance](../maintenance/docs-user-api-editme-toc-maintenance.md)。
