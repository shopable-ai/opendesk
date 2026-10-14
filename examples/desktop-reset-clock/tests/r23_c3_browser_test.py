#!/usr/bin/env python3
"""C3 approved HTML baseline. This checks native art asset identity and captures
browser layout evidence, not a screenshot of a real AppKit or Win32 process.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
PREVIEW = ROOT / "examples/desktop-reset-clock/prototypes/r23-c3-reference-inspired-hero.html"
NATIVE_ART = ROOT / "examples/desktop-reset-clock/internal/desktop/assets/r23-c3-reference-hero.webp"
OUTPUT = ROOT / ".runtime/tests/desktop-reset-clock/c3"
OUTPUT.mkdir(parents=True, exist_ok=True)

html = PREVIEW.read_bytes()
found = re.search(rb"data:image/webp;base64,([A-Za-z0-9+/=]+)", html)
assert found, "C3 preview must be self-contained and render its approved art offline"
inline_art = base64.b64decode(found.group(1), validate=True)
assert inline_art == NATIVE_ART.read_bytes(), "Native embedded WebP differs from approved C3 preview artwork"

shots = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1240, "height": 930}, device_scale_factor=2, locale="zh-CN"
    )
    context.route("http://**/*", lambda route: route.abort())
    context.route("https://**/*", lambda route: route.abort())
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(PREVIEW.as_uri(), wait_until="load")
    card = page.locator("#card")
    img = page.locator("#hero-art img")
    assert abs(card.bounding_box()["width"] - 386) < 1, card.bounding_box()
    assert img.evaluate("(e)=>e.complete && e.naturalWidth>0"), "C3 artwork failed to decode"
    assert page.locator("#news-list .news-row").count() == 3
    assert page.locator("#countdown strong").count() == 2
    assert page.locator("#countdown small").count() == 2
    assert page.locator(".news").evaluate("(e)=>getComputedStyle(e).position") == "relative"
    styles = page.evaluate("""() => ({
        number: parseFloat(getComputedStyle(document.querySelector('#countdown strong')).fontSize),
        unit: parseFloat(getComputedStyle(document.querySelector('#countdown small')).fontSize),
        news: parseFloat(getComputedStyle(document.querySelector('.news-title')).fontSize)
    })""")
    assert styles["number"] >= 45 and styles["unit"] <= 17 and styles["news"] <= 13, styles

    def shot(name: str):
        path = OUTPUT / (name + ".png")
        page.screenshot(path=str(path), full_page=True, animations="disabled")
        shots.append(name + ".png")

    shot("01-approved-c3-forecast-2x")
    for scenario, count in [("revised", 3), ("withdrawn", 2), ("stale", 0), ("empty", 0), ("long", 3)]:
        page.locator("#scenario").select_option(scenario)
        assert page.locator("#news-list .news-row").count() == count, scenario
        assert abs(card.bounding_box()["width"] - 386) < 1
        if scenario == "long":
            title = page.locator("#news-list .news-title").first
            assert title.evaluate("(e)=>e.scrollWidth>e.clientWidth")
        shot("02-state-" + scenario)
    page.locator("#scenario").select_option("forecast")
    page.locator("#art-mode").select_option("decor")
    assert page.locator("#hero-art").is_hidden()
    shot("03-native-gradient-fallback")
    page.locator("#art-mode").select_option("promo")
    assert page.locator("#hero-art").is_visible()
    assert not errors, errors
    browser.close()

(OUTPUT / "c3-visual-results.json").write_text(json.dumps({
    "source": str(PREVIEW.relative_to(ROOT)),
    "art_source": str(NATIVE_ART.relative_to(ROOT)),
    "art_sha256": hashlib.sha256(inline_art).hexdigest(),
    "same_image_as_native_go_embed": True,
    "scope": "Browser HTML and exact artwork parity, not native OS screenshot",
    "states": shots,
    "text_styles_px": styles,
    "js_errors": errors
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("R23_C3_BROWSER_PASS", len(shots), "art_sha256", hashlib.sha256(inline_art).hexdigest())
