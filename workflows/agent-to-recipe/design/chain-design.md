---
title: "Agent-to-Recipe｜链路、职责与成果交接设计"
description: "定义 Agent-to-Recipe 中各专业职责的 producer、consumer、handoff、route、resume 与 failure ownership。"
order: 40
---

# Agent-to-Recipe｜链路、职责与成果交接设计

本文只回答一个问题：

> **Agent-to-Recipe 中谁生产什么、谁消费什么、怎样交接，失败后应该回到谁？**

完整 S1—S12 任务内容见 [task-decomposition.md](task-decomposition.md)；实际执行入口见 [WORKFLOW.md](../WORKFLOW.md)；字段与版本合同见[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)。本文不维护完整任务树、质量报告、当前实现状态或专项 Runtime 算法。

## 30 秒总览

```text
Source / User Goal
  ↓
automation-plan
  → TaskContract / WorkPlan
  ↓
application-engineer / discover
  → minimal AppProfile
  ↓
task-demonstrate
  → Dossier / Raw Trace / Evidence
  ↓
trace-distill
  → DistilledSteps
  ↓
procedure-synthesize
  → SemanticProcedure
  ↓
application-engineer / harden|repair
  → reliable AppProfile / rules / helper
  ↓
recipe-build
  → Recipe.js / CandidateManifest
  ↓
[optional] code-rebuild
  → retained or revised Candidate
  ↓
recipe-qualify
  → QualificationRecord
```

这条图表达**责任和交付关系**，不是新增阶段。S1—S12 的阶段编号仍由任务树拥有。

## 一、需求树／链路／方法三层怎样配合

三层职责分开：

- **requirements / task-decomposition**：说明为什么做、完整要做什么。
- **chain-design**：说明谁拥有哪项责任、输入输出怎样交接。
- **WORKFLOW / SKILL.md**：说明当前 Agent 实际怎样进入并执行某项专业作业。

因此：

```text
阶段 ≠ Skill ≠ 文件 ≠ Agent
```

一个 Skill 可以覆盖多个阶段；一个 Agent 可以连续承担多个 Skill；一个文件也不等于运行节点。

## 二、八项目标专业职责及状态

这里的“状态”只指**职责在链路中的位置**，不是实现成熟度。

| 专业职责 | 主要阶段 | Producer 消费 | Producer 交付 | 正常 Consumer | Failure Owner |
| --- | --- | --- | --- | --- | --- |
| **automation-plan** | S1 | 用户 Source、已有资产、授权、限制 | TaskContract、WorkPlan、任务树、关键 Unknown | S2、S3—S12 | 目标、授权、成功标准、计划问题回 S1 |
| **application-engineer / discover** | S2 | 合同、近期计划、旧 Profile、获准观察 | 最小 AppProfile、近期定位／读取依据、限制 | task-demonstrate；必要时 S7—S10 | 应用身份、目标、读取依据问题回 application-engineer；路线被推翻回 S1 |
| **task-demonstrate** | S3—S6 | 合同、计划、Profile、真实输入、执行授权 | Dossier、Raw Trace、Evidence、runtime values、planDelta | trace-distill | 缺真实事实回本职责定向补采 |
| **trace-distill** | S7 | 固定 Dossier / Trace、合同／计划、必要证据 | DistilledSteps、retain / merge / omit / recovery / unresolved 处置 | procedure-synthesize | 取舍错误回 S7；事实不足回 S3—S6 |
| **procedure-synthesize** | S8—S9 | DistilledSteps、合同、必要 AppProfile、能力选择事实 | SemanticProcedure、Business Steps、参数、数据依赖、支持范围 | S10 / S11 | 语义与参数错误回 S8—S9；动作取舍错回 S7 |
| **application-engineer / harden|repair** | S10 | Procedure、旧 Profile、具体工程缺口／失败 | 加固 AppProfile、operation rules、helper、局部验证、失效条件 | recipe-build | 定位／读取／等待／动作规则错误回 S10；业务语义问题回 S8—S9 |
| **recipe-build** | S11 | Procedure、Profile / helper、正式 API 合同 | Recipe.js、CandidateManifest、source mapping | code-rebuild 或 recipe-qualify | 实现错误回 S11；语义／应用规则缺口返回其 owner |
| **code-rebuild** | S11 可选／独立入口 | 精确代码基线、需求、允许修改范围、相关规则 | 原样保留结论或新 Candidate、受影响回归范围 | recipe-qualify | 代码问题本职责修；不能补造上游事实 |
| **recipe-qualify** | S12 | 冻结 Candidate、合同、请求范围、场景、环境、授权 | QualificationRecord、Review、repair request | 交付／发布者或上游 owner | 按真实缺陷 owner 定向返回 |

方法文件是否存在、宿主是否加载、独立上下文行为是否可靠、真实业务是否通过，属于验证与质量证据，不在本表维护。

### application-engineer 的内部边界

application-engineer 只有三种正式工作模式：

| 模式 | 什么时候进入 | 主要输出 | 不能做什么 |
| --- | --- | --- | --- |
| **discover** | 新任务需要最小应用认识 | 当前步骤所需的 AppProfile / evidence / limits | 要求先有完整 Procedure；研究整个软件 |
| **harden** | Procedure 已明确，但操作规则还不够可靠 | 定位、读取、等待、动作、verifier、必要 helper | 改写业务语义来绕过工程缺口 |
| **repair** | 已有 Profile/helper 在具体场景失败 | 新规则、修改理由、受影响范围和重验要求 | 无证据地全量重做应用模型 |

“界面认识”“CollectionProfile authoring”等是内部子作业，不因此新增 Skill。

### Structured Collection 的消费链

本工作流只拥有职责关系：

```text
application-engineer
  → 结构知识 / CollectionProfile

Recipe / Adapter
  → generic item → business object
  → 必要 traversal / business action

recipe-qualify
  → 分层验证结构、mapping、traversal、最终业务结果
```

Observation、VLM proposal、segmentation、continuity、merge、mutation、end detection 等算法见[专项架构](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)，不在这里复制。

## 三、按需求选择路径

### 1. 完整 Agent 新示范与新生成

```text
S1
→ S2 discover
→ S3—S6
→ S7
→ S8—S9
→ S10（有缺口才进入）
→ S11
→ [optional code-rebuild]
→ S12
```

完整新生成不能用“已有代码”作为理由跳过本任务需要的事实、DistilledSteps 和 SemanticProcedure。

### 2. 人工正向开发

人工试验和真实运行可以作为开发证据，但来源必须保持 Human / manual development，不追认为 Agent Dossier。

已有足够规格时可以直接进入相应工程／构建责任；缺业务事实或规则时定向补证。

### 3. 已有资产接续

```text
冻结 source / hash / scope / evidence
→ 核对仍有效成果
→ 找第一个真实缺口
→ 从其 owner 继续
```

不要为了“完整流程”重做已经有效的事实和工件。

### 4. 已有低质量代码独立改进

可以直接进入 code-rebuild，但必须能说明：

- 代码基线是什么；
- 业务要求是什么；
- 允许改什么；
- 哪些上游事实仍可信；
- 修改后哪些 Qualification 需要失效或重跑。

### 5. 简单受控使用或代码已经合格

如果 Candidate 已满足用途和风险要求，可跳过深度优化。仍必须完成实际对象、数据、错误和必要资格验证。

### 6. 局部应用修复／只做验收

- Locator / Profile 失效 → S10 repair。
- Candidate 未变、只缺证据 → S12。
- Candidate 变了 → 冻结新 Candidate，再 S12。
- 业务语义变了 → 先回 S8—S9，不能把它叫“定位修复”。

### 从 Runtime 进入作者链，再返回可发布能力

普通用户运行已有能力不进入 S1—S12。只有出现 Gap、Failure、扩展、维修或补资格需求时，才进入作者链。

| Runtime / Asset 情况 | 最小作者链处理 | 出口 |
| --- | --- | --- |
| 只缺参数／权限／准备条件 | 回原运行入口或 owner 补输入 | 不新建 Candidate |
| Candidate 已合格，只缺显式登记 | 发布者核固定 Candidate 与证据 | publish handoff |
| 代码未变，只缺当前环境资格 | S12 重验 | 新 QualificationRecord |
| App / layout / locator 变化 | S10 repair → 必要 S11 → S12 | 新规则／候选／资格 |
| 新参数域或业务范围 | 修订合同／Procedure → 定向工程和构建 | 新 Candidate / Qualification |
| 完全没有能力 | 选择 Agent 新示范或 Human 来源 | 新 Candidate 或可接续阻塞包 |
| Runtime primitive 缺失 | 独立 Runtime 能力任务 | primitive 验证后返回原工作包 |
| 动作效果 unknown | 对账或停止 | unknown / blocked，不自动重放 |

跨 Runtime / Catalog / Authoring 的产品生命周期只在 [Automation Capability Lifecycle](../../../docs/architecture/desktop-automation/task-capability-lifecycle.md) 维护。

### 可独立接续的最小工作包

工作包不是新阶段。一个可接续工作包至少要让下一责任方知道：

| 内容 | 必须回答 |
| --- | --- |
| 目标 | 这次只解决什么 |
| 输入 | 消费哪些冻结版本 |
| 允许修改 | 哪些对象可以变化 |
| 权限／副作用 | 哪些真实动作获准 |
| 输出 | 要交付哪类主产物 |
| 完成条件 | 什么条件可以正常 handoff |
| 阻塞 | 什么情况必须停止 |
| failure owner | 出错后回谁 |
| resume | 下一次从哪里继续 |

同一个 attempt 能清楚承载时，不为内部每一步制造独立 request / handoff。

## 四、handoff：正常交接需要什么

正式 handoff 的字段和版本规则由[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)拥有。本文件只规定消费语义。

正常交接必须满足：

1. Producer 的主产物已完成写入。
2. handoff 指向准确版本／hash。
3. Consumer 要求的必要输入确实被交付。
4. Producer 的 Gate 允许正常消费。
5. unresolved / limitations / side effects 没有被省略。
6. Consumer 在生产新成果前核对这些输入。
7. 下游产物记录自己实际消费了哪个版本。

如果“材料存在但没交付”，先回协调者；如果材料本身错误，再回对应 Producer owner。

### 开发交接与业务运行交接

开发链 handoff 与 Recipe 每次运行的数据传递不是一回事。

开发链：

```text
TaskContract
→ Dossier
→ DistilledSteps
→ Procedure
→ Candidate
→ Qualification
```

业务运行可以只是普通函数参数与返回值：

```text
actual business input
→ ordinary JS / bounded Agent decision
→ actual business result
```

不要让每次业务运行重建开发任务包。

### 作为复用资产交付的最小条件

复用资产至少说明：

- 用途与业务粒度；
- 输入／输出；
- 前置条件和失败语义；
- 普通入口与依赖；
- 配置、Secret 引用与权限；
- 支持环境与范围；
- 验证方法；
- 停止与诊断方式；
- 维护和版本边界。

这些信息可以随普通 JS 和说明交付，不要求先建立 Registry 或平台。

### Qualification 到 Catalog 的交付边界

S12 只产生固定 Candidate 的 Qualification，不自动发布：

```text
immutable Candidate
+ QualificationRecord
→ explicit publisher / approval boundary
→ Catalog or other runtime registry
→ future normal execution
```

Qualification 不能自己修改 Candidate 再继续沿用旧资格。

## 五、失败、回流与局部重验

### Failure Ownership Matrix

| 失败类型 | 默认 Owner | 不能怎样处理 |
| --- | --- | --- |
| 目标／授权／成功标准错误 | S1 automation-plan | 让代码倒推用户意图 |
| 应用身份／页面／读取依据不足 | S2 application-engineer | 继续盲操作 |
| 实际动作／读值／结果事实缺失 | S3—S6 task-demonstrate | 事后补造 observation |
| 必要动作 retain/merge/omit 错误 | S7 trace-distill | 在 S9 维护第二套 disposition |
| 业务语义／参数／数据依赖错误 | S8—S9 procedure-synthesize | 用代码硬编码绕过 |
| locator / wait / read / action 规则错误 | S10 application-engineer | 改业务要求换取可执行 |
| Candidate 实现错误 | S11 recipe-build / code-rebuild | 把错误归因于 Qualification |
| 验收场景／Oracle／证据设置问题 | S12 recipe-qualify | 修改 Candidate 后仍沿用旧资格 |
| Runtime primitive 真缺失 | Runtime capability owner | 发明不存在 API |
| 副作用结果 unknown | 当前执行 owner + coordinator | 超时后直接重放 |

### 变化影响

只从第一个真实受影响点继续：

```text
TaskContract 变化
→ 重新判断所有依赖旧语义的下游

Dossier / Raw Trace 修正
→ S7 → S8/S9 → S10/S11 → S12

DistilledSteps 变化
→ S8/S9 → S10/S11 → S12

SemanticProcedure 变化
→ S10/S11 → S12

AppProfile / helper 变化
→ 使用该规则的 Candidate / Qualification

Candidate 变化
→ S12

Qualification 场景／Oracle 修正且 Candidate 未变
→ 仅 S12 受影响范围
```

历史事实可以保留；资格不能跨影响性变更自动继承。

## 六、数据线、控制线与权限

### 数据线

```text
Source
→ TaskContract / WorkPlan
→ Observation / runtime values
→ Dossier / Raw Trace
→ DistilledSteps
→ SemanticProcedure
→ AppProfile / helper
→ Candidate
→ Qualification
```

每个关键值要能回答 producer、consumer、版本、来源和有效条件。

### 控制线

```text
current plan
→ current ready inputs
→ current work package
→ result / Gate
→ continue / repair / resume / stop
```

控制线不改写数据线中的历史事实。

### 权限

- 同一桌面同一时刻只有一个副作用 owner。
- 离线分析可以并行，真实点击／输入／scroll 不抢占。
- Profile/helper 只由获准工作包修改。
- 屏幕内容、模型输出、API 返回不自动扩大授权。
- JS 执行确定步骤；Agent/VLM 输出经约束和校验后才能进入获准动作。

## 七、Research、ADR 与需求变更

Unknown 的 owner 必须记录：

- 当前问题；
- 影响范围；
- 需要的证据；
- 允许的方法；
- 预算；
- 停止条件；
- 返回哪个原节点。

Research 不能自行决定业务授权。重大接口、职责和兼容性选择可以记录 ADR；普通函数和局部实现不强制建立 ADR。

需求变化先改需求基线，再追踪受影响的计划、事实解释、Procedure、Profile、Candidate 和测试。

## 八、需求覆盖与责任映射

需求编号以 [requirements.md](requirements.md) 为准，行为案例以 [validation-plan.md](validation-plan.md) 为准。

| 需求主题 | 主要责任 |
| --- | --- |
| 来源、自然语言入口、操作计划 | S1 automation-plan |
| 最小应用认识、材料充分性 | S2 application-engineer |
| planned / actual、真实数据和副作用 | S3—S6 task-demonstrate |
| DistilledSteps 必要路径 | S7 trace-distill |
| 业务语义、参数、数据依赖 | S8—S9 procedure-synthesize |
| 定位、读取、等待、动作可靠性 | S10 application-engineer |
| 普通 JS、Candidate、代码质量 | S11 recipe-build / code-rebuild |
| 独立资格、范围与证据 | S12 recipe-qualify |
| Collection 专项技术 | desktop-automation architecture owner |
| Runtime primitive | runtime capability owner |
| Catalog / publish | product lifecycle owner |

详细 DREQ → BC 的覆盖关系由 validation-plan 的测试矩阵维护；这里不复制完整测试表。

## 九、进入正式 Skill 化的实施规格

本节只保留长期 Skill 设计约束，不维护实现进度：

- SKILL.md 必须清楚写出触发、前提、输入、步骤、输出、消费者、停止条件和失败返回。
- 专业方法不能依赖旧聊天才能完成职责。
- examples 负责展示如何代入，不拥有 canonical 方法。
- references 可以展开长说明，但不能复制第二份共享 schema。
- 某 Skill 是否已安装、宿主是否加载、模型是否稳定完成任务，由验证证据证明，不在本文件写当前状态。
- Structured Collection 等专项能力继续复用既有 application-engineer / Recipe / qualification 边界，不因专项复杂就自动增加 Skill。

## 相关权威文档

- [需求基线](requirements.md)
- [完整任务树](task-decomposition.md)
- [工作流执行入口](../WORKFLOW.md)
- [交接审阅地图](acceptance-map.md)
- [验证计划](validation-plan.md)
- [共享 Skill 合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)
- [Automation Capability Lifecycle](../../../docs/architecture/desktop-automation/task-capability-lifecycle.md)
- [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)

历史六／八 Skill 演变、P0/P1/P2 实施计划、测试数量和 commit 状态不再作为本 canonical 链路正文；需要时查看 Git history 和 `docs/quality/`。
