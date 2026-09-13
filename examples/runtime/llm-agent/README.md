# LLM + Agent Runtime examples

工作目录均为 OpenDesk 仓库根目录。先按 [LLM API](../../../docs/api/llm.md) 或 [Agent API](../../../docs/api/agent.md) 配置环境；密钥只放在环境文件中，不写进示例或 Profile。

最短 LLM 文本调用：

```bash
./dist/opendesk -script examples/runtime/llm-agent/llm-generate.js -console-mode script
```

默认 Codex Agent。已安装的 `codex` 必须在当前 Execution 的受控 `PATH` 中；通常不需要设置 executable：

```bash
./dist/opendesk -script examples/runtime/llm-agent/agent-run.js -console-mode script
```

显式选择 Claude Code：

```bash
./dist/opendesk -script examples/runtime/llm-agent/agent-claude-code.js -console-mode script
```

在同一次 Execution 中分别调用 Codex 与 Claude Code（需要两者都已配置）：

```bash
./dist/opendesk -script examples/runtime/llm-agent/backend-switch.js -console-mode script
```

使用配置文件中名为 `team-codex` 的 Profile：

```bash
./dist/opendesk -script examples/runtime/llm-agent/agent-profile.js -console-mode script
```

默认 Codex native structured output：

```bash
./dist/opendesk -script examples/runtime/llm-agent/agent-structured-output.js -console-mode script
```

只有需要固定另一安装位置时，才把 `OPENDESK_CODEX_EXECUTABLE` 设置为绝对路径。该高级 override 优先于 PATH discovery；相对路径、目录和不可执行文件都会在启动模型任务前失败。

真实 macOS Calculator 混合闭环。它会打开并操作 Calculator；需要已经授予 Accessibility 权限。HTTP LLM 路线：

```bash
OPENDESK_CALCULATOR_HYBRID_CONFIRM=authorized-calculator-hybrid OPENDESK_CALCULATOR_MODEL_KIND=llm ./dist/opendesk -script examples/runtime/llm-agent/calculator-hybrid-macos.js -console-mode script
```

默认 Codex Agent 路线：

```bash
OPENDESK_CALCULATOR_HYBRID_CONFIRM=authorized-calculator-hybrid OPENDESK_CALCULATOR_MODEL_KIND=agent ./dist/opendesk -script examples/runtime/llm-agent/calculator-hybrid-macos.js -console-mode script
```

脚本严格执行 `25 × 4 =`，从显示区读取 `baseResult`，只调用一次 LLM / Agent，重新确认同一窗口、显示值和可观察 Accessibility 状态，再按增量的每一位点击数字并读取 `finalResult`。JavaScript 运算只用于独立 oracle。成功证据与 base/final 实窗截图写入 `.runtime/tests/llm-agent-calculator/<execution-id>/`。

无需真实凭据的适配器 fixture：

```bash
OPENDESK_RUNTIME_API_MODE=ai-runtime ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

Fixture PASS 不代表真实 HTTP 凭据、Codex 登录、Claude Code 登录或真实桌面已经验证。
