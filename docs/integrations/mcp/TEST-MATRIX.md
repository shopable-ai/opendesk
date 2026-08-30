# TestMonkey MCP Test Matrix

## 1. 说明

本矩阵区分：
- contract tests：server/host-facing 行为契约
- runtime/unit tests：适配层与纯函数
- manual smoke：只能在 macOS 真机上确认的事项

测试命令：

```bash
go test ./pkg/mcpserver ./cmd/testmonkey-mcp
```

## 2. Contract tests

### 2.1 MCP protocol / registry / schema
- initialize 返回 serverInfo + capabilities
- `tools/list` 包含核心工具：
  - `tm_inspect_desktop`
  - `tm_find_target`
  - `tm_act_on_target`
  - 以及辅助工具
- schema 断言：
  - `tm_find_target.strategy` enum
  - `tm_find_target.staleAfterMs`
  - `tm_act_on_target.target/action` required
  - `tm_act_on_target.allowAmbiguous`
  - target schema 含 `clickPoint` / `capturedAt` / `ambiguous`
  - click_text / click_region 的 dryRun/preview/guard 字段
- window-related tool descriptions 明确声明低层字段是 best-effort metadata，不是稳定跨平台 contract

### 2.2 tm_inspect_desktop
已覆盖：
- 聚合 status / permissions / activeWindow / displays
- `captureScreenshot=true` 时转发 screenshot 参数

未自动覆盖：
- 真机截图内容正确性
- 真机权限拒绝/授权后的系统行为

### 2.3 tm_find_target
已覆盖：
- 返回 OCR + detect-ui + layout evidence
- 返回标准化 `candidates[]`
- ranked candidates 排序
- `bestCandidate`
- ambiguity signaling：
  - `ambiguous`
  - `ambiguityReason`
  - `ambiguityCandidates`
- OCR line candidates 纳入统一 candidate 模型
- strategy contract：
  - `strategy=ocr` 仅走 OCR
  - `strategy=detect_ui` 仅走 detect-ui
  - `strategy=layout` 仅走 layout
  - `strategy=hybrid` 聚合多源
- freshness metadata：
  - `capturedAt`
  - `staleAfterMs`
  - `matchScore`
- layout regions 即使以 typed slice 形式返回，也能纳入统一 candidate 模型

未自动覆盖：
- 真实 OCR/detect/layout 模型质量
- 真机不同屏幕/缩放/中文界面的候选稳定性
- 未配置 OCR provider 时，`strategy=ocr|detect_ui|hybrid` 的外部阻塞分支仍主要依赖人工 smoke 识别
- live host-facing 历史上可能表现为 transport error，例如 `ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider`
- 当前 server contract 已补强：当 `tm_find_target` 命中该已知 provider 缺失时，会返回结构化 `externalBlocker` payload，包含：
  - `action=find_target`
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
- 当前 server contract 也补强了直接视觉工具：
  - `tm_ocr` 在命中相同 provider 缺失时，返回 `action=ocr` 的结构化 `externalBlocker`
  - `tm_detect_ui` 在命中相同 provider 缺失时，返回 `action=detect_ui` 的结构化 `externalBlocker`
  - 这意味着最小 live recheck 可以直接调用 `tm_ocr` / `tm_detect_ui` 而不是依赖 transport error 文案做判断
  - 本轮新增回归保护还断言 action-specific continuation hint：
    - `tm_ocr` 必须提示“先用 fresh screenshot/imagePath 复核 tm_ocr”
    - `tm_detect_ui` 必须提示“先让 tm_ocr 恢复，再继续 detect_ui/find_target”
    - `tm_find_target strategy=ocr|detect_ui|hybrid` 必须提示“tm_ocr 恢复后再回到真实 inspect -> find -> act”，而不是把 layout substitute 误当完成

### 2.4 tm_act_on_target
已覆盖：
- staleTarget guard
- stale target -> refresh/revalidate before action；若重找成功则继续返回新 plan，若重找失败则返回结构化 `revalidationFailed`
- ambiguousTarget guard
- ambiguousTarget payload 现在包含 `reason` 与 `hostHint`
- `allowAmbiguous=true` 放行
- `expectedWindowTitle`
- `expectedTargetText`
- `dryRun`
- `previewOnly`
- click/type/focus 三种 action contract

未自动覆盖：
- 真机点击/输入对真实 app 的实际效果
- 焦点切换被系统或 app 拦截时的真实交互结果

### 2.5 旧辅助链路相关
已覆盖：
- `tm_click.expectedWindowTitle`
- `tm_click_text` detect+click chaining
- `tm_click_text` dryRun / expectedTargetText
- `tm_click_region` previewOnly / expectedTargetText
- `tm_capture_and_annotate` screenshot -> analyze -> annotate chaining
- `tm_wait_for_text` polling
- stdio `initialize -> tools/list -> tools/call` smoke

## 3. Runtime / unit tests

当前已覆盖：
- `normalizeVisionArgs`：imageBytes base64 归一化
- `splitKeyChord`：支持 `,` 与 `+`
- `ack`：稳定结构
- `buildRevalidationArgs`：从旧 candidate + 调用参数构造最小重验证输入，并在 layout stale 时升级到 `hybrid`
- `wrapRuntimeError`：统一错误包装前缀并保留原始 cause
- ambiguity guard helper：返回 `reason` / `hostHint`
- `activeWindowMap` / `AutomationRuntime.GetActiveWindow()`：前台窗口字段映射与 nil-safe 零值输出
- `AutomationRuntime.Type()`：输入文本与 `pressEnter`/`press_return` 触发 Enter 的包装语义
- `AutomationRuntime.PressKey()`：普通键与 chord/combo 的错误包装语义
- `AutomationRuntime.Scroll()`：delta/steps 参数透传与 runtime action wrapping

当前缺口：
- runtime 对真实 automation backend 的错误包装专门单测（当前已把 action 前缀下沉到 adapter 层，但仍主要是 helper/契约级验证）

说明：
- 当前测试重心刻意偏向 host-facing contract
- runtime 真机能力主要通过 manual smoke 兜底

## 4. Manual smoke matrix (macOS)

见：`docs/mcp/MANUAL-SMOKE-macOS.md`

### 4.1 必测
- build binary
- Hermes 接入
- `tm_status`
- `tm_permissions`
- `tm_list_windows`
- `tm_screenshot`
- inspect -> find -> act 最小链路

### 4.2 建议补测
- `tm_focus_window`
- `tm_focus_and_type`
- `tm_click_text`
- `tm_click_region`
- 不同目标 app（Finder / Notes / 浏览器 / 聊天应用）

## 5. 当前测试结论

结论：
- MCP server contract 已具备较强自动化回归保护
- runtime/macOS 集成真实性仍需 manual smoke 补齐
- 当前测试闭环足以支撑“接近可交付”的 host-facing 阶段判断
- 但尚不足以宣称“所有真机动作在 macOS 上 fully deterministic”
