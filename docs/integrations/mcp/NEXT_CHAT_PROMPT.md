# Clawdesk MCP 下一轮执行提示词（完成判定 / 交付审计版）

你现在在 /Users/a0000/Documents/workspace/clawdesk 项目中继续推进 Clawdesk MCP，但前提是先读并尊重当前已形成的交付边界，而不是重复无边界加工具。

先读这些文件，再开始：
- docs/mcp/DELIVERY-CHECKLIST.md
- docs/mcp/TEST-MATRIX.md
- docs/mcp/MANUAL-SMOKE-macOS.md
- docs/mcp/testmonkey-mcp-plan.md
- docs/mcp/README.md
- docs/mcp/hermes-integration.md
- docs/mcp/NEXT_CHAT_PROMPT.md
- pkg/mcpserver/server.go
- pkg/mcpserver/runtime.go
- pkg/mcpserver/server_test.go
- pkg/mcpserver/runtime_test.go
- cmd/clawdesk-mcp/main.go

当前阶段已经明确：
- inspect -> find -> act 主链路已形成
- tm_find_target 已有 strategy contract / ranked candidates / bestCandidate / ambiguity signaling / OCR line candidate 统一模型
- tm_act_on_target 已有 stale / ambiguous / allowAmbiguous / expectedWindowTitle / expectedTargetText / dryRun / previewOnly
- 自动化 contract 与 macOS manual smoke 的边界已文档化

因此下一轮默认优先级应是：
1. 先对照 `DELIVERY-CHECKLIST.md` 判断是否仍有阻塞项
2. 若要新增能力，必须先写 failing tests
3. 若是真机问题，先写入或更新 `MANUAL-SMOKE-macOS.md`
4. 若是平台语义问题，优先修正文档和字段表述，再考虑实现
5. 只有当继续投入能显著提高总分时，才进入下一批增强

继续执行时必须坚持：
- 严格 TDD
- 每完成一批运行：
  - go test ./pkg/mcpserver ./cmd/clawdesk-mcp
- 文档与测试同步更新
- 不要 clone Peekaboo 作为主实现
- 不要引入不必要的大抽象层
- 若某项只能人工验证，必须明确记入 manual smoke 文档

下一轮如要继续做，最值得优先考虑的方向通常是：
- 更厚的 runtime adapter 单元测试
- 更强的 refresh/revalidate before action
- richer ambiguity explanation / host hint
