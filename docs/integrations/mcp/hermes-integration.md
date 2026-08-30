# Hermes + Clawdesk MCP 集成

本文档说明如何把当前仓库构建出的 `clawdesk-mcp` 作为本地 stdio MCP server 接入 Hermes。

## 构建

在仓库根目录：

```bash
go build -o dist/clawdesk-mcp ./cmd/clawdesk-mcp
```

确认 binary：

```bash
./dist/clawdesk-mcp
```

这是 stdio server；人工直接启动后等待 stdin 属于正常行为。

## Hermes 配置

在 Hermes MCP 配置中增加：

```yaml
mcp_servers:
  clawdesk:
    command: /absolute/path/to/clawdesk/dist/clawdesk-mcp
    timeout: 120
    connect_timeout: 30
```

规则：

- `command` 必须是当前机器上的真实绝对路径；
- 不要直接复制其他机器/用户的路径；
- 修改配置后重启/重新加载 Hermes，让 Host 重新发现 server；
- 不需要为 stdio MCP server 配置 HTTP 端口。

## 最小接入验证

先确认 Host 能发现 server 和 tools，然后按：

```text
tm_status
-> tm_permissions
-> tm_list_windows
-> tm_screenshot
```

验证：

- MCP protocol 初始化正常；
- tools/list 可见 Clawdesk 工具；
- macOS 权限状态可读取；
- 窗口枚举正常；
- screenshot 能产生真实文件/结果。

## 推荐 Agent 主链路

基础能力正常后使用：

```text
tm_inspect_desktop
-> tm_find_target
-> tm_act_on_target
```

### Inspect

优先获取 fresh：

- active window；
- permissions；
- displays；
- screenshot。

### Find

根据任务选择：

```text
ocr
detect_ui
layout
hybrid
```

Host 应检查：

- `candidates[]`；
- `bestCandidate`；
- ambiguity；
- freshness；
- external blocker。

### Act

第一次动作优先：

```text
previewOnly=true
```

同时尽量提供：

```text
expectedWindowTitle
expectedTargetText
```

只有 preview 和 precondition 可信时再执行低风险真实动作。

## OCR Provider 阻塞

若 OCR / detect-ui / hybrid 返回结构化：

```text
guard=externalBlocker
blockerType=provider_missing
```

不要让 Host 自动循环重试。

恢复见：

```text
docs/integrations/mcp/operations/ocr-provider-recovery.md
```

## macOS 权限问题

如果能发现 tools，但截图/聚焦/输入失败：

1. 先调用 `tm_permissions`；
2. 检查 Screen Recording / Accessibility / Automation；
3. 确认权限绑定的是当前 Clawdesk/Host 执行身份；
4. 再进行真机 smoke。

相关项目文档：

```text
docs/implementation/macos/
```

## 低层字段边界

窗口结果可能携带平台/历史 metadata，例如：

```text
exeName
exePath
handle
isPopup
isForeground
```

这些不应成为 Hermes workflow 的稳定跨平台判断核心。

优先依赖：

```text
title
activeWindow
candidate
bounds / clickPoint
confidence / matchScore
freshness
structured guards
```

## 测试与真机验证

自动化：

```bash
go test ./pkg/mcpserver ./cmd/clawdesk-mcp
```

测试边界：

```text
docs/integrations/mcp/testing/test-matrix.md
```

macOS 真机：

```text
docs/integrations/mcp/testing/manual-smoke-macos.md
```

## 故障排查顺序

### Hermes 看不到 Clawdesk

检查：

- binary 是否存在；
- command 是否指向正确路径；
- Host 是否重新加载配置；
- server 是否能正常 initialize。

### Tools 可见，但桌面动作失败

检查：

```text
permissions
-> active window
-> screenshot
-> target evidence
-> guard
-> runtime action
```

### Target 找不到

先判断：

- 目标是否真的在 fresh screenshot 中；
- OCR provider 是否可用；
- strategy 是否适合；
- 是否存在 ambiguity / stale evidence；
- layout-only candidate 是否被误当作文本语义。

不要第一时间通过增加硬编码坐标绕过 target discovery。
