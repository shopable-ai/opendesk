# Clawdesk Runbook

本 Runbook 面向维护者、Agent 和本地操作者，定义当前 Clawdesk 的安全执行、验证与故障定位主路径。

## 1. 先选择使用面

### CLI / JavaScript

适合：

- 本机调试；
- 短脚本；
- Agent 动态生成脚本；
- 快速复现。

入口：

```bash
go run . -script examples/notify.js
go run . -script-text "console.log('hello')"
printf "console.log('stdin')\n" | go run . -script-stdin
```

### HTTP

适合：

- 外部程序调用；
- execution 状态查询；
- SSE；
- 长任务与结构化执行工件。

入口：

```bash
go run . -http -port 60844
```

详细 API：

```text
docs-user-api/http-server.md
```

### MCP

适合：

- Hermes / Claude Desktop / 其他 MCP Host；
- Agent 原子工具调用；
- inspect -> find -> act 组合链路。

构建：

```bash
go build -o dist/clawdesk-mcp ./cmd/clawdesk-mcp
```

详细说明：

```text
docs/integrations/mcp/README.md
```

## 2. 执行前检查

### 仓库与代码

确认：

```bash
go version
go test ./...
```

若任务只影响局部包，可先执行对应 targeted tests，但交付前应根据影响范围决定是否需要全量测试。

### macOS 权限

桌面自动化前确认：

- Screen Recording；
- Accessibility；
- Automation / AppleEvents；
- 目标流程要求的输入权限。

相关入口：

```text
scripts/build_macos_app.sh
scripts/open_macos_app.sh
scripts/run_permission_bootstrap.sh
scripts/reset_macos_permissions.sh
docs/implementation/macos/
```

不要假设旧 Terminal、SSH 或旧构建产物获得的权限会自动转移到当前 Clawdesk App 身份。

### OCR

需要 OCR / detect-ui 时，先确认实际 provider 可用。

Paddle 路径常见前置：

```text
PADDLE_OCR_ENDPOINT
```

缺少 provider 是 external blocker；不要通过无限重试掩盖配置问题。

## 3. 最小执行闭环

推荐所有桌面任务遵循：

```text
目标/意图
-> 当前状态
-> fresh perception
-> target candidates
-> precondition
-> 单步动作
-> postcondition
-> evidence
-> continue / retry / recovery / stop
```

避免：

- 直接执行一长串不可观测动作；
- 使用历史坐标替代当前 target evidence；
- 失败后从头重复整条链路；
- 用一次成功推导后续高风险动作一定安全。

## 4. CLI 执行与证据

Agent 低噪音：

```bash
go run . \
  -script-text "console.log('agent run')" \
  -console-mode agent
```

JSON 输出：

```bash
go run . \
  -script-text "console.log('agent run')" \
  -output-format json
```

默认 execution 产物：

```text
.runtime/runs/<executionId>/
  script_snapshot.js
  stdout.log
  stderr.log
  summary.json
  agent_summary.json
  events.ndjson
```

自定义调试输出仍优先放 `.runtime/`：

```bash
go run . -script-text "..." -log-dir .runtime/debug/<name>
```

## 5. HTTP 执行

创建：

```bash
curl -X POST http://127.0.0.1:60844/executions \
  -H 'Content-Type: application/json' \
  -d '{"script":"console.log(page.title())","stack":"legacy","timeout":30}'
```

之后使用返回的：

```text
statusUrl
summaryUrl
streamUrl
```

读取状态、摘要与事件。

如果默认 HTTP 行为与 legacy 文档不同，先确认是否设置了：

```text
USE_DI_CONTAINER=0
```

新开发默认以 container 模式为准。

## 6. MCP 主链路

推荐：

```text
tm_status / tm_permissions
-> tm_inspect_desktop
-> tm_find_target
-> tm_act_on_target(previewOnly)
-> tm_act_on_target(real, low risk)
-> verify
```

真实动作前优先使用：

- `previewOnly` / `dryRun`；
- `expectedWindowTitle`；
- `expectedTargetText`；
- fresh candidate；
- ambiguity / stale guard。

详细测试和真机流程：

```text
docs/integrations/mcp/testing/
```

## 7. 高风险动作

发送消息、提交表单、删除、支付等动作必须独立通过安全验证。

至少检查：

```text
目标身份
当前窗口/页面
目标控件
输入内容或 draft
blocking overlay
candidate freshness
动作前状态
动作后回读/状态
```

Gate 规则：

```text
docs/quality/gates-and-evidence.md
```

证据不足时：

```text
probe / preview
-> recovery / human confirmation
```

而不是执行。

## 8. Failure 分类

失败后先分类，再决定重试方式：

```text
environment / permission
perception / OCR
layout / semantic inference
targeting / ambiguity
action / focus
postcondition / verification
replay / recovery
```

正式 taxonomy：

```text
docs/quality/failure-taxonomy.md
```

同一个失败连续重复但没有新证据时应停止盲重试。

## 9. Browser compatibility

可选 stack：

```text
legacy
upgraded
playwright
```

使用 `upgraded` / `playwright` 前先读：

```text
docs-user-api/runtime.md
docs/architecture/browser-automation/capabilities.md
```

不要把 facade API 形状误认为完整 DOM/browser engine 能力。

## 10. macOS 固定 App 路径

构建：

```bash
./scripts/build_macos_app.sh
```

启动：

```bash
open dist/Clawdesk.app
```

带参数：

```bash
./scripts/open_macos_app.sh -script <script> -timeout <minutes>
```

权限异常先查：

```text
docs/implementation/macos/screenshot-troubleshooting.md
```

## 11. 文档更新规则

代码/行为改变后：

### 用户 API 变化

更新：

```text
docs-user-api/*.md
docs-user-api/index.md
runtime-api.ai.json（如对象/路由变化）
types/*.d.ts（如签名变化）
```

### 项目/工程行为变化

更新对应：

```text
architecture/
implementation/
quality/
integrations/
scenarios/
```

Research 和历史报告不能代替正式文档更新。

## 12. 收尾标准

一个工程任务至少要回答：

- 改了什么；
- 为什么；
- 哪些测试实际执行并通过；
- 哪些没有执行；
- 运行证据在哪里；
- 是否改变用户 API / architecture / quality gate；
- 是否仍有 external blocker；
- 下一步是真正 backlog 还是当前交付 blocker。

不要用“完成”“FINAL”等文件名代替证据和验收。
