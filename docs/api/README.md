---
title: 用户 API 文档
description: OpenDesk 面向脚本作者、自动化使用者与 Agent 的唯一用户 API 文档入口。
order: 20
---

# 用户 API 文档

`docs/api/` 是 OpenDesk 的用户使用入口。文档按**公开对象、运行入口或独立协议**组织：同一个公开对象的相关方法优先集中在同一个主文档中，不因某一组方法较长就再拆一个平行 API 页面。

## 按用户任务进入 API，而不是按实现目录阅读

所有示例均从仓库根目录运行。

### 让 Coding Agent 操作桌面

先让 Agent 发现当前机器可用的桌面能力，再逐步缩小目标窗口和截图范围：

```bash
./opendesk ai capabilities
./opendesk ai windows
./opendesk ai screenshot --active-window
```

稳定流程应保存为 parameterized JavaScript recipe：

```bash
./opendesk ai run recipe.js --input '{"message":"hello"}'
```

完整坐标规则、JSON 输出、截图 artifact、错误码与 recipe 输入见 [AI CLI](ai-cli.md)。

### 写一次性或可维护的桌面脚本

从 `page`、输入和窗口 API 开始：

```bash
./opendesk -script examples/api-quickstart.js
```

推荐按 [Page API](page.md) → [Geometry API](geometry.md) → [Desktop UI API](desktop-ui.md) → [Mouse API](mouse.md) → [Input APIs](input.md) → [Window API](window.md) 阅读。

需要 OCR、图片定位或完整原生菜单路径时都从 [Desktop UI API](desktop-ui.md) 进入；需要底层原生语义元素 snapshot/find/read/perform 时再读 [Accessibility API](accessibility.md)。

需要 OpenDesk 自己显示界面或反馈时，直接进入 [Custom UI](ui.md)：`ui.toast()`、`ui.createWindow()`、`ui.closeAll()`、`ui.on()` 与 `FloatingWindow` 都从这里查。操作系统通知仍使用 [通知与提示](notify.md)，需要明确确认或输入时使用 [Dialog API](dialog.md)。

直接复制运行仓库示例、正式 scripts 或排查旧命令时，打开 [Examples 快速索引](examples/README.md)。

### 发布为可双击桌面应用

已经有可运行的 OpenDesk JavaScript，希望增加 `opendesk.app.json`、App Shell、Tray/Menu Bar、Single Instance，或装入 macOS `.app` / Windows portable distribution 时，使用 [Script App Packaging](script-app-packaging.md)。

该页说明 App Mode package 目录、开发态 `-app` 入口、macOS/Windows staging 和验证边界；App 内 `automation.app` 的方法 Reference 仍在 [automation.app](app-shell.md)。Script App Packaging 不等于 `.odpkg` 源码保护，也不在 Manifest 中发明未实现的端口或 installer 配置。

### 发布受保护包

把已经写好的 JavaScript 打包为 `.odpkg`、检查/验签，或交接 P1 device License 与 P2 online activation 时，
使用 [受保护包 CLI](protected-packages.md)。该页把作者工作流、Publisher 材料、客户授权和最终执行分开说明，
同时给出秘密文件边界和 macOS/Windows 资格矩阵；普通
`.js` 执行不需要 package 或 License。

### 从其他程序触发 OpenDesk

使用 [HTTP Server API](http-server.md) 或 [MCP 文档](../integrations/mcp/README.md)。它们是外部调用入口，不等于脚本内的 [HTTP API](http.md)，也不等于浏览器 DOM 自动化。

## 新用户沿着一条最短可执行路径开始

### 桌面自动化主线

1. `index.md`：完整 API 地图与文档导航
2. `ai-cli.md`：Codex、Claude Code 和 shell Agent 的 JSON desktop-tool surface
3. `page.md`：截图、打开 URL / App、等待、权限
4. `geometry.md`：screen logical coordinate、窗口/显示器区域与可重算定位
5. `desktop-ui.md`：大写 `UI` 的文本、图片与原生菜单接口
6. `mouse.md`：鼠标移动、点击、拖拽、位置与滚轮
7. `input.md`：键盘和触屏
8. `window.md`：窗口查询与控制
9. `screen.md`：显示器、像素、截图别名、区域选择与录屏
10. `accessibility.md`：明确 scope 内的第一方 macOS AX / Windows UIA 元素观察与动作（Experimental）
11. `vision.md`：OCR、UI 文本识别、provider
12. `image-color.md`：模板匹配、颜色与图像辅助能力

### 交互与状态能力

13. `ui.md`：小写 `ui`、Toast、`ui.createWindow()` 与 `FloatingWindow`
14. `dialog.md`：异步 alert / confirm / prompt
15. `notify.md`：系统通知 `notify()`
16. `notifications.md`：观察、等待与移除 OpenDesk 自身已投递系统通知（Experimental）
17. `clipboard.md`：系统剪贴板
18. `global-shortcut.md`：macOS / Windows 系统级快捷键与 Runtime callback
19. `events.md`：外部窗口、应用、剪贴板与显示器状态变化 watcher
20. `app.md`：按 stable identity 启动、等待、终止与重启外部桌面应用
21. `app-shell.md`：App Mode 的 `automation.app`、tray action、菜单状态与退出
22. `recorder-runtime.md`：显式授权的人工输入采集、actions 与 basic 普通 JS 生成
23. `recorder.md`：Agent-first Recorder MCP 的显式会话、证据和 Flow 编译
24. `audio.md`：系统音频控制、设备发现与 capability-gated 固定声音模式匹配
25. `sound.md`：提示音和本地音频播放

### Runtime 与数据

26. `execution.md`：Execution ID、结构化输入、工作目录、来源和 artifact 上下文
27. `runtime.md`：JavaScript 执行、异步生命周期与兼容边界
28. `global-apis.md`：无需 import 的全局接口、console、等待、计时器和参数工具
29. `environment.md`：环境变量、`.env`、输出配置与优先级
30. `path.md`：平台原生路径字符串处理
31. `file.md`：文件和目录操作
32. `storage.md`：AppStorage 持久化键值
33. `sqlite.md`：第一方本地 SQLite
34. `system.md`：系统信息、进程、网络和 session capability
35. `command.md`：本地命令执行、输出、错误与 execution-owned 清理
36. `libs.md`：Runtime 自动加载的 JavaScript 辅助库
37. `native-extension.md`：Native Extension Plugin V1

### 服务、发布与范例

38. `http.md`：脚本内 HTTP 请求
39. `http-server.md`：外部程序调用 OpenDesk 的 HTTP Server
40. `scheduler.md`：Scheduler 功能、生命周期、持久化与本地管理页
41. `scheduler-api.md`：Scheduler 独立 HTTP 协议契约
42. `script-app-packaging.md`：已有 JavaScript → App Mode package → macOS/Windows 桌面发布产物
43. `protected-packages.md`：`.odpkg` packaging、P1/P2 License CLI、执行、安全边界与平台资格
44. `cookbook.md`：可直接改造的脚本范例
45. `examples/`：示例源码、直接运行命令与测试脚本索引

## 用用户调用边界分组，保持主 Reference 扁平

- **核心桌面自动化**：`page.md`、`geometry.md`、`desktop-ui.md`、`mouse.md`、`input.md`、`window.md`、`screen.md`、`accessibility.md`、`global-shortcut.md`、`recorder-runtime.md`、`events.md`、`app.md`
- **OpenDesk 自身 UI 与交互**：`ui.md`、`dialog.md`、`notify.md`、`notifications.md`、`app-shell.md`
- **识别与媒体**：`vision.md`、`image-color.md`、`audio.md`、`sound.md`
- **系统与数据**：`system.md`、`command.md`、`path.md`、`file.md`、`sqlite.md`、`storage.md`、`clipboard.md`
- **网络与服务**：`http.md`、`http-server.md`、`scheduler.md`、`scheduler-api.md`
- **运行时**：`environment.md`、`execution.md`、`runtime.md`、`global-apis.md`、`libs.md`、`native-extension.md`
- **发布与交付**：`script-app-packaging.md`、`protected-packages.md`
- **实践范例**：`cookbook.md`、`examples/`

## 只有公开边界不同才拆成独立页面

文档是否拆分以**公开边界和用户查找任务**为准，而不是以篇幅或内部类数量为准：

- 同一对象/namespace 的方法优先使用同一个主文件。例如 `UI.findText()`、`UI.tapImage()`、`UI.tapMenuItem()` 都属于 `UI`，统一在 `desktop-ui.md`；小写 `ui.*` 统一从 `ui.md` 查找。
- 大写 `UI` 与小写 `ui` 是两个不同公共入口：`UI` 操作外部桌面应用，`ui` 创建和管理 OpenDesk 自身界面及轻量反馈。文件名直接对应这一区分：`desktop-ui.md` 与 `ui.md`。
- 系统通知 `notify()` 属于 `notify.md`；不要因为 `ui.toast()` 也是“提示”就把小写 `ui` 的完整 Reference 拆到通知文档。
- 不同运行方向可以独立。例如 `http.md` 是脚本发起 HTTP 请求，`http-server.md` 是外部调用 OpenDesk 的服务协议。
- 独立协议可以独立。例如 `scheduler-api.md` 是 Scheduler HTTP API，而 `scheduler.md` 说明 Scheduler 产品能力和生命周期。
- 面向用户的独立发布流程可以有独立入口页，但不能重复同一 Runtime 对象的完整方法 Reference。例如 `script-app-packaging.md` 说明 App Mode package 与平台发布流程，`automation.app` 方法仍只在 `app-shell.md` 维护。

## docs/api 只记录可调用契约，不记录 Runtime 实现

这里仅说明用户能调用的 API、参数、返回值、平台限制、错误行为和可复制示例；不解释 Go 注入顺序、polyfill 构造、内部构造对象或文档生成流程。

- Runtime 内部组成见 [Runtime API composition](../implementation/runtime/runtime-api-composition.md)。
- 文档同步、机器索引、类型与事实优先级见 [API documentation maintenance](../maintenance/docs-user-api-editme-toc-maintenance.md)。
