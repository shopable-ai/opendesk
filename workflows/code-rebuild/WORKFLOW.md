# code-rebuild｜设计迁移入口

原代码质量框架已归位到 [agent-to-recipe/design/code-rebuild.md](../agent-to-recipe/design/code-rebuild.md)。完整分析、反例和旧决定演变继续保留，此处不再维护平行 WORKFLOW 正文。

## 当前有效决定

- 保留 recipe-build 的代码生成职责，拟新增独立、按需的 code-rebuild；不再将二者简单改名合并。
- 已有代码可以单独进入改进，简单合格脚本可以跳过深度优化；生成者仍需完成必要正确性检查。
- 无收益允许不改，不强制 calc 对象、应用类、新 API 或额外运行引擎。
- 本轮只有设计归位，没有创建、注册或迁移 code-rebuild Skill；实际调用与合同兼容需要后续实施。

## 工作流任务分解树

见[独立代码改进分析](../agent-to-recipe/design/code-rebuild.md)。如何消费代码基线、交付候选并独立验收，见[链路设计](../agent-to-recipe/design/chain-design.md)。

## 独立质量门槛与责任返回

规则与反例分别在[代码改进分析](../agent-to-recipe/design/code-rebuild.md)和[验证计划](../agent-to-recipe/design/validation-plan.md)维护；计算器设计保留在[案例](../agent-to-recipe/cases/calculator.md)。

2026-09-07：旧路径仅作迁移导航，不等于最终运行入口。返回[设计总纲](../agent-to-recipe/design/README.md)。
