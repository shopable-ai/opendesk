---
title: 用户 API 文档
description: OpenDesk 面向脚本作者、自动化使用者、App 开发者与 Agent 的唯一用户 API 文档入口。
order: 20
docType: index
---

# 用户 API 文档

`docs/api/` 是 OpenDesk 的用户调用入口。文档按**公开对象、用户工作流、CLI 或独立协议**组织，而不是按 Go package、native driver 或产品内部目录组织。

核心规则：

```text
用户任务 ≠ API class
API class ≠ Runtime mode
Runtime mode ≠ internal package
```

具体文档格式和 canonical Reference 规则见 [.rules.md](.rules.md)。

## 命令示例与开发者身份

普通用户和 App 开发者默认使用已安装 Runtime：

```bash
opendesk ...
```

源码维护者才通常使用：

```bash
./dist/opendesk ...
```

已安装 Runtime 不要求 checkout OpenDesk 源码、安装 Go 或先 `make build`。只有明确标注源码维护者的段落才应要求 `apps/opendesk`、`pkg/**`、`internal/**` 或 `scripts/build_*`。

## 按任务进入

### Coding Agent 操作桌面

```bash
opendesk ai capabilities
opendesk ai windows
opendesk ai screenshot --active-window
opendesk ai run recipe.js --input '{"message":"hello"}'
```

完整 JSON contract、坐标、artifact 与 recipe 输入见 [AI CLI](ai-cli.md)。

### 普通桌面 JavaScript

```bash
opendesk -script examples/runtime/api-quickstart.js
```

多文件代码可以使用 `.mjs` 与静态 `import` / `export`：

```bash
opendesk -script examples/runtime/modules/basic/main.mjs -console-mode script
```

模块入口与限制见 [JavaScript Runtime](runtime.md)。桌面自动化通常按 [Page](page.md) → [Geometry](geometry.md) → [Desktop UI](desktop-ui.md) → [Mouse](mouse.md) / [Input](input.md) → [Window](window.md) 阅读。

### 停止正在运行的脚本

不同入口使用不同的停止控制，不存在统一的 `Execution.cancel()`：

- **Script Runner**：点击“停止”，请求取消当前 recipe execution，并取消 Runner 队列中尚未开始的剩余脚本；
- **本地 CLI**：中断当前运行，例如 `Ctrl+C`；
- **HTTP execution**：调用 `DELETE /executions/{id}` 精确取消指定 execution；
- **单个可取消操作**：例如 `Command.run(..., {signal})`，使用对应 `AbortController`，只取消该操作而不是整个 execution。

停止是取消与清理，不是暂停或回滚；已经发生的桌面、文件、网络或外部应用副作用不会自动撤销。完整语义见 [JavaScript Runtime：异步完成与取消](runtime.md#异步完成与取消)，外部精确取消见 [HTTP Server API](http-server.md#delete-executionsid)。

### OpenDesk 自己的 UI

- `ui.toast()`：瞬时 OpenDesk feedback，canonical API。
- `ui.createWindow()`：受限 HTML/CSS UI。
- `FloatingWindow`：typed native toolbar。
- `ui.notify()`：`ui.toast()` 的 Deprecated/Compatibility alias；兼容关系记录在 canonical Reference 内，不单独建立旧入口页面。
- 全局 `notify()`：操作系统通知中心，不属于小写 `ui`。
- `Dialog.*`：一次性 alert / confirm / prompt。

完整 Reference 见 [Custom UI](ui.md)、[通知与提示](notify.md)、[Dialog](dialog.md)。

### App Mode 产品应用

普通 App 开发者维护自己的 package：

```text
my-app/
├── opendesk.app.json
├── main.js
├── modules/
└── assets/
```

```bash
opendesk app validate ./my-app
opendesk app doctor ./my-app
opendesk -app ./my-app -console-mode script
```

职责边界：

- [Script App Packaging](script-app-packaging.md)：App 作者工作流。
- [App Mode 与 App Shell](app-shell.md)：`-app`、Manifest、App Shell、`automation.app` 的关系。
- [automation.app API](automation-app.md)：当前 App Mode execution 的 runtime method Reference。
- [App Package CLI](app-package-cli.md)：validate / doctor / build。
- [App Package Format](../architecture/app-package-format.md)：Manifest contract。
- [App API](app.md)：操作**外部桌面应用**，与 `automation.app` 不同。

官方 OpenDesk Desktop Product Shell 的 Recorder、Scheduler、Permissions、release staging 等源码维护者内容见 [Desktop Product Shell](../architecture/opendesk-desktop-product-shell.md)。

### Scheduler

普通桌面用户优先使用 OpenDesk **计划中心（Scheduler Center）**。Headless / 开发 / 本机协议集成再使用 `opendesk -http` 与 `/scheduler`。

- [Scheduler](scheduler.md)：用户入口、时间模型、任务操作、Execution 语义。
- [Scheduler HTTP API](scheduler-api.md)：本机 HTTP protocol。
- [Scheduler Runtime Concurrency](../architecture/scheduler-runtime-concurrency.md)：Store/Runner ownership、SQLite/WAL、lock、takeover/recovery。

Web 管理页不是桌面产品需要重复暴露的第二个普通用户“计划中心”。

### Recorder

OpenDesk 有两个明确不同的 Recorder surface，导航名称必须区分：

- **Human Recorder / Runtime Recorder** → [Recorder Runtime API](recorder-runtime.md)：可信本地人工输入采集、actions、basic JS candidate。
- **Agent Recorder / Agent-first Recorder** → [Recorder MCP API](recorder.md)：`tm_recorder_*` 会话、证据、distill 与 compile。

它们不共享同一生命周期或数据模型；不要只写一个没有上下文的“Recorder”链接。

### LLM 与 Agent

正常业务入口优先：

```js
const modelResult = await LLM.generate({prompt: '返回 OK'});
const agentResult = await Agent.run({prompt: '返回 OK'});
```

`LLM.getCapabilities()` / `Agent.getCapabilities()` 是可选 diagnostics，不是每次调用前的统一握手。共享字段 `enabled / supported / configured / available / reason / checked / authenticated` 见 [Capability 状态模型](capabilities.md)。

### 外部程序触发 OpenDesk

使用 [HTTP Server API](http-server.md) 或 [MCP 文档](../integrations/mcp/README.md)。它们是外部调用入口，不等于脚本内 [HTTP API](http.md)。

如果目标是让一个已经运行的可信本地 JavaScript execution 接收同机外部系统的短处理 JSON
callback，使用 [Webhook API](webhook.md)。最小用户路径只运行 OpenDesk JavaScript，再把随机
localhost URL 与认证 header 配置给真实调用方；它不同于通过 HTTP Server 创建新 execution。

## 文档地图

### 桌面自动化

1. [AI CLI](ai-cli.md) — Agent desktop-tool surface
2. [Page](page.md) — screenshot、open URL/App、wait、permissions
3. [Geometry](geometry.md) — logical coordinate 与可重算区域
4. [Desktop UI](desktop-ui.md) — 大写 `UI` 文本/图像/菜单
5. [Mouse](mouse.md) / [Input](input.md) — 输入
6. [Window](window.md) / [Screen](screen.md) — 窗口与显示器
7. [Accessibility](accessibility.md) — 显式 scope 的 AX/UIA Experimental API
8. [Vision](vision.md) / [ImageColor](image-color.md) — OCR 与图像辅助

### OpenDesk UI 与交互

9. [Custom UI](ui.md) — 小写 `ui`、Toast、WindowHandle、ControlHandle、FloatingWindow
10. [Dialog](dialog.md) — alert / confirm / prompt
11. [notify](notify.md) — 系统通知
12. [Notifications](notifications.md) — 已投递系统通知观察（Experimental）
13. [Clipboard](clipboard.md) / [Global Shortcut](global-shortcut.md) / [Events](events.md)
14. [App](app.md) — 外部桌面应用生命周期
15. [App Mode 与 App Shell](app-shell.md) + [automation.app](automation-app.md)
16. [Human Recorder](recorder-runtime.md)
17. [Agent Recorder](recorder.md)
18. [Audio](audio.md) / [Sound](sound.md)

### Runtime、数据与 AI

19. [Capability 状态模型](capabilities.md)
20. [Execution](execution.md)
21. [JavaScript Runtime](runtime.md) — 异步生命周期、停止与取消语义
22. [Global APIs](global-apis.md)
23. [Environment](environment.md)
24. [Path](path.md) / [File](file.md) / [Storage](storage.md) / [SQLite](sqlite.md)
25. [System](system.md) / [Command](command.md)
26. [LLM](llm.md) / [Agent](agent.md)
27. [Libraries](libs.md) / [Native Extension](native-extension.md)

### 服务与交付

28. [HTTP](http.md) — 脚本发出 HTTP 请求
29. [HTTP Server](http-server.md) — 外部调用 OpenDesk
30. [Webhook](webhook.md) — 当前本地 execution 接收同机认证 callback
31. [Scheduler](scheduler.md) / [Scheduler HTTP API](scheduler-api.md)
32. [Script App Packaging](script-app-packaging.md)
33. [Installed Runtime App Builder](app-builder.md)
34. [App Package CLI](app-package-cli.md)
35. [Protected Packages](protected-packages.md)
36. [Cookbook](cookbook.md) / [Examples](examples/README.md)

## Canonical Reference 与其他文档类型

`docs/api/` 可以包含不同类型的当前用户文档，但不能让它们互相争夺事实源：

- `reference`：一个公开对象/namespace 的 canonical method contract。
- `guide`：围绕用户目标组织，并链接 Reference。
- `concept`：解释关系和共享语义，不复制 method contract。
- `protocol`：HTTP/MCP/transport contract。
- `cli`：命令、flag、stdout/stderr、exit code。
- `index`：导航与 source-of-truth 规则。

Deprecated/Compatibility **方法或名称**仍可在其 canonical Reference 内保留最小迁移说明；仅用于旧文件名、旧路径跳转的 Markdown 页面不属于长期文档资产。仓库内引用完成迁移后应删除这类占位页；若公开站点必须保留 URL 重定向，应由文档发布/路由层承担，而不是继续维护一份空壳 Markdown。

典型例子：

```text
ui.md                 = reference
app-shell.md          = concept
automation-app.md     = reference
scheduler.md          = guide
scheduler-api.md      = protocol
README.md             = index
```

## 不把内部实现写成用户 API

以下内容通常进入 `docs/architecture/` / `docs/implementation/`，而不是占据 API Reference 主结构：

- Go 注入顺序和内部 package；
- SQLite table/driver/lock 实现；
- App Shell native host 线程细节；
- release staging 内部路径；
- 测试 harness 历史；
- 未来规划。

用户必须知道的安全、权限、生命周期限制仍应留在对应 Reference/Guide，但实现细节通过链接下沉。

## 修改与验收

维护 API/文档时同时检查：

```text
Runtime / polyfill implementation
→ canonical docs/api Reference
→ docs/api/runtime-api.ai.json
→ types/*.d.ts
```

机器索引和类型是派生消费面，不是第二事实源。修改相关能力后运行：

```bash
node scripts/check_api_docs_contract.js
```

更完整的维护规则见 [.rules.md](.rules.md)、[Runtime Capability Contract](../architecture/runtime-capability-contract.md) 与 [Runtime API composition](../implementation/runtime/runtime-api-composition.md)。
