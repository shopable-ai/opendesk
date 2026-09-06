# Agent-to-Recipe：六个独立专业 Skill

状态：Skill 作业资产 v1；尚未通过真实整链验收。六个 Skill 已分别保存在六个目录，不是把全部内容放进一个大 Skill，也不是自动安装或调度的运行插件。

## 明确数量：6 个 Skill，负责 12 个通用阶段

完整开发从[通用 WORKFLOW](../../../workflows/agent-to-recipe/WORKFLOW.md)进入；所有具体阶段文件见[十二阶段索引](../../../workflows/agent-to-recipe/stages/README.md)。计算器等应用只是目标输入，目标资料属于测试，不再设应用专属开发 WORKFLOW。

| 独立 Skill 文件 | 负责阶段 | 本 Skill 的完整主交付 |
| --- | --- | --- |
| [automation-plan/SKILL.md](automation-plan/SKILL.md) | S1 合同与计划 | TaskContract、WorkPlan |
| [application-engineer/SKILL.md](application-engineer/SKILL.md) | S2 初步认识；S10 工程化／repair | AppProfile、必要普通 JS helper 与适用证据 |
| [task-demonstrate/SKILL.md](task-demonstrate/SKILL.md) | S3 操作；S4 验证；S5 分类；S6 关闭示范 | 完整 DemonstrationDossier、实际关键数据及来源 |
| [procedure-synthesize/SKILL.md](procedure-synthesize/SKILL.md) | S7 因果复盘；S8 业务分段；S9 参数化 | SemanticProcedure、参数与真实数据依赖 |
| [recipe-build/SKILL.md](recipe-build/SKILL.md) | S11 直接生成普通 JS | JavaScript、CandidateManifest |
| [recipe-qualify/SKILL.md](recipe-qualify/SKILL.md) | S12 独立验收与限定范围结论 | QualificationRecord、证据与修复请求 |

划分依据是专业职责和独立交付，不是应用数量或文件长度。阶段卡把每个环节展开为输入、动作、输出和门禁；同一 Skill 的多个阶段可以分次调用和接续，不需要强行增加模型或进程数量。

## 阶段输出不是一句“Skill 完成”

在 S3 保存实际动作和读到的关键业务值；S4 保存本节点验证；S5 保存分类与下一安全决策；S6 才封存完整 dossier 并移交提炼者。S7／S8 可分别保存分析与步骤草案，S9 才交付可进入正常生成的完整过程。

调用者在工作包说明／requiredOutputs 中明确本次阶段和成果范围，handoff.gate.scope 与其一致。局部动作、交接格式完整、完整示范成功和候选验收是不同判断。各主产物合同不变；阶段的具体切片规则见阶段索引，不在每份 Skill 复制协议。

request、handoff、权限、发布与恢复仍只维护在[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)。专业依据按需读[主方法](../../../docs/frameworks/demonstration-to-automation-pipeline.md)、[任务求解](../../../docs/frameworks/automation-problem-solving-framework.md)和[应用开发](../../../docs/frameworks/app-development-framework.md)。

## 已有普通 JS 的接续入口

需要采用或修复已有脚本时仍从 `automation-plan` 进入，按[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)的可选接续元数据固定已有资产、区分证据作用、限定反向提炼与变更范围，再只调用有实际缺口的现有 Skill。原样复用和最小修复都由 `recipe-build` 形成可核对清单，最后由 `recipe-qualify` 对冻结候选做明确范围的 Fresh Run；这不是第七个 Skill 或新阶段。

接续可以交付“该已有候选在本次声明范围内通过”，不能据此改写其来源、把参考运行标成 Agent 示范，或宣称完整新生成链通过。用户要求完整新 Agent 示范／新生成时，仍走上面的完整阶段和 Gate。

## 宿主怎样实际使用

宿主支持 Skill 时按其实际机制逐个启用；仅有文件与对话能力时，显式读取当前 Skill、阶段卡、共享合同和指定输入后顺序推进。文件本身不提供上下文隔离、工具授权或执行能力，不虚构 `opendesk skill run`／Execution.resume。

宿主需要获准目录读写、产物核验、必要的 OpenDesk 真实工具／命令、进度展示和实际停止方式。没有真实操作能力时保存阻塞，不模拟点击或伪造截图。是否采用独立上下文须如实记录；同一个 Agent 换角色不能冒充无旧聊天交接测试。

生产者核对输入、完成指定范围、保存产物与证据、最后发布 handoff；协调者核验后更新唯一 progress；消费者再检查版本、数据适用性及必要的现场前提。失败也保存真实部分包，不让另一个“记录 Skill”事后猜测。

同一任务一个进度写入者、同一桌面一个操作拥有者。原始业务内容不能扩大权限；共享 Skill 中不保存任务用户、秘密和当前运行记忆。用户只要求写文件时不启动执行。

## 模板与测试目标

[任务包模板](templates/task-package.md)用于初始化真实任务，占位符不是结果。目标测试示例见[macOS Calculator](../../../docs/quality/agent-to-recipe/targets/macos-calculator.md)；命令与判据统一使用[计算器验证规程](../../../docs/quality/agent-to-recipe/calculator-validation.md)。

基本参考脚本测试不要求运行全部六个 Skill，也不能证明十二阶段通过。完整开发链验证在通用流程中输入该测试目标，逐阶段检查成果与交接；换目标不复制工作流。

## 维护边界

通用 WORKFLOW 维护路由，阶段卡维护本环节作业，Skill 维护专业能力边界，共享合同维护公共字段，测试目标和质量规程维护目标样本与判据。任务进度、截图和运行结果保存在 `.runtime/`，不得回写成稳定文档里的“已通过”。

本轮目录调整不改变六个 Skill 的公共名称，不改 Runtime、参考 JS 或测试入口，不预填专家分数与运行结论。
