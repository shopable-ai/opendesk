---
title: "Automation Capability Lifecycle｜运行、生产、资格与复用"
description: "连接 Conversational Task Runner、最小本地 Capability Catalog、Agent/Human-to-Recipe 与维修重验；严格分离普通运行和能力开发。"
---

# Automation Capability Lifecycle

状态：架构与实施合同 v0.1，2026-09-13。检查基线为远端 `master` 的 `b5a9c61a16f19adbf215f08457ccef794fe1320d`；提交前须重新核对分支与目标文件。本文冻结跨层职责和目标合同，不表示 Catalog、发布器、独立 recipe-qualify Skill 或以下状态机已经实现，也不新增公共 Runtime API。本轮不执行真实桌面任务。

## 1. 最终架构决定

**一个普通任务运行产品、一个最小本地能力目录、两条保留来源差异的作者链，共同消费同一份不可变候选与独立资格。**

```text
自然语言 → Chat UI → 受控 Planner → Task Intent
  → Resolver 查询本地可信 Catalog
    → qualified 且当前可用：校验 → 预览 → 确认 → 普通 JS → 真实 Observation
    → 有能力但受阻：澄清 / 权限指导 / 状态准备 / 重验 / 定向维修
    → 没有能力：Capability Gap → 用户明确选择创建、教会或录制
      → Agent-to-Recipe / Human-to-Recipe / Existing Assets
      → 冻结 Candidate → independent qualification → 明确 publish
      → Catalog 可发现 → 新的运行请求、预览与确认
运行失败 → Failure Package → 原因分类 → 有界恢复或定向 authoring
  → 新 Candidate / 新资格 → 新发布版本；不改写正在运行的生产版本
```

Chat Runner 在产品语义上是 Runtime Workflow / State Machine；在仓库中是 App/Runtime 产品代码及架构文档，**不新增 `workflows/conversational-task-runner/`、`workflows/capability-resolver/` 或 `workflows/chat-agent/`**。`workflows/` 已承载开发、发布、配置维护等专业方法，不应狭义改成只放 Recipe，但普通产品每次运行的状态机不因叫 Workflow 就移入该目录。

保留三层，Qualification/Publish 是 Authoring 通向 Catalog 的受控出口，不另造第四套开发系统。Normal User Mode 只能消费 Qualified Capability；现有普通 JS/Script Runner 的开发者使用方式不因此被全局禁止。限制作用于可信产品入口，不把 JS Runtime 本身重新定义成只能运行 Catalog 的引擎。

## 2. 三层责任与唯一真相

| 层 | 拥有的责任 | 不拥有的责任 |
| --- | --- | --- |
| Runtime Execution Plane | TaskSession、受控规划、宿主授权、参数语义校验、现场检查、确认绑定、执行与真实结果 | 编写/修复生产代码、扩大资格、注册未经批准的能力 |
| Capability Resolution / Catalog Plane | 受信本地描述符索引、候选与资格引用、环境适用判定、发布/撤销状态、明确 Gap | 操作桌面、解释执行 DSL、模型自报资格、任意路径执行 |
| Capability Authoring Plane | 任务合同、来源事实、应用工程、语义过程、普通 JS 候选、独立验收及发布请求 | 在普通用户确认内隐式探索、自动扩大授权、用生产者自述证明通过 |

唯一文档职责：

- 本文：跨 Runtime/Catalog/Authoring 的生命周期、最小发布合同、状态/路由及跨链任务树。
- [Conversational Task Runner](../conversational-task-runner.md)：当前 Calculator Chat P0 的实现、固定 envelope、公开命令与真实验收边界；不是跨应用 Catalog 已完成证明。
- [共享 Skill 合同](../../frameworks/agent-to-recipe-skill-contract.md)：已有 TaskContract、AppProfile、SemanticProcedure、CandidateManifest、QualificationRecord、request/handoff、引用与恢复规则。保留现有路径，不复制第二套权威 schema。
- [Agent 链路](../../../workflows/agent-to-recipe/design/chain-design.md)：S1—S12 内的工作包、专业职责、生产与接续。
- [Human 入口](../../../workflows/human-to-recipe/README.md)及其 design/skills：Human actions、SemanticBuildPlan、逐动作 disposition、业务 Episode、生成与独立 Gate。
- [Gates](../../quality/gates-and-evidence.md)、[Failure Taxonomy](../../quality/failure-taxonomy.md)：沿用 G0—G7、F0—F10，不另造平行质量等级。

Catalog 中的名称、输入提示和业务简介是发布规格的索引投影；AppProfile 是应用规则权威源；QualificationRecord 是资格判据和证据权威源；Recipe 是实际执行代码。Chat UI 不再维护一份应用识别规则或独立任务清单。可以缓存投影，必须绑定来源版本，不能可独立编辑后互相漂移。

## 3. 真实基线与缺口

以下是本次读取源码/目录和文档得到的快照，不是新执行的测试报告。

| 范围 | 当前存在 | 不得推断为已完成 |
| --- | --- | --- |
| Calculator Chat | `examples/ai-workflows/chat-calculator/` 中 index/planner/task-contract/task-session/calculator；index 中仍按两个 TASK_IDS 分支调用 | 通用 Resolver、Catalog、发布资格门或完整真实桌面通过 |
| Chat 回归记录 | 架构页记载纯 JS/mock 12/12，包含读值数据依赖、平移模拟与取消 | 本轮重跑、真实 Codex、真实 Calculator、视觉或跨平台通过 |
| Agent-to-Recipe | 正式 `application-engineer/SKILL.md` 和 `scripts/review.py`；WORKFLOW 明确为导航；S1—S12/八职责设计存在 | 八个可调用 Skill、自动调度或所有应用操作已资格化 |
| 历史 Agent Skill | chain-design 记载旧六目录于 `17ccb9258dd34ce8b7c21296339a17f0c46e6586` 删除；现目录仅有 application-engineer | 从历史目录名恢复可用性；trace-distill/code-rebuild 等目前没有正式入口 |
| Human-to-Recipe | human-to-recipe 与 recorder-script-refiner 两个正式方法入口；SemanticBuildPlan schema/validator/scorer、Calculator golden | 通用业务 renderer、用户级 Skill 自动安装或全部作者链已接通 |
| Recorder Refiner | 现行 Skill 已指定 inspector → actions-first `generate-refinement.js` → `validate-refinement.js`，basic JS 只做 lineage/静态对照 | 仍只是改写 basic JS；其静态 PASS 也不是业务 qualification |
| Recorder/Human 历史资格 | implementation-plan 保存指定 macOS capture、回放、oracle 与精确构建关系 | 转移到新 Chat 模块、新按钮范围、新输入或 Windows 环境 |
| 共享应用工程 | Human 已明确消费 application-engineer 的 target/locator/geometry/guard 等交接 | 已有全部共享 schema 适配器；应用局部检查就是整份 Recipe 资格 |
| 资格合同 | CandidateManifest、QualificationRecord、requested/exercised/qualified/excluded 与不可变候选已有设计 | 独立通用 recipe-qualify Skill、发布校验器和运行时放行已经落地 |

本次检查对象包括 workflows/README、两条链的入口/design/skills、共享合同、当前 Chat 架构与 index/task-contract/task-session 源码。未全量重跑仓库测试，也未审计每个 Runtime primitive。对于 Runtime/Permission/Agent/LLM 的实现细节，后续实施仍须以当前 API、类型、源码、构建及实际能力探测为准。

## 4. 最小 Automation Capability Contract

### 4.1 两份不可变记录和一个目录条目

不要在 Recipe 中手填 `qualified: true`。目标对象分开如下，均为待实施合同，不是已经发布的 JSON schema/API：

```text
CapabilityDefinition：业务说明 + 受支持范围 + 执行/安全合同；不可变
CandidateManifest：实际 Recipe、依赖闭包、上述定义及作者来源；不可变
QualificationRecord：引用精确 Candidate 和验证标准/场景/证据；不可变
CatalogEntry：引用 Definition + Candidate + Qualification；附受控发布/撤销状态
```

Definition 可作为 Candidate dependencies 中固定 hash 的文件；Qualification 引用 Candidate；Catalog 再引用两者。**Definition/Candidate 不反向包含新 Qualification 的 hash**，避免 `candidate → qualification → candidate` 的内容哈希环。原 Candidate schema 未支持的发布信息放在带版本的外部发布清单中引用，不能静默给旧 schema 填新枚举。

P0 不建设网络 Registry：维护者显式登记本地随产品交付的条目，Catalog 启动时只读可信 metadata。禁止扫描任意用户目录后 import/eval 脚本以获取 metadata；列出能力本身不能触发桌面副作用。动态发现、用户自装包及远程分发均后置。

### 4.2 Definition 的运行最小字段组

| 字段组 | P0 必须表达 | 归属与约束 |
| --- | --- | --- |
| 身份 | `schemaVersion / capabilityId / version / name / description` | 名称供人和 Planner 理解，id/version 用于宿主精确绑定；未知格式拒绝，不自动降级 |
| 业务输入输出 | `inputSchema / resultSchema` 或固定内容引用 | 严格结构校验及业务语义校验；参数来自本次请求/明确引用，不从 description 推断默认授权 |
| 支持范围 | `supportedScope` | application identity、platform、经验证的 app version/build、layout、locale、输入子域；关键未知不视为匹配 |
| 实际执行 | `executorRef / candidateRef` | 宿主登记的普通 JS 模块/导出及固定依赖版本；不接受模型返回的 path、code、shell 或表达式 |
| 就绪检查 | `preflightRef / requiredPermissions / requiredRuntimeCapabilities` | 引用当前已有 Permission/Runtime owners；无依赖也显式为空；不自造系统权限名或另一套检查器 |
| 用户授权 | `riskLevel / confirmationPolicy / previewRef` | 宿主生成预览；P0 默认每次确认，策略可更严格、不可由模型降低 |
| 运行界限 | `executionPolicy` | timeout、取消安全边界、desktop exclusivity、重试/副作用语义；P0 默认不自动重试业务副作用 |
| 模型依赖（条件必需） | `modelPolicy` | 有 LLM/Agent 时必须声明允许 backend/profile、schema/validator、外发范围、预算及失败方式；纯 JS 明确无模型依赖 |

Qualification status/scope/evidence/version 属于 QualificationRecord 与 Catalog 的受控引用，不复制成描述符中的可写事实。AppProfile 可通过 Candidate 引用，Definition 的 supportedScope 是声明上限，不等于实际资格；运行允许域取声明范围、资格范围、当前宿主策略和本次授权的交集。

展示标签、图标、搜索别名、示例问法、作者联系信息、计费、下载统计、排行榜、远程发现和复杂依赖求解都不是 P0 放行条件。riskLevel 只是辅助分类，不能替代实际副作用列表或授权。

### 4.3 Executor 是普通 JS，不是大型 DSL

最小应用层模块可约定 `preflight(input, context)`、`preview(input, context)`、`execute(input, context)` 等普通函数；这些是拟议内部模块合同，**不是新增 `Capability.run()` 或其他公开 Runtime global**。context 由宿主生成，携带本次 signal、已授权目标、进度与 Observation 汇报边界，模型不能填写。

优先在同一次受管 Execution 内消费无顶层动作的模块，不为每次 Capability 再启动 OpenDesk。现有脚本只有顶层固定执行时，应在作者态产生可调用新 Candidate 并重验，不能假设 import 原脚本没有副作用，也不能把函数式重构视为资格不变。

P0 不允许临时组合多个 Capability 成任意 DAG。组合业务可以直接是一个经过资格化的普通 JS Recipe；几个子能力分别通过，不证明跨能力数据传递、确认和副作用顺序已经通过。未来组合仍须冻结依赖闭包并单独验证组合合同。

### 4.4 Planner 与 Resolver 的最小职责

宿主提供经过策略过滤的能力名称、id、description、输入 schema 与限制；模型只能给候选 `capabilityId + arguments` 或 clarify/unsupported。目录版本、实际 capability version、qualificationRef、权限、风险和 executor 都由宿主选择、验证并冻结，不接受模型签发。

Resolver 返回明确结构化结果，而不只是 true/false。目标结果包括 runnable、clarify、blocked、requalification-needed、repair-needed、extension-needed、gap；具体 enum 随实现统一测试后冻结。Planner 的 unsupported 不能掩盖已存在能力或决定 Runtime primitive 缺失；该判断由宿主目录和有证据的可行性核查完成。

Schema 合法不证明业务正确或授权充分；金额/单位、收件人、时间范围、文件选择和副作用还需宿主语义校验。严格 JSON schema 与 extra-property 拒绝原则参考 [JSON Schema object](https://json-schema.org/understanding-json-schema/reference/object)；实际只采用当前 Runtime 支持的子集，不能把不支持的关键字当成已经执行的检查。

## 5. 已有 Capability 的完整运行链

```text
分配 taskId/requestRevision
→ 验证用户输入并选择受控 Planner
→ 产生 intent/候选参数
→ Resolver 绑定本地发布版本、Candidate 与 Qualification
→ 校验结构、业务参数和授权目标
→ read-only preflight：环境、系统权限、Runtime primitives、资格、撤销状态
→ 宿主生成可信 preview 并冻结 run binding
→ 用户确认
→ 获取桌面操作排他权，重新检查绑定与即时现场
→ 确定性 Recipe；仅在已声明节点调用 LLM/Agent
→ 逐关键点 Observation / postcondition
→ resultSchema + 成功标准校验
→ completed / failed / canceled / outcome-unknown
```

预览显示将操作的应用/账号/对象、输入/来源、会清空/覆盖/发送什么、模型外发、预期读取和停止限制。`previewRef` 对应受信代码，只能格式化已校验参数；模型 prose 不是授权文案权威源。

**preflight 不隐式产生副作用。** 应用未打开、必须切前台、滚动或打开授权设置才能继续时，报告需准备，并取得单独、受限的 preparation 同意或已有明确授权；完成后再验证资格并生成业务预览。不得以“检查环境”名义清空、发送、登录、修改应用或反复打开系统授权窗口。准备动作和业务动作的授权、状态分别记录。

确认绑定至少覆盖 task/requestRevision、Definition/Candidate/依赖 digest、qualification ref、参数 digest、相关环境/账号/目标身份、策略版本与有效期。用户改参数、目录改版、资格撤销、关键环境漂移或超时后，旧确认失效。确认后进入桌面锁时再次校验；关键动作前继续检查目标/焦点/布局，预检成功不保证稍后仍成立。

“一个 ChatSession 同时一个任务”不是“整个桌面只有一个执行者”。Chat、Script Runner、Scheduler、其他 Runtime、Recorder/人工教学之间的桌面输入所有权须统一协调。P0 放行必须有可证实的排他/暂停接管边界；尚不能在多 Runtime 间强制实现时，只能声明受监督单一操作者范围，不声称无人值守并发安全。只读离线分析可以并行。

同一请求重复确认只启动一次；取消阻止后续动作，不撤销已提交点击或外部副作用。关闭窗口、进程崩溃和未知结果不得统一显示 completed/canceled-safe。进度文字、函数 return 和模型推测都不能替代实际读数。

## 6. 能力解析与 Gap 路由

先区分“不理解任务”“当前不能运行”和“根本没有能力”。路由不要求所有任务从头经过作者链。

| 情况 | 处置 | 是否修改生产版本 |
| --- | --- | --- |
| 已有 qualified、已发布且当前适用 | 正常校验/确认/执行 | 否 |
| 意图、参数、目标身份有歧义 | 澄清；保留候选，不编造默认对象 | 否 |
| 权限、认证、依赖未安装、应用状态不满足 | 具体 guidance / 受限准备 / 有界恢复 | 否；发现真实底层缺陷另行归因 |
| 已有通过资格的 Candidate，但未发布 | 检查证据完整性、信任来源和发布批准后登记 | 不必重新生成；资格失效时先重验 |
| 代码未变，只是证据缺失/过期/环境尚未验证 | requalification；不先强迫 repair | 可产生新资格记录；不伪造代码变更 |
| 原能力在当前 app/layout 下规则失效 | application-engineer repair/harden → 新 Candidate → 重验 | 是；不覆盖旧版 |
| 相似能力只缺输入范围/新操作 | 增量扩展合同与实现 → qualification delta + 必要回归 | 新发布版本；相似度不是资格 |
| 完全没有能力 | Gap → existing asset lookup → 明确选择 Agent/Human/Recorder 路线 | 新候选及资格后发布 |
| 有目标但 Runtime 缺 primitive | 有证据的 Runtime gap → [Runtime API Extension Framework](../../frameworks/runtime-api-extension-framework.md) → API/实现/测试 → 返回原作者工作包 | 先补基础能力，再验 Recipe；不让模型绕过缺口 |
| 平台/政策/授权明确禁止，或所需风险控制不可实施 | unsupported/policy-blocked，说明不可执行部分 | 不自动启动探索、采购、提权或开发 |
| 副作用是否已经生效不明 | outcome-unknown → 核对/人工接管 | 禁止自动重放；诊断后再决定维修 |

Capability Gap 是请求交接，不是执行授权。目标最小包保存 gapId、request/taskRef、脱敏业务目标与成功条件、已核查候选及拒绝原因、已知环境/未知项、可复用资产引用、缺失操作/primitive 证据、建议责任入口、隐私与预算。不要把全量聊天/截图/联系人内容自动送给作者或模型。

“帮我打开微信，找到张三，把今天的报价发送给他”没有能力时，UI 明确显示当前没有经验证的该能力，并提供“创建自动化 / 教 OpenDesk / 录制这个任务”的作者入口。进入后要明确张三的唯一身份、当前账号、今天所用日期/时区、报价来源/版本、发送文本或文件、成功读回和发送授权。示范使用明确获准的测试对象或停止在发送前；作者授权不自动授权向真实联系人发消息。验收结束后，原请求仍需重新检查报价和收件人并再次确认，不能沿用开发前的旧预览。

## 7. 两条作者链共享结果，不伪造相同来源

```text
Agent 路：TaskContract/WorkPlan → application-engineer
  → task-demonstrate 的真实 Dossier
  → trace-distill 的 DistilledSteps → procedure-synthesize
  → recipe-build → 可选 code-rebuild → 独立资格

Human 路：人工授权/任务 → Recorder raw/actions + 审阅
  → 仅保真精炼：recorder-script-refiner → 静态 refined Candidate（非业务资格）
  → 业务生产化：human-to-recipe 的 disposition/Episode/SemanticBuildPlan
    ↔ 按需 application-engineer
    → 普通生产 Recipe + 独立 Gate → 独立资格

Existing Assets：冻结已有资产与证据 → 仅补当前缺口 → 独立资格

共同出口：发布规格 + 精确 Candidate + 可复核 Qualification → Catalog
```

共享六类逻辑成果，但**不要求六份额外 JSON 副本**：

| 共同逻辑成果 | Agent 来源 | Human 来源及适配边界 |
| --- | --- | --- |
| Task Contract | 现有 TaskContract | SemanticBuildPlan 中已确认 intent/约束或被引用合同；未知业务意图不能补成已确认 |
| AppProfile | 共享 application-engineer 输出 | 引用同一 Profile/规则；不建立 Recorder 专属应用模型 |
| Semantic Procedure | SemanticProcedure / DistilledSteps | 原生 SemanticBuildPlan 的 Episode、数据依赖和 source map；投影不能重写 action disposition |
| Recipe Candidate | 普通 JS + CandidateManifest | 精确 production JS + plan/source/依赖映射；Gate 不复制另一套业务动作 |
| Qualification Record | 冻结候选的独立 fresh run | 同样验精确 production 文件和业务 Oracle；静态 refiner 报告不足以发布 |
| Automation Capability | 上述结果的受控发布 | 相同发布合同，保留 human 来源及限制 |

先保留各自权威来源，以版本化 ref/只读映射消费。若需投影，保存 sourceRef/hash、source format、mappingVersion、字段来源及 unknown；输入变化即失效，不能双向独立编辑。**业务生产 renderer 未实现，不等于 actions-first refiner 编译器未实现**，两者范围不同。

当前共享 QualificationRecord 的 `qualificationScope.lineage` 仅有 reference-only、continuation-chain、new-generation-chain，不能把 human/agent 塞入该枚举。来源种类与验收链类型是正交维度：P0 在发布 handoff 中固定原始 source format/ref，由显式适配器核验；需要通用新字段时在共享合同/schema 中做一次版本化增量与兼容测试，旧 consumer 不支持则拒绝。不能为了统一把 Human 录制声明成新的 Agent 示范。

## 8. application-engineer 的共享位置

保留现路径 `workflows/agent-to-recipe/skills/application-engineer/`，由 Human、Agent 和 Failure repair 引用；本轮不移动、复制或新建 shared-app-engineer Skill。目录归属不妨碍共享专业能力。

- discover：新应用/新页面且缺必要认识，先取得足够当前任务使用的最小规则，不做全应用普查。
- harden：已有认识但某项新操作缺定位、状态准备、读取、等待或后置保障；已验证部分继续复用。
- repair：消费精确 Failure Package、旧 Profile/helper 与受影响范围，定向修规则并给出重验请求。

三模式由证据缺口决定，不能把所有“新操作”机械判 harden。它交付 AppProfile、规则/helper、来源、unknown、局部验证及资格范围建议；**不能签发整份 Recipe 的 qualification，也不拥有业务成功标准、最终 Recipe 或发布审批**。

Calculator、微信、Excel、ERP 的差别应主要是版本化 Profile/应用规则和业务 Recipe，不是四套窗口识别、权限服务、Chat Runner 或 Recorder 模型。跨应用共同 primitive 继续交原 Runtime owner，而非每个 Profile 手写一份 Runtime。

## 9. Independent Qualification 与发布

独立性不是“另起一个模型说通过”，也不强制每阶段另起 Agent。至少隔离四项：冻结待测候选与依赖；预先确定业务标准/场景；fresh run 与独立 Observation/Oracle；验收者不能在同一验收中改候选或降低标准。可以由同一操作人员启动固定 Gate，但必须记录真实执行者及隔离方式；没有独立上下文则不得声称无历史交接测试通过。

QualificationRecord 沿用共享字段，必须绑定实际 Candidate/hash、Runtime/UI-host provenance、环境/版本/locale/layout、测试参数域、实际命令与工作目录、requested/exercised/qualified/excluded、结果、证据及未运行项。通用 recipe-qualify 的首版应复用 Human Gate 的“执行真实 production 文件而非第二份动作实现”规则。

```text
冻结 Definition + Candidate/dependencies
→ 固定 requested scope / criteria / test plan
→ 授权测试 → fresh run → 独立读回 / 反例 / 取消 / 回归
→ pass / fail / not-run / blocked
→ pass 且覆盖拟发布范围
→ 独立发布批准 + 来源/路径/hash/证据完整性检查
→ staged release → 原子发布目录快照
```

关键 fail/not-run/blocked 不能靠缩小 requested 后冒充原请求通过；需要更窄发布时先明确变更发布合同和请求范围，并保留旧失败记录。qualification delta 是影响分析、保留有效旧证据、补新场景和必要回归的组合，不是把旧 pass 复制到新 hash；依赖不明时扩大重验。

资格数据分三处，职责不重叠：authoring 工作包保存尝试过程；不可变 QualificationRecord 保存权威资格；Catalog 只保存引用/发布状态和可重建摘要。真实截图/日志仍使用现有 `.runtime/automation-authoring/<task-id>/` 和 Execution.artifactDir。`.runtime/` 可清理，**不能作为已发布能力唯一证据库**：发布前须将必要证据按授权脱敏保留到明确、不可随运行清理的 release evidence 根，并记录引用/权限/保留策略；尚无持久证据设施就阻止该范围发布，不悄悄引用将被清理的路径。

P0 随产品交付维护者批准的本地只读 release，避免立即增加存储平台。候选、验证器、预检、预览、Profile、模型策略及实际消费依赖都进入完整性检查；hash 只证明字节一致，不证明可信发布者，受信来源/审核同样不可缺少。用户自装包的签名、分发和远程 Registry 后置，不与现有 App Package、`.odpkg` 保护/授权混为资格。

目录发布需拒绝半写入、重复 id/version 指向不同内容、越界路径、符号链接逃逸、缺失引用、未知 schema 和过宽 scope。一个发布快照完整校验后才可见；并行维护者以旧 revision/hash 比较更新，冲突重新读取。撤销是目录策略事件，不篡改旧 Qualification；回退也必须选仍可信且适用于当前环境的已发布版本，不能偷偷回退到已撤销或过期版本。

## 10. App 版本与资格失效

可运行条件不是 `name 相同 && qualified=true`，而是：

```text
trusted published entry
AND candidate/dependency bytes match
AND qualification valid/reviewable/not revoked
AND requested input belongs to qualified input domain
AND actual app/platform/version/layout/locale belongs to qualified scope
AND current Runtime/permission/policy/authorization requirements hold
```

版本范围只取真实验证范围；禁止见过一个版本就声明任意新版本兼容。版本号未知、layout 指纹缺失、locale 未验证均返回 unknown/unsupported-scope，不按“看着差不多”放行。坐标变化要区分允许的窗口整体平移与未经验证的 resize/reflow/DPI 差异；Profile 里声明允许变化，实际 guards 仍须执行。

旧 app 环境仍满足资格时，旧版本不必全局撤销；新环境使用 blocked/requalification-needed。已确认的安全缺陷才按影响范围 suspend/revoke。环境仅未测试与已证明错误是不同状态，不能一律从头开发。

## 11. Runtime Failure → Repair → Requalification

Failure Package 是现有失败体系的交接封装，不是第二套 failure taxonomy。最少保留：task/run/stepId、精确 capability/candidate/qualification/Profile 版本、脱敏参数与授权引用、实际环境、最后关键 Observation、原始错误、primary F0—F10 与有证据的原因/未知、已尝试恢复、引用证据及保留权限。

必须附动作后果状态：未提交、已提交待核对、效果已确认或效果未知；若 native provider 无法可靠给出，则标 unknown，不自造 exactly-once。日志应在关键动作边界保存足够事实，而不是失败后补造现场。

| 原因 | 默认责任/去向 | 不应发生 |
| --- | --- | --- |
| 参数/目标理解错误 | 参数澄清或 planning 修正；对应 F0/F3 | 因用户输错改生产 Recipe |
| 权限/认证/应用未就绪 | 原 Permission/Runtime/preflight owner；F0 | 每检查一次打开新授权窗口 |
| Observation 不完整、目标歧义 | 有界重新读取或 application-engineer；F1/F2/F4 | 猜结果、放宽窗口/对象约束 |
| app/layout/locator 规则失效 | application-engineer harden/repair；依证据 F0/F4/F6 | 每次重新认识整个应用 |
| 必要路径/业务语义/数据依赖错误 | trace-distill / procedure-synthesize，Human 侧修原 plan；F3/F6 | 两条链各维护一份不同步骤事实 |
| JS 异步/API/错误处理缺陷 | recipe-build；确有独立质量目标才 code-rebuild | 在运行中热改脚本继续算旧资格 |
| Runtime primitive 不足/缺陷 | Runtime API Extension Framework / 原 owner | 用任意 Shell/Agent 桌面探索绕过 |
| 证据或 Gate 自身缺陷 | qualification/evidence owner；F6/F7 | 把测试故障直接认定成业务缺陷 |
| 外部结果未知 | 停止、副作用核对/人工接管；F5/F6/F8 | 自动重发报价、重复支付或删除 |

新候选修复完成后重新 qualification，并发布新 capability version。只有代码完全未变、仅重新验证同一候选时，可以追加新的资格记录与目录 revision，不为制造版本号假装修复；运行始终固定实际记录。共享 Profile/helper 更新要计算依赖它的其他能力受影响范围；不能只修一个用例却让其他条目静默消费新规则。

正常运行可以执行已经资格化、预先声明、有限次数且没有越权的恢复规则；这是执行行为，不是在线自修改。没有新证据的相同失败停止重复尝试。repair/重验/发布也受总预算、隐私授权和唯一写入者约束。

## 12. 混合 JS + LLM + Agent Recipe

Capability 是可信业务合同，不是纯坐标宏，也不是自由 Agent 会话。

```text
普通 JS 读取本次真实内容
→ 已声明判断节点调用 LLM.generate() 或受控 Agent.run()
→ result.data 结构和业务语义校验
→ 严格枚举/受界限参数
→ 普通 JS 选择已验证分支并执行
→ 真实 Observation 验证
```

LLM.generate 用于内容分类、提取等有限语义判断；Agent.run 仅在需要受控外部 Agent CLI 推理时使用，并复用当前 Agent/Command/Execution owner。默认点击、窗口定位、等待与数据传递用确定性代码，模型不是每一步桌面动作的默认执行器。

混合模型策略属于候选依赖：backend/profile、允许的模型范围、prompt/schema/validator 版本、工具边界、外发数据、超时/重试/调用预算、拒绝/歧义/不可用/超限行为都需固定。模型/策略变化先做影响分析，未资格化配置拒绝。远程模型不能保证永久行为不变；保留运行配置/版本可观测性、评测集与失效条件，不声称整条混合 Recipe 完全确定。

模型输入中的邮件、网页、控件文本和录制注释仅作为数据；不得升格成新指令、工具授权或目录元数据。模型结果不可作为代码、路径、shell 或权限参数执行。无法判断返回 unknown 并停止或人工处理，不以随意类别继续高风险操作。对内容生成或影响外发对象/正文的判断，在最终副作用前给出实际目标/正文的确认；初始流程确认不能替代后续未知内容的批准。

宿主 read-only sandbox 不等于零工具权限或业务授权。当前适配器的工具关闭、配置隔离和 saved auth 边界必须以源码及实际 CLI 版本验收，不能只写一句 prompt；可参考 [Codex non-interactive](https://developers.openai.com/codex/noninteractive/) 与 [security](https://developers.openai.com/codex/security/)，但不据上游文档推断 OpenDesk 本机已经通过。

## 13. 统一任务分解树

下面按生命周期结果拆任务，不替代现有 S/H 内部任务树，也不要求一个节点对应一个 Skill。

- **OpenDesk Automation Capability Lifecycle**
  - **A. 接住用户的业务请求**
    - 保存 taskId、请求版本、用户目标、输入来源与约束。
    - 受控 Planner 仅提议 capabilityId/参数；意图或对象歧义先澄清。
    - 保留 Normal/Authoring 两种明确模式，分别核对权限与预算。
  - **B. 判定是否拥有当前可用能力**
    - 查询可信本地目录，取得固定 Definition/Candidate/Qualification。
    - 验证语义匹配、输入域、发布/撤销、证据与依赖完整性。
    - 核对实际平台、应用版本、layout、locale、Runtime 与权限。
    - 输出可运行、可准备、待发布、待重验、待维修、待扩展、Gap 或策略阻塞。
  - **C. 安全完成已有业务**
    - 参数与业务语义校验；只读 preflight，必要准备另行授权。
    - 宿主预览与不可变确认绑定；改版、改参、过期失效。
    - 取得桌面操作权，重查即时现场，再执行普通 JS。
    - 仅在声明节点进行受控模型判断；严验返回值后进入固定逻辑。
    - 保存关键实际读值和副作用状态，支持停止/接管，按真实结果结束。
  - **D. 将“不具备能力”变成可接续工作包**
    - 生成 Gap，记录拒绝原因、未知、所需操作和资产引用。
    - 先查已有 Candidate、Profile、Procedure、录制和资格证据。
    - 选择最小路径：登记、补证、维修、增量扩展或新生产。
    - 用户明确进入创建/教学/录制；Runtime gap 返回原扩展框架。
  - **E. 生产有来源的自动化候选**
    - 形成 TaskContract/WorkPlan 和可读业务步骤，不要求用户填 JSON。
    - 共享 application-engineer discover/harden/repair；仅补当前缺口。
    - Agent 路保留真实 Dossier → DistilledSteps → SemanticProcedure。
    - Human 路保留 raw/actions → 审阅/disposition → SemanticBuildPlan/Episode。
    - 来源未知、动作歧义、权限缺口保留 blocked，不伪造统一事实。
    - 生成普通 JS 与 CandidateManifest；可选 code-rebuild，不强制另起流程。
  - **F. 独立证明资格**
    - 冻结候选、完整依赖、requested scope、成功标准和测试计划。
    - fresh run，读取独立结果，验证参数变化、环境反例、取消与副作用边界。
    - 区分静态、mock、局部应用检查、业务资格、真实 UI 和跨平台证据。
    - 失败仅提出修复请求；发布新候选后重验，不能验中改码自报通过。
  - **G. 发布、发现与后续复用**
    - 核对可信来源、scope 不扩大、证据持久保留和明确发布批准。
    - 原子登记固定版本；拒绝半包、越界路径、hash 漂移和版本冲突。
    - Chat/Scheduler 等入口复用同一目录与放行规则，不各维护应用 if/else。
    - 发布不自动执行原请求；重新读取时效数据、预览并确认。
  - **H. 从失败中定向维修与演进**
    - Failure Package 保存旧版本、现场、读值、失败类与副作用后果。
    - 区分参数、权限、环境、定位、过程、代码、Runtime、资格自身问题。
    - 合格恢复规则内有限恢复；结果未知先核对，禁止盲重放。
    - 维修最小受影响部分；沿依赖传播影响，delta + 必要回归。
    - 新资格、新发布版本或撤销；旧记录保留，不篡改历史。
  - **I. 贯穿治理**
    - 单桌面操作所有权；并行作者的版本/写入冲突控制。
    - 最小数据、模型外发、Secret 引用、证据保留与删除权限。
    - 时间/调用/重试/费用预算、人工接管与未知结果状态。
    - 可追踪来源、明确实际完成度、不把设计评分当运行资格。

## 14. P0 / P1 / Later

### 本轮实际交付边界

本轮只完成架构、任务树、责任/数据合同、基线核对与文档导航；不声称实现 Catalog、发布器或新 Skill，不改 Runtime/现有 Recipe，不运行 Calculator/Codex/Recorder。设计评审和业务验收分开。

### P0：下一实施批必须先闭合信任门

1. 最小 Definition/CatalogEntry 与发布清单格式、本地静态目录、版本/hash/scope 校验器；先拒绝未经验证 Candidate，再接 Planner。
2. 抽出当前 Chat 的通用 TaskSession/Resolver 合同，Calculator 两个任务成为目录条目候选；不得直接继承历史 golden 资格。固定模块入口，无目录 import 副作用。
3. Gap 与 Failure Package 的持久工作包、结构化阻塞/unknown；Normal Mode 不进入代码生成，不自动安装或调用作者 Skill。
4. 共享 recipe-qualify 的正式专业入口/离线检查与真实运行交接，复用既有 Candidate/Qualification/Gate；补 Human 发布 handoff 的最小格式适配，不重写其 plan。
5. 最小本地显式 publish/suspend/revoke 与证据留存；确认绑定、版本漂移拒绝、单桌面执行与取消/未知效果边界必须可测试。
6. Calculator 精确输入/布局范围的真实 qualification 和公开 UI 验收通过后，才作为 Normal Mode 第一批可运行条目。只完成 mock 时仍停在候选。

### P1：完善生产效率和第二个应用

- 逐个补齐有稳定消费者的 automation-plan、task-demonstrate、trace-distill、procedure-synthesize、recipe-build 方法入口；先补最阻断接续的入口，不恢复旧目录占位。
- application-engineer 的跨 Agent/Human/Failure 调用与版本影响传播；第二个低风险应用建立真实 golden 和双来源发布测试，证明不是 Calculator 专用。
- 参数范围/新操作扩展、qualification delta、共享依赖回归、repair 工作台和人工交接。
- 明确需求出现后建设 code-rebuild；它不是所有生成的强制下一站。Human 通用业务 renderer 按收益另行推进，不阻塞已有普通 JS 和 refiner。
- 混合 JS/LLM/Agent 的受控分类案例、模型配置变更回归、必要终态确认；跨 Runtime 桌面所有权扩大前补强底层保证。

### Later：不作为当前闭环前提

插件市场、远程 Registry、计费/评分、用户任意包自动安装、复杂依赖解析、DAG/Workflow IR、Compiler 必经路径、独立 Replay Runtime、无限制桌面 Agent、一键无人审自主发布均后置。

“一键创建自动化”可以压缩产品操作，但内部仍必须保留 authoring → candidate → independent qualification → publish；对高风险动作保留人审和细粒度授权。不能用一个总确认消除权限边界。

## 15. 实施验收用例与评分边界

以下均为待运行的验收要求，本轮没有 PASS 数量：

| 用例 | 必须证明的行为 |
| --- | --- |
| Qualified existing | 精确版本、参数/环境在范围内；确认后才有业务动作，结果来自 Observation |
| Catalog gap | 没有条目时生成 Gap；无新代码、Shell、桌面探索或自动发布 |
| Invalid/ambiguous intent | 未知字段、id、参数域、收件人歧义均在副作用前阻止 |
| Unpublished/stale evidence | 区分待发布与待重验，不自动重新开发、不滥用旧资格 |
| Version/layout/locale drift | 未验证环境拒绝；允许平移与未验证 resize 分开 |
| Confirmation drift | 改参数/代码/目录/资格/账号/目标后旧确认不可复用 |
| Candidate integrity | 改 helper、preview、preflight、schema/model policy 同样不能沿用旧闭包资格 |
| Publication integrity | 半写入、同版本不同内容、路径逃逸、缺证据、撤销后调用均拒绝 |
| Independent qualification | Gate 执行真实候选；expected 不进入生产读值；验中修改导致新候选 |
| Dual authoring lineage | Agent/Human 均产出同合同条目，来源和原 schema 不被伪改 |
| Static refiner boundary | 静态保真 PASS 不能单独进入 Normal Catalog |
| Cancel/concurrency | 取消停止后续动作、排他生效、用户接管不与任务交错 |
| Unknown side effect | 发送后断连不自动再发送；保留 unknown 并核对 |
| Directed repair | 保留有效资产，只重验受影响部分；原运行版本保持不可变 |
| Hybrid model | 非法枚举/拒绝/注入/超时/模型配置变化不能越权或猜测结果 |
| Evidence retention | 清理运行目录不使已发布记录伪装可复核；关键证据缺失阻止放行 |
| Current real entry | 当前构建的公开命令、真实模型、真实桌面和视觉分别留证 |

本架构采用自评而非虚构多专家实测：完整性 24/25、一致性 19/20、职责/安全边界 20/20、可实施性 18/20、避免重复系统 15/15，设计评分 **96/100**。扣分来自目标发布/schema 适配尚待实现验证，以及跨 Runtime 桌面所有权/证据持久化需要具体落地核对。该分数不是当前产品完成率、不是 Skill 已安装分数，也不是 Calculator/微信的运行资格；运行资格继续按实际证据判断。
