# Desktop Measurement Current UI / Interaction Oracle

**ORACLE STATUS: CURRENT / FROZEN — 2026-09-18**

本文件是 Desktop Measurement 当前唯一 UI / Interaction / State Contract。后续实现、测试和资格验证以本文件为当前事实源；`ORACLE.baseline-2026-09-16.md`、旧 P0–P4、旧 Prompt 和历史阶段结论只用于追溯，不得与本文件“脑内合并”。

旧 baseline 中与本文件冲突的“打开即冻结 / foreground 自动 Reference / 单 currentResult / 无显式 Reference 选择”等语义全部属于 **SUPERSEDED**。

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

当前 Prototype 源码：`index.html`、`prototype.css`、`model.js`、`interaction-core.js`、`selection-lifecycle.js`、`visual-resolver.js`、`records.js`。Prototype 是 synthetic Oracle，只验证产品交互、状态与数据语义，不替代真实 macOS / Windows 资格验证。

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

`REFERENCE_SELECTING` 是 Live Desktop 阶段。此时不得创建 Frozen Snapshot、不得生成 source-pixel evidence、不得提前显示正式 Measurement Toolbar、不得产生 Measurement Record。

只有一次有效 Reference Confirmation 才允许进入：

```text
REFERENCE_SELECTING
→ FREEZING
→ capture selected reference/display
→ snapshot token
→ MEASURING
```

重复菜单 / Recorder / 快捷键入口必须 single-flight：已有 Session 时不得创建第二个 Session、不得自动重新选择 Reference、不得无条件生成新 Snapshot。

---

## 2. Live Reference Selection

### DM-SELECT-001 — entry does not freeze

**触发**：从任一统一入口打开 Desktop Measurement。

**前置**：没有活动 Measurement，或已有活动选择阶段需要被复用。

**可见反馈**：真实桌面保持 Live；显示轻量候选边框、窗口提示和选择说明：

```text
移动鼠标选择窗口 · 单击开始测量 · Esc 取消
```

**状态迁移**：`IDLE → REFERENCE_SELECTING`。重复入口保持同一 Session。

**允许副作用**：建立选择 observer / synthetic Prototype observer；更新 hover candidate。

**禁止副作用**：不得截图、不得创建 snapshotId、不得锁定 Reference、不得显示正式测量 Toolbar、不得产生 Record。

**失败 / 恢复**：入口失败应保持原桌面可操作并给出错误；不能用“先截图再选择”降级。

**验证**：进入后 `snapshotId == null`；Live source 计数持续变化；正式 Toolbar 隐藏。

### DM-SELECT-002 — hover candidate only

**触发**：`REFERENCE_SELECTING` 中 pointer 移动。

**前置**：选择 observer 有效，尚未存在 Frozen Snapshot。

**可见反馈**：pointer 下最上层可测窗口显示候选边框 / label / bounds；移动到另一窗口时 Candidate 跟随变化；离开窗口时清除 Candidate。

**状态迁移**：保持 `REFERENCE_SELECTING`。

**允许副作用**：更新 `referenceCandidate` 与轻量视觉反馈。

**禁止副作用**：Hover 不激活、不置顶、不锁定窗口，不自动切换应用，不截图，不创建 Reference，不创建 Snapshot。

候选 identity 至少需要本次运行稳定窗口身份与 bounds；生产实现优先 native window hit-test / AX/UIA 等窗口级事实，不依赖 OCR 选择 Reference Window。解析必须 bounded / throttled，不能每个 pointermove 做无界重扫或截图。

**验证**：Hover A/B 只改变 Candidate；snapshotId/reference 保持空。HTML 中的 Tab/窗口切换只代表 synthetic 场景，不得写成 Native 已验证。

### DM-SELECT-003 — confirmation gate

**触发**：用户在 Candidate Window 上完成一次完整 pointer down / up。

**前置**：状态必须是 `REFERENCE_SELECTING`，且 down 时存在有效 Candidate。

有效确认必须同时满足：

- primary button；右键 / 中键不确认；
- 同一 primary pointer / pointerId；
- 完整 down → up，没有 pointercancel / blur 中断；
- down 与 up 命中同一 exact window identity；
- down 与 up 的窗口 bounds 保持一致；
- pointer movement 不超过 Prototype 当前 click tolerance `8 CSS px`；
- up 时窗口仍存在且仍可被选择；
- 确认前不允许已有正式 snapshotId。

以下输入必须 fail closed 并继续 Live 选择：

- 入口按钮的 click；
- 右键 / 中键；
- 拖动超过 click tolerance；
- A 窗口 down、B 窗口 up；
- down 后窗口移动 / resize / 关闭 / identity 变化；
- pointercancel；
- 窗口失焦后迟到的 pointerup；
- 空白桌面。

**状态迁移**：只有全部条件成立，才允许 `REFERENCE_SELECTING → FREEZING`。

**验证**：优先使用 Chromium / browser 真实 mouse/pointer 事件驱动，而不是直接调用内部 `confirmReference()` 代替用户链路。窗口移动/关闭与冻结失败允许由明确标识的 Prototype test fixture 注入；这不等于 Native 行为已验证。

### DM-SELECT-004 — only confirmed click may trigger first capture

**触发**：DM-SELECT-003 的有效确认。

**前置**：exact Candidate identity/bounds 已通过 down/up gate。

**可见反馈**：先进入可观察 `FREEZING`，显示“正在冻结参照窗口”，正式测量 Toolbar 仍隐藏。

**状态迁移**：

```text
REFERENCE_SELECTING
→ FREEZING
→ capture / validate
→ MEASURING
```

Capture 前生产实现必须再次核验 exact identity / bounds；同标题替代窗口不能静默接管。

**允许副作用**：仅本次确认创建一个新 Snapshot。

**禁止副作用**：一次确认不得创建多个 Snapshot；FREEZING 尚未成功时不得把当前输入继续解释为第一条 Measurement 输入。

**失败 / 恢复**：Freeze 失败必须返回 Live `REFERENCE_SELECTING`，snapshotId 为空，并允许重新选择。用户在 FREEZING 期间取消后，任何迟到完成都必须因 request/generation 失效而丢弃，不能重新进入 MEASURING。

### DM-SELECT-005 — selection visual boundary

`REFERENCE_SELECTING` 只允许轻量候选边框、弱 overlay / dim、窗口提示、Live 状态和取消说明。不得显示正式 Frozen Micro HUD、Measurement Toolbar 或 Records。

Prototype 的 `LIVE source` 与 `Prototype observer` 是**测试/演示观测器**，用于证明 Live 与 Frozen 的隔离，不是 Production 产品 Toolbar。

### DM-SELECT-006 — confirmation input isolation

Reference Confirmation 本身只消费“选择 Reference”这一意图：

- 不触发底层模拟业务按钮；
- 不透传为 Target lock；
- 不生成 point/region/two-point/two-region 结果；
- 不自动 Record；
- 成功进入 MEASURING 后第一条 Measurement 必须等待后续独立用户输入。

失焦、pointercancel、退出、重新选择都必须清空 pending confirmation input。

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

Prototype 必须可以观察：选择期间 Live source 持续变化；确认时记录 `frozenAt`；确认后底层 Live observer 仍可继续变化，而 snapshotId 与 Frozen source 保持不变。

`SnapshotToken` 必须包含：

```text
sessionId
generation
snapshotId
```

异步 AX/UIA/OCR/Vision/Image candidate 结果只有 token 与当前完全一致才可应用；旧 generation / snapshotId 必须直接丢弃。颜色永远读取 Frozen source pixel，不能读取叠加后的 mask/HUD/overlay 像素。

---

## 4. Measuring surface

`MEASURING` 默认 Surface：

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

正式 Toolbar 只在成功冻结后出现：

```text
点 / 区域 / 两点 / 两区域
|
磁吸定位 / 边距参照 / 更新画面 / 调整界面 / 详情 / 退出
```

不新增独立 Freeze / Unfreeze 主按钮。

低频能力（重新选择窗口、记录名称、Copy All、结构化 Session、保存）属于 Corner HUD / Inspector / 次级入口，不扩张主 Toolbar。

---

## 5. Four measurement tools

### Point

保存 screen logical、window-relative、可靠 local-relative（若存在）、capture pixel、Frozen RGB/HEX、display mapping。

### Region

拖拽区域至少 `5×5 logical px`；保存 absolute bounds、Window/Local relative geometry、percentage geometry、signed margins 与必要派生量。

### Point ↔ Point

依次选择两个点，保存 A/B、ΔX、ΔY、horizontal/vertical distance、Euclidean distance。

### Region ↔ Region

依次选择两个有效 Region，保存 A/B bounds、horizontal/vertical gap、projection overlap、overlap area、center delta 与 B relative to A。

切换工具清除 current transient result / incomplete pair / current candidate lock，但不意味着重新 Capture。

---

## 6. Candidate Resolver / Magnet

正式名称：**磁吸定位**。默认开启；用户可关闭；Alt / Option 临时暂停。磁吸只改变 Measurement Target / Selection Frame，不移动系统鼠标。

Frozen Snapshot 内候选来源顺序：

```text
valid current cache
→ semantic AX/UIA/UI-tree candidate
→ bounded visual / OCR / perception candidate
→ manual selection
```

语义与视觉 provenance 必须分开；visual region 不能冒充 semantic control。重型视觉工作必须有 bounded ROI、visited/area/time/cancellation 上限和 latest-pointer throttle。禁止每次 pointermove 截图、全窗口 flood fill、无限 worker 堆积。

`Tab / Shift+Tab` 只切换当前 Frozen Snapshot 内真实 Candidate Stack 层级，不切换 Reference Window、不重新截图。

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

没有可靠 Local/Region 时显示 `区域 —`，不得伪造 `(0,0)`。每组边距固定为 signed `left / top / right / bottom`，允许负值，不 clamp 到 0。

---

## 8. Hover / Corner HUD

Corner HUD 要明确区分：

```text
候选预览 · 未确认
已锁定 · 待记录
已记录
```

Hover preview 可以显示 source/layer、size、ratio、Window margins，以及最多一个可靠 Local Reference；它不是正式 Measurement Evidence。Micro HUD 必须保持轻量并与重型 candidate resolver 解耦。

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

新建 Record 不得重新 Capture。只有显式 Update / Adjust→Continue / Change Reference 才允许新 Snapshot。

Record 至少包含 id/type/label/status/reference/sessionId/generation/snapshotId/geometry/coordinateSpaces/timestamp/source/candidate provenance/sourcePixel（适用时）/stableRelocationEvidence/runtimeEvidence。

Session envelope 使用 versioned JSON，包含 `snapshots[]` 与 `measurements[]`。Prototype 合同建议上限继续为 100 records、16 snapshots、20 MiB encoded snapshot budget；超限 fail closed。

---

## 10. Update / Adjust / Reselect

### 更新画面

保持同一 Session、同一已确认 Reference identity，重新 `FREEZING`，generation 增加并产生新 snapshotId。Current result/candidate 失效；历史 Records 保留原 token。

### 调整界面

```text
MEASURING
→ ADJUSTING
```

隐藏 Frozen Snapshot、overlay、HUD、Toolbar、Inspector，让用户真实操作桌面。再次 Continue 才 `ADJUSTING → FREEZING → MEASURING`。

### 重新选择窗口

Inspector 中显式进入 `REFERENCE_SELECTING`。当前 snapshot-bound transient state 失效，但已记录历史 Records 保留。不得用 target dropdown / same-title lookup 在后台静默替换 Reference。

---

## 11. Inspector / Copy / Save / Authoring

Inspector 默认关闭，`I` 可切换；Esc 在 Inspector 打开时先关闭 Inspector，否则退出 Measurement。

结构化输出必须能直接供 Recorder / Agent-to-Recipe / Automation Authoring 使用，而不是让下游 Agent 从 PNG 猜坐标。

Native 正式证据继续复用 `pkg/measurement` canonical model；Session 只是已验证 Evidence 的集合/索引，不建立第二套 Geometry/Locator Runtime。

默认存储 owner：

```text
.runtime/automation-authoring/<task-id>/measurement/sessions/<session-id>/
```

standalone 可用：

```text
.runtime/desktop-measurement/<session-id>/
```

不得写入 `apps/opendesk/**`。只有显式成功的 durable save 才能把记录状态写成 saved；clipboard / download request 本身不是 durable-save 证明。

---

## 12. Cleanup / isolation

Exit 必须幂等释放 selection input observer、pending confirmation、freeze request、candidate workers、Custom UI session/surface、temporary snapshot/overlay assets、listeners 与当前 transient state。

Measurement 自己的 window / host / overlay 必须从 Reference 解析和截图证据中排除。Recorder / Runner 不能被误选为业务 Reference；无法可靠排除时应 fail closed。

---

## 13. Prototype verification contract

Reference Selection 的 browser contract 至少覆盖：

- 入口保持 Live、没有 snapshot；
- Hover A/B 只切换 Candidate；
- synthetic app/content switch 不冻结；
- 右键、中键、拖动、跨窗口 down/up 不确认；
- pointercancel / blur 清空 pending；
- 窗口移动/关闭使确认失效；
- 有效主键同 pointer click 先进入可观察 FREEZING；
- 成功只创建一个 Snapshot；
- confirmation input 不成为第一条 Measurement；
- Frozen snapshot 不被后续 Live source tick 污染；
- Freeze failure 返回 Live selection；
- FREEZING 期间 Esc 取消，迟到结果不能复活 Session。

其中用户真实确认路径必须由 browser mouse/pointer/keyboard 事件驱动；故障注入与 synthetic move/close 可以使用明确的 test-only fixture API。

---

## 14. Qualification boundary

以下状态不得混写：

```text
SOURCE_UPDATED
BROWSER_AUTOMATED_PASS
USER_VISUALLY_CONFIRMED
MACOS_QUALIFIED
WINDOWS_QUALIFIED
```

源码存在、静态语法通过或 synthetic browser PASS 都不等于 Native PASS。

Native 必须另外证明：真实 topmost window hit-test、真实 hover border/HUD、应用切换、Z-order、窗口移动/关闭、多显示器、负坐标、Retina / DPI、权限、selection observer 生命周期、overlay exclusion、Recorder 共存、close/reopen、FREEZING cancel/stale completion。

Current Production Coverage 与真实 Gap 状态统一维护在：

`docs/architecture/desktop-automation/desktop-measurement-contract-coverage.md`

后续禁止再用“P3 完成 / P4 完成”表示产品能力完成度。
