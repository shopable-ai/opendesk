# application-engineer｜输入输出适用规格（兼容入口）

原三模式规格已按责任拆分；本页不再维护重复规则。旧链接仍从这里进入同一方法，不新增 schema、状态、Gate 或 Workflow。

| 需要回答 | 唯一局部正文 |
| --- | --- |
| discover/harden/repair 各需要什么，何时可进入 | [input-spec.md](input-spec.md) |
| AppProfile、规则、审阅和下游消费交付什么 | [output-spec.md](output-spec.md) |
| 怎样发现来源、语义、坐标、操作及交接错误 | [validation.md](validation.md) |
| Agent/Human 失败返回谁，怎样安全维修/复用 | [failure-handling.md](failure-handling.md) |

操作/Collection/Recorder 专项约束见 [operating-guidance.md](operating-guidance.md)。正式方法见 [SKILL.md](../SKILL.md)；正式字段和发布沿用 [共享合同](../../../../../docs/frameworks/agent-to-recipe-skill-contract.md)。接续时固定实际读取的各文件内容版本，不能只固定本导航页。

正式字段、引用、版本与发布语义以 [共享合同](../../../../../docs/frameworks/agent-to-recipe-skill-contract.md) 为唯一依据；方法审阅与评分层级沿用 [validation-plan](../../../design/validation-plan.md)。本兼容入口必须同时支持正常消费、输入不足时的明确拒绝，以及受影响范围内的定向修复与复用；这些导航约束本身不证明 L2 独立 Agent 行为。
