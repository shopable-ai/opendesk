# prompts

本目录存放项目正式维护的可复用 prompt pack。它们属于运行契约资产，
不是会话记录，也不是普通工程文档。

只保留可在多个任务中复用、且有稳定输入输出契约的提示词。特定会话的
`next-chat`、交接说明和一次性执行上下文属于历史资料，统一放入
`.archive/notes/handoffs/`，不得继续堆放在本目录。

## 设计原则
1. 先结构，后语义，最后动作。
2. 所有 prompt 都必须输出结构化结果，便于映射到工件与代码。
3. prompt 不是准确性的唯一来源；准确性必须由 `schema + gate + evidence + replay` 联合判定。
4. `send_message` 是高风险动作，必须通过独立安全 gate。
5. mirror / compare 仅为辅助层，不再作为当前主 prompt 主线。

## 目录边界

- `automation/`：结构规划、页面判断、动作安全、回放、失败分类与自动化能力实现 GOAL。
- `golden-sample/`：golden sample 的生成、晋级、修复和验收。
- `golden-sample/legacy/`：仍可能复用、但已退出主流程的 mirror/DOM 辅助模板。
- `wechat/`：微信领域推理与执行编排。
- `mcp/`：MCP 集成、独立验证与修复的可复用提示模板。

日期型评审、阶段性策略和一次性交接材料不放在这里，统一进入
`.archive/notes/`；执行时生成或改写的 prompt snapshot 进入 `.runtime/`。

## 工程实现 GOAL

- `mcp/clawdesk-mcp-macos-validation-goal.md`：Recorder 之前的独立 MCP 前置 Gate；从 build、stdio/JSON-RPC、tool contract、macOS read-only runtime、preview guard 到 Codex Host + Calculator 低风险真实动作建立当前 Evidence。未通过时不得进入 Recorder 的 MCP 测试。
- `automation/agent-first-recorder-macos-mvp-goal.md`：在执行时最新 `master` 上实现 Agent-first Recorder 的 macOS 有界 MVP，包括 Trace、Flow IR、脚本生成、无 AI 回放、macOS Evidence 和兼容性测试。该 Prompt 是实现契约，不是实现完成证明。

## 推荐使用顺序
1. `mcp/clawdesk-mcp-macos-validation-goal.md`（涉及 MCP 驱动的 Recorder / Agent 桌面任务前先执行）
2. `automation/runtime_preflight_reviewer.md`
3. `automation/structure_first_planner.md`
4. `automation/app_classification_reviewer.md`
5. `wechat/wechat_chat_page_inference.md`
6. `automation/semantic_zones_mapper.md`
7. `automation/ocr_assist_resolver.md`
8. `automation/actionability_reviewer.md`
9. `automation/send_safety_gate.md`
10. `automation/replay_verifier.md`
11. `automation/failure_taxonomy_classifier.md`
12. `automation/red_team_critic.md`

## 与代码的映射关系
| Prompt | 目标工件 |
|---|---|
| clawdesk-mcp-macos-validation-goal | `cmd/clawdesk-mcp/`、`pkg/mcpserver/`、MCP regression/smoke tests 与 `.runtime/tests/mcp/` Evidence |
| agent-first-recorder-macos-mvp-goal | `apps/recorder/`、`pkg/recorder/`、Recorder schemas、tests 与 `.runtime/tests/recorder/` Evidence |
| structure_first_planner | `detect/layout_model.json` 的上层规划上下文 |
| app_classification_reviewer | `infer/app_classification.json` |
| wechat_chat_page_inference | `infer/app_classification.json` / `infer/zones.json` 的微信专项判定 |
| semantic_zones_mapper | `infer/zones.json` |
| ocr_assist_resolver | `infer/ocr_map.json` |
| actionability_reviewer | `verify/actionability_report.json` |
| send_safety_gate | `verify/send_safety_report.json` |
| replay_verifier | `replay/replay_result.json` / `replay/state_transition_log.json` |
| failure_taxonomy_classifier | `failures/*.json` 或 `decision.json` 扩展字段 |
| red_team_critic | 风险审查、红队回归 |

## 结论
这些 prompt 文件的作用是：
- 固化判断结构
- 减少 agent 漂移
- 让后续代码实现有明确 contract

但它们**不能单独证明准确性**。准确性要靠：
- 真实截图样本
- schema 校验
- gates
- replay
- 动作前后证据
