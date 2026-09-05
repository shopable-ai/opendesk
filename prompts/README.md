# prompts

本目录存放项目正式维护的可复用 prompt pack。它们属于运行契约资产，
不是会话记录，也不是普通工程文档。

只保留可在多个任务中复用、且有稳定输入输出契约的提示词。特定会话的
`next-chat`、交接说明和一次性执行上下文属于历史资料，统一放入
`.archive/notes/handoffs/`，不得继续堆放在本目录。

## Agent-to-Recipe 独立 Skill 入口

AI 完成真实任务、保存关键数据、复盘并直接生成普通 JS 时，使用
[六个独立 Skill](automation/agent-to-recipe/README.md)：规划、应用工程、示范、提炼、生成、验收。
每个 Skill 独立交付产物给下一环节，不依赖同一 Agent 的隐含记忆。

共享字段、版本、恢复和权限维护在
[交接合同](../docs/frameworks/agent-to-recipe-skill-contract.md)；后续计算器测试按
[验证规程](../docs/quality/agent-to-recipe/calculator-validation.md)选择 BASIC、LIVE-GATE 或 PIPELINE。
文件写入不等于测试授权或运行通过；目录也不提供自动安装、调度或隔离。

该路线复用下述结构、Gate、Evidence 原则，但通过正常脚本入口 Fresh Run，不要求 Recorder、
IR、Compiler 或专用 Replay Runtime。任务交接包进入 `.runtime/`，不写回共享 Skill。

## 设计原则
1. 先结构，后语义，最后动作。
2. 所有 prompt 都必须输出结构化结果，便于映射到工件与代码。
3. prompt 不是准确性的唯一来源；准确性必须由 `schema + gate + evidence + replay` 联合判定。
4. `send_message` 是高风险动作，必须通过独立安全 gate。
5. mirror / compare 仅为辅助层，不再作为当前主 prompt 主线。

## 目录边界

- `automation/`：结构规划、页面判断、动作安全、回放和失败分类；其中 `agent-to-recipe/` 为独立 Skill 与任务模板。
- `golden-sample/`：golden sample 的生成、晋级、修复和验收。
- `golden-sample/legacy/`：仍可能复用、但已退出主流程的 mirror/DOM 辅助模板。
- `wechat/`：微信领域推理与执行编排。
- `mcp/`：MCP 集成的可复用提示模板。
- `runtime/`：Runtime extension 等跨进程能力的实现、验证与 Evidence goal contract。

日期型评审、阶段性策略和一次性交接材料不放在这里，统一进入
`.archive/notes/`；执行时生成或改写的 prompt snapshot 进入 `.runtime/`。

## 既有专题 prompt 的推荐使用顺序

以下为原有专题资产的组合参考，不是六个 Agent-to-Recipe Skill 的必经加载顺序；该路线使用上方独立入口。

1. `automation/runtime_preflight_reviewer.md`
2. `automation/structure_first_planner.md`
3. `automation/app_classification_reviewer.md`
4. `wechat/wechat_chat_page_inference.md`
5. `automation/semantic_zones_mapper.md`
6. `automation/ocr_assist_resolver.md`
7. `automation/actionability_reviewer.md`
8. `automation/send_safety_gate.md`
9. `automation/replay_verifier.md`
10. `automation/failure_taxonomy_classifier.md`
11. `automation/red_team_critic.md`

## 与代码的映射关系
| Prompt | 目标工件 |
|---|---|
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
| runtime/native-process-extension-prototype-goal | Native Process Extension V0 的代码、测试、源码隔离与 Runtime Evidence |
| runtime/native-extension-plugin-autodiscovery-goal | 默认目录插件 bundle 自动发现、JS facade 注册与源码隔离 Evidence |

六个 Skill 的产物映射在共享交接合同维护；本表中的领域工件不是所有 Runtime 的默认产物。

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
