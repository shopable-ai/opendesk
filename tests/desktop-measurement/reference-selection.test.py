"""Focused browser contract for Live Reference -> click-to-freeze (synthetic only).

Uses real Chromium pointer/mouse/keyboard events for the confirmation path. Test-only
fixture methods are used only to inject window invalidation and freeze failure; they
are not product controls and do not count as Native qualification.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

repo = Path(__file__).resolve().parents[2]
source = repo / "apps/opendesk/prototypes/desktop-measurement"
out = repo / ".runtime/tests/desktop-measurement/reference-selection"
out.mkdir(parents=True, exist_ok=True)
results: list[dict[str, object]] = []
errors: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append({"name": name, "status": "PASS" if condition else "FAIL", "detail": detail})
    if not condition:
        raise AssertionError(f"{name}: {detail}")


index = (source / "index.html").read_text(encoding="utf-8")
modules = ["model.js", "visual-resolver.js", "records.js", "interaction-core.js", "selection-lifecycle.js"]
check("prototype loads hardened selection lifecycle", '<script src="selection-lifecycle.js"></script>' in index)
html = index.replace('<link rel="stylesheet" href="prototype.css">', '<style>' + (source / "prototype.css").read_text() + '</style>')
for filename in modules:
    html = html.replace(f'<script src="{filename}"></script>', '<script>' + (source / filename).read_text() + '</script>')

with sync_playwright() as p:
    executable = shutil.which("chromium") or shutil.which("google-chrome")
    browser = p.chromium.launch(**({"executable_path": executable} if executable else {}), args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1000, "height": 780}, device_scale_factor=1)
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        page.set_content(html, wait_until="load")
        page.wait_for_timeout(250)

        def state(expr: str):
            return page.evaluate("expr => Function('return MeasureDemo.state.' + expr)()", expr)

        def node(node_id: str):
            return page.evaluate("id => MeasureDemo.nodes.find(n => n.id === id)", node_id)

        def client(node_id: str, dx: float | None = None, dy: float | None = None):
            item = node(node_id)
            origin = page.evaluate("MeasureDemo.origin")
            box = page.locator("#stage").bounding_box()
            x = item["rect"]["x"] + (item["rect"]["width"] / 2 if dx is None else dx)
            y = item["rect"]["y"] + (item["rect"]["height"] / 2 if dy is None else dy)
            return box["x"] + x - origin["x"], box["y"] + y - origin["y"]

        def move(node_id: str, dx: float | None = None, dy: float | None = None):
            xy = client(node_id, dx, dy)
            page.mouse.move(*xy)
            page.wait_for_timeout(40)
            return xy

        check("entry stays Live without snapshot", state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None)
        check("formal measurement toolbar hidden before freeze", page.locator("#tools").is_hidden())
        check("selection instruction exact", page.locator("#selection-instruction").inner_text() == "移动鼠标选择窗口 · 单击开始测量 · Esc 取消")
        tick0 = page.evaluate("MeasureReferenceSelection.state.liveTick")
        page.wait_for_timeout(320)
        tick1 = page.evaluate("MeasureReferenceSelection.state.liveTick")
        check("live source visibly keeps changing during selection", tick1 > tick0 and "LIVE source" in page.locator("#live-source-probe").inner_text())

        move("window", 100, 24)
        first_candidate = state("referenceCandidate.id")
        move("notes-window", 90, 24)
        second_candidate = state("referenceCandidate.id")
        check("hover A/B changes candidate only", first_candidate == "window" and second_candidate == "notes-window" and state("snapshotId") is None and state("reference") is None)
        page.click("#live-tab")
        check("simulated app content can switch while selecting", state("live.tab") == 1 and state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None)
        page.click("#live-tab")

        page.click("#entry-dev")
        check("entry click cannot become reference confirmation", state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None)

        xy = move("window", 100, 24)
        page.mouse.click(*xy, button="right")
        page.mouse.click(*xy, button="middle")
        check("right and middle buttons do not confirm", state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None)

        page.mouse.move(*xy)
        page.mouse.down()
        page.mouse.move(xy[0] + 24, xy[1] + 10)
        page.mouse.up()
        check("drag does not confirm", state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None)

        xy_a = move("window", 100, 24)
        xy_b = client("notes-window", 80, 24)
        page.mouse.down()
        page.mouse.move(*xy_b)
        page.mouse.up()
        check("cross-window down/up does not confirm", state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None)

        page.mouse.move(*xy_a)
        page.mouse.down()
        page.locator("#overlay").dispatch_event("pointercancel", {"pointerId": 1, "pointerType": "mouse", "isPrimary": True})
        check("pointercancel clears pending confirm", page.evaluate("MeasureReferenceSelection.state.pending") is None)
        page.mouse.up()
        page.mouse.move(*xy_a)
        page.mouse.down()
        page.evaluate("window.dispatchEvent(new Event('blur'))")
        check("blur clears pending confirm", page.evaluate("MeasureReferenceSelection.state.pending") is None)
        page.mouse.up()

        page.evaluate("MeasureReferenceSelection.test.restoreWindows()")
        page.mouse.move(*xy_a); page.mouse.down()
        page.evaluate("MeasureReferenceSelection.test.moveWindow('window', 40, 0)")
        page.mouse.up()
        check("window geometry change invalidates confirmation", state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None)
        page.evaluate("MeasureReferenceSelection.test.restoreWindows()")
        page.mouse.move(*xy_a); page.mouse.down()
        page.evaluate("MeasureReferenceSelection.test.closeWindow('window')")
        page.mouse.up()
        check("window close invalidates confirmation", state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None)
        page.evaluate("MeasureReferenceSelection.test.restoreWindows()")

        page.evaluate("MeasureReferenceSelection.test.setFreezeDelay(180)")
        before_revision = state("snapshotRevision")
        xy = move("window", 100, 24)
        page.mouse.click(*xy)
        check("valid click enters FREEZING before measurement", state("phase") == "FREEZING" and state("snapshotId") is None and page.locator("#tools").is_hidden())
        page.wait_for_timeout(230)
        check("successful freeze enters MEASURING", state("phase") == "MEASURING" and bool(state("snapshotId")) and state("reference.id") == "window")
        check("one confirmation creates exactly one snapshot", state("snapshotRevision") == before_revision + 1)
        check("confirmation input is not first measurement input", state("target") is None and state("pointResult") is None and state("regionPair") == [] and state("dragStart") is None)
        frozen_tick = page.evaluate("MeasureReferenceSelection.state.frozenAtTick")
        frozen_snapshot = state("snapshotId")
        live_after_freeze = page.evaluate("MeasureReferenceSelection.state.liveTick")
        page.wait_for_timeout(320)
        check("underlying live clock continues without contaminating frozen snapshot", page.evaluate("MeasureReferenceSelection.state.liveTick") > live_after_freeze and page.evaluate("MeasureReferenceSelection.state.frozenAtTick") == frozen_tick and state("snapshotId") == frozen_snapshot)

        page.click("#details")
        page.click("#reselect-reference")
        page.evaluate("MeasureReferenceSelection.test.failNextFreeze()")
        xy = move("notes-window", 80, 24)
        page.mouse.click(*xy)
        check("failure injection still exposes FREEZING", state("phase") == "FREEZING")
        page.wait_for_timeout(230)
        check("freeze failure recovers to Live selection", state("phase") == "REFERENCE_SELECTING" and state("snapshotId") is None and "冻结失败" in page.locator("#status").inner_text())

        page.evaluate("MeasureReferenceSelection.test.setFreezeDelay(300)")
        xy = move("window", 100, 24)
        page.mouse.click(*xy)
        check("cancel scenario reaches FREEZING", state("phase") == "FREEZING")
        page.keyboard.press("Escape")
        check("Esc cancels FREEZING immediately", not state("active") and state("phase") == "IDLE" and state("snapshotId") is None)
        page.wait_for_timeout(360)
        check("late freeze completion cannot revive session", not state("active") and state("phase") == "IDLE" and state("snapshotId") is None)

        check("no browser script exceptions", not errors, str(errors))
        page.screenshot(path=str(out / "reference-selection-final.png"))
    except Exception as exc:
        errors.append(str(exc))
        raise
    finally:
        summary = {
            "scope": "Synthetic Chromium Reference Selection contract; not Native OS qualification",
            "tests": len(results),
            "pass": sum(item["status"] == "PASS" for item in results),
            "errors": errors,
            "results": results,
        }
        (out / "reference-selection-tests.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"tests": summary["tests"], "pass": summary["pass"], "errors": errors}, ensure_ascii=False))
        browser.close()
