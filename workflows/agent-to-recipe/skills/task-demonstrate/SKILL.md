---
name: task-demonstrate
description: 按固定 TaskContract、WorkPlan 与应用认识执行 Agent-to-Recipe S3-S6 的真实任务或定向补采，同步保存 planned/actual、观察、运行时值、消费者、副作用与逐项验证，交付 DemonstrationDossier 和 Raw Trace/Evidence。用于需要证明“实际发生了什么”的示范；不把 Expected、最终代码、计划或模型描述当执行证据，不负责 S7 动作取舍、S8-S9 业务参数化、S11 代码实现或 S12 资格放行。
---

# task-demonstrate｜真实示范与留证（S3-S6）

## 从计划到真实事实

把“准备怎么做”变成“实际发生了什么”的可审计事实包。核心产物是 DemonstrationDossier 与其引用的 Raw Trace/Evidence；不是最终代码，也不是必要路径或业务过程。

六类信息必须分开：

| 角色 | 含义 | 不能冒充 |
| --- | --- | --- |
| planned | 动作前计划做什么、期望检查什么 | actual |
| actual | 实际调用/输入/动作及回执 | planned 或最终 JS |
| expected | 事先判据或预期结果 | observation/runtime value |
| observation | 动作后真实读取/看到的状态 | expected |
| runtime value | 本次真实读取并可能被后续消费的值 | 常量/参数默认值 |
| consumer | 实际使用某 runtime value 的动作、目标、输入和变换 | “理论上会使用”的步骤 |

最终 JS 只能说明某个实现写了什么；即使后来运行成功，也不能倒造本次示范当时的 actual、observation、选择过程或副作用。

## 开始作业时读取

必读本文件及 [input-spec](references/input-spec.md)、[output-spec](references/output-spec.md)、[validation](references/validation.md)、[failure-handling](references/failure-handling.md)。四者分别定义进入条件、交付内容、错误发现和失败返回。

用 [示范成果模板](templates/demonstration-dossier.md) 组织新任务；[Calculator 案例](examples/calculator.md) 只解释方法，不定义通用规则。[独立审阅](references/independent-review.md) 用于只审本 Skill。原 [io-spec](references/io-spec.md) 仅保留兼容导航。

正式字段、引用和状态以 [共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md) 为唯一依据；模板不是新 schema。执行前固定本 Skill、四项规格、合同、TaskContract、WorkPlan、AppProfile/规则及实际业务输入的版本。

## 正式阶段边界：S3 / S4 / S5 / S6 不能合并判断

同一个 Skill 连续承担四个正式阶段，但每一阶段回答的问题、实际输出和 failure owner 不同：

| 阶段 | 进入输入 | 本阶段只负责 | Actual Output / 最低验收 | 典型错误与返回 |
| --- | --- | --- | --- | --- |
| **S3 Execute** | planned step、目标依据、授权、前置状态 | 真正执行当前获准动作并记录 actual request / target / receipt / side-effect state | 能证明动作真实发生；计划或最终代码不能冒充 actual | 没有真实 action、目标错、Expected 填 raw return → S3；目标依据本身错回 S2/S10 |
| **S4 Observe / Verify** | S3 actual action、正确对象、Expected / criterion | 重新观察正确对象，把 Actual 与 Expected 分开比较 | actual observation + pass/fail/uncertain + evidence | receipt 当 observation、Expected 当 actual、对象读错 → S4；读取规则失效回 S2/S10 |
| **S5 Classify / Decide** | S3/S4 事实、side effect、WorkPlan、预算 | 分类并决定 continue / revise / recover / stop | classification、decision、next step、planDelta/recovery（如有） | uncertain 仍继续、unknown effect 重放、篡改过去 actual → S5 |
| **S6 Close** | 已完成微循环的合同、actual、observation、数据流和证据 | 在任务级关闭本次示范，冻结事实包和覆盖范围 | Dossier / Raw Trace refs、runtime dataflow、criterion status、sideEffects、unresolved | 只看 final result、补造缺失历史、扩大覆盖范围 → S6 |

阶段边界判断使用同一原则：**找到第一个“输入仍正确、输出第一次错误”的阶段。** S4 判断错不能通过重放 S3 来掩盖；S6 汇总错也不能改写 S3—S5 已真实发生的事实。

## 方法

### 1. 固定起点与证据角色

确认当前 task、plan revision、工作包、成功/失败标准、允许副作用、预算和停止条件。只复用仍适用的 AppProfile/规则；当前账号、窗口、模式、焦点、目标和前置状态按本次需要重新核对。

为每个 planned step 先写 expected 和 observation 计划，但不要预填 actual。Expected 可以是“显示区应变为某种状态”或合同允许的具体值；它只参与比较，不能成为后续输入。

若上一次动作效果 unknown/partial，先定向观察实际状态，不通过重放前缀恢复到熟悉状态。

对每个准备或业务输入，先把需要的操作性前置写成可观察判据：当前对象/模式、输入目标、可能影响下一动作的既有副作用、动作后的独立效果验证及停止点。不能把显示默认值、按钮名称或回执单独解释为全部待执行操作已可独立进行；也不要求证明不可观察的内部状态。若 S2 的最小认识不足以支持这个具体前置，暂停输入，带原 S3 提案、反例和已知副作用向 application-engineer 请求定向补证；审阅增量后以精确引用返回本工作包，再对下一次输入做新鲜只读预检。补证不能被写成 S3 已执行。

### 2. 动作前确认

只有计划、授权、目标身份/唯一性、前提和预算都满足才执行。按需读取当前 API canonical 与公共约束；“文档存在”“候选被选中”“运行已验证”是三件不同的事实。

若当前 planned step 在 S1 已标为高影响，动作前消费其有界反方预演，但必须用**当前现场**重新判断是否仍适用：先检查已知的目标碰撞、错误读取来源、残留状态、重复副作用、窗口／对象漂移或关键数据依赖等高风险条件；能用只读观察低成本否证的先否证。若现场暴露新的高影响风险，先形成 planDelta／定向补证，不为了“计划已经写好”继续执行。低风险、已有稳定规则且无新迹象的步骤不重复做冗长风险分析。

需要探索或计划偏离时记录原因。计划变化走 planDelta/新版本，过去已经发生的 actual 与 observation 不随计划改版重写。

### 3. S3 Execute｜执行当前获准动作

绑定当前 planned step、业务子目标、目标依据、预期状态变化和风险，然后真正执行当前获准动作。

至少保存：

    plannedStepRef
    actualAction / actualRequest
    actualTarget
    receipt / raw return
    execution identity / order
    evidenceRefs
    sideEffect = known / unknown / partial

S3 只证明“做了什么”。receipt 不能证明业务后置正确；Expected、计划、参考脚本或最终 JS 都不能补写 actual。副作用结果 unknown 时停止依赖动作，不为补记录盲目重放。

### 4. S4 Observe / Verify｜重新观察并验证实际效果

动作后重新观察**正确业务对象**，保存 actual observation，再与 Expected / criterion 比较：

    sourceActionRef
    observedObjectIdentity
    actualObservation
    expected
    comparison
    status = pass / fail / uncertain
    evidenceRefs / limitations

动作回执与业务 observation 分开。没有观察到不能写成 false；证据不足就保持 uncertain。

关键 runtime value 只能从本次真实 observation 产生。保存原始值、类型、origin action、application/target、evidence、单位/精度、有效期和 fresh run 是否重读；保留前导零与原始字符串。

### 5. S5 Classify / Decide｜分类并决定下一步

只基于已经成立的 S3/S4 事实分类 normal/setup/verification/exploration/retry/recovery/off-task/error，并决定：

    continue / revise / recover / stop
    nextPlannedStep
    planDelta / recoveryRelation（如有）
    sideEffectHandling
    reason / evidenceRefs

S5 不创造新的 UI 真相，不修改过去 actual，也不能把 uncertain 当 pass。unknown side effect、身份歧义、越权或预算耗尽时停止；合法有界重试必须有新依据。

### 6. 跨微循环保存 runtime value 与实际 consumer

runtime value 的 producer 来自 S4 的实际 observation；consumer 必须来自后续 S3 真正执行的 actual input。对每个实际消费者保存 consumer action、application/target、actual input、actual transform 及对应 runtime value。

同一个值有多个消费者时逐个记录；终点读取以 final output 作为消费目的。不能只写“第二步使用 firstResult”，也不能用 Expected、历史值或 JS 推算值填充 consumer。

### 7. S6 Close｜冻结任务级事实包并交 S7

任务结束、失败或定向补采收口时，逐 success criterion 汇总 expected vs actual observation，明确 pass/fail/not-run/blocked，并冻结：

- Dossier、Raw Trace、Execution/Evidence refs；
- planned/actual 对应；
- runtimeValues 与完整 consumer bindings；
- sideEffects、planDelta、unresolved；
- 本次 taskStatus、覆盖范围、最后可信状态与下一安全动作。

S6 只汇总已经存在的事实，不从最终结果反推缺失历史。动作成功、后置成功、业务成功、视觉/人工接受分别记录；部分完成保留剩余项，不缩小原请求后写“全部完成”。

S7 消费事实并做 retain/merge/omit/recovery；本 Skill 不提前替 S7 去噪。S9 需要的定向事实必须明确交付正文/固定引用，不能因为检查器能读整个 Dossier 就视为语义 Producer 已收到。

## 不负责什么

S1 负责目标、授权、政策和成功标准；application-engineer 负责应用身份、关系和操作规则；S7 负责原动作取舍；S8-S9 负责 Business Step、参数、业务含义与可复用变换；S11 负责 JS；S12 负责冻结 Candidate 的资格。

本 Skill 可以发现这些问题并定向返回，但不能静默修订下游产物。Human/Recorder/已有代码保留原来源，不能追认为本次 Agent 示范。

## 完成条件

完成不能只看“Dossier 最终存在”。S3、S4、S5、S6 必须分别满足各自最低条件，并且能够定位第一个错误阶段。只有声明范围内的 actual、observation、decision、runtime value、consumer、criterion 和副作用都有可读来源，且六类角色未互换，才形成可供 S7 正常消费的示范事实包。文件存在、最终代码正确、fixture 通过、模型自述或历史 Qualification 都不能代替本次实际执行证据。

每个正式阶段 S3／S4／S5／S6 的 Actual Output 再分别接受 [Workflow 阶段退出循环](../../WORKFLOW.md)和 [唯一五维评分](../../design/validation-plan.md)；微循环中缺 S4 真实观察，不能凭 S3 回执进入 S5，也不能由 S6 最终数值倒证事实。
