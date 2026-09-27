---
title: "Agent-to-Recipe｜工作流执行入口"
description: "Agent-to-Recipe 的进入、路由、交接、恢复与停止规则。"
order: 10
---

# Agent-to-Recipe｜工作流执行入口

本文只回答一个问题：

> **Agent 实际怎样进入、协调、暂停、恢复并完成 Agent-to-Recipe 工作流？**

完整“需要做什么”见 [task-decomposition.md](design/task-decomposition.md)；字段、版本与正式交接约束见[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)。本文不复制专业方法正文，不维护质量报告，也不是自动调度器。

## 先看这里：S1—S12 一页主框架

开发链保持 S1—S12，不新增阶段：

```text
S1 任务与计划
  ↓
S2 最小应用认识
  ↓
S3—S6 真实执行、观察、验证与任务级收口
  ↓
S7 必要步骤
  ↓
S8—S9 业务语义、参数、数据依赖与支持范围
  ↓
S10 应用操作工程化
  ↓
S11 普通 JavaScript / Candidate
  ↓
S12 独立 Qualification
  ↓
交付 / 显式发布 handoff
```

业务运行消费已经交付的 Recipe，**不会每次重新走 S1—S12**。

执行时只记住四条规则：

1. **阶段 ≠ Skill ≠ 文件 ≠ Agent。**
2. **已有合格成果优先复用，只从第一个真实缺口继续。**
3. **事实、语义、实现、资格不能互相替代。**
4. **失败按责任定向返回，不默认回 S1。**

## 入口：先判断为什么进入这条工作流

| 入口 | 先做什么 | 不应该做什么 |
| --- | --- | --- |
| 新的 Agent 自动化任务 | 进入 S1，形成 TaskContract / WorkPlan | 先写代码、先猜点击细节 |
| 已有资产接续 | 固定源码／工件／范围／证据版本，找第一个真实缺口 | 为了“完整”重跑已经有效的上游 |
| 已有 Candidate，只缺资格 | 固定 Candidate，直接进入 S12 | 重新生成代码来取得新 PASS |
| 应用规则失效 | 保留业务语义，进入 S10 repair/harden | 把定位失败改写成业务需求变化 |
| 已有代码需独立改进 | 进入可选 code-rebuild，再交 S12 | 强迫重做示范链 |
| Human Recorder 来源 | 返回 Human-to-Recipe 来源链，再按其合同接入共享专业职责 | 把人工录制伪装成 Agent Dossier |
| 真正 Runtime primitive 缺失 | 记录独立能力缺口并阻塞受影响范围 | 虚构 API 或改变业务目标绕过 |

入口决定的是**从哪里继续**，不是给旧成果自动升级资格。

## 当前阶段怎样确定

开始或恢复前，先读当前任务根、request / handoff、实际主产物和 progress。不要只看文件名、最近修改时间或旧聊天。

按下面顺序判断：

```text
1. 当前 TaskContract / WorkPlan 是否仍有效？
2. 当前阶段要求的输入是否已经存在且版本一致？
3. 上游 Gate 是否允许正常消费？
4. 是否存在会改变路线的未决授权、未知副作用或版本漂移？
5. 如果已有下游成果，它是否仍绑定当前上游版本？
6. 第一个不能被可靠消费的边界在哪里？
```

**第一个真实缺口**就是默认恢复点。

## 当前 Skill 划分与下游输入充分性

当前仓库为八项专业职责提供明确方法入口：

| 职责 | 主要阶段 | 方法入口 | 正常主产物 |
| --- | --- | --- | --- |
| automation-plan | S1 | [SKILL.md](skills/automation-plan/SKILL.md) | TaskContract / WorkPlan |
| application-engineer | S2 / S10 | [SKILL.md](skills/application-engineer/SKILL.md) | AppProfile / operation rules / helper |
| task-demonstrate | S3—S6 | [SKILL.md](skills/task-demonstrate/SKILL.md) | Demonstration Dossier / Raw Trace / Evidence |
| trace-distill | S7 | [SKILL.md](skills/trace-distill/SKILL.md) | DistilledSteps |
| procedure-synthesize | S8—S9 | [SKILL.md](skills/procedure-synthesize/SKILL.md) | SemanticProcedure |
| recipe-build | S11 | [SKILL.md](skills/recipe-build/SKILL.md) | Recipe.js / CandidateManifest |
| code-rebuild | S11 可选 / 独立入口 | [SKILL.md](skills/code-rebuild/SKILL.md) | 保留结论或新 Candidate |
| recipe-qualify | S12 | [SKILL.md](skills/recipe-qualify/SKILL.md) | QualificationRecord |

这里的“存在方法入口”只表示方法可显式读取。宿主加载、独立上下文表现和真实业务资格仍由各自证据证明。

下游开始前必须确认：

- 指定上游主产物确实存在；
- 版本／hash 与 request / handoff 一致；
- 必要事实不是只存在于聊天里；
- required output 的 Gate 允许正常消费；
- 未决项没有被静默忽略；
- 当前授权、环境和副作用预算仍适用。

## 本轮执行规程：从已有成果继续，而不是重新开始

### 1. 固定入口与本轮边界

一次工作包开始时至少固定：

- task / attempt 身份；
- 当前 TaskContract / WorkPlan；
- 本次允许消费的上游产物；
- 当前允许修改的对象；
- 本次副作用、授权与预算；
- 预期交付物；
- 阻塞时的责任返回。

若这些信息不足，只补当前缺口；不要先重做无关阶段。

### 2. 先交一张接续盘点表

恢复长任务时，先用最小表格确认：

| 项目 | 当前版本 | 状态 | 可否复用 | 下一责任 |
| --- | --- | --- | --- | --- |
| TaskContract / WorkPlan | ref/hash | valid / changed / unknown | yes/no | S1 |
| AppProfile / helper | ref/hash | valid / drift / unknown | yes/no | S2/S10 |
| Dossier / Raw Trace | ref/hash | complete / partial / blocked | yes/no | S3—S6 |
| DistilledSteps | ref/hash | pass / needs-rework | yes/no | S7 |
| SemanticProcedure | ref/hash | pass / needs-rework | yes/no | S8—S9 |
| Candidate | ref/hash | frozen / changed / absent | yes/no | S11 |
| Qualification | ref/hash | pass / fail / blocked / stale | yes/no | S12 |

这张表是恢复视图，不是新的权威状态 schema。

### 3. 按当前输入就绪的阶段推进

每个阶段只消费它真正需要的输入：

- S1 不从后续代码反推用户意图；
- S2 不要求先有完整 Procedure；
- S3—S6 保存 planned 与 actual，不把期望补成事实；
- S7 只对实际动作做必要性取舍，不重写 Raw Trace；
- S8—S9 不重新维护第二套 action disposition；
- S10 只补 Procedure 真正需要的应用工程缺口；
- S11 不用代码猜上游事实；
- S12 不修改候选或成功标准来取得通过。

详细完成条件和失败返回见 [task-decomposition.md](design/task-decomposition.md)。

### 4. 交接完整性检查：可执行，但不替代资格

仓库中的交接与工件检查工具用于检查**引用、版本、字节绑定和有限结构关系**，不负责证明真实业务已经发生。

可使用：

- [check-handoff.js](scripts/check-handoff.js)：检查 request / handoff 身份、引用和 hash；
- [check-artifact-chain.js](scripts/check-artifact-chain.js)：检查当前支持范围内的相邻工件关系；
- [acceptance-map.md](design/acceptance-map.md)：人工快速审阅各边界。

检查器通过不等于：

- 上游事实真实；
- Skill 独立行为正确；
- 桌面实际执行成功；
- Candidate 已获得业务 Qualification；
- 宿主已自动加载相关 Skill。

具体测试记录和历史结果只维护在 `docs/quality/`。

### 4.1 相邻工件消费检查与方法入口

消费者在生产前应检查：

```text
published handoff
→ frozen request
→ required artifact refs
→ actual bytes / hash
→ method input sufficiency
→ current Gate / unresolved items
→ then produce downstream artifact
```

若“必要材料存在但没有交付”，先返回协调者；若材料本身错误，再返回原责任阶段。不要通过读取整个聊天或未声明目录来绕过输入合同。

### 5. 结束与恢复必须交付什么

暂停、阻塞或交给新会话时，至少留下：

- task 根和当前计划版本；
- 本轮实际读取的上游版本；
- 本轮新增／修改产物；
- 实际执行过的检查及结果；
- 当前失败／阻塞原因；
- 已发生或结果未知的副作用；
- 仍可复用的成果；
- 下一责任阶段；
- 下一步最小安全动作；
- 剩余授权与预算。

不要只写“做到 S9”“测试通过”或“继续优化”。

### 5.1 出错以后先判断什么，再决定是否继续

| 问题 | 先判断 | 默认下一步 |
| --- | --- | --- |
| 输入缺失／引用不可读 | 缺哪项消费者必需信息 | 定向补交，不猜 |
| 上游成果错误 | 是事实错、语义错、应用规则错还是代码错 | 返回对应责任阶段 |
| 动作可能已发生 | 是否能确认实际效果 | 先对账；不盲重放 |
| Candidate 字节变化 | 旧 Qualification 是否仍绑定同一候选 | 冻结新 Candidate，重进 S12 |
| Profile/helper 变化 | 哪些 Candidate / Qualification 依赖受影响 | 只重验受影响下游 |
| 权限／预算／宿主能力不足 | 是否还有独立安全工作可继续 | 阻塞相关路径，保存解除条件 |
| 同类失败无新证据 | 是否有新的信息或修复依据 | 停止重复尝试 |

## 能力发现与实际调用：两个接入位置

能力发现只在需要时进入，不是 S13。

**操作前／中（S2、S3—S6）**

```text
业务需要
→ 找到可能能力
→ 选择候选方法
→ 阅读 canonical contract
→ 在真实范围验证
→ 保存决定与证据
```

**生成前（S10—S11）**

核对最终 Procedure 所依赖的方法、真实 API、失败条件和版本，再决定保留已有实现还是替换。

最终 Recipe-driving 决定写入已有 Procedure / Candidate 来源关系，不在 WORKFLOW 复制 API 正文。能力发现方法见 [capability-discovery.md](design/capability-discovery.md)。

## 与普通任务运行及能力发布的交接

Agent-to-Recipe 是**作者链**，不是每次普通任务的运行链。

- 普通运行已有合格 Recipe：不进入 S1—S12。
- 出现 Gap / Failure / 新支持范围：从第一个责任缺口进入作者链。
- S12 通过：得到固定 Candidate 的资格结论。
- 是否进一步登记为可供普通运行解析的 Capability：由显式发布边界处理，不把 S12 当成自动发布。

跨 Runtime / Catalog / Authoring 的完整边界见 [Automation Capability Lifecycle](../../docs/architecture/desktop-automation/task-capability-lifecycle.md)。

## 当前可使用的应用工程方法

应用工程统一使用 application-engineer 的三种入口：

```text
discover：建立下一步所需的最小认识
harden：把已确认 Procedure 的操作要求工程化
repair：根据具体失败定向修复旧规则
```

界面认识、Structured Collection、定位、读取、等待、动作等专项只在需要时展开。业务语义仍由 S7—S9 负责；Runtime / VLM / traversal 算法按各自权威文档维护。

## 开发期策略适配、生成自检与失败维修

应用策略可以依据证据改变，但以下内容不能随着策略一起改变：

- 用户目标；
- 授权；
- 业务对象；
- 关键数据依赖；
- 成功／失败标准。

定位与 UI 策略失败时，按 [UI 定位失败诊断与修复](../../docs/frameworks/ui-locator-repair.md) 定向处理。形成新规则或新 Candidate 后，只重验实际受影响的范围。

## 从当前目的进入

- **为什么做、必须满足什么** → [requirements.md](design/requirements.md)
- **完整需要做什么** → [task-decomposition.md](design/task-decomposition.md)
- **谁生产什么、交给谁、错了回哪里** → [chain-design.md](design/chain-design.md)
- **怎样快速检查交接** → [acceptance-map.md](design/acceptance-map.md)
- **怎样证明每一层做对** → [validation-plan.md](design/validation-plan.md)
- **怎样做应用工程** → [application-operations.md](design/application-operations.md)
- **怎样独立改进已有 JS** → [code-rebuild.md](design/code-rebuild.md)
- **具体 Calculator 代入** → [cases/calculator.md](cases/calculator.md)

## 使用依据与编号

当前唯一阶段编号是 **S1—S12**。R1—R13 只属于历史讨论／设计考古，不用于当前执行路由。

## 主任务树

完整主任务树只在 [task-decomposition.md](design/task-decomposition.md) 维护。本文件不复制它的详细任务正文。

## 三个循环与工件关系

Execution / Learning / Reliability 三个闭环和主工件关系只在 [task-decomposition.md](design/task-decomposition.md) 维护；正式字段与版本规则只在[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)维护。

## 十三节点讨论视图

历史 R1—R13 不再作为当前执行入口。需要设计考古时使用 Git history；当前执行只使用 S1—S12。

## 专业责任、交接与长任务接续

长任务的核心不是保存更多聊天，而是保证下一个 Agent 能回答：

```text
现在做的是什么？
正在消费哪个版本？
哪些事实已经成立？
哪些只是期望或建议？
当前阻塞在哪里？
哪个责任方应该修？
哪些副作用已经发生或仍未知？
下一步最小安全动作是什么？
```

只要这些信息可以从正式产物和 handoff 中恢复，就不需要重读几周的设计历史。
