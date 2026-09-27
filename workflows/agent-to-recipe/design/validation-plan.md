---
title: "Agent-to-Recipe｜行为案例、测试空间与验收计划"
description: "定义 Agent-to-Recipe 各证明层的行为案例、测试空间、Gate、证据和评分方法。"
order: 70
---

# Agent-to-Recipe｜行为案例、测试空间与验收计划

本文只回答一个问题：

> **凭什么证明 Agent-to-Recipe 的每一层做对了？**

本文定义验证方法，不记录某一 commit 跑了多少测试、某个 checker 当前实现到哪一步，也不把历史 PASS 写成当前能力。实际执行结果统一进入 `docs/quality/` 或具体 QualificationRecord。

## 30 秒总览

必须分开验证：

```text
需求理解正确
≠
计划合理
≠
实际任务完成
≠
DistilledSteps 正确
≠
SemanticProcedure 正确
≠
应用规则可靠
≠
Candidate 代码正确
≠
宿主能执行
≠
真实业务 Qualification 通过
≠
可重复 / 可参数化 / 可共享
```

任何上层 PASS 都不能替代下层证据，反之亦然。

## 一、先确定验证对象与范围

| 验证对象 | 要回答的问题 | 主要证据 |
| --- | --- | --- |
| **需求** | 是否解决正确问题、没有偷换目标或授权 | Source、TaskContract、人工确认／纠正 |
| **计划** | 是否能在长任务前暴露关键 Unknown 和错误路线 | WorkPlan、checkpoint、planDelta |
| **应用认识** | 是否知道正确应用／页面／目标／读取依据及限制 | AppProfile、同版 observation / review |
| **真实示范** | 实际发生了什么 | Dossier、Raw Trace、Evidence、actual values |
| **DistilledSteps** | 必要动作是否被正确保留／合并／省略 | sourceActionRefs、数据依赖、处置依据 |
| **SemanticProcedure** | 业务语义、参数、producer→consumer、支持范围是否正确 | Business Steps、dataDependencies、limits |
| **应用工程** | 定位、读取、等待、动作、verifier 是否能可靠落实 | Profile/helper、局部运行、失败场景 |
| **Candidate** | 固定普通 JS 是否忠实实现上游规格 | exact bytes、manifest、source mapping、API refs |
| **Qualification** | 同一候选是否在 requested scope 真正成立 | real execution、independent observation、scenario verdict |
| **复用声明** | 是否可重复、变参、跨环境或他人使用 | 多次 Fresh Run、合法变参、新使用者／环境证据 |

验证开始前固定：

- 被验证对象；
- 版本／hash；
- requested scope；
- 场景；
- 必需证据；
- 允许误差；
- hard-fail 条件；
- not-run / blocked 判据；
- 预算和停止条件。

## 二、行为规格写法

每个行为案例至少包含：

```text
前置条件
触发 / 输入
必须行为
禁止行为
期望结果
真实结果来源
失败 / 停止条件
未覆盖范围
```

统一规则：

1. Expected 与 Actual Observation 分开。
2. 反例被正确拒绝，表示“测试行为正确”，不表示业务任务成功。
3. 正常、变化、边界、失败、拒绝、恢复都应进入测试空间。
4. fixture / mock 只证明其覆盖层，不能外推真实桌面。
5. requested 场景不能在失败后移到 excluded 以取得 PASS。
6. 全部拒绝也不等于“能力可靠”；正常合法样本必须能够完成。
7. 同一次 execution 重读日志不等于两次 Fresh Run。

## 三、必须覆盖的行为案例

BC 编号是需求追溯标识，不是新的 Runtime Gate。

### A. 主链、数据与代码

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-01 完整 Agent 新示范与生成** | 从自然语言目标到计划、最小发现、真实执行、DistilledSteps、Procedure、Candidate、Qualification 各层真实发生且可消费 | 执行后直接生成 JS，跳过事实／必要路径／语义证明 |
| **BC-02 已有低质量代码独立改进** | 可只进入 code-rebuild + 必要资格，修改有依据且限定范围 | 强迫重录整条示范；用代码猜上游业务事实 |
| **BC-03 简单脚本已经足够合格** | 允许原样保留，必要验证仍存在 | 为“工程化”强制增加类、文件或无收益抽象 |
| **BC-04 实际数据交接与硬编码反例** | 第一次真实读值必须成为后续实际消费者输入 | 读了 firstResult 却仍写死示范常量 |
| **BC-05 读数失败、格式或状态不确定** | 读数不可用时停止依赖动作并保留真实失败 | 默认答案、宽松解析、等待 Expected 后直接返回 Expected |
| **BC-11 代码质量与 API 复用** | API 真实存在、异步顺序、错误处理、复用和复杂度合理 | 虚构 API、吞错、无界等待、并行点击、重复弱封装 |
| **BC-32 能力发现 → 方法选择 → 契约 → 现场验证闭环** | discovery、selection、canonical contract、runtime validation、Candidate refs 是不同事实且不断链 | 文档存在即写 runtime pass；双选、缺 contract、失败无 evidence、Candidate 丢 source ref |

BC-04 的 Calculator 参考值仅作为 Oracle：

- 基线：25 × 4 + 10 → 真实读取 firstResult → 6 × firstResult；
- 合法变参：12 × 3 + 4 → 真实读取 firstResult → 6 × firstResult。

110 / 660 / 40 / 240 都是测试期望，不是业务取数来源。

### B. 语义、版本、恢复与安全

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-07 语义或因果证据不足** | 必要步骤、恢复候选、unresolved 能正确区分 | 缺事实时编造稳定流程 |
| **BC-08 版本、半写与候选不一致** | consumer 精确消费发布版本，Profile/helper/Candidate 变化能传播影响 | A 的资格证明 B；文件可解析就算来源正确 |
| **BC-09 中断与副作用状态** | 动作前／动作可能发生／成果已写但进度落后三种状态可区分 | 超时就盲重放；把文件 checkpoint 当事务回滚 |
| **BC-10 错误期望、未知验证器与范围规避** | 错 Oracle、缺 verifier、requested 未运行应 fail/blocked/not-run | 修改 Expected、跳 verifier、移动失败场景取得 PASS |
| **BC-12 需求变化与重要架构选择** | 需求变化能追到计划、Procedure、Profile、Candidate、Qualification | 在验收末端悄悄降低标准 |
| **BC-13 权限、预算与敏感内容** | 授权、日志脱敏、上传范围、预算和高风险门禁真实执行 | 模型／界面文字扩大授权；脚本短就绕过高风险检查 |
| **BC-16 资料留存与证据失效** | 失败与历史版本保留，证据失效会降低结论有效性 | 删除证据后仍保留原 PASS |

### C. 宿主、独立性与正常路径

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-14 混合 JS／Agent 环节** | 数据输入、模型判断、schema/validator、人工边界和 JS 动作分开验证 | provider 不存在却称端到端通过；eval 模型代码 |
| **BC-15 独立上下文与真实宿主加载** | 新 Agent 只凭规定输入和方法完成职责或准确拒绝 | 靠复制完整聊天补输入；同一对话换角色冒充隔离 |
| **BC-24 同一 Agent 的正常路径与定向返回** | 资料充分时直接复用、正常推进；错误只回责任 owner | 每一步强制重建交接或重做全屏分析；所有失败都回 S1 |
| **BC-26 自然语言入口与内部结构化合同** | 用户无需写 JSON；TaskContract/WorkPlan 保留原话并可被可读视图纠正 | 要求用户编辑 JSON；Markdown 与 JSON 成两套真相 |
| **BC-27 执行前操作计划与关键未知早期否证** | 长任务先形成业务顺序、输入来源、checkpoint，并优先验证高影响 Unknown | 计划只是 Skill 调用表；明知关键读取未知仍先跑大量依赖动作 |
| **BC-28 计划与实际偏差及 planDelta** | 计划外必要动作保存原因并修订后续计划；未执行计划不进入事实链 | “不在初始计划”就删成噪音；把未执行步骤写进 Dossier |

### D. DistilledSteps 与跨职责交接

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-29 DistilledSteps 必要路径与机械去噪反例** | 每个原动作有 retain/merge/omit/recovery/unresolved，来源和数据依赖不断 | 删除必要读值；把合法重复数字机械去重 |
| **BC-30 trace-distill → procedure-synthesize 独立交接** | S9 能只凭 DistilledSteps + 正式必要输入继续或准确指出缺口 | S9 静默重读全量 Raw Trace 并维护第二套 action disposition |
| **BC-31 Agent 与 Human 两种来源消费共享专业方法** | 两种来源保持 lineage，同时共享后续专业方法 | Human 记录追认为 Agent Dossier；H5 建第二套冲突方法 |

### E. 应用工程、视觉与复用

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-06 未知布局与按钮矩阵** | 窗口／布局变化时重新解析，矩阵只在证据支持时使用 | 均分窗口、取首候选、未测平台自动纳入支持 |
| **BC-21 材料充分性、必要范围与限定出口** | 认识／定位／操作材料分别判断，限定认识不冒充可点击 | 截图无映射却执行坐标；困难目标被降级出范围 |
| **BC-22 真实模型提取及答案隔离** | 被测模型看不到隐藏真值，输入／输出／模型版本可复核 | 先给答案再测；模型自评当准确率 |
| **BC-23 同源审阅、修订与影响传播** | 原图、overlay、属性和 Profile 同版；修订传播到依赖 | 自动格式校验冒充语义／人工通过 |
| **BC-25 规则复用、实际消费与定向维修** | 未见样本、声明支持变化和真实应用中能复用或安全拒绝 | 只在建模截图上成功；用示范行号／订单号代替当前输入 |

### F. 业务组合、跨应用与他人复用

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-17 确定内容发送与组合能力复用** | 已知联系人／内容时用确定 JS 组合并验证真实发送结果 | 无业务需要却读历史／加模型；重名未消歧仍发送 |
| **BC-18 根据实际历史判断并回复** | 实际历史进入受约束判断，仅合法结果调用同版发送能力 | 写死示范回复；新消息使判断过期仍发送 |
| **BC-19 跨应用实际数据与对象一致性** | 源值、转换、目标对象和目标结果可追溯 | 剪贴板／旧焦点当数据合同；中途失败盲重放写操作 |
| **BC-20 他人配置、运行与资产复用** | 未参与开发者只凭交付资产在声明环境配置和运行 | 依赖作者聊天、私有目录、凭据或历史 pass |

## S12：从“跑过一次”到“可重复 Recipe”的最小资格证明

不同声明对应不同证据：

| 声明 | 最低证据 | 不能替代 |
| --- | --- | --- |
| **精确候选通过** | Candidate、TaskContract、入口、依赖和环境固定；执行同一 production bytes | 参考脚本、重新实现的测试脚本 |
| **requested scope 已验证** | 每个 requested scope 至少被一个实际 scenario + evidence 覆盖 | 只在数组里写 qualified |
| **一次 Fresh Run 成功** | 干净可归因起点、真实入口、独立业务 Observation | 历史日志、Expected、mock |
| **可重复运行** | 同一 Candidate 至少两次彼此独立 Fresh Run | 同一 execution 重读日志 |
| **参数化可复用** | 基线之外至少一组合法变化输入，现场值仍真实进入消费者 | 改 Expected；向测试桩注入答案 |
| **后续不需 Agent 逐步点击** | production path 的确定步骤由普通 JS 执行；Agent 只在预声明有界判断点出现 | Qualification 时再让 Agent 逐点击决定 |
| **范围内稳定** | 声明的 app/build/layout/locale/input 扰动实际覆盖 | 单环境成功外推全部平台 |

Candidate 或影响性依赖改变后，旧 Qualification 不继续证明新字节。

## 四、按层推进与裁剪

验证应按证明层逐级进行：

| 层 | 证明什么 | 典型方法 |
| --- | --- | --- |
| **L0 Contract / Static** | 字段、引用、hash、基本映射和静态规则 | schema / linter / handoff checks |
| **L1 Deterministic Unit** | 纯转换、解析、映射、拒绝逻辑 | fixtures / unit tests |
| **L2 Independent Method Behavior** | Skill 在限定输入下能独立生产或准确拒绝 | 独立上下文／隔离 Producer eval |
| **L3 Host / Runtime Integration** | 实际宿主加载、权限、API、停止和调用链真实可用 | host integration |
| **L4 Real Application / Fresh Run** | Candidate 在真实应用完成业务并独立读回结果 | real execution |
| **L5 Reuse / Variation / Sharing** | 重复、变参、环境变化、他人配置等声明成立 | repeated runs / varied inputs / independent user |

低层可以先暴露便宜错误，但不能替代高层。

<a id="2026-09-19-验证切片"></a>\n### 历史验证结果入口

这是历史验证记录的兼容入口，不再作为 canonical 方法正文。对应版本、测试数量、结果和限制见 [质量记录](../../../docs/quality/agent-to-recipe-workflow-review-20260919.md)。

### S7 → S8—S9 相邻评测入口与输入隔离

Canonical 要求：

- S7 Producer 只从获准的正式输入生产 DistilledSteps；
- S9 Producer 从固定 DistilledSteps 开始；
- 上游失败不调用依赖下游；
- 补材料或修正后只重做受影响责任；
- 独立评测不能偷偷读取标准答案、完整聊天或未声明文件。

具体评测工具实现和某轮结果属于 tests / `docs/quality/`，不在这里维护。

### application-engineer 四层测试

application-engineer 至少分开：

1. 结构／确定性工具；
2. 模型或视觉提取；
3. 未见样本上的规则复用；
4. 获准真实应用与工作流消费。

任一层通过不能自动证明下一层。

<a id="application-engineer-分批实施2026-09-08-历史计划"></a>\n### application-engineer 的实施历史入口

旧分批实施时间线属于设计历史。当前只保留上面的验证层级；历史顺序查 Git history。

### 评测指标与成本

除正确性外，按声明用途记录：

- 模型调用次数和费用；
- observation / screenshot / OCR 数量；
- 人工修订量；
- 重建／重跑次数；
- 失败后的额外调用；
- 任务总耗费与复用收益。

成本指标不能抵消正确性硬失败。

## 五、沿用门禁，不用分数代替放行

依照 [G0—G7](../../../docs/quality/gates-and-evidence.md)：

- **G0**：输入、权限、应用、依赖和证据根等前提成立。
- **G1**：当前观察与原始证据可追溯，没有未处理漂移。
- **G2**：需要视觉／结构检测时，其结构与异常可解释。
- **G3**：语义与目标有证据，歧义显式暴露。
- **G4**：目标、前置、期望后置、失败策略与动作依据齐备。
- **G5**：实际后置与业务效果经过检查，不只依赖 API success。
- **G6**：高风险身份、授权、状态、结果与人工边界独立核对。
- **G7**：结论绑定当前代码／运行／证据，关键证据缺失不能 pass。

以下属于硬失败，不能被平均分抵消：

- 伪造实际读值；
- Expected 注入业务链；
- 越权；
- 错业务对象；
- 未运行写成通过；
- 修改候选后沿用旧资格；
- 虚构 Runtime / API；
- 关键 producer→consumer 关系断裂；
- requested 中 fail / not-run / blocked 被隐藏；
- 副作用 unknown 时盲重放。

## 六、95 分目标的评估办法

这是项目内部文档／能力审查尺度，不是行业认证。

| 维度 | 分值 | 核心检查 |
| --- | ---: | --- |
| 需求与语义正确性 | 25 | 目标、来源、任务覆盖、真实数据关系、成功／失败判据 |
| 职责与独立性 | 20 | owner、独立入口、输入充分性、无职责重叠／循环依赖 |
| 成果与接续 | 20 | 产物可消费、版本一致、计划／事实／步骤／过程可接续 |
| 验证与修复 | 20 | 正反场景、失败返回、受影响重验、实际候选证据 |
| 复杂度与成本 | 15 | 工程量与用途匹配、API 复用、预算与停止条件 |
| **合计** | **100** | 硬门禁另算，不可用分数抵消 |

评分规则：

- 证据充分：该检查项 5 分；
- 只有明确局部覆盖：2 分；
- 错误或无证据：0 分；
- >=95 仍要求适用硬门禁通过、requested 必测项完成、无阻断 Unknown；
- not-run / blocked 不记通过；
- 简单脚本不因抽象少扣分；
- 本文件不填写当前能力实际分数。

## 七、反向检查遗漏与无用新增

验证设计完成后反向检查：

1. DREQ-01—DREQ-33 是否都有责任与行为判据。
2. S1—S12 是否仍有相应证明对象。
3. Source / Plan / Actual / DistilledSteps / Procedure / Candidate / Qualification 是否没有被合并成一层。
4. trace-distill 与 procedure-synthesize 是否仍能独立交接。
5. Human 与 Agent 来源是否保持 lineage。
6. 同一 Agent 正常路径是否不会被“为了独立性”强制拆成多个 Agent。
7. 新增文件／工具／阶段是否真的服务需求。
8. 每个测试结果是否明确“证明了什么／没有证明什么”。

## 八、结果保存与当前状态

本文件只规定结果保存原则：

- 测试运行结果写 `docs/quality/`、QualificationRecord 或对应 execution artifacts；
- 记录 commit / hash、环境、输入、实际命令、证据、verdict 和 limitation；
- 历史失败不被后续成功覆盖；
- 当前 canonical 文档不维护“本周跑了多少测试”或“当前 HEAD 已通过什么”的动态状态。

需要当前状态时读取最新质量记录，而不是从本文推断。

<a id="九structured-ui-collection-reading-专项验证矩阵v05"></a>\n## 九、Structured UI Collection Reading 的集成验收边界

Agent-to-Recipe 只保留**集成层验收要求**：

- current viewport structure 与 whole-collection traversal 分开；
- generic item 与 business mapping 分开；
- native / OCR / layout / semantic vision 的 provenance 和冲突保留；
- VLM proposal 不能未经 deterministic validation 成为 truth；
- 重复文本、variable-height、virtualization、overlap、mutation、partial stop 必须有反例；
- traversal 有真实 UI side effect，continuity 不明时 fail closed / partial；
- business parser 错误不能归因成底层 segmentation 成功或失败。

SC-A—SC-P 的算法级测试、Phase 1—7 实施阶梯和 Runtime API 晋级只在 [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md) 及其实现测试中维护。

### Collection 测试层级

工作流只需要区分：

```text
结构识别
→ business mapping
→ traversal（如需要）
→ 最终业务结果
```

四层分别给 verdict，不能互相抵消。

### Collection 专项硬性验收规则

- current viewport reader 不应偷偷 scroll；
- traversal 必须声明副作用、budget、partial / stop；
- provenance 不丢；
- no-UI-tree 场景可以走受控视觉路线，但不能伪造 native 事实；
- 未真机平台不外推通过。

<a id="2026-09-10-v05-修订"></a>\n### Structured Collection 历史设计入口

该日期对应历史专项设计演进。当前 canonical 要求以上述边界为准；逐条历史矩阵查 Git history 和专项架构。

<a id="输入充分性与失败接续切片2026-09-20"></a>\n## 输入充分性与失败接续的验证要求

该标题保留作为兼容入口。Canonical 要求已经归入 BC-15、BC-24、BC-30 和 handoff 规则：

```text
固定输入
→ Producer 真实消费
→ 固定输出
→ 下游检查
→ 失败时保留原失败
→ 只修责任方
→ 新版本重新消费
```

某次 deterministic probe、resume-request 格式、调用预算、具体 checker 覆盖和测试结果见对应 [质量记录](../../../docs/quality/agent-to-recipe-adjacent-review-20260920.md)，不在验证方法正文复制。

### 固定输入和继续执行

恢复评测时必须保留：

- 原输入版本；
- 原输出；
- 原失败；
- 已耗预算；
- 新材料／新修复依据；
- 重新消费的责任阶段。

不能通过新 attempt 洗掉旧失败或重置预算。

### 已实现的判据及仍需专业判断的部分

确定性工具只能证明它真正检查的字节关系。自然语言语义、因果必要性、真实来源、宿主隔离、现场副作用和真实业务资格仍需相应层级证据。

## 普通 JS 原字节执行与复用判据

当真实桌面暂不可用时，可以用**冻结 production bytes** 做控制流／数据流级测试，但结论必须限定为该层。

至少检查：

- 实际返回值是否进入后续消费者；
- 异步顺序；
- 失败后是否停止依赖动作；
- 是否存在 Expected／示范常量注入；
- 是否修改了 production bytes；
- 测试 harness 是否重新实现了另一套业务流程。

原字节宿主测试不能证明：

- OpenDesk Runtime API 真实行为；
- 桌面目标身份；
- 视觉正确性；
- Fresh Run；
- 合法业务变参；
- 重复运行；
- 他人复用。

这些声明仍由 S12 对固定 Candidate 的真实执行证明。
