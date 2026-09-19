# Agent-to-Recipe：200 回合多角色反方审计与 95+ 方案评审

## 结论先行

本记录按当前 `master` 对 Agent-to-Recipe 做 **10 个专家视角 × 20 个固定检查项 = 200 个结构化反方审计回合**。这些“专家”是角色化审计视角，不是 200 位外部真人，也不冒充独立人工委员会。目的不是用讨论次数抬分，而是强迫同一方案从架构、RPA、验证、数据血缘、安全、Agent 评测、维护性、跨平台、成本和独立验收十个角度反复接受反例。

**设计方案预评审：97/100。** 评分只适用于“当前解决方案设计”，沿用 `validation-plan.md` 唯一 20 项、100 分规则：19 项有明确设计与仓库落点按 5 分计，C20“成本与预算的实际量化效果”只有局部证据按 2 分计，合计 97。这个分数不是模型成功率、Recipe 业务资格、Runtime 可靠性或生产成熟度。

**当前实现/证据不能因此宣称 95+。** 仍有六类证据未闭合：当前 HEAD 的 live Calculator Fresh Run、合法变参与读失败停止的真实桌面资格、实际模型 Producer 的隔离 Expected 评测、宿主 Skill 发现/加载与上下文隔离、影响性修改后的真实依赖重验，以及实际成本数据。任何一项属于 requested scope 时，不能用本设计分覆盖 NOT-RUN/BLOCKED。

## 95+ 最终方案

不增加 S13，不新增 Workflow Engine、DSL、Compiler、Registry 或第二套状态真相。最终方案保持：

```text
业务需求 / 授权
→ S1 TaskContract / WorkPlan
→ 能力需求
→ Capability Discovery
→ Method Selection
→ Canonical Contract Reading
→ Runtime Validation
→ S3—S6 Observation / Evidence
→ S7 DistilledSteps
→ S8—S9 SemanticProcedure
   ├─ Business Steps
   ├─ dataDependencies
   └─ capabilityDecisions
→ S10 AppProfile / Locator / Stability
→ S11 普通 JavaScript + CandidateManifest
→ S12 recipe-qualify
→ QualificationRecord + Recipe Review
→ Run Summary / Handoff
```

95+ 不靠继续堆文档，而靠四个硬收口：

1. **Producer 真测**：使用现有 `adjacent-producer-eval.js`，Expected 由 evaluator 持有，实际 model Producer 只能看到允许 packet；至少验证 S7→S9 的未见样本、失败样本和一次合法变化。
2. **Frozen Candidate 真测**：固定当前 `calculator.js` 及依赖，在获准 macOS 桌面做 Fresh Run；基线 25×4+10→实际 firstResult→6×firstResult，加一个合法变参与一个 read failure stop；独立观察不向生产链供值。
3. **宿主与版本真测**：证明方法文件可被实际宿主读取/执行；Candidate、Procedure、AppProfile、API contract 和 Runtime byte/version 精确绑定；任何影响性变化使旧资格失效。
4. **95 Gate**：只有适用 G0—G7 全部通过、requested 必测项没有 FAIL/NOT-RUN/BLOCKED、20 项评分 ≥95，才允许写“该固定范围达到 95+”。评分不能覆盖 Gate。

## 当前审计发现的高价值问题

- **反方 1：‘测试很多’不等于 Producer 会做。** 159 项离线测试和 deterministic test double 证明检查器/调用器，不证明模型提炼能力。
- **反方 2：历史 q002 live 不能自动升级成当前 HEAD live。** 可复用历史事实，但必须保持版本/范围边界。
- **反方 3：selected Runtime owner PASS 不能写成 full Runtime PASS。** formal contract 可 PASS；full unit 仍有既有失败，应保留边界。
- **反方 4：95 分最容易被 scope gaming 污染。** requested 未资格项不能挪到 excluded；NOT-RUN/BLOCKED 不能按通过计。
- **反方 5：继续加新层反而降分。** 当前最优动作是补真实证据，不是新增 S13、Registry 或第二套 schema。
- **反方 6：成本维度还缺事实。** 当前有预算和结束条件设计，但缺同任务对照下的实际模型调用、时间、人工修订和复用成本数据，所以设计分保留 3 分扣分空间。

## 200 回合审计账本

| 回合 | 专家视角 | 检查项 | 反方问题 | 结论 |
| --- | --- | --- | --- | --- |
| R001 | E1 工作流架构专家 | C01 目标不偷换 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 用户目标、成功条件、授权与固定 Recipe 对象是否保持不变？ | 设计=PASS；证据=SUPPORTED |
| R002 | E1 工作流架构专家 | C02 来源与未知分离 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 观察、计划期望、Expected、推断与未知是否明确分开？ | 设计=PASS；证据=SUPPORTED |
| R003 | E1 工作流架构专家 | C03 需求覆盖 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 需求是否映射到阶段、行为案例、产物和验证，而非只增加概念？ | 设计=PASS；证据=SUPPORTED |
| R004 | E1 工作流架构专家 | C04 真实数据依赖 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ firstResult 等运行值是否有生产者、消费者和真实读取来源？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R005 | E1 工作流架构专家 | C05 成功/失败判据 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ PASS/FAIL/NOT-RUN/BLOCKED 与停止条件是否清晰？ | 设计=PASS；证据=SUPPORTED |
| R006 | E1 工作流架构专家 | C06 阶段边界与独立性 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ Capability、Procedure、Application、Candidate、Qualification 是否边界明确？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R007 | E1 工作流架构专家 | C07 必要前提 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 版本、授权、应用、Runtime、证据与 requested scope 是否是显式前提？ | 设计=PASS；证据=SUPPORTED |
| R008 | E1 工作流架构专家 | C08 路由与返工 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 错误能否返回真正 owner，而不是在下游放宽标准？ | 设计=PASS；证据=SUPPORTED |
| R009 | E1 工作流架构专家 | C09 无职责重叠/循环 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ S7/S9/S10/S11/S12 是否不重复维护同一真相？ | 设计=PASS；证据=SUPPORTED |
| R010 | E1 工作流架构专家 | C10 产物可消费 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 下游是否能只靠正式输入继续，而不依赖聊天隐含状态？ | 设计=PASS；证据=SUPPORTED |
| R011 | E1 工作流架构专家 | C11 版本与来源一致 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ hash/ref/revision/sourceMapping/capabilityDecisionRefs 是否绑定精确对象？ | 设计=PASS；证据=SUPPORTED |
| R012 | E1 工作流架构专家 | C12 计划/事实/语义分离 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ WorkPlan、Raw Trace、DistilledSteps、SemanticProcedure 是否不互相覆盖？ | 设计=PASS；证据=SUPPORTED |
| R013 | E1 工作流架构专家 | C13 证据生命周期 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 历史证据、当前证据、Fresh Run、持久证据和失效条件是否区分？ | 设计=PASS；证据=SUPPORTED |
| R014 | E1 工作流架构专家 | C14 正常场景证据 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 不是只看文档或 mock，而是有相应层级的实际执行证据？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R015 | E1 工作流架构专家 | C15 变化/拒绝证据 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 合法变参、缺证据、错误数据链、旧资格、漂移和拒绝是否覆盖？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R016 | E1 工作流架构专家 | C16 失败返回正确 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 失败是否保留原事实、停止后续副作用并给出 repair owner？ | 设计=PASS；证据=SUPPORTED |
| R017 | E1 工作流架构专家 | C17 修改后重验 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ Candidate/依赖变化后是否失效旧资格并重跑受影响范围？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R018 | E1 工作流架构专家 | C18 复杂度适配 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 是否保持普通 JS、普通函数和最小必要工件，而不是平台化过度设计？ | 设计=PASS；证据=SUPPORTED |
| R019 | E1 工作流架构专家 | C19 API 复用收益 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 是否通过短入口→候选→canonical contract→Runtime validation 复用正式能力？ | 设计=PASS；证据=SUPPORTED |
| R020 | E1 工作流架构专家 | C20 预算与结束条件 | 若删除聊天上下文，只看阶段合同，这一项是否仍成立？ 模型/时间/重试预算、结束条件和工程成本是否能被实际度量？ | 设计=PARTIAL；证据=PARTIAL/NOT-CLOSED |
| R021 | E2 RPA/桌面自动化专家 | C01 目标不偷换 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 用户目标、成功条件、授权与固定 Recipe 对象是否保持不变？ | 设计=PASS；证据=SUPPORTED |
| R022 | E2 RPA/桌面自动化专家 | C02 来源与未知分离 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 观察、计划期望、Expected、推断与未知是否明确分开？ | 设计=PASS；证据=SUPPORTED |
| R023 | E2 RPA/桌面自动化专家 | C03 需求覆盖 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 需求是否映射到阶段、行为案例、产物和验证，而非只增加概念？ | 设计=PASS；证据=SUPPORTED |
| R024 | E2 RPA/桌面自动化专家 | C04 真实数据依赖 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ firstResult 等运行值是否有生产者、消费者和真实读取来源？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R025 | E2 RPA/桌面自动化专家 | C05 成功/失败判据 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ PASS/FAIL/NOT-RUN/BLOCKED 与停止条件是否清晰？ | 设计=PASS；证据=SUPPORTED |
| R026 | E2 RPA/桌面自动化专家 | C06 阶段边界与独立性 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ Capability、Procedure、Application、Candidate、Qualification 是否边界明确？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R027 | E2 RPA/桌面自动化专家 | C07 必要前提 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 版本、授权、应用、Runtime、证据与 requested scope 是否是显式前提？ | 设计=PASS；证据=SUPPORTED |
| R028 | E2 RPA/桌面自动化专家 | C08 路由与返工 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 错误能否返回真正 owner，而不是在下游放宽标准？ | 设计=PASS；证据=SUPPORTED |
| R029 | E2 RPA/桌面自动化专家 | C09 无职责重叠/循环 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ S7/S9/S10/S11/S12 是否不重复维护同一真相？ | 设计=PASS；证据=SUPPORTED |
| R030 | E2 RPA/桌面自动化专家 | C10 产物可消费 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 下游是否能只靠正式输入继续，而不依赖聊天隐含状态？ | 设计=PASS；证据=SUPPORTED |
| R031 | E2 RPA/桌面自动化专家 | C11 版本与来源一致 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ hash/ref/revision/sourceMapping/capabilityDecisionRefs 是否绑定精确对象？ | 设计=PASS；证据=SUPPORTED |
| R032 | E2 RPA/桌面自动化专家 | C12 计划/事实/语义分离 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ WorkPlan、Raw Trace、DistilledSteps、SemanticProcedure 是否不互相覆盖？ | 设计=PASS；证据=SUPPORTED |
| R033 | E2 RPA/桌面自动化专家 | C13 证据生命周期 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 历史证据、当前证据、Fresh Run、持久证据和失效条件是否区分？ | 设计=PASS；证据=SUPPORTED |
| R034 | E2 RPA/桌面自动化专家 | C14 正常场景证据 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 不是只看文档或 mock，而是有相应层级的实际执行证据？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R035 | E2 RPA/桌面自动化专家 | C15 变化/拒绝证据 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 合法变参、缺证据、错误数据链、旧资格、漂移和拒绝是否覆盖？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R036 | E2 RPA/桌面自动化专家 | C16 失败返回正确 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 失败是否保留原事实、停止后续副作用并给出 repair owner？ | 设计=PASS；证据=SUPPORTED |
| R037 | E2 RPA/桌面自动化专家 | C17 修改后重验 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ Candidate/依赖变化后是否失效旧资格并重跑受影响范围？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R038 | E2 RPA/桌面自动化专家 | C18 复杂度适配 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 是否保持普通 JS、普通函数和最小必要工件，而不是平台化过度设计？ | 设计=PASS；证据=SUPPORTED |
| R039 | E2 RPA/桌面自动化专家 | C19 API 复用收益 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 是否通过短入口→候选→canonical contract→Runtime validation 复用正式能力？ | 设计=PASS；证据=SUPPORTED |
| R040 | E2 RPA/桌面自动化专家 | C20 预算与结束条件 | 若窗口、布局或读值发生变化，这一项会不会把旧状态当当前事实？ 模型/时间/重试预算、结束条件和工程成本是否能被实际度量？ | 设计=PARTIAL；证据=PARTIAL/NOT-CLOSED |
| R041 | E3 验证与测试专家 | C01 目标不偷换 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 用户目标、成功条件、授权与固定 Recipe 对象是否保持不变？ | 设计=PASS；证据=SUPPORTED |
| R042 | E3 验证与测试专家 | C02 来源与未知分离 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 观察、计划期望、Expected、推断与未知是否明确分开？ | 设计=PASS；证据=SUPPORTED |
| R043 | E3 验证与测试专家 | C03 需求覆盖 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 需求是否映射到阶段、行为案例、产物和验证，而非只增加概念？ | 设计=PASS；证据=SUPPORTED |
| R044 | E3 验证与测试专家 | C04 真实数据依赖 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ firstResult 等运行值是否有生产者、消费者和真实读取来源？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R045 | E3 验证与测试专家 | C05 成功/失败判据 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ PASS/FAIL/NOT-RUN/BLOCKED 与停止条件是否清晰？ | 设计=PASS；证据=SUPPORTED |
| R046 | E3 验证与测试专家 | C06 阶段边界与独立性 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ Capability、Procedure、Application、Candidate、Qualification 是否边界明确？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R047 | E3 验证与测试专家 | C07 必要前提 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 版本、授权、应用、Runtime、证据与 requested scope 是否是显式前提？ | 设计=PASS；证据=SUPPORTED |
| R048 | E3 验证与测试专家 | C08 路由与返工 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 错误能否返回真正 owner，而不是在下游放宽标准？ | 设计=PASS；证据=SUPPORTED |
| R049 | E3 验证与测试专家 | C09 无职责重叠/循环 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ S7/S9/S10/S11/S12 是否不重复维护同一真相？ | 设计=PASS；证据=SUPPORTED |
| R050 | E3 验证与测试专家 | C10 产物可消费 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 下游是否能只靠正式输入继续，而不依赖聊天隐含状态？ | 设计=PASS；证据=SUPPORTED |
| R051 | E3 验证与测试专家 | C11 版本与来源一致 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ hash/ref/revision/sourceMapping/capabilityDecisionRefs 是否绑定精确对象？ | 设计=PASS；证据=SUPPORTED |
| R052 | E3 验证与测试专家 | C12 计划/事实/语义分离 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ WorkPlan、Raw Trace、DistilledSteps、SemanticProcedure 是否不互相覆盖？ | 设计=PASS；证据=SUPPORTED |
| R053 | E3 验证与测试专家 | C13 证据生命周期 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 历史证据、当前证据、Fresh Run、持久证据和失效条件是否区分？ | 设计=PASS；证据=SUPPORTED |
| R054 | E3 验证与测试专家 | C14 正常场景证据 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 不是只看文档或 mock，而是有相应层级的实际执行证据？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R055 | E3 验证与测试专家 | C15 变化/拒绝证据 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 合法变参、缺证据、错误数据链、旧资格、漂移和拒绝是否覆盖？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R056 | E3 验证与测试专家 | C16 失败返回正确 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 失败是否保留原事实、停止后续副作用并给出 repair owner？ | 设计=PASS；证据=SUPPORTED |
| R057 | E3 验证与测试专家 | C17 修改后重验 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ Candidate/依赖变化后是否失效旧资格并重跑受影响范围？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R058 | E3 验证与测试专家 | C18 复杂度适配 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 是否保持普通 JS、普通函数和最小必要工件，而不是平台化过度设计？ | 设计=PASS；证据=SUPPORTED |
| R059 | E3 验证与测试专家 | C19 API 复用收益 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 是否通过短入口→候选→canonical contract→Runtime validation 复用正式能力？ | 设计=PASS；证据=SUPPORTED |
| R060 | E3 验证与测试专家 | C20 预算与结束条件 | 若故意构造反例，这一项是否会失败而不是继续给 PASS？ 模型/时间/重试预算、结束条件和工程成本是否能被实际度量？ | 设计=PARTIAL；证据=PARTIAL/NOT-CLOSED |
| R061 | E4 数据血缘/契约专家 | C01 目标不偷换 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 用户目标、成功条件、授权与固定 Recipe 对象是否保持不变？ | 设计=PASS；证据=SUPPORTED |
| R062 | E4 数据血缘/契约专家 | C02 来源与未知分离 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 观察、计划期望、Expected、推断与未知是否明确分开？ | 设计=PASS；证据=SUPPORTED |
| R063 | E4 数据血缘/契约专家 | C03 需求覆盖 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 需求是否映射到阶段、行为案例、产物和验证，而非只增加概念？ | 设计=PASS；证据=SUPPORTED |
| R064 | E4 数据血缘/契约专家 | C04 真实数据依赖 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ firstResult 等运行值是否有生产者、消费者和真实读取来源？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R065 | E4 数据血缘/契约专家 | C05 成功/失败判据 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ PASS/FAIL/NOT-RUN/BLOCKED 与停止条件是否清晰？ | 设计=PASS；证据=SUPPORTED |
| R066 | E4 数据血缘/契约专家 | C06 阶段边界与独立性 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ Capability、Procedure、Application、Candidate、Qualification 是否边界明确？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R067 | E4 数据血缘/契约专家 | C07 必要前提 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 版本、授权、应用、Runtime、证据与 requested scope 是否是显式前提？ | 设计=PASS；证据=SUPPORTED |
| R068 | E4 数据血缘/契约专家 | C08 路由与返工 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 错误能否返回真正 owner，而不是在下游放宽标准？ | 设计=PASS；证据=SUPPORTED |
| R069 | E4 数据血缘/契约专家 | C09 无职责重叠/循环 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ S7/S9/S10/S11/S12 是否不重复维护同一真相？ | 设计=PASS；证据=SUPPORTED |
| R070 | E4 数据血缘/契约专家 | C10 产物可消费 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 下游是否能只靠正式输入继续，而不依赖聊天隐含状态？ | 设计=PASS；证据=SUPPORTED |
| R071 | E4 数据血缘/契约专家 | C11 版本与来源一致 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ hash/ref/revision/sourceMapping/capabilityDecisionRefs 是否绑定精确对象？ | 设计=PASS；证据=SUPPORTED |
| R072 | E4 数据血缘/契约专家 | C12 计划/事实/语义分离 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ WorkPlan、Raw Trace、DistilledSteps、SemanticProcedure 是否不互相覆盖？ | 设计=PASS；证据=SUPPORTED |
| R073 | E4 数据血缘/契约专家 | C13 证据生命周期 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 历史证据、当前证据、Fresh Run、持久证据和失效条件是否区分？ | 设计=PASS；证据=SUPPORTED |
| R074 | E4 数据血缘/契约专家 | C14 正常场景证据 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 不是只看文档或 mock，而是有相应层级的实际执行证据？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R075 | E4 数据血缘/契约专家 | C15 变化/拒绝证据 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 合法变参、缺证据、错误数据链、旧资格、漂移和拒绝是否覆盖？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R076 | E4 数据血缘/契约专家 | C16 失败返回正确 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 失败是否保留原事实、停止后续副作用并给出 repair owner？ | 设计=PASS；证据=SUPPORTED |
| R077 | E4 数据血缘/契约专家 | C17 修改后重验 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ Candidate/依赖变化后是否失效旧资格并重跑受影响范围？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R078 | E4 数据血缘/契约专家 | C18 复杂度适配 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 是否保持普通 JS、普通函数和最小必要工件，而不是平台化过度设计？ | 设计=PASS；证据=SUPPORTED |
| R079 | E4 数据血缘/契约专家 | C19 API 复用收益 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 是否通过短入口→候选→canonical contract→Runtime validation 复用正式能力？ | 设计=PASS；证据=SUPPORTED |
| R080 | E4 数据血缘/契约专家 | C20 预算与结束条件 | 若任一 ref/hash/producer/consumer 被替换，这一项能否检测断链？ 模型/时间/重试预算、结束条件和工程成本是否能被实际度量？ | 设计=PARTIAL；证据=PARTIAL/NOT-CLOSED |
| R081 | E5 安全与反方审计专家 | C01 目标不偷换 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 用户目标、成功条件、授权与固定 Recipe 对象是否保持不变？ | 设计=PASS；证据=SUPPORTED |
| R082 | E5 安全与反方审计专家 | C02 来源与未知分离 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 观察、计划期望、Expected、推断与未知是否明确分开？ | 设计=PASS；证据=SUPPORTED |
| R083 | E5 安全与反方审计专家 | C03 需求覆盖 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 需求是否映射到阶段、行为案例、产物和验证，而非只增加概念？ | 设计=PASS；证据=SUPPORTED |
| R084 | E5 安全与反方审计专家 | C04 真实数据依赖 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ firstResult 等运行值是否有生产者、消费者和真实读取来源？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R085 | E5 安全与反方审计专家 | C05 成功/失败判据 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ PASS/FAIL/NOT-RUN/BLOCKED 与停止条件是否清晰？ | 设计=PASS；证据=SUPPORTED |
| R086 | E5 安全与反方审计专家 | C06 阶段边界与独立性 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ Capability、Procedure、Application、Candidate、Qualification 是否边界明确？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R087 | E5 安全与反方审计专家 | C07 必要前提 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 版本、授权、应用、Runtime、证据与 requested scope 是否是显式前提？ | 设计=PASS；证据=SUPPORTED |
| R088 | E5 安全与反方审计专家 | C08 路由与返工 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 错误能否返回真正 owner，而不是在下游放宽标准？ | 设计=PASS；证据=SUPPORTED |
| R089 | E5 安全与反方审计专家 | C09 无职责重叠/循环 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ S7/S9/S10/S11/S12 是否不重复维护同一真相？ | 设计=PASS；证据=SUPPORTED |
| R090 | E5 安全与反方审计专家 | C10 产物可消费 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 下游是否能只靠正式输入继续，而不依赖聊天隐含状态？ | 设计=PASS；证据=SUPPORTED |
| R091 | E5 安全与反方审计专家 | C11 版本与来源一致 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ hash/ref/revision/sourceMapping/capabilityDecisionRefs 是否绑定精确对象？ | 设计=PASS；证据=SUPPORTED |
| R092 | E5 安全与反方审计专家 | C12 计划/事实/语义分离 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ WorkPlan、Raw Trace、DistilledSteps、SemanticProcedure 是否不互相覆盖？ | 设计=PASS；证据=SUPPORTED |
| R093 | E5 安全与反方审计专家 | C13 证据生命周期 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 历史证据、当前证据、Fresh Run、持久证据和失效条件是否区分？ | 设计=PASS；证据=SUPPORTED |
| R094 | E5 安全与反方审计专家 | C14 正常场景证据 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 不是只看文档或 mock，而是有相应层级的实际执行证据？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R095 | E5 安全与反方审计专家 | C15 变化/拒绝证据 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 合法变参、缺证据、错误数据链、旧资格、漂移和拒绝是否覆盖？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R096 | E5 安全与反方审计专家 | C16 失败返回正确 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 失败是否保留原事实、停止后续副作用并给出 repair owner？ | 设计=PASS；证据=SUPPORTED |
| R097 | E5 安全与反方审计专家 | C17 修改后重验 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ Candidate/依赖变化后是否失效旧资格并重跑受影响范围？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R098 | E5 安全与反方审计专家 | C18 复杂度适配 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 是否保持普通 JS、普通函数和最小必要工件，而不是平台化过度设计？ | 设计=PASS；证据=SUPPORTED |
| R099 | E5 安全与反方审计专家 | C19 API 复用收益 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 是否通过短入口→候选→canonical contract→Runtime validation 复用正式能力？ | 设计=PASS；证据=SUPPORTED |
| R100 | E5 安全与反方审计专家 | C20 预算与结束条件 | 若有人为了追 95 分伪造、缩 scope 或搬动 excluded，这一项能否阻止？ 模型/时间/重试预算、结束条件和工程成本是否能被实际度量？ | 设计=PARTIAL；证据=PARTIAL/NOT-CLOSED |
| R101 | E6 AI Agent 评测专家 | C01 目标不偷换 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 用户目标、成功条件、授权与固定 Recipe 对象是否保持不变？ | 设计=PASS；证据=SUPPORTED |
| R102 | E6 AI Agent 评测专家 | C02 来源与未知分离 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 观察、计划期望、Expected、推断与未知是否明确分开？ | 设计=PASS；证据=SUPPORTED |
| R103 | E6 AI Agent 评测专家 | C03 需求覆盖 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 需求是否映射到阶段、行为案例、产物和验证，而非只增加概念？ | 设计=PASS；证据=SUPPORTED |
| R104 | E6 AI Agent 评测专家 | C04 真实数据依赖 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ firstResult 等运行值是否有生产者、消费者和真实读取来源？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R105 | E6 AI Agent 评测专家 | C05 成功/失败判据 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ PASS/FAIL/NOT-RUN/BLOCKED 与停止条件是否清晰？ | 设计=PASS；证据=SUPPORTED |
| R106 | E6 AI Agent 评测专家 | C06 阶段边界与独立性 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ Capability、Procedure、Application、Candidate、Qualification 是否边界明确？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R107 | E6 AI Agent 评测专家 | C07 必要前提 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 版本、授权、应用、Runtime、证据与 requested scope 是否是显式前提？ | 设计=PASS；证据=SUPPORTED |
| R108 | E6 AI Agent 评测专家 | C08 路由与返工 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 错误能否返回真正 owner，而不是在下游放宽标准？ | 设计=PASS；证据=SUPPORTED |
| R109 | E6 AI Agent 评测专家 | C09 无职责重叠/循环 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ S7/S9/S10/S11/S12 是否不重复维护同一真相？ | 设计=PASS；证据=SUPPORTED |
| R110 | E6 AI Agent 评测专家 | C10 产物可消费 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 下游是否能只靠正式输入继续，而不依赖聊天隐含状态？ | 设计=PASS；证据=SUPPORTED |
| R111 | E6 AI Agent 评测专家 | C11 版本与来源一致 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ hash/ref/revision/sourceMapping/capabilityDecisionRefs 是否绑定精确对象？ | 设计=PASS；证据=SUPPORTED |
| R112 | E6 AI Agent 评测专家 | C12 计划/事实/语义分离 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ WorkPlan、Raw Trace、DistilledSteps、SemanticProcedure 是否不互相覆盖？ | 设计=PASS；证据=SUPPORTED |
| R113 | E6 AI Agent 评测专家 | C13 证据生命周期 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 历史证据、当前证据、Fresh Run、持久证据和失效条件是否区分？ | 设计=PASS；证据=SUPPORTED |
| R114 | E6 AI Agent 评测专家 | C14 正常场景证据 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 不是只看文档或 mock，而是有相应层级的实际执行证据？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R115 | E6 AI Agent 评测专家 | C15 变化/拒绝证据 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 合法变参、缺证据、错误数据链、旧资格、漂移和拒绝是否覆盖？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R116 | E6 AI Agent 评测专家 | C16 失败返回正确 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 失败是否保留原事实、停止后续副作用并给出 repair owner？ | 设计=PASS；证据=SUPPORTED |
| R117 | E6 AI Agent 评测专家 | C17 修改后重验 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ Candidate/依赖变化后是否失效旧资格并重跑受影响范围？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R118 | E6 AI Agent 评测专家 | C18 复杂度适配 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 是否保持普通 JS、普通函数和最小必要工件，而不是平台化过度设计？ | 设计=PASS；证据=SUPPORTED |
| R119 | E6 AI Agent 评测专家 | C19 API 复用收益 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 是否通过短入口→候选→canonical contract→Runtime validation 复用正式能力？ | 设计=PASS；证据=SUPPORTED |
| R120 | E6 AI Agent 评测专家 | C20 预算与结束条件 | 若方法文件存在但模型从未真实运行，这一项会不会误报能力已验证？ 模型/时间/重试预算、结束条件和工程成本是否能被实际度量？ | 设计=PARTIAL；证据=PARTIAL/NOT-CLOSED |
| R121 | E7 开发者体验/可维护性专家 | C01 目标不偷换 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 用户目标、成功条件、授权与固定 Recipe 对象是否保持不变？ | 设计=PASS；证据=SUPPORTED |
| R122 | E7 开发者体验/可维护性专家 | C02 来源与未知分离 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 观察、计划期望、Expected、推断与未知是否明确分开？ | 设计=PASS；证据=SUPPORTED |
| R123 | E7 开发者体验/可维护性专家 | C03 需求覆盖 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 需求是否映射到阶段、行为案例、产物和验证，而非只增加概念？ | 设计=PASS；证据=SUPPORTED |
| R124 | E7 开发者体验/可维护性专家 | C04 真实数据依赖 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ firstResult 等运行值是否有生产者、消费者和真实读取来源？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R125 | E7 开发者体验/可维护性专家 | C05 成功/失败判据 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ PASS/FAIL/NOT-RUN/BLOCKED 与停止条件是否清晰？ | 设计=PASS；证据=SUPPORTED |
| R126 | E7 开发者体验/可维护性专家 | C06 阶段边界与独立性 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ Capability、Procedure、Application、Candidate、Qualification 是否边界明确？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R127 | E7 开发者体验/可维护性专家 | C07 必要前提 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 版本、授权、应用、Runtime、证据与 requested scope 是否是显式前提？ | 设计=PASS；证据=SUPPORTED |
| R128 | E7 开发者体验/可维护性专家 | C08 路由与返工 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 错误能否返回真正 owner，而不是在下游放宽标准？ | 设计=PASS；证据=SUPPORTED |
| R129 | E7 开发者体验/可维护性专家 | C09 无职责重叠/循环 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ S7/S9/S10/S11/S12 是否不重复维护同一真相？ | 设计=PASS；证据=SUPPORTED |
| R130 | E7 开发者体验/可维护性专家 | C10 产物可消费 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 下游是否能只靠正式输入继续，而不依赖聊天隐含状态？ | 设计=PASS；证据=SUPPORTED |
| R131 | E7 开发者体验/可维护性专家 | C11 版本与来源一致 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ hash/ref/revision/sourceMapping/capabilityDecisionRefs 是否绑定精确对象？ | 设计=PASS；证据=SUPPORTED |
| R132 | E7 开发者体验/可维护性专家 | C12 计划/事实/语义分离 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ WorkPlan、Raw Trace、DistilledSteps、SemanticProcedure 是否不互相覆盖？ | 设计=PASS；证据=SUPPORTED |
| R133 | E7 开发者体验/可维护性专家 | C13 证据生命周期 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 历史证据、当前证据、Fresh Run、持久证据和失效条件是否区分？ | 设计=PASS；证据=SUPPORTED |
| R134 | E7 开发者体验/可维护性专家 | C14 正常场景证据 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 不是只看文档或 mock，而是有相应层级的实际执行证据？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R135 | E7 开发者体验/可维护性专家 | C15 变化/拒绝证据 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 合法变参、缺证据、错误数据链、旧资格、漂移和拒绝是否覆盖？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R136 | E7 开发者体验/可维护性专家 | C16 失败返回正确 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 失败是否保留原事实、停止后续副作用并给出 repair owner？ | 设计=PASS；证据=SUPPORTED |
| R137 | E7 开发者体验/可维护性专家 | C17 修改后重验 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ Candidate/依赖变化后是否失效旧资格并重跑受影响范围？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R138 | E7 开发者体验/可维护性专家 | C18 复杂度适配 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 是否保持普通 JS、普通函数和最小必要工件，而不是平台化过度设计？ | 设计=PASS；证据=SUPPORTED |
| R139 | E7 开发者体验/可维护性专家 | C19 API 复用收益 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 是否通过短入口→候选→canonical contract→Runtime validation 复用正式能力？ | 设计=PASS；证据=SUPPORTED |
| R140 | E7 开发者体验/可维护性专家 | C20 预算与结束条件 | 若删掉新增抽象，是否仍能完成同样闭环，避免无收益复杂度？ 模型/时间/重试预算、结束条件和工程成本是否能被实际度量？ | 设计=PARTIAL；证据=PARTIAL/NOT-CLOSED |
| R141 | E8 跨平台 Runtime 专家 | C01 目标不偷换 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 用户目标、成功条件、授权与固定 Recipe 对象是否保持不变？ | 设计=PASS；证据=SUPPORTED |
| R142 | E8 跨平台 Runtime 专家 | C02 来源与未知分离 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 观察、计划期望、Expected、推断与未知是否明确分开？ | 设计=PASS；证据=SUPPORTED |
| R143 | E8 跨平台 Runtime 专家 | C03 需求覆盖 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 需求是否映射到阶段、行为案例、产物和验证，而非只增加概念？ | 设计=PASS；证据=SUPPORTED |
| R144 | E8 跨平台 Runtime 专家 | C04 真实数据依赖 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ firstResult 等运行值是否有生产者、消费者和真实读取来源？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R145 | E8 跨平台 Runtime 专家 | C05 成功/失败判据 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ PASS/FAIL/NOT-RUN/BLOCKED 与停止条件是否清晰？ | 设计=PASS；证据=SUPPORTED |
| R146 | E8 跨平台 Runtime 专家 | C06 阶段边界与独立性 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ Capability、Procedure、Application、Candidate、Qualification 是否边界明确？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R147 | E8 跨平台 Runtime 专家 | C07 必要前提 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 版本、授权、应用、Runtime、证据与 requested scope 是否是显式前提？ | 设计=PASS；证据=SUPPORTED |
| R148 | E8 跨平台 Runtime 专家 | C08 路由与返工 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 错误能否返回真正 owner，而不是在下游放宽标准？ | 设计=PASS；证据=SUPPORTED |
| R149 | E8 跨平台 Runtime 专家 | C09 无职责重叠/循环 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ S7/S9/S10/S11/S12 是否不重复维护同一真相？ | 设计=PASS；证据=SUPPORTED |
| R150 | E8 跨平台 Runtime 专家 | C10 产物可消费 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 下游是否能只靠正式输入继续，而不依赖聊天隐含状态？ | 设计=PASS；证据=SUPPORTED |
| R151 | E8 跨平台 Runtime 专家 | C11 版本与来源一致 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ hash/ref/revision/sourceMapping/capabilityDecisionRefs 是否绑定精确对象？ | 设计=PASS；证据=SUPPORTED |
| R152 | E8 跨平台 Runtime 专家 | C12 计划/事实/语义分离 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ WorkPlan、Raw Trace、DistilledSteps、SemanticProcedure 是否不互相覆盖？ | 设计=PASS；证据=SUPPORTED |
| R153 | E8 跨平台 Runtime 专家 | C13 证据生命周期 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 历史证据、当前证据、Fresh Run、持久证据和失效条件是否区分？ | 设计=PASS；证据=SUPPORTED |
| R154 | E8 跨平台 Runtime 专家 | C14 正常场景证据 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 不是只看文档或 mock，而是有相应层级的实际执行证据？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R155 | E8 跨平台 Runtime 专家 | C15 变化/拒绝证据 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 合法变参、缺证据、错误数据链、旧资格、漂移和拒绝是否覆盖？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R156 | E8 跨平台 Runtime 专家 | C16 失败返回正确 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 失败是否保留原事实、停止后续副作用并给出 repair owner？ | 设计=PASS；证据=SUPPORTED |
| R157 | E8 跨平台 Runtime 专家 | C17 修改后重验 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ Candidate/依赖变化后是否失效旧资格并重跑受影响范围？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R158 | E8 跨平台 Runtime 专家 | C18 复杂度适配 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 是否保持普通 JS、普通函数和最小必要工件，而不是平台化过度设计？ | 设计=PASS；证据=SUPPORTED |
| R159 | E8 跨平台 Runtime 专家 | C19 API 复用收益 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 是否通过短入口→候选→canonical contract→Runtime validation 复用正式能力？ | 设计=PASS；证据=SUPPORTED |
| R160 | E8 跨平台 Runtime 专家 | C20 预算与结束条件 | 若把 macOS 证据外推到 Windows 或 full Runtime，这一项会不会错误放行？ 模型/时间/重试预算、结束条件和工程成本是否能被实际度量？ | 设计=PARTIAL；证据=PARTIAL/NOT-CLOSED |
| R161 | E9 成本与工程效率专家 | C01 目标不偷换 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 用户目标、成功条件、授权与固定 Recipe 对象是否保持不变？ | 设计=PASS；证据=SUPPORTED |
| R162 | E9 成本与工程效率专家 | C02 来源与未知分离 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 观察、计划期望、Expected、推断与未知是否明确分开？ | 设计=PASS；证据=SUPPORTED |
| R163 | E9 成本与工程效率专家 | C03 需求覆盖 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 需求是否映射到阶段、行为案例、产物和验证，而非只增加概念？ | 设计=PASS；证据=SUPPORTED |
| R164 | E9 成本与工程效率专家 | C04 真实数据依赖 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ firstResult 等运行值是否有生产者、消费者和真实读取来源？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R165 | E9 成本与工程效率专家 | C05 成功/失败判据 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ PASS/FAIL/NOT-RUN/BLOCKED 与停止条件是否清晰？ | 设计=PASS；证据=SUPPORTED |
| R166 | E9 成本与工程效率专家 | C06 阶段边界与独立性 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ Capability、Procedure、Application、Candidate、Qualification 是否边界明确？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R167 | E9 成本与工程效率专家 | C07 必要前提 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 版本、授权、应用、Runtime、证据与 requested scope 是否是显式前提？ | 设计=PASS；证据=SUPPORTED |
| R168 | E9 成本与工程效率专家 | C08 路由与返工 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 错误能否返回真正 owner，而不是在下游放宽标准？ | 设计=PASS；证据=SUPPORTED |
| R169 | E9 成本与工程效率专家 | C09 无职责重叠/循环 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ S7/S9/S10/S11/S12 是否不重复维护同一真相？ | 设计=PASS；证据=SUPPORTED |
| R170 | E9 成本与工程效率专家 | C10 产物可消费 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 下游是否能只靠正式输入继续，而不依赖聊天隐含状态？ | 设计=PASS；证据=SUPPORTED |
| R171 | E9 成本与工程效率专家 | C11 版本与来源一致 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ hash/ref/revision/sourceMapping/capabilityDecisionRefs 是否绑定精确对象？ | 设计=PASS；证据=SUPPORTED |
| R172 | E9 成本与工程效率专家 | C12 计划/事实/语义分离 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ WorkPlan、Raw Trace、DistilledSteps、SemanticProcedure 是否不互相覆盖？ | 设计=PASS；证据=SUPPORTED |
| R173 | E9 成本与工程效率专家 | C13 证据生命周期 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 历史证据、当前证据、Fresh Run、持久证据和失效条件是否区分？ | 设计=PASS；证据=SUPPORTED |
| R174 | E9 成本与工程效率专家 | C14 正常场景证据 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 不是只看文档或 mock，而是有相应层级的实际执行证据？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R175 | E9 成本与工程效率专家 | C15 变化/拒绝证据 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 合法变参、缺证据、错误数据链、旧资格、漂移和拒绝是否覆盖？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R176 | E9 成本与工程效率专家 | C16 失败返回正确 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 失败是否保留原事实、停止后续副作用并给出 repair owner？ | 设计=PASS；证据=SUPPORTED |
| R177 | E9 成本与工程效率专家 | C17 修改后重验 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ Candidate/依赖变化后是否失效旧资格并重跑受影响范围？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R178 | E9 成本与工程效率专家 | C18 复杂度适配 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 是否保持普通 JS、普通函数和最小必要工件，而不是平台化过度设计？ | 设计=PASS；证据=SUPPORTED |
| R179 | E9 成本与工程效率专家 | C19 API 复用收益 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 是否通过短入口→候选→canonical contract→Runtime validation 复用正式能力？ | 设计=PASS；证据=SUPPORTED |
| R180 | E9 成本与工程效率专家 | C20 预算与结束条件 | 若已有 q002/r003 可复用，这一项是否避免重新探索和重复成本？ 模型/时间/重试预算、结束条件和工程成本是否能被实际度量？ | 设计=PARTIAL；证据=PARTIAL/NOT-CLOSED |
| R181 | E10 独立质疑者/验收官 | C01 目标不偷换 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 用户目标、成功条件、授权与固定 Recipe 对象是否保持不变？ | 设计=PASS；证据=SUPPORTED |
| R182 | E10 独立质疑者/验收官 | C02 来源与未知分离 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 观察、计划期望、Expected、推断与未知是否明确分开？ | 设计=PASS；证据=SUPPORTED |
| R183 | E10 独立质疑者/验收官 | C03 需求覆盖 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 需求是否映射到阶段、行为案例、产物和验证，而非只增加概念？ | 设计=PASS；证据=SUPPORTED |
| R184 | E10 独立质疑者/验收官 | C04 真实数据依赖 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ firstResult 等运行值是否有生产者、消费者和真实读取来源？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R185 | E10 独立质疑者/验收官 | C05 成功/失败判据 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ PASS/FAIL/NOT-RUN/BLOCKED 与停止条件是否清晰？ | 设计=PASS；证据=SUPPORTED |
| R186 | E10 独立质疑者/验收官 | C06 阶段边界与独立性 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ Capability、Procedure、Application、Candidate、Qualification 是否边界明确？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R187 | E10 独立质疑者/验收官 | C07 必要前提 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 版本、授权、应用、Runtime、证据与 requested scope 是否是显式前提？ | 设计=PASS；证据=SUPPORTED |
| R188 | E10 独立质疑者/验收官 | C08 路由与返工 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 错误能否返回真正 owner，而不是在下游放宽标准？ | 设计=PASS；证据=SUPPORTED |
| R189 | E10 独立质疑者/验收官 | C09 无职责重叠/循环 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ S7/S9/S10/S11/S12 是否不重复维护同一真相？ | 设计=PASS；证据=SUPPORTED |
| R190 | E10 独立质疑者/验收官 | C10 产物可消费 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 下游是否能只靠正式输入继续，而不依赖聊天隐含状态？ | 设计=PASS；证据=SUPPORTED |
| R191 | E10 独立质疑者/验收官 | C11 版本与来源一致 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ hash/ref/revision/sourceMapping/capabilityDecisionRefs 是否绑定精确对象？ | 设计=PASS；证据=SUPPORTED |
| R192 | E10 独立质疑者/验收官 | C12 计划/事实/语义分离 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ WorkPlan、Raw Trace、DistilledSteps、SemanticProcedure 是否不互相覆盖？ | 设计=PASS；证据=SUPPORTED |
| R193 | E10 独立质疑者/验收官 | C13 证据生命周期 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 历史证据、当前证据、Fresh Run、持久证据和失效条件是否区分？ | 设计=PASS；证据=SUPPORTED |
| R194 | E10 独立质疑者/验收官 | C14 正常场景证据 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 不是只看文档或 mock，而是有相应层级的实际执行证据？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R195 | E10 独立质疑者/验收官 | C15 变化/拒绝证据 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 合法变参、缺证据、错误数据链、旧资格、漂移和拒绝是否覆盖？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R196 | E10 独立质疑者/验收官 | C16 失败返回正确 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 失败是否保留原事实、停止后续副作用并给出 repair owner？ | 设计=PASS；证据=SUPPORTED |
| R197 | E10 独立质疑者/验收官 | C17 修改后重验 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ Candidate/依赖变化后是否失效旧资格并重跑受影响范围？ | 设计=PASS；证据=PARTIAL/NOT-CLOSED |
| R198 | E10 独立质疑者/验收官 | C18 复杂度适配 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 是否保持普通 JS、普通函数和最小必要工件，而不是平台化过度设计？ | 设计=PASS；证据=SUPPORTED |
| R199 | E10 独立质疑者/验收官 | C19 API 复用收益 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 是否通过短入口→候选→canonical contract→Runtime validation 复用正式能力？ | 设计=PASS；证据=SUPPORTED |
| R200 | E10 独立质疑者/验收官 | C20 预算与结束条件 | 若只看成功截图/测试数量，这一项是否还能指出未证明部分？ 模型/时间/重试预算、结束条件和工程成本是否能被实际度量？ | 设计=PARTIAL；证据=PARTIAL/NOT-CLOSED |

## 评分解释

设计评分严格沿用现有 20 项规则，而不是新建一套“专家分”：

- 需求与语义正确性：25/25
- 职责与独立性：20/20（设计边界层；不代表模型独立行为已运行）
- 成果与接续：20/20
- 验证与修复设计：20/20（测试设计、拒绝与返工规则完整；不把未运行场景写成已验证）
- 复杂度与成本：12/15（预算/结束条件有设计，实际成本数据不足）

**设计总分：97/100。**

这 97 分成立的前提恰恰是：方案明确拒绝把未运行证据算成运行通过。如果为了“确保 95”而把 Producer、Fresh Run、宿主加载或 Runtime 未闭合项写成 PASS，则本记录本身应把方案降为不合格。

## 当前仓库动作

本次审计同时发现当前 `master` 的 Layered Agent API reading 因 `docs/api/libs.md` 更新后 `docs/api/agent/data.md` 内容绑定漂移而失败。已按生成器实际差异刷新该 SHA 绑定；这属于真实回归修复，不是为了评分改断言。formal Runtime full unit 的既有失败仍保留，不在本轮通过删测试或降低断言处理。

## 达到“已验证 95+”所需的最小下一步

只做三件事，完成后再重新评分：

1. 在可隔离的模型宿主跑一次 S7→S9 independent-acceptance Producer 评测，Expected 不进入 Producer packet；保存真实输出、失败和预算。
2. 在用户 Mac 上从既有 q002/r003 接续，不重做探索，固定当前 Candidate 跑 Fresh Run + 1 个合法变参 + 1 个读失败停止，并产生新的 S12 QualificationRecord。
3. 对上述实际对象重新跑 stage/artifact/API/Runtime selected-owner 检查；若 requested scope 全部通过且 20 项评分 ≥95，再把“verified 95+”写入质量记录。

