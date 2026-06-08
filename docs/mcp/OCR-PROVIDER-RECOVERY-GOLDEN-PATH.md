# TestMonkey MCP provider 恢复后的超短继续执行 runbook

仅在 `PADDLE_OCR_ENDPOINT` 已可用后执行。

## 目标
只补最后缺失的一段真机闭环：
- inspect -> find(真实文本/UI target) -> act

不要重做已完成的 layout-only substitute smoke。

## 最小执行顺序
1. `tm_inspect_desktop`
   - `captureScreenshot=true`
   - 保存新的 live screenshot path
2. `tm_find_target`
   - `strategy=detect_ui`；若界面较复杂则 `strategy=hybrid`
   - 使用真实 `target_text`
   - 期望返回 `candidates[]` + `bestCandidate`
3. `tm_act_on_target`
   - 先 `previewOnly=true`
   - 加 `expectedWindowTitle`
   - 加 `expectedTargetText`
4. 一次低风险真实动作
   - 优先 `focus`
   - 其次非破坏性 `click`
   - 最后才是 `type`

## 成功判定
必须同时成立：
- `tm_find_target` 返回真实 host-friendly 文本/UI target，不是 layout `Region 01` 之类标签
- `tm_act_on_target previewOnly` 返回 `ok=true` 且 `executed=false`
- 一次低风险真实动作返回 `ok=true` 且 `executed=true`

## 失败判定
- 若 `tm_ocr` / `tm_detect_ui` / `tm_find_target` 仍报 `PADDLE_OCR_ENDPOINT is required for paddle provider`
  - 说明 provider 实际未恢复
  - 现在更推荐以结构化 `externalBlocker` payload 判断：
    - `guard=externalBlocker`
    - `blockerType=provider_missing`
    - `provider=paddle`
    - `missingConfigKey=PADDLE_OCR_ENDPOINT`
    - `recoverable=true`
    - `retryRecommended=false`
    - `requiresHumanConfig=true`
  - 直接视觉工具的 `action` 分别应为 `ocr` / `detect_ui`
  - `tm_find_target` 的 `action` 应为 `find_target`
  - 同时读取 action-specific continuation hint：
    - `tm_ocr` -> 恢复后先用 fresh screenshot/imagePath 重跑 `tm_ocr`
    - `tm_detect_ui` -> 仅在 `tm_ocr` 恢复后继续
    - `tm_find_target` -> `tm_ocr` 恢复后回到真实 inspect -> find -> act
  - 不要继续重跑同类命令
- 若 detect_ui/hybrid 返回结构化 `externalBlocker`
  - 记录 `failedStep` / `rootCause` / `wrappedError`
  - 说明当前仍是外部阻塞，不是新的 server bug

## 回填文档
执行后同步更新：
- `docs/mcp/MANUAL-SMOKE-macOS.md`
- `docs/mcp/DELIVERY-CHECKLIST.md`
- `docs/mcp/TEST-MATRIX.md`

## 最终结论规则
- 只有在真实文本/UI target 的 inspect -> find -> act 真机闭环完成后，才能把状态从“外部阻塞前提下完成可控范围交付”提升到“接近完全完成”。
- 如果仍没有这条真机闭环，就不能宣称完全完成。
