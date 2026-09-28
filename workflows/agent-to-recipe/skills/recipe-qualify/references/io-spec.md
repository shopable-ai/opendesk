# recipe-qualify：输入输出适用规格（兼容导航）

本文件保留旧链接兼容，不再维护第二套正文。

- 资格输入/运行前充分性：[input-spec.md](input-spec.md)
- QualificationRecord/Scope 输出：[output-spec.md](output-spec.md)
- 正确性/反例：[validation.md](validation.md)
- 失败路由/重验：[failure-handling.md](failure-handling.md)
- 方法入口：[../SKILL.md](../SKILL.md)
- Calculator 示例：[../examples/calculator.md](../examples/calculator.md)
- 通用资格模板：[../templates/qualification-record.md](../templates/qualification-record.md)

正式字段、状态和 scope 规则以共享合同为唯一依据。

正式字段、引用、版本与发布语义以 [共享合同](../../../../../docs/frameworks/agent-to-recipe-skill-contract.md) 为唯一依据；方法审阅与评分层级沿用 [validation-plan](../../../design/validation-plan.md)。本兼容入口必须同时支持正常消费、输入不足时的明确拒绝，以及受影响范围内的定向修复与复用；这些导航约束本身不证明 L2 独立 Agent 行为。
