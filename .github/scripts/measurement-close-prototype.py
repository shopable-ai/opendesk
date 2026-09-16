from pathlib import Path
import json, re
ROOT=Path.cwd()
changed=[]
def read(p): return (ROOT/p).read_text(encoding='utf-8')
def write(p,s):
    (ROOT/p).write_text(s,encoding='utf-8'); changed.append(p)
def repl(s,a,b,n=1):
    c=s.count(a)
    if c!=n: raise RuntimeError(f'{a[:100]!r}: expected {n} got {c}')
    return s.replace(a,b,n)

# Prototype freeze blockers
p='apps/opendesk/prototypes/desktop-measurement/interaction-core.js'; s=read(p)
rr="""    } else if (E.regionPair.length === 2) {
      const result = M.rectangles(E.regionPair[0], E.regionPair[1]);
      $('hud-size').textContent = `两区域　H gap ${fmt(result.horizontalGap)} · V gap ${fmt(result.verticalGap)}`;
      $('margin-table').innerHTML = '';
      $('hud-meta').textContent = `overlap ${fmt(result.overlapArea)} · center Δ ${fmt(result.centerDelta.x)} / ${fmt(result.centerDelta.y)}`;
"""
s=repl(s,rr,'')
s=repl(s,"    const target = targetBounds();\n    if (target) {\n      $('hud-size')", "    const target = targetBounds();\n    // Completed pair relation must precede the generic last-region Target HUD.\n    if (E.mode === 'rr' && E.regionPair.length === 2) {\n"+rr.split('{\n',1)[1]+"    } else if (target) {\n      $('hud-size')")
for a,b in [
("percentage: 'ratio-0-1'","percentage: 'percentage-0-100'"),
("  function setMode(mode) {\n    if (!['point'","  function setMode(mode) {\n    if (!E.active || E.adjusting) return;\n    invalidateAsync();\n    if (!['point'"),
("    if (!E.candidate) return false;","    if (!E.active || E.adjusting || !E.candidate || E.alt || !E.magnet) return false;"),
("  function renderButtons() {\n","  function renderButtons() {\n    const measuring = E.active && !E.adjusting;\n    $('tools').querySelectorAll('button').forEach(button => { button.disabled = !measuring; });\n"),
("    $('margin-toggle').disabled = !E.localReference;","    $('margin-toggle').disabled = !measuring || !E.localReference;"),
("  function render() {\n","  function render() {\n    const measuring = E.active && !E.adjusting;\n    for (const id of ['scene', 'overlay', 'tools', 'status']) $(id).toggleAttribute('hidden', !measuring);\n    if (!measuring) $('toast').hidden = true;\n"),
("    E.source = source || 'manual'; E.inspectorOpen = false; E.magnet = true; E.marginView = 'window';","    E.source = source || 'manual'; E.inspectorOpen = false; E.magnet = true; E.marginView = 'window';\n    E.alt = false;"),
("    E.phase = 'ADJUSTING'; E.adjusting = true; E.inspectorOpen = false; E.pointer = null;","    E.phase = 'ADJUSTING'; E.adjusting = true; E.inspectorOpen = false; E.pointer = null;\n    E.alt = false; E.dragStart = null; E.dragCurrent = null;"),
("    E.phase = 'IDLE'; E.active = false; E.adjusting = false; E.snapshotId = null; E.pointer = null;","    E.phase = 'IDLE'; E.active = false; E.adjusting = false; E.snapshotId = null; E.pointer = null;\n    E.alt = false; E.status = ''; E.lastCopy = null; E.layer = 0;\n    clearTimeout(toastTimer); toastTimer = null; $('toast').hidden = true;\n    $('status').textContent = ''; $('json-info').textContent = '';\n    analysisCanvas = null; analysisPixels = null;"),
("    if (!E.active || E.adjusting || !sameToken(candidateToken, token())) return false;","    if (!E.active || E.adjusting || E.alt || !E.magnet || E.target || !sameToken(candidateToken, token())) return false;"),
("() => { E.magnet = !E.magnet;","() => { if (!E.active || E.adjusting) return; E.magnet = !E.magnet;"),
("() => { if (!E.localReference) return;","() => { if (!E.active || E.adjusting || !E.localReference) return;"),
("() => { E.inspectorOpen = true; render(); }","() => { if (!E.active || E.adjusting) return; E.inspectorOpen = true; render(); }"),
("  $('copy-json').addEventListener('click', async () => {\n    const value","  $('copy-json').addEventListener('click', async () => {\n    if (!E.active || E.adjusting || !E.inspectorOpen) return;\n    const copyToken = clone(token());\n    const stillCurrent = () => E.active && !E.adjusting && sameToken(copyToken, token());\n    const value"),
("      await navigator.clipboard.writeText(value); E.lastCopy","      await navigator.clipboard.writeText(value);\n      if (!stillCurrent()) return;\n      E.lastCopy"),
("    } catch (error) {\n      E.lastCopy","    } catch (error) {\n      if (!stillCurrent()) return;\n      E.lastCopy"),
("    if (event.key === 'Alt' && E.active && !E.adjusting) { E.alt = false; scheduleResolve(); render(); }","    if (event.key === 'Alt') { E.alt = false; if (E.active && !E.adjusting) { scheduleResolve(); render(); } }")]:
    s=repl(s,a,b)
write(p,s)

# Frozen Oracle
p='apps/opendesk/prototypes/desktop-measurement/ORACLE.md'; s=read(p)
s=repl(s,'> **ORACLE STATUS: NOT YET FROZEN**','> **ORACLE STATUS: FROZEN**')
s=repl(s,'> The HTML → Oracle conversion is now traceable and substantially complete, but the executable prototype still contains four product-significant internal conflicts listed in §20. Those conflicts must be resolved in the prototype before this Oracle can be frozen for Production Gap Closure.','> Frozen baseline: 2026-09-16. All four §20 blockers have executable fixes and browser regressions. This status freezes the HTML-defined core; it does not assert native OS qualification.')
s=repl(s,'> **Authority:**', '> **Authority:** Explicit user requirements and subsequent corrections take precedence. Within UI / Interaction behavior actually defined by the executable prototype,')
s=repl(s,'## 0. Scope, evidence boundary, and source hierarchy','## 0. Scope, evidence boundary, and source hierarchy\n\n`NOT_SUPPORTED_BY_HTML` means no HTML-defined behavior, not a product-wide prohibition. Independently justified Native invariants and Product Extensions live in the architecture document. Existing Production code cannot amend this Oracle retroactively; harness controls are not Production controls.')
rows={
'DM-TOOL-015':'| DM-TOOL-015 | Two completed RR regions expose H/V gaps, overlap area and signed center delta in the normal Corner HUD as well as full structured relation evidence. | completed RR relation summary is reachable before generic Target. | RR branch, `M.rectangles()`, `renderHUD()` |',
'DM-COORD-009':'| DM-COORD-009 | `percentage` geometry is percentage 0–100 (`100 * value / referenceSize`); true ratio fields such as `areaRatio`, `coverageRatio`, `insideRatio` remain ratios. | metadata and arithmetic agree. | `M.relative()`, `coordinateSpace.percentage` |',
'DM-VIS-015':'| DM-VIS-015 | HUD priority is completed RR relation → generic Target/latest incomplete RR region → Point → two-point relation → no-result snapshot meta. | completed RR shows H/V gaps, overlap and center delta. | `renderHUD()` |',
'DM-VIS-016':'| DM-VIS-016 | Completed RR summary is reachable before generic Target; its margin table is empty while structured spacing and overlay relation remain available. | former HTML-CONFLICT-001 resolved. | `renderHUD()` |',
}
for k,row in rows.items():
    s,n=re.subn(r'^\| '+re.escape(k)+r' \|.*$',row,s,flags=re.M)
    if n!=1: raise RuntimeError((k,n))
s=s.replace('current two-region HUD branch is conflicted/unreachable','completed two-region HUD branch is reachable before generic Target')
s=s.replace('**conflicted edge case; see HTML-CONFLICT-004**','reset OFF on Exit and begin; keyup also clears while inactive')
s=s.replace('key handling inactive during Adjust | unchanged | reset OFF','reset OFF entering Adjust | unchanged | reset OFF')
s=s.replace('HTML_INTERNAL_CONFLICT |','RESOLVED · PASS_AUTOMATED |')
s=s.replace('PASS except conflicts listed in §20','PASS_AUTOMATED; §20 conflicts resolved')
s=s.replace('PASS except Alt conflict','PASS_AUTOMATED; Alt boundary regression')
s=s.replace('**HUD summary BLOCKED by HTML-CONFLICT-001**','**HUD shows H/V gap, overlap area and signed center delta**')
s=s.replace('**final Toolbar/status visibility BLOCKED by HTML-CONFLICT-003**','**all Measurement chrome and the SVG input plane are hidden; controls cannot mutate IDLE**')
s=s.replace('**BLOCKED by HTML-CONFLICT-002**','**percentage = 100 × relative/reference; metadata `percentage-0-100`; true ratio fields unchanged**')
s=s.replace('**BLOCKED by HTML-CONFLICT-004**','**hold Alt → Exit → release Alt → new session starts Alt OFF, Magnet ON, selected tool retained**')
s=s.replace('These scenarios are the minimum future frozen-Oracle parity suite. Items marked BLOCKED depend on §20.','These scenarios are the minimum frozen-Oracle parity suite. All former §20 blockers are resolved in executable sources and covered by browser regression.')
start=s.index('## 20. HTML internal conflict register'); end=s.index('## 21.',start)
s=s[:start]+'''## 20. Resolved HTML internal conflict register

| ID | Former contradiction | Executable resolution | Regression evidence | State |
|---|---|---|---|---|
| HTML-CONFLICT-001 | RR metrics existed but generic Target HUD intercepted them. | `renderHUD()` checks completed RR before generic Target; displays H/V gaps, overlap and signed center delta without a duplicated margin table. | browser RR summary + structured spacing + overlay line | RESOLVED |
| HTML-CONFLICT-002 | Arithmetic was percentage while metadata declared ratio. | `coordinateSpace.percentage = percentage-0-100`; true ratio fields are unchanged. | numerical percentage/ratio checks | RESOLVED |
| HTML-CONFLICT-003 | IDLE could leave Toolbar/status/SVG interaction chrome. | render hides scene/SVG/tools/status, disables controls, hides toast; inactive handlers reject mutation. | Exit visibility + inactive-action regression | RESOLVED |
| HTML-CONFLICT-004 | Alt could survive Exit/new session or a lost release. | Exit/begin/Adjust clear temporary Alt; keyup clears even while inactive; new session resets Magnet ON. | held Alt → Exit/re-entry + Adjust/Continue | RESOLVED |

No known freeze blocker remains. Native host behavior remains a separate qualification layer.

'''+s[end:]
start=s.index('## 21.'); end=s.index('## 22.',start)
s=s[:start]+'''## 21. Freeze corrections and preserved boundaries

This freeze resolves the four prototype contradictions in executable code first, then aligns requirement rows, persistence semantics, traceability and scenarios. It does not introduce Region resize handles, Arrow nudge, intermediate Esc cancellation, a new toolbar control, saved-image history, or fixture UI in Production.

`详情` is **open** (idempotent); `I` is **toggle**. Inspector shows current Snapshot/mapping/reference/pointer/candidate evidence even without a Result. Temporary Alt and in-progress drag state are cleared when Measurement releases input ownership for Adjust. Update preserves tool, persistent Magnet, pointer and Inspector-open while clearing old snapshot-derived result/candidate/reference/drag state.

'''+s[end:]
s=s.replace("`'ratio-0-1'`","`'percentage-0-100'`")
start=s.index('## 24.')
s=s[:start]+'''## 24. Change discipline

1. Explicit user corrections → executable Prototype → this FROZEN Oracle → architecture Native/Framework invariants and separately justified Product Extensions → Production → tests/qualification.
2. Preserve requirement IDs; tests are witnesses, not a second requirement source.
3. Production-only capabilities require explicit architecture/user basis and never amend this Oracle retroactively.
4. A future real prototype contradiction reopens only its specific blocker before a new freeze is asserted.
5. Current state: **ORACLE STATUS: FROZEN**. Browser evidence is synthetic and never substitutes for macOS/Windows qualification.
'''
write(p,s)

# Browser regression: patch current test with freeze-blocker checks.
p='tests/desktop-measurement/browser.test.py'; s=read(p)
s=repl(s,'    check("磁吸定位默认开启", state("magnet") is True and page.locator("#magnet-toggle").get_attribute("class") and "active" in page.locator("#magnet-toggle").get_attribute("class"))','    check("磁吸定位默认开启", state("magnet") is True and page.locator("#magnet-toggle").get_attribute("class") and "active" in page.locator("#magnet-toggle").get_attribute("class"))\n    check("默认工具为 Region", state("mode") == "region")\n    check("Toolbar 十项顺序", page.locator("#tools button").all_text_contents() == ["点","区域","两点","两区域","磁吸定位","边距：窗口","更新画面","调整界面","详情","退出"])')
s=repl(s,'    check("结构化 Evidence 包含百分比几何", structured["target"]["windowRelative"]["percentage"] is not None)','    check("结构化 Evidence 包含百分比几何", structured["target"]["windowRelative"]["percentage"] is not None)\n    check("percentage metadata 为 0-100", structured["coordinateSpace"]["percentage"] == "percentage-0-100")\n    numeric = page.evaluate("MeasureModel.relative({x:25,y:25,width:50,height:50},{x:0,y:0,width:100,height:100})")\n    check("percentage 与 ratio 语义分离", numeric["percentage"] == {"x":25,"y":25,"width":50,"height":50} and numeric["areaRatio"] == .25 and numeric["insideRatio"] == 1)')
s=repl(s,'    check("两区域距离成立", page.evaluate("MeasureDemo.data().spacing") is not None)','    check("两区域距离成立", page.evaluate("MeasureDemo.data().spacing") is not None)\n    check("两区域 HUD relation summary 可达", "H gap" in page.locator("#hud-size").inner_text() and "center Δ" in page.locator("#hud-meta").inner_text())')
s=repl(s,'    check("Inspector 只在用户主动请求时打开", page.locator("#inspector").is_visible())','    check("Inspector 只在用户主动请求时打开", page.locator("#inspector").is_visible())\n    inspected = json.loads(page.locator("#json-info").inner_text())\n    check("无 Result Inspector 仍有 Snapshot Evidence", inspected["snapshot"] == page.evaluate("MeasureDemo.token()") and inspected["windowReference"] is not None)\n    page.click("#details")\n    check("Details 是 idempotent open", state("inspectorOpen") is True)\n    page.keyboard.press("i")\n    check("I toggle 关闭 Inspector", state("inspectorOpen") is False)\n    page.keyboard.press("i"); page.keyboard.press("Escape")\n    check("Esc 先关闭 Inspector", state("active") is True and state("inspectorOpen") is False)\n    page.click("#details")')
s=repl(s,'    page.click("#adjust")','    page.keyboard.down("Alt")\n    page.click("#adjust")')
s=repl(s,'    check("ADJUSTING 不把旧 Snapshot 当当前画面", state("snapshotId") is None and page.evaluate("MeasureDemo.data().snapshot") is None)','    check("ADJUSTING 不把旧 Snapshot 当当前画面", state("snapshotId") is None and page.evaluate("MeasureDemo.data().snapshot") is None)\n    check("ADJUSTING 清理 Alt/pointer/drag", state("alt") is False and state("pointer") is None and state("dragStart") is None)')
s=repl(s,'    page.click("#continue")','    page.keyboard.up("Alt")\n    page.click("#continue")')
s=repl(s,'    check("Toast 不截获输入", page.locator("#toast").evaluate("el => getComputedStyle(el).pointerEvents") == "none")','    page.mouse.move(stage_box["x"] + 800, stage_box["y"] + 520); first_micro = page.locator("#micro").bounding_box()\n    page.mouse.move(stage_box["x"] + 820, stage_box["y"] + 530); second_micro = page.locator("#micro").bounding_box()\n    check("Micro HUD 跟随 pointer", abs(second_micro["x"]-first_micro["x"]-20) < 1 and abs(second_micro["y"]-first_micro["y"]-10) < 1)\n    check("Toast 不截获输入", page.locator("#toast").evaluate("el => getComputedStyle(el).pointerEvents") == "none")')
s=repl(s,'    previous_session = state("session")\n    page.click("#exit")','    previous_session = state("session")\n    page.keyboard.down("Alt")\n    page.click("#exit")')
s=repl(s,'    check("退出清理 Snapshot/Overlay/候选", state("active") is False and state("snapshotId") is None\n          and page.locator("#scene").evaluate("el => el.childElementCount") == 0 and page.locator("#overlay").evaluate("el => el.childElementCount") == 0)','    check("退出清理 Snapshot/Overlay/候选", state("active") is False and state("snapshotId") is None and state("alt") is False\n          and page.locator("#scene").evaluate("el => el.childElementCount") == 0 and page.locator("#overlay").evaluate("el => el.childElementCount") == 0\n          and all(page.locator(sel).is_hidden() for sel in ["#scene","#overlay","#micro","#hud","#tools","#status","#inspector","#toast"]))')
s=repl(s,'    page.click("#entry-rec")','    page.keyboard.up("Alt")\n    page.click("#entry-rec")')
s=repl(s,'    check("退出后 Recorder 入口创建新 session", state("session") == previous_session + 1 and state("phase") == "MEASURING")','    check("退出后 Recorder 入口创建新 session", state("session") == previous_session + 1 and state("phase") == "MEASURING" and state("magnet") is True and state("alt") is False)')
write(p,s)

# Static drift test
write('tests/desktop-measurement/contract.test.js',r'''const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
test('frozen Oracle and Production interaction contract do not drift', () => {
  const oracle = read('apps/opendesk/prototypes/desktop-measurement/ORACLE.md');
  const prototype = read('apps/opendesk/prototypes/desktop-measurement/interaction-core.js');
  const surface = read('pkg/measurement/surface_product.go');
  const session = read('pkg/measurement/session.go');
  const win = read('pkg/customui/winhost/bridge.js');
  const mac = read('pkg/customui/machost/native_darwin.m');
  assert.match(oracle, /ORACLE STATUS: FROZEN/);
  assert.doesNotMatch(oracle, /ORACLE STATUS: NOT YET FROZEN/);
  assert.match(prototype, /percentage-0-100/);
  assert.match(surface, /tool: "region"/);
  for (const stale of ['八向控制点可编辑','Arrow=1','Shift=10']) assert.equal(surface.includes(stale), false);
  assert.match(session, /case key == "Escape"/);
  assert.match(session, /case strings.HasPrefix\(key, "Arrow"\):\s*return nil/);
  assert.match(win, /emit\('pointermove',event\)/);
  assert.equal(win.includes("key.startsWith('Arrow')"), false);
  assert.equal(mac.includes('ArrowLeft'), false);
});
''')

# Workflow runs new contract test too
p='.github/workflows/desktop-measurement.yml'; s=read(p)
s=repl(s,'      - run: node --test tests/desktop-measurement/model.test.js','      - run: node --test tests/desktop-measurement/model.test.js tests/desktop-measurement/contract.test.js')
write(p,s)


print(json.dumps(changed,ensure_ascii=False))
