# Clawdesk MCP Continuation Prompt

继续开发 Clawdesk MCP 时，先读取当前代码和以下正式文档：

```text
docs/integrations/mcp/README.md
docs/integrations/mcp/testing/delivery-checklist.md
docs/integrations/mcp/testing/test-matrix.md
docs/integrations/mcp/testing/manual-smoke-macos.md
docs/integrations/mcp/operations/ocr-provider-recovery.md
docs/quality/gates-and-evidence.md
pkg/mcpserver/server.go
pkg/mcpserver/runtime.go
pkg/mcpserver/server_test.go
pkg/mcpserver/runtime_test.go
cmd/clawdesk-mcp/main.go
```

不要从历史 TestMonkey 文档、旧 Prompt 或 `.archive/` 推断当前实现。

## 当前主线

优先围绕：

```text
tm_inspect_desktop
-> tm_find_target
-> tm_act_on_target
```

提升：

- target discovery 质量；
- candidate ranking / ambiguity explanation；
- freshness / revalidation；
- high-risk action guard；
- postcondition / evidence；
- macOS 真机可靠性。

## 执行规则

1. 先从当前需求和真实失败证据判断是否值得改，不自动继承历史 roadmap。
2. 代码修改尽量先补对应 failing test，再实现。
3. MCP contract 修改至少运行：

```bash
go test ./pkg/mcpserver ./cmd/clawdesk-mcp
```

4. 涉及截图、焦点、点击、输入、OCR/provider 等真实环境行为时，按 manual smoke 验证。
5. 遇到 OCR provider 缺失等外部前置条件，返回/记录 external blocker，不要无限重试。
6. 发现文档与源码冲突，以当前源码、测试和实际运行证据为准，并同步修正 canonical docs。
7. 新的阶段日志、执行结果和一次性分析不要堆进 `docs/integrations/mcp/`：
   - 运行输出 -> `.runtime/`
   - 长期报告 -> `artifacts/reports/mcp/`
   - 历史材料 -> `.archive/`
   - 可复用 Prompt -> `prompts/mcp/`

## 每轮完成判定

至少说明：

- 本轮解决了哪个真实问题；
- 修改了哪些 contract / runtime 行为；
- 哪些测试实际运行；
- 哪些真机项实际验证；
- 哪些仍是 external blocker；
- 是否需要更新 README / test matrix / manual smoke / quality gate；
- 下一步是不是当前 blocker，而不是泛化的“还能继续优化”。
