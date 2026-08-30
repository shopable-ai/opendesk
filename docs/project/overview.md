# Clawdesk 当前能力说明：它已经是桌面自动化运行时，不只是单个脚本仓库

## 这是什么

Clawdesk 当前不是“某一个自动化脚本”的集合，而是一个正在演进中的桌面自动化项目，核心由四层组成：

1. JavaScript 桌面自动化运行时
2. HTTP 执行与结果回传接口
3. 面向 Agent 的 MCP 工具层
4. OCR / UI 检测 / 布局分析等视觉能力

它的目标不是只跑固定脚本，而是让人类、Hermes、Claude Desktop、其他 AI Agent 都能以统一方式驱动桌面自动化、截图识别、窗口控制和目标点击。

## 当前项目已经能完成什么

### 1. 执行桌面自动化 JavaScript

当前项目支持三种脚本输入方式：

- `-script`：执行现有 `.js` 脚本文件
- `-script-text`：直接执行命令行内联脚本文本
- `-script-stdin`：从标准输入读取脚本并执行

这意味着它已经可以被其他 AI 直接驱动，而不一定要先手写一个固定脚本文件。

### 2. 输出适合 Agent 消费的运行工件

每次执行会落盘到 `.runtime/runs/<executionId>/`，典型产物包括：

- `script_snapshot.js`
- `stdout.log`
- `stderr.log`
- `summary.json`
- `agent_summary.json`
- `events.ndjson`

这使得其他 AI 可以读取结构化结果，而不是只能看终端滚屏日志。

### 3. 作为 HTTP 服务对外提供执行能力

当前支持 HTTP 模式：

- `POST /executions`：创建执行任务
- `GET /executions/{id}`：查询状态
- `GET /executions/{id}/summary`：读取最终摘要
- `GET /executions/{id}/events`：SSE 流式读取事件
- `GET /status`：健康状态

这意味着项目可以作为本地自动化执行后端，被其他程序或其他电脑调用。

### 4. 提供 OCR 和 UI 检测能力

当前已经有两类视觉入口：

- CLI 视觉模式
- HTTP 视觉接口

典型能力包括：

- OCR 识别
- 根据目标文字做 UI 检测
- 分析布局区域
- 标注区域

这部分能力是桌面自动化的重要前提，因为很多动作都依赖“先看见，再定位，再点击”。

### 5. 提供面向 MCP Host 的桌面自动化工具面

当前仓库有独立的 `clawdesk-mcp`，可被 Hermes / Claude Desktop 等 MCP Host 作为 stdio server 拉起。

当前 MCP 工具面大致覆盖：

- 状态与权限：`tm_status`、`tm_permissions`、`tm_request_permissions`
- 窗口：`tm_list_windows`、`tm_get_active_window`、`tm_focus_window`、`tm_wait_for_window`
- 输入与动作：`tm_focus_and_type`、`tm_click`、`tm_type`、`tm_press_key`、`tm_scroll`
- 视觉：`tm_screenshot`、`tm_ocr`、`tm_detect_ui`、`tm_analyze_layout`、`tm_annotate_regions`
- 组合型 Agent 工具：`tm_inspect_desktop`、`tm_find_target`、`tm_act_on_target`、`tm_click_text`、`tm_click_region`

这说明项目已经不只是底层 API，而是开始具备“让 Agent 按 inspect -> find -> act 主链路做事”的能力。

### 6. 支持多种浏览器自动化运行时栈

当前存在三种 browser stack：

- `legacy`
- `upgraded`
- `playwright`

这说明项目正在从旧式 page 模型向更稳定、更接近现代自动化接口的 facade 演进，但还处于兼容迁移阶段。

## 当前项目最适合解决哪些需求

这个项目目前最适合以下场景：

### 1. 本机桌面自动化

- 截图
- OCR 识别
- 窗口聚焦
- 坐标点击
- 键盘输入
- 滚动

### 2. Agent 驱动的半结构化 UI 操作

- 先截图，再找目标文本，再点击目标区域
- 先检查活动窗口，再输入消息
- 先做桌面检查，再决定是否执行动作

### 3. 把自动化能力暴露给其他 AI / 工具

- 通过 CLI 调用
- 通过 HTTP 调用
- 通过 MCP 调用

### 4. 以运行工件为核心的自动化验收与复盘

- 保存每轮执行证据
- 给其他 AI 读取 summary / logs / events
- 支持失败排查与后续重放

## 当前项目还不完善的地方

当前项目是“核心链路已具备，但工程收口还不完整”的状态。迁移到其他对话或其他电脑时，必须明确这些边界：

### 1. 视觉能力依赖外部 OCR provider 配置

例如 paddle 路径下，需要外部配置如 `PADDLE_OCR_ENDPOINT`。如果没有配置好，OCR / detect-ui / find-target 链路会被阻断。

好处是：当前 MCP 层已经开始把这类问题包装成结构化 blocker，而不是只抛出模糊错误。

### 2. macOS 权限链路是前提条件

项目大量能力依赖：

- 屏幕录制
- 辅助功能
- 输入监控
- 自动化

因此换电脑时，最常见问题不是代码本身，而是系统权限没有授予或重编译后权限绑定漂移。

### 3. 项目里同时存在“稳定入口”和“演进中模块”

仓库里有较多研究性文档、方案文档、测试工件和演进中的模块。不要把所有目录都视为同等稳定。真正优先读取的是：

- `README.md`
- `QUICKSTART.md`
- `docs-user-api/`
- `docs/mcp/`
- `pkg/http/`
- `pkg/mcpserver/`
- `automation/`

### 4. 全量测试并非全部通过

本轮实际验证结果是：

- `go test ./pkg/...` 中，`pkg/container`、`pkg/execution`、`pkg/http`、`pkg/mcpserver`、`pkg/runtime`、`pkg/semanticexec` 通过
- `pkg/visionrun` 仍有失败项，说明视觉恢复/验证这条更高层流程还没有完全收口

所以对外介绍时应表述为：

- 核心执行层、HTTP 层、MCP 层已可用
- 视觉增强与高层恢复流水线仍在完善中

不要对外描述成“整个项目已经完全稳定”。

## 如何使用这个项目

### 方式一：直接本地执行脚本

适合人工验证或让 AI 直接下发短脚本。

示例：

```bash
./clawdesk -script-text "console.log('hello')" -timeout 1
printf "console.log('stdin run')\n" | ./clawdesk -script-stdin -timeout 1
```

在 macOS 上，优先使用稳定包装器：

```bash
REBUILD=1 ./scripts/run_macos_stable.sh -script-text "console.log('hello')" -timeout 1
```

### 方式二：作为 HTTP 自动化后端

适合其他程序或另一台机器通过 API 调用。

启动：

```bash
./clawdesk -http -port 60844
```

提交执行任务：

```bash
curl -X POST http://127.0.0.1:60844/executions \
  -H "Content-Type: application/json" \
  -d '{
    "script": "console.log(\"hello\")",
    "timeout": 120
  }'
```

### 方式三：作为 MCP server 接入其他 Agent

适合 Hermes、Claude Desktop 等 host 直接发现并调用桌面工具。

构建并运行：

```bash
go build -o dist/clawdesk-mcp ./cmd/clawdesk-mcp
./dist/clawdesk-mcp
```

MCP host 通过 stdio 拉起后，就可以调用 `tm_*` 工具链。

## 给其他 AI 的最小理解模型

如果要把这个项目复制到另一个对话、另一个 AI 或另一台电脑，最小正确理解应当是：

1. 它是桌面自动化运行时，不是单个业务脚本
2. 它同时暴露 CLI、HTTP、MCP 三种使用面
3. 它的核心动作链路是 screenshot / OCR / inspect / find / click / type
4. 它已经能输出结构化执行工件，便于 Agent 复用
5. 它依赖 macOS 权限和外部 OCR provider 配置
6. 它有一部分更高层视觉恢复流水线仍未完全稳定

## 推荐接手阅读顺序

如果另一个 AI 要快速接手，建议按下面顺序读：

1. `README.md`
2. `QUICKSTART.md`
3. `docs-user-api/index.md`
4. `docs/mcp/README.md`
5. `pkg/http/handler.go`
6. `pkg/mcpserver/server.go`
7. `pkg/mcpserver/runtime.go`
8. `automation/` 下核心对象实现

## 一句话总结

Clawdesk 当前已经具备“被 AI 驱动的桌面自动化基础设施”雏形，重点价值在于统一了脚本执行、HTTP 调用、MCP 工具化、视觉识别和结构化运行工件，但它还不是一个所有高层流程都已完全稳定的成品系统。