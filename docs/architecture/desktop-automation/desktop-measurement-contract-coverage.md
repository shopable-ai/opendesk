# Desktop Measurement Current Contract Coverage

> 状态基于 2026-09-18 当前 `master` 源码。本文取代“P0 / P1 / P2 / P3 / P4 完成度”作为 Desktop Measurement 当前实施进度入口。阶段号只允许出现在历史追溯中。

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

- `PROTOTYPE_UPDATED_NOT_RUN`：Prototype / Prototype test 已写入，但本次交付环境没有执行对应浏览器回归；不得写成 Browser PASS。
- `OPEN_IMPLEMENTATION`：当前产品合同尚未进入 Production。
- `PARTIAL`：已有可复用或已接线实现，但尚未满足完整 Current Oracle。
- `IMPLEMENTED_UNVERIFIED`：代码已实现，尚未取得对应自动测试结果。
- `AUTOMATED_PASS`：当前代码已有自动化验证证据；不代表真机资格。
- `LOCAL_REQUIRED`：只能通过真实 macOS / Windows 主机完成的资格项。
- `QUALIFIED`：目标平台真机资格验证已经完成并留有证据。

浏览器 Prototype、Production、Native Qualification 是三条不同证据链，不能互相替代。

## 3. Contract Coverage Matrix

| contractId | source | prototype | oracle | production | automatedTest | macOSQualification | windowsQualification | status | evidence | gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DM-LIFE-001 Lifecycle | Current Oracle §1 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | Service single-flight 已有；Product 初始选择门已前置到 capture adapter，但 `Service.State()` 尚未在选择期间暴露 `REFERENCE_SELECTING` | `reference-selection.test.py` ADDED_NOT_RUN；既有 lifecycle tests 本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | Prototype `interaction-core.js` + `selection-lifecycle.js`; `pkg/measurement/session.go`, `cmd/opendesk/app_measurement.go` | 核心 Service 仍在 `openNew()` 内调用 Capture；下一步应把 selection owner 从 adapter 提升到 Service lifecycle |
| DM-REF-001 Live Reference Selection | Oracle §2 DM-SELECT-001 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | 初始产品入口现在先观察真实 pointer / window，再允许 screenshot | focused Playwright ADDED_NOT_RUN；production selector tests 本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | Prototype Live observer；`automation/pointer_selection.go`, `cmd/opendesk/app_measurement.go` | 选择期 Native candidate border / label surface 仍需本地核验/收口 |
| DM-REF-002 Hover Reference Candidate | Oracle §2 DM-SELECT-002 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | pointer move 以 bounded resolver 解析 topmost eligible window；OpenDesk own windows 过滤；candidate 变化保留在 selection state | Hover A/B / app-switch focused browser cases ADDED_NOT_RUN；production z-order tests 本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | Prototype synthetic two-window scene；production selection state | HTML app switch / z-order 是 synthetic，仅用于 Oracle；各平台真实 z-order 仍需资格验证 |
| DM-REF-003 Reference Confirmation | Oracle §2 DM-SELECT-003/006 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | Production 已有 down/up identity/bounds/movement gate；本轮未修改 Production | focused real browser pointer/mouse cases ADDED_NOT_RUN | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `selection-lifecycle.js`; test-only move/close/failure fixture | Native 仍需验证 primary button、same pointer、blur/pointercancel、输入权限、多屏坐标与底层 click 隔离 |
| DM-FREEZE-001 Click → Freeze | Oracle §2–3 DM-SELECT-004 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | screenshot 位于 selection confirmation 之后；本轮未修改 Production | observable FREEZING / failure / cancel-late focused cases ADDED_NOT_RUN | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | Prototype request version + synthetic delay/failure; production capture adapter | `pkg/measurement.Service` 的正式 selector/capture ownership 仍需本地生产修复；Native 迟到 capture 必须实际证明 |
| DM-SNAP-001 Frozen Snapshot | Oracle §3 | existing prototype asset retained | CURRENT | 已有 Snapshot / Mapping / token / source-pixel 实现 | existing `pkg/measurement` tests；本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `pkg/measurement/model.go`, `session.go`, capture mapping tests | Native capture exclusion / permission / multi-display 仍需真机 |
| DM-CAND-001 Frozen Candidate Resolver | Oracle §6 | existing prototype asset retained | CURRENT | AX/UIA + OCR provider、token/epoch guard、candidate stack 已有 | existing candidate stack/provider tests；本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `candidate_stack.go`, `cmd/opendesk/app_measurement_candidates.go` | bounded latest-pointer worker/cache 与 Native cancellation 继续收敛 |
| DM-HUD-001 Selection / Hover HUD | Oracle §2/8 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | Frozen MEASURING HUD 已有；Live selection 可视 surface 的生产状态按现代码保留，本轮未修改 | exact prompt / toolbar-hidden cases ADDED_NOT_RUN | LOCAL_REQUIRED | LOCAL_REQUIRED | OPEN_IMPLEMENTATION | Prototype exact instruction + FREEZING HUD | 需要 Native selection overlay，并证明 overlay 不成为 candidate 或 capture source |
| DM-TOOL-001 Point | Oracle §5 | retained | CURRENT | implemented | existing Go tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `model.go`, `session_test.go` | 真机 source-pixel / DPI |
| DM-TOOL-002 Region | Oracle §5 | retained | CURRENT | implemented | existing Go tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `model.go`, `session_interaction_test.go` | 真机 drag / overlay parity |
| DM-TOOL-003 Point↔Point | Oracle §5 | retained | CURRENT | implemented | existing Go tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `BuildTwoPointResult` + tests | Native interaction qualification |
| DM-TOOL-004 Region↔Region | Oracle §5 | retained | CURRENT | implemented | existing Go tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | spacing model + tests | Native interaction qualification |
| DM-GEO-001 Geometry / Margins | Oracle §7 | retained | CURRENT | screen/window/local/ratio/signed margins implemented | mapping/margin tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `product_contract.go`, `capture_mapping_matrix_test.go` | mixed-DPI / monitor-hole Native verification |
| DM-INSP-001 Inspector | Oracle §11 | retained | CURRENT | current-result inspector/copy/save exists | existing session tests | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `session_view.go`, `oracle_alignment.go` | Inspector Records / Record action / reselection workflow 生产闭环继续核验 |
| DM-REC-001 Measurement Records | Oracle §9 | retained | CURRENT | canonical `MeasurementSessionJournal` 已存在；本轮未修改 Production | existing / pending production tests 本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `pkg/measurement/session_records.go` | 生产 activeSession UI 接线状态需按本地当前代码继续收口 |
| DM-REC-002 Multiple records share snapshot | Oracle §9 | retained | CURRENT | Journal 可复用同一 snapshot；本轮未修改 | existing production tests 本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `session_records.go` | 仍需 Native interaction regression 证明连续 Record 不 recapture |
| DM-REC-003 Historical records survive Update | Oracle §9/10 | retained | CURRENT | Journal 支持不同 generation/snapshot；本轮未修改 | existing production tests 本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `session_records.go` | refresh / journal owner 继续按 Production 当前实现核验 |
| DM-EXP-001 Session Export | Oracle §9/11 | retained | CURRENT | versioned envelope 已进入 canonical Go model；本轮未修改 | existing production tests 本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `session_records.go`, `evidence.go` | Native atomic manifest + snapshots transaction 仍需收口 |
| DM-AUTH-001 Automation Authoring handoff | Oracle §11 | N/A | CURRENT | 可逐 Record 复用现有 Authoring lowering；本轮未修改 | existing authoring tests 本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `authoring.go`, `evidence.go` | 真实 Session artifact path / loader 仍需 Production 闭环 |
| DM-RECORDER-001 Recorder integration | Oracle §12 | retained | CURRENT | product entry + activity isolation 已有；本轮未修改 | existing integration tests 本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | Recorder bridge | live selector 与 Recorder native input lease 共存需真机验证 |
| DM-SESSION-001 Session lifetime / Close | Oracle §12 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | single active Service + cleanup 已有；本轮未修改 | cancel / late-freeze focused case ADDED_NOT_RUN；production lifecycle tests 本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | Prototype request invalidation; production session/selector | Production selection owner / listener cleanup 需本地继续核验 |
| DM-DPI-001 DPI / Coordinate mapping | Oracle §3/7 | retained | CURRENT | logical/image mapping implemented | synthetic mixed-scale tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | capture mapping tests | Retina / Windows 125% / mixed monitor Native qualification |
| DM-MAC-001 macOS Qualification | Oracle §14 | N/A | CURRENT | 本轮未修改 Production | N/A | LOCAL_REQUIRED | N/A | LOCAL_REQUIRED | 本轮没有新 Native evidence | topmost hover, permissions, z-order, move/close, Retina, multi-display, overlay exclusion, cancel/stale freeze |
| DM-WIN-001 Windows Qualification | Oracle §14 | N/A | CURRENT | 本轮未修改 Production | N/A | N/A | LOCAL_REQUIRED | LOCAL_REQUIRED | 本轮没有新 Native evidence | UIA/window order, physical/logical mapping, 125%, multi-display, overlay exclusion, cancel/stale freeze |

## 4. Production Gap IDs

PG IDs 是短期 Production Gap，不是新阶段。本轮只更新 Prototype / Oracle / handoff；以下 Production 状态不因 Prototype 改动自动晋升。

| Gap | Current status | Current evidence | Closure condition |
| --- | --- | --- | --- |
| PG-01 Live Reference Selection | **PARTIAL** | Production 已有 initial screenshot 前的 pointer/window confirmation gate | 将 Current Oracle 的 REFERENCE_SELECTING / primary pointer / cancel ownership 在正式 Service 生命周期中闭环，并跑真实回归 |
| PG-02 Hover / Candidate Resolver | **PARTIAL** | Live window candidate 有 bounded resolver；Frozen candidate stack/provider 已较完整 | 证明平台 z-order、latest-pointer、window move/close、多屏、取消与 worker bounded 行为 |
| PG-03 Hover HUD / Native Visual Feedback | **OPEN_IMPLEMENTATION** | Prototype 已表达候选边框/提示；Native measuring HUD 可复用 | Live candidate border/weak dim/label 正式接线，并证明 overlay 不成为 candidate/capture source |
| PG-04 Session Records / Authoring | **PARTIAL** | immutable Journal / envelope / snapshot dedupe 等资产可复用 | 完成 Production activeSession Record/Update/Inspector/Save 与 Authoring artifact 闭环 |

## 5. Legacy Stage Retirement

### CURRENT

- `apps/opendesk/prototypes/desktop-measurement/`：当前 executable Prototype。
- `apps/opendesk/prototypes/desktop-measurement/ORACLE.md`：当前唯一 Oracle。
- `docs/architecture/desktop-automation/desktop-measurement.md`：当前产品 / Framework 架构正文。
- 本文件：当前实施与资格状态唯一 Coverage 入口。
- `pkg/measurement/**`、`pkg/customui/**`、`cmd/opendesk/app_measurement*.go`：Production 源码，以 Current Oracle 为准。

### REUSABLE

旧阶段中仍有效的 Geometry / mapping / Snapshot token / frozen source pixel / four tools / CandidateDescriptor / Evidence / Authoring / Recorder integration / cleanup seam 继续复用。资产可复用不代表旧产品叙述仍然有效。

### SUPERSEDED

- `Open Measurement → Capture → MEASURING` 作为目标入口链；
- foreground window 自动成为已确认 Reference；
- Reference acquisition 与 Freeze 同一步；
- 单一 `currentResult` 作为长期产品模型；
- “Prototype / P4 完成，因此 Native 仅剩本地验收”之类阶段结论；
- 把 PREPARING/FREEZING 当作无需用户 Reference Confirmation 的自动入口语义。

### HISTORICAL

- `ORACLE.baseline-2026-09-16.md`；
- 旧 Gap Matrix / amendment 文档；
- 旧 Prompt / P0–P4 implementation plan / qualification notes 中仅用于追溯的阶段描述。

## 6. 2026-09-18 Prototype handoff — Live Reference → Click-to-Freeze

### 本轮确认的交互与合同

本轮 Prototype / Oracle 明确落到：DM-SELECT-001～006，以及 Coverage 中 DM-LIFE-001、DM-REF-001/002/003、DM-FREEZE-001、DM-HUD-001、DM-SESSION-001。

最终交互：

```text
打开工具
→ Live Reference Selection
→ Hover 只预选
→ 可继续切换 synthetic app/content / Candidate
→ primary same-pointer click 确认 exact window
→ 可观察 FREEZING
→ 成功后才创建一个 Snapshot
→ MEASURING
→ 同一 Frozen Snapshot 连续测量
```

### 本轮实际修改职责

- `index.html`：增加 exact selection instruction、Live source probe、Prototype observer，并加载 selection lifecycle adapter；正式 Measurement Toolbar 结构未扩张。
- `selection-lifecycle.js`：只负责 Reference Selection confirmation gate、可观察 FREEZING、cancel/stale guard、failure recovery 和 Prototype test fixture；复用 `interaction-core.js` 既有 Snapshot / Measurement 路径，不建立第二套测量 Runtime。
- `ORACLE.md`：把 trigger / precondition / visible feedback / transition / allowed & forbidden effects / failure & recovery / verification 写成当前自包含契约。
- `tests/desktop-measurement/reference-selection.test.py`：新增聚焦 Chromium contract；真实确认路径使用 Playwright mouse/pointer/keyboard，test-only API 只用于 window move/close 与 freeze failure 注入。

### 本轮测试状态

- `selection-lifecycle.js` JavaScript 语法检查：由生成环境执行 `node --check`，通过。
- `reference-selection.test.py` Python 语法编译：由生成环境执行 `python -m py_compile`，通过。
- 最终仓库版本 Playwright Chromium：**NOT_RUN**。原因：本轮 GitHub connector 可读写仓库，但其文件不能挂载到本地 Chromium 执行容器；不得把静态语法检查写成 Browser PASS。
- 既有 `tests/desktop-measurement/browser.test.py`：**NOT_RERUN_THIS_ROUND**。
- 视觉人工确认：**NOT_CONFIRMED_BY_USER**。

本地应执行：

```text
python tests/desktop-measurement/reference-selection.test.py
python tests/desktop-measurement/browser.test.py
```

并实际打开：

```text
apps/opendesk/prototypes/desktop-measurement/index.html
```

或用任意本地静态 HTTP server 服务仓库根目录后访问该路径。浏览器 PASS、视觉确认、Native Qualification 必须分别记录。

### 仍需本地实现 / 验收的 Production 差异

本轮没有修改 Go、Native host、真实 input observer、真实 screenshot/capture 或 Production Measurement Service。Prototype test fixture 的 `closeWindow/moveWindow/failNextFreeze` 只用于合成 Oracle，不能作为 Production 已实现证据。

本地 Production 修复至少需要核验并闭环：

- 打开工具绝不先截图；
- Hover topmost eligible native window，只产生候选视觉；
- primary same-pointer down/up + same identity + stable geometry + click tolerance；
- blur / pointercancel / app switch / window move/resize/close 清空或拒绝 pending confirm；
- valid click 才允许 Capture；
- FREEZING 可取消，迟到 Capture 结果不能复活 Session；
- confirmation input 不透传给底层业务，也不成为第一条 Measurement；
- success exactly one Snapshot；failure 回 Live selection；
- formal Toolbar 只在 successful freeze 后出现；
- Update / Adjust / Reselect 继续沿用现有语义。

### Native qualification 必须证明

macOS / Windows 分别以真实系统行为证明：topmost/z-order、应用切换、hover border、窗口 move/close、权限、pointer identity、multi-display、negative coordinate、Retina/DPI、overlay exclusion、Recorder coexistence、cancel/stale completion、close/reopen。HTML synthetic PASS 不能替代这些结果。

## 7. Qualification rule

```text
source updated
≠ browser automated pass
≠ user visual confirmation
≠ macOS qualified
≠ Windows qualified
```

任何平台资格结果必须记录真实运行命令、当前 HEAD、目标系统、权限状态与可复查证据。没有目标系统证据时保持 `LOCAL_REQUIRED`。
