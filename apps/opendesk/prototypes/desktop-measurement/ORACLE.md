# Desktop Measurement Current UI / Interaction Oracle

**ORACLE STATUS: CURRENT / FROZEN — 2026-09-17**

本文件是 Desktop Measurement 当前唯一 UI / Interaction / State Contract。后续实现、测试和资格验证只需读取本文件，不得再把旧 baseline、旧 P0–P4、旧 Prompt 或旧阶段结论与本文件做“脑内合并”。

历史 `ORACLE.baseline-2026-09-16.md` 原样保留，仅用于追溯。它不是当前事实源，其中与本文件冲突的“打开即冻结 / foreground 自动 Reference / 单 currentResult / 无显式 Reference 选择”等语义全部属于 **SUPERSEDED**。

当前权威链：

```text
Explicit Current Requirement
→ Executable Prototype
→ Current ORACLE.md
→ Architecture / Contract Coverage
→ Production
→ Automated Verification
→ Native Qualification
```

源码证据：`index.html`、`prototype.css`、`model.js`、`interaction-core.js`、`visual-resolver.js`、`records.js`。Prototype 是 synthetic Oracle，不替代真实 macOS / Windows 资格验证。

---

## 1. Current lifecycle

唯一正常入口链：

```text
IDLE
  → REFERENCE_SELECTING
  → FREEZING
  → MEASURING
```

必须成立：

```text
进入 Measurement ≠ 确认 Reference ≠ Freeze
```

`REFERENCE_SELECTING` 是 Live Desktop 阶段。此时不得创建 Frozen Snapshot、不得生成 source-pixel evidence、不得提前进入 Measurement Toolbar、不得产生 Measurement Record。

用户显式确认一个仍然存在且几何未变化的 Reference Window 后，才允许：

```text
REFERENCE_SELECTING
→ FREEZING
→ capture selected reference/display
→ snapshot token
→ MEASURING
```

`PREPARING` 可以作为内部短暂实现细节保留，但它不是独立产品阶段，也绝不能授权确认前截图。

重复菜单 / Recorder / 快捷键入口必须 single-flight：已有 Session 时不得创建第二个 Session、不得自动重新选择 Reference、不得无条件生成新 Snapshot。

---

## 2. Live Reference Selection

### DM-SELECT-001 — entry does not freeze

打开 Desktop Measurement 后真实桌面保持 Live。初始 snapshotId 必须为空；没有 Reference Confirmation 就不允许产生正式 Frozen Snapshot。

### DM-SELECT-002 — hover candidate

鼠标经过真实窗口时，解析当前 pointer 下的**最上层可测窗口**作为 Hover Reference Candidate：

- 优先系统窗口枚举 / native window hit testing / AX/UIA 等窗口级事实；
- 不依赖 OCR 选择 Reference Window；
- 排除 OpenDesk Measurement 自身 overlay / host / Recorder / Runner 等不应被选择的产品窗口；
- 候选 identity 至少包含稳定的本次运行窗口 ID / PID / native handle 与 bounds；
- pointer 跨窗口时 candidate 跟随变化；
- 只有 candidate 变化时才需要视觉重绘。

候选解析必须 bounded / throttled，不能每个 pointermove 做无界窗口重扫或截图。

### DM-SELECT-003 — confirmation gate

Reference Confirmation 是明确的 click-size pointer press/release：

- down / up 必须命中同一窗口 identity；
- bounds 必须保持一致；
- 大幅拖动不是 click confirmation；
- 空白桌面、窗口消失、窗口移动 / resize、identity 变化均不得确认；
- Esc 取消选择并退出当前选择流程。

前台窗口只能作为候选建议，不能因为它是 foreground 就自动视为已确认。

### DM-SELECT-004 — only confirmation may trigger first capture

首次 `Capture` 的业务含义必须是“已确认 Reference 的冻结”，而不是“打开 Measurement 的副作用”。确认后 Capture 前还要再次核验 exact identity / bounds；同标题替代窗口不能静默接管。

### DM-SELECT-005 — selection visual

REFERENCE_SELECTING 只允许轻量提示：candidate border、弱 overlay / dim、可选 app/window label 与 bounds。不得显示正式 Frozen Micro HUD、正式 Measurement Toolbar 或 Records。

---

## 3. Frozen Snapshot contract

进入 `FREEZING` 后：

```text
confirmed exact window
→ exclude/hide Measurement-owned chrome
→ resolve display + logical/pixel mapping
→ capture source pixels
→ revalidate identity / geometry
→ create sessionId + generation + snapshotId token
→ MEASURING
```

Snapshot 是当前测量证据的唯一像素源。目标应用本身没有被暂停；只是 Measurement source 被固定。

`SnapshotToken` 必须包含：

```text
sessionId
generation
snapshotId
```

异步 AX/UIA/OCR/Vision/Image candidate 结果只有 token 与当前完全一致才可应用；旧 generation / snapshotId 必须直接丢弃。

颜色永远读取 Frozen source pixel，不能读取叠加后的 mask/HUD/overlay 像素。

---

## 4. Measuring surface

MEASURING 默认 Surface：

```text
Frozen Desktop / Display image
+ outside-window weak mask
+ Reference Window outline
+ Measurement overlay
+ pointer Micro HUD
+ Corner HUD
+ compact Toolbar
+ optional Inspector
```

主 Toolbar 仍只有四种工具和现有产品控制，不新增独立 Freeze/Unfreeze：

```text
点 / 区域 / 两点 / 两区域
|
磁吸定位 / 边距参照 / 更新画面 / 调整界面 / 详情 / 退出
```

低频能力（重新选择 Reference、记录名称、Copy All、结构化 Session、保存）属于 Corner HUD 次级动作或 Inspector，不扩张主 Toolbar。

---

## 5. Four measurement tools

### Point

保存：screen logical、window-relative、可靠 local-relative（若存在）、capture pixel、Frozen RGB/HEX、display mapping。

### Region

拖拽区域至少 `5×5 logical px`；保存 absolute bounds、Window/Local relative geometry、percentage geometry、signed margins 与必要派生量。再次开始新 Region 时创建新的 current measurement，不进入旧版八手柄/Arrow 编辑模型。

### Point ↔ Point

依次选择两个点，保存 A/B、ΔX、ΔY、horizontal/vertical distance、Euclidean distance。

### Region ↔ Region

依次选择两个有效 Region，保存 A/B bounds、horizontal/vertical gap、projection overlap、overlap area、center delta 与 B relative to A。

切换工具清除 current transient result / incomplete pair / current candidate lock，但不意味着重新 Capture。

---

## 6. Candidate Resolver / Magnet

正式名称：**磁吸定位**。默认开启；用户可关闭；Alt / Option 临时暂停。

磁吸只改变 Measurement Target / Selection Frame，不移动系统鼠标。

Frozen Snapshot 内候选来源顺序：

```text
valid current cache
→ semantic AX/UIA/UI-tree candidate
→ bounded visual / OCR / perception candidate
→ manual selection
```

语义与视觉 provenance 必须分开；visual region 不能冒充 semantic control。

重型视觉工作必须有 bounded ROI、visited/area/time/cancellation 上限和 latest-pointer throttle。禁止每次 pointermove 截图、全窗口 flood fill、无限 worker 堆积。

`Tab / Shift+Tab` 只切换**当前 Frozen Snapshot 内**真实 Candidate Stack 层级，不切换 Target Window、不重新截图。没有真实 stack 时必须安全 no-op 并诚实提示。

---

## 7. Coordinates / margins / references

默认只维护两级有效参照：

```text
Window Reference
Local Layout Reference | null
```

Local Reference 必须有实际布局意义并具备可靠 provenance；技术 wrapper、与 Target 近乎重合的节点、低可靠 visual region 不得自动晋升。

Cursor HUD：

```text
屏幕 X/Y
窗口 X/Y
区域 X/Y | —
Frozen source color #RRGGBB
```

没有可靠 Local/Region 时显示 `区域 —`，不得伪造 `(0,0)`。

每组边距固定为 signed `left / top / right / bottom`；允许负值，不 clamp 到 0。默认一次只重点绘制一组四边关系，不能把多层 ancestry 全铺在 overlay 上。

---

## 8. Hover / Corner HUD

Corner HUD 要明确区分：

```text
候选预览 · 未确认
已锁定 · 待记录
已记录
```

Hover preview 可以显示 source/layer、size、ratio、Window margins，以及最多一个可靠 Local Reference；它不是正式 Measurement Evidence。

Micro HUD 必须保持轻量且与重型 candidate resolver 解耦；pointer movement 不等待 OCR/segmentation。

---

## 9. Measurement Session Records

Measurement Session 不是单一 `currentResult`：

```text
Session
├─ Snapshot 1
│  ├─ Record 1
│  └─ Record 2
└─ Snapshot 2
   └─ Record 3
```

记录生命周期：

```text
Hover preview
→ Click confirmed current measurement
→ Enter / Record
→ appended Session Record
→ continue next measurement on same Frozen Snapshot
```

新建 Record **不得重新 Capture**。只有显式 Update / Adjust→Continue / Change Reference 才允许新 Snapshot。

每条 Record 至少包含：

```text
id
type
label/status
reference
sessionId/generation/snapshotId
geometry
coordinateSpaces
timestamp/source
candidate provenance
sourcePixel when applicable
stableRelocationEvidence
runtimeEvidence
```

支持 `point / region / point-to-point / region-to-region / margin` 对应结构。Record append 必须深拷贝 current result 与 Snapshot 引用；追加后清除 current result，历史 Record 不随新测量变化。

Session envelope 使用 versioned JSON，包含 `snapshots[]` 与 `measurements[]`。建议上限沿 Prototype 合同：100 records、16 snapshots、20 MiB encoded snapshot budget；超限 fail closed，不偷偷淘汰仍被 Record 引用的 Snapshot。

---

## 10. Update / Adjust / Reselect

### Update

保持同一 Session、同一已确认 Reference identity，重新 FREEZING，generation 增加并产生新 snapshotId。Current result/candidate 失效；历史 Records 保留原 token。

### Adjust

```text
MEASURING
→ ADJUSTING
```

隐藏 Frozen Snapshot、overlay、HUD、Toolbar、Inspector，让用户真实操作桌面。再次通过统一入口 Continue 时：

```text
ADJUSTING
→ FREEZING
→ MEASURING
```

### Reselect Reference

Inspector 中显式重选进入 `REFERENCE_SELECTING`。当前 snapshot-bound transient state 失效，但已记录历史 Records 保留。不能通过 target dropdown / same-title lookup 在后台静默替换 Reference。

---

## 11. Inspector / Copy / Save / Authoring

Inspector 默认关闭，`I` 可切换；Esc 在 Inspector 打开时先关闭 Inspector，否则退出 Measurement。

结构化输出必须能直接供 Recorder / Agent-to-Recipe / Automation Authoring 使用，而不是让下游 Agent 从 PNG 猜坐标。

Native 正式证据继续复用 `pkg/measurement` 的 `Result`、`MeasurementEvidence`、`MeasurementProductEvidence`、`BuildAuthoringMeasurementInput` 等 canonical model；Session 只是这些已验证证据的集合/索引，不建立第二套 Geometry/Locator Runtime。

默认存储 owner：

```text
.runtime/automation-authoring/<task-id>/measurement/sessions/<session-id>/
```

standalone 可用：

```text
.runtime/desktop-measurement/<session-id>/
```

不得写入 `apps/opendesk/**`。显式成功的 durable save 才能把记录状态写成 saved；clipboard / download request 本身不是 durable-save 证明。

---

## 12. Cleanup / isolation

Exit 必须幂等释放：selection input observer、candidate workers、Custom UI session/surface、temporary snapshot/overlay assets、listeners 与当前 transient state。

Measurement 自己的窗口 / host / overlay 必须从 Reference 解析和截图证据中排除。Recorder / Runner 不能被误选为业务 Reference；如果系统无法可靠排除，应 fail closed。

---

## 13. Qualification boundary

以下三种状态不得混写：

```text
AUTOMATED_PASS
MACOS_QUALIFIED
WINDOWS_QUALIFIED
```

源码存在或 synthetic test PASS 不等于 Native PASS。

需要真机验证的项目包括：真实 topmost window hit-test、真实 hover border/HUD、多显示器、负坐标、Retina / DPI、权限、Z-order、窗口移动/关闭、selection observer 生命周期、overlay exclusion、Recorder 共存与 close/reopen。

Current Production Coverage 与真实 Gap 状态统一维护在：

`docs/architecture/desktop-automation/desktop-measurement-contract-coverage.md`

后续禁止再用“P3 完成 / P4 完成”表示产品能力完成度。
