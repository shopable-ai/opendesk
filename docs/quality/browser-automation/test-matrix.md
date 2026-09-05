# Browser Compatibility Test Matrix

本矩阵区分维护中的桌面 Runtime API 与源码中暂留的 browser-shaped 兼容代码。

## Current tests

| Area | Level | Current test | What it proves | What it does not prove |
| --- | --- | --- | --- | --- |
| Desktop `page` contract | T2 | `tests/runtime-api/unit/page.test.js` | `docs/api/page.md` 中维护的 JS 方法存在且行为可观察 | browser、DOM 或 tab 语义 |
| Stack normalization | T1 | `automation/runtime_stack_test.go` | 历史 stack label 的 normalize/alias seam | 公共 stack 产品或 browser capability |
| Compatibility facade routing | T1 | `automation/browser_compat_test.go` | 旧脚本 shim 的 owner routing 和显式失败 | browser process、DOM、selector engine 或 Playwright parity |
| Internal Browser/Context lifecycle | T1 | `tests/automation/browser_lifecycle_test.go` | 内存 ownership、closed guard、幂等 close | browser context protocol、profile、cookie jar 或 storage |
| Execution context | T2 | `tests/runtime-api/unit/execution.test.js` | `Execution` 字段 shape、别名、hash 和来源约束 | 外部 HTTP lifecycle 或 durable execution |
| HTTP stack acceptance | T2 | `pkg/http/handler_test.go` 的 stack cases | 服务仍接受并转发历史请求值 | facade/browser 语义或真实 HTTP E2E |

## Evidence reference validator

从仓库根目录运行：

```bash
python3 scripts/validate_browser_automation_evidence.py
```

它只检查 `capability-evidence-manifest.json` 中的路径、contains 文本和 Go test 名称仍存在；通过
不等于 capability 可用，更不等于 Playwright 支持。

## Current gaps

| Gap | Highest evidence | Required next evidence |
| --- | --- | --- |
| `page.goto` 的 OS-launch 行为 | E3 | 平台安全的 postcondition integration test |
| screenshot | E3/E4 | 受控 fixture 与真实桌面 E5 |
| browser process / tab / DOM / selector | E0 | 独立 browser driver、正式契约与受控 E2E fixture |

仓库不再提供 `browser_stack_*` 公共示例。需要网页自动化时，不得把兼容 shim 测试或历史 stack
request 测试当作用户入口。
