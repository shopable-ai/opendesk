# Desktop Measurement P0–P4 实现架构

> 本文补充 [`desktop-measurement.md`](./desktop-measurement.md) 的产品/交互设计，记录生产实现、证据、Authoring 与 Repair 合同。它不替代 Prototype，也不把浏览器样机 PASS 当作 Native PASS。

## 1. 单一能力链

Desktop Measurement 只保留一套核心模型：

```text
真实桌面
  ↓
Measurement Session
  ↓
Frozen Capture + Reference + CaptureMapping
  ↓
pkg/measurement Result
  ↓
Structured Measurement Data / MeasurementEvidence
  ↓
Recorder / Human-to-Recipe / Agent-to-Recipe / Qualification / Repair
```

禁止新增 `MacGeometry`、`WindowsGeometry`、`AgentGeometry`、`RepairGeometry` 等平行模型。屏幕逻辑坐标、Capture Pixel、Reference-relative 与比例换算均继续由 `CaptureMapping` 和 `Result` 表达。

## 2. P0 — Native Core

生产会话由 `pkg/measurement/session.go` 持有。一个 Session 只创建一次 Measurement native surface。之后的工具切换、结果变化、候选、HUD、Micro、Inspector、复制菜单与 Region 编辑都通过 `customui.ControlPatch` 更新固定控件。

刷新不是替换窗口：

```text
same surface
→ Hide
→ capture clean desktop
→ SetBounds when display geometry changed
→ patch measurementPreview.Source
→ patch measurementOverlay.Source
→ Show
```

重复入口复用现有 Session，不重新 capture，不创建第二个 native surface。

产品层级：

```text
Frozen Desktop
+ measurementOverlay
+ measurementMicro
+ measurementHUD
+ independent measurementInspector
+ measurementCopyMenu
+ bottom measurementToolbar
```

底部 Toolbar 固定为：

```text
点 / 区域 / 两点 / 两区域 | 参照 / 复制 ▾ / 详情 / 退出
```

四种模式都复用 `BuildPointResult`、`BuildRegionResult`、`BuildTwoPointResult`、`BuildSpacingResult`。Point 的颜色只允许来自 Frozen Capture Pixel。

Region 编辑支持 body、N、NE、E、SE、S、SW、W、NW。body 只移动 X/Y 并保持尺寸；handle 只移动所属 edge。Arrow 为 1 logical unit，Shift+Arrow 为 10 logical units。编辑会裁限在当前 capture display 的逻辑范围内，最小尺寸为 1 logical unit。

Esc 层级固定为：

```text
Copy Menu
→ Inspector
→ Region Local Edit
→ Reference Edit
→ Session Exit
```

`I` 切换 Inspector；`R` 进入/取消 Reference Edit；Tab/Shift+Tab 只循环真实 capture candidates；Alt/Option down 暂停 snap，keyup 恢复。当前没有真实候选时不会构造伪候选。

三档产品输出：

1. 简明数值
2. 完整中文说明
3. 结构化数据

结构化数据使用 `desktop-measurement/v1` envelope，至少包含 `schemaVersion`、`measurementKind`、`reference`、`coordinateSpace`、`unit`、`captureMapping`、canonical `result` 与 `evidence`。旧的 raw Result JSON 仍可反序列化。

## 3. P1 — UX / Robustness

`pkg/measurement/interaction.go` 提供 deterministic 几何与摆放 helper：

- HUD 在 top-left / top-right / bottom-left / bottom-right 中选择与 Reference、Result 重叠面积最小的位置。
- Micro 根据目标与 display edge 选择翻转方向，并且自身使用 `pointer-events:none`，不会成为 Target/Candidate/Reference。
- reverse drag 使用 `RectFromPoints` 规范化。
- body / handle 编辑统一 clamp 到当前 CaptureMapping display。
- pointermove 队列允许 coalesce；Region drag 的 surface render 设 16ms 保护，pointerup 总会做最终 render。
- refresh capture / SetBounds / patch 失败时保留已有 Session，并在 refresh 事务中恢复旧 frame、bounds、result、reference 和 UI 状态。
- cleanup 使用 `sync.Once`，重复 Close/Exit 不重复释放资源。

HUD 和 Micro 只显示必要信息。PID、Window Handle、完整 JSON 不进入常驻 HUD；完整结果只在 Inspector 中按需显示。

## 4. P2 — Cross-platform Foundation

`CaptureMapping` 的合同是：

```text
Screen Logical
↔ Capture Pixel
+ Reference-relative logical
+ ratio 0..1
```

一个 Session 的 Frozen Capture 明确属于一个 display。其他 display 的坐标不能静默当作当前 capture-local 坐标。当前版本不声明一个 Session 同时拥有两个不同 CaptureMapping；跨 display 时必须 refresh / reacquire 新 capture。

自动测试覆盖：

- scale 1.0 / 1.25 / 1.5 / 2.0
- negative X/Y origins
- left / upper display
- desktop hole / outside capture
- display A/B coordinate separation

Native host keyboard bridge合同一致支持：

```text
1 / 2 / 3 / 4
Tab / Shift+Tab
Alt/Option down + up
Arrow / Shift+Arrow
R / I
Esc
Cmd/Ctrl+C
Cmd/Ctrl+Shift+C
Cmd/Ctrl+Alt/Option+C
```

Windows 在 `pkg/customui/winhost/bridge.js` 转发 phase；macOS 在 `pkg/customui/machost/measurement_keys_darwin.m` 从原生 `NSPanel.sendEvent` 补齐缺失的 Measurement commands。Pointer、show/hide、source patch、bounds、close 和 clipboard 继续复用 CustomUI/native host 现有能力。

真实 macOS/Windows、Retina、100/125/150/200%、mixed DPI 与 physical multi-display 资格状态记录在 `tests/desktop-measurement/qualification-manifest.json`。没有实际运行的行必须保持 `NOT_RUN`。

## 5. P3 — Measurement Evidence / Automation Authoring

`pkg/measurement/evidence.go` 定义 `MeasurementEvidence`。它复用 canonical `Result`、`Reference` 与 `CaptureMapping`，并增加：

- frozen snapshot SHA-256 和 image size
- 真实 candidate 列表
- confidence
- provenance

Provenance 的正式来源包括：

```text
manual
recorder
accessibility
uia
window
capture
measurement
agent
```

当前 BuildEvidence 能确定的来源才会写入；没有真实 bounds/confidence 的 candidate 不补假字段。Point color provenance 固定为 `capture`。

Artifact 继续使用现有任务包：

```text
.runtime/automation-authoring/<task-id>/measurement/
  evidence.json
  snapshot.png
  handoff-recorder.json
  handoff-human-to-recipe.json
  handoff-agent-to-recipe.json
  handoff-qualification.json
  handoff-repair.json
  repair-history.jsonl
```

Recorder 通过 `pkg/recorder/measurement_evidence.go` 将 evidence ref 附加到现有 `LocatorCandidate`。已有 Accessibility/UIA/OCR semantic locator 不被 Measurement 替换；Measurement 只补 window identity、reference-relative geometry、visual/layout verification evidence。

`pkg/measurement/authoring.go` 为 Recorder、Human-to-Recipe、Agent-to-Recipe、Qualification 和 Repair 提供同一 handoff。若 semantic evidence 已存在，第一策略固定为 `semantic-first`；随后才是 `constrained-region`、`visual-verification`、`layout-verification` 或 `distance-verification`。

`pkg/measurement/qualification.go` 可以消费 Evidence 检查：

- Reference identity 是否仍一致
- Reference / Target geometry drift 是否仍在允许范围
- Frozen Pixel color 是否仍 plausible

这些检查是 qualification evidence，不是 brittle pixel-only locator。

## 6. P4 — Measurement-assisted Repair

`pkg/measurement/repair.go` 实现最小可扩展 Repair Loop：

```text
AutomationFailure
→ MeasurementEligibleFailure
→ RepairRequest
→ new Measurement evidence
→ RepairCandidate
→ existing execution retry adapter
→ business verification adapter
→ qualified / rejected
→ repair-history.jsonl
```

会进入 Measurement-assisted repair 的类别：

- target-not-found
- ambiguous-target
- window-changed
- geometry-drift
- ocr-mismatch
- accessibility-unavailable
- visual-mismatch

不会因为 Measurement 自动处理：

- state-mismatch
- permission
- business-verification-failure

RepairCandidate 是结构化对象，不是一段 prompt 文本。它只能在：

```text
execution PASS
AND
business verification PASS
```

之后进入 `qualified`。API 本身不修改黄金 Recipe；真正 promotion 是后续显式 authoring 决策。失败/未验证 candidate 只写 history，不污染正式脚本。

Calculator deterministic workflow test 模拟旧 constrained region 因 geometry drift 失败，Measurement 提供新 region，retry 和显示区业务验证均 PASS 后 candidate 才 qualified；测试同时证明 golden recipe 未被静默修改。

## 7. 测试层级

```text
Unit
  model / mapping / interaction / evidence / qualification / repair
Contract
  CustomUI macOS/Windows Measurement key parity
Integration
  stable single surface / refresh / four modes / copy / cleanup
Workflow
  Recorder evidence attachment / Human-Agent handoff / Calculator repair
OS Qualification
  qualification-manifest.json + local Codex physical validation
```

Prototype 仍然是 UI/Interaction Oracle：

```sh
node --test tests/desktop-measurement/model.test.js
python3 tests/desktop-measurement/browser.test.py
```

Production proof 以 Go tests、CustomUI host contracts、workflow tests 和真实 OS qualification 为准。

## 8. 当前验收边界

网页版可以完成并自动测试源码、数据合同、跨平台 bridge、artifact、authoring/repair workflow 和文档。

以下状态必须保持：

```text
macOS physical qualification     PENDING LOCAL CODEX VALIDATION
Windows physical qualification   PENDING LOCAL CODEX VALIDATION
mixed-DPI physical displays      PENDING LOCAL CODEX VALIDATION
real Recorder → artifact          PENDING LOCAL CODEX VALIDATION
real failure → repair → rerun     PENDING LOCAL CODEX VALIDATION
```

本地发现真实问题后，应直接修改生产源码、增加 regression test、重新 build 与重复真实场景；不能通过修改 Prototype 来掩盖 Native 问题。
