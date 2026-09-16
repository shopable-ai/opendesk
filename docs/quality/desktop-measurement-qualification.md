# Desktop Measurement Qualification Matrix

> FROZEN HTML Oracle 是交互合同；自动化执行记录是仓库证明；真实 macOS/Windows 运行证据是平台资格。源码存在不等于测试已运行，更不等于真机 PASS。

## 状态与证据

`PASS_STATIC` = 已完成源码核对；`PASS_AUTOMATED` = 有本次对应源码运行记录；`LOCAL_REQUIRED` = 需要真实主机验证；`NOT_RUN` = 没有执行证据；`FAIL` = 已执行且失败。浏览器合成测试、MemoryDriver 与 hosted CI 不代替用户实际加载的 Mac/Windows 产物。

## 当前产品合同

| 合同 | 仓库验证 | 真机要求 |
|---|---|---|
| Toolbar 十项、默认 Region、active/disabled/tooltip/层级 | browser + layout tests | 实窗截图对照 Oracle |
| Point / Frozen Source Pixel / 三级坐标 | model + session + browser | capture、实际 pointer、Retina |
| Region candidate click / 有效重拖新 Target | candidate + session + browser | 真实候选；不是 body/八向编辑 |
| Point↔Point / 第三点新组 | model + browser | 物理鼠标 |
| Region↔Region ≥5×5 / relation summary | model + session + browser | H/V gap、overlap、center delta 对照 |
| percentage 0–100；真正 ratio 不变 | browser numerical regression | 本地不得重新裁决语义 |
| Tab/Shift+Tab 仅当前 Snapshot Candidate | candidate tests | 不换目标窗口、不 capture、不改 token |
| Magnet ON / Alt 临时暂停和边界清理 | session + browser + host contract | Option down/up、Exit/re-entry、blur |
| 1/2/3/4、I toggle、Details open | session + browser + host contract | Native 输入不能双触发 |
| Esc：Inspector open 则关闭，否则退出 | session + browser | 不增加局部编辑/copy menu Esc 层级 |
| Inspector 无 Result 仍含 Snapshot/mapping/reference/pointer/candidate | evidence + browser | 实际面板与复制 |
| Update persistence/cleanup | lifecycle + browser | hide→clean capture→patch→show |
| Adjust/Continue | lifecycle + browser | 真实桌面可操作、同 Session、新 Snapshot |
| Exit cleanup | lifecycle + browser | 窗口/监听/候选/token 清理，可重入 |
| Micro HUD pointer-follow + edge flip | host bridge static contract | 必须真实移动鼠标截图；四角 fallback 不算通过 |
| Recorder / 菜单 / 全局快捷键 | integration + shortcut single source | 三入口复用，Recorder 输入隔离 |
| Product Extensions | structured/save/authoring tests | 输出/剪切板/文件和可见 Evidence 一致 |

Region resize handles 与 Arrow nudge 的旧正向验收已废弃，只保留“不得重新进入当前产品合同”的负向防漂移。

## LOCAL REQUIRED

### Coverage inventory
| Product behavior | Native automated proof | OS qualification | Current status |
| --- | --- | --- | --- |
| Point / frozen pixel | `model_test.go`, `session_test.go`, `structured_test.go` | macOS + Windows real capture/color | automated code present |
| Region | `model_test.go`, `session_test.go` | real pointer drag | automated code present |
| Two Point | `model_test.go`, `session_test.go` | real pointer input | automated code present |
| Two Region / spacing | `model_test.go`, `session_test.go` | real pointer input | automated code present |
| Stable single surface | `TestServiceReentryUsesSameSessionSnapshotAndSurface`, `TestRefreshMutatesSameSurfaceAndMovesBounds` | native window identity observation | automated code present |
| Update picture → new Snapshot | session product tests | clean recapture excluding overlay | automated code present |
| ADJUSTING → refreeze same Session | `TestAdjustingHidesSurfaceAndUnifiedEntryRefreezesSameSession` | real desktop interaction / focus restore | automated code present |
| Reference invariant | session reference tests + provenance tests | foreground / Recorder-bound target | automated code present |
| Region body drag | `session_interaction_test.go`, `interaction_test.go` | real drag latency | automated code present |
| N/NE/E/SE/S/SW/W/NW | `interaction_test.go`, overlay renderer | real handle hit testing | automated code present |
| Arrow = 1 / Shift = 10 | session tests | native key routing | automated code present |
| Tab never treats TargetWindow as UI Candidate | `TestTabDoesNotTreatTargetWindowsAsSnapshotCandidates` | real candidate stack | `PARTIAL_GUARD` |
| Tab / Shift+Tab cycles real Snapshot UI Candidate Stack | Prototype browser Oracle | real AX/UIA/Perception candidate list | Native provider integration pending |
| Magnet on/off + Alt/Option temporary suspend | session interaction + host parity | physical key down/up | covered contract |
| 1/2/3/4 | session + host parity | physical keyboard | covered contract |
| I / Inspector | session state + host parity | physical keyboard/focus | covered contract |
| R is not a session shortcut | session + macOS/Windows host contract tests | physical keyboard | PASS_AUTOMATED; OS NOT_RUN |
| System Cmd/Ctrl+C not hijacked | session + macOS/Windows host contract tests | native clipboard / normal host behavior | PASS_AUTOMATED; OS NOT_RUN |
| Esc: Inspector → local edit → session | session interaction tests | real Inspector/edit | automated code present |
| Structured export from Inspector | structured schema + Inspector copy test | system clipboard | automated code present |
| Backend concise/human/structured output encoding | structured output tests | not a separate UI contract | automated code present |
| duplicate entry | stable surface test | menu + Recorder + shortcut duplicate open | automated code present |
| cleanup / re-entry | session close/OpenAndWait tests | native hooks and Recorder restore | automated code present |
| HUD 4-corner avoidance | `interaction_test.go`, layout test | visual overlap review | automated code present |
| Micro edge flip | `interaction_test.go` | physical display edge | automated code present |
| reverse drag / negative coords | `RectFromPoints`, model + DPI tests | physical display | automated code present |
| 1.0 / 1.25 / 1.5 / 2.0 DPI | `capture_mapping_matrix_test.go` | Windows physical DPI | automated math present |
| left / upper negative origin | DPI matrix | physical multi-display | automated math present |
| desktop hole | DPI matrix | physical topology | automated math present |
| macOS key bridge | `measurement_host_contract_test.go` | native AppKit | covered contract |
| Windows key bridge | `measurement_host_contract_test.go` | WebView2/Win32 | covered contract |
| MeasurementEvidence serialization/reload | `evidence_test.go`, `provenance_test.go` | real artifact | automated code present |
| Recorder attachment | `pkg/recorder/measurement_evidence_test.go` | real recording session | automated code present |
| Human-to-Recipe handoff | `authoring_test.go` | real demonstration package | automated code present |
| Agent-to-Recipe input | `authoring_test.go` | real Agent authoring task | automated code present |
| Qualification consumption | `qualification_test.go` | real target drift | automated code present |
| Repair classification | `repair_test.go` | real failure telemetry | automated code present |
| Repair double gate | `repair_test.go` | real retry + business verification | automated code present |
| Calculator repair workflow | `repair_workflow_test.go` | real Calculator failure/repair | automated fixture present |

真实构建 Runtime、UI host、App package；源码/资源/二进制/PID/加载路径 provenance；旧进程/单实例；controlled restart；实窗截图；Toolbar 视觉；Micro HUD 真正跟随/翻转；全部鼠标/键盘；Update；Adjust/Continue；Exit；Recorder entry；全局快捷键；macOS Accessibility/capture/clipboard/签名；DPI、多屏、负坐标；完整 macOS qualification。Windows 需独立真机 qualification，Mac 上不能代签。

每条真实 evidence 记录实际 SHA、build/host hash、时间、平台、操作、期望/实际、截图/日志路径。缺设备或权限就记录 `LOCAL_REQUIRED` / `NOT_RUN` 与原因，绝不能伪造 PASS。

### Candidate、platform、robustness notes

必须区分两个列表：

```text
CaptureFrame.Targets
= 可以显式重新选择的真实目标窗口

Snapshot UI Candidate Stack
= 当前冻结画面中由 AX / UIA / OCR / Perception / Image 等 provider 返回的目标层级
```

它们不能共用 Tab 语义。当前 Native 已经有防护：Tab 不再切换 `CaptureFrame.Targets`、不 recapture、不改变 snapshot token；但在真实 Candidate Provider 接入 Session 之前，不能写成“Native Tab Candidate Cycling 已完成”。

## Cross-platform physical matrix

Minimum local qualification:

```text
macOS
  100% logical/non-Retina where available
  Retina 200%
  multi-display
  negative origin arrangement

Windows
  100%
  125%
  150%
  200%
  mixed 100% + 150%
  negative-origin secondary display
```

Each run records platform、OS version、scale、display count、Accessibility/UIA、clipboard、global shortcut、Recorder entry、Measurement cases、artifacts/screenshots/logs 和 status。

No row moves from `NOT_RUN` to `PASS` without actual evidence.

### Current-bundle macOS attempt (2026-09-16)

The current worktree was rebuilt before this attempt.  The bundle executable
and `dist/opendesk` both had SHA-256
`6220e929c9897a04760be57011ef8bd341e9e70ec3c3c51e560a5473777b84d3`.
The actual status menu exposed `录制自动化` and
`开发者 → 桌面测量 · ⌘⇧M`; the menu-entry flow then produced a native
Measurement Surface screenshot.  Evidence is retained locally at:

```text
.runtime/tests/desktop-measurement/production-qualification/tray-menu.png
.runtime/tests/desktop-measurement/macos/43-current-bundle-developer-menu.png
```

The subsequent fresh-bundle shortcut/reopen attempt encountered the macOS
Screen Recording consent sheet for OpenDesk.  It also prevented reliable
external-window enumeration, so no macOS manifest case was changed from
`NOT_RUN`.  Consent, Calculator-targeted global-shortcut opening, Recorder
isolation, system clipboard behavior, Update/Adjust/Continue, and Exit/reopen
must be rerun in one qualified OS session after that prerequisite is satisfied.

Current automated run: all Measurement, CustomUI, Recorder, App Shell,
OpenDesk command, recorder-bundle, keyboard-bridge and model suites listed in
`tests/desktop-measurement/README.md` passed.  The prototype browser command
was not runnable in this environment because Python Playwright is absent
(`ModuleNotFoundError: playwright`); it is not treated as a qualification
pass or failure.

## Native robustness invariants

HTML Oracle 负责交互真相；Native 还必须额外证明：

```text
single Measurement owner / session
ordinary state changes do not recreate native surface
capture / SetBounds / Source patch failures do not leave half-updated state
refresh/refreeze rolls back or remains deterministically recoverable on failure
pointermove rendering is bounded and pointerup always commits final state
cleanup is idempotent
Measurement surface never becomes its own target or capture source
TargetWindow never masquerades as Snapshot UI Candidate
system copy chords are not hijacked by Measurement session routing
```

## Performance guard

Measurement must not perform `window.Create` on pointer move, tool switch, result update, Inspector or refresh. Overlay source is patched on the stable surface. Pointer move is coalesced / bounded and pointerup commits the final state.

Local acceptance should record pointer/drag responsiveness; functional correctness with unusable latency is not a product PASS.
