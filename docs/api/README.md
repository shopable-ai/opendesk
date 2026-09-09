---
title: 用户 API 文档
description: OpenDesk 面向脚本作者、自动化使用者与 Agent 的唯一用户 API 文档入口。
order: 1
---

# 用户 API 文档

`docs/api/` 是 OpenDesk 的用户使用入口。文档按**公开对象、运行入口或独立协议**组织：同一个公开对象的相关方法优先集中在同一个主文档中，不因某一组方法较长就再拆一个平行 API 页面。

## 从用户任务开始

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

直接复制运行仓库示例、正式 scripts 或排查旧命令时，打开 [Examples 快速索引](examples/README.md)。

### 从其他程序触发 OpenDesk

使用 [HTTP Server API](http-server.md) 或 [MCP 文档](../integrations/mcp/README.md)。它们是外部调用入口，不等于脚本内的 [`http` / `axios`](http.md)，也不等于浏览器 DOM 自动化。

## 推荐阅读顺序

1. `index.md`：完整 API 地图与文档导航
2. `ai-cli.md`：Codex、Claude Code 和 shell Agent 的 JSON desktop-tool surface
3. `page.md`：截图、打开 URL / App、等待、权限
4. `geometry.md`：screen logical coordinate、窗口/显示器区域与可重算定位
5. `desktop-ui.md`：大写 `UI` 的文本、图片与原生菜单接口
6. `mouse.md`：鼠标移动、点击、拖拽、位置与滚轮
7. `input.md`：键盘和触屏
8. `window.md`：窗口查询与控制
9. `accessibility.md`：明确 scope 内的第一方 macOS AX / Windows UIA 元素观察与动作（Experimental）
10. `global-shortcut.md`：macOS / Windows 系统级快捷键与 Runtime callback
11. `recorder-runtime.md`：显式授权的人工输入采集、actions 与 basic 普通 JS 生成
12. `events.md`：外部窗口、应用、剪贴板与显示器状态变化 watcher
13. `app.md`：按 stable identity 启动、等待、终止与重启桌面应用
14. `vision.md`：OCR、UI 文本识别、provider
15. `image-color.md`：模板匹配、颜色与图像辅助能力
16. `screen.md`：显示器、像素、截图别名、区域选择与录屏
17. `audio.md`：系统音频控制、设备发现与 capability-gated 固定声音模式匹配
18. `sound.md`：提示音和本地音频播放
19. `notify.md`：发送系统通知
20. `notifications.md`：观察、等待与移除 OpenDesk 自身通知
21. `dialog.md`：异步 alert / confirm / prompt
22. `clipboard.md`：系统剪贴板
23. `global-apis.md`：无需 import 的全局接口、console、等待、计时器和参数工具
24. `sqlite.md`：第一方本地 SQLite
25. `environment.md`：环境变量、`.env`、输出配置与优先级
26. `execution.md`：Execution ID、结构化输入、工作目录、来源和 artifact 上下文
27. `path.md`：平台原生路径字符串处理
28. `runtime.md`：JavaScript 执行、异步生命周期与兼容边界
29. `command.md`：本地命令执行、输出、错误与 execution-owned 清理
30. `custom-ui.md`：OpenDesk 自己的 Dialog、FloatingWindow 与受限 HTML/CSS 原生窗口
31. `native-extension.md`：Native Extension Plugin V1
32. `cookbook.md`：可直接改造的脚本范例
33. `scheduler.md`：Scheduler 功能、生命周期、持久化与本地管理页
34. `scheduler-api.md`：Scheduler 独立 HTTP 协议契约
35. 其余专题页按需查阅

## 文档分层

- **核心桌面自动化**：`page.md`、`geometry.md`、`desktop-ui.md`、`mouse.md`、`input.md`、`window.md`、`screen.md`、`accessibility.md`、`global-shortcut.md`、`recorder-runtime.md`、`events.md`、`app.md`
- **识别与媒体**：`vision.md`、`image-color.md`、`audio.md`、`sound.md`
- **系统与数据**：`system.md`、`command.md`、`path.md`、`file.md`、`sqlite.md`、`storage.md`、`clipboard.md`
- **网络与服务**：`http.md`、`http-server.md`、`scheduler.md`、`scheduler-api.md`
- **运行与交互**：`environment.md`、`execution.md`、`runtime.md`、`notify.md`、`notifications.md`、`dialog.md`、`custom-ui.md`、`global-apis.md`、`libs.md`、`native-extension.md`
- **实践范例**：`cookbook.md`、`examples/`

## 哪些文件应该合并，哪些应该独立

文档是否拆分以**公开边界**为准，而不是以篇幅为准：

- 同一对象/namespace 的方法：优先同一文件。例如 `UI.findText()`、`UI.tapImage()`、`UI.tapMenuItem()` 都属于 `UI`，统一在 `desktop-ui.md`。
- 不同公开对象：可以独立。例如 `Audio` 与 `Sound`、`notify()` 与 `Notifications`。
- 不同运行方向：可以独立。例如 `http.md` 是脚本发起 HTTP 请求，`http-server.md` 是外部调用 OpenDesk 的服务协议。
- 独立协议契约：可以独立。例如 `scheduler-api.md` 是 Scheduler 的 HTTP API，而 `scheduler.md` 说明 Scheduler 产品能力和生命周期。

## 这个目录的边界

这里仅说明用户能调用的 API、参数、返回值、平台限制、错误行为和可复制示例；不解释 Go 注入顺序、polyfill 构造、内部构造对象或文档生成流程。

- Runtime 内部组成见 [Runtime API composition](../implementation/runtime/runtime-api-composition.md)。
- 文档同步、机器索引、类型与事实优先级见 [API documentation maintenance](../maintenance/docs-user-api-editme-toc-maintenance.md)。
