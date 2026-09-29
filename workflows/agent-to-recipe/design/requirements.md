---
title: "Agent-to-Recipe｜需求发现与需求基线"
description: "定义 Agent-to-Recipe 为什么存在、必须满足什么，以及哪些内容明确不属于这份需求基线。"
order: 20
---

# Agent-to-Recipe｜需求发现与需求基线

本文只回答一个问题：

> **为什么需要 Agent-to-Recipe，以及这条工作流必须满足什么？**

本文拥有的是需求基线，不是 S1—S12 的执行说明、评分细则、字段合同、专项算法或当前实现状态。

- 一个需求怎样经过 S1—S12 变成 Recipe：见 [WORKFLOW](../WORKFLOW.md)。
- 每个阶段完整做什么：见 [task-decomposition](task-decomposition.md)。
- 谁生产什么、交给谁、错了回谁：见 [chain-design](chain-design.md)。
- 怎样证明做对、怎样评分、哪些属于 Hard Fail：见 [validation-plan](validation-plan.md)。
- 正式字段、版本、hash 和 handoff：见 [共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)。

## 30 秒总览

Agent-to-Recipe 要解决的不是“让 AI 尽快写出一段自动化代码”，而是：

~~~text
真实需求
→ 真实事实
→ 必要业务过程
→ 可复用规格
→ 普通 OpenDesk JavaScript
→ 独立资格验证
→ 可交付自动化成果
~~~

整个过程中必须守住六件事：

1. **来源真实**：用户要求、事实、未知、提案、Expected 和 Actual 不能混写。
2. **责任完整**：任务定义、真实执行、必要步骤、业务语义、应用工程、实现和资格不能跳层互相代替。
3. **运行时数据真实**：现场读到的值必须真正进入后续消费者，不能用示例常量或 Expected 替代。
4. **执行受控**：对象、授权、副作用、预算、失败和停止边界必须明确。
5. **成果可复用**：已有能力优先复用；简单任务不过度设计；共享时不依赖作者私有上下文。
6. **证明分层**：文档存在、实现存在、测试通过、Runtime 可用、真实业务成功和最终 Qualification 是不同事实。

## 1. 为什么需要这条工作流

OpenDesk 已经可以提供窗口、界面、文件、网络等自动化能力，但“有能力”不等于“已经知道怎样把一次真实业务任务稳定地变成可重复程序”。

Agent-to-Recipe 负责把一次真实任务、人工开发目标或已有自动化资产，沿现有 S1—S12 生产、修复或重新资格化为可交付 Recipe。

它不负责普通用户每次运行已交付 Recipe 的 Runtime 主链。

### 允许的主要入口

- **Agent 新任务**：从用户目标开始，取得真实事实，再形成 Recipe。
- **人工正向开发**：保留 Human 来源，不伪造 Agent 示范历史。
- **已有资产接续**：固定已有代码、证据和范围，只从第一个真实缺口继续。
- **局部修复或重新资格化**：保留仍有效上游，只处理受影响责任和下游。

### 可以交付什么

- 普通 OpenDesk JavaScript；
- 必要的应用操作规则或普通 helper；
- 业务确实需要动态判断时，明确边界和验证方式的 JS / Agent 混合流程。

确定、可验证的步骤优先普通 JS；必要内容判断可以交给受约束 Agent；授权决定仍属于有权主体。

## 2. 需求事实必须怎样保存

所有后续产物都必须能区分：

| 类型 | 含义 | 不允许发生 |
| --- | --- | --- |
| Source | 用户原始要求、已有代码、文档、现场材料等来源 | 后层产物反向改写来源 |
| Fact | 在明确版本和范围下得到支持的事实 | 从“文件存在”外推“运行成功” |
| Unknown | 当前无法确认且可能影响下游的事项 | 用猜测补成事实 |
| Assumption / Proposal | Agent 或设计者提出的解释或方案 | 未验证就升级为 Fact |
| Expected Outcome | 计划或验收期望 | 填入 Actual |
| Actual Observation | 本次真实观察结果 | 由 Expected、历史值或示例倒填 |

自然语言、截图、样例和已有资产都可以作为 Source。用户不需要先写 TaskContract JSON；内部结构化成果必须保留原始来源，并能生成可读视图供纠正。

## 3. 正式需求基线

DREQ 只是需求追溯编号，不是新的 Runtime 状态、Gate 或阶段。

### A. 来源、入口与任务定义

- **DREQ-01｜来源可信与未知显式化**：关键主张必须能追到来源、版本和适用范围；事实、未知、提案、Expected 与 Actual 分开。
- **DREQ-02｜多入口但不互相伪造资格**：Agent 新任务、人工开发和已有资产都可进入，但 Human 资产不能追认为 Agent 示范，历史 PASS 不能冒充本次证据。
- **DREQ-30｜自然语言入口**：用户可以直接给自然语言、截图、样例或资产引用；内部 TaskContract 保留原始语义，并可被人纠正。
- **DREQ-31｜先暴露高影响 Unknown**：较长任务在大量执行前先形成可读计划和关键检查点，优先验证会推翻大量后续工作的未知。
- **DREQ-32｜计划与事实分离**：planned action、actual action、observation、verification 和 planDelta 分开保存；计划外但必要的动作保留真实原因。

### B. 开发链完整性与专业交接

- **DREQ-03｜现有 S1—S12 责任完整**：完整新任务不得用最终代码或最终结果跳过任务定义、真实事实、必要步骤、业务语义、应用工程和独立资格；接续任务只从第一个真实缺口继续。
- **DREQ-04｜专业职责可以独立接续**：每个责任必须有清楚输入、输出、完成条件、失败返回和消费者；新 Agent 不依赖旧聊天也能继续或准确报告缺口。
- **DREQ-12｜设计、执行、案例与证据分离**：WORKFLOW、canonical design、Skill、案例、字段合同和质量记录各自拥有唯一职责，不靠复制正文获得“完整”。
- **DREQ-33｜S7 与 S8—S9 边界**：S7 独占 retain / merge / omit / recovery / unresolved 的原动作取舍；S8—S9 消费 S7，不建立第二套 Raw Action disposition。

### C. 数据、应用工程与代码

- **DREQ-05｜生成与代码改进分离**：recipe-build 负责构建 Candidate；code-rebuild 只在有真实收益时按需改进，也允许原样保留。
- **DREQ-06｜实际数据流完整**：现场读取值必须真实进入后续 consumer；Expected、默认答案、历史值和示例常量不能替代运行时 producer。
- **DREQ-07｜最小应用认识与能力复用**：只认识当前任务必需的应用对象和规则；优先复用经过确认的 API / helper；一次坐标不能升级成长期 Target identity。
- **DREQ-18｜能力粒度按业务目的组织**：框架原语、应用语义操作、组合能力和完整流程按输入、输出和可验证目的组织，不按动作数、文件数或 Agent 数组织。
- **DREQ-20｜跨应用数据一致性**：跨应用传递必须保留来源对象、实际值、必要转换、目标对象和结果；剪贴板、旧焦点或历史状态不能代替正式数据关系。

### D. 安全、版本与验证

- **DREQ-08｜有界安全执行**：对象、授权、前置、副作用、等待、重试、探索和停止必须受控；动作效果 Unknown 时先核对，不能盲重放。
- **DREQ-09｜用途与风险适配**：单次受控使用、反复复用、长期交付、对外共享和高风险操作采用与声明相匹配的工程和验证强度。
- **DREQ-10｜独立资格验证**：S11 冻结 Candidate 后，S12 对同一源码、依赖、入口和请求范围收集真实资格证据；未运行不能 PASS，具体场景、Fresh Run 和证据要求由 validation-plan 维护。
- **DREQ-11｜版本追溯与最小返工**：需求、事实、Procedure、应用规则、Candidate 和 Qualification 保持版本关系；影响性变化只使真实依赖它的下游失效，不默认返回 S1。
- **DREQ-13｜Research 有界**：未知研究必须说明问题、证据目标、预算和停止条件；研究者不能替用户决定授权或业务偏好。
- **DREQ-14｜隐私与资料生命周期**：最小权限，Secret 只引用，日志和证据按需要脱敏；证据丢失时降低结论，不能保留无法复核的 PASS。
- **DREQ-15｜真实宿主与混合运行分层证明**：Skill 文件存在不等于宿主加载，API 文档存在不等于 Runtime 可用，模型输出必须在进入副作用前经过适用校验。
- **DREQ-16｜每个正式阶段独立验收**：S1—S12 分别判断当前输入、责任、Actual Output、证据、Hard Fail、Unknown 与退出条件；评分公式、门槛和适用证明层只由 validation-plan 维护，本文件不复制第二套算法。
- **DREQ-34｜冻结后再做 Reference Alignment**：参考实现用于冻结 Candidate 之后的独立对照；用户合同和真实证据优先，等价且合规的不同实现允许通过，参考缺陷单列。

### E. 交付、共享与维护

- **DREQ-17｜交付形态服务业务目标**：工作流的价值是减少重复操作和不必要推理，按真实需要交付普通 JS 或有真实接线的混合流程。
- **DREQ-19｜成果可维护、可由他人使用**：共享成果说明用途、输入输出、配置、依赖、权限、支持范围、失败与验证边界，不依赖作者聊天、私有目录、个人凭据或历史窗口。
- **DREQ-23｜同一 Agent 的轻量正常路径**：资料充分时同一 Agent 可以连续推进多个职责，不为每一步强制制造新会话或 handoff；已有有效成果精确复用。

### F. 应用认识、视觉与 Collection

这些是 Agent-to-Recipe 对专项能力提出的业务边界，不是专项算法本身。

- **DREQ-21｜材料充分性分层**：认识、定位、操作需要不同证据强度；模型可以帮助理解，但不能把“看起来像”直接升级为可执行事实。
- **DREQ-22｜同源审阅与纠错**：原始证据、overlay、简化视图和属性差异来自同版数据；修订保留旧版、理由和影响范围。
- **DREQ-24｜应用工程分层评测**：确定性工具、模型提取、规则复用和真实应用消费分别验证，不能互相代替。
- **DREQ-25｜Generic Collection 与业务 Mapping 分离**：底层结构读取只形成有来源的 generic item；sender、price、title 等业务字段由更高层 Adapter / Recipe 解释。
- **DREQ-26｜多源 Observation 保留来源**：AX/UIA、OCR、Layout/Image、Semantic Vision 等来源和冲突都保留；无 usable UI tree 时可以走受控视觉路线，但不能伪造 native 事实。
- **DREQ-27｜Collection 与 Traversal 分离**：当前 viewport 的结构识别不等于跨 viewport 的完整遍历，visible count 不等于 whole collection。
- **DREQ-28｜VLM 默认服务作者期提案**：运行期 VLM 只有在业务明确需要并满足预算、隐私和确定性校验边界时才进入。
- **DREQ-29｜部分完成必须真实保存**：mutation、continuity 不明、timeout、cancel 或预算耗尽时保存 partial 和 stop reason，不静默拼成完整成功。

Structured Collection、VLM、Accessibility traversal、Recorder 等具体算法统一由其专项设计拥有，本文件只保留上述需求边界。

## 4. 明确不属于本工作流需求的扩张

以下内容不能因为“文档不好放”或“某个案例用过”就升级成 Agent-to-Recipe 的全局前置条件：

1. **不新增 S13 来安置文档、检查器或交付动作。**
2. **普通 Recipe 生成不要求新建 Workflow DSL。** 这里指另造一套专门描述 Recipe 的语言。
3. **普通 Recipe 生成不要求新建 IR。** 这里指先把工作流转换成另一套中间程序表示。
4. **普通 Recipe 生成不要求新建 Compiler。** 编译器式的静态或语义检查可以存在，但它是质量工具，不是新的业务阶段或新编程语言。
5. **普通 Recipe 生成不要求新建 Replay Runtime。** 最终仍优先交付普通 OpenDesk JavaScript。
6. **Catalog、商城、Registry、LangGraph 等平台设施不是所有 Recipe 的强制前置条件。**
7. **单个 Calculator、聊天或 Collection 案例不能自动升级成全局限制。**
8. **Skill 文件、checker PASS、Runtime 成功和业务 Qualification 不能互相冒充。**

## 5. 用途、风险与验收强度

| 用途 | 需求上必须保证 |
| --- | --- |
| 单次受控使用 | 正确对象、实际结果、失败和安全边界；不宣称通用复用 |
| 反复复用 | 重新取数、合法变化输入、支持范围和失效条件 |
| 长期交付 | 依赖、版本、诊断、维护和回归边界 |
| 对外共享 | 新使用者可独立配置；敏感信息和私有上下文不随资产泄露 |
| 高风险操作 | 无论脚本多短，都必须满足对应授权、确认和副作用控制 |

具体怎样证明这些声明，由 validation-plan 定义。

## 6. 需求变化怎样处理

当 Source 或 Requirement 变化时，只做影响分析：

~~~text
Source / Requirement
→ 受影响的 S1—S12 责任
→ 受影响的业务/应用/代码成果
→ Candidate
→ Qualification
~~~

未受影响的真实历史事实继续保留；依赖旧语义的下游重新检查。

本文件不维护版本迁移日志、当前测试数、某轮模型表现或某 commit 的质量状态。需要设计演变看 Git history；需要当前实测状态看 docs/quality/。

## 7. 读完本文应该能判断什么

一个第一次接触的人应能回答：

1. Agent-to-Recipe 为什么存在；
2. 它必须保证哪些业务、数据、安全、复用和验证性质；
3. 哪些内容只是实现这些需求的方法，不应该反写成需求本身；
4. 为什么 Expected 不能冒充 Actual；
5. 为什么最终结果正确不能倒证早期执行正确；
6. 为什么不需要为了修一个下游错误重跑全部 S1—S12；
7. 为什么专项算法、评分公式、CLI 和 checker 细节应该去各自 owner 阅读。
