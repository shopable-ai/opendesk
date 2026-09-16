"""One-shot, reviewed baseline transaction. Never updates a Git ref.

Each replacement is fail-closed. A separate explicit GitHub ref update publishes
an inspected tree. This file is removed from the resulting product tree.
"""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path.cwd()
changed = set()

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / path).write_text(text, encoding='utf-8')
    changed.add(path)

def replace(text, old, new, count=1):
    found = text.count(old)
    if found != count:
        raise RuntimeError(f'Expected {count} matches, got {found}: {old[:130]!r}')
    return text.replace(old, new)

# The exact executable baseline reviewed in the web session. Never overwrite
# a concurrent edit and never derive the product contract from a test fixture.
p = 'apps/opendesk/prototypes/desktop-measurement/interaction-core.js'
s = read(p)
raw = s.encode()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest() == 'fcb7c37ed8ac6fe6fc3f98f2dab3e0ecd4583870'
rr = """    } else if (E.regionPair.length === 2) {
      const result = M.rectangles(E.regionPair[0], E.regionPair[1]);
      $('hud-size').textContent = `两区域　H gap ${fmt(result.horizontalGap)} · V gap ${fmt(result.verticalGap)}`;
      $('margin-table').innerHTML = '';
      $('hud-meta').textContent = `overlap ${fmt(result.overlapArea)} · center Δ ${fmt(result.centerDelta.x)} / ${fmt(result.centerDelta.y)}`;
"""
s = replace(s, rr, '')
s = replace(s, "    const target = targetBounds();\n    if (target) {\n      $('hud-size')", "    const target = targetBounds();\n    // Completed pair relation must precede the generic last-region Target HUD.\n    if (E.mode === 'rr' && E.regionPair.length === 2) {\n" + rr.split('{\n', 1)[1] + "    } else if (target) {\n      $('hud-size')")
for old, new in [
    ("percentage: 'ratio-0-1'", "percentage: 'percentage-0-100'"),
    ("  function setMode(mode) {\n    if (!['point'", "  function setMode(mode) {\n    if (!E.active || E.adjusting) return;\n    invalidateAsync();\n    if (!['point'"),
    ("    if (!E.candidate) return false;", "    if (!E.active || E.adjusting || !E.candidate || E.alt || !E.magnet) return false;"),
    ("  function renderButtons() {\n", "  function renderButtons() {\n    const measuring = E.active && !E.adjusting;\n    $('tools').querySelectorAll('button').forEach(button => { button.disabled = !measuring; });\n"),
    ("    $('margin-toggle').disabled = !E.localReference;", "    $('margin-toggle').disabled = !measuring || !E.localReference;"),
    ("  function render() {\n", "  function render() {\n    const measuring = E.active && !E.adjusting;\n    // SVGElement does not reflect the HTML hidden property; set the attribute.\n    for (const id of ['scene', 'overlay', 'tools', 'status']) $(id).toggleAttribute('hidden', !measuring);\n    if (!measuring) $('toast').hidden = true;\n"),
    ("    E.source = source || 'manual'; E.inspectorOpen = false; E.magnet = true; E.marginView = 'window';", "    E.source = source || 'manual'; E.inspectorOpen = false; E.magnet = true; E.marginView = 'window';\n    E.alt = false; // Temporary modifiers never cross a new-session boundary."),
    ("    E.phase = 'ADJUSTING'; E.adjusting = true; E.inspectorOpen = false; E.pointer = null;", "    E.phase = 'ADJUSTING'; E.adjusting = true; E.inspectorOpen = false; E.pointer = null;\n    E.alt = false; E.dragStart = null; E.dragCurrent = null; // Input ownership is released."),
    ("    E.phase = 'IDLE'; E.active = false; E.adjusting = false; E.snapshotId = null; E.pointer = null;", "    E.phase = 'IDLE'; E.active = false; E.adjusting = false; E.snapshotId = null; E.pointer = null;\n    E.alt = false; E.status = ''; E.lastCopy = null; E.layer = 0;\n    clearTimeout(toastTimer); toastTimer = null; $('toast').hidden = true;\n    $('status').textContent = ''; $('json-info').textContent = '';\n    analysisCanvas = null; analysisPixels = null;"),
    ("    if (!E.active || E.adjusting || !sameToken(candidateToken, token())) return false;", "    if (!E.active || E.adjusting || E.alt || !E.magnet || E.target || !sameToken(candidateToken, token())) return false;"),
    ("() => { E.magnet = !E.magnet;", "() => { if (!E.active || E.adjusting) return; E.magnet = !E.magnet;"),
    ("() => { if (!E.localReference) return;", "() => { if (!E.active || E.adjusting || !E.localReference) return;"),
    ("() => { E.inspectorOpen = true; render(); }", "() => { if (!E.active || E.adjusting) return; E.inspectorOpen = true; render(); }"),
    ("  $('copy-json').addEventListener('click', async () => {\n    const value", "  $('copy-json').addEventListener('click', async () => {\n    if (!E.active || E.adjusting || !E.inspectorOpen) return;\n    const copyToken = clone(token());\n    const stillCurrent = () => E.active && !E.adjusting && sameToken(copyToken, token());\n    const value"),
    ("      await navigator.clipboard.writeText(value); E.lastCopy", "      await navigator.clipboard.writeText(value);\n      if (!stillCurrent()) return;\n      E.lastCopy"),
    ("    } catch (error) {\n      E.lastCopy", "    } catch (error) {\n      if (!stillCurrent()) return;\n      E.lastCopy"),
    ("    if (event.key === 'Alt' && E.active && !E.adjusting) { E.alt = false; scheduleResolve(); render(); }", "    if (event.key === 'Alt') {\n      E.alt = false;\n      if (E.active && !E.adjusting) { scheduleResolve(); render(); }\n    }"),
]:
    s = replace(s, old, new)
write(p, s)

# Preserve all reviewed Oracle requirement IDs and the bidirectional matrix.
p = 'apps/opendesk/prototypes/desktop-measurement/ORACLE.md'
s = read(p)
s = replace(s, '> **ORACLE STATUS: NOT YET FROZEN**', '> **ORACLE STATUS: FROZEN**')
s = replace(s, '> The HTML → Oracle conversion is now traceable and substantially complete, but the executable prototype still contains four product-significant internal conflicts listed in §20. Those conflicts must be resolved in the prototype before this Oracle can be frozen for Production Gap Closure.', '> Frozen baseline: 2026-09-16. All four §20 blockers have executable fixes and browser regressions. Source hashes and run results belong to qualification evidence; this status does not assert native OS qualification.')
s = replace(s, '> **Authority:**', '> **Authority:** Explicit user requirements and subsequent corrections take precedence. Within the UI/Interaction behavior actually defined by the executable prototype,')
s = replace(s, '## 0. Scope, evidence boundary, and source hierarchy', '## 0. Scope, evidence boundary, and source hierarchy\n\n`NOT_SUPPORTED_BY_HTML` means no HTML-defined behavior, not a product-wide prohibition. Independently justified Native invariants and Product Extensions are listed in the architecture document. They cannot override this frozen core or be inferred solely from existing Production code. Harness controls are not Production controls.')
rows = {
    'DM-VIS-015': '| DM-VIS-015 | HUD priority: completed RR relation → generic Target/latest incomplete RR region → Point → completed PP → no-result snapshot meta. | completed RR shows H/V gaps, overlap and center delta. | `renderHUD()` |',
    'DM-VIS-016': '| DM-VIS-016 | Completed RR summary is reachable before generic Target. Its margin table is empty; structured spacing and overlay relation remain available. | `HTML-CONFLICT-001` RESOLVED. | `renderHUD()`, browser RR summary regression |',
    'DM-TOOL-015': '| DM-TOOL-015 | Two completed RR regions expose H/V gaps, overlap area and signed center delta in normal Corner HUD as well as full structured relation evidence. | `HTML-CONFLICT-001` RESOLVED. | RR branch, `M.rectangles()`, `renderHUD()` |',
}
for key, row in rows.items():
    s, n = re.subn(r'^\| '+re.escape(key)+r' \|.*$', lambda _: row, s, flags=re.M)
    assert n == 1, (key, n)
s = s.replace('current two-region HUD branch is conflicted/unreachable', 'completed two-region HUD branch is now reachable')
s = s.replace('**conflicted edge case; see HTML-CONFLICT-004**', 'reset OFF on Exit and begin; keyup also clears while inactive')
s = s.replace('key handling inactive during Adjust | unchanged | reset OFF', 'reset OFF entering Adjust | unchanged | reset OFF')
s = s.replace('HTML_INTERNAL_CONFLICT |', 'RESOLVED · PASS_AUTOMATED |')
s = s.replace('PASS except conflicts listed in §20', 'PASS_AUTOMATED; §20 conflicts resolved')
s = s.replace('PASS except Alt conflict', 'PASS_AUTOMATED; Alt boundary regression')
s = s.replace('**HUD summary BLOCKED by HTML-CONFLICT-001**', '**HUD shows H/V gap, overlap area and signed center delta**')
s = s.replace('**final Toolbar/status visibility BLOCKED by HTML-CONFLICT-003**', '**all Measurement chrome and the SVG input plane are hidden; controls cannot mutate IDLE**')
s = s.replace('**BLOCKED by HTML-CONFLICT-002**', '**percentage = 100 × relative/reference; metadata `percentage-0-100`; true ratio fields unchanged**')
s = s.replace('**BLOCKED by HTML-CONFLICT-004**', '**hold Alt → Exit → release Alt → new session starts Alt OFF, Magnet ON, selected tool retained**')
s = s.replace('These scenarios are the minimum future frozen-Oracle parity suite. Items marked BLOCKED depend on §20.', 'These scenarios are the minimum frozen-Oracle parity suite. All former §20 blockers are resolved in executable sources and covered by the browser regression.')
start = s.index('## 20. HTML internal conflict register')
end = s.index('## 21.', start)
s = s[:start] + '''## 20. Resolved HTML internal conflict register

| ID | Former contradiction | Executable resolution | Regression evidence | State |
|---|---|---|---|---|
| HTML-CONFLICT-001 | RR metrics existed but generic Target HUD intercepted them. | `renderHUD()` checks completed RR before generic Target. Displays H/V gaps, overlap, signed center delta; no duplicated margin table. | browser RR relation summary + structured spacing + overlay line | RESOLVED |
| HTML-CONFLICT-002 | Arithmetic was percentage while metadata declared ratio. | `coordinateSpace.percentage = percentage-0-100`; `model.js` unchanged. Values outside a reference can remain negative or exceed 100; no clamping. `areaRatio`, `coverageRatio`, `insideRatio` remain ratios. | 25/50 percent and 0.25/1 ratio numerical checks | RESOLVED |
| HTML-CONFLICT-003 | IDLE left Toolbar/status and SVG interaction chrome. | `render()` sets actual `hidden` attributes on scene/SVG/tools/status, disables toolbar controls, hides toast; handlers reject inactive/adjusting actions. Exit clears data and transient copy/toast state. | Exit visibility + DOM-dispatched inactive action regression | RESOLVED |
| HTML-CONFLICT-004 | Alt could survive Exit/new session or a lost release in Adjust. | Exit/begin/Adjust clear temporary Alt; keyup clears regardless of active phase; new session resets Magnet ON and retains selected tool. | held Alt → Exit/release/re-entry; Adjust/Continue | RESOLVED |

No known freeze blocker remains in this register. Native host behavior is tested separately, never inferred from this browser result.

''' + s[end:]
start = s.index('## 21.')
end = s.index('## 22.', start)
s = s[:start] + '''## 21. Freeze corrections and preserved boundaries

The earlier audit correctly found four prototype contradictions. This freeze resolves them in executable code first, then updates the requirement rows, persistence matrix, traceability and scenarios. It does not introduce Region resize handles, Arrow nudge, intermediate Esc cancellation, a new toolbar control, saved-image history or fixture UI in Production.

Details is **open**, while I is **toggle**. Inspector shows current Snapshot/mapping/reference/pointer/candidate evidence even without a Result. Structured copy remains available in that state; stale asynchronous clipboard completion cannot reopen toast after Exit or publish feedback for a different Snapshot.

Temporary Alt and a drag in progress are cleared on releasing Measurement input ownership into Adjust. Update still preserves pointer, tool, persistent Magnet and Inspector-open state. Session boundaries reset temporary input but retain the selected tool.

''' + s[end:]
s = re.sub(r'^.*(?:metadata.*(?:contradict|conflict)|(?:contradict|conflict).*metadata).*$', lambda m: 'Percentage metadata now agrees with the existing 100 × relative/reference arithmetic; see resolved HTML-CONFLICT-002.' if not m.group(0).startswith('|') else m.group(0), s, flags=re.M)
s = s.replace("`'ratio-0-1'`", "`'percentage-0-100'`")
start = s.index('## 24.')
s = s[:start] + '''## 24. Change discipline

1. Explicit user corrections → executable Prototype → this FROZEN Oracle → architecture Native/Framework invariants and separately justified Product Extensions → Production → tests/qualification.
2. Preserve requirement IDs. Every important core claim must trace to executable HTML/CSS/JS. Tests are witnesses, not a new requirement source.
3. Production-only capabilities require an explicit architecture/user basis; they never amend this Oracle retroactively.
4. A future actual prototype contradiction must reopen its specific blocker and be resolved before asserting a new freeze. Do not preserve a false freeze status.
5. Current state: **ORACLE STATUS: FROZEN**. §20 has four RESOLVED rows; Production Gap Closure is unblocked. Browser evidence is synthetic, not macOS/Windows PASS.
'''
write(p, s)

# Minimal deterministic Production corrections. Large native files are patched
# in place, not regenerated from a prototype fixture.
p = 'pkg/measurement/surface_product.go'; s = read(p)
s = replace(s, 'tool: "point"', 'tool: "region"')
s = replace(s, '区域：拖拽创建；点击区域本体或八向控制点可编辑。', '区域：单击锁定候选，或拖拽至少 5×5 logical px 创建区域；再次拖拽开始新的测量。')
s = replace(s, 'Esc 分层退出', 'Esc 先关闭详情，否则退出测量')
s = s.replace('a.selectedResult()', 'a.inspectorEvidence()')
s = replace(s, '<button id="copyStructured"` + disabled + `>', '<button id="copyStructured">')
write(p, s)
p = 'pkg/measurement/session.go'; s = read(p)
s = replace(s, 'case "inspectorButton":\n\t\ta.inspectorOpen = !a.inspectorOpen', 'case "inspectorButton":\n\t\ta.inspectorOpen = true')
s = replace(s, '{"measurementInspectorResult", customui.ControlPatch{Text: stringPtr(a.selectedResult())}}', '{"measurementInspectorResult", customui.ControlPatch{Text: stringPtr(a.inspectorEvidence())}}')
s = replace(s, '{"copyStructured", customui.ControlPatch{Disabled: boolPtr(a.result == nil)}}', '{"copyStructured", customui.ControlPatch{Disabled: boolPtr(false)}}')
s = replace(s, 'case "copyStructured":\n\t\treturn a.copyFormat(ctx, "json")', 'case "copyStructured":\n\t\treturn a.copyEvidence(ctx)')
s = replace(s, '\t\ta.snapSuspended = false\n\t\ta.pointer = nil\n\t\ta.stateMu.Lock()', '\t\ta.snapSuspended = false\n\t\ta.pointer = nil\n\t\ta.result = nil\n\t\ta.dragStart = nil\n\t\ta.twoPointFirst = nil\n\t\ta.spacingFirst = nil\n\t\ta.stateMu.Lock()')
s = replace(s, 'if selection.Width <= 0 || selection.Height <= 0 {\n\t\t\ta.status = "两区域测距', 'if selection.Width < 5 || selection.Height < 5 {\n\t\t\ta.status = "两区域测距')
s = replace(s, '两区域测距需要分别拖拽两个正宽高区域。', '两区域测距需要分别拖拽两个至少 5×5 logical px 的区域。')
write(p, s)
p = 'pkg/measurement/oracle_alignment.go'; s = read(p)
s = s.replace('import "os"', 'import (\n "os"\n "encoding/json"\n "context"\n)')
if '"encoding/json"' not in s:
    s = replace(s, 'import (', 'import (\n "encoding/json"\n "context"')
assert '"encoding/json"' in s
s += '''
func (a *activeSession) copyEvidence(ctx context.Context) error {
 if err := a.service.clipboard.Copy(a.inspectorEvidence()); err != nil { return a.updateStatus(ctx, "复制失败："+err.Error()) }; a.copyMenuOpen = false; a.status = "已复制当前 Measurement Evidence。"; return a.renderSurface(ctx)
}

// inspectorEvidence is a view of existing canonical models, not another
// Geometry engine or another outputFormat. It remains useful before Result.
func (a *activeSession) inspectorEvidence() string {
	view := map[string]any{
		"schemaVersion": "desktop-measurement-session/v1",
		"phase": a.phaseValue(), "snapshot": a.snapshotToken(),
		"captureMapping": a.frame.Snapshot.Mapping,
		"windowReference": a.frame.Reference, "localReference": nil,
		"pointer": nil, "candidateStack": a.service.SnapshotCandidates(),
		"result": a.result,
		"runtimeEvidence": map[string]bool{"absoluteGeometryIsRuntimeEvidenceOnly": true, "sourcePixelsAreFrozenSnapshotOnly": true},
	}
	if hasLocalReference(a) { view["localReference"] = a.reference }
	if a.pointer != nil {
		point, err := BuildPointResult(a.frame.Snapshot, a.frame.Reference, *a.pointer, a.image)
		if err == nil { view["pointer"] = point.Point }
	}
	encoded, err := json.MarshalIndent(view, "", "  ")
	if err != nil { return "Measurement Evidence unavailable: " + err.Error() }
	return string(encoded)
}
'''
write(p, s)
# Correct a source-confirmed mutex lifecycle defect without replacing a locked mutex.
p = 'pkg/measurement/candidate_stack.go'; s = read(p)
s = replace(s, '\td.state = snapshotCandidateRuntime{epoch: d.state.epoch, request: d.state.request, magnet: true}', '\td.state.token = SnapshotToken{}\n\td.state.candidates = nil\n\td.state.failures = nil\n\td.state.index = 0\n\td.state.magnet = true\n\td.state.suspended = false\n\td.state.preview = ""')
s = replace(s, '\tif inspector != "" {\n\t\t_, _ = w.UpdateControl(ctx, "measurementInspectorResult", customui.ControlPatch{Text: &inspector})\n\t}', '\tif a.inspectorOpen {\n\t\tcomplete := a.inspectorEvidence()\n\t\t_, _ = w.UpdateControl(ctx, "measurementInspectorResult", customui.ControlPatch{Text: &complete})\n\t}')
write(p, s)

p = 'docs/architecture/desktop-automation/desktop-measurement.md'; s = read(p)
s = replace(s, '`Tab / Alt / 1–4 / I / Esc / Arrow` 会话按键语义', '`Tab / Shift+Tab / Alt / Option / 1–4 / I / Esc` 会话按键语义')
s += '''

## 20. Frozen core、Native invariant 与 Product Extension（2026-09-16）

权威顺序：明确用户需求/后续纠正 → 可执行 Prototype → FROZEN ORACLE → 本文 Native/Framework 合同及明确扩展 → Production → Tests/Qualification。

| 层 | 合同 | 依据与边界 |
|---|---|---|
| Frozen HTML Oracle | 十个主 Toolbar 控件、四个工具、Magnet、Margin、Update、Adjust/Continue、Inspector、HUD、Esc、Session/Snapshot | `ORACLE.md` 与可执行 HTML/CSS/JS；不能从旧生产代码或测试反推 |
| Native / Framework invariant | 干净 capture、真实窗口身份、同一 owner/surface、token 校验、坐标映射、资源释放、Recorder 输入隔离 | 本文 §2–4、§12–15、§19；harness 不是实现 |
| EXT-TARGET | Inspector 显式选择/确认真实目标窗口 | 本文原有 §2、§7.1；不得劫持 Tab、冒充 UI Candidate 或强制复制 HTML 模拟窗口选择器 |
| EXT-LOCAL | Inspector 人工局部参照 | 本文原有 §5、§8；最多一个 Local；用户显式选择，不能成为默认第三层或添加 Esc 层级 |
| EXT-OUTPUT | 简明/中文/结构化编码、选择保存格式、保存正式结果、Authoring handoff | 本文原有 §1、§5、§12–13；低频操作留在 Inspector；完整 Evidence 视图和核心结构化复制不依赖 Result/outputFormat |
| 未批准 | 把旧 Region resize/nudge 或多级 Esc 带回产品 | 无当前需求依据；不是 Product Extension |

`NOT_SUPPORTED_BY_HTML` 不等于产品禁止；`Production 已实现` 也不等于需求已确认。本轮上述扩展已有正式架构依据，无需本地 Codex 重新作产品裁决。

冻结交互补充：首次默认 Region；同一 Service 内退出后保留工具；新 Session 将 Magnet 重置 ON、Alt 重置 OFF。Region 有效重拖产生新的 Target，不是 body/handle 编辑；Arrow 不修改测量。详情按钮是 open，I 是 toggle；Esc 有且仅有“Inspector 开则关闭，否则退出”。Update 保留工具、Magnet、pointer、Inspector-open，清理旧结果/候选/Local/drag；Adjust 释放输入并清理 pointer/Inspector/Alt/drag，Continue 重新冻结同一个 Session。

Micro HUD 必须跟随 pointer 并在边缘翻转，不能以四角 class 替代。Corner HUD、status、Toolbar、Inspector 是不同信息层。生产 Result 中明确命名的 ratio 字段保留 0–1 约定；不得因为 HTML percentage 修正而破坏既有 ratio API。
'''
write(p, s)

p = 'docs/quality/desktop-measurement-qualification.md'
write(p, '''# Desktop Measurement Qualification Matrix

> FROZEN HTML Oracle 是交互合同；自动化执行记录是仓库证明；真实 macOS/Windows 运行证据是平台资格。源码存在不等于测试已运行，更不等于真机 PASS。

## 状态与证据

`PASS_STATIC` = 已完成源码核对；`PASS_AUTOMATED` = 有本次对应源码运行记录；`LOCAL_REQUIRED` = 需要真实主机验证；`NOT_RUN` = 没有执行证据；`FAIL` = 执行已证明失败。旧 `COVERED_CONTRACT`/`automated code present` 只说明有代码，不能解释为 PASS。

平台事实只记录到 `tests/desktop-measurement/qualification-manifest.json`；本轮不得把其 macOS/Windows case 改为 PASS。浏览器合成测试、MemoryDriver 和 hosted CI 不代替用户实际加载的 Mac 产物。

## 当前产品合同

| 合同 | 仓库验证入口 | 真机要求 |
|---|---|---|
| Toolbar 十项、默认 Region、工具 active、tooltip、底部浮动层级 | browser.test.py / session layout tests | 实窗截图对照 Oracle |
| Point / 原始冻结像素 / 三层坐标 | model + session + browser | capture、AX、实际指针、Retina |
| Region candidate click / 有效重拖产生新 Target | candidate + session + browser | 真实候选、反向拖拽；不是 body/八向编辑 |
| Point↔Point / 第三点开启新组 | model + session + browser | 物理鼠标输入 |
| Region↔Region / ≥5×5 / relation summary | model + session + browser | H/V gap、overlap、center delta 与画面对照 |
| percentage 0–100 convention / true ratio 不变 | browser numerical regression / geometry | 不允许由本地重新决定语义 |
| Tab/Shift+Tab 只循环同一 Snapshot 候选 | candidate tests / browser | 不换目标窗口、不 capture、不改 token |
| Magnet 默认 ON / Alt 暂停和边界清理 | session + browser + host contracts | Option keydown/up、Exit/re-entry、失去焦点 |
| 1/2/3/4、I toggle、Details open | session + browser + host contracts | 所有 Native 按键通道一致；不能双触发 |
| Esc：Inspector 开则关闭，否则退出 Measurement | session + browser | 不增加局部编辑、参照、copy menu 的 Esc 层级 |
| Inspector 无 Result 仍含 Snapshot/mapping/reference/pointer/candidate | session evidence + browser | 打开实际面板，切换 outputFormat 不删除核心证据 |
| 核心结构化复制 / 扩展编码与保存 | clipboard fake + structured tests | 系统剪切板/文件与可见 Evidence 一致 |
| Update 保留工具/Magnet/pointer/Inspector，清理 Snapshot 派生状态 | lifecycle + browser | 隐藏→干净 capture→原 Surface patch→显示 |
| Adjust/Continue | lifecycle + browser | 真实桌面可操作、Continue/三入口同一 Session、新 Snapshot |
| Exit 清理全部 chrome、输入、Alt、候选与 token | lifecycle + browser | 单实例、窗口/监听资源归零、可重新进入 |
| Micro HUD 跟随 pointer 并翻转 | host bridge/position contract | 必须真实移动鼠标截图；四角选择不算通过 |
| Corner HUD/status/Toolbar/Inspector 独立层级 | CSS/HTML inventory | 文案不遮挡、点击不穿透、默认显隐一致 |
| Recorder / 菜单 / 全局快捷键 | integration + shortcut single source | 三入口复用，录制暂停且测量输入不进入业务录制 |
| Evidence / Authoring / Qualification / Repair | 现有相关 package tests | 真实任务；execution 与 business verification 双门槛 |

Region resize handle 与 Arrow nudge 的旧正向验收已废弃；仅保留“不得进入当前产品合同”的负向回归。数学编辑 helper 的独立测试不是 Region 产品行为依据。

## Native / Framework 不变量

一个 owner、一个 Session、稳定 Surface；普通状态变更不 Create。清理幂等；失败可恢复；旧 token/异步候选不能覆盖新 Snapshot；窗口列表不是 Candidate Stack；视觉候选不冒充语义；capture 不包含自身 UI；pointermove 有界而 pointerup 不丢失。任何 Source/Hide/SetBounds/Show 失败均须保留可追溯失败证据，不能标为成功。

## LOCAL REQUIRED

真实构建 Runtime、host 和 App package；源码/资源/二进制/PID/加载路径 provenance；确认旧进程和单实例；受控重启；实窗截图；Toolbar 视觉；micro 跟随与翻转；全部鼠标/键盘；Update、Adjust/Continue、Exit；Recorder 与全局快捷键；macOS Accessibility/capture/clipboard/签名；DPI、多屏、负坐标；完整 macOS qualification。Windows 需独立真机 qualification，Mac 上不能代签。

物理矩阵保留 macOS 1×/Retina 2×/多屏和 Windows 1×/1.25×/1.5×/2×/混合 DPI/负坐标。硬件缺失记录 LOCAL_REQUIRED/NOT_RUN 与具体原因，不能编造 PASS。每条真实 evidence 包含实际 SHA、构建和 host hash、时间、平台、操作、期望/实际、截图/日志路径。
''')
p = 'tests/desktop-measurement/qualification-manifest.json'
manifest = json.loads(read(p))
assert all(c['status'] == 'NOT_RUN' and c['evidence'] == [] for c in manifest['cases'])
manifest['contract'] = {'oracle': 'apps/opendesk/prototypes/desktop-measurement/ORACLE.md', 'status': 'FROZEN', 'date': '2026-09-16', 'nativeEvidencePolicy': 'Repository changes, synthetic browser tests and hosted CI do not qualify the user runtime.'}
manifest['requiredInteractions'] = ['toolbar-inventory', 'point', 'region-new-measurement-no-resize', 'two-point', 'two-region-summary', 'candidate-tab-same-snapshot', 'alt-boundary-reset', 'details-open-i-toggle', 'esc-inspector-else-exit', 'inspector-evidence-without-result', 'pointer-following-micro-hud', 'update-persistence-cleanup', 'adjust-continue', 'exit-cleanup', 'recorder-entry-isolation', 'global-shortcut', 'native-capture-clipboard', 'binary-host-resource-provenance']
write(p, json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')

write('tests/desktop-measurement/browser.test.py', read('.github/scripts/measurement-browser.test.py'))
Path('.runtime/measurement-web-transaction').mkdir(parents=True, exist_ok=True)
Path('.runtime/measurement-web-transaction/changed.json').write_text(json.dumps(sorted(changed), indent=2))
print(json.dumps({'changed': sorted(changed), 'scope': 'Source transaction only; no native qualification'}))
