# Historical Stack HTTP Verification Boundary

`pkg/http/handler_test.go` 仍覆盖 `legacy`、`upgraded`、`playwright` 和缺省 stack 的请求兼容性。
这些测试只证明旧请求值被接受并转发到 execution；不证明 browser、DOM、selector、tab、cookie、
storage 或 Playwright 语义。

旧 `browser_stack_http_e2e_smoke.py` client 已从公共 examples 删除，因为它只能观察 transport
完成和 summary，却容易被误读为 browser E2E。当前没有公开的 browser-stack HTTP smoke 命令。

通用 HTTP execution 的正式调用、status、summary、SSE、取消和 artifact 契约见
`docs/api/http-server.md`。未来若引入真正的 browser driver，必须另建包含 server 生命周期、受控
网页 fixture、DOM postcondition、失败分类和清理证据的独立 gate。
