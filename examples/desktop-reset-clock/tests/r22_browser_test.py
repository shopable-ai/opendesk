#!/usr/bin/env python3
"""Real Chromium visual oracle for existing Reset Clock R2.2 HTML.
Outputs screenshots only to ignored .runtime/tests/desktop-reset-clock/r22/.
Not a native AppKit/Win32 validation or source authenticity test.
"""
from __future__ import annotations
import json
import math
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[3]
HTML=ROOT/"examples/desktop-reset-clock/prototypes/r22-client-preview.html"
OUTPUT=ROOT/".runtime/tests/desktop-reset-clock/r22"
OUTPUT.mkdir(parents=True,exist_ok=True)
evidence=[]

def assert_text(page,locator,part):
    value=page.locator(locator).inner_text()
    assert part in value,(locator,part,value)
    return value

def shot(page,name):
    path=OUTPUT/(name+".png")
    page.screenshot(path=str(path),animations="disabled",full_page=True)
    evidence.append({"screenshot":path.name,"state":name,"viewport":page.viewport_size})

def color_ratio(a,b):
    def rgb(s):
        nums=[int(x) for x in re.findall(r"[\d.]+",s)[:3]]
        assert len(nums)==3,(s,nums)
        return nums
    def luminance(v):
        xs=[x/255 for x in v]
        ys=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in xs]
        return 0.2126*ys[0]+0.7152*ys[1]+0.0722*ys[2]
    x,y=luminance(rgb(a)),luminance(rgb(b))
    return (max(x,y)+0.05)/(min(x,y)+0.05)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={"width":1366,"height":900},device_scale_factor=1,locale="zh-CN")
    page=context.new_page()
    errors=[]
    page.on("pageerror",lambda err: errors.append(str(err)))
    page.goto(HTML.as_uri(),wait_until="load")
    assert_text(page,"#count","小时")
    assert "秒" not in page.locator("#count").inner_text()
    assert_text(page,"#card-status","来源预告")
    assert page.locator("#card").bounding_box()["width"]==386
    compact_height=page.locator("#card").bounding_box()["height"]
    assert 150<=compact_height<=215,compact_height
    assert page.locator("#ticker-single").is_visible()
    assert_text(page,"#ticker-index","1 / 3")
    assert page.locator("#expanded-news").is_hidden()
    shot(page,"01-card-collapsed-overview-free")
    assert_text(page,"#metrics",".") if False else None
    assert page.locator("#metrics .metric").count()==4
    assert page.locator("#metrics .metric.locked").count()==2
    assert_text(page,"#metrics","未开放")
    contrast=page.evaluate("""() => ({
      bg:getComputedStyle(document.querySelector('.compact')).backgroundColor,
      fg:getComputedStyle(document.querySelector('.count-label')).color
    })""")
    ratio=color_ratio(contrast["bg"],contrast["fg"])
    assert ratio>=4.5,("count-label contrast",ratio,contrast)

    # Manual page controls do not fetch or open any modal.
    page.locator("#next").click()
    assert_text(page,"#ticker-index","2 / 3")
    page.locator("#prev").click()
    assert_text(page,"#ticker-index","1 / 3")
    page.locator("#expand").click()
    assert page.locator("#expanded-news").is_visible()
    assert page.locator("#expanded-news .ticker-expanded-item").count()==3
    assert 200<=page.locator("#card").bounding_box()["height"]<=455
    assert page.locator("#expand").get_attribute("aria-expanded")=="true"
    shot(page,"02-card-expanded")
    page.locator("#expand").click()
    assert page.locator("#expanded-news").is_hidden()

    # Tab structure, month switch and Free/Mock Pro entitlement.
    page.locator("#tab-history").click()
    assert page.locator("#panel-history").is_visible()
    assert_text(page,"#history-timeline","来源预告")
    shot(page,"03-history-free")
    page.locator("#tab-news").click()
    assert page.locator("#panel-news").is_visible()
    assert page.locator("#news-stories .story").count()==3
    shot(page,"04-news-source-list")
    page.locator("#tab-overview").click()
    page.locator('[data-period="month"]').click()
    assert_text(page,"#period-note","本月")
    shot(page,"05-overview-month")
    page.locator('[data-tier="pro"]').click()
    assert page.locator("#metrics .metric.locked").count()==0
    assert "未开放" not in page.locator("#metrics").inner_text()
    shot(page,"06-overview-mock-pro")
    page.locator('[data-tier="free"]').click()

    # Six states: published, revision, withdrawn, stale, no data, long headline.
    for code,label in [("v2","更正"),("v3","撤回"),("stale","来源异常"),
                       ("empty","没有可用"),("long","来源预告"),("v1","来源预告")]:
        page.locator('[data-scenario="'+code+'"]').click()
        assert_text(page,"#card-status",label)
        shot(page,"07-status-"+code)
        if code=="v3":
            assert_text(page,"#count","公告已撤回")
            assert page.locator("#expanded-news .ticker-expanded-item").count()==0
            assert page.locator("#ticker-index").inner_text().endswith("/ 2")
            page.locator("#tab-news").click()
            assert_text(page,"#news-stories","已撤回")
            shot(page,"08-revoked-history-only")
            page.locator("#tab-overview").click()
        if code=="stale":
            assert page.locator("#ticker-index").inner_text()=="0 / 0"
            assert not page.locator("#ticker-single").is_visible()
            assert_text(page,"#metrics","数据不足")
        if code=="empty":
            assert page.locator("#ticker-index").inner_text()=="0 / 0"
            assert_text(page,"#count","暂无确定时间")
        if code=="long":
            title=page.locator("#ticker-text").inner_text()
            assert len(title)>65
            assert page.locator("#ticker-text").evaluate("(e)=>e.scrollWidth>e.clientWidth")
            assert page.locator("#card").bounding_box()["height"]<=215
            shot(page,"09-long-chinese-truncation")

    # Keyboard operation; focus must stop ticker even after pointer leaves card.
    page.locator("#tab-overview").focus()
    page.keyboard.press("ArrowRight")
    assert page.locator("#tab-history").get_attribute("aria-selected")=="true"
    page.keyboard.press("End")
    assert page.locator("#tab-news").get_attribute("aria-selected")=="true"
    page.keyboard.press("Home")
    assert page.locator("#tab-overview").get_attribute("aria-selected")=="true"

    page.locator("#card").hover()
    page.locator("#next").focus()
    page.mouse.move(0,0)
    focused_index=page.locator("#ticker-index").inner_text()
    page.wait_for_timeout(6200)
    assert page.locator("#ticker-index").inner_text()==focused_index,"focused ticker advanced"
    page.locator("#tab-overview").focus()
    page.wait_for_timeout(6200)
    assert page.locator("#ticker-index").inner_text()!=focused_index,"resumed ticker did not rotate"
    shot(page,"10-keyboard-focus-and-rotation")

    # Compact/narrow layouts and CSS zoom are separate from OS-level DPI testing.
    for width in [375,460,980]:
        page.set_viewport_size({"width":width,"height":830})
        page.locator('[data-scenario="v1"]').click()
        assert page.locator("#card").bounding_box()["width"]<=386
        assert page.locator("#card").bounding_box()["x"]>=0
        assert page.locator("#ticker-single").is_visible()
        shot(page,"11-viewport-"+str(width))
    page.set_viewport_size({"width":1366,"height":900})
    for factor in [1,1.5,2]:
        page.evaluate("(x)=>document.body.style.zoom=String(x)",factor)
        shot(page,"12-csszoom-"+str(factor).replace(".","_"))
        assert page.locator("#card").bounding_box()["width"]>0

    assert not errors,("browser JS errors",errors)
    page.close()
    context.close()
    reduced=browser.new_context(reduced_motion="reduce",viewport={"width":960,"height":780})
    rp=reduced.new_page()
    rp.goto(HTML.as_uri())
    assert rp.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
    shot(rp,"13-reduced-motion")
    assert rp.locator("#ticker-index").inner_text()=="1 / 3"
    reduced.close()
    browser.close()

(OUTPUT/"browser-results.json").write_text(json.dumps({
  "test":"R2.2 Chromium visual oracle",
  "source":"examples/desktop-reset-clock/prototypes/r22-client-preview.html",
  "note":"Playwright rendering is not native desktop validation; CSS zoom is not OS DPI",
  "count":len(evidence),"contrast_count_label":round(ratio,2),
  "screenshots":evidence,"js_errors":errors
},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("R22_BROWSER_PASS screenshots=",len(evidence),"contrast=",round(ratio,2),flush=True)
