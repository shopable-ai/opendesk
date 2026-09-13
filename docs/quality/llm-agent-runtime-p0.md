---
title: LLM + Agent Runtime P0 验收报告
description: LLM.generate、Agent.run、共享结果合同、协议适配、生命周期、公开 API 与 Calculator 混合闭环的实现期证据。
---

# LLM + Agent Runtime P0 验收报告

日期：2026-09-13  
验收基线：`master` / `3a5baeccb9ce7cbab1f83a4e27e78e1c88a92e71`，共享工作树包含未提交并行修改。验收期间没有 stash、reset、checkout、clean、commit 或 push。

## 结论

P0 公共合同已经落地：普通 OpenDesk JavaScript 可调用 `LLM.generate()` 与 `Agent.run()`，两者返回相同的 `{data, meta}` 业务合同，共用严格 JSON Schema 子集、错误语义、总 deadline 与取消规则。LLM 复用 execution-owned HTTP；Agent 复用 `Command.run()`，未建立第二套资源 owner。

当前实现期评分为 **96/100**。扣分只来自外部资格缺口：本机没有可用的真实 LLM HTTP 凭据；Claude Code 虽已安装且登录状态可见，但三次真实 task 均在 60、120、180 秒总 deadline 内未返回。确定性 fixture、真实 Codex 与真实 macOS Calculator 证据均通过，未用 fixture 冒充真实服务。

## 已实现

- `LLM.generate()`：`prompt` / `messages` 互斥，支持 `system`、Profile、`output`、`generation`、`timeoutMs`、`signal`；`openai-responses` 与 `openai-chat-completions` 为独立请求和响应适配器。
- `Agent.run()`：默认 Codex，支持显式 Claude Code；Profile、backend、model 三者职责分离；profile/backend 冲突、未知 backendOptions、保留但未实现 backend 均在启动前失败且不 fallback。
- 共享 validator：严格区分 integer/string/float/range，执行 `additionalProperties: false`，不提取、不修复、不执行模型输出。
- 生命周期：单次总 deadline 覆盖准备、传输/进程、读取和校验；HTTP 获得 AbortSignal；CLI 使用 Command 的 timeout、signal、进程组终止和 `envMode: 'replace'`。
- 协议成功与业务成功分层：HTTP 2xx、CLI exit 0 均不是充分条件；refusal、截断/未完成、空输出、tool call、无终态、无 final message 和 schema 失败全部拒绝。
- 配置与安全：复用 `Execution.env` 和现有 env-file 解析；Profile 只保存 credential reference；Agent child 仅获得 allowlist 与所选 backend 的认证引用。Codex 0.154.0 还由固定 adapter argv 关闭 shell、unified exec、computer use、browser/in-app automation、apps 与 multi-agent，调用方不能用额外参数重开。
- 类型与发布：`types/LLM.d.ts`、`types/Agent.d.ts`、`types/ModelCall.d.ts`，正式 `docs/api/llm.md`、`docs/api/agent.md`，API index/README/environment/机器索引均已同步。
- 公开示例：文本、默认 Codex、Claude Code、Profile、结构化输出、backend 切换与 macOS Calculator 混合闭环均位于 `examples/runtime/llm-agent/`。

## 已测试

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 正式 Runtime API gate | PASS | 原样执行 `OPENDESK_RUNTIME_API_MODE=ai-runtime ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`；`.runtime/tests/ai-runtime/final-tool-disabled-formal/summary.json` 与 `.runtime/tests/runtime-api/direct-20260913-041215-388000/` |
| Agent 公共合同 | PASS 9/9 | Codex/Claude 独立 fixture、固定工具禁用 argv、选择、冲突、错误、schema、env 隔离、cancel/timeout/进程树清理；`.runtime/tests/ai-runtime/direct-20260913-041156-302000/agent-protocols-logs/summary.json` |
| Responses 公共合同 | PASS 6/6 | 文本、参数映射、strict schema、HTTP/protocol failure、timeout/cancel；`.runtime/tests/ai-runtime/direct-20260913-041156-302000/llm-openai-responses-logs/summary.json` |
| Chat Completions 公共合同 | PASS 6/6 | 与 Responses 使用不同 fixture envelope；`.runtime/tests/ai-runtime/direct-20260913-041156-302000/llm-openai-chat-completions-logs/summary.json` |
| Command / Execution 集成 | PASS | `ai run` 成功与 outer timeout teardown、Command replace、HTTP/Scheduler source capability gate；formal gate 与 `.runtime/tests/command/llm-agent-tool-disabled-final/summary.json`、`.runtime/tests/ai-source-restrictions/tool-disabled-final/summary.json` |
| 公开最短示例 | PASS | LLM 由 loopback fixture 配置运行；默认 Agent 与 structured Agent 由真实 Codex 配置直接执行；`.runtime/tests/ai-runtime/final-tool-disabled-formal/summary.json`、`.runtime/tests/llm-agent-p0/public-agent-run-tool-disabled/summary.json`、`.runtime/tests/llm-agent-p0/public-agent-structured-tool-disabled/summary.json` |
| 公开 backend 切换示例 | PASS | 同一普通脚本在独立 Codex/Claude fixtures 下取得 `codex-ready` / `claude-ready`；`.runtime/tests/ai-runtime/direct-20260913-041156-302000/example-backend-switch-logs/summary.json` |
| 全量 Runtime contract | PASS | catalog 401，395 项断言通过、0 失败；`.runtime/tests/ai-runtime/final-tool-disabled-regression-contract/summary.json` |
| 全量 Runtime unit | PASS 759/759 | `.runtime/tests/ai-runtime/final-tool-disabled-regression-unit/summary.json` |
| Native owner 回归 | PASS | `go test ./automation ./pkg/scriptloader ./pkg/execution ./pkg/http ./internal/aicli ./cmd/opendesk ./tests/runtimeenv` exit 0 |
| Test architecture audit | PASS | `node scripts/audit_test_architecture.js`；`.runtime/tests/test-architecture/audit.json` |
| Example catalog/layout | PASS 10/10 | `node --test tests/test-architecture/example-explorer-catalog.test.js tests/test-architecture/examples-root-layout.test.js` |
| JS/JSON 与 diff hygiene | PASS | `node --check`、JSON parse、`git diff --check` 均通过 |

正式 gate 会读取每个嵌套 OpenDesk Execution 的 `summary.json` 并要求 `success === true && status === 'succeeded'`，避免外层命令退出状态掩盖内层失败。修复后的 timeout 路径已在同一正式 gate 中稳定通过。

## 真实资格

### HTTP 模型

**未验证真实服务。** 当前 shell、仓库 env 文件均没有可供本轮使用的 LLM API key。两种协议已通过独立 loopback HTTP fixture；fixture 会验证请求结构、native schema、完成状态、错误状态、重试、timeout 与取消，但不计作真实模型调用。

### Agent CLI

- **Codex：PASS。** 本机 `codex-cli 0.154.0`；在固定关闭 9 个模型可调用工具 feature 后，真实 text 与 native JSON 分别通过，结果为 `opendesk-agent-ready` 与 `{value: 10}`，证据为 `.runtime/tests/ai-runtime/real-cli/codex-tool-disabled-current/real-agent-result.json`。实际 backend 未报告 model，因此 `meta.model` 正确保留 `null`，usage 来自真实 JSONL terminal event。
- **Claude Code：BLOCKED_BY_ENVIRONMENT。** 本机 `2.1.150`，`claude auth status` 报告已登录；真实 task 在 60、120、180 秒总 deadline 内无结果，均返回 `ModelCallError/TIMEOUT`，Command 资源计数归零且无 CLI 残留。最新证据为 `.runtime/tests/ai-runtime/real-cli/claude-final-current-build/summary.json`，更长 deadline 证据保留于 `.runtime/tests/llm-agent-p0/real-claude/` 与 `.runtime/tests/llm-agent-p0/real-claude-env-profile/`。Claude 独立协议 fixture 仍为 PASS，不能替代真实 task 资格。

### macOS Calculator 混合闭环

- **LLM 路线：PASS（HTTP fixture 资格）。** UI 点击 `25 × 4 =`，从真实显示区读取 `100`；Responses fixture 返回 native-schema `{value:12}`；重新确认同一窗口、显示值和完整 Accessibility fingerprint 后，逐位点击 `+`、`1`、`2`、`=`，从显示区读取 `112`。证据：`.runtime/tests/llm-agent-calculator/direct-20260913-035656-618000/result.json`。
- **Agent 路线：PASS（真实 Codex）。** UI 读取 `100`；关闭进程/桌面/browser/app 工具的真实 Codex 返回并验证 `{value:10}`；状态复核后点击 `+`、`1`、`0`、`=`，UI 读取 `110`。证据：`.runtime/tests/llm-agent-calculator/direct-20260913-041338-373000/result.json`。
- 两条路线的 base/final 截图均为 `232 × 321` 的真实 Calculator active window，并已人工检查显示、裁切、按钮布局和空白；对应目录内保留 `base-result.png` 与 `final-result.png`。
- JavaScript 中的 `25 * 4` 与 `Number(baseResult) + increment` 仅作为独立 oracle；业务结果来自两次 UI display read。模型只决定一次 increment，接受后不重新生成。

## 环境边界

- 真实 OpenAI-compatible HTTP：缺少可用凭据，未验证。
- 真实 Claude Code task：本机外部 CLI 在 60、120、180 秒三个总 deadline 内均无结果，未验证。
- Windows/Linux 真机：本轮未评估；没有把 macOS fixture 或交叉编译表述为目标系统 live 资格。
- `dist/opendesk` 与配套 UI host 于 2026-09-13 04:11:49 从当前 dirty tree 一并刷新；执行期 polyfill 源文件与 app bundle SHA-256 同为 `7afa2e228b06c46faea8fb3fcdd77a2544553d6f58457333ed062e17fee667fb`。

## 评分

| 维度 | 得分 | 依据 |
| --- | ---: | --- |
| Runtime 与共享公共合同 | 20/20 | 两对象可调用、统一 data/meta/error/schema/deadline |
| LLM 两协议与严格验证 | 17/20 | 独立 fixture 全通过；真实 HTTP 因无凭据未验证，扣 3 分 |
| Agent 两适配器与 Command 复用 | 19/20 | Codex 真实通过、Claude fixture 通过；Claude 真实 task 未完成，扣 1 分 |
| Profile、权限、取消与资源收口 | 20/20 | 冲突、allowlist env、source gate、timeout/cancel、进程树清理均有证据 |
| 类型、Reference、机器索引、示例与测试架构 | 15/15 | 正式 gate、全量回归、catalog/audit 均通过 |
| 真实桌面混合闭环 | 5/5 | LLM fixture 路线与真实 Codex 路线均通过并有实窗截图 |
| **总分** | **96/100** | 仅对没有证据的外部资格扣分 |
