# Browser Automation Test Matrix

本矩阵只列当前仓库中存在的测试与可验证入口。

## Test levels

- `T1` deterministic unit test
- `T2` runtime/integration test
- `T3` real desktop/browser smoke

## Current tests

| Area | Level | Current test | What it proves | What it does not prove |
| --- | --- | --- | --- | --- |
| stack normalization | T1 | `automation/runtime_stack_test.go::TestNormalizeRuntimeStack` | stack name normalization/fallback | runtime semantics |
| upgraded facade composition | T1 | `automation/browser_compat_test.go::TestApplyRuntimeStackModeUpgradedAliasesPageFacade`; `...TestAutomationNamespaceExposesLegacyAndUpgradedHandles`; focused `TestUpgraded*` cases | normal initialization creates facade and routes owner methods with explicit failures | browser process, DOM, or selector engine semantics |
| playwright compatibility shim | T1 | `automation/browser_compat_test.go::TestPlaywrightChromiumLaunchReturnsBrowserFacade`; `...TestPlaywrightStackAliasesStayConsistentWithLaunchHandle` | launch/newContext/newPage/getter/alias shape | Chromium launch, tab protocol, DOM, or Playwright parity |
| Browser/Context lifecycle | T1 | `automation/browser_lifecycle_test.go::TestBrowserLifecycleDefaultContextOwnsLegacyPage`; `...ClosedContainersRejectNewObjects`; `...CloseIsIdempotent` | default page ownership, closed-container creation rejection, stable inventory, idempotent close | browser-process, DOM, navigation, or Playwright runtime semantics |
| BrowserContext in-memory state | T1 | `automation/browser_compat_test.go::TestBrowserNewContextCreatesIsolatedContainer`; `...TestContextCookiesStorageSessionCRUD` | per-context isolation and cookies/storage/session container operations | browser profiles, real cookie jars, localStorage, or network sessions |
| execution stack field | T2 | `pkg/execution/runner_test.go::TestRunJavaScriptAcceptsRequestedStackMode` | requested stack metadata is preserved and current base globals remain usable | upgraded/playwright facade behavior |
| execution context | T2 | `pkg/execution/runner_test.go::TestRunJavaScriptInjectsExecutionContext` | `Execution` metadata injection | browser semantics |
| HTTP stack acceptance | T2 | `pkg/http/handler_test.go::TestHandleExecutionsAcceptsLegacyStack`; `...UpgradedStack`; `...PlaywrightStack` | HTTP handler accepts and forwards stack values | real HTTP server smoke or browser semantics |
| public stack recipes | T2 entrypoint | `examples/browser_stack_legacy_smoke.js`; `...upgraded_smoke.js`; `...playwright_smoke.js` | current-source Runtime can select and execute each bounded facade recipe | browser/desktop target interaction or Playwright parity |

## Evidence reference validator

Run:

```bash
python3 scripts/validate_browser_automation_evidence.py
```

It checks only deterministic reference integrity for `capability-evidence-manifest.json`:

- manifest basic shape;
- evidence path exists;
- referenced Go test name exists;
- `contains` string exists;
- duplicate claim id;
- unknown E0-E5 proof level;
- empty evidence.

Passing the validator means **references are internally consistent**, not that the capability works, matches Playwright semantics, or is production-ready.

## Current gaps

| Gap | Highest current level | Required next evidence |
| --- | --- | --- |
| `page.goto` OS-launch contract | E3 implementation | small testable abstraction or platform-safe integration test |
| screenshot | E3 implementation | controlled fixture + platform-aware T2/T3 |
| real selector / DOM / page-realm evaluate | compatibility routing only | validated browser runtime and controlled DOM fixture |
| real browser/desktop browser smoke | none | explicit target/fixture, environment record and evidence artifact |

## Current smoke entrypoints

The current tree contains:

- `examples/browser_stack_legacy_smoke.js`
- `examples/browser_stack_upgraded_smoke.js`
- `examples/browser_stack_playwright_smoke.js`
- `examples/browser_stack_macos_app_smoke.js`
- `examples/browser_stack_http_e2e_smoke.py`

The direct JavaScript recipes are safe T2 facade/routing probes. The HTTP Python client requires a separately
started server and currently proves transport/stack completion only. There is no
`scripts/test_browser_stack_http_smoke.sh` orchestration wrapper.

## Reporting rule

A passing reference validator is F7 Evidence/Artifact drift protection only. A passing T1/T2 routing test may be reported as routing/integration proof only. T3 is required before claiming current real-environment proof, and even a T3 smoke cannot establish full Playwright parity.
