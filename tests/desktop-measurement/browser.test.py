"""Executable Desktop Measurement Oracle + amendment regression (synthetic only).

Uses the exact checked-in modular sources through Chromium set_content, as the
original harness did. Browser fixtures are not native capture/AX/UIA evidence.
"""
from __future__ import annotations
import hashlib
import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

repo = Path(__file__).resolve().parents[2]
source = repo / "apps/opendesk/prototypes/desktop-measurement"
out = repo / ".runtime/tests/desktop-measurement/prototype"
out.mkdir(parents=True, exist_ok=True)
results, errors = [], []

def check(name, condition, detail=""):
    results.append({"name": name, "status": "PASS" if condition else "FAIL", "detail": detail})
    if not condition:
        raise AssertionError(f"{name}: {detail}")

index = (source / "index.html").read_text(encoding="utf-8")
template = (source / "template.html").read_text(encoding="utf-8")
modules = ["model.js", "visual-resolver.js", "records.js", "interaction-core.js"]
check("index consumes external modules", all(f'<script src="{f}"></script>' in index for f in modules)
      and '<link rel="stylesheet" href="prototype.css">' in index and "<style" not in index)
check("legacy template is only an alias", "url=index.html" in template and "MeasureDemo" not in template)
html = index.replace('<link rel="stylesheet" href="prototype.css">', '<style>'+(source/'prototype.css').read_text()+'</style>')
for file in modules:
    html = html.replace(f'<script src="{file}"></script>', '<script>'+(source/file).read_text()+'</script>')

with sync_playwright() as p:
    exe = shutil.which("chromium") or shutil.which("google-chrome")
    browser = p.chromium.launch(**({"executable_path": exe} if exe else {}), args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
    page.on("pageerror", lambda e: errors.append(str(e)))
    try:
        page.set_content(html, wait_until="load")
        page.wait_for_timeout(180)
        if not page.evaluate("MeasureDemo.state.active"):
            page.evaluate("MeasureDemo.begin('browser-test-initial-entry')")
        def state(expr): return page.evaluate("MeasureDemo.state."+expr)
        def node(name): return page.evaluate("id => MeasureDemo.nodes.find(n => n.id === id)", name)
        def token(): return page.evaluate("MeasureDemo.token()")
        def metrics(): return page.evaluate("MeasureDemo.metrics")
        def client(x, y):
            origin = page.evaluate("MeasureDemo.origin")
            b = page.locator("#stage").bounding_box()
            return b["x"]+x-origin["x"], b["y"]+y-origin["y"]
        def move(name, dx=None, dy=None):
            r = node(name)["rect"]
            xy = client(r["x"]+(dx if dx is not None else r["width"]/2), r["y"]+(dy if dy is not None else r["height"]/2))
            page.mouse.move(*xy); page.wait_for_timeout(150)
            return xy
        def select(name="window"):
            xy = move(name, 90, 22); page.mouse.click(*xy)
            page.wait_for_timeout(100)
        def drag(a,b):
            page.mouse.move(*client(*a)); page.mouse.down(); page.mouse.move(*client(*b)); page.mouse.up()
        def confirm(name="input"):
            xy = move(name); page.mouse.click(*xy)
        def mode(value): page.click(f'[data-mode="{value}"]')

        # Amendment: entry is live, suggestion != confirmed reference, no raw pixel allocation.
        check("entry Reference Selecting, not frozen", state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None)
        check("entry has no source canvases/record", page.locator("#scene canvas").count() == 0 and state("records") == [])
        check("no frozen mask or micro HUD while selecting", page.locator("#overlay .mask").count() == 0 and page.locator("#micro").is_hidden())
        check("suggestion is not a locked reference", state("reference") is None and state("referenceCandidate") is not None)
        first = token()
        for entry in ["#entry-dev", "#entry-rec", "#entry-key"]: page.click(entry)
        check("three selecting entries reuse session without capture", token() == first)
        move("notes-window",90,22)
        check("window hover preview changes", state("referenceCandidate.id") == "notes-window" and "备忘录" in page.locator("#hud-size").inner_text())
        check("window bounds and live state visible", "尚未冻结" in page.locator("#hud-source").inner_text() and "单击确认" in page.locator("#hud-meta").inner_text())
        page.click("#live-tab")
        check("live scene can change before confirmation", state("live.tab") == 1 and state("snapshotId") is None)
        page.click("#live-tab")
        page.screenshot(path=str(out/"reference-selecting.png"))
        # Clicking blank desktop cannot select or capture a window.
        page.mouse.click(*client(20,30))
        check("blank selection fails closed", state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None)
        select()
        check("reference click creates first snapshot", state("phase") == "MEASURING" and bool(state("snapshotId")) and state("reference.id") == "window")
        check("initial tool Region; magnet ON", state("mode") == "region" and state("magnet") and not state("alt"))
        check("ten original toolbar controls retained", page.locator("#tools button").all_text_contents() == ["点","区域","两点","两区域","磁吸定位","边距：窗口","更新画面","调整界面","详情","退出"])
        check("Inspector is opt-in", page.locator("#inspector").is_hidden())
        check("frozen mask and reference outline", page.locator("#overlay path.mask").count() == 1 and page.locator("#overlay rect.window-outline").count() == 1)
        first = token()
        for entry in ["#entry-dev", "#entry-rec", "#entry-key"]: page.click(entry)
        check("three measuring entries reuse exact snapshot", token() == first)
        move("input")
        micro = page.locator("#micro").inner_text()
        check("Micro HUD has three coordinates and source color", all(t in micro for t in ["屏幕", "窗口", "区域", "■ #"]) and "区域   —" not in micro)
        check("Micro HUD never takes pointer input", page.locator("#micro").evaluate("e=>getComputedStyle(e).pointerEvents") == "none")
        pixel = page.evaluate("MeasureDemo.data().pointer.rawPixelColor")
        check("raw color is frozen source, uninterpolated", pixel["source"] == "frozen-synthetic-source-pixel" and pixel["interpolation"] == "none")
        check("semantic provenance honest", state("candidate.provider") == "synthetic-ui-tree" and state("candidate.reliability") == "fixture-not-native")
        check("hover is provisional, not Result/Record", state("candidate.state") == "preview" and state("target") is None and state("records") == [])
        check("preview label/source/size in Corner HUD", "候选预览" in page.locator("#hud-title").inner_text() and "UI Tree" in page.locator("#hud-source").inner_text() and "×" in page.locator("#hud-size").inner_text())
        check("hover Window and Local margins plus ratio", page.locator("#margin-table > span").count() == 15 and "输入区" in page.locator("#margin-table").inner_text() and "%" in page.locator("#hud-meta").inner_text())
        check("preview overlay only one four-margin relation", page.locator("#overlay .margin-line").count() == 4)
        check("preview cannot be recorded", page.evaluate("MeasureDemo.recordMeasurement()") is False)
        original_candidate = state("candidate.id")
        page.locator("#overlay").focus(); page.keyboard.press("Tab")
        check("Tab changes candidate and HUD together", state("candidate.id") != original_candidate and state("candidate.label") in page.locator("#hud-size").inner_text())
        check("only one candidate outline", page.locator("#overlay rect.candidate").count() == 1)
        # Small pointer motion must not reset a selected ancestor.
        r=node("input")["rect"]; page.mouse.move(*client(r["x"]+r["width"]/2+2,r["y"]+r["height"]/2+1))
        check("stable stack retains Tab-selected layer", state("candidate.id") == "composer")
        page.keyboard.press("Shift+Tab")
        check("reverse Tab returns child", state("candidate.id") == original_candidate)
        page.keyboard.down("Alt")
        check("Alt clears preview but retains Micro", state("alt") and state("candidate") is None and page.locator("#micro").is_visible())
        page.keyboard.up("Alt"); page.wait_for_timeout(150)
        check("Alt release resumes", not state("alt") and state("candidate") is not None)
        page.screenshot(path=str(out/"hover-preview.png"))
        confirm()
        data = page.evaluate("MeasureDemo.data()")
        check("click locks but does not add a record", data["confirmation"] == "confirmed" and state("records") == [] and "已锁定" in page.locator("#hud-title").inner_text())
        check("confirmed Window+Local evidence", data["margins"]["targetToWindow"] is not None and data["localReference"]["label"] == "输入区" and data["margins"]["targetToLocal"] is not None)
        page.click("#margin-toggle")
        check("Local switch still draws four lines", state("marginView") == "local" and page.locator("#overlay .margin-line").count() == 4)
        check("relocation separated from runtime geometry", data["stableRelocationEvidence"].get("semanticCandidateId") == "input" and data["runtimeEvidence"]["absoluteGeometryIsRuntimeEvidenceOnly"])
        check("structured percentage geometry exists", data["target"]["windowRelative"]["percentage"] and data["coordinateSpace"]["percentage"] == "percentage-0-100")
        percent=page.evaluate("MeasureModel.relative({x:25,y:25,width:50,height:50},{x:0,y:0,width:100,height:100})")
        check("percentage vs ratio contract", percent["percentage"] == {"x":25,"y":25,"width":50,"height":50} and percent["areaRatio"] == .25)
        page.locator("#overlay").focus(); page.keyboard.press("Enter"); page.keyboard.press("Enter")
        check("Enter adds once and releases current result", len(state("records")) == 1 and state("target") is None)
        evidence=page.evaluate("MeasureDemo.sessionEvidence()")
        check("Record retains snapshot source and confirmed provenance", len(evidence["snapshots"]) == 1 and evidence["snapshots"][0]["sourceImages"][0]["data"].startswith("data:image/png;base64,") and evidence["measurements"][0]["status"] == "confirmed")
        confirm("send"); page.click("#record-current")
        check("second explicit Record; shared snapshot", len(state("records")) == 2 and len(page.evaluate("MeasureDemo.sessionEvidence().snapshots")) == 1)
        old_records=state("records"); old_token=token()
        page.click("#refresh")
        check("Update keeps records and changes snapshot", state("records") == old_records and token()["snapshotId"] != old_token["snapshotId"] and token()["generation"] > old_token["generation"])
        check("Update clears only current measurement", state("target") is None and state("candidate") is None)
        accepted=page.evaluate("t=>MeasureDemo.applyAsyncCandidate(t,{id:'stale',rect:{x:1,y:1,width:10,height:10}})",old_token)
        check("old snapshot async result rejected", not accepted)
        confirm(); page.keyboard.press("Enter")
        evidence=page.evaluate("MeasureDemo.sessionEvidence()")
        check("records refer to two retained snapshots", len(evidence["measurements"]) == 3 and len(evidence["snapshots"]) == 2 and len(set(m["snapshotId"] for m in evidence["measurements"])) == 2)
        check("old records not relabeled current", evidence["measurements"][:2] == old_records)
        page.click("#view-records")
        check("multiple records visible in Inspector", page.locator("#session-records li").count() == 3)
        # Clipboard fake tests only the contract, never the real system clipboard.
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async s=>{window.copied=s}}})")
        page.click("#copy-all"); page.wait_for_timeout(20)
        copied=json.loads(page.evaluate("window.copied"))
        check("Copy All includes all measurements and snapshots", len(copied["measurements"]) == 3 and len(copied["snapshots"]) == 2)
        check("copy acknowledgement is not saved", all(m["status"] == "confirmed" for m in state("records")))
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}})")
        page.click("#copy-all"); page.wait_for_timeout(20)
        page.mouse.move(*client(200,220))
        check("clipboard failure preserves visible full session JSON", len(json.loads(page.locator("#session-json").inner_text())["measurements"]) == 3)
        # Real Chromium Blob download to the evidence directory; no repository/core path chosen by the prototype.
        page.evaluate("() => {window.showSaveFilePicker=undefined}")
        with page.expect_download(timeout=5000) as download_info:
            page.click("#save-session")
        download_info.value.save_as(str(out/"measurement-session.json"))
        downloaded=json.loads((out/"measurement-session.json").read_text())
        check("browser JSON artifact contains multiple records and source snapshots", len(downloaded["measurements"]) == 3 and len(downloaded["snapshots"]) == 2)
        check("download request never falsely acknowledges durable saved state", state("exportStatus.status") == "download-requested" and all(m["status"] == "confirmed" for m in state("records")))
        # Durable save acknowledgement only after close; errors/cancellation do not mark records saved.
        page.evaluate("() => {window.showSaveFilePicker=async()=>{throw new DOMException('cancelled','AbortError')};}")
        page.click("#save-session"); page.wait_for_timeout(20)
        check("cancel save never marks saved", state("exportStatus.status") == "cancelled" and all(m["status"] == "confirmed" for m in state("records")))
        page.evaluate("() => {window.showSaveFilePicker=async()=>({name:'measurement.json',createWritable:async()=>({write:async s=>{window.savedText=s},close:async()=>{throw Error('disk full')},abort:async()=>{window.aborted=true}})});}")
        page.click("#save-session"); page.wait_for_timeout(20)
        check("write/close failure aborts and preserves records", state("exportStatus.status") == "failed" and page.evaluate("window.aborted") and all(m["status"] == "confirmed" for m in state("records")))
        page.evaluate("() => {window.showSaveFilePicker=async()=>({name:'measurement.json',createWritable:async()=>({write:async s=>{window.savedText=s},close:async()=>{window.saveClosed=true}})});}")
        page.click("#save-session"); page.wait_for_timeout(20)
        check("successful save acknowledges exact records", page.evaluate("window.saveClosed") and all(m["status"] == "saved" for m in state("records")) and len(json.loads(page.evaluate("window.savedText"))["measurements"]) == 3)
        page.screenshot(path=str(out/"session-records.png"))
        page.fill("#record-label","label I 123")
        check("typing label does not switch tool or record", state("mode") == "region" and len(state("records")) == 3)
        page.keyboard.press("Escape")
        check("Escape in label closes only Inspector", state("active") and not state("inspectorOpen"))

        # Preserved four-mode, relation and reset regressions.
        mode("point"); confirm("send")
        check("Point stores source color", page.evaluate("MeasureDemo.data().point.color.source") == "frozen-synthetic-source-pixel")
        mode("pp"); a=node("bubble")["rect"]; b=node("send")["rect"]
        page.mouse.click(*client(a["x"]+8,a["y"]+8)); page.mouse.click(*client(b["x"]+8,b["y"]+8))
        check("two-point distance", page.evaluate("MeasureDemo.data().twoPoint.straightDistance") > 0)
        page.mouse.click(*client(a["x"]+8,a["y"]+8))
        check("third point starts a new pair", len(state("pointPair")) == 1)
        mode("rr"); drag((420,260),(500,320)); drag((620,380),(710,450))
        check("RR relation and priority in Corner HUD", page.evaluate("MeasureDemo.data().spacing") is not None and "H gap" in page.locator("#hud-size").inner_text() and "center Δ" in page.locator("#hud-meta").inner_text())
        check("RR has no duplicate margin table", page.locator("#margin-table > span").count() == 0)
        drag((720,420),(790,460))
        check("third region starts new pair", len(state("regionPair")) == 1)
        mode("region"); drag((450,330),(540,365))
        check("manual drag makes no semantic Local", state("target.provider") == "manual" and state("localReference") is None)
        before=state("target"); page.keyboard.press("ArrowRight")
        check("Arrow does not nudge Region; no eight handles", state("target") == before and page.locator("#overlay .handle").count() == 0)
        mode("region")
        check("same-tool selection clears current result", state("target") is None)
        page.click("#details"); page.click("#details")
        check("Details is idempotent open", state("inspectorOpen"))
        check("Inspector has snapshot without a Result", json.loads(page.locator("#json-info").inner_text())["snapshot"] == token())
        page.locator("#overlay").focus(); page.keyboard.press("i")
        check("I toggles Inspector closed", not state("inspectorOpen"))
        page.keyboard.press("i"); page.keyboard.press("Escape")
        check("Escape closes Inspector first", state("active") and not state("inspectorOpen"))
        page.click("#details"); page.click("#refresh")
        check("Update keeps Inspector/mode/magnet", state("inspectorOpen") and state("mode") == "region" and state("magnet"))
        before_adjust=token(); records_before=state("records")
        page.keyboard.down("Alt"); page.click("#adjust")
        check("Adjust invalidates current token and input transient state", state("phase") == "ADJUSTING" and state("snapshotId") is None and state("pointer") is None and state("dragStart") is None and not state("alt"))
        check("Adjust hides Measurement chrome", all(page.locator(s).is_hidden() for s in ["#scene","#overlay","#micro","#hud","#tools","#inspector"]))
        for s in ["#live-scroll","#live-tab","#live-menu"]: page.click(s)
        page.keyboard.up("Alt"); page.click("#continue")
        check("Continue same session, new snapshot, records survive", state("phase") == "MEASURING" and token()["sessionId"] == before_adjust["sessionId"] and token()["snapshotId"] != before_adjust["snapshotId"] and state("records") == records_before)

        # Real pointer events on the synthetic frozen pixels, not direct state edits.
        page.select_option("#provider","visual"); move("send",15,14)
        check("visual resolves a bounded rectangle", state("candidate") is not None and state("candidate.provider") == "pixel-region-growing")
        c=state("candidate")
        check("visual candidate cannot impersonate a control", c["semantic"] is False and c["role"] is None and c["reliability"] == "estimated-not-semantic" and c["snapshotId"] == token()["snapshotId"])
        check("visual preview exposes size and Window margins", "Visual" in page.locator("#hud-source").inner_text() and page.locator("#margin-table > span").count() == 10)
        base=metrics(); r=node("send")["rect"]
        x,y=client(r["x"]+15,r["y"]+12)
        page.evaluate("p=>{let e=document.getElementById('overlay');for(let i=0;i<100;i++)e.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:p.x+i%3,clientY:p.y+i%2}))}",{"x":x,"y":y})
        page.wait_for_timeout(100); now=metrics()
        check("100 pointer events do not cause 100 flood fills", now["pointerMoveCount"]-base["pointerMoveCount"] == 100 and now["floodFillRuns"] == base["floodFillRuns"],json.dumps({"before":base,"after":now}))
        # Also spread events over real time, preventing a debounce-only implementation from passing.
        base=metrics()
        for i in range(25):
            page.mouse.move(x+i%3,y+i%2); page.wait_for_timeout(8)
        now=metrics()
        check("continuous inside motion reuses previous visual candidate", now["floodFillRuns"] == base["floodFillRuns"] and now["visualCacheHit"] > base["visualCacheHit"])
        stale_context=page.evaluate("MeasureDemo.candidateToken()")
        move("bubble",15,12)
        check("leaving old Candidate permits new resolve", metrics()["floodFillRuns"] > now["floodFillRuns"])
        accepted=page.evaluate("a=>MeasureDemo.applyAsyncCandidate(a.t,a.c)",{"t":stale_context,"c":c})
        check("same-snapshot stale pointer result rejected", not accepted)
        page.click("#magnet-toggle"); base=metrics()
        move("send",15,12); move("input",20,15)
        check("Magnet OFF performs zero visual resolution", metrics()["floodFillRuns"] == base["floodFillRuns"] and state("candidate") is None and page.locator("#micro").is_visible())
        page.click("#magnet-toggle"); move("send",15,12)
        page.keyboard.down("Alt"); base=metrics(); move("bubble",15,12)
        check("Alt pause blocks flood fill while pointer updates", state("candidate") is None and metrics()["floodFillRuns"] == base["floodFillRuns"] and page.locator("#micro").is_visible())
        page.keyboard.up("Alt"); page.wait_for_timeout(120)
        page.screenshot(path=str(out/"visual-preview.png"))

        # Negative origin + fractional/mixed DPI; no native physical-monitor claim.
        page.select_option("#display-mode","negative")
        check("negative logical coordinate reference", page.evaluate("MeasureDemo.data().windowReference.bounds.x") < 0)
        page.select_option("#display-mode","mixed")
        maps=page.evaluate("MeasureDemo.data().displayMapping")
        check("mixed 1x/2x capture mappings", len(maps)==2 and maps[0]["scaleX"]==1 and maps[1]["scaleX"]==2)
        page.mouse.move(*client(80,520)); first_micro=page.locator("#micro").bounding_box()
        page.mouse.move(*client(100,530)); second_micro=page.locator("#micro").bounding_box()
        check("Micro follows pointer", abs(second_micro["x"]-first_micro["x"]-20)<1 and abs(second_micro["y"]-first_micro["y"]-10)<1)
        box=page.locator("#stage").bounding_box(); page.mouse.move(box["x"]+box["width"]-5,box["y"]+box["height"]-5)
        m=page.locator("#micro").bounding_box()
        check("Micro flips at edges", m["x"]+m["width"]<=box["x"]+box["width"] and m["y"]+m["height"]<=box["y"]+box["height"])
        check("toast does not intercept input", page.locator("#toast").evaluate("e=>getComputedStyle(e).pointerEvents")=="none")
        page.click("#details"); page.click("#reselect-reference")
        check("reselect returns to Live without deleting records", state("phase")=="REFERENCE_SELECTING" and state("snapshotId") is None and state("records")==records_before)
        select("notes-window")
        check("different explicit reference freezes only after click", state("reference.id")=="notes-window" and bool(state("snapshotId")))
        previous_session=state("session")
        page.keyboard.down("Alt"); page.click("#exit")
        check("Exit clears temporary snapshot/input/chrome", not state("active") and state("snapshotId") is None and not state("alt") and page.locator("#scene canvas").count()==0 and all(page.locator(s).is_hidden() for s in ["#scene","#overlay","#micro","#hud","#tools","#status","#inspector","#toast"]))
        check("saved browser artifact survives exit", (out/"measurement-session.json").exists() and len(json.loads((out/"measurement-session.json").read_text())["measurements"])==3)
        check("saved payload was not destroyed with session", len(json.loads(page.evaluate("window.savedText"))["measurements"])==3)
        page.keyboard.press("Tab"); page.keyboard.up("Alt")
        check("inactive shortcuts do not recreate session", not state("active"))
        page.click("#entry-rec")
        check("new session again requires selection and resets transient state", state("session")==previous_session+1 and state("phase")=="REFERENCE_SELECTING" and state("snapshotId") is None and state("magnet") and not state("alt") and state("records")==[])
        page.keyboard.press("Escape")
        check("Escape cancels reference selection without capture", not state("active") and state("snapshotId") is None)
        check("no browser script exceptions", not errors,str(errors))
    except Exception as exc:
        errors.append(str(exc))
        raise
    finally:
        page.screenshot(path=str(out/"final-state.png"))
        summary={"scope":"Synthetic Chromium; not native OS qualification", "tests":len(results),"pass":sum(r["status"]=="PASS" for r in results),"errors":errors,"results":results,
                 "sourceSha256":{f:hashlib.sha256((source/f).read_bytes()).hexdigest() for f in ["index.html","prototype.css",*modules]}}
        (out/"browser-tests.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
        print(json.dumps({"tests":summary["tests"],"pass":summary["pass"],"errors":errors},ensure_ascii=False))
        browser.close()
