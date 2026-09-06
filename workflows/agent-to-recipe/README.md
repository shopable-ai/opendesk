# Agent-to-Recipe

把 Agent 完成真实任务时得到的经验，提炼成可维护、可验证、可重复使用的普通 OpenDesk JavaScript。确定步骤由 JS 执行；必要的内容理解、动态判断保留为受约束的 Agent 环节。

状态：作业规范 v1。写入文件不代表调度器、混合运行集成、资产平台或桌面验收已经实现。

从 [WORKFLOW.md](WORKFLOW.md) 开始。按当前工作包读取 [S1—S12 阶段卡](stages/README.md)的相应小节，不要求每次重读所有文档。

| 当前问题 | 入口 |
| --- | --- |
| 怎样开始、接续和定向修复？ | [通用流程](WORKFLOW.md) |
| 每个环节交出什么，怎样单独判定？ | [十二阶段卡](stages/README.md) |
| 基础操作、组合业务能力、JS／Agent 怎样配合？ | [组合与混合运行](composition.md) |
| 怎样成为可分享资产，后续怎样接平台？ | [资产生命周期](asset-lifecycle.md) |
| 怎样验证，不把规范完成当业务通过？ | [验收与推进](validation.md) |

专业能力继续使用[六个独立 Skill](../../prompts/automation/agent-to-recipe/README.md)，公共字段继续使用[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)。

方法依据：[主流程](../../docs/frameworks/demonstration-to-automation-pipeline.md)、[任务求解](../../docs/frameworks/automation-problem-solving-framework.md)、[应用开发](../../docs/frameworks/app-development-framework.md)。本文新增组合、混合运行与资产交付的作业约束，不把方法中的 Recorder 目标架构当成路线 A 前置条件。
