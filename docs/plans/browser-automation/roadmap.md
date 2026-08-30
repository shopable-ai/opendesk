# Browser automation next-phase roadmap

Purpose
- convert current boundary findings into an execution roadmap
- keep future work concrete instead of hand-wavy
- prioritize work by value, risk, and fit with the current Go + goja + polyfill + robotgo runtime

Current phase outcome
- dual-stack migration surface exists and is well-tested for routing
- upgraded/playwright claims are now bounded more explicitly
- lifecycle contract is clearer at the Go container layer than at the JS facade layer
- the largest semantic gaps remain evaluate/selectors/navigation realism

Decision summary for this phase
- Recommended lifecycle contract: conservative external contract, with incremental hardening underneath
- Why:
  - Go containers already have useful closed-state checks worth keeping
  - facade layer still lacks a page-owned closed model and should not fake full Playwright semantics yet
  - forcing a strict one-shot lifecycle contract now would overpromise and likely break legacy-shaped assumptions

Proof taxonomy to use in all future docs
- facade proof
- shim support
- runtime proof
- real-environment proof
- private/raw-path only

Phase 1: contract clarification and evidence hardening
Priority: P0
Status: partially complete in this pass

1. Lifecycle contract clarification
- Goal
  - keep current external wording conservative while documenting actual Go-level guarantees precisely
- Files
  - `automation/browser.go`
  - `automation/browser_compat_test.go`
  - `docs/browser-automation-stacks.md`
  - `docs/browser-automation-test-matrix.md`
  - `docs/browser-automation-capability-boundaries.md`
- Minimum implementation
  - preserve repeated close routing compatibility
  - keep `Browser.NewPage()` / `BrowserContext.NewPage()` closed checks
  - ensure context page creation also fails when owning browser is already closed
- Risks
  - low
  - main risk is accidentally documenting stricter semantics than the shim really guarantees
- Verification
  - Go tests for browser/context close behavior
  - facade tests remain green
- Legacy impact
  - low; legacy scripts rarely depend on creating fresh pages after a browser/context close

2. Capability matrix maintenance discipline
- Goal
  - every significant capability claim must map to evidence or be downgraded in wording
- Files
  - `docs/browser-automation-capability-boundaries.md`
  - `docs/browser-automation-test-matrix.md`
- Minimum implementation
  - keep rows aligned with tests/examples
  - when adding a new facade API, add at least one evidence row and one boundary note
- Risks
  - documentation drift if not maintained during future code changes
- Verification
  - reviewer checklist against tests/examples
- Legacy impact
  - none

3. Selector/wait contract hardening
- Goal
  - make selector-shaped waits fail loudly when the runtime cannot actually route them, instead of pretending timeout-style support exists
- Files
  - `polyfills/010-browser-automation-upgraded.js`
  - `automation/browser_compat_test.go`
  - `docs/browser-automation-capability-boundaries.md`
  - `docs/browser-automation-test-matrix.md`
- Minimum implementation
  - keep `waitFor(number)` as supported baseline
  - route selector waits only through `waitForSelector` / `WaitForSelector`
  - when selector routing is missing, throw explicit unsupported errors instead of degrading to timeout waits
- Risks
  - medium
  - may surface optimistic upgraded/playwright scripts that previously relied on accidental timeout fallback
- Verification
  - positive tests with lowerCamel and UpperCamel selector routing
  - negative tests for missing selector routing on both `page.waitFor(string)` and `locator.waitFor(...)`
- Legacy impact
  - low for legacy stack
  - medium for upgraded/playwright callers that implicitly relied on selector->timeout degradation

Phase 2: minimal semantic upgrades worth doing next
Priority: P0/P1

1. Facade-level closed-state introspection
- Priority: P0
- Goal
  - expose limited, honest lifecycle state without pretending to be full Playwright resource management
- Status
  - completed in conservative form
- Files
  - `automation/browser.go`
  - `polyfills/010-browser-automation-upgraded.js`
  - `automation/browser_compat_test.go`
- Implemented outcome
  - `browser.isClosed()` / `context.isClosed()` now exist on upgraded facades
  - `playwright.chromium.launch()` compatibility handles also expose `isClosed()`
  - `browser.newContext()` now rejects already-closed browser handles with `browser is closed`
  - `page` still does not promise an independent closed-state contract; `page.close()` remains context-close delegation
  - repeated `close()` remains non-breaking repeated delegation rather than a one-shot error contract
- Risks
  - low to medium: introspection is now exposed, but callers must not infer strict invalidation semantics for every getter/action
- Verification
  - tests proving closed-state introspection routing and boolean fallback
  - tests proving facade-level guard for `browser.newContext()` on closed browser handles
  - existing repeated-close tests remain green
- Legacy impact
  - low; additive surface only, with one conservative guard on `browser.newContext()`

2. `evaluate` contract hardening
- Goal
  - stop ambiguity around local-function fallback versus real page-context evaluation
- Files
  - `polyfills/010-browser-automation-upgraded.js`
  - `automation/browser_compat_test.go`
  - `docs/browser-automation-capability-boundaries.md`
- Minimum implementation
  - keep runtime-backed `evaluate/Evaluate` routing unchanged
  - when no runtime-backed evaluate exists and the first argument is a function, return an explicit tagged result:
    - `{ mode: 'local-compatibility-evaluate', value: ... }`
  - keep non-function unsupported errors explicit
- Risks
  - medium
  - callers that previously assumed raw scalar return values from fallback evaluate may need to inspect the tagged object instead
- Verification
  - positive test for runtime-backed evaluate
  - positive test for tagged local compatibility evaluate fallback
  - negative test for unsupported non-function usage
- Legacy impact
  - low for legacy stack
  - medium for upgraded/playwright scripts that relied on untagged local evaluate fallback

3. Smoke evidence standardization
- Priority: P0
- Goal
  - make CLI/HTTP/macOS smokes produce more uniform evidence fields
- Status
  - minimum first pass landed for HTTP + macOS evidence outputs
  - CLI legacy / upgraded / playwright smoke scripts now also emit the same standardized top-level fields, with stack-specific checks kept as auxiliary payloads
- Files
  - `examples/browser_stack_macos_app_smoke.js`
  - `examples/browser_stack_http_e2e_smoke.py`
  - `scripts/test_browser_stack_http_smoke.sh`
  - `pkg/execution/runner.go`
- Implemented outcome in this pass
  - runtime execution now injects `globalThis.Execution` metadata for JS smoke scripts:
    - `executionId`
    - normalized `stack`
    - `artifactDir`
    - `source`
    - `ext`
    - `scriptHash`
  - macOS smoke now emits a standardized record with:
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
  - HTTP E2E smoke now emits the same top-level standardized fields while preserving HTTP-specific handles (`statusUrl`, `summaryUrl`, `streamUrl`, `statusPayload`, `summaryPayload`)
  - the wrapper / report JSON is the authoritative structured evidence layer for HTTP smoke review; embedded script logs are now treated only as stack-path breadcrumbs rather than a second structured summary contract
- Risks
  - low
  - primary risk remains over-reading prettier smoke JSON as stronger runtime semantics
- Verification
  - rerun `python3 scripts/validate_browser_automation_evidence.py`
  - rerun focused `go test ./pkg/execution ./pkg/http -run 'TestRunJavaScriptAppliesRequestedStackMode|TestHandleExecutions' -count=1`
  - rerun `scripts/test_browser_stack_http_smoke.sh` and inspect `report.json`
- Legacy impact
  - none

Phase 3: deeper browser-like semantics
Priority: P1/P2

1. Real page identity and page-level close semantics
- Priority: P0
- Goal
  - make `page` more than a singleton facade alias when contexts create pages
- Status
  - ownership-introspection bootstrap landed in conservative form
- Files
  - `automation/browser.go`
  - `automation/page.go`
  - `polyfills/010-browser-automation-upgraded.js`
- Implemented outcome in this pass
  - Go `Page` instances now record minimal owning browser/context metadata when adopted into a `BrowserContext`
  - `pageUpgraded.getBrowser()` / `pageUpgraded.getContext()` now prefer real backing page ownership when the page exposes `Browser()` / `Context()`
  - tests now verify owner metadata registration and facade getter preference for owner-aware pages
- Remaining gap
  - `page.close()` is still context-close delegation
  - page detachment/removal from `context.pages()` / `browser.pages()` is still not implemented
  - page still has no independent `isClosed()` contract
- Risks
  - medium to high because current runtime is not a real multi-tab engine
- Verification
  - owner metadata registration tests
  - facade getter tests on owner-aware pages
  - keep existing close-routing tests conservative
- Legacy impact
  - low to medium; additive ownership metadata, but no destructive lifecycle cutover yet

2. Runtime-backed selector capability
- Priority: P1
- Goal
  - introduce one honest selector-resolution mechanism if feasible
- Possible directions
  - OCR/text-region based selector family
  - window/control query mapping
  - app-specific structured element lookup
- Files
  - likely `automation/page.go` and related vision/window manager modules
  - polyfill facade layer
- Minimum implementation idea
  - do not aim for CSS selector parity
  - instead define a narrower selector dialect that matches actual runtime abilities
- Risks
  - high if marketed as DOM selectors
- Verification
  - real-environment tests against known desktop targets
- Legacy impact
  - low if additive

3. Runtime-backed evaluate/page script realm
- Priority: P2
- Goal
  - only attempt if a real browser/CDP/subprocess page runtime is introduced
- Minimum implementation idea
  - bridge to actual browser page execution context rather than goja local callback execution
- Risks
  - very high; effectively a runtime architecture expansion
- Verification
  - real browser tests, DOM mutation/readback, exception semantics
- Legacy impact
  - low if additive, high if replacing current behavior

Phase 4: validation infrastructure upgrades
Priority: P1

1. Capability-to-evidence audit test
- Goal
  - make docs harder to overclaim
- Status
  - bootstrap landed in conservative form
- Minimum implementation idea
  - add a lightweight machine-readable manifest of capability claims and evidence references
  - optionally verify listed tests/files exist
- Implemented outcome
  - `docs/browser-automation-capability-evidence-manifest.json` now records a conservative first-pass set of capability claims, proof levels, boundaries, and evidence references
  - `scripts/validate_browser_automation_evidence.py` now verifies that referenced files exist, named Go tests exist, and selected code/doc snippets still exist
  - current bootstrap is existence-oriented validation, not semantic proof of the evidence itself
- Risks
  - low to medium maintenance overhead
- Verification
  - local validation script: `python3 scripts/validate_browser_automation_evidence.py`
- Legacy impact
  - none

2. Standard HTTP smoke wrapper
- Goal
  - make `/executions` stack verification repeatable with one command
- Minimum implementation idea
  - add `scripts/test_browser_stack_http_smoke.sh`
  - start server, run upgraded and playwright probes, capture outputs into `artifacts/`
- Risks
  - low
- Verification
  - shell script output plus stored JSON reports
- Legacy impact
  - none

Deferred / not recommended right now
- Full Playwright API surface expansion without runtime semantics
- DOM/CSS selector claims without a real browser engine or clearly narrower selector dialect
- one-shot strict `close()` error contract on the facade before page ownership semantics exist
- browser-process launch marketing based only on `playwright.chromium.launch()` naming

Recommended next coding target
- Pick exactly one P0 semantic hardening task next:
  1. facade-level closed-state introspection, or
  2. evaluate contract hardening, or
  3. selector wait hardening
- Best recommendation: selector wait hardening
- Why:
  - biggest mismatch risk after evaluate
  - easier to make honest quickly than full evaluate/runtime work
  - can improve error clarity without redesigning the whole runtime

Current next-step recommendation after the latest hardening tranche
- Main P0: capability-to-evidence audit bootstrap
- Why it now beats the other remaining candidates:
  - close contract, selector wait hardening, evaluate hardening, and conservative closed-state introspection are already landed, so the next largest risk is documentation/evidence drift rather than another broad facade surface tweak
  - the repo now has multiple boundary docs and smoke/test entrypoints; a lightweight audit manifest raises the floor on semantic honesty without pretending to solve runtime semantics
  - this is a strong fit for the current mixed Go + goja + polyfill runtime because it hardens claim discipline without overcommitting to browser-engine semantics
- Best backup route
  - smoke evidence standardization, because it improves real-environment proof readability and makes future audits easier
- Explicitly not recommended this round
  - page ownership / lifecycle pre-research as the main task, because it invites premature browser-like lifecycle storytelling before the repo has a true page-owned runtime model
  - runtime-backed selector dialect or runtime-backed evaluate boundary pre-research as the main task, because both are architecture-expansion topics and should follow stronger evidence discipline rather than replace it

Acceptance gate before claiming the next phase is complete
- docs consistently use the proof taxonomy
- lifecycle section says exactly what is and is not guaranteed
- one P0 semantic-hardening item is implemented with tests
- CLI/HTTP/macOS smoke evidence is standardized enough for maintainers to review quickly
