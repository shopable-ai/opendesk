---
title: "计算器案例｜逐阶段输入输出与独立检查"
description: "按正式 S1—S12 展示输入、处理、输出、消费者、拒绝条件和反例；各阶段分别检查。"
order: 20
---

# 计算器案例｜逐阶段输入输出与独立检查

[返回案例主线](calculator.md)。本页是教学与审阅材料，不是新的 Workflow、schema 或可发布 JSON。正式作业读取各 Skill 的输入输出规格和[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)。

**样本边界：** 下文 D010—D060、B010—B050 沿用现有 Skill 示例的教学编号；`110／660` 不是本次实际读数。[S7 示例](../skills/trace-distill/examples/calculator.md)引用的 A001—A010 来自 synthetic fixture，不是历史 Dossier。正式产物只能引用实际获准材料，不得用这些标签补造事实。

**评测隔离：** 评测某个 Producer 时，只交其获准的固定输入及方法。不能把本页的输出示例、未来 Procedure、最终 JS 或完整 fixture 标准产物一并当输入；审阅者检查源材料也不等于 Producer 获准重读全量历史。

## S1

**明确任务与计划 · automation-plan**

**输入。** 用户原始任务、已确认要求、真实授权来源、允许对象／文件根／预算；接续时加精确旧资产和允许处置范围。首次规划不要求先有合同，不要求未来读值或最终代码。

**处理。** 将“首次计算并读取 → 保留首值、准备第二式 → 使用首值 → 读取并交付”拆为业务工作包，明确成功、停止与高影响未知。把按钮输入、运行时值、Expected 和 Unknown 分类。

**输出节选。**

```text
TaskContract：两次实际按钮运算；第二次消费本次首读；终点实际读取、打印、返回。
WorkPlan：先确认应用与准备权限，再执行相应业务工作包及检查点。
firstResult：运行时取得；110：验收期望；不能相互替代。
```

**消费者与通过条件。** S2、示范及其他需要合同的阶段能直接知道做什么、哪些行为获准、用什么事实判定；每项原始要求有验收去向。
**拒绝／返回。** 缺授权来源或目标矛盾，留在 S1 补交／确认；应用可行性未知交 S2，不猜控件。
**反例。** 把目标缩成“返回 660”，即使可执行也未满足原任务；不得放行。
**方法入口。** [SKILL](../skills/automation-plan/SKILL.md) · [输入输出规格](../skills/automation-plan/references/io-spec.md)。

## S2

**最小应用认识 · application-engineer / discover**

**输入。** 固定 TaskContract／WorkPlan、可复用旧 Profile、当前获准观察。无需先有完整 Procedure，更不能从最终 JS 反推历史认识。

**处理。** 只回答下一步所需的应用／窗口身份、模式、输入区、按钮、显示区、状态与读取可行性；把观察到的事实、解释和未知分开。

**输出节选。**

```text
AppProfile：观察来源支持的窗口／区域／目标及关系。
已知：哪个显示区与哪个输入区属于同一任务对象。
未知：未取得的坐标映射、定位唯一性、操作权限或稳定读取能力。
```

**消费者与通过条件。** task-demonstrate 取得足以安排下一次安全观察／操作的资料；缺输入执行前提时只能继续获准观察，不能因“Profile 已写好”而点击。
**拒绝／返回。** 对象或读取范围不明，补最小观察；路线不可行或授权冲突回 S1。
**反例。** 屏幕上看到 `0` 不证明执行过清空；局部截图没有屏幕映射，不得猜点击坐标。
**方法入口。** [SKILL](../skills/application-engineer/SKILL.md) · [discover 示例及限制](../skills/application-engineer/examples/calculator.md)。

## S3-S6

**真实示范与同步留证 · task-demonstrate**

**输入。** 固定合同、实际生效的计划、足够的应用规则、获准业务输入和执行范围。教学步骤表不替代现场材料。

**处理。** 在实际执行中区分 planned、actual、observation、runtime value、consumer、verification；同时保留失败、重试、人工介入和副作用状态。

**输出节选：仅说明正式记录应能回答的问题。**

```text
首读：哪次 action、哪个应用／显示组件、何时读到什么原文？
值：firstResult 由该观察产生，类型和有效期是什么？
消费：第二式的哪个 action，实际用了哪些字符、按什么转换？
终点：finalResult 的实际读取、打印／返回及各自证据是什么？
```

**消费者与通过条件。** S7 能核对真实先后、状态和完整生产／消费关系；不能只收到“成功得到 660”。失败包可用于诊断，不是完整成功示范。
**拒绝／返回。** 已有获准材料未交付，先交协调者补交；事实缺失则定向新采集并保留新旧边界。输入效果 unknown 时先停止，由获准现场责任核对，不盲重放。
**反例。** API 回执 ok 不是结果读取；Expected=110 不是 observation=110；最终 JS 有 read 不证明过去读过。
**方法入口。** [SKILL](../skills/task-demonstrate/SKILL.md) · [六类事实与消费示例](../skills/task-demonstrate/examples/calculator.md)。

## S7

**必要步骤提炼 · trace-distill**

**输入。** 固定 TaskContract／WorkPlan、Dossier、Raw Trace 和必要证据／应用资料；不取未来 Procedure 或最终 JS。

**处理。** 按实际顺序和依赖逐原动作决定 retain／merge／omit／recovery／unresolved。保留状态准备、等待／核验边界、读取、完整消费者、字符顺序与次数。

**输出节选：沿用现有示例的必要路径。**

```text
D010 准备第一段 → D020 输入第一式 → D030 读取 firstResult
→ D040 准备第二段 → D050 完整消费 firstResult → D060 读取终值并映射最终交付
D030 的值由 D050 消费；D040 改变界面状态，不删除任务数据。
```

**消费者与通过条件。** S8—S9 收到逐动作取舍、来源、必要事实／政策和数据关系，不必猜原始消费者。合并只是表示合并，不授权减少按钮输入。
**拒绝／返回。** 原事实不全回 S3—S6；事实齐全但取舍错误由 S7 修复，影响下游则重验。必要路径有阻断 unresolved 不能正常放行。
**反例。** 删首读、机械删除第二次清空、把 `1,1,0` 去重均不成立。原 fixture 十项均为 retain，不能编造其中已有 omit／recovery；补充练习须另标教学条件。
**方法入口。** [SKILL](../skills/trace-distill/SKILL.md) · [逐原动作与输入输出示例](../skills/trace-distill/examples/calculator.md)。

## S8-S9

**业务过程与数据关系 · procedure-synthesize**

**输入。** 固定 DistilledSteps、合同／计划、必要应用资料、已交付的事实／业务政策，以及有来源的能力选择与验证状态。不因 lineage 链接就擅自重读全量 Trace。

**处理。** 组织 Business Steps，明确目的、前提、执行意图、观察、输出、后置、验证、停止条件与消费者。区分实际发生的转换与未来允许的转换；能力需求、候选、canonical 契约和 runtime validation 分别记录。

**输出节选。**

```text
B025：从本次结果显示区读取 → firstResult；来源 D030。
B030：按已确认规则准备第二段，保持 firstResult 可用；来源 D040。
B040：消费 firstResult，按获准 characters 转换输入第二式；来源 D050。
B050：实际读取 finalResult → 打印／返回；来源 D060。
```

**消费者与通过条件。** S10 能知道真实工程缺口，S11 能在不猜业务含义的情况下实现过程。25／4／10／6 是否参数化由合同决定；firstResult 始终是运行时生产的值。
**拒绝／返回。** 已有获准材料漏交先交协调者；需要改变原动作取舍回 S7；业务政策或授权不明回 S1；事实不足回来源责任定向补证，不私自补写。
**反例。** `parameters.firstResult.default = "110"` 错；有 API 文档不等于 runtimeValidation 已通过。
**方法入口。** [SKILL](../skills/procedure-synthesize/SKILL.md) · [producer／consumer／transform 示例](../skills/procedure-synthesize/examples/calculator.md)。

## S10

**应用规则补强／维修 · application-engineer / harden / repair**

**输入。** 已确认 Procedure、当前 AppProfile、明确工程缺口、允许的验证／操作范围。已有规则仍有效时精确复用，不重新发现整个 Calculator。

**处理。** 落实目标限定与唯一性、实际结果读取、可观察 ready 条件、等待上限、清空语义、安全停止和失效规则。采用 API 前核对当前正式契约，未实测的规则标 not-run。

**输出节选。**

```text
目标规则：限定当前任务窗口和按钮父区，歧义则不输入。
读取规则：绑定当前结果区，保留原文和来源；不支持格式则停止。
准备规则：只清除获准状态，核对动作及干净后置；不清无关历史。
适用范围／证据／失效条件：逐规则交付；缺 Runtime primitive 就明确缺口。
```

**消费者与通过条件。** S11 能直接落实已证实的操作规则；关键规则未经验证或仍不确定，不能仅凭接口存在放行。工程验证改变能力决定时，先交 S8—S9 更新并固定 Procedure，再让 S11 消费一致版本。
**拒绝／返回。** 规则问题留在应用工程；业务值被写成常量回 S8—S9／S11；真实 Runtime 缺口交对应 owner，保留其他有效规则。
**反例。** 无证据均分窗口作为按钮矩阵、用固定等待冒充 ready、超时后换 backend 重复点击，都不是可靠补强。
**方法入口。** [SKILL](../skills/application-engineer/SKILL.md) · [harden／repair 示例](../skills/application-engineer/examples/calculator.md)。

## S11

**普通代码生成 · recipe-build**

**输入。** 固定 Procedure、AppProfile／helper、真实 API 契约、入口和支持范围。已有适用脚本可以采用；没有上游事实时不能靠写代码补造。

**处理。** 将每个 Business Step 和真实数据关系映射到普通 JS，检查顺序、作用域、消费者、状态准备、失败处理与 API。下面只是业务顺序说明，不是新增 API 或可运行脚本。

**输出节选。**

```text
准备首式 → 实际按钮输入第一式 → 实际 read 得到 firstResult
→ 准备第二式并保留值 → 从 firstResult 构造按钮输入
→ 实际 read 得到 finalResult → 打印／返回。
CandidateManifest 固定实际源码、入口、依赖、上游版本、范围和步骤映射。
```

**消费者与通过条件。** S12 拿到冻结的唯一候选；代码真正消费读取返回值，而不是 sourceMapping 写对、函数体写错。生成者自检不等于独立资格。
**拒绝／返回。** 语义不全回 S8—S9，应用规则缺失回 S10，实现错误由 S11 修。
**反例。** 先 read 再输入固定 `["6","×","1","1","0","="]`，仍是错误数据流；终点直接返回 660 也错误。
**方法入口。** [SKILL](../skills/recipe-build/SKILL.md) · [正确映射与错误实现](../skills/recipe-build/examples/calculator.md)。

## S11-optional

**按需代码改进 · code-rebuild；不是新阶段**

**输入。** 精确代码／helper／Candidate 基线、固定需求和 Procedure、相关应用／API 规则、本次改进目标与允许改动范围。

**处理。** 检查函数体和控制流中的真实生产／消费、异步顺序、状态、安全与必要复杂度。有收益才最小修改；不能为了评分而强制包装 Calculator 类或改变需求。

**输出节选。**

```text
baseline-retained：原 refs/hash、评审依据、不修改理由和限制。
或 candidate-revised：新 refs/hash、实际改动、影响范围和所需重验。
不修改旧 Qualification，不把原资格转移给新字节。
```

**消费者与通过条件。** 协调者／S12 明确知道是否换候选、为什么、哪些检查做过；没有收益时保留原字节也是有效结论。
**拒绝／返回。** 按已证实根因回 S7、S8—S9、S10 或本阶段，不从最终值正确推出所有上游正确。
**反例。** 只靠关键词搜索有 `firstResult` 就宣称数据流正确；同一 Agent 换角色名就自称独立评审。
**方法入口。** [SKILL 及正式评分规则入口](../skills/code-rebuild/SKILL.md) · [输入输出规格](../skills/code-rebuild/references/io-spec.md)。本页文档评分不替代该 Skill 的正式代码评审评分。

## S12

**固定候选的独立资格 · recipe-qualify**

**输入。** 精确冻结 Candidate、TaskContract、预先确定的 requested scope／scenarios／Oracle、环境／构建、真实执行授权。不能边验边改候选或成功标准。

**处理。** 从正常入口运行该候选，核对实际执行字节、起点、按钮动作、实际读取、消费链和最终交付，以独立证据逐项判定。Oracle 可以比较结果，不能回灌生产输入。

**输出节选。**

```text
QualificationRecord：哪个候选、什么环境／命令／范围，实际发生了什么。
每个请求场景分别 pass／fail／not-run／blocked，并关联真实证据。
requested 中仍有 fail／not-run／blocked 时，不宣称整个请求通过。
```

**消费者与通过条件。** 交付／接续方知道资格的精确范围。一次 Fresh Run 只证明一次；重复运行至少两次独立 Fresh Run 且候选相同；参数化还需同一候选、同一输入契约的合法变参证据。
**拒绝／返回。** 验收对象、标准或证据设置错误由 S12 修；上游缺陷按证据返回对应责任，修改后形成新候选资格。
**反例。** 660 正确但第二式硬编码首值；第二次改代码后仍算同版重复运行；参考脚本通过替代生产候选，均不能放行。
**方法入口。** [SKILL](../skills/recipe-qualify/SKILL.md) · [一次／重复／参数化的证据边界](../skills/recipe-qualify/examples/calculator.md)。

## 独立检查的使用方式

逐卡核对：必要输入是否交齐，输出能否被下一责任直接消费，是否有来源，错误能否被拒绝，返回点是否正确。输入不够的卡单独 blocked，不靠其他卡的高分弥补。

方法正确性、盲上下文可用性与真实执行资格仍需各自证据；本页不能为任何 Skill 授予这些结论。实际分项文档审阅见[审阅记录](../../../docs/quality/agent-to-recipe/calculator-document-review-20260927.md)。
