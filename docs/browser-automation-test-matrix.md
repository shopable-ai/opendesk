# Browser automation dual-stack test matrix

目标：让 legacy / upgraded / playwright 三条路径都能被低成本重复验证，并明确哪些能力只是 facade 路由，哪些已经具备容器语义。

## 1. Runtime alias / facade tests

当前已有 Go 测试（automation 包）
- TestInitJSInjectsLegacyRawHandles
  - 验证：`page____Inject` / `browser____Inject` / `context____Inject` 存在
- TestApplyRuntimeStackModeLegacyKeepsPageDefault
  - 验证 legacy 不重写默认 page
- TestApplyRuntimeStackModeUpgradedAliasesPageFacade
  - 验证 upgraded 后 `page === pageUpgraded`
- TestApplyRuntimeStackModePlaywrightAliasesAllFacades
  - 验证 playwright 后 `page/browser/context` 都指向 upgraded facade
- TestAutomationNamespaceExposesLegacyAndUpgradedHandles
  - 验证 `Automation.getLegacy/getUpgraded/getPlaywrightFacade`

## 2. Browser / Context behavior tests

当前已有 Go 测试（automation 包）
- TestBrowserDefaultContextAndLegacyNewPage
  - legacy browser.NewPage 仍走 default context
- TestBrowserNewContextCreatesIsolatedContainer
  - 验证两个 context 的 storage/session/cookies 隔离
- TestBrowserPagesAggregatesPagesAcrossContexts
- TestContextNewPageRegistersIntoBrowserAndContext
- TestContextCookiesStorageSessionCRUD
- TestBrowserContextSessionStorageAndCookies

## 3. Upgraded page facade routing tests

当前已有 Go + goja 测试（automation 包）
- TestUpgradedPageOpenRoutesToGotoOrOpenURL
- TestUpgradedPageLocatorReturnsSelectorHandle
- TestUpgradedPageWaitForSupportsNumberAndSelectorRouting
  - number wait 仍走 legacy/runtime sleep path
  - selector wait 只在 owner 提供 `waitForSelector/WaitForSelector` 时成立
  - 不再把 selector wait 缺失静默降级成 timeout wait
- TestUpgradedPageGetBrowserGetContextGetPage
  - 对齐到 upgraded facade：`getBrowser() === browserUpgraded`，`getContext() === contextUpgraded`
- TestUpgradedPageCookiesStorageSessionRouteToContext
- TestUpgradedPageActionMethodsRouteToUnderlyingPageOrKeyboard
  - 覆盖 `click/type/press/evaluate`
  - `evaluate` 若没有 runtime-backed owner method，会返回显式 `{ mode: 'local-compatibility-evaluate', value: ... }` 标签结果
  - `type/press` 仍验证无 selector 时会 fallback 到 `keyboard.type/keyboard.press`
- TestUpgradedPageEvaluateReturnsExplicitLocalCompatibilityResultWhenNoRuntimeEvaluateExists
  - 验证 fallback evaluate 不再伪装成页面上下文求值结果

## 4. Browser / Context facade behavior tests

当前已有 Go + goja 测试（automation 包）
- TestUpgradedBrowserAndContextGettersAndCloseRouteToFacades
  - 覆盖 `browser.newContext/getContext/getPage/close`
  - 覆盖 `context.getBrowser/getPage/close`
  - 覆盖 `page.close -> context.close` 的委托关系
- TestUpgradedBrowserAndContextExposeClosedStateIntrospection
  - 覆盖 `browser.isClosed()/context.isClosed()` 对 backing state 的只读观测
  - 覆盖 Playwright compatibility launch handle 也暴露 `isClosed()`
- TestUpgradedBrowserAndContextClosedStateFallbackToBooleanFields
  - 覆盖 facade introspection 对 `closed` / `isClosed` 布尔字段的兼容读取
- TestUpgradedBrowserNewContextRejectsClosedBrowserAtFacadeBoundary
  - 覆盖 `browser.newContext()` 在已关闭 browser facade 上显式报 `browser is closed`
  - 验证这是有限 hardening，不代表所有 getter/action 都升级为 strict invalidation
- TestUpgradedBrowserPagesReturnsFacadeListAndFallback
  - 覆盖 `browser.pages()`
  - 验证真实 pages 列表会被包成 upgraded page facade
  - 验证无 pages 时 fallback 到 `[pageUpgraded]`
- TestFacadeCloseMethodsRemainCallableAfterFirstClose
  - 覆盖 page/context/browser close 的 repeated-call delegation
  - 当前验证重点是 facade 路由稳定可重复，不是 closed-state error contract
- TestContextCloseBlocksFutureNewPageEvenIfBrowserStillOpen
  - 验证 Go `BrowserContext` 容器在 close 后会拒绝新的 `NewPage()`
- TestBrowserCloseBlocksFutureNewPageAndContextPages
  - 验证 Go `Browser` close 后，`browser.NewPage()` 和该 browser 之下的 `context.NewPage()` 都会报 closed 错误
- TestUpgradedBrowserOpenRoutesURLThroughPageFacade
  - 覆盖 `browser.open({ url, appName })`
  - 验证 URL 打开会通过 page facade 路由
  - 验证返回值仍是 context facade

## 5. Locator facade tests

当前已有 Go + goja 测试（automation 包）
- TestLocatorRoutesActionsToOwningPage
  - 覆盖 `locator.click/type/press/waitFor/evaluate`
  - 验证 locator 会保留 owning page，而不是直接依赖 `global.page`
  - `locator.waitFor(...)` 当前要求 owner 提供 `waitForSelector/WaitForSelector`，不再接受 timeout-only 降级
- TestLocatorScreenshotRoutesToOwningPage
  - 覆盖 `locator.screenshot()`
  - 验证 screenshot 会回路由到 owning page
- TestLocatorOwnerSurvivesPrototypeShadowing
  - 覆盖 prototype shadowing 下的 owner 保持
  - 覆盖 `waitForSelector` 路由而不是模糊 `waitFor` 降级

## 6. Playwright facade tests

当前已有 Go + goja 测试（automation 包）
- TestPlaywrightChromiumLaunchReturnsBrowserFacade
- TestPlaywrightLaunchNewContextWorks
- TestPlaywrightContextNewPageWorks
- TestPlaywrightFacadeCloseMethodsExist
- TestPlaywrightLaunchWithURLRoutesThroughBrowserOpen
  - 覆盖 `playwright.chromium.launch({ url, appName })`
  - 验证其本质上是 `browserUpgraded.open(...)` 的 routing shim

建议继续补充
- browser/context/page 在 playwright stack mode 下的默认别名与 direct launch handle 行为一致的反向测试

## 7. CLI / execution entry tests

当前已有 Go 测试
- pkg/execution/runner_test.go
  - TestRunJavaScriptAppliesRequestedStackMode
- pkg/http/handler_test.go
  - TestHandleExecutionsAcceptsLegacyStack
  - TestHandleExecutionsAcceptsUpgradedStack
  - TestHandleExecutionsAcceptsPlaywrightStack
  - TestHandleExecutionsDefaultsToLegacyWhenStackMissing

建议保留最小命令
- `go test ./pkg/execution ./pkg/http -run 'TestRunJavaScriptAppliesRequestedStackMode|TestHandleExecutions' -count=1`

## 7. HTTP real-verification path

Canonical docs and examples
- stack semantics and limitations: `docs/browser-automation-stacks.md`
- coverage inventory: `docs/browser-automation-test-matrix.md`
- legacy/private-path boundary: `docs/browser-automation-legacy-escape-hatches.md`
- payload templates:
  - `examples/browser_stack_http_upgraded_smoke.js`
  - `examples/browser_stack_http_playwright_smoke.js`
- real E2E probe:
  - `examples/browser_stack_http_e2e_smoke.py`
- unified wrapper:
  - `scripts/test_browser_stack_http_smoke.sh`

Recommended operator flow
1. Start service: `go run . -http -port 60844`
2. Inspect one payload template or POST your own JSON body to `/executions`
3. Run real probe:
   - `python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 upgraded`
   - `python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 playwright`
4. Verify standardized top-level evidence fields include:
   - `ok`
   - `stack`
   - `selectedApp`
   - `skipped`
   - `runtimeNote`
   - `finalStatus`
   - `executionId`
   - `artifactDir`
   - `proofLevel`
   - `boundaryNote`
5. Also verify HTTP-specific handles remain present for traceability:
   - `statusUrl`
   - `summaryUrl`
   - `streamUrl`
   - `statusPayload`
   - `summaryPayload`
6. Treat the wrapper / report JSON as the authoritative structured evidence layer for HTTP smoke review.
   - The embedded script logs should only confirm that the requested stack path executed (for example `http e2e smoke stack=playwright`).
   - Do not treat embedded script logs as a second structured summary contract.
7. If `logDir` is provided in request payload, also verify produced artifacts under that directory (`stdout.log`, `stderr.log`, `summary.json`, `agent_summary.json`, `events.ndjson`)
8. For one-command aggregation, run `scripts/test_browser_stack_http_smoke.sh`; it now emits a unified `report.json` alongside per-stack JSON outputs

Boundary reminder
- HTTP stack selection proves runtime aliasing and execution-path routing through `/executions`; it does not by itself prove full Playwright runtime semantics
- upgraded/playwright HTTP evidence should be reported as facade/shim verification unless paired with a deeper real-environment capability proof
- standardized JSON fields improve auditability only; they do not upgrade a facade proof into runtime proof

## 8. JS smoke scripts

当前保留并已扩展
- examples/browser_stack_legacy_smoke.js
  - 输出 standardized top-level evidence fields
  - 证明 preserved legacy `page.waitFor(number)` baseline path
  - 不证明 upgraded/playwright facade 或更深 browser runtime semantics
- examples/browser_stack_upgraded_smoke.js
  - 输出 standardized top-level evidence fields + facadeChecks/evaluateResult
  - 验证 `page.getContext/getPage` 与 locator/evaluate 路由对齐
  - 证明 upgraded facade routing，不证明 full Playwright runtime 或 DOM selector semantics
- examples/browser_stack_playwright_smoke.js
  - 输出 standardized top-level evidence fields + facadeChecks/evaluateResult
  - 验证 `playwright.chromium.launch -> newContext -> newPage` shim chain
  - 证明 playwright-shaped compatibility facade，不证明 browser-process / DOM runtime semantics
- examples/browser_stack_macos_app_smoke.js
  - 优先探测 Safari/TextEdit/Finder/Preview/Notes
  - 若找到可用应用，执行真实 macOS 应用路径的 open/wait/title/screenshot 证据链
  - 若找不到，则输出 skip/fallback 证据而不是直接失败
- examples/browser_stack_http_upgraded_smoke.js
  - 提供 `/executions` + `stack=upgraded` 的标准请求 payload 示例
- examples/browser_stack_http_playwright_smoke.js
  - 提供 `/executions` + `stack=playwright` 的标准请求 payload 示例
- examples/browser_stack_http_e2e_smoke.py
  - 真实发起 `/executions` 请求
  - 轮询 `/executions/{id}`
  - 读取 `/summary`
  - 输出 executionId、statusUrl、summaryUrl、streamUrl 和最终状态证据

可继续新增
- examples/browser_stack_close_smoke.js

## 9. 验证命令建议

最小 Go 测试：
- `go test ./automation -run 'TestBrowser|TestApplyRuntimeStackMode|TestPlaywright|TestUpgradedPage|TestLocator|TestUpgradedBrowser|TestFacadeCloseMethodsRemainCallableAfterFirstClose' -count=1`
- `go test ./pkg/execution ./pkg/http -run 'TestRunJavaScriptAppliesRequestedStackMode|TestHandleExecutions' -count=1`

CLI smoke：
- `go run . -script examples/browser_stack_legacy_smoke.js -stack legacy -timeout 1 -console-mode summary`
- `go run . -script examples/browser_stack_upgraded_smoke.js -stack upgraded -timeout 1 -console-mode summary`
- `go run . -script examples/browser_stack_playwright_smoke.js -stack playwright -timeout 1 -console-mode summary`
- `go run . -script examples/browser_stack_macos_app_smoke.js -stack upgraded -timeout 1 -console-mode summary`

HTTP smoke payload examples：
- 直接读取：
  - `examples/browser_stack_http_upgraded_smoke.js`
  - `examples/browser_stack_http_playwright_smoke.js`
  作为 `POST /executions` 请求体模板

HTTP 真实端到端 smoke：
- 启动服务：`go run . -http -port 60844`
- 运行：`python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 upgraded`
- 或：`python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 playwright`

## 10. 当前缺口优先级

必须继续补：
1. capability boundary 总表的长期维护：新增能力时必须同步到 `docs/browser-automation-capability-boundaries.md`
2. close contract 的 facade 层显式策略：若未来要升级为更严格 contract，先补 facade-level `isClosed` / throw 策略，而不是只看 Go 容器层
3. evaluate / selector 的真实语义澄清或收紧：没有更深 Go/runtime 证据前，不能往“更像 Playwright”方向夸大

其次再补：
4. capability-to-evidence 自动校验（文档声称支持什么，就至少要有一条自动化证据）
5. HTTP / macOS smoke 结构化输出标准化
6. 若未来需要真实 DOM evaluate/selector 语义，再做最小 Go 扩展

## 11. Capability-to-evidence audit bootstrap

当前已新增
- `docs/browser-automation-capability-evidence-manifest.json`
  - 维护一组保守的 capability claim -> proof level -> evidence reference 映射
- `scripts/validate_browser_automation_evidence.py`
  - 校验 manifest 中引用的文件存在
  - 校验命名的 Go 测试函数存在
  - 校验部分 code/doc 片段仍存在，防止边界文档与实现文本漂移

当前 bootstrap 的边界
- 这是“存在性/引用一致性”校验，不是语义正确性证明
- 它不能替代真实 Go 测试、HTTP smoke、macOS smoke
- 它的价值是把“能力声明必须绑证据”变成可重复执行的最小门槛

推荐验证命令
- `python3 scripts/validate_browser_automation_evidence.py`
