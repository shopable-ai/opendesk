#!/usr/bin/env python3
"""Browser-only prototype checks; does not start OpenDesk or call a real marketplace.

Prerequisite: Python 3.10+, playwright and a Chromium browser.
From repository root: python tests/prototypes/marketplace-smoke.py
Use --browser-executable for an existing browser, --set-content only where browser
policy blocks local URLs. That mode validates DOM interactions, not URL delivery
or localStorage persistence (the Node model tests cover storage separately).
"""
from __future__ import annotations
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / 'apps/opendesk/prototypes/marketplace/index.html'
OUT = ROOT / '.runtime/tests/marketplace-prototype'

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_: object) -> None:
        pass

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser-executable')
    parser.add_argument('--set-content', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/apps/opendesk/prototypes/marketplace/index.html'
    reports: list[dict] = []
    try:
        with sync_playwright() as p:
            options = {'headless': True}
            if args.browser_executable:
                options['executable_path'] = args.browser_executable
            browser = p.chromium.launch(**options)

            def exercise(name, callback, width=1440, height=1100):
                context = browser.new_context(viewport={'width': width, 'height': height})
                page = context.new_page()
                errors, requests = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
                page.on('request', lambda req: requests.append(req.url))
                page.set_default_timeout(4000)
                try:
                    if args.set_content:
                        page.set_content(HTML.read_text(encoding='utf-8'))
                    else:
                        page.goto(url)
                    callback(page)
                    assert not errors, errors
                    assert not [r for r in requests if not r.startswith(f'http://127.0.0.1:{server.server_port}/')], requests
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), 'horizontal overflow'
                    reports.append({'name': name, 'status': 'pass'})
                except Exception as error:
                    page.screenshot(path=str(OUT / 'failure.png'), full_page=True)
                    reports.append({'name': name, 'status': 'fail', 'error': str(error)})
                    raise
                finally:
                    context.close()

            def click(page, action):
                page.locator(f'[data-action="{action}"]:visible').first.click()

            def detail(page, index=0):
                page.locator('.flow-card .title').nth(index).click()
                expect(page.locator('[data-action="install"]')).to_be_visible()

            def settings(page, scenario='normal', device='macOS'):
                click(page, 'settings')
                page.locator('#scenario').select_option(scenario)
                page.locator('#device').select_option(device)
                click(page, 'save-settings')

            def approve(page):
                page.locator('#permissions').check()
                click(page, 'begin')
                expect(page.locator('[data-action="commit"]')).to_be_visible()

            def normal(page):
                expect(page.locator('.flow-card')).to_have_count(6)
                page.screenshot(path=str(OUT / 'market-desktop.png'), full_page=True)
                detail(page)
                page.screenshot(path=str(OUT / 'detail-desktop.png'), full_page=True)
                click(page, 'install')
                expect(page.locator('#dialog-context')).to_contain_text('网页')
                click(page, 'accept')
                expect(page.locator('#confirm-install')).to_be_disabled()
                approve(page)
                expect(page.locator('input[value="flow"]')).to_be_checked()
                page.screenshot(path=str(OUT / 'trust-desktop.png'))
                click(page, 'commit')
                expect(page.locator('#dialog-title')).to_have_text('安装完成，尚未运行')
                page.screenshot(path=str(OUT / 'installed-desktop.png'))
                click(page, 'finish-local')
                expect(page.locator('.local-item')).to_have_count(1)
                expect(page.locator('#run-count')).to_have_text('0')
                click(page, 'run')
                expect(page.locator('#run-count')).to_have_text('0')
                click(page, 'run-confirm')
                expect(page.locator('#run-count')).to_have_text('1')
                click(page, 'remove')
                click(page, 'remove-confirm')
                expect(page.locator('.local-item')).to_have_count(0)

            exercise('browse → desktop confirmation → flow trust → install, never autorun → explicit run → remove', normal)

            def filters(page):
                page.locator('#search').fill('日报')
                expect(page.locator('.flow-card')).to_have_count(1)
                page.locator('#price-filter').select_option('free')
                expect(page.locator('.empty')).to_be_visible()
                click(page, 'clearfilters')
                expect(page.locator('.flow-card')).to_have_count(6)
                page.locator('[data-action="category"][data-value="桌面工具"]').click()
                page.locator('[data-action="platform"][data-value="Windows"]').click()
                expect(page.locator('.flow-card')).to_have_count(1)
                expect(page.locator('.flow-card .title')).to_have_text('到点提醒')
            exercise('search, price, category, platform and empty-state reset', filters)

            def paid(page):
                detail(page, 1)
                click(page, 'install'); click(page, 'accept'); click(page, 'license')
                expect(page.locator('#dialog-context')).to_contain_text('不会扣费')
                click(page, 'grant')
                expect(page.locator('#confirm-install')).to_be_disabled()
                expect(page.locator('#permissions')).not_to_be_checked()
                approve(page); click(page, 'commit'); click(page, 'finish-local')
                expect(page.locator('#run-count')).to_have_text('0')
            exercise('paid entitlement is separate from installation and run', paid)

            def publisher_scope(page):
                detail(page); click(page, 'install'); click(page, 'accept'); approve(page)
                page.locator('#dialog-body summary').click()
                page.locator('input[value="publisher"]').check()
                expect(page.locator('#commit-button')).to_be_disabled()
                page.locator('#broad').check()
                expect(page.locator('#commit-button')).to_be_enabled()
                page.locator('input[value="flow"]').check()
                expect(page.locator('#commit-button')).to_have_text('批准此 Flow 并安装')
                click(page, 'commit'); click(page, 'finish-local')
            exercise('publisher-wide trust is advanced, explicit, and not preselected', publisher_scope)

            def missing(page):
                settings(page, 'noapp'); detail(page); click(page, 'install')
                expect(page.locator('#dialog-title')).to_contain_text('还没有安装')
                click(page, 'manual')
                expect(page.locator('#dialog-body')).to_contain_text('普通源码原型不提供客户端或真实安装资源')
                click(page, 'handoff'); click(page, 'client-ready')
                expect(page.locator('#dialog-title')).to_have_text('确认安装 Flow')
            exercise('missing client and manual .odflow instructions', missing)

            def unconfirmed(page):
                settings(page, 'unconfirmed'); detail(page); click(page, 'install')
                expect(page.locator('#dialog-body')).to_contain_text('未收到客户端响应 ≠ 客户端未安装')
                expect(page.locator('#dialog-title')).not_to_contain_text('完成')
            exercise('no browser callback never implies missing app or successful install', unconfirmed)

            def failure_case(scenario, text):
                def callback(page):
                    settings(page, scenario); detail(page); click(page, 'install'); click(page, 'accept')
                    if scenario != 'revoked':
                        page.locator('#permissions').check(); click(page, 'begin')
                        if scenario == 'writefail':
                            click(page, 'commit')
                    expect(page.locator('#dialog-title')).to_have_text(text)
                    page.screenshot(path=str(OUT / f'{scenario}-desktop.png'))
                    click(page, 'finish'); click(page, 'local')
                    expect(page.locator('.local-item')).to_have_count(0)
                    expect(page.locator('#run-count')).to_have_text('0')
                return callback
            for scenario, title in [('network','网络连接中断'),('integrity','安装包校验失败'),('revoked','此版本已撤回'),('writefail','安装写入失败')]:
                exercise(f'{scenario} stops without installation', failure_case(scenario,title))

            def cancelled(page):
                detail(page); click(page, 'install'); click(page, 'accept')
                page.locator('#permissions').check(); click(page, 'begin'); click(page, 'close')
                page.wait_for_timeout(700)
                expect(page.locator('#dialog')).not_to_be_visible()
                click(page, 'local')
                expect(page.locator('.local-item')).to_have_count(0)
            exercise('cancellation prevents delayed installation', cancelled)

            def incompatible(page):
                settings(page, device='Windows'); detail(page,4)
                click(page, 'install'); click(page, 'accept'); page.locator('#permissions').check()
                expect(page.locator('#confirm-install')).to_be_disabled()
                expect(page.locator('#dialog-body')).to_contain_text('不兼容')
            exercise('platform mismatch remains blocked after consent', incompatible)

            def update(page):
                click(page, 'settings'); click(page, 'seed')
                expect(page.locator('.local-item')).to_contain_text('1.1.0')
                click(page, 'install'); click(page, 'accept')
                expect(page.locator('#dialog-title')).to_have_text('确认更新 Flow')
                expect(page.locator('#dialog-body')).to_contain_text('更新案例新增权限')
                expect(page.locator('#confirm-install')).to_be_disabled()
                approve(page); click(page,'commit'); click(page,'finish-local')
                expect(page.locator('.local-item')).to_contain_text('1.2.0')
                expect(page.locator('#run-count')).to_have_text('0')
            exercise('update requires renewed permission consent and never runs', update)

            def keyboard(page):
                detail(page)
                page.locator('.tab').first.focus(); page.keyboard.press('ArrowRight')
                expect(page.locator('.tab[aria-selected="true"]')).to_have_text('使用说明')
                click(page,'install'); page.keyboard.press('Escape')
                expect(page.locator('#dialog')).not_to_be_visible()
                expect(page.locator('[data-action="install"]')).to_be_focused()
                click(page,'install'); click(page,'accept'); approve(page); click(page,'commit')
                page.keyboard.press('Escape')
                expect(page.locator('#main [data-action="local"]')).to_have_text('在本机演示中查看')
            exercise('keyboard tabs, Escape, focus restore and completed-state refresh', keyboard)

            def malformed_hash(page):
                page.evaluate("location.hash='flow/<img-onerror>'")
                expect(page.locator('.flow-card')).to_have_count(6)
                expect(page.locator('#main img')).to_have_count(0)
            exercise('unknown route safely returns to the catalog', malformed_hash)

            for width in [320,390,768,1280]:
                def responsive(page, width=width):
                    expect(page.locator('.flow-card')).to_have_count(6)
                    guide = page.locator('.side-guide')
                    expect(guide).to_be_visible()
                    expect(guide.locator('.side-guide-title')).to_contain_text('第一次使用？')
                    expect(guide.locator('[data-action="guide"]')).to_have_text('查看安装指南 →')
                    assert guide.evaluate("el=>getComputedStyle(el).position") != 'fixed', 'help row must remain in document flow'
                    if width > 740:
                        metrics = page.locator('.sidebar').evaluate("""el=>{
                          const g=el.querySelector('.side-guide'), sb=el.getBoundingClientRect(), gb=g.getBoundingClientRect(), cs=getComputedStyle(g), side=getComputedStyle(el);
                          const title=g.querySelector('.side-guide-title').getBoundingClientRect();
                          const icon=g.querySelector('.guide-icon').getBoundingClientRect();
                          const h=g.querySelector('h3').getBoundingClientRect();
                          const contentBottom=sb.bottom-parseFloat(side.paddingBottom||'0');
                          return {bottom:Math.abs(contentBottom-gb.bottom),radius:cs.borderRadius,borderTop:cs.borderTopWidth,margins:[cs.marginTop,cs.marginRight,cs.marginBottom,cs.marginLeft],titleDelta:Math.abs((icon.top+icon.height/2)-(h.top+h.height/2)),titleHeight:title.height};
                        }""")
                        assert metrics['bottom'] <= 2, f"desktop guide not docked to sidebar content bottom: {metrics}"
                        assert metrics['margins'] == ['0px','0px','0px','0px'], f"desktop guide must have zero outer margin: {metrics}"
                        assert metrics['radius'] == '0px' and metrics['borderTop'] != '0px', f"desktop guide still looks like a card: {metrics}"
                        assert metrics['titleDelta'] <= 2.5, f"guide icon/title not vertically aligned: {metrics}"
                    else:
                        assert guide.locator('p').evaluate("el=>getComputedStyle(el).display") == 'none', 'mobile help row should stay compact'
                        margins = guide.evaluate("el=>{const cs=getComputedStyle(el);return [cs.marginTop,cs.marginRight,cs.marginBottom,cs.marginLeft]}")
                        assert margins == ['0px','0px','0px','0px'], f"mobile guide must have zero outer margin: {margins}"
                    if width == 390:
                        page.screenshot(path=str(OUT / 'market-mobile.png'), full_page=True)
                    detail(page); click(page,'install'); click(page,'accept'); approve(page)
                    assert not page.locator('#dialog').evaluate('el=>el.scrollWidth > el.clientWidth'), 'dialog overflow'
                    page.screenshot(path=str(OUT / f'trust-{width}.png'))
                exercise(f'responsive layout and installation dialog at {width}px', responsive, width,844)
            browser.close()
    finally:
        server.shutdown(); server.server_close()
        report={'mode':'set-content' if args.set_content else 'local-http','checks':reports,'nativeRuntime':'not run','productionNetwork':'not called'}
        (OUT/'browser-tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{len(reports)} browser checks passed ({report["mode"]}); evidence: {OUT}')

if __name__ == '__main__':
    main()
