# Browser Automation HTTP Verification

当前仓库有 `/executions` stack routing 的 Go tests，但没有当前 Browser HTTP E2E smoke 脚本。

## What is currently proved

`pkg/http/handler_test.go` 当前覆盖：

- legacy stack request accepted
- upgraded stack request accepted
- playwright stack request accepted
- missing stack defaults to legacy

这属于 `T2` handler/runtime integration evidence。

它不证明：

- 独立 upgraded facade 存在；
- Playwright namespace/runtime 存在；
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

## If a T3/T2 HTTP smoke is reintroduced

只有当存在真实消费场景时，再增加一个最小 smoke fixture。它至少应记录：

- commit SHA
- platform/runtime version
- requested stack
- request payload
- execution id
- terminal status
- artifact directory
- explicit boundary note

对于 `upgraded` / `playwright`，如果 runtime 仍只是条件 alias，则结果必须写成 routing proof，而不是 Playwright support。

当前不恢复已消失的历史 smoke scripts，只为了维持旧文档 Claim。
