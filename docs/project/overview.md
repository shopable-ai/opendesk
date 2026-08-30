# Clawdesk 项目概览

## 定位

Clawdesk 是一个面向本地桌面自动化与 AI Agent 的执行运行时。核心不是某一个业务脚本，而是把桌面感知、窗口与输入控制、视觉/OCR、脚本运行、HTTP 调用、MCP 工具和执行证据统一到同一个工程中。

## 核心使用面

### JavaScript Runtime / CLI

支持：

```text
-script
-script-text
-script-stdin
```

JavaScript 运行时由 Go 注入桌面、窗口、输入、视觉、文件、网络和系统能力，并加载 polyfill / 内置 JS library。

用户 API 的唯一正式说明位于：

```text
docs-user-api/
```

### HTTP

默认 container/DI 模式提供 execution 与 vision API，核心入口包括：

```text
POST /executions
GET  /executions/{id}
GET  /executions/{id}/summary
GET  /executions/{id}/events
GET  /status
POST /vision/ocr
POST /vision/detect-ui
```

详细契约见：

```text
docs-user-api/http-server.md
```

### MCP

独立入口：

```text
cmd/clawdesk-mcp/
```

当前推荐 Agent 主链路：

```text
tm_inspect_desktop
-> tm_find_target
-> tm_act_on_target
```

MCP 还提供窗口、截图、OCR、布局、点击、输入、按键、滚动等原子能力。

文档入口：

```text
docs/integrations/mcp/README.md
```

## 核心能力层

### Desktop primitives

主要位于：

```text
automation/
```

包括：

- page / screenshot
- mouse / keyboard / touchscreen
- window / screen
- clipboard
- file / system / storage
- HTTP / axios
- OCR / Vision / ImageColor
- sound / floating window 等辅助能力

### Execution

主要位于：

```text
pkg/execution/
```

执行默认生成：

```text
.runtime/runs/<executionId>/
```

典型工件：

```text
script_snapshot.js
stdout.log
stderr.log
summary.json
agent_summary.json
events.ndjson
```

这些工件用于 Agent 低 token 消费、失败定位和后续回放/验证。

### Browser compatibility

当前支持：

```text
legacy
upgraded
playwright
```

`upgraded` / `playwright` 是兼容 facade，不代表完整 Playwright 浏览器引擎。能力边界见：

```text
docs/architecture/browser-automation/
```

## 工程文档结构

```text
docs/
├── project/
├── architecture/
├── implementation/
├── quality/
├── integrations/
├── scenarios/
├── research/
├── plans/
└── maintenance/
```

角色：

- `project/`：项目级入口、当前上下文和 runbook。
- `architecture/`：当前系统结构与长期契约。
- `implementation/`：当前实现机制与平台说明。
- `quality/`：Gate、测试、Failure Taxonomy、评审规则。
- `integrations/`：MCP 等外部集成。
- `scenarios/`：WeChat 等具体场景。
- `research/`：研究与候选方案，不是 Source of Truth。
- `plans/`：仍未完成的路线图。
- `maintenance/`：仓库和文档治理。

## 当前边界

### macOS 权限

真实桌面动作可能依赖：

- Screen Recording
- Accessibility
- AppleEvents / Automation
- 输入控制相关权限

权限属于运行环境前置条件，不应通过业务逻辑绕过。

### OCR Provider

OCR / detect-ui / 部分 target discovery 依赖实际 provider 配置。缺少 provider 时，MCP 会尽量返回结构化 external blocker，但这不等于视觉链路已经可用。

### 高风险动作

发送、提交、删除等动作不能仅凭历史坐标、Golden Sample 或单一 OCR 结果执行。应遵循：

```text
fresh perception
-> semantic identity
-> action target
-> precondition
-> action
-> postcondition
-> evidence
```

质量规则见：

```text
docs/quality/gates-and-evidence.md
```

## 事实优先级

项目/工程事实：

```text
当前源码 + 测试 + 可复现运行证据
-> docs/ 当前 canonical 文档
-> research / plans / reports
-> archive / Git history
```

用户 API：

```text
当前源码/runtime
-> docs-user-api/runtime-api.ai.json
-> docs-user-api/*.md
-> types/*.d.ts
-> Git history
```

## 接手阅读顺序

推荐：

```text
README.md
QUICKSTART.md
docs/README.md
docs-user-api/index.md
docs/project/current-context.md
docs/project/runbook.md
docs/quality/gates-and-evidence.md
docs/integrations/mcp/README.md
```

随后再按任务读取对应 architecture / implementation / scenario / research。
