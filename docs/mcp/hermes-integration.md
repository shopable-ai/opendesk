# Hermes + Clawdesk MCP 集成

本文档说明如何把当前仓库中的 `clawdesk-mcp` 作为本地 stdio MCP server 接入 Hermes，并完成最小 smoke 验证。

## 1. 构建

在仓库根目录执行：

```bash
go build -o dist/clawdesk-mcp ./cmd/clawdesk-mcp
```

产物路径：

```bash
/Users/a0000/Documents/workspace/clawdesk/dist/clawdesk-mcp
```

## 2. Hermes 配置示例

在 `~/.hermes/config.yaml` 中增加：

```yaml
mcp_servers:
  clawdesk:
    command: /Users/a0000/Documents/workspace/clawdesk/dist/clawdesk-mcp
    timeout: 120
    connect_timeout: 30
```

说明：
- `command` 指向上一步 build 出来的 binary
- 这是 stdio MCP server，不需要额外端口
- 修改配置后需要重启 Hermes 会话/进程，让它重新发现工具

## 3. 最小 smoke 流程

推荐先走这条最短路径：

1. `tm_status`
2. `tm_permissions`
3. `tm_list_windows`
4. `tm_screenshot`

目的：
- 先确认 server 已成功被 host 发现
- 再确认 macOS 权限和窗口枚举正常
- 最后验证 screenshot 基础链路可用

## 4. 推荐的第一批调用

### 4.1 检查运行状态

调用：
- `tm_status`

预期：
- 返回 `status: ok`
- 如果视觉 runtime 可用，通常还会看到 `vision: enabled`

### 4.2 检查权限

调用：
- `tm_permissions`

预期：
- 返回截图/自动化相关权限状态

如果权限不足：
- 先处理系统权限
- 再重试 `tm_permissions`
- 必要时调用 `tm_request_permissions`

### 4.3 列出窗口

调用：
- `tm_list_windows`

预期：
- 返回窗口数组和 `count`
- 可以先确认目标应用标题是否能被当前 runtime 枚举到

### 4.4 先做一次截图

调用参数示例：

```json
{
  "path": "/tmp/clawdesk-smoke.png",
  "target": "screen"
}
```

调用：
- `tm_screenshot`

预期：
- 返回生成文件路径
- 后续可把该路径继续传给 `tm_ocr` / `tm_analyze_layout` / `tm_click_region`

## 5. 最小 agent-friendly 组合建议

在 host 中，建议按“感知 -> 判断 -> 执行”顺序使用：

1. `tm_inspect_desktop`
2. `tm_find_target`
3. `tm_act_on_target`
4. 只有在需要兼容旧调用或做更细粒度控制时，再补：
   - `tm_wait_for_window`
   - `tm_focus_window`
   - `tm_focus_and_type`
   - `tm_click_text`
   - `tm_click_region`
   - `tm_click`

补充说明：
- `tm_inspect_desktop` 会聚合：
  - status
  - permissions
  - active window
  - displays
  - optional screenshot
- `tm_find_target` 会聚合：
  - OCR
  - detect-ui
  - optional layout
  - 并返回标准化 `candidates[]`
  - `ocr.lines[]` 也会并入统一 candidate 模型
  - 同时返回：
    - `bestCandidate`
    - `ambiguous`
    - `ambiguityReason`
    - `ambiguityCandidates`
  - `strategy=ocr/detect_ui/layout/hybrid` 已有 contract coverage
  - 当 detect-ui / OCR 因已知 provider 缺失失败时，`tm_find_target` 现在会返回结构化 `externalBlocker` payload，而不是只抛 transport error
  - `tm_ocr` / `tm_detect_ui` 直接调用命中同一 provider 缺失时，也会返回结构化 `externalBlocker` payload，便于 host 做最小 live recheck 与 handoff
  - 该 payload 会带：
    - `action=find_target|ocr|detect_ui`
    - `failedStep`
    - `rootCause`
    - `wrappedError`
    - `remediationHint`
    - `hostHint`
    - `blockerType=provider_missing`
    - `provider=paddle`
    - `missingConfigKey=PADDLE_OCR_ENDPOINT`
    - `recoverable=true`
    - `retryRecommended=false`
    - `requiresHumanConfig=true`
  - continuation hint 现在按 action 收口：
    - `tm_ocr` 要求先用 fresh screenshot/imagePath 做最小恢复复核
    - `tm_detect_ui` 要求先确认 `tm_ocr` 已恢复，再继续 detect-ui/find-target
    - `tm_find_target strategy=ocr|detect_ui|hybrid` 要求 `tm_ocr` 恢复后回到真实 inspect -> find -> act
- `tm_act_on_target` 会：
  - 接收标准化 candidate
  - 统一执行 `click` / `type` / `focus`
  - 支持 `dryRun` / `previewOnly`
  - 支持 `expectedWindowTitle` / `expectedTargetText`
  - 默认阻断 stale / ambiguous candidate，除非 host 明确放行
  - stale candidate 在仍具备 `imagePath`/`image` 与 target text 时，会先自动做一次最小 revalidate
  - 若 ambiguous/stale 最终仍不能执行，会返回结构化 guard 结果，附带 `reason` / `hostHint` / `revalidation`（如适用）

这条链路对应的正是当前 Clawdesk MCP 所处阶段：
- 感知聚合
- 目标发现
- 安全动作执行
- 最小 host-friendly 闭环

这比单独串很多原子 tool 更适合 host 侧 agent 做决策。

补充阅读：
- 完成判定：`docs/mcp/DELIVERY-CHECKLIST.md`
- 测试边界：`docs/mcp/TEST-MATRIX.md`
- 真机 smoke：`docs/mcp/MANUAL-SMOKE-macOS.md`

## 6. 当前推荐的 V1.5 / V1.6 工具切入点

在已有 V1 基础上，本轮新增/增强重点：
- `tm_wait_for_window`
- `tm_focus_and_type`
- `tm_click_region`
- `tm_wait_for_text` polling 版本
- `tm_inspect_desktop`
- `tm_find_target`
- `tm_act_on_target`

这批工具的价值：
- 比纯原子 click/type 更 agent-friendly
- 继续复用本仓库已有 automation / vision / window 能力
- 不需要引入 Peekaboo 大量源码
- 让 host 可以走统一的“inspect -> find -> act”主链路

## 7. 最小动作安全语义

当前已加入并扩展了一批最小安全语义：
- `tm_click.expectedWindowTitle`
- `tm_click_text.expectedTargetText`
- `tm_click_text.dryRun` / `previewOnly`
- `tm_click_region.expectedTargetText`
- `tm_click_region.dryRun` / `previewOnly`
- `tm_act_on_target.expectedWindowTitle`
- `tm_act_on_target.expectedTargetText`
- `tm_act_on_target.dryRun` / `previewOnly`

行为原则：
- 如果传入 guard / preview 参数
- server 先做低成本前置校验或计划生成
- 前置条件不匹配时返回结构化 `ok=false`
- 不执行真实动作
- 只有参数非法或内部异常时才返回 transport 级错误

这让 host 可以先做低成本防误触保护，并把“先看计划再执行”的策略下沉到 tool 层。

## 8. 故障排查

如果 Hermes 看不到工具：
- 确认 binary 已成功 build
- 确认 `command` 路径正确
- 确认修改配置后已重启 Hermes

如果能看到工具但截图/点击失败：
- 先看 `tm_permissions`
- 再检查 macOS 的屏幕录制、辅助功能、自动化等权限

如果窗口找不到：
- 先调用 `tm_list_windows`
- 确认标题是否与预期一致
- 再决定 `matchMode` 用 `exact` 还是 `contains`
