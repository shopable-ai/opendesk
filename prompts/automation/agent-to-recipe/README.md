# Agent-to-Recipe：六个独立 Skill

状态：Skill 作业资产 v1，尚未通过真实计算器整链验收。不是 OpenDesk 新 Runtime、自动调度器或安装后会自行运行的插件。

## 先选工作流，再加载当前 Skill

完整任务从[Agent-to-Recipe WORKFLOW](../../../workflows/agent-to-recipe/WORKFLOW.md)进入；计算器任务直接使用[Calculator WORKFLOW](../../../workflows/macos/calculator/WORKFLOW.md)。本目录是专业 Skill 目录，不要求用户自行拼接六份文件。

调用时遵守[共享调用与交接合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)，只加载当前需要的 Skill。阶段方法继续以 [demonstration-to-automation-pipeline](../../../docs/frameworks/demonstration-to-automation-pipeline.md) 为准；业务拆分使用[任务求解方法](../../../docs/frameworks/automation-problem-solving-framework.md)。

| 独立 Skill | 明确交付 | 何时调用 |
| --- | --- | --- |
| [automation-plan](automation-plan/SKILL.md) | TaskContract、WorkPlan | 新任务、修订、接续 |
| [application-engineer](application-engineer/SKILL.md) | AppProfile、必要 helper | 初步认识、工程化补强、定向修复 |
| [task-demonstrate](task-demonstrate/SKILL.md) | 真实 DemonstrationDossier 与关键业务值 | 获准完成一次任务或定向补采 |
| [procedure-synthesize](procedure-synthesize/SKILL.md) | SemanticProcedure、参数与数据依赖 | 依据示范事实复盘，不进行桌面操作 |
| [recipe-build](recipe-build/SKILL.md) | 普通 JS、CandidateManifest | 输入就绪后生成具体候选 |
| [recipe-qualify](recipe-qualify/SKILL.md) | QualificationRecord、修复请求 | 独立 Fresh Run 与限定范围验收 |

具体调用顺序、每步输入输出、继续条件与失败路由维护在通用 WORKFLOW，不在本目录另写第二套工作流。每个生产者保存自己的产物，最后发布 handoff；不另设一个“统一记笔记 Skill”，也不让主 Skill 包办所有专业工作。

## 宿主怎样实际使用

六个目录各自有 `SKILL.md`。宿主支持 Skill 注册时按其实际机制逐个启用；本目录不声明自动发现或安装。宿主只有文件读取／对话能力时，可以显式读取当前 Skill，再传入 request 与精确 inputRefs 顺序执行。

需要的宿主能力：可读写获准任务目录、可以核对产物内容、在执行阶段拥有 OpenDesk 的真实工具或命令入口、可以显示进度和接受停止。缺任一能力时按任务范围报告阻塞，不模拟运行。技能说明中的权限限制须由宿主落实，文件本身不是沙箱。

用户只要求写文档时，停在文档交付。收到明确执行请求后，协调者才建立任务目录、选定实际预算和调用模式；不用为每个已授权低风险步骤反复询问，但授权扩大必须停止确认。

### 最小调用流程

1. 从用户任务建立 `user-task.md` 和 request（模板见下方），指定 taskId、工作包、attempt、Skill、输入版本、输出要求、能力与预算。
2. 只将当前 Skill、共享合同和必需引用交给执行者；不自动塞入上游全部聊天。
3. 执行者核对输入，完成本职责，保存主产物、证据和 handoff。失败也保存有事实依据的部分交接。
4. 协调者检查完整性与门禁，更新唯一 progress，显示当前工作包、最近证据、阻塞、变更与下一步。
5. 消费者再次核对版本和输入适用性后继续。无上下文隔离的宿主可以先验证显式交接，但“新 Agent 接续”须另测并如实报告。

计划、合同、交接是作业数据，不由 OpenDesk 解释执行。普通脚本仍通过已有 CLI／ai run 入口运行；不要虚构 `opendesk skill run`、`Execution.resume` 等接口。

## 初始化模板与第一个验证任务

- [任务包模板](templates/task-package.md)：复制结构时放入任务目录，填真实值；不能把示例或占位符当运行结果。
- [Calculator WORKFLOW](../../../workflows/macos/calculator/WORKFLOW.md)：选择基本测试或完整开发链，按工作包推进。
- [计算器基本与整链验证规程](../../../docs/quality/agent-to-recipe/calculator-validation.md)：测试命令、具体判据和报告要求的唯一维护位置。

计算器先运行 BASIC 范围以确认现有业务能力，再在明确要求下进行 PIPELINE 范围以验证六个 Skill 的开发链。BASIC 通过不自动证明 PIPELINE 通过。现有 live gate 可复用，但它不会替你证明无旧聊天交接。

## 维护边界

工作流维护顺序与产物流向，共享合同维护字段、恢复和权限，每个 Skill 维护自己的触发条件、输入、职责、产物和最小验收。任务日志／截图／prompt snapshot 放 `.runtime/`，不写回 Skill；候选业务脚本通过验收后再按授权决定正式源码落点。

本目录不修改现有 Runtime、参考计算器脚本、权限或测试入口，也不预填“已通过”或专家分数。状态以实际证据更新，正式规程本身不是测试报告。
