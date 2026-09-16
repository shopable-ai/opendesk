"""Executable HTML contract regression; synthetic Chromium, never native qualification.

Read exactly the checked-in prototype sources. Test fixtures exercise the contract;
they do not define it. All run artifacts, including failures, stay under .runtime/.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

repo = Path(__file__).resolve().parents[2]
prototype = repo / "apps/opendesk/prototypes/desktop-measurement"
evidence = repo / ".runtime/tests/desktop-measurement/prototype"
evidence.mkdir(parents=True, exist_ok=True)
results: list[dict] = []
errors: list[str] = []


def check(name: str, condition: bool, detail: object = "") -> None:
    results.append({"name": name, "status": "PASS" if condition else "FAIL", "detail": str(detail)})
    if not condition:
        raise AssertionError(f"{name}: {detail}")


index = (prototype / "index.html").read_text(encoding="utf-8")
template = (prototype / "template.html").read_text(encoding="utf-8")
check("single modular HTML source", '<link rel="stylesheet" href="prototype.css">' in index
      and '<script src="model.js"></script>' in index and '<script src="interaction-core.js"></script>' in index
      and "<style" not in index)
check("legacy template redirects, not a second implementation", 'url=index.html' in template
      and "MeasureDemo" not in template and "interaction-core.js" not in template)
composed = index.replace('<link rel="stylesheet" href="prototype.css">',
                         "<style>" + (prototype / "prototype.css").read_text(encoding="utf-8") + "</style>")
for name in ("model.js", "interaction-core.js"):
    composed = composed.replace(f'<script src="{name}"></script>',
                                "<script>" + (prototype / name).read_text(encoding="utf-8") + "</script>")

try:
    with sync_playwright() as pw:
        executable = shutil.which("chromium") or shutil.which("google-chrome")
        browser = pw.chromium.launch(**({"executable_path": executable} if executable else {}), args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.set_content(composed, wait_until="load")
        page.wait_for_function("globalThis.MeasureDemo?.state.phase === 'MEASURING'")
        state = lambda expression: page.evaluate("MeasureDemo.state." + expression)
        data = lambda: page.evaluate("MeasureDemo.data()")
        token = lambda: page.evaluate("MeasureDemo.token()")
        hidden = lambda selector: page.locator(selector).is_hidden()

        def client(x: float, y: float) -> tuple[float, float]:
            box = page.locator("#stage").bounding_box()
            return box["x"] + x, box["y"] + y

        def drag(x: float, y: float, width: float, height: float) -> None:
            page.mouse.move(*client(x, y)); page.mouse.down()
            page.mouse.move(*client(x + width, y + height)); page.mouse.up()

        def move_to(name: str) -> tuple[float, float]:
            point = page.evaluate("name => { const n=MeasureDemo.nodes.find(n=>n.id===name),o=MeasureDemo.origin;"
                                  "return {x:n.rect.x+n.rect.width/2-o.x,y:n.rect.y+n.rect.height/2-o.y}; }", name)
            position = client(point["x"], point["y"])
            page.mouse.move(*position)
            page.wait_for_timeout(180)
            return position

        def mode(value: str) -> None:
            page.click(f'[data-mode="{value}"]')

        check("first session defaults Region/Magnet ON/Inspector closed", state("session") == 1
              and state("mode") == "region" and state("magnet") and hidden("#inspector") and hidden("#micro"))
        labels = page.locator("#tools button").all_text_contents()
        check("toolbar inventory and order", labels == ["点", "区域", "两点", "两区域", "磁吸定位", "边距：窗口", "更新画面", "调整界面", "详情", "退出"], labels)
        check("all toolbar tooltips present", page.locator("#tools button[title]").count() == 10)
        check("one weak outside mask and Reference outline", page.locator(".mask").count() == 1
              and page.locator(".window-outline").count() == 1)
        first = token()
        for entry in ("#entry-dev", "#entry-rec", "#entry-key"):
            page.click(entry)
        check("three entries share session and snapshot", token() == first)

        move_to("input")
        micro = page.locator("#micro").inner_text()
        check("pointer triple and frozen color", all(word in micro for word in ("屏幕", "窗口", "区域", "■ #"))
              and "区域   —" not in micro, micro)
        check("source pixel, no interpolation", data()["pointer"]["rawPixelColor"]["source"] == "frozen-synthetic-source-pixel"
              and data()["pointer"]["rawPixelColor"]["interpolation"] == "none")
        check("candidate provenance remains synthetic", state("candidate.provider") == "synthetic-ui-tree"
              and state("candidate.reliability") == "fixture-not-native")
        candidate = state("candidate.id")
        page.locator("#overlay").focus(); page.keyboard.press("Tab")
        check("Tab cycles existing stack only", state("candidate.id") != candidate and token() == first
              and page.locator("#overlay rect.candidate").count() == 1)
        page.keyboard.press("Shift+Tab")
        check("Shift+Tab reverses", state("candidate.id") == candidate)
        page.keyboard.down("Alt")
        check("Alt temporary, persistent Magnet stays ON", state("alt") and state("candidate") is None
              and "active" in page.locator("#magnet-toggle").get_attribute("class"))
        page.keyboard.up("Alt"); page.wait_for_timeout(180)
        check("Alt release resumes candidate", not state("alt") and state("candidate") is not None)
        page.mouse.click(*move_to("input"))
        selected = data()
        check("semantic Target has one useful Local Reference", selected["localReference"]["label"] == "输入区"
              and selected["margins"]["targetToWindow"] is not None and selected["margins"]["targetToLocal"] is not None)
        check("two margin rows and four active lines", page.locator("#margin-table>span").count() == 15
              and page.locator("line.margin-line").count() == 4)
        page.click("#margin-toggle")
        check("margin toggle keeps one relation", state("marginView") == "local" and page.locator("line.margin-line").count() == 4)
        check("stable semantic hints separate from runtime geometry", selected["stableRelocationEvidence"]["semanticCandidateId"] == "input"
              and selected["runtimeEvidence"]["absoluteGeometryIsRuntimeEvidenceOnly"])
        check("percentage metadata convention", selected["coordinateSpace"]["percentage"] == "percentage-0-100")
        numeric = page.evaluate("MeasureModel.relative({x:25,y:25,width:50,height:50},{x:0,y:0,width:100,height:100})")
        check("percentage arithmetic not normalized, true ratios unchanged", numeric["percentage"] == {"x": 25, "y": 25, "width": 50, "height": 50}
              and numeric["areaRatio"] == .25 and numeric["coverageRatio"] == .25 and numeric["insideRatio"] == 1)

        locked = state("target.rect")
        page.keyboard.press("ArrowRight"); page.keyboard.press("Shift+ArrowDown")
        check("Arrow does not nudge Region", state("target.rect") == locked)
        drag(400, 260, 100, 65)
        check("re-drag replaces target rather than body/handle edit", state("target.provider") == "manual"
              and state("target.rect.width") == 100 and state("localReference") is None)
        check("Region has no edit handles", page.locator("#overlay .handle").count() == 0)
        mode("region")
        check("same tool reselection clears result", state("target") is None and state("candidate") is None)
        mode("point"); page.mouse.click(*move_to("send"))
        check("Point confirms source pixel", data()["point"]["color"]["source"] == "frozen-synthetic-source-pixel")
        mode("pp"); page.mouse.click(*client(420, 260)); page.mouse.click(*client(500, 320))
        check("two points distance and signed deltas", data()["twoPoint"]["straightDistance"] == 100
              and data()["twoPoint"]["dx"] == 80 and data()["twoPoint"]["dy"] == 60)
        page.mouse.click(*client(450, 270))
        check("third point starts new pair", state("pointPair.length") == 1 and data()["twoPoint"] is None)
        mode("rr"); drag(420, 260, 4, 60)
        check("RR rejects below 5x5", state("regionPair.length") == 0)
        drag(420, 260, 80, 60); drag(620, 380, 90, 70)
        spacing = data()["spacing"]
        check("RR structured relation", spacing["horizontalGap"] == 120 and spacing["verticalGap"] == 60)
        check("RR relation summary reachable before generic Target", "H gap 120" in page.locator("#hud-size").inner_text()
              and "V gap 60" in page.locator("#hud-size").inner_text() and "overlap 0" in page.locator("#hud-meta").inner_text()
              and "center Δ" in page.locator("#hud-meta").inner_text() and page.locator("#margin-table>span").count() == 0)
        check("RR overlay preserves rectangles and relation line", page.locator("line.distance-line").count() == 1)
        drag(430, 280, 70, 55)
        check("third region starts new pair", state("regionPair.length") == 1 and data()["spacing"] is None)

        page.click("#magnet-toggle"); page.click("#details")
        before, pointer = token(), state("pointer")
        page.click("#refresh")
        check("Update keeps session/tool/Magnet/Inspector/pointer", token()["sessionId"] == before["sessionId"]
              and token()["generation"] > before["generation"] and token()["snapshotId"] != before["snapshotId"]
              and state("mode") == "rr" and not state("magnet") and state("inspectorOpen") and state("pointer") == pointer)
        check("Update clears snapshot-derived state", state("target") is None and state("localReference") is None
              and state("candidate") is None and state("regionPair.length") == 0 and state("dragStart") is None)
        stale_accepted = page.evaluate("t => MeasureDemo.applyAsyncCandidate(t,{id:'stale'})", before)
        check("stale async candidate rejected", not stale_accepted)
        inspected = json.loads(page.locator("#json-info").inner_text())
        check("Inspector without Result still contains full current evidence", inspected["snapshot"] == token()
              and inspected["displayMapping"] and inspected["windowReference"] and inspected["pointer"] and inspected["target"] is None)
        page.click("#details")
        check("Details action is idempotent open", state("inspectorOpen"))
        page.keyboard.press("i")
        check("I toggles Inspector closed", not state("inspectorOpen"))
        page.keyboard.press("i"); page.keyboard.press("Escape")
        check("first Esc closes Inspector only", state("active") and not state("inspectorOpen"))

        before = token(); page.click("#details"); page.keyboard.down("Alt"); page.click("#adjust")
        check("Adjust invalidates snapshot and clears transient input", state("phase") == "ADJUSTING" and data()["snapshot"] is None
              and state("pointer") is None and not state("inspectorOpen") and state("dragStart") is None and not state("alt"))
        check("Adjust hides all measurement chrome", all(hidden(s) for s in ("#scene", "#overlay", "#micro", "#hud", "#tools", "#status", "#inspector", "#toast")))
        for selector in ("#live-scroll", "#live-tab", "#live-menu"):
            page.click(selector)
        page.keyboard.up("Alt"); page.click("#continue")
        check("Continue refreezes same session and preserves tool/Magnet", token()["sessionId"] == before["sessionId"]
              and token()["generation"] > before["generation"] and state("mode") == "rr" and not state("magnet") and not state("alt"))

        page.click("#magnet-toggle"); page.select_option("#provider", "visual"); move_to("send")
        visual = state("candidate")
        check("visual candidate never invents semantic role", (visual is None and "未找到可靠候选" in state("status")) or
              (visual is not None and visual["provider"] == "pixel-region-growing"
               and visual["reliability"] == "estimated-not-semantic" and visual.get("role") is None))
        page.select_option("#display-mode", "negative")
        check("negative logical origin preserved", data()["windowReference"]["bounds"]["x"] < 0)
        page.select_option("#display-mode", "mixed")
        check("mixed display mapping retained", [m["scaleX"] for m in data()["displayMapping"]] == [1, 2])
        page.mouse.move(*client(800, 520)); first_micro = page.locator("#micro").bounding_box()
        page.mouse.move(*client(820, 530)); second_micro = page.locator("#micro").bounding_box()
        check("micro HUD follows pointer, not fixed corners", abs(second_micro["x"] - first_micro["x"] - 20) < 1
              and abs(second_micro["y"] - first_micro["y"] - 10) < 1)
        box = page.locator("#stage").bounding_box()
        x, y = client(box["width"] - 10, box["height"] - 10)
        page.mouse.move(x, y); corner = page.locator("#micro").bounding_box()
        check("micro HUD flips before bottom/right edges", corner["x"] + corner["width"] <= x
              and corner["y"] + corner["height"] <= y)
        check("toast cannot intercept input", page.locator("#toast").evaluate("el=>getComputedStyle(el).pointerEvents") == "none")

        mode("pp"); previous = state("session"); page.keyboard.down("Alt"); page.keyboard.press("Escape")
        check("Esc without Inspector exits even with unfinished selection", not state("active") and state("phase") == "IDLE")
        check("Exit clears snapshots/chrome/Alt", not state("alt") and state("snapshotId") is None and state("target") is None
              and state("candidate") is None and state("stack.length") == 0
              and page.locator("#scene").evaluate("el=>el.childElementCount") == 0
              and all(hidden(s) for s in ("#scene", "#overlay", "#micro", "#hud", "#tools", "#status", "#inspector", "#toast")))
        page.evaluate("MeasureDemo.setMode('point');document.getElementById('magnet-toggle').dispatchEvent(new Event('click'));"
                      "document.getElementById('details').dispatchEvent(new Event('click'))")
        page.keyboard.press("1"); page.keyboard.press("Tab")
        check("IDLE cannot mutate measurement controls", state("mode") == "pp" and not state("inspectorOpen") and state("magnet"))
        page.keyboard.up("Alt"); page.click("#entry-rec")
        check("new session retains tool, resets Magnet ON and Alt OFF", state("session") == previous + 1
              and state("mode") == "pp" and state("magnet") and not state("alt") and state("pointer") is None)
        check("no browser script exceptions", not errors, errors)
        page.screenshot(path=str(evidence / "final-modular-oracle.png"))
        browser.close()
finally:
    summary = {"scope": "Synthetic Chromium, exact checked-in modular prototype; not macOS/Windows qualification",
               "tests": len(results), "pass": sum(r["status"] == "PASS" for r in results), "errors": errors, "results": results}
    (evidence / "browser-tests.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"tests": summary["tests"], "pass": summary["pass"], "errors": errors}, ensure_ascii=False))
