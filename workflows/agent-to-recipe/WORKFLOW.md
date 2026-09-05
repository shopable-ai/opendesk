# Agent-to-Recipe：通用开发工作流

状态：作业入口 v1.1；尚未完成真实整链验收。记录日期：2026-09-06。

## 1. 先看结构：1 条工作流、12 个阶段、6 个独立 Skill

本工作流回答：Agent 怎样从任意获准桌面任务，经过真实操作、资料交接、复盘、工程化和验证，交付普通 OpenDesk JavaScript。目标应用是任务输入，不是流程名称。

| 维度 | 维护位置 | 职责 |
| --- | --- | --- |
| 通用工作流：1 条 | 本文件 | 路由、接续、产物流向、失败返回和交付边界 |
| 通用阶段：12 个 | [stages/](stages/README.md) | 每个阶段的输入、行动、输出、门禁、消费者与回退 |
| 独立专业 Skill：6 个 | [Skill 目录](../../prompts/automation/agent-to-recipe/README.md) | 可独立调用的专业方法；不依赖上游隐含聊天 |
| 测试目标 | `docs/quality/agent-to-recipe/targets/` | 指定应用、业务样本、环境和允许的测试范围，不定义专属工作流 |
| 共享合同 | [Skill contract](../../docs/frameworks/agent-to-recipe-skill-contract.md) | request／handoff、版本、权限、发布、恢复的唯一字段约定 |
| 实际任务 | `.runtime/automation-authoring/<task-id>/` | 本次工作包、进度、版本化资料、尝试与证据引用 |
| 实际业务程序 | 普通 `.js` | 使用现有 Runtime 入口执行，不解释本 Markdown |

计算器仅是[一个测试目标](../../docs/quality/agent-to-recipe/targets/macos-calculator.md)。不为应用名称创建 `workflows/<platform>/<app>/WORKFLOW.md`；既有具体业务参考 JS 暂保原路径，不因此被当成应用专属开发方法。

阶段方法依据[示范到自动化方法](../../docs/frameworks/demonstration-to-automation-pipeline.md)；本目录是其路线 A 作业映射，S11 直接生成 JS，其他路线的 Recorder IR／Compiler 不是前置。执行前遵守根 [AGENTS.md](../../AGENTS.md)，接口按当前 `docs/api/` 核验。

## 2. 正式主链与局部循环

```text
S1 任务合同＋计划
 → S2 应用认识
 → [S3 真实操作 → S4 动作验证 → S5 分类／下一决策] ↺
 → S6 验证完整任务、封存示范
 → S7 因果复盘
 → S8 业务分段与输入输出
 → S9 参数化与有限泛化
 → S10 应用能力工程化／有效产物复用检查
 → S11 生成普通 JS
 → S12 独立 Fresh Run、修复路由与交付
```

S3—S5 按业务节点循环，不是所有动作做完才统一验证；同一 Skill 可在一次调用内完成该微循环。阶段结束必须保存需要的事实或产物，但不要求十二个 Agent、十二个进程或十二种主文件格式。

## 3. 十二阶段的输入、输出和责任

| 阶段文件 | 责任 Skill | 输入 | 保存后交给下游的内容 |
| --- | --- | --- | --- |
| [S1 合同与计划](stages/01-task-contract-and-plan.md) | automation-plan | 用户目标／授权／已有记录 | TaskContract＋WorkPlan；给所有后续阶段 |
| [S2 应用认识](stages/02-application-discovery.md) | application-engineer | 合同、当前需求／观察 | AppProfile、起点、验证方式与未知项；给 S3／S10 |
| [S3 真实操作](stages/03-demonstrate-actions.md) | task-demonstrate | 当前子目标、应用资料、获准输入 | 实际动作、原始观察、关键业务值与来源；给 S4 |
| [S4 动作验证](stages/04-verify-action-results.md) | task-demonstrate | 指定动作和后置条件 | 步骤验证、可消费值及限制；给 S5／下一业务节点 |
| [S5 分类与恢复](stages/05-classify-exploration-and-recovery.md) | task-demonstrate | 动作、实际效果、验证和预算 | 分类、依赖、重试关联和下一决策；给 S3／S6／S7 |
| [S6 示范交付](stages/06-close-demonstration.md) | task-demonstrate | 合同、完整操作与证据 | dossier.json；给 S7，只有完整示范 pass 能正常提炼 |
| [S7 因果复盘](stages/07-review-causal-path.md) | procedure-synthesize | dossier、合同、指定证据 | Analysis、必要路径与排除依据；给 S8 |
| [S8 业务分段](stages/08-decompose-business-steps.md) | procedure-synthesize | 必要路径与数据流 | 步骤草案、每步输入输出／前后状态；给 S9 |
| [S9 参数化](stages/09-parameterize-and-generalize.md) | procedure-synthesize | 步骤草案、数据来源 | procedure.json、参数／依赖／支持范围与能力缺口；给 S10／S11 |
| [S10 工程化](stages/10-harden-application-operations.md) | application-engineer | 过程、AppProfile、真实缺口 | 适用应用资料、必要 helper 与验证／复用依据；给 S11 |
| [S11 生成 JS](stages/11-build-javascript-recipe.md) | recipe-build | 过程、应用能力、公开 API | .js＋candidate.json，实际路径／命令／hash；给 S12 |
| [S12 验收交付](stages/12-qualify-and-deliver.md) | recipe-qualify | 冻结合同、候选版本、测试场景 | qualification.json、证据、范围及修复请求；给协调者 |

这里显示的是方法阶段，不是固定业务工作包。S1 依据具体任务另列稳定工作包 ID；每个包写清阶段、Skill、依赖和预期交接。应用工程使用[应用开发框架](../../docs/frameworks/app-development-framework.md)，不重新定义用户任务。

## 4. 启动、调用与可接续状态

新任务按[模板](../../prompts/automation/agent-to-recipe/templates/task-package.md)初始化真实任务标识、用户请求、授权、资料根、宿主调用方式、预算和停止入口。仅要求查看／设计／写文件时，不创建运行事实或启动桌面动作。

接续先读合同、计划、唯一 progress 和已发布 handoff；检查依赖版本、证据和当前前提，再从输入就绪的未完成阶段／工作包开始。已有效的知识和代码可复用；动态窗口、账号、焦点、坐标和业务值需按本次动作重新核对。

调用者提供当前 Skill、阶段卡、共享合同、request 与精确 inputRefs，不默认复制全部历史聊天。每个生产者只写自己的获准产物，协调者维护唯一进度；同一桌面同一时刻一个操作拥有者。

工作包开始、完成、阻塞、计划变化时显示：阶段／Skill、输入来源、实际产物、最近证据、预算、未决项和下一步。不用文件数、调用次数或耗时推算完成百分比。

## 5. 逐阶段保存与跨 Skill 交接

```text
关键节点立即保存实际数据、来源、动作与观察
 → 完成本阶段的指定产物／可定位内容
 → 核对版本、引用、隐私和本范围 Gate
 → 最后发布 handoff
 → 协调者核验、更新 progress
 → 消费者检查数据适用性及必要的新现场观察
```

S3—S5 的局部成果可以接续，但不能替代 S6 完整 dossier；S7／S8 草案不能冒充 S9 完整过程。局部门禁、交接完整和业务成功分开记录。跨调用只能消费已封存的确定版本，不把正在变化的日志当不可变证据。

关键业务值包含 type、observedValue、origin、evidenceRefs、消费者和有效条件；示范样本不得变成 Fresh Run 的答案。缺信息时明确返回缺口，不依靠记忆填空。

所有字段遵守共享合同，质量规则复用 [G0—G7](../../docs/quality/gates-and-evidence.md) 与 [F0—F10](../../docs/quality/failure-taxonomy.md)。本目录没有引入自动 schema validator、Skill Registry 或可执行业务 IR。

## 6. 修复路由、停止与交付

| 问题 | 返回 |
| --- | --- |
| 目标／授权／成功条件／计划 | S1，automation-plan |
| 应用起点或当前对象认识 | S2，application-engineer |
| 缺真实动作、关键数据或示范证据 | 指定 S3／S4 节点后重新 S6，task-demonstrate |
| 因果、业务分段或参数来源 | S7／S8／S9，procedure-synthesize |
| 定位、等待、验证操作能力 | S10，application-engineer |
| JS、API、候选路径／入口错误 | S11，recipe-build |
| 验收环境／证据／范围不足 | S12／协调者，报告阻塞或获准补验 |

生产者提交 planDelta，协调者记录原因、版本与影响。只标记相关下游 needs-revalidation，不删除旧事实，也不为了通过改目标。用户停止、预算耗尽、关键证据冲突、副作用结果不明时停止依赖动作。

暂停是不再派发下一工作包；取消由真实宿主／运行入口完成，不能虚构 Execution.pause／resume。恢复前核对现场；取消不会回滚业务副作用。

只有真实验收且获准发布后，才更新正式业务源码；候选默认留在任务目录。运行日志和截图优先使用 Execution.artifactDir，任务包保存获准引用。最终报告区分文件交付、参考脚本、当前候选、无旧聊天交接和整链范围。

## 7. 测试对象的使用方式

基本测试某个已有脚本时，直接使用该目标的测试规程，不强制重走开发阶段。完整验证通用流程时，输入目标应用和业务场景，仍使用本文件与十二阶段。

首个现成测试目标是 [macOS Calculator](../../docs/quality/agent-to-recipe/targets/macos-calculator.md)，命令和判据见[计算器验证规程](../../docs/quality/agent-to-recipe/calculator-validation.md)。将来换目标只换相关任务资料、AppProfile 和测试用例，不复制本工作流、不增加按应用命名的开发 WORKFLOW。
