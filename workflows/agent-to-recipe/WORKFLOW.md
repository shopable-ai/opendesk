---
title: "Agent-to-Recipe｜工作流执行入口"
description: "Agent-to-Recipe 的进入、路由、交接、恢复与停止规则。"
order: 10
---

# Agent-to-Recipe｜工作流执行入口

本文只回答一个问题：

> **Agent 实际怎样进入、协调、暂停、恢复并完成 Agent-to-Recipe 工作流？**

完整“需要做什么”见 [task-decomposition.md](design/task-decomposition.md)；字段、版本与正式交接约束见[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)。本文不复制专业方法正文，不维护质量报告，也不是自动调度器。

## 新会话先做：确定任务、核验证据、只选一个缺口

用户只给出 `workflows/agent-to-recipe` 时，给出的是**方法入口**，不是某个业务任务的 TaskContract、任务包或桌面执行授权。先判断本轮要求是维护工作流、接续指定业务任务，还是验证工作流本身；维护方法时可审阅和修订仓库，不能把修订过程冒充 S3—S12 的一次新业务示范。确需新业务示范但缺少业务目标时，先完成可独立进行的资料盘点，再索取该目标；已有任务则从首个真实缺口接续。完整路由见[本轮执行规程第 1 节](#1-固定入口与本轮边界)。

新会话的第一份可审阅交付是下面这张**接续卡**。它是聊天或现有工作包中的视图，不是新增状态文件、schema 或 Gate；未知项原样写未知。先核对 `git status`／HEAD 与用户已有修改，再填写：

| 核对项 | 必须记录的内容 |
| --- | --- |
| 本轮目标和来源 | 用户原话指向的方法维护／具体业务／限定验证；业务 taskId、任务根和原始要求的实际位置，缺失则说明 |
| 当前有效版本 | 唯一 `progress.json.currentContinuation` 只是索引；逐项列出本次要消费的 request、handoff、主产物、Candidate／Qualification 的实际路径、hash、scope 和环境 |
| 证据层级 | 分开方法文件／自审、确定性检查、真实模型生产与宿主加载、同版 Candidate 的 live run、独立观察／人类接受；每项写 pass／fail／not-run／blocked 及其证据版本 |
| 首个缺口与负责人 | 缺什么事实或交接、由哪个既有职责修、最小安全动作、受影响下游；保留仍有效的上游和旧失败 |
| 权限与预算 | 当前有效 WorkPlan 的读取、桌面输入、副作用、调用和重试额度；已用与剩余分别核对，提案、旧额度和未报告的余额都不当作新授权 |
| 本轮退出条件 | 本次只完成哪一个可验证工作包、正常与拒绝用例、运行命令／证据位置；缺条件时交付 blocked 和准确的下一请求 |

按以下顺序核验，不凭报告日期、最高分或 `progress.stages=passed` 跳步：**任务身份和来源 → 当前进度指向的已发布 handoff → request 的冻结输入与允许根 → 主产物实际字节／hash → Gate 的 scope 和证据 → 当前计划、预算、现场及依赖适用性**。历史质量报告是寻找证据的导航，不替代 `.runtime` 中的原件；原件已清理就把相应历史结论标为不可复核。Calculator 的 r009 限定场景及剩余未测层次见[当前接续记录](../../docs/quality/agent-to-recipe/skill-closure-20260922.md#2026-09-23-r009同版-candidate-的两次真实运行及限定放行当前)，每次新任务仍须重新核对实际文件。

### 容易重复的错误与开工前门禁

| 已发生过的失误 | 本次必须采取的动作；不满足时的处理 |
| --- | --- |
| request 引用仍会变化的 `progress.json`，更新进度后自身 hash 漂移 | 在生产前固定必要的进度快照及其 hash；request 只引用该固定字节。handoff 发布后再由唯一协调者更新活动进度；漂移时保留失败 request，重新发起受影响尝试 |
| Candidate 只绑定公开入口的符号链接，或续订合同与历史合同不对应 | 冻结物理脚本、实际二进制和影响性依赖，另记录公开命令如何指向它们；逐版核对合同继承及 Candidate／Qualification 的同版绑定。不修改旧 manifest 来迎合检查器 |
| 第一次 Fresh Run 成功便宣称重复运行或参数化 | 运行前固定 requested scope、场景及 Oracle；重复性要同版候选至少两次独立 Fresh Run；变参还需同一公开 inputContract 的合法变化及实际消费者证据。未测范围留在 requested 的未完成项 |
| 静态检查、自评分或合成探针通过便宣称模型／宿主／整链通过 | 分层记录实际 Producer、上下文隔离、方法加载、权限、调用预算、原始输出、独立 Oracle 和真实入口；缺哪层就只报告已完成层，不靠更多评分或改写 fixture 补齐 |
| 动作超时或资格失败后重放输入，或因新会话重演有效示范 | 先确认副作用与最后可信现场；结果 unknown 时停止输入。保持失败包与预算累计，仅重做受影响责任环节；需要新输入必须先有适用计划和授权 |

每轮只选择**首个能够解除后续阻塞的真实缺口**，给出该缺口的正常样本、一个能暴露错误放行的反例、适用检查和退出条件；通过后再推进下一交接。若当前目标是继续验证工作流，不能用 Calculator 固定场景的两次运行填补“模型按固定 Skill 从输入生产工件、真实宿主加载和无完整聊天接续”的空白；下一项优先依[验证计划](design/validation-plan.md#输入充分性与失败接续切片2026-09-20)完成一次真实模型 S7→S9 正常生产和一次定向失败修复，固定输入／方法版本、隔离来源、原始输出、调用账目和正式 request／handoff，并让协调者核对进度。若宿主或权限尚未具备，先完成可验证的准备与缺口记录，保持对应层 `not-run`／`blocked`。不要为改善总评分而新建阶段、Skill 或平行状态。

结束或切换会话时，按[第 5 节](#5-结束与恢复必须交付什么)留下**同一接续卡的结果版**：实际修改与未碰的用户修改、检查命令及结果、失败原件、当前冻结引用、已用／剩余预算、下一唯一工作包和安全停止条件。下一会话仍须重读原件与当前工作区，不能把这张卡当作授权或新的资格证据。

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

截至 2026-09-22，仓库已落地 **8 个 SKILL.md、8 项专业职责、8 组交接**；新会话仍须核对实际 HEAD 和文件。9 月 20 日的五方法输入充分性审查只作为其当时基线证据保留；`automation-plan`、`task-demonstrate`、`recipe-build` 于 9 月 21 日补成正式方法包及输入输出适用规格。方法版本用仓库提交／方法 hash 核对；业务输入版本仍必须由每次 request 的固定 ref／hash 核对，二者不能混用。

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
