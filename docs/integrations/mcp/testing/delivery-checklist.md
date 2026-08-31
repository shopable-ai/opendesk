# MCP Delivery Checklist

本清单定义 OpenDesk MCP 当前 `inspect -> find -> act` 阶段的交付判定。它不是版本完成报告；每次行为变化后都应重新核对。

## 主链路

- [ ] `tm_inspect_desktop` 可返回 status、permissions、active window、displays，并按需截图。
- [ ] `tm_find_target` 可按 `ocr / detect_ui / layout / hybrid` 获取并标准化候选。
- [ ] 返回 `candidates[]`、`bestCandidate`，必要时包含 ambiguity / freshness 信息。
- [ ] `tm_act_on_target` 可消费标准化 candidate 并处理 `click / type / focus`。

## 安全语义

- [ ] stale candidate 默认阻断或在有 fresh input 时先 revalidate。
- [ ] ambiguous candidate 默认阻断；只有显式 `allowAmbiguous=true` 才放行。
- [ ] `expectedWindowTitle` 不匹配时不执行动作。
- [ ] `expectedTargetText` 不匹配时不执行动作。
- [ ] `dryRun` / `previewOnly` 不执行真实动作。
- [ ] 高风险业务动作仍需场景级独立 Gate；MCP 原子工具成功不等于业务动作可安全执行。

## External blocker

依赖 OCR provider 的路径缺配置时，应做到：

- [ ] Host 能区分 external blocker 与 server bug。
- [ ] payload 保留 root cause / failed step / remediation hint。
- [ ] 不建议无意义重试。
- [ ] 恢复后要求使用 fresh screenshot / image input 做最小复核。

Paddle 常见 blocker：

```text
PADDLE_OCR_ENDPOINT
```

恢复流程见：

```text
docs/integrations/mcp/operations/ocr-provider-recovery.md
```

## Contract / Unit Test

MCP 改动至少执行：

```bash
go test ./pkg/mcpserver ./cmd/opendesk-mcp
```

应覆盖的核心类别见：

```text
docs/integrations/mcp/testing/test-matrix.md
```

不能把“历史上曾通过”当作本轮已经执行测试。

## macOS 真机

涉及真实桌面行为时至少验证：

- [ ] server / host discoverability；
- [ ] `tm_status`；
- [ ] `tm_permissions`；
- [ ] `tm_list_windows` / active window；
- [ ] `tm_screenshot`；
- [ ] `tm_inspect_desktop`；
- [ ] 真实 target 的 `tm_find_target`；
- [ ] `tm_act_on_target previewOnly`；
- [ ] 至少一个低风险真实动作（若系统/用户授权允许）。

详细步骤：

```text
docs/integrations/mcp/testing/manual-smoke-macos.md
```

## 文档

- [ ] `README.md` 只描述当前能力，不写逐轮 changelog。
- [ ] Host-specific 配置位于独立 integration guide。
- [ ] 测试规范和 manual smoke 分开。
- [ ] 一次性真机结果进入 `.runtime/runs/<run-id>/`；确认后的长期结论进入 `docs/quality/mcp/`，不追加到 runbook。
- [ ] Prompt 位于 `prompts/mcp/`，不放 integration docs。
- [ ] 已完成/失效计划进入 `.archive/`。

## 交付结论

只有当以下内容都能被实际证据支持，才可以声明当前阶段可交付：

```text
contract stable
+ automated tests actually run
+ required manual smoke actually run or explicitly externally blocked
+ current docs match source/runtime
+ remaining items are non-blocking backlog
```

若缺少 OCR provider、系统权限或人工授权，必须明确写为 external blocker；不能通过文案把“受阻”改写成“已完成”。
