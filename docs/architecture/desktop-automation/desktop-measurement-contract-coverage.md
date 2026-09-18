# Desktop Measurement Current Contract Coverage

> 状态基于 2026-09-18 当前工作树（未提交改动已明确标注）。本文取代“P0 / P1 / P2 / P3 / P4 完成度”作为 Desktop Measurement 当前实施进度入口。阶段号只允许出现在历史追溯中。

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
- `NOT_RUN`：当前平台或入口本轮未运行；不得由构建、交叉编译或其他平台证据推断通过。

浏览器 Prototype、Production、Native Qualification 是三条不同证据链，不能互相替代。

## 3. Contract Coverage Matrix

| contractId | source | prototype | oracle | production | automatedTest | macOSQualification | windowsQualification | status | evidence | gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DM-LIFE-001 Lifecycle | Current Oracle §1 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | `Service` 以 `IDLE → REFERENCE_SELECTING → FREEZING → MEASURING` 驱动；初始选择无 Snapshot、重复入口 single-flight、失败回 Live | `TestInitialReferenceSelectionIsLiveSingleFlightAndSnapshotFree`、`TestInitialCaptureFailureReturnsToLiveSelectionWithoutFallback` PASS | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `pkg/measurement/session.go`; `pkg/measurement/session_reference_selection_test.go` | macOS/Windows 产品入口与实窗仍未资格化 |
| DM-REF-001 Live Reference Selection | Oracle §2 DM-SELECT-001 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | `appMeasurementReferenceSelector` 使用 host-owned `reference-selection` Native surface；选中后才调用 exact capture | focused Service tests PASS；本轮更改 Native feedback 仍待验证 | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `cmd/opendesk/app_measurement_selection_surface.go`; `app_measurement.go` | 当前产品实窗仍受旧单实例阻断，不能把 Host/unit 结果代替 Measurement qualification |
| DM-REF-002 Hover Reference Candidate | Oracle §2 DM-SELECT-002/005 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | bounded resolver 命中 topmost eligible window；每个 display 由候选外侧 dimmer panels 覆盖，candidate 由透明 native shield + outline 保持 Live 原始像素 | dimmer geometry / no-candidate-overlap tests ADDED_THIS_ROUND_NOT_RUN；既有 selector tests PASS | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `cmd/opendesk/app_measurement_selection_surface.go`; `app_measurement_selection_test.go`; `pkg/customui/machost/native_darwin.m` | 必须以当前 Bundle 实窗证明候选内部不被覆盖、外侧门板原子跟随、跨屏与 z-order 正确 |
| DM-REF-003 Reference Confirmation | Oracle §2 DM-SELECT-003/006 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | primary down/up、exact identity/bounds、8 logical/CSS px 容差与隔离 outline 已接线；右/中键、跨窗、超容差 fail closed | `TestMeasurementReferenceSelectionRequiresSameWindowAndOracleClickTolerance`、`TestMeasurementReferenceSelectionRejectsNonPrimaryConfirmation` PASS | LOCAL_REQUIRED | LOCAL_REQUIRED | PARTIAL | `cmd/opendesk/app_measurement.go`, `app_measurement_selection_test.go` | `PointerSelectionEvent` 尚未携带 native pointerId；blur/pointercancel、input lease 与底层 click 隔离必须用真实主机逐项证明 |
| DM-FREEZE-001 Click → Freeze | Oracle §2–3 DM-SELECT-004 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | exact reference 在 screenshot 前后重核验；FREEZING 无 snapshot；capture 失败回 Live；终止标记使 late capture 失效 | `TestCloseDuringFreezingDiscardsLateCaptureWithoutRevivingSession`、`TestInitialCaptureFailureReturnsToLiveSelectionWithoutFallback` PASS | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `pkg/measurement/session.go`; `session_reference_selection_test.go`; `cmd/opendesk/app_measurement.go` | Native cancel / late OS capture 的实窗证据尚缺 |
| DM-SNAP-001 Frozen Snapshot | Oracle §3 | existing prototype asset retained | CURRENT | 已有 Snapshot / Mapping / token / source-pixel 实现 | existing `pkg/measurement` tests；本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `pkg/measurement/model.go`, `session.go`, capture mapping tests | Native capture exclusion / permission / multi-display 仍需真机 |
| DM-CAND-001 Frozen Candidate Resolver | Oracle §6 | existing prototype asset retained | CURRENT | AX/UIA + OCR provider、token/epoch guard、candidate stack 已有 | existing candidate stack/provider tests；本轮未重跑 | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `candidate_stack.go`, `cmd/opendesk/app_measurement_candidates.go` | bounded latest-pointer worker/cache 与 Native cancellation 继续收敛 |
| DM-HUD-001 Selection / Hover HUD | Oracle §2/8 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | macOS 以 native AppKit candidate shield / dimmer / instruction surfaces 绘制，避免 WebKit 透明层白底覆盖；完成选择前关闭，正式 Measurement Toolbar 仍只在 freeze 成功后创建 | native role/geometry tests ADDED_THIS_ROUND_NOT_RUN；Measurement 实窗 NOT_RUN | LOCAL_REQUIRED | LOCAL_REQUIRED | IMPLEMENTED_UNVERIFIED | `cmd/opendesk/app_measurement_selection_surface.go`; `pkg/customui/model.go`; `pkg/customui/machost/native_darwin.m` | 需要当前 Bundle 实窗截图，确认候选原样、门板、说明位置、点击隔离及多显示器 |
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
| DM-SESSION-001 Session lifetime / Close | Oracle §12 | PROTOTYPE_UPDATED_NOT_RUN | CURRENT | Close 先标记终态、原子取消 selector/capture；Surface 初始化与清理互斥；reselect 保持同一 Service session、提升 generation 并废弃旧 token | `TestCloseCancelsLiveSelectionWithoutCreatingSurfaceOrSnapshot`、`TestCloseDuringFreezingDiscardsLateCaptureWithoutRevivingSession`、`TestCloseDuringReselectCancelsQueuedLiveSelectionAndKeepsOldTokenInvalid` PASS | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | `pkg/measurement/session.go`; `session_reference_selection_test.go` | Native observer/host process cleanup 仍需 macOS/Windows 真机 |
| DM-DPI-001 DPI / Coordinate mapping | Oracle §3/7 | retained | CURRENT | logical/image mapping implemented | synthetic mixed-scale tests | LOCAL_REQUIRED | LOCAL_REQUIRED | AUTOMATED_PASS | capture mapping tests | Retina / Windows 125% / mixed monitor Native qualification |
| DM-MAC-001 macOS Qualification | Oracle §14 | N/A | CURRENT | 新 Bundle 已构建且 codesign 校验；实际入口被 `/Applications/OpenDesk.app` 旧 PID 49640 single-instance 接管，当前 `dist/OpenDesk.app` 未加载 | Runtime API Custom UI Native Host subcases PASS；Measurement product flow NOT_RUN | LOCAL_REQUIRED | N/A | LOCAL_REQUIRED | `dist/OpenDesk.app` 2026-09-18 02:54:48Z；入口/PID/load-path evidence | 须先受控退出旧实例，再以当前 Bundle 重启并采集真实选窗/冻结截图 |
| DM-WIN-001 Windows Qualification | Oracle §14 | N/A | CURRENT | Windows Host protocol 已升至 1.14；未在 Windows 设备运行 | N/A | N/A | LOCAL_REQUIRED | LOCAL_REQUIRED | NOT_RUN | `pkg/customui/winhost/Program.cs` | UIA/window order, physical/logical mapping, 125%, multi-display, overlay exclusion, cancel/stale freeze |

## 4. Production Gap IDs

PG IDs 是短期 Production Gap，不是新阶段。以下状态基于当前 Production 源码和本轮可复查证据；Prototype 改动本身不使状态自动晋升。

| Gap | Current status | Current evidence | Closure condition |
| --- | --- | --- | --- |
| PG-01 Live Reference Selection | **AUTOMATED_PASS; LOCAL_REQUIRED** | Service lifecycle、selector/capture boundary和重试/取消测试已通过 | 用当前 Bundle 在真实 macOS/Windows 完整回归；补 native pointerId 或以平台单一 physical pointer contract 明确替代 |
| PG-02 Hover / Candidate Resolver | **PARTIAL** | Live window candidate 有 bounded resolver；Frozen candidate stack/provider 已较完整 | 证明平台 z-order、latest-pointer、window move/close、多屏、取消与 worker bounded 行为 |
| PG-03 Hover HUD / Native Visual Feedback | **IMPLEMENTED_UNVERIFIED** | Prototype 已表达 WeChat-style outside-only spotlight；macOS Production 改为透明 native candidate shield 加外侧 dimmer panels，避免 WebKit 白底 | 取得当前 Bundle 实窗截图，证明候选内容保持原样、外侧门板稳定跟随、overlay 不成为 candidate/capture source 且确认点击不下传；Windows live 另行资格化 |
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

- `index.html`：selection instruction 明确“目标保持清晰，周围变暗”；Live source probe、Prototype observer 与正式 Measurement Toolbar 边界保持不变。
- `selection-lifecycle.js`：只负责 Reference Selection confirmation gate、可观察 FREEZING、cancel/stale guard、failure recovery 和 Prototype test fixture；复用 `interaction-core.js` 既有 Snapshot / Measurement 路径，不建立第二套测量 Runtime。
- `interaction-core.js` + `prototype.css`：Live Hover 使用 even-odd spotlight cutout；Candidate Window 内部 `fill:none`，只在其外侧绘制中性深色蒙版，禁止白色/灰色覆盖 Candidate 内容。
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

以下是本文件进入本轮 Production 修复前的 Prototype handoff 基线；当前实现和证据以 §3 Matrix 与下方 2026-09-18 Production follow-up 为准。

本轮没有修改 Go、Native host、真实 input observer、真实 screenshot/capture 或 Production Measurement Service。Prototype test fixture 的 `closeWindow/moveWindow/failNextFreeze` 只用于合成 Oracle，不能作为 Production 已实现证据。

本地 Production 修复至少需要核验并闭环：

- 打开工具绝不先截图；
- Hover topmost eligible native window，只产生候选视觉；Candidate 保持原样，只有 Candidate 外侧区域变暗，不能反向覆盖/白化目标窗口；
- primary same-pointer down/up + same identity + stable geometry + click tolerance；
- blur / pointercancel / app switch / window move/resize/close 清空或拒绝 pending confirm；
- valid click 才允许 Capture；
- FREEZING 可取消，迟到 Capture 结果不能复活 Session；
- confirmation input 不透传给底层业务，也不成为第一条 Measurement；
- success exactly one Snapshot；failure 回 Live selection；
- formal Toolbar 只在 successful freeze 后出现；
- Update / Adjust / Reselect 继续沿用现有语义。

### Native qualification 必须证明

macOS / Windows 分别以真实系统行为证明：topmost/z-order、应用切换、hover spotlight（Candidate 原样、外围 dim、无反向白色遮罩）、窗口 move/close、权限、pointer identity、multi-display、negative coordinate、Retina/DPI、overlay exclusion、Recorder coexistence、cancel/stale completion、close/reopen。HTML synthetic PASS 不能替代这些结果。

## 7. 2026-09-18 Production follow-up — Reference Selection / Freeze

### 代码与自动化验证

- `measurementReferenceClickTolerance` 已与 Current Oracle 对齐为 `8.0` logical desktop points（CSS px 等价）；边界测试覆盖 8 px 接受、9 px 拒绝、跨窗口和非 primary button 拒绝。
- `activeSession` 现在在终止时先标记 finished，再与 selector cancellation 原子协调；`initializeFrozenSurfaceForLiveSession` 与关闭清理互斥。迟到的 capture frame 不会重新创建 Custom UI、持久化 snapshot 或回到 `MEASURING`。
- `reselectReference` 保持同一 Service session，关闭旧 frozen surface，清除 transient/result，提升 generation 并令先前 token 失效；每个 generation 使用独立的内部 Custom UI transport session，避免复用已关闭的 `sessionId/windowId`。取消重选不会创建第二次 capture 或恢复旧 token。
- adapter-only compatibility path 以 `opening` gate 在 Surface 初始化完成后才发布 active session；生产 Selector 路径仍立即发布同一 Live observer。完整 `go test -v -race ./pkg/measurement -count=1 -timeout=120s` 已在 6.58 秒 PASS；`go test ./pkg/customui ./cmd/opendesk ./cmd/opendesk-ui-host` 亦通过。构建中仅见仓库既有 macOS native deprecation warnings。

### Runtime API 与 Native Host

- 已按 `docs/api/.rules.md`、`docs/api/ui.md`、`docs/api/automation-app.md`、`docs/api/window.md` 使用正式入口运行：

  ```text
  OPENDESK_RUNTIME_API_MODE=custom-ui OPENDESK_BINARY="$PWD/dist/opendesk" ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
  ```

- 本轮先修正 macOS/Windows Native Host 残留的 `1.13.0` 协议常量，使其与 Runtime `1.14.0` 对齐。run-local Host 已成功加载；真实 Native component/API 子场景通过并产出截图。
- 整个 Custom UI gate 结果仍为 **FAILED (4/22)**，原因是仓库缺少四个 Recorder fixture：`examples/custom-ui/recording-console/{controller.js,recorder.html,tray.html}` 与 `internal/recorderbundle/ui/recording-history.js`。这是独立的工作树缺失项；没有修改或掩盖它，也不把该整套 gate 记为 PASS。证据目录：`.runtime/tests/runtime-api/direct-20260918-025049-046000/`。

### Bundle / 真实入口 / 视觉资格

- `./scripts/build_macos_app.sh` 已成功；`codesign --verify --deep --strict dist/OpenDesk.app` 通过。当前 Bundle 主程序 SHA-256 是 `e38c56b6c6ae4a6d681c2b1174a91240c599b2f4866ad49e62f4846ccf710f5d`，构建时间 `2026-09-18T08:02:25Z`。
- 文档规定的入口 `./dist/opendesk -app apps/opendesk -allow-recorder-capture -console-mode script` 已实际执行，但 `apps/opendesk/opendesk.app.json` 规定 `singleInstance: true`，请求被已运行的 `/Applications/OpenDesk.app` PID 49640 接管。`lsof` 证明该 PID 加载的是 `/Applications/OpenDesk.app/Contents/MacOS/opendesk`（inode `13200682`，46,949,904 bytes），不是新 Bundle 主程序（inode `13254622`，47,277,232 bytes）。
- 因此，**新版本已构建但尚未加载；Measurement 原生选窗、冻结路径和真实窗口截图均 NOT_RUN**。为保护现有用户实例，本轮没有结束 PID 49640，也没有改写 App ID 或关闭 single-instance 规约来伪造并行资格。macOS/Windows live qualification 均保留 `LOCAL_REQUIRED` / `NOT_RUN`。

## 8. Qualification rule

```text
source updated
≠ browser automated pass
≠ user visual confirmation
≠ macOS qualified
≠ Windows qualified
```

任何平台资格结果必须记录真实运行命令、当前 HEAD、目标系统、权限状态与可复查证据。没有目标系统证据时保持 `LOCAL_REQUIRED`。
