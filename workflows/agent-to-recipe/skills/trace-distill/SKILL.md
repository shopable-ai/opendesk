---
name: trace-distill
description: 从固定 Dossier 和 Raw Trace 提炼有来源的必要步骤。用于 Agent-to-Recipe S7 的 retain、merge、omit、recovery 取舍，运行时值生产/消费事实投影，以及错误删除后的局部修订。交付 DistilledSteps；不重造历史，不做 S8-S9 业务参数化，不生成 JS，不发布运行资格。
---

# trace-distill｜必要步骤提炼（S7）

## 定位与边界

输入是已发生的事实，输出是有来源、保留状态与数据依赖的必要路径。目标不是最短动作列表，也不是复刻熟悉的最终代码。原 Dossier/Raw Trace 保持不变；本 Skill 唯一维护原动作取舍。S8—S9 负责把必要步骤组织成 Business Step、解释业务含义和复用政策，不能静默改写 S7 的取舍。

| 输入 → 处理 → 输出 | 不属于本 Skill |
| --- | --- |
| 固定 TaskContract/WorkPlan、Raw Trace、Dossier、必要应用资料 → 来源核对、依赖重建、retain/merge/omit/recovery 判断 → DistilledSteps | 新增未发生动作、从 JS 反推示范、把 Expected 当观察、参数化业务、选择最终 API、代码生成或资格放行 |

独立使用不要求未来 Procedure、Candidate 或 Qualification 存在，也不要求读取完整聊天。Skill 是方法，不是独立 Agent、CLI 或新阶段；S1—S12 保持原编号。

## 先读取什么

必读 [input-spec](references/input-spec.md)、[output-spec](references/output-spec.md)、[validation](references/validation.md)、[failure-handling](references/failure-handling.md)，分别确定进入条件、交付内容、反证检查和失败返回。使用 [成果模板](templates/distilled-steps.md) 组织本次成果；[Calculator](examples/calculator.md) 只解释方法，[独立审阅](references/independent-review.md) 只检查本 Skill。

正式字段、固定引用和发布仍以 [共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md) 为唯一依据。模板不是新 schema。[io-spec](references/io-spec.md) 保留兼容导航。固定本次实际方法、四项规格、合同和输入的内容版本；不读隐含 latest，不沿 lineage 擅取未授权材料。

## 方法

### 1. 冻结事实，检查能否开始

读取实际输入字节，核对版本/hash、任务/计划、应用/目标和获准根。区别 planned、actual、expected、observation、runtime value 与 consumer；计划说要读取不表示读过，结果数字正确不证明经过所需动作。较早 attempt 的有效材料可按来源复用，不要求整链 attemptId 相同。

交叉核对原动作、observation 和 Dossier：实际值、读取身份及完整消费者集合必须一致。材料里已有但未交付的内容先请求补交；原事实缺失/矛盾返回示范，政策缺失回 S1，不能照抄某份摘要或从答案填空。

### 2. 重建实际顺序和依赖

按原始顺序列出受处理动作及其 planned 对应、真实输入/结果、前后状态、数据生产者/消费者、必要证据、已知副作用。区分数据依赖、状态准备、等待/验证边界和最终交付；没有后续数据消费者不代表动作无用。

从任务要求和终点向前检查：删去某动作后，是否仍有证据支持后续输入、前提、安全条件和成功判据？依赖不成立就保留；无法判断则 unresolved。这个检查是有据的反事实审阅，不是允许重放业务，也不宣称证明所有可能路径的全局最优。

不要把后来新执行的观察写回旧轨迹。需要试执行时，定向交 task-demonstrate 建立新 execution/Dossier，保留新旧边界。

### 3. 每个原动作明确取舍

| decision | 采用条件 | 必须保存/拒绝什么 |
| --- | --- | --- |
| retain | 提供必要输入、实际读值、状态准备、有效等待/验证、安全或终点交付 | 对应步骤、来源、理由与证据；不能只说“看起来有用” |
| merge | 可在同一必要步骤中表达，且顺序、次数、目标、每个输入/输出及验证边界不变 | 全部 sourceActionRefs 及逐原动作取舍；是表示合并，不授权减少实际输入或改成另一种操作 |
| omit | 有依据说明不承担所需状态、数据、安全、结果或约定证据作用，且不会留下未解释副作用 | 原动作与可检查的删除理由仍在 actionDecisions；“重复”“计划外”“没有返回值”不是充分理由 |
| recovery | 有来源的失败/恢复经验，不属于本次选定正常路径 | 单独记录触发、实际发生内容、效果/风险、证据及未验证范围；不自动成为可执行恢复分支 |
| unresolved | 事实、必要性或归属仍不足 | 明确缺项、受影响依赖、返回责任；阻塞必要路径时不得正常放行 |

同一 action 可以与其他 retain 动作同属一必要步骤；不为改变标签强制把已有合法归组改成 merge。凡标 merge 的动作必须出现在其目标步骤来源中，凡 retain 亦然。没有正常步骤的取舍按当前合同兼容方式表达，不虚构一个空正常步骤来满足检查器。

**三条不可破坏的规则：** 相同动作名不表示相同前置状态；相同字符不表示重复事件；读取同时可能是验证和下游数据生产者。合并不得越过未保留的读取、状态转换、等待、安全检查或失败停止边界。保留源子动作的顺序和出现次数，单有一个父 actionId 不能掩盖内部输入被去重。

成功前实际依赖过的恢复/清理不能直接移到旁支后拼接成功尾部。保留恢复后的必要状态建立，或请求新的完整轨迹证明独立干净起点。效果 unknown/partial 的动作先核对，不能当作已成功或未发生。

### 4. 形成必要步骤与运行时值投影

按实际因果顺序形成 steps：每步写 purpose、sourceActionRefs、inputs/outputs、dependencies、preconditions、expectedOutcome、verification 和 classification。expectedOutcome 是判据，verification 关联真实观察；两者不互换。正常步骤不能无事实来源，不能把未执行计划补成 retain。

对每个必需 runtime value 保存真实值及类型、实际读取的 action/application/target、证据、producerStep、完整 consumerSteps、逐原消费者的 consumerBindings、有效期和新运行重新获取要求。业务含义/允许变换取自明确政策；当次 transform/observedInput 取自实际消费事实。政策允许某变换不证明当次执行过它。

多个消费者合入一步仍逐项保留各 action 的实际输入和变换。读取与消费的前向顺序必须可追；合法同一步内部读后用、分支/循环等超出检查器范围时记录覆盖缺口，不把合法业务改造为检查器熟悉的形状。终点读取以 final output 表达消费者，不因没有下一个 UI 动作而删掉。

保留原始字符串、前导零及必要单位/精度；不随意数值化、不预填未来答案。S7 记录已经发生的变换事实，S8—S9 才确认可复用业务变换与数据映射。原动作取舍发现错误仍回 S7，不在 S9 建第二份 disposition。

### 5. 检查、冻结、交接

依次检查输入来源、每动作唯一取舍、来源双向覆盖、顺序/次数、状态前提、完整生产/消费、恢复隔离、未知副作用和下游材料可读性。按 validation 使用适用检查器并人工审阅其覆盖之外的语义；程序 PASS 不替代方法正确、授权或 Gate。

冻结唯一 `distilled-steps.json`；同版 Markdown 视图注明主产物 ref/hash。按 output-spec 向 procedure-synthesize 明确交付必要事实、关系、政策及定向证据正文。历史 lineage 不是授权 S9 重读全量 Dossier/Trace；检查器读源核对也不能替代对 Producer 的材料交付。

失败保留真实局部成果和 nextRequest，不伪造成功。输入/方法/合同均未变且重检有效时复用原字节，只重做受影响环节；影响性变化发布新版本并传播重验。整链成功或最终值正确均不能替本 Skill 独立放行。
