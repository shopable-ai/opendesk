# MCP Manual Smoke on macOS

本手册验证 Clawdesk MCP 在真实 macOS 环境中的最小可用链路。它不保存某次运行日志；具体历史结果应进入 `artifacts/reports/mcp/`。

## 1. 构建

```bash
go build -o dist/clawdesk-mcp ./cmd/clawdesk-mcp
```

## 2. Host 接入

以 Hermes 为例，配置 command 指向当前仓库构建出的绝对 binary 路径：

```yaml
mcp_servers:
  clawdesk:
    command: /absolute/path/to/clawdesk/dist/clawdesk-mcp
    timeout: 120
    connect_timeout: 30
```

不要把某台开发机的用户名/工作目录写进仓库文档。

详细配置：

```text
docs/integrations/mcp/hermes-integration.md
```

## 3. 最小 smoke 顺序

按顺序执行：

```text
1. tm_status
2. tm_permissions
3. tm_list_windows
4. tm_screenshot
5. tm_inspect_desktop
6. tm_find_target
7. tm_act_on_target previewOnly
8. 可选：一个低风险真实动作
```

任一步出现 blocking failure 时，先分类，不要继续盲执行后续动作。

## 4. `tm_status`

期望：

- server 可调用；
- 返回正常状态结构。

失败优先归因：

- Host 未正确拉起 binary；
- stdio/protocol 初始化；
- container/runtime 初始化。

## 5. `tm_permissions`

检查真实 macOS 权限：

- Screen Recording；
- Accessibility；
- Automation / AppleEvents；
- 当前动作链需要的输入控制权限。

如果缺权限，先处理权限再继续。

## 6. `tm_list_windows`

确认：

- 能列出窗口；
- 目标 app/title 可识别；
- active window 与当前桌面状态一致。

不要把底层 `handle`、`exePath` 等历史字段当作跨平台稳定 contract。

## 7. `tm_screenshot`

建议：

```json
{
  "path": "/tmp/clawdesk-mcp-smoke.png",
  "target": "screen"
}
```

验证：

- tool 返回成功；
- 文件实际存在；
- 图片不是空白/错误屏幕；
- 截图对应当前预期环境。

失败先检查 Screen Recording 和 screenshot backend。

## 8. `tm_inspect_desktop`

示例：

```json
{
  "captureScreenshot": true,
  "path": "/tmp/clawdesk-mcp-inspect.png"
}
```

验证返回：

- status；
- permissions；
- activeWindow；
- displays；
- screenshot（若请求）。

这是 Agent 主链路的 fresh perception 起点。

## 9. `tm_find_target`

选择一个明确、可见、低风险目标。

优先使用真实文本/UI 目标：

```json
{
  "target_text": "目标文字",
  "strategy": "hybrid",
  "staleAfterMs": 5000
}
```

可按需要分别测试：

```text
ocr
detect_ui
layout
hybrid
```

验证：

- 有合理 `candidates[]`；
- `bestCandidate` 对应真实目标；
- ambiguity 信息符合实际；
- candidate 没有明显过期；
- 不把 `Region 01` 一类布局标签误称为真实文本 target。

### OCR provider blocker

若返回：

```text
guard=externalBlocker
blockerType=provider_missing
```

或根因指向 `PADDLE_OCR_ENDPOINT` 缺失，则停止依赖 OCR 的链路，按：

```text
docs/integrations/mcp/operations/ocr-provider-recovery.md
```

处理。

## 10. `tm_act_on_target previewOnly`

用刚得到的 fresh candidate：

```json
{
  "target": {"...": "bestCandidate"},
  "action": "click",
  "previewOnly": true,
  "expectedWindowTitle": "预期窗口标题",
  "expectedTargetText": "预期目标文字"
}
```

期望：

```text
ok=true
executed=false
previewOnly=true
```

同时检查计划中的 target / click point / focus 信息是否合理。

如果 candidate stale / ambiguous，应看到 guard 阻断而不是静默执行。

## 11. 低风险真实动作

只有 preview 可信且所有 precondition 成立时才继续。

优先顺序：

```text
focus
-> 非破坏性 click
-> 测试输入框 type
```

不要用首次 smoke 直接执行发送、删除、支付等高风险动作。

## 12. 失败分类

### 更像环境/权限

- permissions 明确缺失；
- screenshot 或 input 单独失败；
- 同一 binary 的纯 protocol/tool contract 正常。

### 更像 external provider

- OCR/detect-ui/hybrid 稳定指向 provider 缺失/不可达；
- layout-only 等不依赖 provider 的能力仍正常。

### 更像实现问题

- 参数和 precondition 正确，但工具结构性失败；
- preview plan 明显不符合 candidate；
- strategy 和实际 evidence 调用不一致；
- contract 与 runtime 行为冲突。

### 更像能力边界

- OCR 有文本但 detect-ui 排序不稳定；
- layout 能分区但不能识别真实语义；
- 特定自绘 UI 缺少可靠 target evidence。

## 13. Smoke 记录

每次真实 smoke 记录：

```text
date / host context
binary commit SHA
macOS version
host / MCP client
permissions
OCR provider state
steps actually executed
pass / fail / blocked
root cause
artifacts / screenshots / logs
```

长期有价值的结果存入：

```text
artifacts/reports/mcp/<date>-<topic>.md
```

运行期原始输出进入：

```text
.runtime/smoke/mcp/
```

不要把每轮结果继续追加到本手册。
