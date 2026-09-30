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

操作性前置另作 BC-21/BC-25 的正常、反例和接续样本：S2 最小认识可如实限定通过；S3 用当前可观察条件与后续区分性效果证明准备动作足以支持输入；“显示默认值”或回执成功但后续仍受旧运算影响时拒绝；审阅过的新证据交回原 S3，保留仍有效的 S1/S2。未知内部状态无须声称全复位，新鲜预检仍是每次真实输入的必要条件。限定版本的反例能否支持一个操作规则由独立审阅判断，静态 Guard 不替代该判断。

### F. 业务组合、跨应用与他人复用

| BC | 必须证明 | 关键拒绝反例 |
| --- | --- | --- |
| **BC-17 确定内容发送** | 已知对象／内容时用确定流程并验证真实结果 | 无需要却读历史／加模型；对象未消歧仍发送 |
| **BC-18 根据实际历史判断并回复** | actual history 进入有界判断；新鲜度受控 | 写死示范回复；新消息出现仍发送旧决定 |
| **BC-19 跨应用数据一致性** | source value、转换、target object、result 可追溯 | 剪贴板／旧焦点当数据合同 |
| **BC-20 他人配置和运行** | 未参与开发者只凭交付资产在声明环境配置和运行 | 依赖作者聊天、私有目录、凭据或历史 PASS |

<a id="strategy-validation"></a>

### G. 操作策略、切换与兼容的适用检查

这是既有 BC 的展开，不新增 Gate、策略评分或 Runtime 状态。方法来自[求解策略空间](../../../docs/frameworks/automation-problem-solving-framework.md#strategy-space)与[应用操作策略](application-operations.md#operation-strategy)。具体测试执行前固定版本、输入、授权、预算、Oracle、必测范围与证据层；下面不是已运行结果。

| 场景 | 必须观察到的行为/证据 | 对应 BC |
| --- | --- | --- |
| 正常合法且唯一的目标 | 完成正确操作并独立读回业务结果；不能全部拒绝 | BC-21、BC-24、BC-25 |
| 同名目标、动作后新出现的同文案对象，或正确格式的错误读值 | 不以首匹配/最高分或格式正确代替身份；动作目标与读取目标分别绑定，动作后重新定位并验证唯一性；实际值绑定正确对象与消费者 | BC-04、BC-05、BC-06 |
| 清空/准备的残留状态 | 使用有区分力的后续操作；只有显示默认值不能证明独立起点 | BC-21、BC-25 |
| 尚未发出的动作 | 只有能证明未发出且其他前提成立，才可选择适用的已验证替代路径 | BC-09、BC-13、BC-32 |
| 已发出但效果不明 | 停止依赖副作用，核对实际效果及原动作是否仍在进行；不换后端重做 | BC-05、BC-09、BC-13 |
| 多步部分完成/已确认成功 | 保留已完成前缀，确认安全接续点；业务成功不因回执形式异常被重复执行 | BC-09、BC-16 |
| 备用路径和策略参数 | 未验证路径不进入生产选择；auto/手选不绕过身份、权限、取消和预算；合法参数真实消费 | BC-11、BC-13、BC-32 |
| 窗口、列表或环境变化 | 当前对象重新定位；实际声明范围内正常成功与范围外安全拒绝分列 | BC-06、BC-23、BC-25 |
| 规则/选择/依赖改变 | S9/S10 引用一致，helper/模块等关键依赖有绑定，变更后旧资格不转移 | BC-08、BC-12、BC-16 |
| 简单脚本与模块入口 | 不强制多策略/Adapter/ESM；真实入口支持、源入口/依赖与实际 payload 身份分别验证 | BC-03、BC-11、BC-15 |

mock/故障注入只证明被测层控制流；不能声称真实应用产生了相同副作用或原生取消。只读补证也受隐私与授权约束；搜索、滚动、翻页、打开对象会改变应用状态，不能归入无限无副作用重试。范围外拒绝不计入该环境的兼容成功。

把 application-engineer 作为首个完善样本时，先核对方法、输入输出、模板、检查和失败接续一致，再用正常输入、反例与合法变化验证独立消费和局部维修。教学示例不能作为本次 Actual；模板已完整不表示黄金样本已通过适用验证。对应检查细节分别在 [application-engineer validation](../skills/application-engineer/references/validation.md) 和 [recipe-build validation](../skills/recipe-build/references/validation.md)。

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
| **可重复运行** | 同一冻结 Candidate 及依赖至少两次独立 Fresh Run；任务合同可要求更多（Calculator 当前要求三次） | 同一 execution 重读日志、Agent 首次示范 |
| **参数化可复用** | 基线之外至少一组合法变化输入，现场值仍进入实际 consumer | 改 Expected 或向测试桩注入答案 |
| **无需 Agent 逐步点击** | production path 确定步骤由普通 JS 执行；Agent 仅在预声明有界判断点出现 | Qualification 时再让 Agent 临场逐步决定 |
| **范围内稳定** | 声明的 app/build/layout/locale/input 扰动实际覆盖 | 单环境成功外推所有环境 |
| **他人可复用** | 新使用者仅凭交付说明配置并运行 | 作者私有聊天、路径、凭据 |

Candidate 或影响性依赖改变后，旧 Qualification 不继续证明新字节。

两次是通用 repeatability 声明的最低语义，不是生产成功率或 95% 可靠性证明；具体任务合同可以要求更严格的次数。Calculator 当前明确要求同一冻结 JS／依赖至少三次独立 Fresh Run。每次记录独立 run ID、实际入口、环境、候选及依赖 hash、可归因起点和独立实际结果；Calculator 每次重新读取 firstResult 和 finalResult，第二段由普通 JS 消费本次读值。新生产验证只有实际执行了最终冻结 JS，才可贡献其中一次；新 Agent 生产能力与 JS Fresh Run 仍是两项验收。有已声明参数入口时补合法变参，不为单例强建参数系统；替身数据流测试不能计入真实运行次数。

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

<a id="complex-golden-case"></a>

### 复杂应用第二基准线：沙盒记录到新文档

这是**待执行的案例选择与验证范围**，不是已实现能力、现成 API 或运行通过记录。Calculator 保持单窗口串行与真实读值案例；第二条线优先选择已有应用中的沙盒数据：

```text
指定若干跨页记录的业务身份
→ 搜索/翻页/滚动并消除歧义
→ 读取每条记录的实际字段
→ 保存逐对象状态与源值
→ 跨应用写入指定新文档
→ 另存为新文件
→ 核对实际路径、内容与对象覆盖
```

进入前固定实际应用与版本、账号/窗口、沙盒记录、字段含义/格式、允许转换、目标文档、另存路径、权限及预算；优先复用已有任务包和测试资产。应用或数据尚未选定就记录阻塞，不虚构成功样本；不为此任务擅自发送客户消息、提交订单、覆盖旧文档或安装新 Runtime。

| 应补的覆盖 | 正常证据 | 对应变化/失败检查 |
| --- | --- | --- |
| 列表、多对象与结束条件 | 每个请求身份均有当前真实来源，覆盖与去重有据 | 重名、排序变化、重复页、缺项；不可用屏幕行号作永久身份 |
| 应用操作与业务编排 | 已有或新规则按实际需求封装，Recipe 保留跨步决策 | Adapter 不接管全部循环/下一步业务，简单路径不强加策略集合 |
| 跨应用实际数据 | 源字段 → 允许转换 → 正确文档位置 → 保存内容可追溯 | 串错对象、旧剪贴板、格式损失、写死样例被发现 |
| 部分完成与接续 | 已完成记录、未完成记录和安全接续点分别保存 | 写入/保存效果未知时先核对，不重复写入已完成对象 |
| 文件结果 | 实际保存路径与内容独立核验，原文件不被覆盖 | 同名已有文件、保存取消/超时、内容未落盘不能记成功 |
| 声明范围变化 | 请求范围内的窗口/布局/数据变化实际执行 | 范围外拒绝单列，未测平台/版本不能列入兼容范围 |

测试按已有 BC-04/06/08/09/10/19/21/25 及适用 Gate 落地。若声明重复或变参，再按本文件第五节提供对应 Fresh Run；不能用第二案例的一次成功认证整个方法空间。附件上传、真实消息发送、多备用策略和长期运行仍有独立未覆盖项，不因为第二条线存在就补写通过。

## 八、评分：95 分是审查目标，不是预设结论

这是项目内部文档／能力审查尺度，不是行业认证。

### 先判断“什么对象值得独立评分”

评分对象不是按文件数、Skill 数或编号机械生成。先用下面七个问题判断责任是否真正独立：

1. 是否有独立责任：能用一句话说明“只有它负责回答什么问题”。
2. 是否有独立输入：它消费的权威输入边界可以被固定。
3. 是否有独立输出：它产生下游可消费、可版本绑定的实际成果或结论。
4. 是否有独立完成条件：可以在不借用下游成功的情况下判断本职责是否完成。
5. 是否有独立失败类型：存在“输入仍正确，但本对象输出首次变错”的反例。
6. 是否有独立 failure owner：失败可以明确回到该责任，而不是只能回父对象。
7. 是否可以局部修复：修复它时能够保留无关上游，并只使实际依赖它的下游重验。

**判定规则：**

- S1—S12 都是正式阶段，具有独立责任、完成条件和失败边界，因此必须逐阶段评分；同一个 Skill 承担多个阶段不能合并成一个平均分。
- Delivery / Publish Handoff 不是 S13，但在承担真实交付责任时有独立输入、输出、验收和失败责任，可作为外部责任边界单独评分。
- Skill 不因为“是一个目录”自动再获得一份重复分数。只有它包含未被正式阶段评分覆盖的独立责任时，才额外按该责任评分；例如 code-rebuild 是 S11 内可选的独立代码评审／改进方法，可单独审查方法质量，但不得被提升为新阶段。
- 可读 View、模板、helper、导航文件、编号、同一成果的另一种展示形式，如果没有独立责任、独立 failure owner 和局部修复边界，不单独评分。
- 一个对象一旦被判定为独立评分对象，仍只使用下面这套五维 100 分制；不得再发明第二套评分体系。

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
- 只有明确局部覆盖：按下述执行前固定的检查项累计，不凭印象给比例分；
- 已评检查项错误或缺证：0；未执行或不足以开展评价时记未评价，不编造实际总分；
- **>=95 仍要求适用 Hard Fail 全部通过、requested 必测项完成、无阻断 Unknown；**
- `not-run` / `blocked` 不记通过；
- 简单脚本不因抽象少扣分；
- 本文件不填写当前实现的实际得分。

逐阶段退出将本规则应用到**当前阶段而非整条链的平均分**。每次 S1—S12 正常 PASS 必须同时满足：`score >= 95 AND applicable Hard Fail == 0 AND required evidence complete AND blocking Unknown == 0 AND required tests passed`。记录五维各自得分及证据、实际输入和输出版本、适用 Gate、Hard Fail、Unknown、必需测试、verdict 与未检查范围；同一个 Skill 的 S3/S4/S5/S6、S8/S9、S2/S10 不能合并分数。高分遇到任一 Hard Fail 仍为 FAIL；没有真实 S3 action、S4 observation 或 S12 run 不能因预期或 mock 评分而 PASS。具体推进和局部返修循环见 [WORKFLOW](../WORKFLOW.md)。

### 阶段职责、固定分母与必需证据映射

**既有制度**是上述五维 25/20/20/20/15、至少 95 分、Hard Fail 与必需项不可抵消，以及共享合同引用的二十项办法。**本轮补充**是下面的二十项展开、阶段适用映射及执行前冻结口径，不新增阶段、十二套量表或竞争总分。

| 维度代号 | 固定检查项（各项 5 分） | 固定分母 |
| --- | --- | ---: |
| A 需求与语义 | A1 目标／对象；A2 来源真实性；A3 请求范围覆盖；A4 实际数据关系；A5 成功／失败判据 | 25（5 项） |
| B 职责与独立性 | B1 owner／模式；B2 输入充分性；B3 独立完成边界；B4 无越责或循环依赖 | 20（4 项） |
| C 成果与接续 | C1 实际成果正文；C2 下游可消费；C3 来源／依赖版本一致；C4 状态与接续信息 | 20（4 项） |
| D 验证与修复 | D1 正常场景证据；D2 适用变化／失败／拒绝证据；D3 失败归因及返回；D4 影响传播与重验依据 | 20（4 项） |
| E 复杂度与成本 | E1 工程量适配；E2 既有能力复用；E3 预算／停止条件 | 15（3 项） |

每阶段执行前把下表职责映射到 A1—E3，固定输入／方法版本、逐项可判定条件、适用场景、证据层、必需 evidence、Gate／Hard Fail、进入与退出条件及评审者。每项满足固定条件且有证据得 5，否则已评项得 0；局部覆盖只累计完整满足的项。阶段分母固定为 20 项／100 分，分项和总分仅以 5 分为粒度，不产生 97、98 等插值，也不把未评价项补满。正常放行仍须满足全部非分数条件。

机器检查复用阶段记录的 `acceptanceRef` 及其 `stages[S1…S12]`，不另建评分来源链；每阶段输入绑定同一冻结引用。固定判据须包含二十项唯一 ID、所属维度、每项 5 分上限、分母 100、粒度 5、判据及必需证据角色，实际评审逐项保存得分／未评价与证据。A—E 对应既有 `score` 键 `requirements`、`responsibility`、`continuation`、`validation`、`cost`。Guard 应拒绝漏项／重复项、缩分母、非法粒度、分项与维度总和不符、冻结引用漂移及缺必需证据；未评价不得放行。hash 和手填时间只证明声明，执行前冻结还须有可核对的预登记／输入时序证据；Guard 不能由此自动证明现场真实性或业务正确。

五维用于当前职责，不要求提前取得未来阶段成果；例如 A4 在 S1 检查数据关系定义，在 S4 检查实际读值，在 S11 检查实现。具体 Gate／场景不适用须在执行前注明依据，不能因此删掉通用检查项、缩小分母、转移权重或自动得分。若无法建立可评价条件，保留未评价并补齐依据，不强行凑总分。判据确有错误时单独记录修订原因和新版本，重定受影响评价，不能回改原失败为通过。

| 阶段／责任 Skill 或模式 | A 需求与语义适用点 | B 职责与独立性适用点 | C 成果与接续适用点 | D 验证与修复适用点 | E 复杂度与成本适用点 | 必需证据（绑定当前输入／方法／成果版本） |
| --- | --- | --- | --- | --- | --- | --- |
| S1／automation-plan：合同与计划 | 原话、对象、数据依赖、成功边界 | 用户决定与技术 Unknown 分开 | TaskContract／WorkPlan 可供 S2 和执行消费 | 范围遗漏、矛盾与高影响未知检查 | 最小计划、预算、早期否证 | Source、合同与计划正文、需求映射、Unknown／授权及审阅记录 |
| S2／application-engineer discover：最小应用认识 | 当前对象、读取与定位依据 | 只证明下一步可行；不要求最终 JS | Profile／发现结果供当前动作消费 | 区分旧观察、本次观察、假设与待验证 | 最小发现、既有知识来源与适用性 | 应用／窗口身份、现场 observation、最小 Profile、材料充分性及缺口判断 |
| S3／task-demonstrate：获准动作 | 实际目标、输入及运行时值来源 | 动作授权、前置和真实执行者 | 实际 action 与 planned step 关联 | 动作状态、副作用 unknown 停止 | 串行动作、有界执行 | 动作请求／返回、时间与对象、前置证据、实际值来源及 action state |
| S4／task-demonstrate：观察验证 | 实际读值／效果不由 Expected 倒填 | API 返回与业务效果分别判断 | observation 与对应 action 关联 | 实际后置、失败／不确定状态 | 必要读回、有界等待 | 新鲜 observation、原始读值、业务对象、Expected／Actual 分列与验证结论 |
| S5／task-demonstrate：分类决策 | 正常、探索、恢复等分类有据 | 继续／恢复／停止决定不越权 | planDelta 保留过去事实 | 重试前核对状态，错误返回相应 owner | 重试预算与停止依据 | Experience Unit、分类依据、planDelta／决策、状态核对及恢复或停止记录 |
| S6／task-demonstrate：示范收口 | 请求任务结果逐项覆盖 | 本次示范成功不等于 Recipe 资格 | Dossier 保留完整事实与缺口 | 任务级验证、未完成与定向补采 | 不重跑已有效片段 | Dossier、Raw Trace／Evidence 引用、实际结果、任务覆盖与收口 verdict |
| S7／trace-distill：必要路径 | 必要动作及数据依赖不丢失 | 独占 action disposition 决策 | DistilledSteps 可供 S8 独立消费 | 取舍反例、unresolved 与补证返回 | 去噪而不机械去重 | sourceActionRefs、分段、retain／merge／omit／recovery／unresolved 依据、数据边 |
| S8／procedure-synthesize：业务语义 | 业务步骤、对象、运行时数据关系 | 消费 S7，不重做 disposition | Business Steps 与语义交接正文 | 来源不足或语义错误返回责任方 | 只提炼有来源语义 | DistilledSteps 版本、业务步骤映射、数据 producer／consumer 与未决项 |
| S9／procedure-synthesize：复用规格 | 参数、分支、数据边和范围有据 | 不把应用工程缺口改成业务假设 | 批准的 SemanticProcedure 供 S10／S11 | 泛化边界、补证及批准条件 | 不无据扩大参数化／复用 | Procedure、参数来源、dataDependencies、适用范围、补证与审阅结论 |
| S10／application-engineer harden／repair：操作工程 | locator／read／wait／action／verifier 忠实业务 | 应用规则与业务语义 owner 分开 | 可执行 Profile／helper 与依赖 | 定向现场验证、失效与安全拒绝 | 优先复用、有界维修 | 同版操作规则、API 依据、局部真实运行及失败证据、未覆盖环境 |
| S11／recipe-build；按需 code-rebuild：冻结候选 | 普通 JS 忠实实现数据关系 | 消费确定上游；不以前置 S12 资格生成 | 源码、入口、依赖与映射冻结 | 原字节检查、实现错误及受影响重验 | 简单实现、API 复用、运行边界 | 确定上游版本、JS 字节／hash、依赖清单、业务到代码映射、静态／适用测试结果 |
| S12／recipe-qualify：独立资格 | requested scope 与独立业务结果 | 验收不静默修改候选 | Qualification 与限制可交付 | 同冻结 JS Fresh Runs、修复请求及重验 | 按范围验收、有界修复 | 候选／依赖 hash、实际入口／环境／run ID、独立结果、场景结论、Requirement Coverage |

本表是判据与证据映射，不是已完成记录。阶段结果须展示成果关键正文、下游消费、逐项证据与得分／未评价、verdict、问题及下一动作；不能只给文件路径或 Skill 总体 PASS。允许合法分组及 S3—S5 交织，但现场安全条件即时检查，阶段结论分别保留。阶段分项、Skill 方法、工具测试、模型生产及业务资格不借用或平均；原适用因素要求独立达到 95 时逐因素满足，不能压成一个综合分。未发生人工／专家评审不得声称专家已评分。

### 方法空间完善的独立审查与反方检查

方法维护至少分别审查通用框架、能力发现、应用操作、application-engineer、recipe-build；Calculator 新信息层级、S1—S12 边界、人工可读性、复杂应用扩展、反方审计后的架构稳定性也分别记录结论和缺口。是否形成独立分数仍按本节七问判断；同一成果的视图/导航不重复计业务资格分，不把各对象平均成“总方案 95”。

独立方法对象的数值评价仍使用 A1—E3、固定 100 分及 5 分粒度，并在评价前固定范围与判据。未开展所需评价或缺少行为/现场证据时保留未评价，不为满足目标补分。S2/S10、S11/S12 各自按当次责任单独验收；方法文字质量不能替代其运行资格。

| 反方视角 | 必须检查并指出的反例 |
| --- | --- |
| Workflow 架构 | 方法地图被当作新阶段、平行流程，或为了文档摆放重拆 S1—S12 |
| 桌面自动化 | API 层级、观察来源、目标绑定、几何/坐标混成固定优先级 |
| 应用架构 | Adapter 重写通用 Runtime、接管整条业务，或操作名称冒充已实现 API |
| 可靠性 | unknown/partial 后切换重放；暂未见结果被当未执行；范围外拒绝被算兼容成功 |
| 代码架构 | 强制每个操作多策略/独立模块，大量未验证注释备用，入口/依赖 hash 混淆 |
| 人工可读性 | 只有概念、字段名和 PASS，无法从总地图找到实际样本、选择理由、证据和失败责任 |

记录实际审阅者与方式。一个 Agent 采用六个视角仍是同一审阅者，不是六名独立专家；只增加检查表也不算反方审计已经执行。真实使用者的阅读效果需单独验证，不能根据作者自评声称已达到阅读时长目标。

### 冻结后的 Reference Alignment（基于需求合规，不另计分）

先固定参考实现的实际版本／hash，不能在对照前改写参考，也不能把参考提升为用户需求。维护与接续上下文可读参考，但不能改称隔离 Producer。新生产验证须使用独立上下文及实际受控输入／工具／文件访问范围：允许原始需求、验收要求、必要合同、公开 API、当前 Skill、通用模板及本次合格上游；通用 Profile／helper 须说明来源和适用性，不得夹带任务答案。禁止访问与当前任务同源的黄金案例或 Skill `examples/`、该任务参考 JS、未来阶段答案、旧任务完整解答、隐藏期望及带答案评测记录，包括可从历史日志、Git 历史取得的内容。仅新开会话或口头禁止读取不足以证明隔离；记录控制方式、输入清单、访问记录与限制，不能实现时如实 blocked。协调者不把含答案反例整段复制到 Producer 输入。

对有明确参考目标的回归案例，冻结 S11 Candidate 的源码字节／hash、依赖和上游来源后，Evaluator 才将参考加入最终对照；完成同一 Candidate 的独立 S12 资格、Fresh Run 及最终 Requirement Coverage。Calculator 参考为 `examples/agent-to-recipe/calculator.js`。逐方面记录需求条目、候选实现位置、参考版本及行为、实际证据、差异与合规结论（pass／fail／not-run／blocked）：

| 对照方面 | 基于需求的判据与证据 |
| --- | --- |
| 业务行为 | 原始需求、同一候选 Fresh Run 与独立实际业务结果是否对应 |
| 运行时数据流 | 本次实际读取、原文保存、UI clear 后保持、后续完整有序消费是否成立 |
| API／操作语义 | canonical API、执行顺序、目标／读取／按钮操作及作用范围是否合规 |
| 失败停止 | 读数异常、目标歧义、副作用 unknown 时是否停止，无伪造回退 |
| 工程质量 | 原字节、依赖、边界、可维护性与简洁性是否满足用途 |
| 适用范围 | 应用／环境／输入及限制是否覆盖请求，差异是否有真实验证支持 |

不设置 Reference Alignment 竞争分数或结构相似门槛；数值评分只使用本节既有五维制度。源码文本、token 或 AST 相似仅辅助诊断；等价且合规的不同实现允许通过。参考缺陷单列，不要求候选模仿；参考缺失则对照 blocked，业务资格与整项交付分开报告。若发现不合规，追踪首个有证据的错误边界，记录 last confirmed correct artifact、first invalid boundary、failure owner、missed-check owner、invalidated downstream、preserved upstream、next minimum action；无证据时先待诊断，不凭阶段名称指定根因。修复后重验受影响下游、重新冻结和资格，不套用旧 PASS。没有新 evidence、修复依据或授权时停止同类重试。

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
