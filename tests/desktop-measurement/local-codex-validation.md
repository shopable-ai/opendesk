# OpenDesk Desktop Measurement P0–P4 本地 Codex 测试、修复与验收

## 目标需求

基于当前 `master` 已实现的 Desktop Measurement P0→P4，完成真实操作系统环境下的测试、问题修复和最终资格验收。

本轮不是重新设计 Measurement 架构，而是把已经落到仓库里的能力验证成真实可用的产品闭环。

最终用户链路必须真实成立：

```text
开发者菜单 / Recorder 测量按钮 / 全局快捷键
        ↓
同一个唯一 Measurement Session
        ↓
冻结真实桌面
        ↓
Reference + Geometry + Measurement
        ↓
Point / Region / Two Point / Two Region
        ↓
编辑 / 键盘 / HUD / Micro / Inspector / 三档复制
        ↓
保存 Measurement Evidence
        ↓
Recorder / Human-to-Recipe / Agent-to-Recipe / Qualification
        ↓
真实自动化执行
        ↓
失败时按故障类型决定是否进入 Measurement-assisted Repair
        ↓
Repair Candidate
        ↓
复用现有 Execution 路径重试
        ↓
业务验证
        ↓
qualified / rejected
```

本地验收的价值不是证明“代码能编译”，而是证明：

> Measurement 在真实 macOS / Windows 桌面、真实 DPI、真实输入事件、真实剪切板、真实 Recorder 和真实自动化执行中仍保持 P0→P4 的合同。

## 当前状态

当前仓库已经完成 P0→P4 的源码、自动测试、跨平台 host contract、Measurement Evidence、Automation Authoring handoff、Qualification、Repair workflow 和正式文档。

Prototype 继续是 UI / Interaction Oracle；Native / Go tests 是生产合同证明；真实 OS qualification 才能把 `qualification-manifest.json` 中对应行从 `NOT_RUN` 改为 `PASS`。

本轮应直接从当前实现开始测试和修复，不重新从方案设计阶段开始。

## 本轮执行

先运行当前 Measurement 专用自动化测试与 Prototype Oracle，确认本地基线与仓库 CI 一致。

然后构建真实 OpenDesk，并在当前可用操作系统上进行真实交互验证。

发现失败时：

```text
复现失败
→ 保存日志 / 截图 / artifact
→ 沿实际事件链或数据链定位
→ 最小必要修复
→ 增加或更新自动化 regression test
→ rebuild
→ 重跑原失败场景
→ 再做相关回归
```

不要通过降低断言、删除测试、修改 Prototype 来掩盖 Native 实现问题。

### P0 — Native Core 真实验收

验证同一个 Session 只创建一个 Measurement native surface。

真实检查：

- 首次打开 Measurement。
- 重复从同一入口打开。
- 在菜单、Recorder 按钮、全局快捷键之间交叉重复打开。
- Tool / Result / Reference / HUD / Micro / Inspector / Copy Menu 变化时不重建 native surface。
- Refresh 使用同一 surface：隐藏 → 重新 capture → patch Source / bounds → 恢复。
- Exit 后 native surface、输入状态、snap、Inspector、Copy Menu、session registry、临时资源全部清理。
- 再次进入能够创建一个全新的 Session，且没有旧状态泄漏。

四种模式必须在真实冻结画面上分别工作：

```text
Point
Region
Two Point
Two Region
```

Point RGB 必须与 Frozen Capture Pixel 对应，不能从后续变化的实时桌面读取。

Region 真实编辑必须覆盖：

```text
body
N / NE / E / SE / S / SW / W / NW
Arrow = 1 logical unit
Shift+Arrow = 10 logical units
```

验证严格 Esc 层级：

```text
Copy Menu
→ Inspector
→ Local Edit
→ Reference Edit
→ Session Exit
```

验证三档复制和保存：

```text
① 简明数值
② 完整中文说明
③ 结构化数据
```

结构化数据必须继续包含 canonical Result、Reference、Coordinate Space、CaptureMapping 与 evidence 信息。

### P1 — UX / Robustness 真实验收

在真实应用和真实显示器边缘检查：

- HUD 四角避让是否稳定。
- Micro 是否靠近目标、靠近屏幕边缘时自动翻转、不会越界。
- Micro / HUD / Toolbar / Inspector 不会成为 Measurement target、candidate 或 Reference。
- very small region、reverse drag、near-zero size、display edge、negative coordinates 行为 deterministic。
- 连续拖拽时 UI 响应无明显卡顿，pointer move 不创建新 surface。
- Refresh 失败、Capture 失败、Source patch 失败、Reference 失效、目标窗口消失时，不留下 half-updated session。
- 已经存在有效 Session 时，局部失败应尽量保持旧状态可用；无法继续时必须 deterministic cleanup。

如果观察到明显拖拽延迟，不能仅因为最终数值正确就判 PASS；需要定位 renderer / patch / host update 的实际性能问题并修复。

### P2 — Cross-platform / DPI / Native Host 真实验收

当前机器能验证的平台必须真实执行。

macOS 至少验证：

- Native Measurement surface。
- Retina / 2x mapping。
- Accessibility 权限存在与缺失时的行为。
- `1 / 2 / 3 / 4`。
- `Tab / Shift+Tab`。
- `Option` keydown suspend 与 keyup restore。
- Arrow / Shift+Arrow。
- `R / I / Esc`。
- `Cmd+C / Cmd+Shift+C / Cmd+Option+C`。
- 系统剪切板真实内容。
- 全局快捷键入口。
- Recorder 测量按钮入口。
- 至少一个真实多显示器 / negative-origin 场景（设备具备时）。

Windows 可用时至少验证：

- Native host / WebView2 Measurement surface。
- UIA 环境。
- 100% / 125% / 150% / 200% DPI。
- mixed DPI 双屏。
- negative-origin secondary display。
- keyboard phase，特别是 Alt keyup。
- clipboard。
- global shortcut。
- Recorder entry。

如果当前机器没有 Windows，不得伪造 Windows PASS；对应资格行继续保持 `NOT_RUN`。

任何跨屏场景都必须遵守当前合同：

> 一个 Frozen Capture 对应一个 CaptureMapping；不能把另一块 display 的坐标静默解释到当前 capture space 中。

### P3 — Measurement → Automation Authoring 真实闭环

必须至少完成一次真实 Recorder → Measurement artifact：

```text
Recorder action
+
Measurement evidence
        ↓
.runtime/automation-authoring/<task-id>/measurement/
```

检查真实 artifact：

- `evidence.json` 可重新加载。
- `snapshot.png` hash / dimensions 与 evidence 一致。
- provenance 与真实来源一致。
- semantic evidence 已经足够时，Measurement 不替换 semantic locator。
- geometry 只作为 constrained search / calibration / verification evidence，不成为唯一长期绝对坐标 locator。
- Recorder attachment 不破坏原有 action evidence。
- Human-to-Recipe 和 Agent-to-Recipe handoff 能消费同一 Measurement Evidence。
- Qualification 可以对 Reference、target geometry 和 pixel plausibility 做验证。

### P4 — Measurement-assisted Repair 真实闭环

至少完成一个真实或仓库已有稳定 fixture 对应的失败→维修闭环，优先 Calculator。

建议真实链路：

```text
原自动化步骤成功
→ 改变窗口/控件布局或约束区域
→ 原步骤失败
→ classify failure
→ 只有适合 Measurement 的根因进入 repair
→ 打开 Measurement repair context
→ 用户只补必要 evidence
→ 生成结构化 Repair Candidate
→ 复用现有 Execution 路径重试
→ 读取真实业务结果
→ verification
→ qualified / rejected
```

必须特别验证：

- `ambiguous-target / window-changed / geometry-drift / visual-mismatch` 可以进入 Measurement-assisted repair。
- 原始 `target-not-found / OCR mismatch / Accessibility unavailable` 不应自动把 Measurement 当通用 fallback；必须先完成各自诊断，只有确认根因属于 target ambiguity、Reference/Window drift、geometry/layout drift 或 visual mismatch 后才重新分类进入 Measurement。
- `permission / state mismatch / business verification failure` 不进入 Measurement repair。
- Repair Candidate 未通过执行与业务验证前，不允许修改黄金 Recipe。
- 只有 `execution PASS + verification PASS` 才能标记 `qualified`。
- repair history 必须保留 old evidence、new measurement、candidate、execution outcome、verification outcome。

## 完成标准

只有下面各项都得到真实证据后，当前平台的本地验收才算完成：

- P0 Stable Single Surface：PASS。
- P0 四种模式：PASS。
- P0 Reference / Candidate / Region editing / Keyboard / Esc / Copy / Lifecycle：PASS。
- P1 HUD / Micro / edge cases / performance / failure recovery：PASS。
- P2 当前实际可用平台的 Native host、DPI、keyboard、clipboard、shortcut、Recorder entry：PASS。
- P3 Recorder → Measurement artifact：PASS。
- P3 Human / Agent / Qualification consumption：PASS。
- P4 failure classification：PASS。
- P4 Measurement handoff：PASS。
- P4 retry + business verification 双门：PASS。
- P4 未验证 repair 不污染黄金 Recipe：PASS。
- Prototype model/browser oracle：PASS。
- Measurement 专用 Go / CustomUI / Recorder contracts：PASS。
- 修复引入的 regression tests：PASS。
- 实际运行过的 qualification manifest 行已更新为 `PASS` 或 `FAIL` 并附 evidence。
- 没有真实运行的平台仍保持 `NOT_RUN`。

完成后再运行仓库级相关回归；环境允许时运行完整 `go test ./...`。

最终输出必须明确列出：

```text
Final HEAD
实际平台 / OS / DPI / displays
P0: PASS / FAIL
P1: PASS / FAIL
P2: PASS / FAIL / NOT_RUN
P3: PASS / FAIL
P4: PASS / FAIL
Prototype: PASS / FAIL
Automated contracts: PASS / FAIL
真实修复内容
新增 regression tests
qualification-manifest 更新
仍然 NOT_RUN 的真实平台项目
最终 git status
```

## 必要边界

- 继续只使用 `pkg/measurement` 的 canonical Geometry / CaptureMapping / Result / Evidence；不要创建 Mac/Windows/Agent/Repair 平行 Geometry。
- 不创建第二套 Runtime；P4 必须复用 OpenDesk 现有 Execution / Recipe 能力。
- Measurement 是 Authoring / Repair evidence，不是所有失败的通用 fallback，也不是 brittle pixel-only locator。
- 不通过降低 Prototype、删除断言、跳过失败测试来得到 PASS。
- 不把没有真实物理 OS 证据的 qualification 行改成 PASS。
- 如果 `master` 在测试期间被其他会话推进，先读取最新相关实现并合并自己的最小修复，禁止 reset / force push / 覆盖有效并行修改。
