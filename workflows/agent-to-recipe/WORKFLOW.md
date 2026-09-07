# Agent-to-Recipe｜过渡入口

当前是设计阶段导航，不是已定稿的运行工作流。原《Agent-first Recorder｜工作流任务分解树》已完整归位到 design，未被删除。后续根据需求、链路与验证设计生成正式 WORKFLOW，再组织多个独立 Skill；本文件不自动调度或授予桌面权限。

## 从当前目的进入

- 先看[设计总纲](design/README.md)，了解有效决定、旧方案替代与迁移状态。
- 明确要满足什么：看[需求与基线](design/requirements.md)。
- 理解完整需要做什么：看[任务分解树](design/task-decomposition.md)。
- 明确由谁做、消费什么、交付什么：看[链路设计](design/chain-design.md)。
- 深入专业问题：看[应用操作](design/application-operations.md)或[独立代码改进](design/code-rebuild.md)。
- 确认怎样证明通过：看[验证计划](design/validation-plan.md)和[计算器案例](cases/calculator.md)。

## 使用依据与编号

阶段和来源对照见[完整任务树](design/task-decomposition.md)。S1—S12 沿用原合同，R1—R13 是讨论视图；不因本次归位重新编号。

## 主任务树

唯一设计正文在[Agent-first Recorder｜工作流任务分解树](design/task-decomposition.md)，保留三种入口、五个大类及全部关键子任务，不在本入口复制。

## 三个循环与工件关系

执行、学习、可靠性循环和成果关系继续在[任务树](design/task-decomposition.md)维护，实际组合与交接在[链路设计](design/chain-design.md)中确认。

## 讨论十三节点视图的保留与对照

完整 R1—R13 见[任务树](design/task-decomposition.md)，具体代入见[计算器](cases/calculator.md)。

## 专业责任、交接与长任务接续

- 当前[六个 Skill](../../prompts/automation/agent-to-recipe/README.md)与[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)未迁移；新七项职责和独立 code-rebuild 仍是待实现设计，不使用未定义调用名冒充安装完成。
- 正式执行前核对本次目标、来源、权限、实际宿主、工具、输入版本与场景；设计文档不能替代这些前提。
- 生成与可选改进分开，失败按原因返回，不必所有任务都重走完整链。正式路由和交接兼容按[链路设计](design/chain-design.md)后续实施。

2026-09-07：原完整正文从此路径迁入 design/task-decomposition.md；旧路径保留导航以兼容既有引用。此迁移不表示原 Skill 索引中的其他旧路径已全部修复，也不证明任何运行阶段通过。
