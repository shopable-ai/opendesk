"""Desktop Measurement HTML Interaction Oracle.

This is a synthetic Chromium contract test. It consumes the same modular files
that users open from apps/opendesk/prototypes/desktop-measurement/index.html;
it is not native macOS/Windows acceptance and never claims real AX/UIA evidence.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
repo = root.parents[1]
prototype_dir = repo / "apps/opendesk/prototypes/desktop-measurement"
index_file = prototype_dir / "index.html"
template_file = prototype_dir / "template.html"
css_file = prototype_dir / "prototype.css"
model_file = prototype_dir / "model.js"
interaction_file = prototype_dir / "interaction-core.js"
evidence_dir = repo / ".runtime/tests/desktop-measurement/prototype"
evidence_dir.mkdir(parents=True, exist_ok=True)

results: list[dict] = []
errors: list[str] = []

def check(name: str, condition: bool, detail: str = "") -> None:
    results.append({"name": name, "status": "PASS" if condition else "FAIL", "detail": detail})
    if not condition:
        raise AssertionError(f"{name}: {detail}")

index = index_file.read_text(encoding="utf-8")
template = template_file.read_text(encoding="utf-8")
css = css_file.read_text(encoding="utf-8")
model = model_file.read_text(encoding="utf-8")
interaction = interaction_file.read_text(encoding="utf-8")

check("index 只引用外部 Oracle 资源", '<link rel="stylesheet" href="prototype.css">' in index
      and '<script src="model.js"></script>' in index
      and '<script src="interaction-core.js"></script>' in index
      and "<style" not in index and "function buildSnapshot" not in index)
check("template 不再复制第二套交互", 'url=index.html' in template and "interaction-core.js" not in template and "MeasureDemo" not in template)

# CI inlines the exact checked-in sources after proving that index.html itself
# uses relative direct-open references. This avoids runner-specific file://
# restrictions without introducing a second prototype implementation.
composed = index.replace('<link rel="stylesheet" href="prototype.css">', f"<style>{css}</style>")
composed = composed.replace('<script src="model.js"></script>', f"<script>{model}</script>")
composed = composed.replace('<script src="interaction-core.js"></script>', f"<script>{interaction}</script>")

with sync_playwright() as p:
    exe = shutil.which("chromium") or shutil.which("google-chrome")
    browser = p.chromium.launch(**({"executable_path": exe} if exe else {}), args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.set_content(composed, wait_until="load")
    page.wait_for_timeout(250)

    # `prototype-auto` is a harness-only requestAnimationFrame entry.  Some
    # headless Chromium configurations throttle animation frames for a
    # `set_content` document, so drive the same public entry only when that
    # harness callback has not been scheduled; production entry semantics are
    # exercised below through the three explicit sources.
    if not page.evaluate("MeasureDemo.state.active"):
        page.evaluate("MeasureDemo.begin('browser-test-initial-entry')")

    def state(expr: str):
        return page.evaluate(f"MeasureDemo.state.{expr}")

    def node(name: str):
        return page.evaluate(f"MeasureDemo.nodes.find(n => n.id === {json.dumps(name)})")

    def screen_to_client(point: dict) -> tuple[float, float]:
        origin = page.evaluate("MeasureDemo.origin")
        box = page.locator("#stage").bounding_box()
        return box["x"] + point["x"] - origin["x"], box["y"] + point["y"] - origin["y"]

    def move_to(name: str):
        item = node(name)
        point = {"x": item["rect"]["x"] + item["rect"]["width"] / 2,
                 "y": item["rect"]["y"] + item["rect"]["height"] / 2}
        x, y = screen_to_client(point)
        page.mouse.move(x, y)
        page.wait_for_timeout(160)
        return item, point, x, y

    check("默认进入唯一 MEASURING session", state("active") and state("phase") == "MEASURING" and state("session") == 1)
    check("磁吸定位默认开启", state("magnet") is True and page.locator("#magnet-toggle").get_attribute("class") and "active" in page.locator("#magnet-toggle").get_attribute("class"))
    check("默认工具为 Region", state("mode") == "region")
    check("Toolbar 十项顺序", page.locator("#tools button").all_text_contents() == ["点","区域","两点","两区域","磁吸定位","边距：窗口","更新画面","调整界面","详情","退出"])
    check("Inspector 默认关闭", page.locator("#inspector").is_hidden())
    check("窗口外弱蒙版与目标窗口轮廓存在", page.locator("#overlay path.mask").count() == 1 and page.locator("#overlay rect.window-outline").count() == 1)

    first_token = page.evaluate("MeasureDemo.token()")
    for entry in ["#entry-dev", "#entry-rec", "#entry-key"]:
        page.click(entry)
    check("三入口复用同一 session 和 Snapshot", page.evaluate("MeasureDemo.token()") == first_token and state("session") == 1)

    move_to("input")
    micro = page.locator("#micro").inner_text()
    check("鼠标旁即时显示三级坐标与颜色", all(label in micro for label in ["屏幕", "窗口", "区域", "■ #"]) and "区域   —" not in micro, micro)
    pointer = page.evaluate("MeasureDemo.data().pointer")
    check("颜色来自冻结源像素", pointer["rawPixelColor"]["source"] == "frozen-synthetic-source-pixel" and pointer["rawPixelColor"]["interpolation"] == "none")
    check("语义候选来源被诚实标记", state("candidate.provider") == "synthetic-ui-tree" and state("candidate.reliability") == "fixture-not-native")

    first_candidate = state("candidate.id")
    page.locator("#overlay").focus()
    page.keyboard.press("Tab")
    check("Tab 切换候选层级而不同时铺满", state("candidate.id") != first_candidate and page.locator("#overlay rect.candidate").count() == 1)
    page.keyboard.press("Shift+Tab")
    check("Shift+Tab 可返回更小候选", state("candidate.id") == first_candidate)

    page.keyboard.down("Alt")
    check("Alt 临时暂停磁吸", state("alt") is True and state("candidate") is None)
    page.keyboard.up("Alt")
    page.wait_for_timeout(160)
    check("Alt 松开恢复磁吸", state("alt") is False and state("candidate") is not None)

    _, _, x, y = move_to("input")
    page.mouse.click(x, y)
    data = page.evaluate("MeasureDemo.data()")
    check("Target → Window 边距成立", data["margins"] is not None and data["margins"]["targetToWindow"] is not None)
    check("Target → Local Reference 边距成立", data["localReference"] is not None and data["localReference"]["label"] == "输入区" and data["margins"]["targetToLocal"] is not None)
    check("普通 HUD 最多两组边距", "最多两组边距" in page.locator("#hud-meta").inner_text() and page.locator("#margin-table > span").count() == 15)
    check("Overlay 一次只突出一组四边距", page.locator("#overlay line.margin-line").count() == 4)
    page.click("#margin-toggle")
    check("切换局部参照仍只绘制四条边距线", state("marginView") == "local" and page.locator("#overlay line.margin-line").count() == 4)

    structured = page.evaluate("MeasureDemo.data()")
    check("结构化 Evidence 区分稳定重定位与运行时证据", structured["stableRelocationEvidence"].get("semanticCandidateId") == "input"
          and structured["runtimeEvidence"]["absoluteGeometryIsRuntimeEvidenceOnly"] is True)
    check("结构化 Evidence 包含百分比几何", structured["target"]["windowRelative"]["percentage"] is not None)
    check("percentage metadata 为 0-100", structured["coordinateSpace"]["percentage"] == "percentage-0-100")
    numeric = page.evaluate("MeasureModel.relative({x:25,y:25,width:50,height:50},{x:0,y:0,width:100,height:100})")
    check("percentage 与 ratio 语义分离", numeric["percentage"] == {"x":25,"y":25,"width":50,"height":50} and numeric["areaRatio"] == .25 and numeric["insideRatio"] == 1)

    page.click('[data-mode="point"]')
    _, _, x, y = move_to("send")
    page.mouse.click(x, y)
    point = page.evaluate("MeasureDemo.data().point")
    check("点模式保存源像素色", point is not None and point["color"]["source"] == "frozen-synthetic-source-pixel")

    page.click('[data-mode="pp"]')
    a = node("bubble")["rect"]
    b = node("send")["rect"]
    ax, ay = screen_to_client({"x": a["x"] + 8, "y": a["y"] + 8})
    bx, by = screen_to_client({"x": b["x"] + 8, "y": b["y"] + 8})
    page.mouse.click(ax, ay)
    page.mouse.click(bx, by)
    check("两点距离成立", page.evaluate("MeasureDemo.data().twoPoint.straightDistance") > 0)

    page.click('[data-mode="rr"]')
    stage_box = page.locator("#stage").bounding_box()
    page.mouse.move(stage_box["x"] + 420, stage_box["y"] + 260)
    page.mouse.down()
    page.mouse.move(stage_box["x"] + 500, stage_box["y"] + 320)
    page.mouse.up()
    page.mouse.move(stage_box["x"] + 620, stage_box["y"] + 380)
    page.mouse.down()
    page.mouse.move(stage_box["x"] + 710, stage_box["y"] + 450)
    page.mouse.up()
    check("两区域距离成立", page.evaluate("MeasureDemo.data().spacing") is not None)
    check("两区域 HUD relation summary 可达", "H gap" in page.locator("#hud-size").inner_text() and "center Δ" in page.locator("#hud-meta").inner_text())

    stale_token = page.evaluate("MeasureDemo.token()")
    page.click("#refresh")
    refreshed_token = page.evaluate("MeasureDemo.token()")
    accepted = page.evaluate("token => MeasureDemo.applyAsyncCandidate(token, {id:'stale',label:'stale',rect:{x:1,y:1,width:10,height:10},provider:'synthetic-ui-tree',reliability:'fixture-not-native'})", stale_token)
    check("更新画面创建新 Snapshot/generation", refreshed_token["snapshotId"] != stale_token["snapshotId"] and refreshed_token["generation"] > stale_token["generation"])
    check("旧 Snapshot 异步候选不会污染新 Snapshot", accepted is False and state("candidate") is None)

    before_adjust = page.evaluate("MeasureDemo.token()")
    page.click("#details")
    check("Inspector 只在用户主动请求时打开", page.locator("#inspector").is_visible())
    inspected = json.loads(page.locator("#json-info").inner_text())
    check("无 Result Inspector 仍有 Snapshot Evidence", inspected["snapshot"] == page.evaluate("MeasureDemo.token()") and inspected["windowReference"] is not None)
    page.click("#details")
    check("Details 是 idempotent open", state("inspectorOpen") is True)
    page.keyboard.press("i")
    check("I toggle 关闭 Inspector", state("inspectorOpen") is False)
    page.keyboard.press("i"); page.keyboard.press("Escape")
    check("Esc 先关闭 Inspector", state("active") is True and state("inspectorOpen") is False)
    page.click("#details")
    page.keyboard.down("Alt")
    page.click("#adjust")
    check("调整界面进入 ADJUSTING", state("phase") == "ADJUSTING" and state("adjusting") is True and page.locator("#live-controls").is_visible())
    check("ADJUSTING 不把旧 Snapshot 当当前画面", state("snapshotId") is None and page.evaluate("MeasureDemo.data().snapshot") is None)
    check("ADJUSTING 清理 Alt/pointer/drag", state("alt") is False and state("pointer") is None and state("dragStart") is None)
    check("ADJUSTING 隐藏冻结层/Overlay/HUD/工具条/Inspector", all(page.locator(selector).evaluate("el => getComputedStyle(el).display === 'none'") for selector in ["#scene", "#overlay", "#hud", "#tools", "#inspector"]))
    page.click("#live-scroll")
    page.click("#live-tab")
    page.click("#live-menu")
    page.keyboard.up("Alt")
    page.click("#continue")
    after_adjust = page.evaluate("MeasureDemo.token()")
    check("继续测量重新冻结且 session 不变", state("phase") == "MEASURING" and after_adjust["sessionId"] == before_adjust["sessionId"]
          and after_adjust["snapshotId"] != before_adjust["snapshotId"] and after_adjust["generation"] > before_adjust["generation"])

    page.select_option("#provider", "visual")
    move_to("send")
    visual = page.evaluate("MeasureDemo.state.candidate")
    visual_honest = (visual is None and "未找到可靠候选" in state("status")) or (
        visual is not None and visual["provider"] == "pixel-region-growing"
        and visual["reliability"] == "estimated-not-semantic" and visual.get("role") is None
    )
    check("视觉候选不冒充语义控件", visual_honest)

    page.select_option("#display-mode", "negative")
    page.wait_for_timeout(100)
    check("负坐标显示器保留屏幕逻辑坐标", page.evaluate("MeasureDemo.data().windowReference.bounds.x") < 0)
    page.select_option("#display-mode", "mixed")
    maps = page.evaluate("MeasureDemo.data().displayMapping")
    check("双屏 1x + 2x 映射成立", len(maps) == 2 and maps[0]["scaleX"] == 1 and maps[1]["scaleX"] == 2)

    page.mouse.move(stage_box["x"] + 800, stage_box["y"] + 520); first_micro = page.locator("#micro").bounding_box()
    page.mouse.move(stage_box["x"] + 820, stage_box["y"] + 530); second_micro = page.locator("#micro").bounding_box()
    check("Micro HUD 跟随 pointer", abs(second_micro["x"]-first_micro["x"]-20) < 1 and abs(second_micro["y"]-first_micro["y"]-10) < 1)
    check("Toast 不截获输入", page.locator("#toast").evaluate("el => getComputedStyle(el).pointerEvents") == "none")
    check("没有浏览器脚本异常", not errors, str(errors))

    previous_session = state("session")
    page.keyboard.down("Alt")
    page.click("#exit")
    check("退出清理 Snapshot/Overlay/候选", state("active") is False and state("snapshotId") is None and state("alt") is False
          and page.locator("#scene").evaluate("el => el.childElementCount") == 0 and page.locator("#overlay").evaluate("el => el.childElementCount") == 0
          and all(page.locator(sel).is_hidden() for sel in ["#scene","#overlay","#micro","#hud","#tools","#status","#inspector","#toast"]))
    page.keyboard.press("Tab")
    check("退出后测量快捷键不继续消费输入", state("active") is False)
    page.keyboard.up("Alt")
    page.click("#entry-rec")
    check("退出后 Recorder 入口创建新 session", state("session") == previous_session + 1 and state("phase") == "MEASURING" and state("magnet") is True and state("alt") is False)

    page.screenshot(path=str(evidence_dir / "final-modular-oracle.png"))
    browser.close()

summary = {
    "scope": "Synthetic Chromium interaction oracle using checked-in modular prototype sources; not native OS acceptance",
    "tests": len(results),
    "pass": sum(item["status"] == "PASS" for item in results),
    "errors": errors,
    "results": results,
}
(evidence_dir / "browser-tests.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"tests": summary["tests"], "pass": summary["pass"], "errors": errors}, ensure_ascii=False))
