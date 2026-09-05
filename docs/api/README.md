---
title: 用户 API 文档
description: OpenDesk 面向脚本作者、自动化使用者与 Agent 的唯一用户 API 文档入口。
order: 1
---

# 用户 API 文档

`docs/api/` 是 OpenDesk 的用户使用入口。先按你要完成的任务选择入口；不需要先了解 Go
源码、polyfill 或历史迁移细节。

## 从用户任务开始

所有示例均从仓库根目录运行。

### 让 Coding Agent 操作桌面

先让 Agent 从 CLI 自己发现当前机器可用的桌面能力，再逐步缩小目标窗口和截图范围：

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

按 [Page API](page.md) → [Mouse API](mouse.md) → [Input APIs](input.md) → [Window API](window.md) 阅读；需要识别
文本或图像时再使用 [Vision API](vision.md) 或 [ImageColor API](image-color.md)。

需要直接复制运行仓库内示例、正式 scripts 或排查旧命令时，直接打开
[Examples 快速索引](examples/README.md)。

### 从其他程序触发 OpenDesk

使用 [HTTP Server API](http-server.md) 或 [MCP 文档](../integrations/mcp/README.md)。它们是外部调用入口，
不等于浏览器 DOM 自动化。

## 推荐阅读顺序

1. `index.md`：完整 API 地图与文档导航
2. `ai-cli.md`：Codex、Claude Code 和 shell Agent 的 JSON desktop-tool surface
3. `page.md`：截图、打开 URL / App、等待、权限
4. `mouse.md`：鼠标移动、点击、拖拽、位置与滚轮
5. `input.md`：键盘和触屏
6. `global-shortcut.md`：macOS / Windows 系统级快捷键与 Runtime callback
7. `events.md`：外部窗口、应用、剪贴板与显示器状态变化 watcher
8. `app.md`：按 stable identity 启动、等待、终止与重启桌面应用
9. `audio.md`：默认输出音量、mute、输入/输出设备发现与 capability-gated 固定声音模式匹配；默认 pattern capture backend 尚不可用
10. `window.md`：窗口查询与控制
11. `vision.md`：OCR、UI 文本定位、provider
12. `image-color.md`：模板匹配、颜色与图像辅助能力
13. `notify.md`：系统通知调用契约、平台限制与可见性边界
14. `notifications.md`：macOS/OpenDesk 自身通知的观察、等待、脱敏和移除边界
15. `dialog.md`：异步 alert / confirm / prompt、UI capability 与隐私边界
16. `clipboard.md`：系统剪贴板对象与文本读写
17. `global-apis.md`：无需 import 即可调用的全局接口、console、等待、计时器和参数工具
18. `sqlite.md`：第一方、本地 execution-owned 的异步 SQLite 句柄、参数、事务与取消边界
19. `environment.md`：`System.getEnv()`、`Execution.env`、`.env`、`.opendesk.env`、输出档位、优先级与 `-env-file`
20. `execution.md`：每次运行的 ID、结构化输入、工作目录、来源和 artifact 上下文
21. `path.md`：平台原生路径字符串与 `Execution.scriptPath/scriptDir`
22. `runtime.md`：JavaScript 执行、异步生命周期与历史兼容边界
23. `command.md`：本地命令执行、输出、错误与 execution-owned 清理
24. `sound.md`：播放并控制内置提示音或本地音频文件
25. `custom-ui.md`：Dialog、FloatingWindow 和受限 HTML/CSS 原生窗口的选择与调用
26. [native-extension.md](native-extension.md)：本机 CLI 默认提供、仅程序相对目录 discovery 的 Native Extension Plugin V1；必须先安装与实际 CLI 配套的完整 source-free bundle，底层复用 one-shot Native Process Protocol V0
27. [examples/native-extensions/README.md](../../examples/native-extensions/README.md)：插件作者 build/package、source-free bundle 与程序相对安装；业务调用脚本为 [quickstart.js](../../examples/native-extensions/quickstart.js)
28. `cookbook.md`：可直接改造的脚本范例
29. `scheduler.md`：file/inline JavaScript 定时任务、SQLite 持久化与本地管理页
30. `scheduler-api.md`：Scheduler 本地 HTTP API 的字段、响应与完整调用示例
31. 其余专题页按需查阅

## 文档分层

- **核心桌面自动化**：`page.md`、`mouse.md`、`input.md`、`global-shortcut.md`、`events.md`、`app.md`、`audio.md`、`window.md`、`screen.md`
- **视觉能力**：`vision.md`、`image-color.md`
- **系统与数据**：`system.md`、`command.md`、`path.md`、`file.md`、`sqlite.md`、`storage.md`、`clipboard.md`、`audio.md`
- **网络与服务**：`http.md`、`http-server.md`、`scheduler.md`、`scheduler-api.md`
- **运行时**：`environment.md`、`execution.md`、`runtime.md`、`command.md`、`notify.md`、`notifications.md`、`dialog.md`、`sound.md`、`custom-ui.md`、`global-apis.md`、`libs.md`、[native-extension.md](native-extension.md)
- **实践范例**：`cookbook.md`

## 这个目录的边界

这里仅说明用户能调用的 API、参数、返回值、平台限制、错误行为和可复制示例；不解释
Go 注入顺序、polyfill 构造、内部构造对象或文档生成流程。

- Runtime 内部组成见 [Runtime API composition](../implementation/runtime/runtime-api-composition.md)。
- 文档同步、机器索引、类型与事实优先级见 [API documentation maintenance](../maintenance/docs-user-api-editme-toc-maintenance.md)。
