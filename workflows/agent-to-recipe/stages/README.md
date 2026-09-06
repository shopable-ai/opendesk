# 十二个通用阶段执行卡

状态：路线 A 作业文件 v1；尚未经过真实整链验收。记录日期：2026-09-06。

## 数量与边界

本目录明确提供 **12 个阶段执行卡**，由 [6 个独立专业 Skill](../../../prompts/automation/agent-to-recipe/README.md)承担，组成 [1 条通用工作流](../WORKFLOW.md)。阶段、Skill、业务工作包、目标应用、脚本文件不是同一个维度，不要求数量相等。

这些文件把[示范到自动化方法](../../../docs/frameworks/demonstration-to-automation-pipeline.md)映射为路线 A 的具体作业：保留 S1—S12 的方法目的，S1 包含执行前拆解，S11 直接生成普通 JS，不要求 Recorder IR／Compiler。它们不是原文的逐字复制或另一套 Runtime。

## 阶段索引与主交接

| 阶段 | 执行卡 | 责任 Skill | 主要交接成果 |
| --- | --- | --- | --- |
| S1 | [任务合同与计划](01-task-contract-and-plan.md) | automation-plan | TaskContract、WorkPlan |
| S2 | [应用认识](02-application-discovery.md) | application-engineer | AppProfile、起点与未知项 |
| S3 | [真实操作](03-demonstrate-actions.md) | task-demonstrate | 操作记录、原始观察、关键业务值及来源 |
| S4 | [动作结果验证](04-verify-action-results.md) | task-demonstrate | 步骤验证、可供消费的已验证值 |
| S5 | [探索与恢复分类](05-classify-exploration-and-recovery.md) | task-demonstrate | 分类、依赖与下一安全动作 |
| S6 | [封存可信示范](06-close-demonstration.md) | task-demonstrate | 完整 DemonstrationDossier |
| S7 | [因果复盘](07-review-causal-path.md) | procedure-synthesize | Analysis、必要路径与排除理由 |
| S8 | [业务分段](08-decompose-business-steps.md) | procedure-synthesize | 业务步骤草案及输入输出关系 |
| S9 | [参数化与泛化](09-parameterize-and-generalize.md) | procedure-synthesize | 完整 SemanticProcedure |
| S10 | [应用能力工程化](10-harden-application-operations.md) | application-engineer | 适用的 AppProfile、操作方法／必要 helper |
| S11 | [生成普通 JS](11-build-javascript-recipe.md) | recipe-build | JavaScript、CandidateManifest |
| S12 | [独立验收与交付](12-qualify-and-deliver.md) | recipe-qualify | QualificationRecord、限定范围结论 |

## 怎样调用，而不是机械跑十二次 Agent

S3→S4→S5 是按业务节点反复执行的微循环，不是先执行完全部动作，再统一验证。三者可以在同一次 task-demonstrate 调用中完成；关键观察要即时保存，转交上下文时发布检查点交接。全部业务子目标完成后才进入 S6。

S7—S9 也可以由同一 Skill 分阶段推进。阶段边界必须可观察、可保存、可恢复，但不要求每个阶段使用新模型、独立进程或独立文件格式。

既有脚本的接续不会另增阶段：S1 诚实收养当前合同和固定版本源码，S3—S6 区分历史资料、当前参考执行与新 Agent 示范；证据足够时，S7—S9 可对匹配代码与事实 dossier 做有界反向提炼。该接续结果不能声明完整示范或完整新生成链通过。

每次 request 指定当前阶段的 requiredOutputs、工作包、输入版本和验收范围。每张执行卡的产物可以是独立文件，也可以是已有主产物中有明确定位的内容；实际路径／内容定位必须进入交接，不能只有聊天总结。S7／S8 的中间草案不能冒充 S9 已完成的正式过程。

request、handoff、门禁和状态字段只以[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)为准。本目录不新增公共 API 或可执行 schema；阶段范围在 request 的工作包说明／requiredOutputs 和 handoff.gate.scope 中明确表达。

## 局部完成与完整成功

S3 的输出说明动作发生及观察已保存，不证明业务成功。S4 的 pass 只针对该次后置条件。S6 的完整示范 pass 才允许新生成链进入正常提炼；匹配既有代码与事实 dossier 只能按明确接续范围进入反向提炼。S9 的过程完成只对其声明的证据范围成立；S12 必须区分 reference-only、continuation-chain 与 new-generation-chain，不能用前两者替代完整整链验证。

正在追加的日志不是不可变交接。跨调用引用已经封存的片段／快照或确定版本；生产者先完成产物和校验，再发布 handoff。消费者检查来源、版本、适用范围与必要的新现场观察。

## 接续与目标应用

每次使用阶段卡前，先检查已有产物。只重做失效或尚未完成的部分；原事实保留，旧结论可标 needs-revalidation。没有旧任务包时由 S1 新建当前包并记录收养来源，不倒填历史阶段。无须重做 S10 时记录有效产物的复用依据，不虚构一次调用或跳过能力检查。

需要反向提炼或最小修复的接续链在 S7—S9 保存代码到业务步骤的映射和逐项证据等级；只有共享合同规定的严格 `reuse-unchanged` 例外可不制造该过程资料。S11 登记未改既有实现，或按“固定 baseline→最小候选→S12 验收→获准后应用→重新验收最终路径／hash”推进。Fresh Run 要隔离运行时残留和示范答案，不要求删除已封存知识、代码或证据。request、handoff、Gate 和范围字段仍只按共享合同表达，本目录不复制其定义。

应用名称不决定通用阶段。计算器等仅作为任务输入和测试目标；替换应用时调整目标资料与当次 AppProfile，不复制本目录十二个文件。目标测试的真实数据和进度保存在获准任务目录，不写回本目录的稳定执行卡。
