# Clawdesk MCP Quickstart

## 构建

```bash
go build -o dist/clawdesk-mcp ./cmd/clawdesk-mcp
```

## 本地运行

```bash
./dist/clawdesk-mcp
```

这是一个 stdio MCP server，适合由 Hermes / Claude Desktop 这类 host 进程拉起，而不是人工直接交互。

## Hermes 配置示例

```yaml
mcp_servers:
  clawdesk:
    command: /Users/a0000/Documents/workspace/clawdesk/dist/clawdesk-mcp
    timeout: 120
    connect_timeout: 30
```

重启 Hermes 后，理论上会发现工具。

更完整接入说明见：
- `docs/mcp/hermes-integration.md`

## 当前工具

- `tm_status`
- `tm_permissions`
- `tm_request_permissions`
- `tm_list_windows`
- `tm_get_active_window`
- `tm_focus_window`
- `tm_wait_for_window`
- `tm_focus_and_type`
- `tm_inspect_desktop`
- `tm_find_target`
- `tm_act_on_target`
- `tm_list_displays`
- `tm_screenshot`
- `tm_ocr`
- `tm_detect_ui`
- `tm_wait_for_text`
- `tm_click_text`
- `tm_capture_and_annotate`
- `tm_analyze_layout`
- `tm_annotate_regions`
- `tm_click_region`
- `tm_click`
- `tm_type`
- `tm_press_key`
- `tm_scroll`

## 当前增强点

V1 -> V1.6 当前重点不是 clone Peekaboo，而是继续把 `pkg/mcpserver` 做厚、做稳、做更 agent-friendly：

- 新增组合工具：
  - `tm_wait_for_window`
  - `tm_focus_and_type`
  - `tm_click_region`
  - `tm_inspect_desktop`
  - `tm_find_target`
  - `tm_act_on_target`
- `tm_find_target` 现在在已知 OCR provider 缺失（例如 `PADDLE_OCR_ENDPOINT is required for paddle provider`）时，会返回结构化 `externalBlocker` payload，而不是只给 host 一个 transport error
- `tm_ocr` / `tm_detect_ui` 在命中同一已知 provider 缺失时，也会返回同类结构化 `externalBlocker` payload，而不是只抛 transport error
- payload 会显式带出：
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
- 本轮再进一步把 continuation hint 收口到 action 级别：
  - `tm_ocr` 明确提示：先用 fresh screenshot/imagePath 最小复核 `tm_ocr`
  - `tm_detect_ui` 明确提示：先让 `tm_ocr` 恢复，再继续 detect_ui/find_target
  - `tm_find_target strategy=ocr|detect_ui|hybrid` 明确提示：`tm_ocr` 恢复后再回到真实 inspect -> find -> act
  - 这样 host 不仅知道“为什么停”，也知道“下一步只该做什么，不该做什么”
- `tm_find_target` 现在返回更适合 agent 消费的标准化 `candidates[]`
  - candidate 结构尽量统一为：
    - `source`
    - `text` / `label`
    - `bounds`
    - `clickPoint`
    - `confidence`
    - `regionId`
    - `role`
    - `capturedAt`
    - `staleAfterMs`
    - `matchScore`
  - `ocr.lines[]` 现在也会全量纳入统一 candidate 模型，而不是只保留 detect-ui / layout 候选
  - 返回结果现在包含：
    - `bestCandidate`
    - `ambiguous`
    - `ambiguityReason`
    - `ambiguityCandidates`
  - `strategy=ocr/detect_ui/layout/hybrid` 已有 contract tests，且会按 strategy 只拉取所需证据
  - host 可以更稳定地走 inspect -> find -> act 主链路，而不是自己拼多路 OCR / detect-ui 结果
  - 同时保留旧字段，尽量不破坏现有调用
- 增强轮询工具：
  - `tm_wait_for_text` 现在支持 timeout 内 polling、`intervalMs`、并返回 `attempts` / `elapsedMs`
- 增加最小动作安全语义：
  - `tm_click` 支持 `expectedWindowTitle`
  - `tm_click_text` 支持 `expectedTargetText`、`dryRun`、`previewOnly`
  - `tm_click_region` 支持 `expectedTargetText`、`dryRun`、`previewOnly`
  - `tm_act_on_target` 支持 `expectedWindowTitle`、`expectedTargetText`、`dryRun`、`previewOnly`
  - `tm_act_on_target` 现在还会阻断：
    - stale candidate
    - ambiguous candidate（除非显式 `allowAmbiguous=true`）
  - 对 stale candidate，若调用里仍保留 `imagePath`/`image` 与可复用 target text，会先尝试一次最小 revalidate；失败时返回结构化 `revalidationFailed`
  - 对 ambiguous candidate，阻断结果现在会附带 `reason` 与 `hostHint`
  - `previewOnly` 与 `dryRun` 现在都返回不执行的计划结果，并保留调用方要求的语义标记
  - 当前原则：前置条件不满足时返回结构化 `ok=false`，而不是直接抛 transport 错误
- 收紧 schema：
  - 补了更多 required 字段
  - 为常见字段补了 enum / description
  - 对 `target` / `candidates` 结构做了更清晰表达
  - 新增 freshness / ambiguity 相关字段，仍尽量保持向后兼容

这说明当前 Clawdesk MCP 已进入“感知聚合 + 目标发现 + 安全动作执行”的阶段。

当前工具描述与文档边界也在本轮做了最后一层平台语义收口：
- `tm_list_windows`
- `tm_get_active_window`
现在在 `tools/list` 描述中就明确声明：返回中的低层历史字段是 best-effort metadata，而不是稳定跨平台 contract。

这意味着 host 不需要等翻文档才知道这一点；即使只读取 MCP tool surface，也能获得正确的契约边界。

详见：
- `docs/mcp/DELIVERY-CHECKLIST.md`
- `docs/mcp/TEST-MATRIX.md`
- `docs/mcp/MANUAL-SMOKE-macOS.md`

## 当前交付判定文档

本阶段新增了三个交付文档，用于把“已完成到什么程度”写清楚：

- `docs/mcp/DELIVERY-CHECKLIST.md`
- `docs/mcp/TEST-MATRIX.md`
- `docs/mcp/MANUAL-SMOKE-macOS.md`

建议把它们与本 README 一起看：
- README：快速入口
- DELIVERY-CHECKLIST：完成判定
- TEST-MATRIX：自动化覆盖边界
- MANUAL-SMOKE-macOS：真机验证边界

## 最小 smoke 建议

推荐先调用：
1. `tm_status`
2. `tm_permissions`
3. `tm_list_windows`
4. `tm_screenshot`

然后进入一条更 agent-friendly 的推荐主链路：
5. `tm_inspect_desktop`
6. `tm_find_target`
7. `tm_act_on_target`

在需要兼容旧 host 或细粒度动作控制时，再按需补：
8. `tm_click_text` / `tm_click_region` / `tm_click`

这样可以最快验证：
- server 已被 host 发现
- 权限链路正常
- 窗口枚举可用
- 截图链路可用
- 桌面聚合感知和目标发现链路可用

## 设计定位

- 原子 desktop/runtime 工具优先
- 逐步补高价值组合工具
- 复用现有 `automation` / `vision` 能力
- 暂不把完整 execution manager 直接暴露为 MCP 主接口
- 借鉴 Peekaboo 的产品层思路，但不引入其大量主实现源码

详见：
- `docs/mcp/testmonkey-mcp-plan.md`
- `docs/mcp/hermes-integration.md`
