# Agent-to-Recipe 开发工作流

状态：Agent 作业入口 v1，尚未完成真实整链验收。记录日期：2026-09-06。

## 1. 直接从这里组织任务

本文件回答：先调用哪个 Skill，给它什么输入，收到什么输出后才能进入下一环节。它是六个独立 Skill 的组合入口，不是第七个包办专业工作的 Skill，也不是新的 Runtime、DSL 或自动调度器。

适用于用户明确要求“完成一次真实任务并生成可重复运行的 OpenDesk 脚本”或继续已有开发任务。只要求查看、设计或写文件时，不启动桌面操作。只测试已有脚本时，进入对应场景的测试流程，不强迫执行完整开发链。

首个具体入口是[计算器任务工作流](../macos/calculator/WORKFLOW.md)。

读取顺序：本文件 → [共享调用与交接合同](../../docs/frameworks/agent-to-recipe-skill-contract.md) → 当前需要的独立 Skill。执行前遵守根 [AGENTS.md](../../AGENTS.md)，实际接口按当前 `docs/api/` 核对。

职责保持单一：

| 资料 | 负责什么 |
| --- | --- |
| 本文件 | Skill 的调用顺序、产物流向、继续和回退入口 |
| [共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md) | request、handoff、权限、版本、发布、恢复与门禁字段的唯一约定 |
| [六个 Skill](../../prompts/automation/agent-to-recipe/README.md) | 各环节的专业作业方法和独立验收条件 |
| [示范到自动化方法](../../docs/frameworks/demonstration-to-automation-pipeline.md) | 原 12 阶段的执行方法；本工作流选择普通 Recipe 路线 |
| [任务求解方法](../../docs/frameworks/automation-problem-solving-framework.md) | 如何拆业务工作包、连接数据和现场状态 |
| 场景工作流与质量规程 | 本次具体目标、测试范围和实际结果要求 |

## 2. 启动或接续

协调者先读取用户目标与授权，并检查用户指定的任务是否已有记录。不得为了方便新建任务绕过旧任务的未决副作用。

新任务按[任务包模板](../../prompts/automation/agent-to-recipe/templates/task-package.md)创建 `.runtime/automation-authoring/<task-id>/`，记录真实 taskId、用户请求、目录解析基准、实际宿主调用方式、停止入口和总预算。不要把占位符或示例数据当执行结果。

已有任务先读合同、WorkPlan、唯一 progress 和已发布 handoff；核验文件、版本、证据与当前前提后，从第一个输入就绪的未完成工作包接续。已有效的知识和代码可复用；窗口、焦点、账号、临时坐标和运行时业务值需要按当前操作重新确认。缺失证据的旧 passed 不得直接沿用。

桌面动作前，先展示当前目标、工作包、输入来源、预计交付、边界和下一步。同一任务仅一个进度写入者，同一桌面仅一个操作拥有者。

## 3. 正式路由与输入输出

```text
automation-plan
  → application-engineer(discover)
  → task-demonstrate
  → procedure-synthesize
  → application-engineer(harden，仅有缺口时)
  → recipe-build
  → recipe-qualify
  → 交付具体版本，或返回责任环节
```

下表是通用路由，不是固定的业务工作包数量。规划者依据具体任务建立稳定工作包 ID；每个包分别定义输入、输出、现场前提、完成证据和恢复边界。

| 顺序／原阶段 | 调用 Skill | 输入 | 本环节保存的输出 | 下游进入条件 |
| --- | --- | --- | --- | --- |
| 1／S1 含拆解 | [automation-plan](../../prompts/automation/agent-to-recipe/automation-plan/SKILL.md) | 用户目标、授权、已有任务资料 | TaskContract、WorkPlan：`task-contract.json`、`work-plan.json`，以及 handoff | 目标、成功条件、工作包依赖和预算清楚；未知项已列出 |
| 2／S2 | [application-engineer](../../prompts/automation/agent-to-recipe/application-engineer/SKILL.md)，discover | 冻结合同、所需操作、当前观察或可复用资料 | AppProfile：`app-profile.json`、证据引用和 handoff | 下一业务动作所需的应用、窗口、状态和验证方式已确认 |
| 3／S3—S6 | [task-demonstrate](../../prompts/automation/agent-to-recipe/task-demonstrate/SKILL.md) | 合同、计划、AppProfile、获准输入 | DemonstrationDossier：`dossier.json`、动作索引、关键业务值及其来源、结果证据和 handoff | 完整示范符合原成功条件；不是仅工具调用无异常 |
| 4／S7—S9 | [procedure-synthesize](../../prompts/automation/agent-to-recipe/procedure-synthesize/SKILL.md) | 合同、AppProfile、指定 dossier 与证据 | SemanticProcedure：`procedure.json`、保留／排除理由、参数分类、数据依赖和 handoff | 必要路径有依据；运行时值与示范常量分开；缺失事实不由猜测补齐 |
| 5／S10 按需 | application-engineer，harden | 已确认过程、现有 AppProfile、具体能力缺口 | 新版 AppProfile、必要 helper 及验证证据和 handoff | 所需定位、等待、验证或安全失败能力已具备；无缺口时记录复用依据，不制造未发生的调用 |
| 6／S11 路线 A | [recipe-build](../../prompts/automation/agent-to-recipe/recipe-build/SKILL.md) | 过程、适用应用资料、当前公开 API | 普通 JS、CandidateManifest：`candidate.json`、实际候选路径／命令／hash 和 handoff | 输入依赖和 API 已核对；候选可独立运行，但尚不能宣称已通过 live 验收 |
| 7／S12 | [recipe-qualify](../../prompts/automation/agent-to-recipe/recipe-qualify/SKILL.md) | 冻结合同、确定候选版本、验收场景、允许的起点 | QualificationRecord：`qualification.json`、实际运行证据、失败或适用范围和 handoff | 当前候选在声明范围通过；没有未解决的关键交接、授权或业务验证问题 |

应用工程使用[应用开发框架](../../docs/frameworks/app-development-framework.md)，只处理当前任务需要的应用知识，不另做一遍完整业务规划。

## 4. 每一步结束时必须发生的交接

生产者在关键业务节点立即保存实际值、来源、观察与验证结果，结束时再汇总主产物。不能等上下文结束后凭记忆重建。

```text
保存本次尝试的主产物与证据
→ 按共享合同核对输出、版本、引用和隐私
→ 最后发布 handoff.json
→ 协调者核验并更新 progress
→ 下一 Skill 接收自己的 request 和确定版本 inputRefs
→ 消费者重新检查数据与现场前提后继续
```

每次调用传递当前 Skill、共享合同、request 与最少必需输入引用，不默认复制所有历史聊天。下游资料不足时返回明确缺口，不重新执行整个任务，也不补造观察值。宿主不能提供独立上下文时如实记录，不能把顺序切换角色宣称为无历史上下文交接测试。

关键业务值的交接必须保留其类型、来源、用途和有效条件。例如 `firstResult` 来自本次真实显示读取，随后被第二次计算消费；它可以作为示范事实交给提炼者，但新脚本 Fresh Run 必须重新读取。

交接格式、发布状态与业务成功是不同判断。只有适用 Gate 的 pass 能进入正常依赖路径；格式完整的失败资料可用于诊断，不能充作成功示范。沿用 [G0—G7](../../docs/quality/gates-and-evidence.md) 与 [F0—F10](../../docs/quality/failure-taxonomy.md)，不新增通用编号。

## 5. 失败路由、变更和停止

| 问题归属 | 返回位置 | 修复后怎样继续 |
| --- | --- | --- |
| 目标、范围、成功条件或计划有误 | automation-plan | 保留原记录；获准后发布新版本，核对受影响依赖 |
| 应用、状态、定位、Geometry 或等待假设失效 | application-engineer，repair | 定向更新资料／helper，再回到受影响环节 |
| 示范缺关键数据或结果证据 | task-demonstrate，定向补采 | 先核对现场与副作用，新增尝试，不覆盖旧事实 |
| 业务分段、参数或数据依赖有误 | procedure-synthesize | 发布新版过程，再生成受影响候选 |
| JS API、代码或候选命令错误 | recipe-build | 新候选、新 hash，再由 qualify 验收 |
| 验证资料、环境或测试范围不足 | recipe-qualify／协调者 | 报告限制或阻塞，不降低标准；确认补充授权后再测 |

Skill 只能提出 planDelta／修复请求；协调者按共享合同修订计划并展示变化。上游变更只使相关下游需要重验，不删除原始事实，不默认全部重跑。

预算耗尽、用户取消、关键证据冲突或副作用结果不明时停止依赖动作。暂停是不再派发下一工作包；取消由当前宿主／入口实际能力完成，不虚构 `Execution.pause/resume`。恢复前重新核对现场；取消不撤销已发生的业务动作。

## 6. 交付与进度出口

每个工作包开始、结束、阻塞、计划变化时，展示工作包／Skill、最近实际结果、证据引用、预算使用、未决问题和下一步。长阶段按约定节奏更新，不以时间推算“已完成百分比”。

候选默认留在获准任务目录；真实 JS 的日志、截图与结果优先保存于 `Execution.artifactDir`，任务包引用已登记的执行证据根。只有通过对应验收且获得源码发布授权后，才更新正式 `workflows/` 脚本，不自动覆盖已有参考文件。

最终报告区分文档已写、参考脚本运行、当前候选验证、跨上下文交接和完整开发链；列出具体版本、入口、环境、已测范围、失败及未测项。文件存在和六次 Skill 调用结束都不等于整链通过。

本工作流不建设 Recorder、IR、Compiler 或独立 Replay Runtime。这里的 Markdown 由 Agent 宿主读取，不能传给 `opendesk -script`；最终 `.js` 才使用现有普通脚本入口。
