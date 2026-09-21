---
title: "Agent-first Recorder｜链路、职责与成果交接设计"
description: "定义 Agent-to-Recipe 的职责分配、输入输出、路由与成果交接。"
order: 40
---

# Agent-first Recorder｜链路、职责与成果交接设计

状态：链路设计 v0.8，2026-09-22 对齐八个正式方法包与来源感知路由，保留 2026-09-13 的 Capability 接线及后续验证切片。本文把[需求](requirements.md)与[完整任务树](task-decomposition.md)转成环节关系；当前八项专业职责均已有同名方法文件，但宿主加载、独立上下文行为、真实桌面与业务资格仍分别验证；本文不是完整运行调度器，也不新增可执行 IR。Structured UI Collection Reading 的详细合同只维护在[专项架构](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。返回[设计总纲](README.md)。

跨 Runtime／Catalog／Authoring 的唯一架构与完整生命周期任务树见 [Automation Capability Lifecycle](../../../docs/architecture/desktop-automation/task-capability-lifecycle.md)。本页只维护作者链如何接入和返回；不复制 Catalog 字段、运行状态机或另建 `workflows/conversational-task-runner/`。新增方法与检查不表示通用 Catalog 或发布器已实现。

## 一、需求树／链路／方法三层怎样配合

以下是作者文档的三个职责层次，不是生命周期总纲中的 Runtime／Catalog／Authoring 三个产品责任层。

- 需求与任务树说明必须满足什么、完整需要做哪些事，保留必要的推导、状态、数据与验证节点。
- 链路设计分配职责、输入输出、路由与控制，明确哪里可以独立进入或跳过；一个工作包可以跨多个阶段。
- 正式 WORKFLOW 按本次范围组合专业方法；每个 SKILL.md 只负责自己的步骤，长细节按需参考，不复制三套完整指令。
- 需求 Function、业务 Capability、Agent Skill 与 JS 函数不一一对应；先选已有 API／普通 JS／Agent／人工，再决定是否需要独立 Skill。
- S1—S12 沿用原方法和合同；R1—R13 只是任务树中保留的讨论视图；八项专业职责不是新编号的运行阶段。当前八个 SKILL.md 已经存在，但“文件存在”不等于宿主自动发现／加载、独立 Producer 行为或真实业务资格通过。

当前面向 Agent 的压缩主链如下；只是现有 S1—S12 的交接视图，不增加阶段：

```text
业务任务 / 事实与授权
  → 能力需求
  → Capability Discovery
  → Method Selection
  → Canonical Contract Reading
  → 真实操作 / Runtime Validation
  → Observation / Evidence
  → S7 DistilledSteps
  → S8—S9 SemanticProcedure（业务步骤 + 数据依赖 + capabilityDecisions）
  → S10 Locator / Stability
  → S11 普通 JavaScript + CandidateManifest
  → S12 QualificationRecord
  → Run Summary / Handoff
```

Discovery、Selection、Contract 与 Runtime Validation 是四个不同事实；目录命中不代表已选择，选择不代表已正确调用，合同可读不代表当前应用已验证。最终 Recipe-driving 选择由 Procedure 固定，Candidate 通过 `apiRefs` 与 `sourceMapping.capabilityDecisionRefs` 消费它；旧历史工件缺此字段时保持 provenance unknown，不倒填成当时已发生的事实。
- Structured Collection Reading 作为既有职责间的数据/能力链，不增加第九个开发职责或新的 S13：application-engineer 生产结构知识，Runtime working primitive 读取 generic item，Recipe/Adapter 做业务 Mapping，recipe-qualify 分层验收。
- 默认同一个 Agent 按工作流连续推进；协调、专业作业、生成和检查是职责，不强制创建多个 Agent 或隔离上下文。独立评测是另外的验证条件，不能混为正常运行前提。

## 二、八项目标专业职责及状态

历史六个 Skill 的旧目录已在 `17ccb9258dd34ce8b7c21296339a17f0c46e6586` 删除；当前重新按职责边界形成八个正式方法包：[automation-plan](../skills/automation-plan/SKILL.md)、[application-engineer](../skills/application-engineer/SKILL.md)、[task-demonstrate](../skills/task-demonstrate/SKILL.md)、[trace-distill](../skills/trace-distill/SKILL.md)、[procedure-synthesize](../skills/procedure-synthesize/SKILL.md)、[recipe-build](../skills/recipe-build/SKILL.md)、[code-rebuild](../skills/code-rebuild/SKILL.md)、[recipe-qualify](../skills/recipe-qualify/SKILL.md)。均可显式读取；文件、确定性工具、宿主加载、独立上下文和业务资格分别判断。历史静态切片及固定候选评审见[质量总览](../../../docs/quality/agent-to-recipe-workflow-review-20260919.md)，后续方法补齐不反向扩大旧报告的验证范围。

| 环节与拟责任 | 对应任务节点 | 主要消费 | 主交付与消费者 |
| --- | --- | --- | --- |
| 明确需求、操作计划与范围：automation-plan（方法文件已实现） | S1 | 用户自然语言／样例／已有资产、来源、权限、预算 | TaskContract／WorkPlan、业务任务树、可读任务／操作计划、关键检查点与未知项；供所有相关环节使用 |
| 认识和补强应用：application-engineer（方法文件已实现） | S2／S10 | 所需操作、当前观察、已有 AppProfile；harden 再加确认过程，repair 再加失败依据 | AppProfile、同版审阅／验证、必要 CollectionProfile、helper、操作合同、范围与证据；供示范、提炼、生成和验收按范围使用 |
| 真实尝试与同步留证：task-demonstrate（方法文件已实现） | S3—S6 | 合同、操作计划、最小应用认识、实际输入和桌面操作授权 | planned／actual 对应、节点事实、实际值及消费者、viewport/scroll 等真实副作用、完整或限定范围 Dossier；供提炼或诊断使用 |
| 重建与提炼必要路径：trace-distill（方法已实现） | S7 | 冻结合同／计划、Dossier／Raw Trace、必要 AppProfile 和证据 | DistilledSteps、action retain／merge／omit／recovery／unresolved 取舍与来源；供过程提炼、步骤试执行或诊断使用 |
| 语义化与泛化过程：procedure-synthesize（方法文件已实现） | S8—S9 | DistilledSteps、合同、应用资料、前序 capability 选择／验证证据和补证结果 | SemanticProcedure、Business Step、参数、generic→business 数据依赖、`capabilityDecisions`、traversal need、来源与未决项；供应用补强和生成使用 |
| 生成或登记普通 JS：recipe-build（方法文件已实现） | S11 | 已确认过程、所需操作、实际 API；原样接续按旧合同例外处理 | 实际 JS 与 CandidateManifest；只使用当前真实 API，交按需改进或独立验收 |
| 独立改善已有代码：code-rebuild（方法已实现） | S11 内可选工作／独立入口 | 代码基线、明确需求与改进目标、相关应用规则、允许变更范围 | 原样保留结论，或新候选、变更理由、检查结果和重验范围；交独立验收 |
| 独立资格验收：recipe-qualify（方法已实现） | S12 | 冻结候选及依赖、成功标准、获准场景、真实运行条件 | QualificationRecord、Recipe Review、collection/runtime/business 分层证据和修复请求；交协调者或交付者 |

- automation-plan 先把用户自然语言及来源转成结构化合同和可审阅业务操作计划；用户纠正的是业务含义，不要求编辑 JSON。未知现场只写问题和检查点，不预编造点击坐标。
- 应用发现不要求先取得完整 SemanticProcedure，否则新任务会陷入循环依赖；S2 还应优先核实会阻断后续计划的关键能力，并把新事实形成 plan delta，而不是重新规划整个项目。
- task-demonstrate 的 Capture 与动作、观察、验证同时进行，并保留 planned step → actual action → actual observation → verification → plan delta 对应；不新增一个事后追记 Skill。执行中局部验证不能推迟到最终验收。
- trace-distill 只消费已经冻结的事实和计划，负责 S7 的重建、操作分段、必要路径取舍及来源映射；它不改变 Raw Trace，也不承担 S8—S9 的业务参数化和泛化。
- procedure-synthesize 从 DistilledSteps 开始完成 S8—S9；若发现上游 action disposition 错误，提出 S7 修订，不维护第二套原始动作取舍真相。只有达到约定范围的过程才发布供正常生成消费。
- recipe-build 自身负责基本正确性、必要结构和失败处理；它不是低质量代码生产器。其交付前局部修正不必另调用一次优化。
- code-rebuild 是已有代码需要独立改善时的专业任务，允许不改。应用规则缺失返回应用工程，关键步骤错误返回 trace-distill，业务解释缺失返回 procedure-synthesize，不自行猜测上游。
- 正式验收不修改候选或降低标准。步骤试执行、定位单元检查、生成者自检和独立候选验收可以检查相邻事实，但必须明确被验证对象，不以一个层面的通过替代另一个层面。

### application-engineer 的内部边界

| 入口／子作业 | 前提及正常处理 | 完成出口 |
| --- | --- | --- |
| discover 中的最小发现 | 所需任务、实际观察或获准采集条件；先复用，再检查材料充分性和模型提取 | 足以继续的最小认识，或局部资料与具体补采请求；无须先完成业务提炼 |
| 界面认识与审阅子作业 | 可来自 discover，也可处理 harden／repair 的认识缺口；模型主导，程序校验绘图，按约定核验或人审 | 同版 AppProfile、原始证据和审阅材料；需要重复结构时可含 versioned CollectionProfile；只认识不等于 Runtime/操作/业务通过 |
| harden 中的规则与操作补强 | 已确认过程、旧规则和具体缺口 | 满足指定范围的重新定位、状态准备、读取、等待、动作与后置验证；collection 场景补 profile/traversal requirements，合格部分不重研究 |
| repair 中的定向维修 | 失败现场、旧版本、受影响范围 | 新认识／规则／CollectionProfile 或实际 helper、修改理由及重验请求；不改变业务成功标准 |

`ui-understanding` 仅指内部认识子作业，不新增独立 Skill。Structured Collection 同样不创建第二个 VLM/collection Skill。工作包可只要求认识与审阅，不增加第四种模式。任务驱动与能力建设是范围选择，不改变职责数量。

S8／S9 由过程提炼明确业务步骤、参数、数据流、所需应用操作及复用条件，并把此前已经发生、最终仍被 Recipe 消费的 Capability Discovery / Method Selection / Canonical Contract / Runtime Validation 事实收敛进 `capabilityDecisions`；不复制 API 正文，也不补造未发生的失败。S2 可以提供初步定位/CollectionProfile 候选，S10 将确认要求落实为有依据的应用规则。应用定位与 collection profile 知识唯一维护在 AppProfile／必要 helper，不在 S9 复制第二套规则。

### Structured Collection 的消费链

```text
application-engineer
  → AppProfile.CollectionProfile + reviewed evidence
  → recipe-build / future UI.readCollection consumer
  → generic CollectionItem[]
  → App Adapter / Recipe parser business mapping
  → business objects / downstream steps
  → recipe-qualify
```

需要跨 viewport 时增加一个明确且独立的副作用层：

```text
UI.readCollection(current viewport)
  → scroll traversal orchestrator
  → continuity proof + merge / mutation / end receipts
  → generic collected items
```

`UI.readCollection()`／`UI.collectCollection()` 当前均为架构 Working Contract，不是现有可调用事实；在实现前，recipe-build 只能使用当前仓库真实 Accessibility/Vision/UI/scroll 能力或返回 Runtime 能力缺口。分页/load-more 当前由 App Adapter／Recipe 使用当前真实动作 API负责，不提前伪装成 built-in TraversalStrategy。

### 下游消费的边界

示范可以消费最小认识，执行中仍核对现场并同步留证；trace-distill 消费冻结的计划、Dossier／Raw Trace 和应用术语，只发布有来源的必要路径；procedure-synthesize 消费 DistilledSteps 形成 Business Step 与复用规则；生成消费已经落实的操作规则和实际 API，只有认识材料或关键步骤草案时不能伪装成已有可执行操作；资格验收消费冻结候选及依赖，不继承生产者自报通过。未调用环节不是已通过，局部包不能冒充完整成功示范。

对 collection，`CollectionItem[]` 与 `Conversation[]`／`Message[]`／`Order[]` 等业务对象是两个接口层。业务 parser 的字段命名、规则和失败不回写成 Runtime segmentation truth；Runtime evidence/conflict 也不能被 parser 静默覆盖。

## 三、按需求选择路径

开发入口与交付形态分别选择：以下入口都可在条件满足时产出普通 JS 组合能力或 JS／Agent 混合流程；不是只有完整新示范才能复用能力，也不是混合任务就必须新增一套开发 Skill。运行时业务粒度见[聊天示例](application-operations.md#聊天业务的粒度与组合示例)。

- **完整 Agent 新示范与新生成**
  - 理解自然语言目标并形成可审阅操作计划 → 最小应用发现与关键可行性核查 → 按计划真实执行与同步采集 → 任务级示范收口 → S7 必要路径提炼 → S8—S9 业务语义与复用规则确认。
  - 按缺口补强应用操作 → 生成合格基础代码 → 判断是否需要独立代码改进 → 冻结实际候选 → 独立验收。
  - 请求完整新生成时不能借接续例外绕过成功示范、DistilledSteps／SemanticProcedure 和完整数据关系；发生失败按原因定向返回。
- **人工正向开发**
  - 同一业务合同约束应用试验、行为案例和代码；观察与试运行提供证据。
  - 可在已确认做法下直接形成代码，按需优化并验收，不追认为 Agent 示范。
  - 来源标记与现有 schema 不相容时先补合同设计；在未实现前不能伪填 new-generation-chain。
- **已有资产接续**
  - 冻结来源、需求、范围及实际字节 → 核对现有证据与可变现场 → 原样采用、定向补证或有据修复 → 验收实际候选。
  - 已有 DistilledSteps／SemanticProcedure／AppProfile 有效时直接复用，不从零重新截图或分析 Raw Trace；未改部分不是自动获得新资格，未调用环节不是已通过。
- **已有低质量代码独立改进**
  - 读取已存在的需求与基线，缺少关键目标时只补必要澄清，不重新规划整个项目。
  - 独立改进 → 保留基线或发布新候选 → 受影响范围与声明回归验收。
  - 找不到真实数据来源、关键步骤或应用规则时返回责任环节；不以“保持旧行为”保留已知业务错误。
- **简单受控使用或代码已经合格**
  - 确认本次目标与现场 → 复用已有操作或脚本 → 必要验证 → 限定范围使用。
  - 可不调用深度优化，也不要求为了一个短脚本建立全部应用模型或完整多 Skill 包；仍按所选合同保存必要依据。
  - 只能说明本次受控任务通过，不能称完整 Recorder 新生成链或通用能力通过。
- **局部应用修复／只做验收**
  - 定位失效只修受影响应用规则，再更新候选依赖与回归；不默认重新解释全部业务。
  - 仅验收时直接消费冻结候选、合同和场景，不先重新生成代码。
  - 源码纯结构改进与应用语义改变分开；后者须同步应用依据及验证范围。

### 从 Runtime 进入作者链，再返回可发布能力

普通用户运行已有能力不进入 S1—S12；只有明确的 Gap、维修、扩展或资格／发布需求进入相应作者工作包。Runtime/Catalog 的详细路由与权限规则以生命周期总纲为准。

| 进入条件 | 本链最小处理 | 完成出口 |
| --- | --- | --- |
| 参数歧义、权限／认证／准备条件缺失 | 返回澄清或现有 owner 的 guidance／受控准备，不新建 Recipe | 修正输入或明确受阻；没有新增资格 |
| 已有合格候选，仅缺登记 | 发布者检查固定候选、证据和批准，不重做示范 | 显式发布交接；发布不触发业务执行 |
| 代码未变，仅当前环境未验证或证据不足 | S12 针对固定 Candidate 补证／重验 | 新 QualificationRecord 或明确 blocked，不伪造代码修改 |
| App／layout／locator 变化 | application-engineer repair／harden，复用有效规则，再固定受影响候选 | 新 Candidate、重验范围和必要回归 |
| 相似能力需新参数域／操作 | 修订经授权合同和所需过程，定向应用工程与生成 | 增量候选、qualification delta、相应新发布版本 |
| 完全没有能力 | 先查已有资产，再明确选择 Agent 新示范或转 Human 录制入口 | 有来源的 Candidate 与独立资格，或可接续阻塞包 |
| Runtime primitive 缺失 | 用当前 API／实现证据提出[扩展请求](../../../docs/frameworks/runtime-api-extension-framework.md) | 基础能力完成对应验证后返回原工作包，不绕过 Runtime |
| 动作效果不明／授权不允许 | 核对后果或停止，不把阻塞变成开发绕过 | unknown／blocked 与诊断交接；不自动重放 |

Gap 与 Failure Package 不自动授权探索、录制、模型上传、代码修改、测试或发布。先固定用户目标、成功标准、来源、允许对象／副作用与预算；普通运行确认不沿用为作者授权。结果可能已生效时，在任何真实重演前先核对，而不是从第一步重新执行。

Human 来源继续进入[Human-to-Recipe](../../human-to-recipe/README.md)，其 actions／SemanticBuildPlan／Episode 不改造成虚构的 Agent Dossier。application-engineer 保留现有路径供三条入口共享；discover、harden、repair 按实际知识缺口选择，不复制新的应用工程 Skill。跨来源映射、Candidate 闭包与发布 handoff 唯一遵循[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)第 10 节。

### 可独立接续的最小工作包

这些是工作范围，不是新增阶段或五个新 Skill；同一个已有 attempt 组织能够承载时不额外拆文件。

| 工作包目标 | 输入 | 输出／消费者 | 完成或阻塞条件 |
| --- | --- | --- | --- |
| 明确本次走哪条最小路径 | Gap／Failure／已有资产引用、用户目标和权限 | TaskContract／WorkPlan 或 Human 原 plan 的授权增量；供所需作者职责 | 区分复用、发布、重验、维修、扩展、新生产；关键未决保持 blocked |
| 补足应用操作依据 | 所需操作、旧 Profile／helper、具体失败和获准证据 | 同版 AppProfile／helper／局部验证及影响范围；供示范、构建、重验 | 只认识不能冒充操作通过；无 primitive 时返回扩展请求 |
| 固定可执行候选 | 已确认原生过程、实际 API、有效规则及变化范围 | 普通 JS、CandidateManifest、依赖闭包及 source mapping；供独立资格 | 无来源按钮／数据／fallback 不进入代码；变更产生新候选 |
| 证明候选在声明范围内可用 | 固定 Candidate、标准、场景、测试授权与当前环境 | QualificationRecord、实际证据或 repairRequests；供发布者／责任环节 | Gate 执行实际 production，独立读回；fail/not-run/blocked 不冒充 pass |
| 将合格成果交给普通运行入口 | 精确候选与资格、拟发布范围、持久证据和发布批准 | Catalog 的固定发布引用；供后续 Resolver | 仅在发布门已实现并校验通过时登记；不得自动执行旧请求 |

可复用资产不要求全部重走这些工作包；缺哪个补哪个。qualification delta 消费明确的变更影响、仍有效旧证据、新场景与必要回归，不把旧 pass 直接复制给新 hash。共享 Profile／helper 改变时追踪受影响候选，依赖不明则保守重验；未改变且仍适用的部分继续引用原版本。

### 同一 Agent 的正常与异常路线

```text
读取当前任务、操作计划、资料和规则
→ 已有认识覆盖且当前必要前提成立？
  → 是：复用并继续当前工作
  → 否：定向进入 application-engineer 的相关子作业
→ 按当前 planned step 执行获准动作并同步关键留证
→ 检查实际结果
  → 满足必要后置：继续
  → 计划需要调整但目标不变：记录 plan delta 后继续
  → 不满足或不明：保留现场，按问题归属处理
```

| 情况 | 路由／停止条件 |
| --- | --- |
| 操作计划的目标、输入来源、主要顺序或成功条件错误 | automation-plan 修订 S1；已发生事实不被计划更新覆盖 |
| 已认识页面、窗口平移或数据变化仍在已验证规则内 | 刷新现场／重算当前位置，不必模型重新理解全屏 |
| 已知加载条件未完成 | 依原规则有界等待，不能仅见 Tab 高亮就放行内容读取 |
| 未覆盖的新页面、布局冲突、控件／记录关系歧义、CollectionProfile drift | 返回认识与审阅子作业，仅补必要范围 |
| 定位、准备状态、读取或动作约定失效 | application-engineer harden／repair；已有有效部分保留 |
| AX/UIA/OCR/VLM 多源 evidence 冲突且结构验证无法关闭 | application-engineer 定向补证/修 profile；不以单一来源强行覆盖 |
| Semantic Vision provider unavailable | 若 deterministic evidence 足够则保留其可证明结果；若 VLM 为必要 evidence 则 blocked，不嵌套 `opendesk ai` 代替 |
| scroll 后 continuity 无法证明 | collector/Runtime path 停止并保留 partial；不 text-only dedupe 后继续 |
| collection 在读取期间新增/删除/重排 | `COLLECTION_MUTATED` 或等价结构状态；停止拼接并保留 partial/evidence |
| 关键动作、读值或过去状态缺证据 | task-demonstrate 定向补采；新观察不能冒充过去现场 |
| 原始动作取舍、合并、必要路径或 recovery 分类错误 | trace-distill 修订 DistilledSteps；不在 procedure-synthesize 静默重做一份 |
| business mapping、业务因果、Business Step、参数或复用规则错误 | procedure-synthesize／应用业务 parser 责任；不修改 Runtime profile 或 DistilledSteps 掩盖错误 |
| JS 调用、顺序或错误处理错误 | recipe-build |
| 验收 Oracle 或测试设置错误 | recipe-qualify，不改标准掩盖失败 |
| 目标、权限或成功条件变化 | 停止依赖动作，返回需求负责人 |
| 动作可能生效但结果不明 | 先核对实际效果，不直接换路／重放／重新提交 |

返回的是作业职责，不必更换 Agent。仅图片资料不具备操作映射时，允许继续有限认识和审阅，但依赖坐标的真实操作阻塞。能力建设、详细候选比较和全量诊断不得偷偷加入正常路径。

## 四、工作包需要什么、留下什么

沿用[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)的 request、handoff 和主产物。下面解释交接含义，不复制字段定义。

- 派发前确定子目标、实际输入版本、允许操作、现场前提、预期成果、验证条件、预算和恢复边界。
- 初次规划把用户自然语言来源与 Unknown 转成合同、粗计划和可读操作计划；远期未知显式保留，临近工作包再细化，不凭空填满点击序列。
- 应用工程发布当前所需 states、regions、targets、geometryRules、operations、verifiers 与成熟度；本次观察、界面认识、候选规则、审阅／验证分开。需要重复 UI 结构时在同一 AppProfile 知识层发布 versioned CollectionProfile，当前优先级仍在工作包，不能写成应用永久属性。
- 认识输出使用共享合同定义的 AppProfile 增量版本；新消费者对旧资料缺失项保持未知，旧消费者不认识新版本时拒绝消费，不静默丢失约束。CollectionProfile 是结构知识，不是新增公共 Runtime schema 或第二份 AppProfile。
- 示范过程中逐节点保存 planned step、真实动作、实际读值、来源、消费者、前后状态、验证和副作用；collection scroll 还保存 viewport/continuity/mutation 事实；S6 才发布完整 Dossier。失败或局部包可以诊断，但不能作为成功全链输入。
- S7 发布 versioned DistilledSteps 及同版可读视图：记录必要步骤、sourceActionRefs、依赖、retain／merge／omit／recovery／unresolved 取舍和证据。原始 Dossier／Raw Trace 不被修改；步骤试执行产生新的 execution 事实，不反写成旧示范。
- S8—S9 保留 Business Step、泛化分析与草案，最终发布完整的 procedure.json 及同版可读视图；Procedure 引用实际消费的 DistilledSteps 版本，并对新生成／策略改变的 Recipe-driving API 选择保留轻量 `capabilityDecisions`。视图不成为第二份可执行规格，版本冲突则阻塞消费；历史 Procedure 缺能力选择追溯时明确 unknown，不为兼容而倒填。
- 生成发布实际 JS、入口、工作目录、依赖、支持范围、来源映射和 candidate.json；接口或依赖不存在就返回缺口，不保留貌似可执行的 `UI.readCollection()`/`UI.collectCollection()` 占位调用。
- 代码改进消费候选 A；无需改动继续引用 A，有修改发布候选 B 及差异理由，验收引用 B。不能 B 的代码搭配 A 的 helper hash 或旧资格。
- 验收发布指定候选的场景、实际命令、环境、观察、证据、pass／fail／not-run／blocked 和修复请求；collection 结构读取、collector 和业务 parser 的结论分别记录；正确拒绝的测试通过不能改写业务失败事实。
- 一个子任务可以只发布需要的局部成果，但必须明确覆盖范围；文件格式完整、工作包结束、任务成功与可复用资格分别判断。

正常路径始终保留对象、规则版本、关键证据、实际值、必要验证和未决项；新认识／有影响修改时生成同版审阅视图；异常再展开详细候选或跨环境分析。减少的是冗余，不省略已经要求的人审、授权、真实结果和关键动作前证据。

### 开发交接与业务运行交接

上面的 request／handoff 是生产自动化时的工作包交接；生成后每次“读取历史 → 判断 → 发送”的数据交接可以是普通函数参数与返回对象，不强制每次业务调用重建整个开发任务包。

- S1 声明本次需要单项操作、组合能力还是完整流程，以及纯 JS 或混合交付目标；S7 固定必要路径，S8／S9 确定可复用子目标与真实数据依赖；S11 明示实际调用与接线；S12 验证声明的业务范围。
- collection 业务运行至少交清：validated generic `CollectionItem[]` + coverage/evidence → App Adapter／Recipe parser → business objects + parser validation → downstream consumer。不能直接让 Runtime/VLM 根据任意业务 schema 生成最终对象。
- 混合运行至少交清：JS 读取的实际业务数据及对象绑定 → Agent 的必要输入、业务规则和预算 → 可校验的判断与候选内容 → 授权及新鲜度复核 → 获准 JS 动作 → 实际结果。每一箭头有消费者、允许数据和失败出口。
- provider／宿主未接入、输入不足、判断非法、预算耗尽或上下文过期时，停止依赖动作或按已授权策略转人工；不能用 mock、默认文案或上次判断掩盖缺口。JS 逻辑、判断质量、接入和端到端业务分别验证。
- 跨应用交接须说明来源应用中的业务对象怎样对应目标应用中的对象；保留实际值及来源、转换规则、有效条件和目标结果。只在获准范围传递必要数据，不把剪贴板当前内容、旧焦点或切换窗口当成交接合同。
- 业务运行失败回到已约定的核对／停止策略；需要修改代码或扩展能力时再回开发链，不在生产运行中自行改写规则并继续副作用。

### 作为复用资产交付的最小条件

资产可以是一份 JS、必要 helper 与简短说明，不强制新目录、Registry、平台或独立 schema。复用的是代码、规则和限定范围的验证依据，不是作者当次会话与权限。这里的轻量文件交付不等于 Normal Mode 放行；后者另须共同 Qualification 与 Catalog 发布门。

| 交付内容 | 生产与核验责任 |
| --- | --- |
| 用途、业务粒度、输入输出、前后条件与失败语义 | S1／S8／S9 明确，S11 保持对应，S12 检查行为 |
| 普通入口／调用方式、配置、版本与依赖、支持环境、实际在线接入 | S11 随候选交付，S12 在声明范围原样核验；不假设 Node runner 或新执行 API |
| 权限及 Secret 引用、验证方法、停止方式、诊断和维护说明 | S1 限定，S10／S11 落实，S12 检查；不以说明代替实际停止能力 |
| collection 结构知识与业务 Mapping | application-engineer 发布 profile/证据；S8/S9/S11 保持 parser owner；S12 分别验证 current viewport、traversal（如有）与业务字段，不把三者合并成一个 passed |
| 共享边界与独立使用条件 | 交付者确认共享许可与维护责任；S12 用 BC-20 检查他人配置及运行，不继承作者的私有上下文或通过状态 |

共享版本仅包含获准代码、说明和必要脱敏样例；原始屏幕、私有聊天、凭据与临时任务包不随资产发布。需求、应用版本或依赖变化使相关资格需重核；未经共享授权的可运行代码仍不能自动公开。后续外部编排只组织已明确的调用合同，不成为本轮普通运行前提。

### Qualification 到 Catalog 的交付边界

S12 的完成成果仍是固定 Candidate 的 QualificationRecord，不增加 S13，不让 qualification 自己修改生产代码或决定发布。普通文件／工作包 handoff、产品 Catalog 发布、真实业务执行是三个不同边界。

```text
不可变 Candidate + 独立 QualificationRecord
→ 发布者核对范围、来源、依赖、持久证据和明确批准
→ 本地 Catalog 登记固定版本
→ 后续 Runtime 重新解析、预检、预览、确认
→ 普通 JS + 真实 Observation
```

纯 JS 和混合 JS＋LLM.generate()／Agent.run() 都走同一候选与资格模型；混合判断的模型策略、schema／validator、工具／外发限制和预算纳入冻结闭包。发布不能扩大模型权限，模型输出只进入严格校验后的确定分支，不能临时生成新代码执行。

公开使用的代码与已有 AppProfile、preflight、preview、schema 或依赖发生影响性变化时，旧确认和资格绑定不能继续套用。代码未变的补证与真实维修分别记录，问题版本按目录策略暂停／撤销，历史证据不改写。一次新环境失败不自动否认旧环境资格，但未知 app version/layout/locale 不能视作兼容。

上述发行检查的字段与证据寿命遵循共享合同第 10 节；本页不维护第二套发布清单。发布门未实现、关键证据未持久保存或资格未覆盖时，交付候选和明确阻塞，不把“生成成功”写成“普通用户已可用”。

## 五、数据线、控制线与权限

- **数据线**：用户原始来源 → TaskContract／WorkPlan → Observation／实际值 → AppProfile/CollectionProfile → Dossier／Raw Trace → DistilledSteps → SemanticProcedure／business mapping → 候选 → 验收与运行证据；每项标生产者、消费者、版本、来源和失效条件。
- **控制线**：协调者读取合同、当前计划、当前进度和输入就绪条件 → 派发当前工作包 → 检查成果及 Gate → 更新唯一进度 → 继续、修订计划、补证、恢复或停止。
- 同一任务一个进度写入者，同一桌面同一时刻一个操作拥有者；离线分析可以并行，点击、scroll 和输入不并行抢占。
- 同一 helper/Profile 版本由一个被授权的工作包修改；语义或定位规则改变同步 AppProfile 与候选依赖，其他环节只消费冻结版本或提出变更请求。
- 只传必要业务数据和获准证据根；屏幕文字、检索材料、API 返回和模型建议都不自行扩大授权。Semantic Vision 默认只接收必要最小 ROI 与结构化 observations，provider 失败不扩大上传范围。
- JS 处理确定步骤；Agent/VLM 输出先校验再用于获准动作或 profile proposal，不直接 eval 任意模型代码。无实际宿主／provider 接入时明确未集成，片段或 mock 不冒充完整业务。
- `opendesk ai` 继续是 Coding Agent 作者期工具，不作为生产 `UI.readCollection()` 内嵌 VLM 子进程。Runtime Semantic Vision 需要独立 provider owner。
- 目录中的 WORKFLOW／Skill 文件不是调度程序。由实际宿主负责读取和执行，能力、工具权限、上下文隔离与停止方式须逐项确认。

## 六、过程文件与安全接续

- 活跃任务沿用 `.runtime/automation-authoring/<task-id>/`，attempt 内保存 request、所需主产物和最后发布的 handoff，progress 由协调者维护。
- 阶段性分析可附于本次主产物或必要 notes.md；不是每个点击都创建一套目录，也不把所有历史聊天当交接。同一工作包内部不逐子步骤建立重复 request／handoff。
- 文件完成后才发布交接；消费者核对实际文件、内容 hash、版本、范围和现场。hash 只证明字节一致，不证明业务事实真实。
- 未发布的半写文件可供受控诊断，不能当正式成功输入。上游版本变化只使依赖结果需要重核，不覆盖旧事实。
- 已写成果但进度未更新时先核对并补进度，不重做业务。动作可能发生但未记回执时先核对副作用，再决定后续。
- 窗口、焦点、对象和布局每次重新确认；保存的业务数据与屏幕显示分开。文件 checkpoint 不恢复 JS 调用栈，也不提供外部事务回滚或 exactly-once。
- collector 若已发生 scroll 但因 continuity/mutation/timeout/cancel 停止，handoff 保存已取得 partial、最后 viewport、已发生 side effect 与 stop reason；当前架构不承诺 restore scroll position。
- 超时或取消请求不等于 native 已停止；使用真实支持方式并记录限制，不能用外层 Promise 结束制造“已经终止”。
- 真实 JS 日志与截图使用当次 Execution.artifactDir，并由任务包索引；未经实际生成的路径不能写成证据。
- 长期结论回到设计或脱敏案例，原始失败和旧候选不覆盖。清理前检查引用，归档后登记实际位置、访问范围和版本；证据丢失要标不可复核。

## 七、Research、ADR 与需求变更

- Unknown 明确所在节点、影响、所需证据、方法、预算和退出条件；研究可查文档、源码、已有资产或获准现场，不强制上网或新录制。
- 授权和业务偏好不能由研究者自行决定；已有明确答案不重复问，真正未决交有权人确认。
- 未知有足够证据即返回原节点；预算耗尽仍未知，阻塞依赖范围或经授权缩小交付，不猜测继续。
- 重大接口、职责、兼容性或架构选择记录 ADR 的备选、理由、后果与复审条件，先放对应设计决策小节；普通函数不强制独立 ADR 文件。
- 需求变化先修订需求及行为案例，再追踪操作计划、应用规则、DistilledSteps、SemanticProcedure、Skill、代码、依赖和测试；不能在验收末端降低期望。
- 稳定业务恢复不是代码自我改写；生产失败先留证与安全停止，修复回开发链，新候选重新验证。

## 八、需求覆盖与责任映射

需求标识来自[requirements.md](requirements.md)，BC 标识来自[validation-plan.md](validation-plan.md)。这些标识仅用于设计追溯。

| 需求 | 主要设计落点／责任 | 行为与验证 |
| --- | --- | --- |
| DREQ-01 来源与未知 | S1、S3—S9；规划、示范、提炼 | BC-01、BC-07、BC-12 |
| DREQ-02 多入口与语义 | S1；本页路由、任务树三入口 | BC-01、BC-02、BC-03 |
| DREQ-03 完整方法 | S1—S12、R1—R13、三个循环 | BC-01、BC-07、设计完整性检查 |
| DREQ-04 独立交接 | 八项目标职责、本页交接与控制 | BC-08、BC-09、BC-15 |
| DREQ-05 可选改进 | S11；生成与 code-rebuild 分工 | BC-02、BC-03、BC-11 |
| DREQ-06 真实数据 | S3—S11；示范、DistilledSteps、提炼、生成和优化 | BC-04、BC-05、BC-18、BC-19 |
| DREQ-07 应用与 API | S2／S10；应用分析与当前 API | BC-06、BC-11 |
| DREQ-08 有界安全 | S1、S3—S6、S10—S12；执行／宿主 | BC-05、BC-09、BC-13、BC-17、BC-18 |
| DREQ-09 成本与范围 | S1、S11、S12；用途和风险裁剪 | BC-03、BC-10、BC-13、BC-17 |
| DREQ-10 独立验证 | S12；指定候选与独立证据 | BC-04、BC-08、BC-10 |
| DREQ-11 版本变更 | 合同、数据线、候选与变更影响 | BC-08、BC-12 |
| DREQ-12 文件职责 | 设计总纲、迁移入口、案例 | 设计完整性检查、BC-15 |
| DREQ-13 研究与 ADR | 本页第七节；规划与责任环节 | BC-07、BC-12 |
| DREQ-14 资料与隐私 | 任务包、证据生命周期与最小授权 | BC-09、BC-13、BC-16、BC-20 |
| DREQ-15 宿主与混合 | S9／S11／S12；本页业务交接、实际接入 | BC-13、BC-14、BC-15、BC-18 |
| DREQ-16 质量目标 | 验证计划、G0—G7、评分范围 | BC-10 及各层资格审查 |
| DREQ-17 项目目标与交付 | S1 定范围、S9 选执行方式、S11 交付、S12 验收；需求背景与本页资产交付 | BC-17、BC-18、BC-20；项目背景与交付覆盖检查 |
| DREQ-18 组合能力 | S8／S9 提炼子目标、S10 操作合同、S11 复用实现；应用操作分析 | BC-17、BC-18；子目标到操作及实际候选映射 |
| DREQ-19 他人复用 | S1 共享范围、S11 使用维护说明、S12／交付者确认独立使用；本页最小资产条件 | BC-20；版本、配置、共享边界与运行证据 |
| DREQ-20 跨应用一致性 | S1 对象与权限、S8／S9 数据依赖、S10／S11 实现、S12 验收 | BC-19；源数据到目标对象及实际结果证据 |
| DREQ-21 模型主导与材料充分性 | S2；应用认识子作业、共享合同应用工程增量 | BC-21、BC-22 |
| DREQ-22 同源审阅与纠错 | S2／S10；AppProfile、审阅记录、变更影响 | BC-08、BC-23 |
| DREQ-23 同一 Agent 与轻量正常路径 | 本页默认路径、工作包边界和定向返回 | BC-03、BC-15、BC-24 |
| DREQ-24 分层应用工程评测 | S2／S10／S12；验证计划分批执行 | BC-06、BC-10、BC-22、BC-25 |
| DREQ-25 generic collection/business mapping | S8／S9／S11；本页 Structured Collection 消费链 | Collection A/P、business parser 专项 |
| DREQ-26 多源 Observation/no-UI-tree | S2／S10；application-engineer + future reader | Collection A–F/K/O |
| DREQ-27 Collection/Traversal 分离 | S1／S3—S5／S9／S10；future read/collector | Collection G–N |
| DREQ-28 VLM 作者期优先/运行期受限 | S2／S9／S10；SemanticVisionProvider boundary | Collection D–F/O、隐私/预算检查 |
| DREQ-29 mutation/partial completion | S3—S6／S12；collector + qualification | Collection J–N |
| DREQ-30 自然语言入口／内部合同 | S1 automation-plan；原始用户来源与可读视图 | BC-26、BC-12 |
| DREQ-31 操作计划／早期否证 | S1／S2；automation-plan + application-engineer | BC-27、BC-24 |
| DREQ-32 planned／actual 偏差 | S3—S6；task-demonstrate + plan delta | BC-28、BC-09 |
| DREQ-33 DistilledSteps 边界 | S7 trace-distill → S8—S9 procedure-synthesize | BC-29、BC-30、BC-31 |

正向检查每项需求有负责环节、成果和测试；反向检查每个新增环节都有需求依据。实际执行后补真实证据引用，不在此写预制通过状态。

本轮 Capability 生命周期衔接不另造 DREQ／BC 编号。跨层信任门、双来源发布、版本漂移、取消／未知效果和证据保留的验收统一引用生命周期总纲第 15 节，以及共享合同第 10.7 节；上表继续保存 S1—S12 原需求映射，不把跨层设计写成这些旧用例已运行。

## 九、进入正式 Skill 化的实施规格

- 每个 Skill 需要明确适用触发、前提、输入合同、专业步骤、输出及消费者、错误和停止条件、允许工具、验证场景及未支持范围。
- 核心步骤进入 SKILL.md，长示例和专项分析按需引用已有唯一正文；不是每阶段一个 Skill，也不重新建设平行 chains 正文。
- WORKFLOW 保持范围与路由入口，不重复专业方法。五个现有方法的输入／输出和只读检查见 WORKFLOW 第 4.1 节；Structured Collection 的 profile authoring 仍进入 application-engineer，不拆第二个 collection/VLM Skill。
- `trace-distill` 实施时必须能够只凭固定 TaskContract／WorkPlan、Dossier／Raw Trace、必要 AppProfile 和证据发布 DistilledSteps 或准确指出缺口；不能依赖复制完整聊天。`procedure-synthesize` 的独立接续测试则从 DistilledSteps 开始，不以重新分析 Raw Trace 掩盖交接缺陷。
- `UI.readCollection()`／`UI.collectCollection()` 必须按专项 Phase 1–7 经 Runtime/type/API/docs/test 闭环后才能分别进入 Experimental；工作流文档先接线不构成实现。
- 核实实际实现与宿主加载路径，建立与本设计一致的入口；旧目录已删除，不将历史索引或 stages 路径作为当前依赖，不恢复重复阶段卡。
- code-rebuild 已支持原样保留或有据修订的评审方法；处置标签不是新的 JSON Gate／executionStatus。超出 minimal-repair 的正式来源适配和质量裁剪仍须兼容设计，不把代码改进伪称新示范。
- 实施后再验证单 Skill、独立交接及完整生成；合同、业务设计、实现和实际加载分别核实，不以本文证明新调用已经可用。
- `recipe-qualify` 正式方法文件已落地，但其宿主加载、隔离上下文行为评测、通用真实业务资格、发布 handoff 适配及 Catalog／信任门仍需分别验证；现有 Calculator 专用 Gate 仍不能代表通用方法通过。八个方法包的宿主加载、独立行为评测与真实业务资格都按真实消费者逐项补齐；已有离线／固定候选证据只保留其原范围，code-rebuild 保持独立可选。
- Calculator 当前 Chat 候选必须取得自己的真实参数域／layout／取消／读值资格后才进入 Normal Mode，不能继承历史 golden 或 mock；第二应用、双来源实际发布及定向维修回归进入 P1。当前没有这些新 PASS，不对未来功能填写完成率。

方法依据：[框架导航](../../../docs/frameworks/README.md)、[任务求解](../../../docs/frameworks/automation-problem-solving-framework.md)、[应用开发](../../../docs/frameworks/app-development-framework.md)、[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)、[Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。

2026-09-07，v0.3 修订：依据项目背景补充纯 JS／混合交付、运行时组合与最小资产交接，将 DREQ-17—DREQ-20 接到原 S1—S12 和 BC-17—BC-20；同步旧 Skill 已删除的事实，不修改公共 schema、不创建运行时或安装 Skill。

2026-09-08，v0.4：依据用户写入授权，补同一 Agent 正常／异常路线、界面认识限定出口、S9／S10 分工、AppProfile 增量兼容与 DREQ-21—DREQ-24 映射。没有批量生成其他 Skill，也没有执行真实桌面业务。

2026-09-10，v0.5：接入 Structured UI Collection Reading：application-engineer → CollectionProfile → recipe-build/future readCollection → generic CollectionItem[] → App Adapter/Recipe business mapping → qualification；跨 viewport 另经过 side-effecting scroll collector。新增 profile drift、evidence conflict、VLM unavailable、continuity unproven、collection mutation 五类定向返回，并接入 DREQ-25—DREQ-29；不新增 S13、Skill、稳定 API 或分页内建策略。

2026-09-11，v0.6：新增自然语言入口后的可审阅业务操作计划、关键未知优先核实和 planned／actual／planDelta 交接；将 S7 明确为 DistilledSteps 生产环节和目标 `trace-distill` 职责，将 `procedure-synthesize` 收窄为 S8—S9，并接入 DREQ-30—DREQ-33。未新增阶段、Runtime 或已安装 Skill 声明。

2026-09-13，v0.7：接入 Runtime Gap／Failure／已有资产的最小分流、五类可接续工作包与 Qualification→Publish→后续运行出口，明确 Human 原生来源、共享应用工程、差量重验及 P0/P1 实施顺序。只更新文档，保留 S1—S12、原需求／案例与历史证据，不创建 Catalog、发布器、Skill 或新的 Runtime API。

2026-09-19，v0.8：增加 S12 `recipe-qualify` 方法文件，继续复用 QualificationRecord、G0—G7 与 validation-plan 评分，不增加 S13、评分 Gate、发布器或新 schema；方法文件存在不外推宿主安装或新的 live 资格。
