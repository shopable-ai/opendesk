---
title: "Automation Capability Lifecycle｜运行、生产、资格与复用"
description: "连接 Conversational Task Runner、最小本地 Capability Catalog、Agent/Human-to-Recipe 与维修重验；严格分离普通运行和能力开发。"
---

# Automation Capability Lifecycle

状态：架构与实施合同 v0.1，2026-09-13。检查基线为远端 `master` 的 `b5a9c61a16f19adbf215f08457ccef794fe1320d`；提交前须重新核对分支与目标文件。本文冻结跨层职责和目标合同，不表示 Catalog、发布器、独立 recipe-qualify Skill 或以下状态机已经实现，也不新增公共 Runtime API。本轮不执行真实桌面任务。

## 1. 最终架构决定

**一个普通任务运行产品、一个最小本地能力目录、两条保留来源差异的作者链，共同消费不可变候选与独立资格。**

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

Chat Runner 在产品语义上是 Runtime Workflow / State Machine；在仓库中是 App/Runtime 产品代码及架构文档，**不新增 `workflows/conversational-task-runner/`、`workflows/capability-resolver/` 或 `workflows/chat-agent/`**。`workflows/` 已承载开发、发布、配置维护等专业方法，不应狭义改成只放 Recipe；普通产品每次运行的状态机不因叫 Workflow 就移入该目录。

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

Catalog 中的名称、输入提示和业务简介是发布规格的索引投影；AppProfile 是应用规则权威源；QualificationRecord 是资格判据和证据权威源；Recipe 是实际执行代码。Chat UI 不再维护应用识别规则或独立任务清单。可以缓存投影，但必须绑定来源版本，不能独立编辑后互相漂移。

## 3. 真实基线与缺口

以下是本次读取源码/目录和文档得到的快照，不是新执行的测试报告。

| 范围 | 当前存在 | 不得推断为已完成 |
| --- | --- | --- |
| Calculator Chat | `examples/ai-workflows/chat-calculator/` 中 index/planner/task-contract/task-session/calculator；index 中仍按两个 TASK_IDS 分支调用 | 通用 Resolver、Catalog、发布资格门或完整真实桌面通过 |
| Chat 回归记录 | 架构页记载纯 JS/mock 12/12，包含读值数据依赖、平移模拟与取消 | 本轮重跑、真实 Codex、真实 Calculator、视觉或跨平台通过 |
| Agent-to-Recipe | 正式 `application-engineer/SKILL.md` 和 `scripts/review.py`；WORKFLOW 明确为导航；S1—S12/八职责设计存在 | 八个可调用 Skill、自动调度或所有应用操作已资格化 |
| 历史 Agent Skill | chain-design 记载旧六目录于 `17ccb9258dd34ce8b7c21296339a17f0c46e6586` 删除；现目录仅有 application-engineer | 从历史目录名恢复可用性；trace-distill/code-rebuild 等目前没有正式入口 |
| Human-to-Recipe | human-to-recipe 与 recorder-script-refiner 两个正式方法入口；SemanticBuildPlan schema/validator/scorer、Calculator golden | 通用业务 renderer、用户级 Skill 自动安装或全部作者链已接通 |
| Recorder Refiner | 现行 Skill 指定 inspector → actions-first `generate-refinement.js` → `validate-refinement.js`，basic JS 只做 lineage/静态对照 | 仍只是改写 basic JS；其静态 PASS 也不是业务 qualification |
| Recorder/Human 历史资格 | implementation-plan 保存指定 macOS capture、回放、oracle 与精确构建关系 | 转移到新 Chat 模块、新按钮范围、新输入或 Windows 环境 |
| 共享应用工程 | Human 已明确消费 application-engineer 的 target/locator/geometry/guard 等交接 | 已有全部共享 schema 适配器；应用局部检查就是整份 Recipe 资格 |
| 资格合同 | CandidateManifest、QualificationRecord、requested/exercised/qualified/excluded 与不可变候选已有设计 | 独立通用 recipe-qualify Skill、发布校验器和运行时放行已经落地 |

本次检查包括 workflows/README、两条链的入口、目录/Skill 及 design 相关章节、共享合同、当前 Chat 架构与 index/task-contract/task-session 源码。未全量重跑仓库测试，也未审计每个 Runtime primitive。Runtime/Permission/Agent/LLM 的实施仍须以当前 API、类型、源码、构建及实际能力探测为准。

## 4. 最小 Automation Capability Contract

### 4.1 三份不可变记录和一个目录条目

不要在 Recipe 中手填 `qualified: true`。目标对象分开如下，均为待实施合同，不是已经发布的 JSON schema/API：

```text
CapabilityDefinition：业务说明 + 支持范围 + 执行/安全合同；不可变
CandidateManifest：实际 Recipe、依赖闭包、上述定义及作者来源；不可变
QualificationRecord：引用精确 Candidate 和验证标准/场景/证据；不可变
CatalogEntry：引用 Definition + Candidate + Qualification；附受控发布/撤销状态
```

内容引用必须无环：Definition 不引用 Candidate 或 Qualification；Candidate 固定 Definition 与实际代码依赖；Qualification 引用 Candidate；CatalogEntry 汇总引用并检查 Definition 一致。Definition 中 executor 是逻辑入口标识，实际模块路径、导出和内容 hash 由 Candidate 绑定。Definition 可作为 Candidate dependencies 中固定 hash 的文件；**不把 candidateRef 填回 Definition，也不把 qualificationRef 填回 Candidate**。未知旧 schema 字段的发布信息先放入带版本的外部发布清单，不静默给旧 schema 填新枚举。

P0 不建设网络 Registry：维护者显式登记本地随产品交付的条目，Catalog 启动时只读可信 metadata。禁止扫描任意用户目录后 import/eval 脚本来取得 metadata；列出能力不能触发桌面副作用。动态发现、用户自装包及远程分发均后置。

### 4.2 Definition 的运行最小字段组

| 字段组 | P0 必须表达 | 归属与约束 |
| --- | --- | --- |
| 身份 | `schemaVersion / capabilityId / version / name / description` | 名称供人和 Planner 理解，id/version 用于宿主精确绑定；未知格式拒绝 |
| 业务输入输出 | `inputSchema / resultSchema` 或固定内容引用 | 严格结构及业务语义校验；输入来自本次请求/明确来源，不从 description 推断授权 |
| 支持范围 | `supportedScope` | application identity、platform、经验证的 app version/build、layout、locale、输入子域；关键未知不视为匹配 |
| 执行入口 | `executor` | 宿主认识的逻辑入口标识；实际 JS 模块/导出及 hash 属于 Candidate，不接受模型给出的代码或路径 |
| 就绪检查 | `preflight / requiredPermissions / requiredRuntimeCapabilities` | preflight 为逻辑检查入口，代码绑定在 Candidate；复用现有 Permission/Runtime owners，无依赖也显式为空 |
| 用户授权 | `riskLevel / confirmationPolicy / preview` | preview 为受信逻辑入口，宿主生成预览；P0 默认每次确认，模型不可降低策略 |
| 运行界限 | `executionPolicy` | timeout、取消安全边界、desktop exclusivity、重试/副作用语义；P0 默认不自动重试业务副作用 |
| 模型依赖（条件必需） | `modelPolicy` | 有 LLM/Agent 时声明允许 backend/profile、schema/validator、外发范围、预算及失败方式；纯 JS 明确无模型依赖 |

`candidateRef / qualificationRef` 只在 CatalogEntry 等下游发布记录中绑定，不是 Definition 字段。Qualification status/scope/evidence/version 属于 QualificationRecord 与 Catalog 的受控引用，不复制成描述符中的可写事实。AppProfile 通过 Candidate 引用；Definition 的 supportedScope 只是声明上限，实际允许域取声明范围、资格范围、当前宿主策略和本次授权的交集。

以上是字段职责，不要求新增四套重复业务数据：Definition 的 schema/说明可引用现有合同固定内容，Catalog 只索引它。展示图标、搜索别名、示例问法、作者联系信息、计费、统计、排名、远程发现和复杂依赖求解都不是 P0 放行条件。riskLevel 不能替代实际副作用列表或授权。

### 4.3 Executor 是普通 JS，不是大型 DSL

应用层模块可约定 `preflight(input, context)`、`preview(input, context)`、`execute(input, context)` 等普通函数；这些是拟议内部模块合同，**不是新增 `Capability.run()` 或其他公开 Runtime global**。context 由宿主生成，携带 signal、已授权目标、进度与 Observation 边界，模型不能填写。

优先在同一次受管 Execution 内消费无顶层动作的模块，不为每次 Capability 再启动 OpenDesk。原脚本只有顶层固定执行时，应在作者态产生可调用新 Candidate 并重验；不能假设 import 没有副作用，也不能把函数式重构视为资格不变。

P0 不允许临时组合多个 Capability 成任意 DAG。组合业务可以直接是一个经资格化的普通 JS Recipe；子能力分别通过，不证明跨能力数据传递、确认和副作用顺序已通过。未来组合仍须冻结依赖闭包并验证组合合同。

### 4.4 Planner 与 Resolver

宿主提供经过策略过滤的名称、id、description、输入 schema 与限制；模型只能提议 `capabilityId + arguments` 或 clarify/unsupported。目录版本、实际 capability version、qualificationRef、权限、风险和 executor 都由宿主选择、验证并冻结，不接受模型签发。

Resolver 产生明确结构化结果而非 true/false；目标包括 runnable、clarify、blocked、requalification-needed、repair-needed、extension-needed、gap，具体 enum 随实现统一测试后冻结。Planner 的 unsupported 不能掩盖已有能力或独自判定 primitive 缺失；这些判断来自宿主目录和有证据的可行性核查。

Schema 合法不证明业务正确或授权充分；金额/单位、收件人、时间范围、文件选择和副作用仍需语义校验。额外字段拒绝原则参考 [JSON Schema object](https://json-schema.org/understanding-json-schema/reference/object)；只采用当前 Runtime 真正支持的子集，不把未支持关键字当作已经执行的检查。

## 5. 已有 Capability 的完整运行链

```text
分配 taskId/requestRevision
→ 验证请求、受控 Planner 产生 intent/候选参数
→ Resolver 绑定已发布版本、Candidate 与 Qualification
→ 校验结构、业务参数和授权目标
→ read-only preflight：环境、权限、Runtime primitives、资格、撤销状态
→ 宿主生成可信 preview 并冻结 run binding
→ 用户确认
→ 获取桌面操作排他权，重新检查绑定与即时现场
→ 确定性 Recipe；仅在已声明节点调用 LLM/Agent
→ 关键点 Observation / postcondition
→ resultSchema + 成功标准校验
→ completed / failed / canceled / outcome-unknown
```

加载任何条目代码前先由宿主核查目录可信性、完整性与资格；不能执行未受信 Candidate 的 preflight 来决定它是否可信。预检插件与预览代码同样纳入 Candidate 依赖和审阅，不因名称为 preflight 就免除信任要求。

预览显示应用/账号/对象、输入/来源、会清空/覆盖/发送什么、模型外发、预期读取和停止限制。预览只格式化已校验参数；模型 prose 不是授权文案权威源。

**preflight 不隐式产生副作用。** 应用未打开、必须切前台、滚动或打开授权设置才能继续时，报告需准备，并取得单独受限的 preparation 同意或已有明确授权；准备完成后验证资格，再生成业务预览。不得以“检查环境”名义清空、发送、登录、修改应用或反复打开系统授权窗口。准备动作与业务动作的授权/状态分别记录。

确认至少绑定 task/requestRevision、Definition/Candidate/依赖 digest、qualification ref、参数 digest、相关环境/账号/目标身份、策略版本及有效期。改参数、目录改版、资格撤销、关键环境漂移或超时使旧确认失效。进入桌面锁后再次核验，关键动作前继续检查目标/焦点/布局；预检成功不保证稍后仍成立。

“一个 ChatSession 同时一个任务”不是“整个桌面只有一个执行者”。Chat、Script Runner、Scheduler、其他 Runtime、Recorder/人工教学之间必须协调桌面输入所有权。P0 放行须有可证实的排他/接管边界；尚不能跨 Runtime 强制实现时，只能声明受监督单一操作者范围，不声称无人值守并发安全。离线分析可以并行。

重复确认只启动一次；取消阻止后续动作，不撤销已提交点击或外部副作用。窗口关闭、进程崩溃和未知结果不得统一显示 completed/canceled-safe。进度文字、函数 return 和模型推测不能替代实际读数。

## 6. 能力解析与 Gap 路由

先区分“不理解任务”“当前不能运行”和“没有能力”；不要求所有任务从头经过作者链。

| 情况 | 处置 | 是否修改生产版本 |
| --- | --- | --- |
| 已有 qualified、已发布且当前适用 | 正常校验/确认/执行 | 否 |
| 意图、参数、目标身份歧义 | 澄清；保留候选，不编造默认对象 | 否 |
| 权限/认证/依赖未安装/应用状态不满足 | 具体 guidance、受限准备或有界恢复 | 否；真实底层缺陷另行归因 |
| 已通过资格的 Candidate 尚未发布 | 检查证据、可信来源和发布批准后登记 | 不必重新生成；资格失效先重验 |
| 代码未变，仅证据缺失/过期/环境未验证 | requalification，不先强迫 repair | 新资格记录，不伪造代码变更 |
| 当前 app/layout 下规则失效 | application-engineer repair/harden → 新 Candidate → 重验 | 新版，不覆盖旧版 |
| 相似能力只缺输入范围/新操作 | 增量扩展合同/实现 → qualification delta + 必要回归 | 新发布版本；相似度不是资格 |
| 完全没有能力 | Gap → existing asset lookup → 明确选择 Agent/Human/Recorder | 新候选及资格后发布 |
| Runtime 缺 primitive | 证据化 Runtime gap → [扩展框架](../../frameworks/runtime-api-extension-framework.md) → API/实现/测试 → 原作者工作包 | 先补基础能力，再验 Recipe |
| 平台/政策/授权禁止，或必要风险控制不可实施 | unsupported/policy-blocked，说明不能执行的部分 | 不自动探索、安装、提权或开发 |
| 副作用是否生效不明 | outcome-unknown → 核对/人工接管 | 禁止自动重放；诊断后决定维修 |

Gap 是交接请求，不是执行授权。最小包保存 gapId、request/taskRef、脱敏目标/成功条件、已核查候选及拒绝原因、已知环境/未知项、可复用资产引用、缺失操作/primitive 证据、建议入口、隐私及预算。不得自动移交全量聊天、截图、联系人内容给作者或模型。

“打开微信，找到张三，把今天的报价发送给他”没有能力时，UI 显示当前没有经验证的该能力，提供“创建自动化 / 教 OpenDesk / 录制这个任务”。进入作者态后明确张三的唯一身份、账号、今天所用日期/时区、报价来源/版本、正文/文件、成功读回和发送授权。示范使用明确获准的测试对象或停在发送前；作者授权不自动授权向真实联系人发消息。验收后原请求仍需重新核查报价与收件人并确认，不能沿用开发前的旧预览。

## 7. 两条作者链共享结果，不伪造相同来源

```text
Agent 路：TaskContract/WorkPlan → application-engineer
  → task-demonstrate 的真实 Dossier
  → trace-distill 的 DistilledSteps → procedure-synthesize
  → recipe-build → 可选 code-rebuild → 独立资格

Human 路：人工授权/任务 → Recorder raw/actions + 审阅
  → 仅保真：recorder-script-refiner → 静态 refined Candidate（非业务资格）
  → 业务生产化：human-to-recipe 的 disposition/Episode/SemanticBuildPlan
    ↔ 按需 application-engineer
    → 普通生产 Recipe + 独立 Gate → 独立资格

Existing Assets：冻结已有资产/证据 → 仅补当前缺口 → 独立资格
共同出口：发布规格 + 精确 Candidate + 可复核 Qualification → Catalog
```

共享六类逻辑成果，但**不强制增加六份 JSON 副本**：

| 共同逻辑成果 | Agent 来源 | Human 来源与适配边界 |
| --- | --- | --- |
| Task Contract | 现有 TaskContract | plan 中已确认 intent/约束或其引用；未知意图不能补成已确认 |
| AppProfile | 共享 application-engineer 输出 | 引用同一 Profile/规则，不建 Recorder 专属应用模型 |
| Semantic Procedure | SemanticProcedure / DistilledSteps | plan 的 Episode、数据依赖和 source map；投影不重写 action disposition |
| Recipe Candidate | 普通 JS + CandidateManifest | 精确 production JS + plan/source/依赖映射；Gate 不复制业务动作 |
| Qualification Record | 冻结候选的独立 fresh run | 验精确 production 文件与业务 Oracle；静态 refiner 报告不足以发布 |
| Automation Capability | 共同受控发布合同 | 同一合同，保留 human 来源及限制 |

各自权威来源先保留，用版本化 ref/只读映射消费。投影保存 sourceRef/hash、source format、mappingVersion、字段来源及 unknown；源变更使投影失效，不能双向独立编辑。**业务生产 renderer 未实现，不等于 actions-first refiner 编译器未实现**，两者范围不同。

当前共享 QualificationRecord 的 `qualificationScope.lineage` 仅有 reference-only、continuation-chain、new-generation-chain，不能把 human/agent 塞入该枚举。来源种类与验收链类型是正交维度：P0 发布 handoff 固定原始 source format/ref，由显式适配器核验；需通用字段时在共享合同/schema 做一次版本化增量和兼容测试，旧 consumer 不支持则拒绝。不能把 Human 录制声明成新 Agent 示范。

## 8. application-engineer 的共享位置

保留 `workflows/agent-to-recipe/skills/application-engineer/`，供 Human、Agent 和 Failure repair 引用；本轮不移动、复制或新建 shared-app-engineer。目录归属不妨碍共享。

- discover：新应用/页面且缺必要认识，建立足够当前任务的最小规则，不做全应用普查。
- harden：已有认识但某操作缺定位、状态准备、读取、等待或后置保障；有效部分继续复用。
- repair：消费精确 Failure Package、旧 Profile/helper 及受影响范围，定向修规则并给重验请求。

三模式由证据缺口决定，不把所有新操作机械判 harden。交付 AppProfile、规则/helper、来源、unknown、局部验证及资格范围建议；**不签发整份 Recipe 的资格，不拥有业务成功标准、最终 Recipe 或发布审批**。

Calculator、微信、Excel、ERP 的差别主要应是版本化应用规则和业务 Recipe，不是四套窗口识别、权限服务、Chat Runner 或 Recorder 模型。共同 primitive 继续交原 Runtime owner，而非每个 Profile 手写一份 Runtime。

## 9. Independent Qualification 与发布

独立性不是“另起模型说通过”，也不强制每阶段另起 Agent。至少隔离四项：冻结候选与依赖；预先确定业务标准/场景；fresh run 与独立 Observation/Oracle；验收过程不改候选或降低标准。同一操作人员可以启动固定 Gate，但需记录真实执行者和隔离方式；没有独立上下文不能声称无历史交接测试通过。

QualificationRecord 沿用共享字段，绑定实际 Candidate/hash、Runtime/UI-host provenance、环境/版本/locale/layout、测试参数域、实际命令/工作目录、requested/exercised/qualified/excluded、结果、证据及未运行项。recipe-qualify 首版应复用 Human Gate 的“执行真实 production 文件而非第二份动作实现”规则。

```text
冻结 Definition + Candidate/dependencies
→ 固定 requested scope / criteria / test plan
→ 授权测试 → fresh run → 独立读回 / 反例 / 取消 / 回归
→ pass / fail / not-run / blocked
→ pass 且覆盖拟发布范围
→ 明确发布批准 + 来源/路径/hash/证据检查
→ staged release → 原子发布目录快照
```

关键 fail/not-run/blocked 不能靠缩小 requested 冒充原请求通过；要更窄发布，应先明确变更发布合同和请求范围，保留旧失败。qualification delta 是影响分析、复用仍有效旧证据、补新场景和必要回归的组合，不是复制旧 pass 到新 hash；依赖不明时扩大重验。

资格信息三处各有职责：authoring 工作包保存尝试过程；不可变 QualificationRecord 保存权威资格；Catalog 仅保存引用/发布状态与可重建摘要。截图/日志仍使用 `.runtime/automation-authoring/<task-id>/` 和 Execution.artifactDir。`.runtime/` 可清理，**不能成为已发布能力唯一证据库**：发布前将必要证据按授权脱敏保留到明确、不会随运行清理的 release evidence 根，并记录引用/权限/保留策略；没有持久证据设施就阻止相应范围发布。

P0 随产品交付维护者批准的本地只读 release，避免现在增加存储平台。候选、预检、预览、schema、Profile、模型策略及实际依赖均进入完整性检查。hash 只证明字节一致，不证明可信发布者；可信来源和审核不能省略。用户自装包的签名/分发/远程 Registry 后置，不与 App Package、`.odpkg` 源码保护/授权混为资格。

目录发布拒绝半写入、重复 id/version 指向不同内容、越界路径、符号链接逃逸、缺失引用、未知 schema 和过宽 scope。完整校验的快照才可见；并行维护者按旧 revision/hash 比较更新，冲突重新读取。撤销是目录策略事件，不篡改旧 Qualification；回退只选仍可信且适用于当前环境的已发布版本，不偷偷用已撤销或过期版本。

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

版本范围只取真实验证范围，禁止见过一个版本就声明任意新版本兼容。版本号未知、layout 指纹缺失、locale 未验证均返回 unknown/unsupported-scope，不按“看着差不多”放行。区分允许的窗口整体平移与未验证的 resize/reflow/DPI 差异；Profile 声明允许变化，现场 guards 仍须执行。

旧 app 环境仍满足资格时，旧版本不必全局撤销；新环境用 blocked/requalification-needed。已确认安全缺陷才按影响范围 suspend/revoke。仅未测试与已证明错误不是同一状态，不能一律从头开发。

## 11. Runtime Failure → Repair → Requalification

Failure Package 是现有失败体系的交接封装，不是第二套 taxonomy。最少保存 task/run/stepId、精确 capability/candidate/qualification/Profile 版本、脱敏参数与授权引用、实际环境、最后关键 Observation、原始错误、primary F0—F10 与有证据的原因/未知、已尝试恢复、证据引用及保留权限。

必须附动作后果状态：未提交、已提交待核对、效果已确认或效果未知；native provider 无法可靠给出时标 unknown，不自造 exactly-once。关键动作边界正常留证，不能失败后补造现场。

| 原因 | 默认责任/去向 | 不应发生 |
| --- | --- | --- |
| 参数/目标理解错误 | 澄清或 planning 修正；F0/F3 | 用户输错却修改生产 Recipe |
| 权限/认证/应用未就绪 | 原 Permission/Runtime/preflight owner；F0 | 每检查一次打开新授权窗口 |
| Observation 不完整、目标歧义 | 有界重新读取或 application-engineer；F1/F2/F4 | 猜结果、放宽窗口/对象约束 |
| app/layout/locator 失效 | application-engineer harden/repair；按证据 F0/F4/F6 | 每次重新认识整个应用 |
| 必要路径/语义/数据依赖错误 | trace-distill / procedure-synthesize；Human 修原 plan；F3/F6 | 两条链各维护不同步骤事实 |
| JS 异步/API/错误处理缺陷 | recipe-build；独立质量目标才 code-rebuild | 运行中热改脚本继续算旧资格 |
| Runtime primitive 不足/缺陷 | 扩展框架 / 原 owner | 任意 Shell/桌面 Agent 绕过 |
| 证据或 Gate 自身缺陷 | qualification/evidence owner；F6/F7 | 测试故障直接算业务缺陷 |
| 外部结果未知 | 停止、核对/人工接管；F5/F6/F8 | 自动重发报价、重复支付或删除 |

修复生成新 Candidate，重新 qualification 后发布新 capability version。只有代码完全未变、仅重验同一候选时，可追加新资格记录和目录 revision，不为版本号假装修复；运行始终固定实际记录。共享 Profile/helper 更新要分析依赖它的其他能力，不允许只验一个用例却让其他条目静默消费新规则。

运行中可以执行已资格化、预先声明、有限次数且未越权的恢复规则；这是执行行为，不是在线自修改。无新证据的相同失败停止重复尝试。repair/重验/发布仍受总预算、隐私授权与唯一写入者约束。

## 12. 混合 JS + LLM + Agent Recipe

Capability 是可信业务合同，不是纯坐标宏，也不是自由 Agent 会话。

```text
普通 JS 读取本次真实内容
→ 已声明判断节点调用 LLM.generate() 或受控 Agent.run()
→ result.data 结构与语义校验
→ 严格枚举/有界参数
→ 普通 JS 选择已验证分支并执行
→ 真实 Observation 验证
```

LLM.generate 适合分类、提取等有限判断；Agent.run 用于确需外部 Agent CLI 的受控推理，并复用当前 Agent/Command/Execution owner。点击、定位、等待与数据传递默认用确定性代码，模型不是每一步桌面动作的执行器。

模型策略属于候选依赖：backend/profile、允许模型范围、prompt/schema/validator 版本、工具边界、外发数据、超时/重试/调用预算、拒绝/歧义/不可用/超限行为均需固定。模型/策略变更先做影响分析，未资格化配置拒绝。远程模型不能保证永久行为不变；保存配置/版本可观测性、评测集及失效条件，不声称整条混合 Recipe 完全确定。

邮件、网页、控件文本、录制注释均只作数据，不能升格为指令、工具授权或目录 metadata。模型返回值不能作为代码、路径、shell 或权限参数执行。无法判断则 unknown 并停止/人工处理，不随意分类后继续高风险动作。模型影响外发对象/正文时，在最终副作用前展示实际对象/正文并确认；初始流程确认不能替代尚未知内容的批准。

read-only sandbox 不等于零工具权限或业务授权。适配器工具关闭、配置隔离及 saved auth 边界须按源码和实际 CLI 版本验收，不能只写 prompt；可参考 [Codex non-interactive](https://developers.openai.com/codex/noninteractive/) 与 [security](https://developers.openai.com/codex/security/)，但上游说明不是 OpenDesk 本机通过证据。

## 13. 统一任务分解树

按生命周期结果拆任务，不替代现有 S/H 内部树，也不要求一个节点对应一个 Skill。

- **OpenDesk Automation Capability Lifecycle**
  - **A. 接住用户业务请求**
    - 保存 taskId、请求版本、目标、输入来源和约束。
    - 受控 Planner 仅提议 capabilityId/参数；意图或对象歧义先澄清。
    - Normal/Authoring 模式明确分开，分别核对权限和预算。
  - **B. 判断当前是否拥有可用能力**
    - 查询可信本地目录，取得固定 Definition/Candidate/Qualification。
    - 核查语义匹配、输入域、发布/撤销、证据和依赖完整性。
    - 核对平台、应用版本、layout、locale、Runtime 与权限。
    - 输出可运行、需准备、待发布、待重验、待维修、待扩展、Gap 或策略阻塞。
  - **C. 安全完成已有业务**
    - 参数/语义校验，只读 preflight，必要准备另行授权。
    - 宿主预览与确认绑定，改版/改参/过期即失效。
    - 取得桌面操作权并重查现场，再执行普通 JS。
    - 声明节点内进行有限模型判断，严格校验后进入固定逻辑。
    - 保存实际读值与副作用状态，支持停止/接管，按真实结果结束。
  - **D. 将能力缺口变为可接续工作包**
    - Gap 保存拒绝原因、未知、所需操作和资产引用。
    - 先查已有 Candidate、Profile、Procedure、录制及资格证据。
    - 选最小路径：登记、补证、维修、增量扩展或新生产。
    - 用户明确进入创建/教学/录制；primitive gap 交原扩展框架。
  - **E. 生产有来源的候选**
    - 建立 TaskContract/WorkPlan 和可读业务步骤，不要求用户填 JSON。
    - 共享 application-engineer discover/harden/repair，仅补缺口。
    - Agent 路保留 Dossier → DistilledSteps → SemanticProcedure。
    - Human 路保留 raw/actions → 审阅/disposition → SemanticBuildPlan/Episode。
    - 未知来源、动作歧义和权限缺口保留 blocked，不伪造统一事实。
    - 生成普通 JS 与 CandidateManifest；code-rebuild 可选。
  - **F. 独立证明资格**
    - 冻结候选/依赖、requested scope、成功标准与计划。
    - fresh run，独立结果，验证变化参数、环境反例、取消和副作用边界。
    - 分开静态、mock、应用局部、业务、真实 UI 及跨平台证据。
    - 失败只提交修复请求；新候选重验，不验中改码自报通过。
  - **G. 发布、发现与复用**
    - 核对可信来源、scope 不扩大、证据持久保留和明确发布批准。
    - 原子登记固定版本，拒绝半包/越界/hash 漂移/版本冲突。
    - Chat/Scheduler 等入口复用同一目录与放行规则，不各写应用 if/else。
    - 发布不自动执行旧请求，重新核对时效数据、预览与确认。
  - **H. 从失败中维修与演进**
    - Failure Package 保存旧版本、现场、读值、失败类及副作用后果。
    - 区分参数、权限、环境、定位、过程、代码、Runtime 和资格自身问题。
    - 合格恢复规则内有界恢复，结果未知先核对，禁止盲重放。
    - 修最小受影响部分，传播依赖影响，delta + 必要回归。
    - 新资格/新发布版本或撤销；保留旧记录，不篡改历史。
  - **I. 贯穿治理**
    - 单桌面操作所有权，并行作者的版本/写入冲突控制。
    - 最小数据、模型外发、Secret 引用、证据保留和删除权限。
    - 时间/调用/重试/费用预算、人工接管和未知结果状态。
    - 可追踪来源、真实完成度，设计分数不冒充运行资格。

## 14. P0 / P1 / Later

### 本轮实际交付边界

本轮完成架构、任务树、职责/数据合同、基线核对和文档导航；不声称实现 Catalog、发布器或新 Skill，不改 Runtime/现有 Recipe，不运行 Calculator/Codex/Recorder。设计评审与业务验收分开。

### P0：下一实施批先闭合信任门

1. 最小 Definition/CatalogEntry/发布清单、本地静态目录、版本/hash/scope 校验；先拒绝未经验证 Candidate，再接 Planner。
2. 抽出 Chat 通用 TaskSession/Resolver 合同，Calculator 两任务成为条目候选；不能继承 golden 资格。固定模块入口，目录发现无 import 副作用。
3. Gap/Failure Package 的可接续工作包与结构化 blocked/unknown；Normal Mode 不生成代码、不自动安装作者 Skill。
4. 共享 recipe-qualify 正式方法入口、离线检查和真实运行交接，复用 Candidate/Qualification/Gate；补 Human 发布 handoff 的最小适配，不重写其 plan。
5. 本地显式 publish/suspend/revoke 与证据留存；确认绑定、版本漂移拒绝、单桌面执行、取消/未知效果边界均可测试。
6. Calculator 精确输入/layout 范围的真实 qualification 与公开 UI 验收后才进入 Normal Mode；仅 mock 时仍为候选。

### P1：提高生产效率并验证第二应用

- 逐个补齐有稳定消费者的 automation-plan、task-demonstrate、trace-distill、procedure-synthesize、recipe-build 方法入口；先补阻断接续的职责，不恢复旧目录占位。
- application-engineer 的跨 Agent/Human/Failure 调用及版本影响传播；第二个低风险应用建立真实 golden 和双来源发布验证，证明不是 Calculator 专用。
- 参数/操作扩展、qualification delta、共享依赖回归、repair 工作台和人工交接。
- 明确需求出现后建设 code-rebuild，不作所有生成的强制下一站；Human 通用业务 renderer 按收益推进，不阻塞现有 JS/refiner。
- 混合 JS/LLM/Agent 分类案例、模型配置变化回归、最终实际内容确认；扩大跨 Runtime 桌面控制范围前补强底层保证。

### Later：不作为当前闭环前提

插件市场、远程 Registry、计费/评分、任意包自动安装、复杂依赖求解、DAG/Workflow IR、Compiler 必经路径、独立 Replay Runtime、无限制桌面 Agent、一键无人审自主发布均后置。

“一键创建自动化”可以压缩界面操作，但内部仍保留 authoring → candidate → independent qualification → publish；高风险动作仍需人审/细粒度授权，一个总确认不能消除权限边界。

## 15. 实施验收用例与评分边界

以下为待运行要求，本轮没有 PASS 数量：

| 用例 | 必须证明 |
| --- | --- |
| Qualified existing | 精确版本、参数/环境在范围内；确认后才有动作，结果来自 Observation |
| Catalog gap | 生成 Gap，无新代码、Shell、桌面探索或自动发布 |
| Invalid/ambiguous intent | 未知字段/id/参数域/收件人歧义在副作用前阻止 |
| Unpublished/stale evidence | 区分待发布/待重验，不重新开发、不滥用旧资格 |
| Version/layout/locale drift | 未验证环境拒绝；允许平移与未验证 resize 分开 |
| Confirmation drift | 改参数/代码/目录/资格/账号/目标后旧确认失效 |
| Candidate integrity | 改 helper/preview/preflight/schema/model policy 不能沿用旧闭包资格 |
| Publication integrity | 半写入、同版不同内容、路径逃逸、缺证据、撤销后调用均拒绝 |
| Independent qualification | Gate 执行真实候选，expected 不进生产读值；验中改码产生新候选 |
| Dual authoring lineage | Agent/Human 同合同发布，来源和原 schema 不被伪改 |
| Static refiner boundary | 静态保真 PASS 不能单独进入 Normal Catalog |
| Cancel/concurrency | 取消停止后续动作、排他生效、接管不交错 |
| Unknown side effect | 发送后断连不自动重发，保留 unknown 并核对 |
| Directed repair | 复用有效资产、定向重验，原运行版本不可变 |
| Hybrid model | 非法枚举/拒绝/注入/超时/模型变化不能越权或猜结果 |
| Evidence retention | 清理不使发布记录伪装可复核；关键证据缺失阻止放行 |
| Current real entry | 当前构建的公开命令、真实模型/桌面/视觉分别留证 |

本架构采用自评而非虚构多专家实测：完整性 24/25、一致性 19/20、职责/安全边界 20/20、可实施性 18/20、避免重复系统 15/15，设计评分 **96/100**。扣分来自发布/schema 适配尚待实现验证，以及跨 Runtime 桌面所有权/证据持久化需具体落地核对。该分数不是产品完成率、不是 Skill 安装状态，也不是 Calculator/微信运行资格；运行资格继续按实际证据判断。
