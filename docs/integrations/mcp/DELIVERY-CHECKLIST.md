# Clawdesk MCP Delivery Checklist

本文档定义当前阶段“host-friendly target discovery + safe action loop”何时可判定为接近最终可交付。

## 1. 当前交付目标

当前阶段的交付对象不是“所有桌面自动化能力都完备”，而是以下主链路已经闭环：

1. `tm_inspect_desktop`
2. `tm_find_target`
3. `tm_act_on_target`

目标是让 MCP host 能稳定走：

inspect -> find -> act

并且在执行前默认具备最小安全保护，而不是要求 host 自己拼一堆低层调用与 guard。

## 2. 完成判定标准

只有当以下项目成立，才视为当前阶段完成：

### A. 主链路闭环
- `tm_inspect_desktop` 能返回：
  - status
  - permissions
  - activeWindow
  - displays
  - optional screenshot
- `tm_find_target` 能返回：
  - 证据层结果（按 strategy）
  - 标准化 `candidates[]`
  - `bestCandidate`
  - ambiguity signaling
  - freshness metadata（当请求 `staleAfterMs` 时）
- `tm_act_on_target` 能接收标准化 candidate 并执行：
  - `click`
  - `type`
  - `focus`

### B. 默认安全语义成立
- stale candidate 默认阻断，返回结构化 `ok=false`
- stale candidate 在具备可复用 target_text + screenshot/image 输入时，会先做一次最小 refresh/revalidate；只有重验证仍失败时才返回 `ok=false`
- ambiguous candidate 默认阻断，返回结构化 `ok=false`
- ambiguous candidate 的阻断结果应包含 `reason` 与 `hostHint`
- `allowAmbiguous=true` 时允许显式放行
- `expectedWindowTitle` 不匹配时阻断
- `expectedTargetText` 不匹配时阻断
- `dryRun` / `previewOnly` 都不执行真实动作

### C. target discovery contract 稳定
- `tm_find_target strategy=ocr` 只走 OCR 证据
- `tm_find_target strategy=detect_ui` 只走 detect-ui 证据
- `tm_find_target strategy=layout` 只走 layout 证据
- `tm_find_target strategy=hybrid` 聚合 OCR + detect-ui + layout
- OCR line candidates 进入统一 candidate 模型
- ranked candidates 顺序可判定
- ambiguity hint 对相近高分候选成立

### D. 自动化验证成立
- `go test ./pkg/mcpserver ./cmd/clawdesk-mcp` 稳定通过
- 核心 host-facing contract 已有自动化测试覆盖
- schema 中 freshness / ambiguity / candidate metadata 字段有断言

### E. 文档闭环成立
- 自动化测试覆盖范围已写明
- 仅能人工 smoke 的部分已写明
- macOS 当前限制已写明
- 后续增强项已与当前阻塞项区分

## 3. 当前已满足项

截至本轮：
- 主链路 inspect -> find -> act 已有 contract smoke test
- `tm_find_target` 已支持 strategy 分流、ranked candidates、bestCandidate、ambiguity signaling、OCR line candidate 统一建模
- `tm_act_on_target` 已支持 stale / ambiguous / expectedWindowTitle / expectedTargetText / dryRun / previewOnly / allowAmbiguous
- schema 已断言 freshness / ambiguity / candidate metadata
- `go test ./pkg/mcpserver ./cmd/clawdesk-mcp` 当前通过
- macOS manual smoke/runbook 已单列文档

## 4. contract tests 已覆盖什么

见：`docs/mcp/TEST-MATRIX.md`

简述：
- `tools/list` 注册与 schema
- `tools/call` 核心组合工具行为
- `tm_find_target` 排序/歧义/strategy/freshness contract
- `tm_find_target` 在命中该已知 provider 缺失时，会返回结构化 `externalBlocker` payload（包含 `action=find_target`、`failedStep` / `rootCause` / `wrappedError` / `remediationHint` / `hostHint`，以及 `blockerType=provider_missing` / `provider=paddle` / `missingConfigKey=PADDLE_OCR_ENDPOINT` / `recoverable=true` / `retryRecommended=false` / `requiresHumanConfig=true`），而不是只抛 transport error
- `tm_ocr` / `tm_detect_ui` 在命中同一已知 provider 缺失时，也返回同类结构化 `externalBlocker` payload（`action=ocr|detect_ui`，并保留 `wrappedError`、`provider=paddle`、`missingConfigKey=PADDLE_OCR_ENDPOINT`）；本轮进一步收紧 operator-facing hint：
  - `tm_ocr` 的 `remediationHint` 明确要求先用 fresh screenshot/imagePath 复核 `tm_ocr`
  - `tm_detect_ui` 的 `remediationHint` 明确要求先让 `tm_ocr` 恢复，再继续 detect_ui/find_target
  - `tm_find_target strategy=ocr|detect_ui|hybrid` 的 `hostHint` 明确要求恢复 `tm_ocr` 后再回到真实 inspect -> find -> act，而不是继续拿 layout label 充当真实 target
- 这样 host 在 OCR 仍阻塞时，不仅能停机，还能知道下一步只该做什么、不该做什么

- inspect -> find -> act 推荐链路 smoke contract
- stdio initialize/list/call smoke
- window/list tool 描述明确把 `exeName` / `exePath` / `handle` / `isPopup` / `isForeground` 这类历史字段降级为 best-effort metadata，而非稳定跨平台 contract

## 5. runtime/unit tests 已覆盖什么

当前 runtime 单元测试较薄，但本轮已补到：
- `normalizeVisionArgs`
- `splitKeyChord`
- `ack` 结构稳定性
- `activeWindowMap` / `GetActiveWindow()` nil-safe 字段映射
- `Type()` / `PressKey()` / `Scroll()` 的 adapter 语义与 runtime action wrapping helper coverage

这意味着：
- server orchestration contract 覆盖强
- 真实 macOS runtime 适配层仍主要依赖人工 smoke 验证

## 6. 只能人工 smoke 验证什么

见：`docs/mcp/MANUAL-SMOKE-macOS.md`

当前只能通过真机验证的关键项：
- macOS 屏幕录制 / 辅助功能 / 自动化权限的真实状态
- 前台焦点切换是否被系统拦截
- 窗口枚举是否符合当前桌面环境
- 真实截图是否成功、是否受系统权限/后端限制影响
- 坐标点击/输入在真实 app 中是否生效

## 7. 当前已知限制

### 7.1 runtime 仍带有底层窗口管理器历史字段
`tm_get_active_window` / `tm_list_windows` 的 runtime 输出中仍可能出现：
- `exeName`
- `exePath`
- `handle`
- `isPopup`
- `isForeground`

这些字段是底层窗口管理器元数据，不应被 host 当作跨平台稳定 contract。

### 7.2 screenshot 后端存在 macOS 平台现实限制
当前依赖的截图实现链路在 macOS 上可工作，但编译时会出现上游截图库的 deprecation warning：
- CoreGraphics 截图 API 已被 Apple 标记 deprecated
- 后续建议迁移到 ScreenCaptureKit

这属于后续增强，不阻塞当前 MCP contract 交付。

### 7.3 真机可用性仍受系统权限与焦点控制影响
MCP 层只能暴露能力，不能绕过：
- 屏幕录制
- 辅助功能
- 自动化/输入控制
- 前台焦点限制

因此当前的“高可用”定义是：
- contract 稳
- host-friendly 主链路稳
- 手工 smoke 可判定问题边界

而不是“在任何 macOS 环境无条件零配置成功”。

### 7.4 OCR provider 仍可能是外部前置条件
`tm_ocr` / `tm_find_target strategy=ocr|hybrid` 的真机可用性，不仅取决于 screenshot 和权限，还取决于本机是否已完成 OCR provider 配置。

在最近一次 macOS smoke 中：
- `tm_ocr` 调用返回：根因仍是 `PADDLE_OCR_ENDPOINT is required for paddle provider`；在当前 adapter error wrapping 下，host 侧可能看到 `ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider`
- `tm_detect_ui` 与 `tm_find_target strategy=detect_ui` 的真机调用也会因为同一 provider 缺失失败；在聚合链路中，当前更常见的 host-facing 报错是 `ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider`

这说明：
- 当前仓库的 MCP contract 和基础 screenshot/inspect 主链路可以成立
- 但 OCR/detect_ui/hybrid 真机闭环在未配置 OCR provider 的环境里，仍应判定为“外部配置阻塞”，不能假装已经完成真机验证

## 8. 不阻塞当前交付的后续增强
- ScreenCaptureKit 截图后端替换/补充
- richer ambiguity explanation
- 更强的 target ranking features（窗口区域、历史上下文）
- 更厚的 runtime adapter 单元测试
- 更多 host-specific smoke 示例

补充说明：
- 本轮已落最小 `refresh/revalidate before action`：仅在 stale candidate 且调用参数里仍保留 `imagePath`/`image` 与可复用 target text 时自动重跑一次 `tm_find_target` 逻辑。
- 这不是完全自动恢复系统；它不能绕过 OCR provider 缺失，也不能替代 host 重新做一轮新的 live inspect。
