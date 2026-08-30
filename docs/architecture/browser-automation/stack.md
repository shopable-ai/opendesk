# Browser automation stacks in testMonkey-go

This project now supports dual-stack browser automation surfaces without removing the original legacy behavior.

Stacks
- legacy: existing page-centric API remains the default
- upgraded: compatibility facade that normalizes stable capabilities such as open/getPage/getContext/getBrowser/query/locator/waitFor/click/type/press/evaluate/screenshot/cookies/storage/session/close
- playwright: aliases the upgraded facade as the default runtime surface for new scripts and exposes `playwright.chromium.launch()` as a shim over the upgraded browser/context/page facades

Why this exists
- historical scripts in this repo depend on legacy `page.*`, `mouse.*`, `keyboard.*`, and permissive Puppeteer-like `waitFor(...)`
- newer migration work needs explicit `browser/context/page` layering and a more Playwright-shaped entrypoint
- the project should not force business scripts to bind forever to one native library or one era of semantics

Runtime selection
CLI:
- `go run main.go -script examples/agent_direct_smoke.js -stack legacy`
- `go run main.go -script examples/agent_direct_smoke.js -stack upgraded`
- `go run main.go -script examples/agent_direct_smoke.js -stack playwright`

HTTP:
- `POST /executions` or legacy `POST /SCRIPT_RUN`
- body may include `"stack": "legacy" | "upgraded" | "playwright"`
- request payload examples live in:
  - `examples/browser_stack_http_upgraded_smoke.js`
  - `examples/browser_stack_http_playwright_smoke.js`
- real verification guide: `docs/browser-automation-http-smoke-guide.md`
- real probe script: `examples/browser_stack_http_e2e_smoke.py`

Injected globals
- legacy: `page`, `mouse`, `keyboard`, `touchscreen`
- preserved raw inject handles: `page____Inject`, `browser____Inject`, `context____Inject`
- compatibility facades: `pageUpgraded`, `browserUpgraded`, `contextUpgraded`
- convenience namespace: `Automation.getLegacy()`, `Automation.getUpgraded()`, `Automation.getPlaywrightFacade()`
- playwright-style shim: `playwright.chromium.launch()`

Current shim contract
- `pageUpgraded.getBrowser()` / `pageUpgraded.getContext()` now prefer real page ownership metadata when the backing page provides `Browser()` / `Context()`; when that ownership is unavailable they still conservatively fall back to upgraded facades
- `browserUpgraded.pages()` returns upgraded page facades when the browser can enumerate pages, and falls back to `[pageUpgraded]` when only the singleton page exists
- `browserUpgraded.getPage()` and `contextUpgraded.getPage()` fall back to `pageUpgraded` when no tracked page exists yet
- `browserUpgraded.open({ url, appName })` is a routing shim: it delegates URL opening through the current page facade and returns a context facade when one is available
- `playwright.chromium.launch({ url, appName })` is also a routing shim over `browserUpgraded.open(...)`, not a real browser-process launch contract
- locator instances preserve their owning page facade and route `click/type/press/waitFor/evaluate/screenshot` back through that page instead of reading a global singleton blindly
- `page.close()` delegates to the active context facade; `context.close()` and `browser.close()` delegate to the underlying container when available
- page ownership metadata is still minimal and conservative:
  - Go `Page` instances now record owning browser/context metadata when adopted by a context
  - `pageUpgraded.getBrowser()` / `pageUpgraded.getContext()` now prefer that backing page ownership when it exists
  - this improves ownership introspection only; it does not yet create an independent page-owned closed-state contract or page-detach lifecycle
- Go container semantics are stricter than facade wording today:
  - `browser.NewPage()` errors after `browser.Close()`
  - `context.NewPage()` errors after `context.Close()`
  - `context.NewPage()` also errors when its owning browser is already closed
- facade-level closed-state introspection is intentionally limited:
  - `browser.isClosed()` and `context.isClosed()` expose backing closed-state when available
  - `playwright.chromium.launch()` returns a compatibility handle that also exposes `isClosed()`
  - `page` still does not promise an independent page-owned closed-state contract; `page.close()` remains context-close delegation
- repeated `page/context/browser close()` calls are still treated as stable delegation surfaces; this shim does not yet promise a stricter one-shot error contract at the facade layer
- `browser.newContext()` now also rejects already-closed browser handles at the facade boundary with `browser is closed`, but other getters remain conservative compatibility views rather than strict lifecycle invalidation

Evidence-backed smoke entrypoints
- `examples/browser_stack_legacy_smoke.js` validates legacy wait path and now emits standardized top-level smoke evidence fields
- `examples/browser_stack_upgraded_smoke.js` validates upgraded locator/getter routing and now emits standardized top-level smoke evidence fields plus stack-specific checks
- `examples/browser_stack_playwright_smoke.js` validates launch/newContext/newPage facade chain and now emits standardized top-level smoke evidence fields plus stack-specific checks
- `examples/browser_stack_macos_app_smoke.js` validates one real macOS default app path with availability fallback and screenshot evidence
- `examples/browser_stack_http_upgraded_smoke.js` and `examples/browser_stack_http_playwright_smoke.js` provide canonical HTTP request payload examples for stack selection verification
- `examples/browser_stack_http_e2e_smoke.py` now emits standardized top-level smoke evidence fields (`ok`, `stack`, `selectedApp`, `skipped`, `runtimeNote`, `finalStatus`, `executionId`, `artifactDir`, `proofLevel`, `boundaryNote`) while preserving HTTP-specific execution handles
- `scripts/test_browser_stack_http_smoke.sh` now aggregates upgraded/playwright HTTP evidence into a unified `report.json`
- for HTTP smoke review, treat the wrapper / report JSON as the authoritative structured evidence layer; embedded script logs are only execution breadcrumbs and must not be read as a second summary contract

Legacy escape hatch guidance
- raw globals such as `globalThis.page____ChromePage____Object` are not part of the upgraded/playwright contract
- see `docs/browser-automation-legacy-escape-hatches.md` for migration guidance and evidence boundaries

Important limitations
- this is an interface migration layer, not a real embedded Chromium/Playwright runtime yet
- many modern selector/evaluate semantics still need deeper implementation in Go before full parity is possible
- `locator.click/type/press/waitFor/evaluate/screenshot` are currently routing facades; they validate ownership and delegation, not full DOM semantics
- `browser.open({ url })` and `playwright.chromium.launch({ url })` currently validate routing and returned facade shape, not real tab/session semantics
- close() currently guarantees routing consistency, not one-shot lifecycle enforcement semantics
- closed-state contract is intentionally limited: `browser.close()`, `context.close()`, and facade `page.close()` are only promised to route repeatedly to the underlying close handler when present; callers must not assume a strict one-shot error after first close yet
- scripts that relied on raw external browser objects such as `globalThis.page____ChromePage____Object` remain legacy-special cases and should be migrated deliberately
