# Desktop Measurement Current Contract Coverage

> 状态基于 2026-09-17 当前 `master` 源码。本文取代“P0 / P1 / P2 / P3 / P4 完成度”作为 Desktop Measurement 当前实施进度入口。阶段号只允许出现在历史追溯中。

## 1. Current authority

```text
apps/opendesk/prototypes/desktop-measurement/
        ↓
apps/opendesk/prototypes/desktop-measurement/ORACLE.md
        ↓
docs/architecture/desktop-automation/desktop-measurement.md
        ↓
本 Contract Coverage
        ↓
pkg/measurement + pkg/customui + cmd/opendesk
        ↓
automated verification
        ↓
macOS / Windows native qualification
```

`ORACLE.baseline-2026-09-16.md`、旧 Gap Matrix 与旧 P0–P4 资料不是当前开发入口。

## 2. Status vocabulary

- `OPEN_IMPLEMENTATION`：当前产品合同尚未进入 Production。
- `PARTIAL`：已有可复用或已接线实现，但尚未满足完整 Current Oracle。
- `IMPLEMENTED_UNVERIFIED`：代码已实现，尚未取得对应自动测试结果。
- `AUTOMATED_PASS`：当前代码已有自动化验证证据；不代表真机资格。
- `LOCAL_REQUIRED`：只能通过真实 macOS / Windows 主机完成的资格项。
- `QUALIFIED`：目标平台真机资格验证已经完成并留有证据。

## 3. Contract Coverage Matrix

| contractId | source | prototype | oracle | production | automatedTest | macOSQualification | windowsQualification | status | evidence | gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DM-LIFE-001 Lifecycle | Current Oracle §1 | PASS | PASS | Service single-flight 已有；Product 初始选择门已前置到 capture adapter，但 `Service.State()` 尚未在选择期间暴露 `REFERENCE_SELECTING` | existing lifecycle tests + new selector tests pending execution | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `pkg/measurement/session.go`, `cmd/opendesk/app_measurement.go` | 核心 Service 仍在 `openNew()` 内调用 Capture；下一步应把 selection owner 从 adapter 提升到 Service lifecycle |
| DM-REF-001 Live Reference Selection | Oracle §2 | PASS | PASS | 初始产品入口现在先观察真实 pointer / window，再允许 screenshot | new `automation/pointer_selection_test.go` + `cmd/opendesk/app_measurement_selection_test.go` pending execution | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `automation/pointer_selection.go`, `cmd/opendesk/app_measurement.go` | 选择期还没有 native candidate border / label surface |
| DM-REF-002 Hover Reference Candidate | Oracle §2 | PASS | PASS | pointer move 以 48ms 最短间隔解析 topmost eligible window；OpenDesk own windows 过滤；candidate 变化保留在 selection state | pure z-order / exclusion tests pending execution | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `measurementWindowAtPointRows`, `measurementReferenceSelectionState` | 仍缺可见 hover border/HUD；需验证各平台 `WindowManager.List()` 的 z-order 语义 |
| DM-REF-003 Reference Confirmation | Oracle §2 | PASS | PASS | down/up 同 identity + exact bounds + ≤4px movement；Esc cancel | new selection state tests pending execution | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `measurementReferenceSelectionState.apply` | 需要真机验证 input permission、click cadence、多屏坐标 |
| DM-FREEZE-001 Click → Freeze | Oracle §2–3 | PASS | PASS | screenshot 位于 `selectMeasurementReference()` 成功之后；确认后再次 exact revalidate | static code + new tests pending execution | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `appMeasurementCapture.Capture` | `pkg/measurement.Service` 内部调用时序仍是 Capture-first abstraction，尚未显式拆成 Selector/Capture 两接口 |
| DM-SNAP-001 Frozen Snapshot | Oracle §3 | PASS | PASS | 已有 Snapshot / Mapping / token / source-pixel 实现 | existing `pkg/measurement` tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `pkg/measurement/model.go`, `session.go`, capture mapping tests | Native capture exclusion / permission / multi-display仍需真机 |
| DM-CAND-001 Frozen Candidate Resolver | Oracle §6 | PASS | PASS | AX/UIA + OCR provider、token/epoch guard、candidate stack 已有 | existing candidate stack/provider tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `candidate_stack.go`, `cmd/opendesk/app_measurement_candidates.go` | bounded latest-pointer worker/cache 仍需继续收敛；Native provider cancellation 需压测 |
| DM-HUD-001 Hover HUD / Candidate Border | Oracle §2/8 | PASS | PASS | Frozen MEASURING HUD 已有；REFERENCE_SELECTING 可视 overlay 尚未接线 | synthetic/browser only | LOCAL_REQUIRED | LOCAL_REQUIRED | OPEN_IMPLEMENTATION | Prototype + `session_view.go` | 需要 native selection overlay，且必须排除自身 hit-test/screenshot |
| DM-TOOL-001 Point | Oracle §5 | PASS | PASS | implemented | existing Go tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `model.go`, `session_test.go` | 真机 source-pixel / DPI |
| DM-TOOL-002 Region | Oracle §5 | PASS | PASS | implemented | existing Go tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `model.go`, `session_interaction_test.go` | 真机 drag / overlay parity |
| DM-TOOL-003 Point↔Point | Oracle §5 | PASS | PASS | implemented | existing Go tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `BuildTwoPointResult` + tests | Native interaction qualification |
| DM-TOOL-004 Region↔Region | Oracle §5 | PASS | PASS | implemented | existing Go tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | spacing model + tests | Native interaction qualification |
| DM-GEO-001 Geometry / Margins | Oracle §7 | PASS | PASS | screen/window/local/ratio/signed margins implemented | mapping/margin tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `product_contract.go`, `capture_mapping_matrix_test.go` | mixed-DPI / monitor-hole native verification |
| DM-INSP-001 Inspector | Oracle §11 | PASS | PASS | current-result inspector/copy/save exists | existing session tests | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `session_view.go`, `oracle_alignment.go` | Inspector 还没有 Records 列表 / Record action / reselection workflow |
| DM-REC-001 Measurement Records | Oracle §9 | PASS | PASS | 已新增 canonical `MeasurementSessionJournal`，Record 由现有 `MeasurementEvidence` 深拷贝并保持 immutable；尚未接入 `activeSession` UI | `session_records_test.go` pending execution | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `pkg/measurement/session_records.go` | 需把 Enter/Record 与 journal 绑定，并把 current result 消费后清空 |
| DM-REC-002 Multiple records share snapshot | Oracle §9 | PASS | PASS | Journal 对相同 snapshotId 去重 Snapshot index，多 Record 保持各自 immutable Evidence；新 Record API 本身不触发 Capture | `TestMeasurementSessionJournalMultipleRecordsShareOneSnapshot` pending execution | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `session_records.go` | 还需 Native interaction regression 证明 UI 连续 Record 不 recapture |
| DM-REC-003 Historical records survive Update | Oracle §9/10 | PASS | PASS | Journal 允许不同 generation/snapshot 并保持旧 token；不跨 snapshot 合并 geometry | historical-snapshot test pending execution | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `session_records.go` | `session.refresh()` 尚未持有/保留 journal owner |
| DM-EXP-001 Session Export | Oracle §9/11 | PASS | PASS | versioned `desktop-measurement-session/v1` envelope 已进入 canonical Go model；current Evidence copy/save 可复用 | envelope validation tests pending execution | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `session_records.go`, `evidence.go` | Native atomic manifest + snapshots transaction 尚未接线 |
| DM-AUTH-001 Automation Authoring handoff | Oracle §11 | N/A | PASS | Journal 可逐 Record 复用现有 `BuildAuthoringMeasurementInput`，保留每条 evidenceRef 与 SnapshotToken | authoring-per-record test pending execution + existing authoring tests | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `session_records.go`, `authoring.go`, `evidence.go` | 还需把真实 Session artifact 路径/loader 接到 Authoring task package |
| DM-RECORDER-001 Recorder integration | Oracle §12 | PASS | PASS | product entry + activity isolation already wired | existing integration tests | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `cmd/opendesk/app_mode.go`, Recorder bridge | live selector 与 Recorder native input lease 共存需真机验证 |
| DM-SESSION-001 Session lifetime / Close | Oracle §12 | PASS | PASS | single active Service + cleanup 已有；selection observer 为短生命周期 lease | existing lifecycle tests + new observer lifecycle test pending execution | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `session.go`, `pointer_selection.go` | 选择阶段 Service ownership 尚需内聚；journal 尚未绑定 Close/Exit 行为 |
| DM-DPI-001 DPI / Coordinate mapping | Oracle §3/7 | PASS | PASS | logical/image mapping implemented | synthetic mixed-scale tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | capture mapping tests | Retina / Windows 125% / mixed monitor live qualification |
| DM-MAC-001 macOS Qualification | Oracle §13 | N/A | PASS | source ready for local test | N/A | LOCAL_REQUIRED | N/A | LOCAL_REQUIRED | no current native evidence | window hover, permissions, z-order, Retina, multi-display, overlay exclusion |
| DM-WIN-001 Windows Qualification | Oracle §13 | N/A | PASS | source ready for local test | N/A | N/A | LOCAL_REQUIRED | LOCAL_REQUIRED | no current native evidence | UIA/window order, physical/logical point mapping, 125%, multi-display, overlay exclusion |

## 4. Production Gap IDs

PG IDs 是短期 Production Gap，不是新阶段。

| Gap | Current status | Current evidence | Closure condition |
| --- | --- | --- | --- |
| PG-01 Live Reference Selection | **PARTIAL** | 产品 initial screenshot 前已增加 pointer/window confirmation gate；foreground 不再自动作为 initial confirmation | 把 `REFERENCE_SELECTING` 正式提升为 `pkg/measurement.Service` 生命周期 owner；Open/hover snapshot count=0 的 Service-level regression 通过 |
| PG-02 Hover / Candidate Resolver | **PARTIAL** | Live window candidate 采用 bounded 48ms resolver；Frozen candidate stack/provider 已较完整 | 证明平台 z-order、latest-pointer、窗口 move/close、多屏、取消与 worker bounded 行为 |
| PG-03 Hover HUD / Native Visual Feedback | **OPEN_IMPLEMENTATION** | Prototype 完整；Native measuring HUD 可复用 | Live selection candidate border/weak dim/label 接线，并证明 overlay 不成为 candidate 或 capture source |
| PG-04 Session Records / Authoring | **PARTIAL** | 新增 immutable `MeasurementSessionJournal`、versioned envelope、snapshot dedupe、durable-save acknowledgement 状态和逐 Record Authoring lowering | 将 journal 接入 `activeSession` 的 Record/Enter/Update/Inspector/Save；实现 atomic Session artifact + loader |

## 5. Legacy Stage Retirement

### CURRENT

- `apps/opendesk/prototypes/desktop-measurement/` 当前 executable Prototype。
- `apps/opendesk/prototypes/desktop-measurement/ORACLE.md` 当前唯一 Oracle。
- `docs/architecture/desktop-automation/desktop-measurement.md` 当前产品 / Framework 架构正文。
- 本文件：当前实施与资格状态唯一 Coverage 入口。
- `pkg/measurement/**`、`pkg/customui/**`、`cmd/opendesk/app_measurement*.go` 当前 Production 源码，以 Current Oracle 为准。

### REUSABLE

旧阶段中仍有效的工程资产继续保留并使用：

- Geometry / Rect / Point / signed margins；
- CaptureMapping / display mapping / negative coordinates；
- Snapshot token / generation / stale guard；
- frozen source pixel color；
- four measurement tools；
- CandidateDescriptor / candidate stack / provider provenance；
- Evidence / ProductEvidence / AuthoringMeasurementInput；
- Recorder integration / product activity isolation；
- Custom UI Measurement surface 与 cleanup seam。

这些资产可复用，不代表其旧产品叙述仍然有效。

### SUPERSEDED

- `Open Measurement → Capture(ctx, "") → MEASURING` 作为目标产品链；
- foreground window 自动成为已确认 Reference；
- Reference acquisition 与 Freeze 同一步；
- 只允许单一 `currentResult` 的长期产品模型；
- “Prototype / P4 已完成，因此 Native 仅剩本地验收”之类阶段结论；
- 把 PREPARING/FREEZING 当作无需用户 Reference Confirmation 的自动入口语义。

### HISTORICAL

- `ORACLE.baseline-2026-09-16.md`；
- `docs/quality/desktop-measurement-oracle-gap-matrix.md`：2026-09-16 pre-fix audit，内部 `WRONG/MATCH` 行不得解释为当前状态；
- `desktop-measurement-amendment-2026-09-17.md`：修订过程、旧基准 SHA 与当时 Gap 快照；
- 旧 Prompt / P0–P4 implementation plan / qualification notes 中仅用于追溯的阶段描述。

历史文件可以保留，但后续 Agent 不得从它们恢复已被 Current Oracle 推翻的行为。

## 6. Qualification rule

```text
source exists
≠ automated pass
≠ macOS qualified
≠ Windows qualified
```

本轮新增 `pointer_selection*`、`app_measurement_selection_test.go`、`session_records_test.go` 仍必须实际执行后才能从 `IMPLEMENTED_UNVERIFIED` 晋升。任何平台资格结果必须记录真实运行命令、当前 HEAD、目标系统、权限状态与可复查证据。没有目标系统证据时保持 `LOCAL_REQUIRED`。
