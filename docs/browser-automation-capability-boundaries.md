# Browser automation capability boundaries

Purpose
- give maintainers one place to see which browser-automation claims are evidence-backed
- separate facade shape, shim behavior, runtime support, and private/raw escape hatches
- prevent Playwright-shaped naming from being overstated as full Playwright runtime semantics

Proof taxonomy
- facade proof: a public JS-facing method/shape is exposed and routed consistently in tests
- shim support: a compatibility surface intentionally imitates another API family, but only within the documented routing contract
- runtime proof: Go/runtime code exists for the behavior and is exercised by automated tests
- real-environment proof: the runtime path was exercised against the actual CLI/HTTP/macOS environment, with observable evidence
- private/raw-path only: capability exists only through legacy globals or implementation-specific objects outside the supported facade contract

Reading rules
- “supported” must always be interpreted together with the proof level
- facade proof or shim support is not equal to full browser/tab/DOM semantics
- if a row has no runtime proof or real-environment proof, it must not be described as full Playwright behavior

Capability matrix

| Capability | legacy | upgraded | playwright | Proof level | Evidence | Known gaps / boundaries | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Runtime stack selection (`legacy/upgraded/playwright`) | default | aliases `page` to upgraded facade | aliases `page/browser/context` to upgraded facades | facade proof + runtime proof + real-environment proof | `automation/runtime_stack.go`; `automation/browser_compat_test.go` (`TestApplyRuntimeStackMode*`); `pkg/execution/runner_test.go`; `pkg/http/handler_test.go`; CLI/HTTP smoke scripts | selects surface only; does not upgrade underlying runtime semantics by itself | core migration control plane |
| Raw inject surfaces (`page____Inject`, `browser____Inject`, `context____Inject`) | yes | preserved underneath facade | preserved underneath facade | runtime proof | `automation/utils.go`; `TestInitJSInjectsLegacyRawHandles` | not a public modern contract; intended for compatibility/polyfill layering | foundational for dual-stack load order |
| `page.open()` / `browser.open()` / `playwright.chromium.launch({url})` routing | legacy mainly uses `page.goto/openURL/openApp` directly | yes, via facade routing | yes, via launch shim routing into upgraded browser/page | facade proof + shim support + partial runtime proof + partial real-environment proof | `polyfills/010-browser-automation-upgraded.js`; `automation/page.go` (`Goto/OpenURL/OpenURLInApp/OpenApp`); tests `TestUpgradedPageOpenRoutesToGotoOrOpenURL`, `TestUpgradedBrowserOpenRoutesURLThroughPageFacade`, `TestPlaywrightLaunchWithURLRoutesThroughBrowserOpen`; examples `browser_stack_upgraded_smoke.js`, `browser_stack_playwright_smoke.js`, `browser_stack_macos_app_smoke.js` | open/goto uses OS/app launch semantics, not tab creation/navigation lifecycle; `launch()` is not a real browser-process bootstrap | should be reported as routing proof, not full browser runtime proof |
| Navigation URL/title observation | `page.goto()` and `page.url()/title()` available | inherited through facade | inherited through shim | partial runtime proof + limited real-environment proof | `automation/page.go` (`Goto`, `Url`, `Title`); macOS smoke script/title evidence | `Url()` returns stored executable path, not authoritative DOM URL; `Title()` reflects active window title; no tab/navigation event model | very easy to overclaim; maintain strict wording |
| `waitFor(number)` | yes | yes | yes | runtime proof + facade proof + real-environment proof | legacy polyfill `000-page.js`; `Page.WaitFor`; tests `TestUpgradedPageWaitForSupportsNumberAndSelectorFallback`; all three CLI stack smokes | timer/sleep semantics only; not selector or network idle semantics | safest currently-backed waiting capability |
| `waitFor(function)` | legacy polyfill supports function polling | not a first-class upgraded contract | only inherited if using legacy page object directly | legacy-only runtime/facade proof | `polyfills/000-page.js` | upgraded/playwright docs should not imply Playwright-style predicate waiting parity | legacy compatibility behavior |
| `waitForSelector` / selector wait | not native Go runtime | facade routes only when owner exposes selector wait; otherwise explicit unsupported error | same via shim | facade proof / shim support only | `polyfills/010-browser-automation-upgraded.js`; tests `TestUpgradedPageWaitForSupportsNumberAndSelectorRouting`, `TestUpgradedPageSupportsUpperCamelFallbackMethods`, missing-method negative tests | no DOM selector engine; no evidence that selectors map to real document nodes; no longer silently degrades to timeout-only behavior when selector routing is missing | must be described as selector-shaped routing surface |
| `locator(selector)` object shape | no | yes | yes | facade proof + shim support | `createLocator` in `010-browser-automation-upgraded.js`; tests `TestUpgradedPageLocatorReturnsSelectorHandle`, `TestLocatorRoutesActionsToOwningPage`, `TestLocatorOwnerSurvivesPrototypeShadowing` | selector token is preserved, but semantics depend entirely on owner page methods | ownership/routing proof is strong; DOM semantics are not |
| `locator.click/type/press/waitFor/evaluate/screenshot` | n/a | yes | yes | facade proof + shim support | tests listed above plus UpperCamel/negative coverage | action success means owner routing exists, not that a DOM element was resolved | strong compatibility facade evidence |
| `page.click/type/press` | legacy raw page may implement action | upgraded routes to owner/raw page or keyboard fallback | shim inherits upgraded behavior | facade proof + partial runtime proof | `010-browser-automation-upgraded.js`; tests `TestUpgradedPageActionMethodsRouteToUnderlyingPageOrKeyboard`, negative tests | actual semantics depend on underlying desktop/runtime methods; not proven as DOM element interaction | keep wording “action routing” |
| `evaluate` | limited legacy/runtime-specific behavior | upgraded routes to owner/raw page; if no runtime evaluate exists, it returns an explicit local-compatibility evaluation result | same via shim | facade proof only, with only minimal fallback runtime behavior | `010-browser-automation-upgraded.js`; tests `TestUpgradedPageActionMethodsRouteToUnderlyingPageOrKeyboard`, `TestUpgradedPageEvaluateReturnsExplicitLocalCompatibilityResultWhenNoRuntimeEvaluateExists`, locator evaluate tests, negative tests | no proof of page-context DOM evaluation; fallback is explicitly tagged as local compatibility evaluation rather than browser-page execution | one of the biggest semantic gaps |
| `screenshot` | yes | yes (direct and via locator) | yes | runtime proof + facade proof + real-environment proof | `Page.Screenshot`; `pageWrapper.screenshot`; locator screenshot tests; `browser_stack_macos_app_smoke.js` | captures desktop/window/screen path, not DOM element screenshot semantics in a real browser engine | among the strongest real runtime capabilities |
| `browser/context/page` getter topology (`getBrowser/getContext/getPage/pages/newContext/newPage`) | legacy mostly singleton page | yes | yes | facade proof + runtime proof | `Browser` / `BrowserContext` in Go; tests `TestBrowserDefaultContextAndLegacyNewPage`, `TestBrowserPagesAggregatesPagesAcrossContexts`, `TestContextNewPageRegistersIntoBrowserAndContext`, `TestUpgradedBrowserAndContextGettersAndCloseRouteToFacades`, `TestPlaywrightLaunchNewContextWorks`, `TestPlaywrightContextNewPageWorks`, `TestUpgradedPageGetBrowserGetContextGetPage` | containers and owner-aware getters now exist, but `page` is still not a full independent lifecycle entity | good migration scaffold, but not full page-owned lifecycle |
| Lifecycle close routing (`page.close/context.close/browser.close`) | close methods exist on containers/facades | yes | yes | runtime proof + facade proof | `Browser.Close`, `BrowserContext.Close`; facade close tests; Playwright close-shape tests | page facade delegates to context close; not a real page-resource teardown; repeated close is idempotent in effect but not promised to error | current recommended contract is conservative |
| Facade-level closed-state introspection | no explicit public contract | limited `browser.isClosed()` / `context.isClosed()` | launch handle + upgraded facades expose limited `isClosed()` | facade proof + partial runtime proof | `010-browser-automation-upgraded.js`; tests `TestUpgradedBrowserAndContextExposeClosedStateIntrospection`, `TestUpgradedBrowserAndContextClosedStateFallbackToBooleanFields`, `TestUpgradedBrowserNewContextRejectsClosedBrowserAtFacadeBoundary` | reflects backing container/compat state only; does not imply strict invalidation of every getter/action; page still has no independent closed-state contract | conservative introspection only |
| Closed-state blocking for new work | browser/context Go containers block future `NewPage()` after close | `browser.newContext()` now also rejects already-closed browser handles; other facade surfaces remain conservative | same via shim launch/browser handle path | runtime proof + limited facade proof | `automation/browser.go`; container closed-state tests; `TestUpgradedBrowserNewContextRejectsClosedBrowserAtFacadeBoundary` | JS facades still do not perform strict closed-state checks across every getter/action; page facade has no own closed bit | enough to justify conservative docs, not full strict lifecycle contract |
| Cookies/storage/session container APIs | no historical standard surface | yes | yes | runtime proof + facade proof | `BrowserContext` CRUD methods; tests `TestBrowserNewContextCreatesIsolatedContainer`, `TestContextCookiesStorageSessionCRUD`, `TestUpgradedPageCookiesStorageSessionRouteToContext` | in-memory compatibility containers only; not real browser cookie jar/localStorage/sessionStorage binding | useful migration abstraction, not browser-engine persistence |
|| HTTP execution stack (`/executions`, stack field) | yes | yes | yes | runtime proof + real-environment proof | `pkg/execution/runner.go`; `pkg/http/handler.go`; handler/runner tests; `examples/browser_stack_http_e2e_smoke.py`; `scripts/test_browser_stack_http_smoke.sh`; `docs/browser-automation-http-smoke-guide.md` | proves execution path and stack selection only; standardized smoke JSON improves auditability, not semantics; the wrapper/report layer is the authoritative structured evidence surface for review | acceptance path for API consumers |
|| macOS real-app path | yes through desktop automation primitives | yes through facade/open/screenshot/title path | indirectly, when shim routes into same upgraded runtime | runtime proof + real-environment proof | `Page.OpenApp/OpenURLInApp/Screenshot/Title`; `examples/browser_stack_macos_app_smoke.js` | validates desktop automation chain, not DOM automation or browser tab semantics; standardized top-level fields do not strengthen runtime semantics | strongest non-mock real-environment evidence |


Lifecycle contract decision boundary
- Current Go runtime already has partial closed-state semantics:
  - `Browser.NewPage()` errors after `Browser.Close()`
  - `BrowserContext.NewPage()` errors after `BrowserContext.Close()`
  - `BrowserContext.NewPage()` now also errors when its browser is already closed
- Current JS facade does not yet expose a full strict lifecycle model:
  - getters still return facades/snapshots
  - `page.close()` delegates to context close rather than page-specific teardown
  - repeated close remains routing-consistent and does not intentionally error
- Therefore the supported external statement should remain:
  - close has evidence-backed routing consistency
  - container-level future page creation is blocked after close in Go
  - full strict Playwright-like closed-state semantics are not yet promised

Evaluate and selector boundary, stated plainly
- `evaluate` is not proven to execute inside a browser DOM/page realm
- current upgraded fallback is now explicitly tagged as `local-compatibility-evaluate`, not silent page-context execution
- `waitForSelector` / `locator(...)` are not proven to resolve against a real DOM selector engine
- current evidence proves API shape preservation and owner-aware routing only
- standardized smoke output can improve auditability, but it does not strengthen selector/evaluate semantics by itself
- any future doc claiming “Playwright-like evaluate/selectors” must first add deeper Go/runtime evidence

Recommended wording for maintainers
- Say “compatibility facade” or “routing shim” for upgraded/playwright selector/evaluate/open claims unless real runtime evidence exists
- Say “runtime-supported desktop screenshot / app-open path” for screenshot and macOS app evidence
- Say “in-memory context container” for cookies/storage/session
- Do not say “full Playwright runtime” anywhere in current-phase docs

Capability-to-evidence audit bootstrap
- A conservative first-pass manifest now lives at `docs/browser-automation-capability-evidence-manifest.json`
- Local validator: `python3 scripts/validate_browser_automation_evidence.py`
- Current validator scope is intentionally narrow:
  - referenced files must exist
  - named Go tests must exist
  - selected boundary strings/snippets must still exist in code/docs
- This bootstrap helps prevent claim/evidence drift, but it does not itself upgrade any capability from facade/shim proof to runtime proof
