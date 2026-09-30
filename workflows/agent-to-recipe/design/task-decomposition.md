---
title: "Agent-to-Recipe｜工作流任务分解树"
description: "用 S1—S12 展开 Agent-to-Recipe 必须完成的业务任务、输入输出、完成条件与失败回流。"
order: 30
---

# Agent-to-Recipe｜工作流任务分解树

本文只回答一个问题：

> **把真实任务、人工开发目标或已有自动化资产，转成可验证、可维护的 OpenDesk 自动化成果，完整需要做什么？**

## 先看这里：30 秒理解整个任务树

```text
真实任务 / 人工开发目标 / 已有自动化资产
  ↓
Ⅰ. 明确任务并取得可信执行事实
   S1 任务与计划
   S2 最小应用认识
   S3—S5 执行 → 观察 → 判断
   S6 任务级证据收口
  ↓
Ⅱ. 从真实经历提炼必要业务过程
   S7 必要步骤
   S8 业务语义与步骤
  ↓
Ⅲ. 从单次过程形成可复用规格
   S9 参数、数据依赖、分支与支持范围
  ↓
Ⅳ. 从规格形成可运行候选
   S10 应用操作工程化
   S11 普通 JavaScript / Candidate
  ↓
Ⅴ. 独立验证并形成资格结论
   S12 Qualification / Repair / Promote
```

开发工作流结束后，业务运行消费已经交付的 Recipe；**不会每次运行都重新走 S1—S12**。

## 一页阶段地图

| 阶段 | 核心问题 | 主要输入 | 主要输出 | 最低完成条件 |
| --- | --- | --- | --- | --- |
| **S1｜任务与计划** | 用户真正要完成什么，允许做什么，怎样算成功 | 原始要求、已有材料、业务输入、授权与限制 | **TaskContract + WorkPlan** | 目标、对象、成功/失败、授权、关键 Unknown、操作计划均有来源 |
| **S2｜最小应用认识** | 下一步能否安全找到、读取和操作正确对象 | TaskContract、WorkPlan、已有 AppProfile、现场观察 | **最小 AppProfile / 精确复用引用** | 足以支持近期动作；未验证项明确，不能把“看见界面”当成“允许操作” |
| **S3—S5｜执行微循环** | 实际发生了什么，结果是否符合预期，下一步是否安全 | 生效计划、AppProfile、获准输入 | **Raw Trace / Experience Unit / Evidence / planDelta** | planned 与 actual 分开；动作、观察、业务值、消费者、副作用可追溯 |
| **S6｜示范收口** | 本次真实任务到底完成、失败还是仅局部成立 | S3—S5 的实际事实 | **Demonstration Dossier** | 最终业务结果、范围、证据强度、未决项和副作用状态明确 |
| **S7｜必要步骤** | 哪些动作真正必要，哪些只是探索、绕路或恢复 | 合同/计划、Dossier、Raw Trace、Evidence | **DistilledSteps** | 每项原始动作有保留/合并/省略/恢复/未决处置，并保留数据依赖 |
| **S8｜业务语义** | 必要动作在业务上分别意味着什么 | DistilledSteps、TaskContract、必要 AppProfile | **Business Steps / 语义映射** | 每步目的、对象、输入输出、前后条件、验证与消费者明确 |
| **S9｜复用规格** | 哪些值应参数化，数据怎样流动，支持哪些变化 | Business Steps、补充证据、能力选择事实 | **SemanticProcedure** | 参数、运行时值、配置、Secret、分支、循环、恢复、范围有来源 |
| **S10｜应用工程化** | Procedure 需要的定位、读取、等待、动作怎样可靠落实 | SemanticProcedure、AppProfile、具体工程缺口 | **加固后的 AppProfile / helper / 局部验证** | 必要操作可落实，适用范围和失效条件明确；无缺口则精确复用 |
| **S11｜候选实现** | 怎样忠实实现已确认过程，而不重新发明业务逻辑 | Procedure、AppProfile/helper、正式 API 合同 | **Recipe.js + CandidateManifest** | 候选字节、入口、依赖、上游版本、步骤映射和支持范围冻结 |
| **S12｜独立资格** | 固定 Candidate 在声明范围内是否真的成立 | 冻结 Candidate、TaskContract、场景、环境、授权 | **QualificationRecord + 最终结论** | 实际运行同一候选；requested 范围逐项有 pass/fail/not-run/blocked 与证据 |

## 求解策略空间与阶段的接线

[自动化求解策略空间](../../../docs/frameworks/automation-problem-solving-framework.md#strategy-space)是各阶段按需调用的方法地图，不是新阶段。本表只说明消费责任，不在任务树复制选型、切换或兼容的完整正文。

| 阶段 | 本阶段怎样使用方法空间 | 保持的责任边界 |
| --- | --- | --- |
| S1 | 判断任务形态、业务对象、子目标、风险、数据依赖与高影响 Unknown | 不预填未知现场、未来操作或最终代码 |
| S2 | 选择近期观察/操作候选，按[能力发现](capability-discovery.md)取得契约与最小现场依据 | 不要求先有完整 Procedure、多个策略或最终 JS |
| S3—S6 | 执行、观察、判断并保存实际选择、实际效果与副作用状态 | 计划和待验证方法不能冒充本次事实 |
| S7—S9 | 保留必要路径，收敛有来源的业务过程、能力选择与复用范围 | 不从参考代码倒造选择历史，不重做原动作取舍 |
| S10 | 按[应用操作方法](application-operations.md#operation-strategy)落实条件化策略、范围、局部验证与停止规则 | 若改变 S9 固定选择，带来源交原责任更新精确引用；资料漏交找协调者 |
| S11 | 按 [recipe-build](../skills/recipe-build/SKILL.md)实现已批准操作和选择；按需求内联、抽 helper 或使用已支持模块 | 不临时发明业务策略、未验证 fallback 或模块能力 |
| S12 | 核验同一候选的实际路径、数据、正常行为及所请求的变化/失败范围 | 不以范围外拒绝冒充兼容，不由局部测试外推整项资格 |

策略、App Adapter、模块不是每个任务的必备产物。使用既有 Profile/规则/helper/manifest 与逐阶段审阅，不增加并行注册表或评分制度。副作用 unknown、部分完成与安全切换统一见[应用操作切换判定](application-operations.md#strategy-switching)。

## 全局原则

1. **先按业务语义拆任务，不按 Agent、Skill、文件或 API 名称拆任务。**
2. **事实、解释、规格、代码、资格是不同证明层，不能互相替代。**
3. **Expected Outcome 与 Actual Observation 分开保存；期望不能补成事实。**
4. **已有合格成果优先精确复用，只从第一个真实缺口继续。**
5. **确定且可验证的步骤优先普通 JS；必要内容判断交 Agent；授权决策交有权的人。**
6. **阶段 ≠ Skill ≠ 文件 ≠ Agent。** 同一 Agent 可以连续完成多个阶段，一个 Skill 也可以服务多个阶段。
7. **失败按责任定向返回，不无条件回到 S1，也不靠降低标准继续。**
8. **专项技术只在其权威文档维护。** 本任务树只保留该能力对业务任务的必要要求。

# 主任务树

## Ⅰ. 从任务要求到可信执行依据

### S1｜确定业务合同、任务树和操作计划

**目标**

把用户原始要求转成可审阅、可执行、可验证的任务定义，同时保留来源和未知项。

**输入**

- 用户自然语言、截图、样例或已有资产。
- 已知业务输入、环境、授权、预算与限制。
- 已有 TaskContract、WorkPlan、Recipe、Qualification 等可复用成果。

**必须完成**

1. 保留用户原始来源，分开记录：
   - 用户明确要求；
   - 已核实事实；
   - Unknown；
   - Agent Proposal / Assumption；
   - Expected Outcome。
2. 明确业务对象、目标结果、输入、输出、禁止结果和成功/失败标准。
3. 明确允许对象、允许动作、禁止动作、人工确认、隐私、Secret 与不可逆副作用边界。
4. 按业务子目标和数据依赖建立粗粒度任务树，不预编造未知现场的点击细节。
5. 对较长任务形成可读的 Operation Plan：
   - 当前对象；
   - 主要动作；
   - 输入来源；
   - 预期结果；
   - 检查点；
   - 高影响 Unknown；
   - 对近期高影响步骤做**有界反方预演**：记录少数最可能且代价高的失败方式、执行前低成本否证办法、动作后第一验证点和停止边界。目标身份碰撞、读错来源、旧状态残留、重复副作用、对象漂移和关键运行时数据断链应优先考虑；不要求穷举所有理论错误。
6. 选择真实入口并记录来源：
   - Agent 新示范；
   - 人工正向开发；
   - 已有资产接续。
7. 已有成果先核版本、范围和证据，只从第一个真实缺口继续。

**输出**

- TaskContract
- WorkPlan / Operation Plan
- 初始业务任务树
- 高影响 Unknown 与阻塞项

**完成条件**

目标、授权、成功标准、关键依赖和近期计划没有互相冲突；下游无需猜测用户真正想完成什么。

**失败返回**

仍属于 S1：目标、授权、成功标准、工作范围或计划本身不清楚。不能通过后续代码或测试倒推用户意图。

---

### S2｜建立足以推进下一步的最小应用认识

**目标**

只获得近期动作真正需要的应用、窗口、页面、目标、读取和前提知识；不从零研究整个软件。

**输入**

- 固定 TaskContract / WorkPlan。
- 可复用 AppProfile、应用规则或历史证据。
- 获准的现场观察。

**必须完成**

1. 核对系统、应用、窗口/Surface、账号、业务对象、焦点、弹窗、权限和可见状态。
2. 确认近期步骤需要操作/读取的区域、目标、状态和结果位置。
3. 在自行设计低层 Locator、Accessibility traversal、Geometry、Coordinate 等实现之前，先按近期动作从 [Agent API 阅读入口](../../../docs/api/agent/README.md) 发现已有执行能力；按“能力目录 → 候选方法 → 选中方法 canonical contract → 当前环境验证”推进，具体方法见 [capability-discovery.md](capability-discovery.md)。如果问题已经转为“这个应用本身怎样建立 Window / State / Region / Target 认识”，再按需参考 [App Development Framework](../../../docs/frameworks/app-development-framework.md)。这里只发现足够推进下一动作的能力，不通读整个 API 或整个应用。
4. 区分：
   - 对象身份；
   - 外观线索；
   - 当前 Geometry；
   - 可执行定位依据。
5. 先核查会阻断大量后续工作的高影响可行性，例如关键结果能否可靠读取。
6. 有效旧知识直接复用；只有新页面、布局冲突、对象歧义或规则失效时才定向补认识。
7. 认识事实不足时明确补采问题，不猜测；认识界面本身不产生新的操作授权。
8. 若任务涉及重复列表/表格/时间线等结构，只在此记录“业务需要读取什么、当前认识范围和未决工程项”；具体识别、滚动、连续性等算法按专项文档处理。

**输出**

- 最小 AppProfile，或仍有效旧版本的精确引用。
- 近期动作所需的定位/读取依据。
- 未验证项、限制和必要 planDelta。

**完成条件**

下一阶段需要操作和读取的关键对象有依据；未知项不会让即将执行的动作越权或盲目。

**失败返回**

- 应用身份、目标或读取方式不可靠：留在 S2。
- 新事实推翻任务路线或授权：回 S1。

---

### S3—S5｜执行、观察、判断的微循环

**目标**

在真实任务中同步保存“计划做什么”和“实际发生什么”，并在每个关键动作后决定继续、修订、恢复或停止。

#### S3｜执行当前获准动作

- 绑定当前 planned step、业务子目标、目标依据、预期状态变化和风险。
- 执行当前获准动作；探索、人工接管、已有脚本或替代路径都记录真实执行者与原因。
- 同步保存动作请求、工具回执／原始返回、时间、窗口身份和证据引用；动作后的业务 observation 及其 pass / fail / uncertain 判定由 S4 负责，S3 不提前代判。
- 关键运行时值立即保存其**真实来源、消费者、有效条件**；不能把 expected 值写成现场读值。
- 写操作、发送、提交或其他副作用结果不明确时，不直接重复执行。

#### S4｜观察并验证实际效果

- 重新观察，区分：
  - 动作返回；
  - 目标是否命中；
  - UI 是否变化；
  - 业务结果是否成立。
- 对照 expected outcome 保存 actual observation，标记 pass / fail / uncertain。
- 核对变化是否属于正确业务对象，并考虑加载延迟、其他操作和外部变化。
- 没观察到某状态不等于状态为 false；工具成功也不等于业务成功。

#### S5｜分类并决定下一步

- 标记当前片段属于正常业务、setup、verification、exploration、retry、recovery、off-task 或 error。
- 计划外但事实证明必要的读取、导航、准备或验证，要保留原因并修订后续计划。
- 未执行步骤不能补写成已发生事实。
- 可安全重试时有界重试；副作用结果未知、身份歧义、越权或预算耗尽时停止。
- 目标、输入来源、主要路线或关键检查点变化时产生 planDelta，不覆盖过去事实。

**持续输出**

- Raw Trace
- Experience Unit
- Evidence
- Runtime values 及 producer → consumer 关系
- planDelta / recovery 记录

**完成条件**

关键动作、关键读值和关键结果均可追溯到真实观察；planned / actual 没有混写。

**失败返回**

- 缺现场事实：定向补采 S3—S5。
- 新页面或应用规则失效：S2 / S10。
- 目标或授权变化：S1。
- 代码实现问题：S11。
- 关键副作用 unknown：先对账/停止，不继续依赖它的写操作。

---

### S6｜用任务级证据关闭本次示范或补采

**目标**

回答“这次真实任务最终发生了什么”，并冻结可供下游消费的事实包。

**输入**

S1—S5 的合同、计划、实际动作、观察、数据流、证据和 planDelta。

**必须完成**

1. 汇总初始状态、最终状态、环境、实际数据流和证据索引。
2. 核对最终业务对象、业务结果、副作用和证明强度。
3. 明确本次结论：
   - 完整成功；
   - 失败；
   - 局部完成；
   - inconclusive。
4. 事实只声明实际覆盖范围；局部观察不能升级为全局事实。
5. Agent 示范、人工开发、参考执行和已有资产接续保持真实来源，不互相冒充。
6. 区分两个里程碑：
   - 本次真实业务任务完成；
   - 可复用自动化资产已生成并资格化。

**输出**

- Demonstration Dossier
- 冻结的 Raw Trace / Evidence 引用
- 实际数据流
- 未决问题与本次覆盖范围

**完成条件**

S7 可以仅凭固定输入判断“实际发生过什么”，而不需要依赖聊天记忆或事后猜测。

## Ⅱ. 从执行经历到可解释的必要业务过程

### S7｜重建、分段、取舍并发布 DistilledSteps

**目标**

把原始执行经历提炼成“完成任务真正需要的步骤”，去掉噪声但不丢失必要前提、读取、验证和数据依赖。

**输入**

- TaskContract / WorkPlan
- Demonstration Dossier
- Raw Trace / Evidence
- 必要 AppProfile

**必须完成**

1. 重建当时的输入、状态、目标、动作和结果，区分事实、当时判断和事后解释。
2. 将低层事件合并成可理解片段，但不制造原本不存在的动作。
3. 对每个原始 action/片段给出：
   - retain；
   - merge；
   - omit；
   - recovery；
   - unresolved。
4. 保存取舍理由和 sourceActionRefs；机械重复不能自动视为噪音。
5. 保留必要的状态准备、读取、等待、验证、实际 producer → consumer 关系。
6. 正常路径与异常/恢复经验分开。
7. 事实不足时提出定向补采，不能用语言推理补齐隐藏历史。

**输出**

- versioned DistilledSteps
- Omission Log
- Recovery Candidates
- unresolved items
- 同版可读审阅视图

**完成条件**

每个必要步骤有来源；每个被删除/合并动作有理由；关键运行时值及其消费者仍可追溯。

**失败返回**

- 缺真实事实：S3—S6。
- 动作取舍错误：留在 S7。
- 原任务定义错误：S1。

---

### S8｜把必要步骤转成业务步骤和语义交接

**目标**

说明每个必要步骤“在业务上做什么、为什么做、输入从哪里来、输出给谁”。

**输入**

DistilledSteps、TaskContract / WorkPlan、必要 AppProfile 与证据引用。

**必须完成**

1. 将必要操作片段转成稳定 Business Step，不按点击次数或函数长度分段。
2. 为每步明确：
   - 业务目的；
   - 正确对象；
   - 输入与来源；
   - 前置条件；
   - 执行意图；
   - 输出；
   - 后置条件；
   - 验证；
   - 副作用；
   - 失败/重入边界；
   - 下游消费者。
3. 区分应用语义操作、组合业务能力和完整业务流程。
4. 跨应用步骤明确源对象 → 转换 → 目标对象的真实数据关系。
5. 保持 Business Step → DistilledSteps → 原始 action/evidence 的来源链。
6. 原始 action 取舍有问题时回 S7，不在 S8 建第二套历史真相。

**输出**

- 稳定 Business Steps
- 业务对象与数据交接关系
- 语义缺口 / 工程缺口

**完成条件**

下游能够理解“业务过程是什么”，而不是只看到鼠标/键盘动作序列。

## Ⅲ. 从单次业务过程到有依据的复用规格

### S9｜泛化、补证并批准 SemanticProcedure

**目标**

把单次成功业务过程提升为有证据支持的复用规格，同时限制不能证明的范围。

**输入**

Business Steps、DistilledSteps、TaskContract、必要 AppProfile、补充证据与能力选择事实。

**必须完成**

1. 正确分类关键值：
   - 用户输入；
   - 运行时读取值；
   - 配置；
   - Secret；
   - 状态；
   - 不变量；
   - 派生值；
   - Expected；
   - Unknown。
2. 为每个运行时值明确真实 producer、consumer、有效条件和重新获取要求，禁止把示范答案固化成生产常量。
3. 将具体对象提升为有依据的选择规则，将固定文本提升为参数，将偶然状态限制为适用条件。
4. 建立状态转换、顺序、条件、分支、循环、Completion、Retry、Recovery 和 Checkpoint。
5. 单次示范不能证明的变化标为待补证或不支持；只补最小必要证据。
6. 为每步选择实现责任：
   - 普通 JS；
   - 必要 Agent 判断；
   - 人工授权/确认。
7. Agent 判断点必须有明确输入、结构化输出、校验、预算、失败和人工接管边界。
8. 能力/API 选择只保存可复核事实和实际验证状态，不把“文档存在”当成运行通过。

**输出**

- SemanticProcedure
- 参数与数据依赖
- supported / unsupported scope
- capability decisions
- 待 S10 工程化事项

**完成条件**

S10/S11 不需要重新猜业务含义；Procedure 中每个关键参数、数据边和分支均有来源。

**失败返回**

- 业务解释错误：S8—S9。
- 动作取舍错误：S7。
- 缺事实：S3—S6。
- 应用工程证据不足：交 S10，不通过改业务语义绕过。

## Ⅳ. 从规格到可独立运行的普通程序

### S10｜定向工程化应用操作

**目标**

只把 SemanticProcedure 真正需要的定位、读取、等待、动作、验证和恢复落实为可靠应用规则。

**输入**

SemanticProcedure、已有 AppProfile / helper、实际失败证据或工程缺口。

**必须完成**

1. 优先复用仍有效规则；无缺口不重新研究应用。
2. 生产操作工程化前，按当前版本重新核对 [Agent API 阅读入口](../../../docs/api/agent/README.md) 与 selected canonical contract。若现有高层公开 API 已完整保留 target identity、parent/window scope、唯一性、读取语义、失败/partial/unknown 行为和副作用边界，则优先复用；只有关键约束无法表达、需要额外结构化预检或已有证据证明不适用时，才保留有依据的低层组合。方法边界见 [capability-discovery.md](capability-discovery.md)，应用建模按需参考 [App Development Framework](../../../docs/frameworks/app-development-framework.md)。
3. 将 Procedure 需要的操作落实到 Target、Locator、当前 Geometry、Read、Wait、Action、Verifier、Recovery 等必要能力。
4. 核对对象唯一性、父区域/锚点、状态准备、等待、后置观察和安全停止；对 clear / reset / 模式切换等状态准备，必须用可观察判据或区分性反例证明后续依赖不再受旧状态影响，不能以单个显示值、动作回执或未观察的内部状态假设推断“完整 reset”。
5. 记录规则适用范围、失效条件和缓存/重新观察条件。
6. 新规则或修复必须有对应证据和局部验证。
7. 真正 Runtime primitive 缺口作为独立能力问题记录；不能靠改变业务目标或虚构 API 绕过。
8. 重复 UI、Structured Collection、VLM、Traversal 等专项细节只引用其权威架构，不在本任务树复制算法。

**输出**

- 加固或修复后的 AppProfile
- 必要 helper / locator / stability rules
- 局部验证证据
- 精确 Runtime 能力缺口（如存在）

**完成条件**

S11 所需应用操作已经有可执行依据，或明确阻塞在真实能力缺口。

**失败返回**

应用规则问题留在 S10；若新证据否定业务对象/语义，则返回相应 S3—S9 责任阶段。

---

### S11｜生成或登记普通 JavaScript，并冻结 Candidate

**目标**

把已确认的业务 Procedure 和应用规则忠实实现成可独立调用的普通 OpenDesk JavaScript。

**输入**

固定 SemanticProcedure、AppProfile / helper、正式 API contract、已有代码基线（如有）。

**必须完成**

1. 先判断来源：
   - 已有合格脚本：原样采用；
   - 已确认缺口：最小修复；
   - 无代码：依据已批准过程生成。
2. 生产代码必须消费真实运行时值，不把 expected、示范读值、历史坐标或旧截图写成当前事实。
3. 分离配置、Secret、业务输入、运行时读值和测试 Oracle。
4. 检查异步顺序、等待、目标重定位、显式错误、副作用边界和停止条件。
5. 简单合格代码不强制“为了优化而优化”；确有独立质量收益时才进入 [code-rebuild](code-rebuild.md)。
6. 固定：
   - 源码字节/hash；
   - 入口；
   - 工作目录；
   - 依赖；
   - API refs；
   - 上游版本；
   - Business Step → 代码区域映射；
   - 支持范围。
7. 代码实现不能自行修正上游语义或应用规则；发现缺口按责任返回。

**输出**

- Recipe.js
- CandidateManifest
- source mapping
- 依赖与运行说明
- 必要重验范围

**完成条件**

Candidate 已冻结，S12 可以在不让生成者修改候选的情况下独立运行和评价。

**失败返回**

- 代码实现错误：S11。
- 业务语义错误：S8—S9。
- 应用规则错误：S10。
- 缺真实事实：S3—S6。

## Ⅴ. 从候选到合格、可维护的自动化资产

### S12｜独立资格验收、定向修复与晋级

**目标**

固定同一个 Candidate，用预先确定的范围和场景判断它真实完成了什么，并形成可追溯资格结论。

**输入**

冻结 Candidate、TaskContract、requested scope、场景、环境、测试授权和独立 Oracle。

**必须完成**

1. 核对实际候选字节、入口、依赖和运行条件，不能拿参考脚本替代。
2. 运行前固定 requested scope / scenarios；验收过程中不能为了通过而缩小范围或修改标准。
3. 使用新 execution 和新现场观察，不消费示范答案充当运行事实。
4. 按风险与声明选择必要层级：
   - 结构/静态；
   - Fresh Run；
   - 合法变参；
   - 旧状态/扰动；
   - 目标缺失或歧义；
   - 恢复/停止；
   - 端到端业务结果。
5. 同时检查：
   - 真正执行了什么；
   - 真实数据如何 producer → consumer；
   - 最终业务结果是否成立。
6. 每项记录 expected、actual、evidence、pass/fail/not-run/blocked、局限和修复责任。
7. Qualification 只绑定当前 Candidate 和实际证实范围；Candidate 改变后旧资格不能继承。
8. “一次成功”“可重复运行”“参数化可复用”是不同声明，必须使用相应证据。
9. 请求范围内存在 fail/not-run/blocked 时不能通过移动到 excluded 获得整体 PASS。

**输出**

- QualificationRecord
- Recipe Review / Run Summary
- qualified / excluded / not-run / blocked 范围
- 修复请求或晋级结论

**完成条件**

结论能够回答：**哪个固定候选，在什么环境、什么场景、什么范围，被怎样运行和观察后，证明了什么。**

## 验收失败后的定向返回

| 失败类型 | 返回 |
| --- | --- |
| 目标、授权、成功标准、操作计划错误 | **S1** |
| 应用身份、定位、读取、等待、规则失效 | **S2 / S10** |
| 缺真实动作、读值、结果或副作用事实 | **S3—S6** |
| 必要动作取舍、合并、省略错误 | **S7** |
| 业务步骤、参数、数据依赖、复用语义错误 | **S8—S9** |
| Candidate 实现错误 | **S11** |
| Oracle、验收场景或证据设置错误 | **S12 修正验收并重验** |
| 真正 Runtime primitive 缺失 | **独立 Runtime 能力任务；阻塞受影响范围** |

原则：**从第一个真实受影响点继续，不默认从零开始。**

## 三个闭环

### Execution Loop｜执行闭环

Plan / Observe → Understand → Act → Verify → Recover / Revise / Stop

- S1 给出计划。
- S2 补足近期可行性。
- S3—S5 维护 planned / actual。
- S6 用任务级证据收口。

### Learning Loop｜学习闭环

Capture → Reconstruct → Distill → Ground → Abstract → Synthesize

- S7 从事实发布 DistilledSteps。
- S8 建立 Business Steps。
- S9 形成 SemanticProcedure。
- 缺依据就补证，不允许 Raw Trace 直接跳成 JS。

### Reliability Loop｜可靠性闭环

Generate → Freeze → Replay → Verify → Diagnose → Repair → Revalidate → Promote

- S10 工程化应用操作。
- S11 冻结 Candidate。
- S12 独立验收并按责任返修。

## 工件关系

```text
用户原始来源
  ↓
TaskContract / WorkPlan
  ↓
AppProfile
  ↓
Raw Trace / Experience Unit / Evidence
  ↓
Demonstration Dossier
  ↓
DistilledSteps
  ↓
Business Steps / SemanticProcedure
  ↓
Recipe.js / CandidateManifest
  ↓
QualificationRecord
```

必须始终区分：

- **计划**：准备做什么。
- **事实**：实际发生什么。
- **语义**：为什么这些步骤构成业务过程。
- **规格**：哪些规则可以复用。
- **代码**：怎样实现已确认规格。
- **资格**：固定候选在什么范围真实通过。

## 专业职责映射

当前专业职责以 [WORKFLOW](../WORKFLOW.md) 和[链路设计](chain-design.md)为准；这里只给任务树所需的最小映射：

| 阶段 | 主要职责 |
| --- | --- |
| S1 | automation-plan |
| S2 | application-engineer / discover |
| S3—S6 | task-demonstrate |
| S7 | trace-distill |
| S8—S9 | procedure-synthesize |
| S10 | application-engineer / harden / repair |
| S11 | recipe-build；必要时 code-rebuild |
| S12 | recipe-qualify |

这张映射不是多 Agent 拓扑。默认同一 Agent 可以连续推进；正式交接时才固定输入版本、范围和证据。

## 本文不维护的内容

为防止任务树再次变成“所有内容的集合”，以下内容只保留引用，不在本文复制正文：

| 内容 | 权威位置 |
| --- | --- |
| 项目来源、需求基线、设计需求 | [requirements.md](requirements.md) |
| 职责、路由、工作包、输入输出组合 | [chain-design.md](chain-design.md) |
| 阶段交接、拒绝反例、检查责任 | [acceptance-map.md](acceptance-map.md) |
| 行为案例、测试空间、评分与验收计划 | [validation-plan.md](validation-plan.md) |
| 应用认识、定位、操作工程方法 | [application-operations.md](application-operations.md) |
| S11 独立代码质量改进 | [code-rebuild.md](code-rebuild.md) |
| Structured UI Collection Reading 的 Runtime / VLM / Traversal 细节 | [专项架构](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md) |
| Recorder / Compiler / IR 专项 | [Recorder 架构](../../../docs/architecture/desktop-automation/agent-first-recorder.md) |
| 字段、版本、handoff、gate 合同 | [共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md) |
| 当前 Skill/宿主/测试/业务资格状态 | [WORKFLOW](../WORKFLOW.md)、[交接审阅地图](acceptance-map.md)及 docs/quality 下对应报告 |

历史 R1—R13 讨论视图、旧版本迁移说明和已纠正的实现争议不再作为当前任务树正文维护；需要设计考古时使用 Git 历史。当前唯一阶段编号是 **S1—S12**。

---

## 附录｜基线状态与文档边界

任务分解基线：v0.8，2026-09-27。本文沿用 S1—S12，不新增阶段，不承担专项 Runtime 设计、Skill 实现状态、质量报告或历史迁移记录。字段与版本规则以[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)为准；整体执行入口见 [WORKFLOW](../WORKFLOW.md)。
