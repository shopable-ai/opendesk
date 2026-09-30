---
title: "Agent-to-Recipe｜链路、职责与成果交接设计"
description: "定义 Agent-to-Recipe 中各专业职责的 producer、consumer、handoff、route、resume 与 failure ownership。"
order: 40
---

# Agent-to-Recipe｜链路、职责与成果交接设计

本文只回答一个问题：

> **Agent-to-Recipe 中谁生产什么、谁消费什么、怎样交接，失败后应该回到谁？**

完整 S1—S12 任务内容见 [task-decomposition.md](task-decomposition.md)；实际启动、协调和断点恢复见 [RUN.md](../RUN.md)，生命周期解释见 [WORKFLOW.md](../WORKFLOW.md)；字段与版本合同见[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)。

本文不维护完整任务树、测试结果、当前实现状态、专项 Runtime 算法或 Skill 安装历史。

## 30 秒总览

```text
Source / User Goal
  ↓
automation-plan
  ── TaskContract / WorkPlan ──▶
application-engineer / discover
  ── minimal AppProfile ──▶
task-demonstrate
  ── Dossier / Raw Trace / Evidence ──▶
trace-distill
  ── DistilledSteps ──▶
procedure-synthesize
  ── SemanticProcedure ──▶
application-engineer / harden|repair
  ── reliable Profile / rules / helper ──▶
recipe-build
  ── Recipe.js / CandidateManifest ──▶
[optional] code-rebuild
  ── retained / revised Candidate ──▶
recipe-qualify
  ── QualificationRecord ──▶
delivery / explicit publish boundary
```

这张图表达**责任和交付关系**，不是新的阶段编号。

## 一、职责链：Producer → Artifact → Consumer

| 专业职责 | 主要阶段 | Producer 消费 | Producer 交付 | 正常 Consumer | Failure Owner |
| --- | --- | --- | --- | --- | --- |
| **automation-plan** | S1 | 用户 Source、已有资产、授权、限制 | TaskContract、WorkPlan、关键 Unknown | 后续需要这些合同信息的职责 | 目标、授权、成功标准、计划问题回 S1 |
| **application-engineer / discover** | S2 | 合同、近期计划、旧 Profile、获准观察 | 最小 AppProfile、定位／读取依据、limits | task-demonstrate；必要时后续应用工程 | 应用身份、目标、读取依据问题回 application-engineer；路线被推翻回 S1 |
| **task-demonstrate** | S3—S6 | 合同、计划、Profile、真实输入、执行授权 | Dossier、Raw Trace、Evidence、runtime values、planDelta | trace-distill | 缺真实事实回本职责定向补采 |
| **trace-distill** | S7 | 固定 Dossier / Trace、合同、必要 evidence | DistilledSteps + disposition + source refs | procedure-synthesize | 取舍错误回 S7；事实不足回 S3—S6 |
| **procedure-synthesize** | S8—S9 | DistilledSteps、合同、必要 AppProfile | SemanticProcedure、Business Steps、参数、数据依赖、支持范围 | S10 / S11 | 语义／参数错误回 S8—S9；取舍错回 S7 |
| **application-engineer / harden|repair** | S10 | Procedure、旧 Profile、工程缺口／失败 | 可靠 AppProfile、operation rules、helper、局部证据 | recipe-build | 定位／读取／等待／动作规则错误回 S10；业务语义问题回 S8—S9 |
| **recipe-build** | S11 | Procedure、Profile/helper、正式 API 合同 | Recipe.js、CandidateManifest、source mapping | code-rebuild 或 recipe-qualify | 实现错误回 S11；上游缺口返回其 owner |
| **code-rebuild** | S11 可选／独立入口 | 精确代码基线、业务依据、修改范围 | 原样保留结论或新 Candidate、回归范围 | recipe-qualify | 代码问题本职责修；不能补造上游事实 |
| **recipe-qualify** | S12 | 冻结 Candidate、requested scope、场景、环境、授权 | QualificationRecord、repair request | 交付／发布边界或缺陷 owner | 按真实缺陷 owner 定向返回 |

> **粒度说明：** 上表按专业职责和外部 handoff 分组，所以 task-demonstrate 一行覆盖 S3—S6、procedure-synthesize 一行覆盖 S8—S9；这不是阶段合并。内部仍分别是 S3 执行、S4 观察验证、S5 分类决策、S6 任务收口，以及 S8 业务语义、S9 复用规格。需要定位“哪一个正式阶段先错”时，使用 [task-decomposition](task-decomposition.md)、[acceptance-map](acceptance-map.md) 的内部阶段诊断和 [Calculator 案例](../cases/calculator.md)。

方法文件存在、宿主实际加载、独立上下文行为和真实业务是否通过，都属于验证证据，不由本表宣称。

### application-engineer 的三个模式

| 模式 | 什么时候进入 | 正常输出 | 边界 |
| --- | --- | --- | --- |
| **discover** | 下一步需要最小应用认识 | AppProfile / evidence / limits | 不要求先有完整 Procedure |
| **harden** | Procedure 已明确，但操作规则仍不可靠 | locator/read/wait/action/verifier/helper | 不改业务语义绕过工程缺口 |
| **repair** | 已有规则在具体场景失败 | 修订规则 + reason + revalidation scope | 保留有效部分，不无证据全量重做 |

界面认识、CollectionProfile authoring、定位分析是内部子作业，不因此新增 Skill 或阶段。

## 二、Route：不同入口从哪里接入职责链

本节只定义**责任路由**；实际进入和恢复动作由 [RUN.md](../RUN.md) 负责，静态阶段顺序和 owner 映射由 [workflow.yaml](../workflow.yaml) 提供。

| 情况 | 路由 | 不应该做什么 |
| --- | --- | --- |
| 新 Agent 任务 | S1 → 主链 | 跳过事实和语义层直接写代码 |
| 人工正向开发 | 保留 Human 来源，从输入已充分的责任开始 | 追认为 Agent Dossier |
| 已有资产 | 冻结 source/hash/scope/evidence → 找首个缺口 | 为流程完整重做有效上游 |
| 已有 Candidate，只缺资格 | S12 | 重新生成 Candidate 来取得 PASS |
| App / layout / locator 变化 | S10 repair → 必要 S11 → S12 | 把工程变化写成新业务需求 |
| 业务语义／参数范围变化 | S8—S9 → 必要 S10/S11 → S12 | 只改 locator 或代码掩盖语义变化 |
| 已有 JS 独立改进 | code-rebuild → S12 | 强迫重跑示范链 |
| Runtime primitive 真缺失 | 独立 Runtime capability owner → 返回原工作包 | 发明不存在 API |
| 动作效果 unknown | 当前执行 owner + coordinator | 自动重放 |

普通用户运行已经交付的 Recipe 不进入这条作者职责链。

## 三、可独立接续的最小工作包

工作包不是新阶段。它只需要让下一责任方独立回答：

| 内容 | 必须回答 |
| --- | --- |
| 目标 | 本次只解决什么 |
| 输入 | 消费哪些冻结版本 |
| 允许修改 | 哪些对象可以变化 |
| 权限／副作用 | 哪些真实动作获准；哪些结果仍 unknown |
| 输出 | 交付什么主产物 |
| 完成条件 | 什么时候可以正常 handoff |
| 阻塞条件 | 什么情况必须停止 |
| failure owner | 出错回谁 |
| resume | 下一次从哪里继续 |

同一个 attempt 能清楚承载时，不为内部每一步制造 request / handoff。

## 四、Handoff：正常交接的消费语义

正式 handoff 字段和版本规则由[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)拥有。本文件只规定 Producer / Consumer 关系。

正常 handoff 必须满足：

1. Producer 主产物已经完成写入。
2. handoff 指向准确 version / hash。
3. Consumer 的必要输入真实交付，而不是“仓库里可能有”。
4. Producer 的适用 Gate 允许正常消费。
5. unresolved / limitations / side effects 没有被省略。
6. Consumer 在生产新成果前核对实际输入。
7. 下游产物记录自己实际消费的上游版本。

如果**材料存在但没有正式交付**，先回协调者；如果**材料本身错误**，回对应 Producer / failure owner。

### 开发 handoff ≠ Recipe 运行时数据流

开发链：

```text
TaskContract / WorkPlan
→ Dossier / Trace
→ DistilledSteps
→ SemanticProcedure
→ Profile / helper
→ Candidate
→ Qualification
```

业务运行：

```text
actual business input
→ ordinary JS / bounded Agent decision
→ actual business result
```

不要让每次业务运行重建开发任务包。

## 五、Failure Ownership：错了回哪里

| 失败类型 | 默认 Owner | 不能怎样处理 |
| --- | --- | --- |
| 目标／授权／成功标准错误 | S1 automation-plan | 让代码倒推用户意图 |
| 应用身份／页面／读取依据不足 | S2 application-engineer | 继续盲操作 |
| 实际动作／读值／结果事实缺失 | S3—S6 task-demonstrate | 事后补造 observation |
| retain / merge / omit / recovery 判断错 | S7 trace-distill | 在 S9 维护第二套 disposition |
| 业务语义／参数／数据依赖错 | S8—S9 procedure-synthesize | 硬编码绕过 |
| locator / read / wait / action 规则错 | S10 application-engineer | 改业务要求换取可执行 |
| Candidate 实现错误 | S11 recipe-build / code-rebuild | 把实现错误归给 Qualification |
| 场景／Oracle／资格证据设置错误 | S12 recipe-qualify | 修改 Candidate 后沿用旧资格 |
| Runtime primitive 缺失 | Runtime capability owner | 虚构 API |
| 副作用结果 unknown | 当前执行 owner + coordinator | 超时直接重放 |

失败按**最小真实责任方**返回，不默认回 S1。

## 六、Resume：变化以后哪些下游需要失效

恢复时先用 compact `progress.json` 定位候选阶段，再以固定 artifact / handoff / evidence 和阶段 checker 重新计算真实边界。progress 只是可重建索引；若它与 checker 冲突，按真实 `firstInvalidBoundary` 修正进度，而不是相信旧聊天或旧阶段号。

只从第一个真实受影响点继续：

```text
TaskContract 变化
→ 重新判断所有依赖旧语义的下游

Dossier / Raw Trace 修正
→ S7 及受影响下游

DistilledSteps 变化
→ S8—S9 及受影响下游

SemanticProcedure 变化
→ S10 / S11 / S12 受影响部分

AppProfile / helper 变化
→ 使用该规则的 Candidate / Qualification

Candidate 字节变化
→ S12

Qualification 场景 / Oracle 修正且 Candidate 未变
→ 只重验 S12 受影响范围
```

历史事实可以保留；资格不能跨影响性变化自动继承。

## 七、数据线、控制线与权限线

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

关键值要能回答：producer、consumer、version、source、validity。

### 控制线

```text
current plan
→ ready inputs
→ current work package
→ result / Gate
→ continue / repair / resume / stop
```

控制线不能改写数据线中的历史事实。

### 权限线

- 同一桌面同一时刻只有一个副作用 owner。
- 离线分析可以并行；真实 click / input / scroll 不抢占。
- Profile/helper 只由获准工作包修改。
- 屏幕内容、模型输出和 API 返回不自动扩大授权。
- Agent / VLM 输出经约束和校验后，才能进入已获准动作。

## 八、专项能力只保留职责关系

例如 Structured Collection，本文件只拥有：

```text
application-engineer
  → 结构知识 / CollectionProfile

Recipe / Adapter
  → generic item → business object
  → 必要 traversal / business action

recipe-qualify
  → 分层验证结构、mapping、traversal、业务结果
```

Observation、VLM proposal、segmentation、continuity、merge、mutation、end detection 等算法见 [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。

Runtime / Catalog / publish 的产品生命周期见 [Automation Capability Lifecycle](../../../docs/architecture/desktop-automation/task-capability-lifecycle.md)。S12 只产生固定 Candidate 的 Qualification；是否发布由显式发布边界决定。

## 相关权威文档

- [需求基线](requirements.md)
- [完整任务树](task-decomposition.md)
- [工作流执行入口](../WORKFLOW.md)
- [交接审阅地图](acceptance-map.md)
- [验证计划](validation-plan.md)
- [共享 Skill 合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)
- [Automation Capability Lifecycle](../../../docs/architecture/desktop-automation/task-capability-lifecycle.md)
- [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)

历史 Skill 数量演变、P0/P1/P2 计划、测试数量、某次宿主状态、commit 成熟度与逐日期设计决定属于 Git history / `docs/quality/`，不在本 canonical 链路正文维护。
