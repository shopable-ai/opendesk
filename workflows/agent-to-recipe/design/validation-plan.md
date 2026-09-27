---
title: "Agent-to-Recipe｜行为案例、测试空间与验收计划"
description: "定义 Agent-to-Recipe 各证明层的行为案例、测试空间、Gate、证据、硬失败与评分方法。"
order: 70
---

# Agent-to-Recipe｜行为案例、测试空间与验收计划

本文只回答一个问题：

> **凭什么证明 Agent-to-Recipe 的每一层做对了？**

本文定义 **canonical 验证方法**。它不记录某一 commit 跑了多少测试、某个 checker 当前实现到哪一步，也不保存历史 PASS、某轮模型表现或专项实现日志。实际执行结果进入 `docs/quality/`、QualificationRecord 或对应 execution artifacts。

完整“需要做什么”见 [task-decomposition.md](task-decomposition.md)；相邻交接怎样快速人工检查见 [acceptance-map.md](acceptance-map.md)；字段与版本约束见[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)。

## 30 秒总览

必须分开证明：

```text
需求理解正确
≠
计划合理
≠
真实任务事实可靠
≠
DistilledSteps 正确
≠
SemanticProcedure 正确
≠
应用操作规则可靠
≠
Candidate 代码正确
≠
宿主 / Runtime 能执行
≠
真实业务 Qualification 通过
≠
可重复 / 可参数化 / 可共享
```

验证遵循六步：

```text
固定验证对象与版本
→ 固定 requested scope 和场景
→ 设计正常 + 变化 + 边界 + 失败 + 拒绝 + 恢复样本
→ 选择适用证明层 / Gate
→ 收集真实 evidence
→ 给出 pass / fail / not-run / blocked，并绑定版本
```

任何低层 PASS 都不能自动升级成高层结论；任何高层结果也不能反向证明缺失的低层来源事实。

## 一、先固定验证对象、范围与 Oracle

验证开始前必须固定：

- 被验证对象；
- version / hash；
- requested scope；
- 场景与输入；
- 必需 evidence；
- Oracle / verifier；
- 允许误差；
- hard-fail 条件；
- `not-run` / `blocked` 判据；
- 预算、重试和停止条件。

| 验证对象 | 核心问题 | 主要证据 |
| --- | --- | --- |
| **需求** | 是否解决了正确问题，没有偷换目标、范围或授权 | Source、TaskContract、人工纠正 |
| **计划** | 是否暴露关键 Unknown、依赖、checkpoint 与副作用 | WorkPlan、planDelta |
| **应用认识** | 是否知道正确应用、页面、对象、读取依据及限制 | AppProfile、observation、review |
| **真实示范** | 实际发生了什么 | Dossier、Raw Trace、Evidence、actual values |
| **DistilledSteps** | 必要动作是否被正确保留、合并、删除或标未决 | sourceActionRefs、data dependency、disposition |
| **SemanticProcedure** | 业务语义、参数、数据关系与支持范围是否有来源 | Business Steps、dataDependencies、limits |
| **应用工程** | locator / read / wait / action / verifier 是否可靠 | Profile/helper、局部运行、失败场景 |
| **Candidate** | 固定普通 JS 是否忠实实现上游规格 | exact bytes、manifest、source mapping、API refs |
| **Qualification** | 同一候选是否在 requested scope 真正成立 | real execution、independent observation、scenario verdict |
| **复用声明** | 重复、变参、跨环境或他人使用是否真实成立 | repeated Fresh Runs、合法变参、新环境／新使用者证据 |

Oracle 必须来自测试定义、业务规则或独立 observation，不能由被测对象自己的输出反向生成。

## 二、行为案例怎样写

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

1. **Expected 与 Actual Observation 分开。**
2. 正常合法样本必须能成功；“全部拒绝”不叫可靠。
3. 反例被正确拒绝，只证明拒绝逻辑，不证明正常业务已经成功。
4. 测试空间至少考虑：正常、变化、边界、失败、拒绝、恢复。
5. fixture / mock 只证明其覆盖层，不能外推真实桌面。
6. requested 场景失败后不能移到 excluded 来取得 PASS。
7. 同一次 execution 重读日志，不算两次 Fresh Run。
8. 修改 Candidate、Profile、Oracle 或 requested scope 后，必须重新判断哪些旧结论失效。

## 三、核心行为案例矩阵

BC 编号是需求追溯标识，不是新的 Runtime Gate。

### A. 主链、数据与代码

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-01 完整 Agent 新示范与生成** | 自然语言目标 → 计划 → 最小发现 → 真实执行 → DistilledSteps → Procedure → Candidate → Qualification 各层真实发生且可消费 | 执行后直接生成 JS，跳过事实／必要路径／语义证明 |
| **BC-02 已有低质量代码独立改进** | 可直接进入 code-rebuild + 必要资格；修改有依据且限定范围 | 强迫重录完整示范；从代码猜上游业务事实 |
| **BC-03 简单脚本已经足够合格** | 允许原样保留；仍完成必要验证 | 为“工程化”强制增加类、文件或无收益抽象 |
| **BC-04 实际数据交接** | runtime read value 真正进入后续 consumer | 读到值后仍使用示范常量 |
| **BC-05 读数失败或状态不确定** | 不可用时停止依赖动作并保留真实失败 | 默认答案、宽松解析、用 Expected 伪造结果 |
| **BC-11 代码质量与 API 复用** | API 真实存在；异步、错误、等待和复杂度合理 | 虚构 API、吞错、无界等待、并行桌面动作 |
| **BC-32 能力发现闭环** | discovery、contract、现场验证、Candidate source ref 分层可追溯 | 文档存在就写 runtime pass；缺 contract 或 evidence |

Calculator 等案例中的固定数字只能作为 Oracle；实际业务取数必须来自真实 producer。

### B. 语义、版本、恢复与安全

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-07 语义或因果证据不足** | 必要步骤、恢复候选与 unresolved 能正确区分 | 缺事实时编造稳定流程 |
| **BC-08 版本与候选一致性** | consumer 精确消费发布版本；变化能传播影响 | A 的资格证明 B；“文件可解析”当来源正确 |
| **BC-09 中断与副作用状态** | 未执行、可能已执行、已写成果三种状态可区分 | 超时后盲重放；把 checkpoint 当事务回滚 |
| **BC-10 Oracle / verifier / scope 错误** | 错 Oracle、缺 verifier、requested 未运行被正确暴露 | 改 Expected、跳 verifier、缩小范围取得 PASS |
| **BC-12 需求变化** | 变化可追到 Plan、Procedure、Profile、Candidate、Qualification | 在 S12 末端悄悄降低标准 |
| **BC-13 权限、预算与敏感内容** | 授权、脱敏、上传范围、预算与高风险门禁真实执行 | 屏幕文字或模型输出扩大授权 |
| **BC-16 证据生命周期** | 失败和历史版本保留；证据丢失会降低结论 | 删除证据后继续保留原 PASS |

### C. 宿主、独立性与正常路径

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-14 JS / Agent 混合环节** | 输入、模型判断、validator、人工边界和动作分开验证 | provider 不存在却称端到端通过 |
| **BC-15 独立上下文与真实宿主** | 新 Agent 只凭规定输入和方法完成职责或准确拒绝 | 复制完整聊天补输入；换角色冒充隔离 |
| **BC-24 同一 Agent 正常路径** | 资料充分时可连续推进；错误定向回 owner | 每一步强制制造新 Agent / handoff；所有失败回 S1 |
| **BC-26 自然语言入口** | 用户无需写 JSON；结构化合同保留原话并可纠正 | 要求用户维护 JSON；可读视图变成第二真相 |
| **BC-27 执行前计划与高影响 Unknown** | 长任务先暴露关键未知并优先否证 | 明知关键读取未知仍先跑大量依赖动作 |
| **BC-28 planned → actual → planDelta** | 计划外必要动作保留原因；未执行计划不进入事实链 | 把计划步骤直接写成已发生事实 |

### D. DistilledSteps 与跨职责交接

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-29 必要路径与机械去噪** | 原动作有 retain / merge / omit / recovery / unresolved；数据依赖不断 | 删除必要读值；机械去重合法重复输入 |
| **BC-30 S7 → S8—S9 独立交接** | S8—S9 只凭 DistilledSteps + 正式必要输入继续或准确指出缺口 | 静默重读全量 Raw Trace 并维护第二套 disposition |
| **BC-31 Agent / Human 来源共享专业方法** | lineage 分开，后续方法可共享 | Human recording 追认为 Agent Dossier |

### E. 应用工程、视觉与复用

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-06 未知布局与矩阵规则** | 布局变化会重新解析；网格／矩阵只有证据支持时使用 | 均分窗口、取首候选、未测平台自动纳入支持 |
| **BC-21 材料充分性** | 认识／定位／操作分别判断充分性 | 截图无坐标映射却直接点击 |
| **BC-22 模型提取与答案隔离** | 被测模型看不到隐藏真值；输入／输出／模型版本可复核 | 先给答案再测；模型自评当准确率 |
| **BC-23 同源审阅与修订** | 原图、overlay、属性、Profile 同版；修订传播到依赖 | 格式校验冒充语义通过 |
| **BC-25 规则复用与定向维修** | 未见样本和真实应用中可复用或安全拒绝 | 只在建模截图成功；硬编码示范行号／对象 |

### F. 业务组合、跨应用与他人复用

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-17 确定内容发送** | 已知对象／内容时用确定流程并验证真实结果 | 无需要却读历史／加模型；对象未消歧仍发送 |
| **BC-18 根据实际历史判断并回复** | actual history 进入有界判断；新鲜度受控 | 写死示范回复；新消息出现仍发送旧决定 |
| **BC-19 跨应用数据一致性** | source value、转换、target object、result 可追溯 | 剪贴板／旧焦点当数据合同 |
| **BC-20 他人配置和运行** | 未参与开发者只凭交付资产在声明环境配置和运行 | 依赖作者聊天、私有目录、凭据或历史 PASS |

## 四、证明层：低成本检查先做，但不能越级

| 层 | 证明什么 | 典型方法 | 不能外推 |
| --- | --- | --- | --- |
| **L0 Contract / Static** | 字段、引用、hash、静态映射 | schema、linter、handoff checks | 事实真实、业务成功 |
| **L1 Deterministic Unit** | 纯转换、解析、映射、拒绝逻辑 | fixtures、unit tests | 模型行为、宿主、桌面 |
| **L2 Independent Method Behavior** | Skill 在限定输入下能独立生产或准确拒绝 | 隔离 Producer eval | 宿主自动加载、真实业务 |
| **L3 Host / Runtime Integration** | 实际宿主加载、权限、API、调用链可用 | host integration | 目标业务已成功 |
| **L4 Real Application / Fresh Run** | 固定 Candidate 在真实应用完成业务并独立读回 | real execution | 变参、重复、共享 |
| **L5 Reuse / Variation / Sharing** | 重复、变参、环境变化或他人复用声明成立 | repeated runs、varied inputs、independent user | 未覆盖范围 |

对于 application-engineer，至少分别验证：

```text
确定性结构 / 工具
→ 模型或视觉提取（如使用）
→ 未见样本上的规则复用
→ 获准真实应用 / 工作流消费
```

前一层通过不能替代后一层。

## 五、S12：声明什么，就提供对应证据

| 声明 | 最低证据 | 不能替代 |
| --- | --- | --- |
| **精确 Candidate 通过** | Candidate、入口、依赖、环境固定，并执行同一 production bytes | 参考脚本、重写测试脚本 |
| **requested scope 已验证** | requested 项逐项有 actual scenario + evidence | 只在 manifest 写 qualified |
| **一次 Fresh Run 成功** | 可归因起点、真实入口、独立业务 Observation | 历史日志、Expected、mock |
| **可重复运行** | 同一 Candidate 至少两次独立 Fresh Run | 同一 execution 重读日志 |
| **参数化可复用** | 基线之外至少一组合法变化输入，现场值仍进入实际 consumer | 改 Expected 或向测试桩注入答案 |
| **无需 Agent 逐步点击** | production path 确定步骤由普通 JS 执行；Agent 仅在预声明有界判断点出现 | Qualification 时再让 Agent 临场逐步决定 |
| **范围内稳定** | 声明的 app/build/layout/locale/input 扰动实际覆盖 | 单环境成功外推所有环境 |
| **他人可复用** | 新使用者仅凭交付说明配置并运行 | 作者私有聊天、路径、凭据 |

Candidate 或影响性依赖改变后，旧 Qualification 不继续证明新字节。

## 六、Gate 与硬失败

沿用 [G0—G7](../../../docs/quality/gates-and-evidence.md)：

- **G0**：输入、权限、应用、依赖、证据根等前提成立。
- **G1**：当前 observation 与原始证据可追溯，没有未处理漂移。
- **G2**：需要视觉／结构检测时，其结构与异常可解释。
- **G3**：语义与目标有证据，歧义显式暴露。
- **G4**：目标、前置、期望后置、失败策略与动作依据齐备。
- **G5**：实际后置与业务效果经过检查，不只依赖 API success。
- **G6**：高风险身份、授权、状态、结果与人工边界独立核对。
- **G7**：结论绑定当前代码／运行／证据，关键证据缺失不能 pass。

不是每个边界机械要求全部 G0—G7；选择适用 Gate，并说明没使用哪些 Gate。

以下属于 **Hard Fail**，不能被平均分抵消：

- 伪造 Actual Observation 或实际读值；
- Expected / 示例常量进入 production data path；
- 越权；
- 错业务对象；
- 未运行写成通过；
- requested 中 fail / not-run / blocked 被隐藏；
- Candidate 改变后沿用旧 Qualification；
- 虚构 Runtime / API；
- 关键 producer → consumer 数据关系断裂；
- 副作用 unknown 时盲重放；
- 为获得 PASS 修改成功标准、Oracle 或 requested scope。

## 七、专项能力只保留集成验收边界

### Structured Collection

Agent-to-Recipe 只要求分别给出：

```text
viewport 结构识别
→ business mapping
→ traversal（如果需要）
→ 最终业务结果
```

四层分别给 verdict，不能互相替代。

额外必须守住：

- current viewport recognition 不等于 whole collection；
- generic item 不等于业务字段；
- provenance 与 observation source 不丢；
- traversal 是有副作用行为，continuity 不明时停止或 partial；
- 无 usable UI tree 时可使用受控视觉路线，但不能伪造 native 事实。

segmentation、continuity、VLM proposal、merge、mutation、end detection、专项测试矩阵与 Runtime API 设计统一见 [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。

### 普通 JS 原字节测试

真实桌面暂不可用时，可以对**冻结 production bytes** 做控制流／数据流测试，至少检查：

- runtime value 是否进入后续 consumer；
- async 顺序；
- 失败后是否停止依赖副作用；
- 是否注入 Expected / 示例常量；
- harness 是否重新实现了另一套业务流程。

这类测试不能证明真实 Runtime API、桌面对象身份、Fresh Run、重复运行、合法变参或他人复用。

## 八、评分：95 分是审查目标，不是预设结论

这是项目内部文档／能力审查尺度，不是行业认证。

| 维度 | 分值 | 核心检查 |
| --- | ---: | --- |
| 需求与语义正确性 | 25 | 目标、来源、任务覆盖、真实数据关系、成功／失败判据 |
| 职责与独立性 | 20 | owner、独立入口、输入充分性、无职责重叠／循环依赖 |
| 成果与接续 | 20 | 产物可消费、版本一致、计划／事实／步骤／过程可接续 |
| 验证与修复 | 20 | 正反场景、失败返回、受影响重验、实际 Candidate 证据 |
| 复杂度与成本 | 15 | 工程量与用途匹配、API 复用、预算与停止条件 |
| **合计** | **100** | Hard Fail 另算，不可用分数抵消 |

评分规则：

- 证据充分：对应检查项满分；
- 只有明确局部覆盖：按局部覆盖计分；
- 错误或无证据：0；
- **>=95 仍要求适用 Hard Fail 全部通过、requested 必测项完成、无阻断 Unknown；**
- `not-run` / `blocked` 不记通过；
- 简单脚本不因抽象少扣分；
- 本文件不填写当前实现的实际得分。

## 九、需求追溯与遗漏检查

验证设计完成后反向检查：

1. DREQ 是否都有对应责任与行为判据。
2. S1—S12 是否仍有相应证明对象。
3. Source / Plan / Actual / DistilledSteps / Procedure / Candidate / Qualification 是否仍分层。
4. trace-distill 与 procedure-synthesize 是否能独立交接。
5. Human 与 Agent 来源是否保持 lineage。
6. 同一 Agent 正常路径是否没有被“独立性”强制拆碎。
7. 新增文件、工具、阶段是否真的服务需求。
8. 每个测试结果是否明确“证明了什么 / 没有证明什么”。

高层追溯可按以下关系维护：

| 需求主题 | 主要 BC |
| --- | --- |
| 来源、任务定义、自然语言入口 | BC-01、BC-26、BC-27、BC-28 |
| 专业职责与独立交接 | BC-15、BC-24、BC-29、BC-30、BC-31 |
| 实际数据流与代码 | BC-04、BC-05、BC-11、BC-32 |
| 安全、版本与恢复 | BC-08、BC-09、BC-10、BC-12、BC-13、BC-16 |
| 应用认识与规则复用 | BC-06、BC-21、BC-22、BC-23、BC-25 |
| 业务组合与共享 | BC-17、BC-18、BC-19、BC-20 |
| 混合 Agent / Runtime | BC-14 |

完整需求编号仍由 [requirements.md](requirements.md) 拥有；本表只用于发现明显漏测。

## 十、结果保存与历史证据

验证结果至少记录：

- commit / hash；
- environment；
- fixed inputs；
- 实际命令或入口；
- Producer / consumer；
- evidence；
- verdict；
- limitation；
- `not-run` / `blocked`；
- 预算和停止原因。

保存位置：

- 工作流／Skill 某一版本的质量记录 → `docs/quality/`；
- 固定 Candidate 的业务资格 → QualificationRecord；
- 运行级原始证据 → 对应 execution artifacts。

历史失败不能被后续成功覆盖；证据缺失时降低结论，而不是保留无法复核的 PASS。

历史某日期的验证切片、测试数量、checker 覆盖、Calculator 某轮结果、Collection 专项演进和 implementation milestone 不属于本 canonical 方法。需要设计考古时使用 Git history；需要某一版本实际状态时读取 `docs/quality/`。
