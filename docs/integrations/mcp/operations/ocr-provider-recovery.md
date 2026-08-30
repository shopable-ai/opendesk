# MCP OCR Provider Recovery

用于 Clawdesk MCP 的 OCR / detect-ui / OCR-dependent target discovery 因 provider 配置缺失或不可达而被阻塞时恢复。

## 识别 external blocker

常见 Paddle 前置条件：

```text
PADDLE_OCR_ENDPOINT
```

当 MCP 返回结构化 blocker 时，优先读取：

```text
guard
blockerType
provider
missingConfigKey
failedStep
rootCause
wrappedError
remediationHint
hostHint
recoverable
retryRecommended
requiresHumanConfig
```

典型语义：

```text
guard=externalBlocker
blockerType=provider_missing
provider=paddle
missingConfigKey=PADDLE_OCR_ENDPOINT
recoverable=true
retryRecommended=false
requiresHumanConfig=true
```

## 不要做什么

Provider 未恢复时不要：

- 连续重跑 `tm_ocr`；
- 连续重跑 `tm_detect_ui`；
- 用 `hybrid` 包装同一个缺失 provider 后继续重试；
- 把 layout region label 当作真实 OCR/UI target；
- 把 external blocker 记录成 server implementation bug。

## 恢复步骤

### 1. 修复 provider

按实际环境配置/启动 OCR provider，并确认 endpoint 可访问。

具体 provider 安装和服务方式以当前 `docs/implementation/ocr/provider-integration.md` 与本地部署方案为准。

### 2. 获取 fresh screenshot

Provider 恢复后，不要继续使用很久以前的 candidate。

重新：

```text
tm_screenshot
```

或：

```text
tm_inspect_desktop(captureScreenshot=true)
```

### 3. 最小验证 `tm_ocr`

先只验证 OCR：

```text
fresh screenshot
-> tm_ocr
```

只有 OCR 本身恢复后才继续 detect-ui / find-target。

### 4. 验证 `tm_detect_ui`

用 fresh image 和明确 target text 验证 UI 检测。

### 5. 恢复主链路

```text
tm_inspect_desktop
-> tm_find_target(strategy=detect_ui 或 hybrid)
-> 检查真实 bestCandidate
-> tm_act_on_target(previewOnly)
-> 低风险真实动作
```

## 成功判定

必须确认：

- `tm_ocr` 不再返回 provider blocker；
- `tm_find_target` 返回的 candidate 对应真实文本/UI 目标；
- 不是仅依赖 layout `Region xx` 标签；
- preview plan 与目标一致；
- candidate freshness 仍有效；
- 低风险真实动作可验证 postcondition。

## 仍然失败时

### Provider 仍缺失/不可达

继续归为 external blocker，并停止重复调用。

### OCR 正常，detect-ui/find-target 失败

此时再转为算法/实现问题排查：

- target text 是否真实可见；
- OCR normalized text 是否正确；
- strategy 是否调用了预期 evidence；
- candidate ranking 是否合理；
- screenshot / DPI / theme 是否导致差异。

### Candidate 有，但动作被 guard 阻断

检查：

- stale；
- ambiguous；
- expectedWindowTitle；
- expectedTargetText；
- active window 是否已变化。

不要通过关闭 guard 来掩盖 target identity 问题。

## 证据记录

恢复过程原始输出：

```text
.runtime/smoke/mcp/
```

若形成可复用验证结论：

```text
artifacts/reports/mcp/
```

更新当前行为说明时再修改 integration / testing docs，不把一次性恢复日志写回本 Runbook。
