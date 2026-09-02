# Browser Automation HTTP Verification

当前仓库有 `/executions` stack routing 的 Go tests，也有可对已启动 server 执行的
`examples/browser_stack_http_e2e_smoke.py` client；当前没有负责启动/清理 server 的专用 browser
smoke wrapper。

## What is currently proved

`pkg/http/handler_test.go` 当前覆盖：

- legacy stack request accepted
- upgraded stack request accepted
- playwright stack request accepted
- missing stack defaults to legacy

这属于 `T2` handler/runtime integration evidence。

它们不证明：

- HTTP 请求实际执行了 upgraded/playwright facade 方法；
- server 在真实环境已启动并完成 E2E；
- browser/tab/DOM/session semantics。

## Current artifact baseline

通用 execution runtime 由 `pkg/execution/artifacts.go` 准备：

```text
stdout.log
stderr.log
script_snapshot.<ext>
summary.json
agent_summary.json
events.ndjson
```

其他 DOM/layout/OCR/replay artifact 必须由具体 scenario/runtime 显式生成，不能视为 HTTP execution 的默认产物。

## Running the current client

在另一个终端启动当前 OpenDesk HTTP server 后，可从仓库根目录执行：

```bash
python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 upgraded
python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 playwright
```

正式保存一次 T2/T3 HTTP smoke 时至少应记录：

- commit SHA
- platform/runtime version
- requested stack
- request payload
- execution id
- terminal status
- artifact directory
- explicit boundary note

对于 `upgraded` / `playwright`，结果必须写成 transport/stack/facade routing proof，而不是 Playwright support。

这个 Python client 当前只检查 execution transport、terminal status 与 summary；它没有调用 locator/evaluate，
因此不能替代 direct facade smoke 或 browser-driver test。
