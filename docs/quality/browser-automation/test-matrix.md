# Browser Automation Test Matrix

本矩阵只列当前仓库中存在的测试与可验证入口。历史 smoke 文件已从当前测试清单移除。

## Test levels

- `T1` deterministic unit test
- `T2` runtime/integration test
- `T3` real desktop/browser smoke

## Current tests

| Area | Level | Current test | What it proves | What it does not prove |
| --- | --- | --- | --- | --- |
| stack normalization | T1 | `automation/runtime_stack_test.go::TestNormalizeRuntimeStack` | stack name normalization/fallback | runtime semantics |
| upgraded conditional alias | T1 | `automation/runtime_stack_test.go::TestApplyRuntimeStackModeUsesUpgradedAliasOnlyWhenPresent` | alias happens only when `pageUpgraded` exists | upgraded facade exists in normal initialization |
| playwright conditional alias | T1 | `automation/runtime_stack_test.go::TestApplyRuntimeStackModePlaywrightAliasesAvailableUpgradedGlobals` | page/browser/context alias routing when globals are supplied | Playwright namespace, launch, DOM/tab/session semantics |
| execution stack field | T2 | `pkg/execution/runner_test.go::TestRunJavaScriptAcceptsRequestedStackMode` | requested stack metadata is preserved and current base globals remain usable | upgraded/playwright facade behavior |
| execution context | T2 | `pkg/execution/runner_test.go::TestRunJavaScriptInjectsExecutionContext` | `Execution` metadata injection | browser semantics |
| HTTP stack acceptance | T2 | `pkg/http/handler_test.go::TestHandleExecutionsAcceptsLegacyStack`; `...UpgradedStack`; `...PlaywrightStack` | HTTP handler accepts and forwards stack values | real HTTP server smoke or browser semantics |

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
| Browser/Context ownership and lifecycle | E3 implementation, no focused T1 listed | deterministic Go unit tests |
| cookies/storage/session containers | E3 implementation, no focused T1 listed | deterministic Go unit tests if contract remains public |
| `page.goto` OS-launch contract | E3 implementation | small testable abstraction or platform-safe integration test |
| screenshot | E3 implementation | controlled fixture + platform-aware T2/T3 |
| selector / locator / evaluate | no current implementation | do not test until a real contract is implemented |
| real browser/desktop browser smoke | none | explicit target/fixture, environment record and evidence artifact |

## Removed stale test assumptions

The current tree does not contain:

- `examples/browser_stack_legacy_smoke.js`
- `examples/browser_stack_upgraded_smoke.js`
- `examples/browser_stack_playwright_smoke.js`
- `examples/browser_stack_macos_app_smoke.js`
- `examples/browser_stack_http_e2e_smoke.py`
- `scripts/test_browser_stack_http_smoke.sh`

Tests and docs must not treat these paths as current Evidence.

## Reporting rule

A passing reference validator is F7 Evidence/Artifact drift protection only. A passing T1/T2 routing test may be reported as routing/integration proof only. T3 is required before claiming current real-environment proof, and even a T3 smoke cannot establish full Playwright parity.
