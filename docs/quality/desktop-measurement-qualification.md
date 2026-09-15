# Desktop Measurement Qualification Matrix

> Prototype 是 UI/Interaction Oracle；Native tests 是 Production proof；OS qualification 是真实发布证据。三层不能互相冒充 PASS。

## 状态定义

- `PASS_AUTOMATED`：当前仓库自动测试可直接证明。
- `COVERED_CONTRACT`：生产代码和 contract test 已存在，但仍需真实 OS 资格验证。
- `PARTIAL_GUARD`：已经阻止错误行为，但完整能力还缺真实 provider / integration。
- `NOT_RUN`：当前环境没有真实执行证据。
- `FAIL`：真实或自动测试已确认失败。

真实平台状态以 [`tests/desktop-measurement/qualification-manifest.json`](../../tests/desktop-measurement/qualification-manifest.json) 为准。

UI / Interaction 出现描述差异时，以 [`apps/opendesk/prototypes/desktop-measurement/`](../../apps/opendesk/prototypes/desktop-measurement/) 当前 Oracle 为准；历史 P0–P4 prompt / implementation 描述不再具有产品合同优先级。

## Prototype → Native → OS

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
| R is not a session shortcut | session + host contract tests | physical keyboard | automated guard present |
| System Cmd/Ctrl+C not hijacked | session + Windows host contract | native clipboard / normal host behavior | automated guard present |
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

### Candidate qualification boundary

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
