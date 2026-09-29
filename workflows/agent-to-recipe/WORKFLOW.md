---
title: "Agent-to-Recipe｜从需求到可交付 Recipe 的工作流"
description: "说明一个用户自动化需求怎样经过 S1—S12，逐步变成经过独立验收、可以重复运行的 Recipe。"
order: 10
---

# Agent-to-Recipe｜从需求到可交付 Recipe 的工作流

本文只回答一个核心问题：

> **Agent-to-Recipe 怎样把一个用户自动化需求，逐步变成经过验证、可以重复运行的 Recipe？**

同时回答三个执行问题：

1. 每个阶段收到什么、做什么、得到什么；
2. 怎样判断这一阶段做对了；
3. 做错、阻塞或中断以后从哪里继续。

如果要看一个完整、可检查的正确案例，读 [Calculator 基准案例](cases/calculator.md)。  
如果要看 Agent 实际怎样从需求出发查能力、执行、观察并继续，读 [Calculator 执行过程演练](cases/calculator-execution-walkthrough.md)。

详细字段、版本、hash、handoff、Gate、检查器和测试规则不是本文主线；它们分别由 [共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)、[链路设计](design/chain-design.md) 和 [验证计划](design/validation-plan.md) 负责。

---

## 1. 先看懂：这个工作流把什么变成什么

### 输入

一个需要 Agent 自动化完成的真实用户任务，例如：

```text
第一次通过 Calculator 按钮计算 25 × 4 + 10 =
→ 实际读取 firstResult
→ 清空 Calculator 当前界面，但保留 firstResult
→ 再通过按钮输入 6 × firstResult =
→ 实际读取 finalResult
→ print + return finalResult
```

### 输出

不是一段“看起来正确”的代码，而是：

```text
用户需求
→ 已确认的任务定义
→ 已确认的应用操作对象
→ 一次真实执行事实
→ 必要步骤
→ 可复用业务过程
→ 可靠应用操作规则
→ 冻结的 Recipe Candidate
→ 对同一 Candidate 的独立资格验收
→ 可交付 Recipe
```

因此 Agent-to-Recipe 不是“直接让 AI 写自动化代码”。

它解决的是：

> **怎样让最终 Recipe 有依据地来自真实需求、真实执行、真实数据关系和独立验收，而不是来自猜测、示例答案或最终结果反推。**

---

## 2. 一张图看懂 S1—S12

```text
用户原始需求
  ↓
S1  明确任务、成功标准、限制和计划
  ↓
S2  认识下一步真正需要操作和读取的应用对象
  ↓
S3  执行当前获准动作
  ↓
S4  重新观察并验证动作后的真实效果
  ↓
S5  判断继续、修订、恢复还是停止
  └─ 需要继续执行 → 回到下一次 S3
  ↓ 任务级示范结束
S6  固定本次真实示范事实
  ↓
S7  从真实记录中提炼必要步骤
  ↓
S8  把必要步骤解释成业务步骤
  ↓
S9  形成可复用业务过程和运行时数据关系
  ↓
S10 把定位、读取、等待、点击、清空等应用操作工程化
  ↓
S11 生成普通 JavaScript，并冻结 Candidate
  ↓
S12 对同一 Candidate 做独立资格验收
  ↓
Delivery / Publish Handoff
```

**当前正式阶段只有 S1—S12。Delivery / Publish 是 S12 之后的外部交付边界，不是 S13。**

普通业务运行已经交付的 Recipe 时，不重新执行 S1—S12。只有生产、修复、扩展或重新资格化自动化资产时，才进入这条作者链。

---

## 3. S1—S12：每一步到底把什么变成什么

这张表是本文的核心。

| 阶段 | 把什么变成什么 | 这一阶段真正解决什么 | 主要结果 | 怎么知道基本做对了 | 主要 Skill |
| --- | --- | --- | --- | --- | --- |
| **S1 任务与计划** | 原始需求 → TaskContract / WorkPlan | 明确到底要做什么、什么算成功、允许做什么、哪些仍未知 | 任务合同、计划、Unknown | 没偷换用户目标；Expected 没冒充运行时值；授权和停止条件明确 | automation-plan |
| **S2 最小应用认识** | 任务计划 + 当前现场 → 最小 AppProfile | 确认下一步要操作和读取的真实对象 | 应用/窗口/目标/读取依据/限制 | 不靠猜坐标；对象身份有依据；界面认识不冒充授权 | application-engineer / discover |
| **S3 执行动作** | Planned Step → Actual Action | 当前获准动作是否真的发生 | action、request、target、receipt、side effect | 有真实调用/动作；Expected 没被补成 Actual | task-demonstrate |
| **S4 观察验证** | Actual Action → Actual Observation | 动作以后，正确业务对象实际上变成什么 | observation、实际值、与 Expected 的比较 | receipt 不冒充业务结果；Actual 和 Expected 分开 | task-demonstrate |
| **S5 分类决定** | Observation → continue / revise / recover / stop | 现在是否安全继续，以及下一步是什么 | decision、classification、plan delta | Unknown 不被强行当成功；必要准备动作不被误删 | task-demonstrate |
| **S6 关闭示范** | 多轮 S3—S5 → Dossier / Raw Trace / Evidence | 把整次真实示范固定成可消费事实 | 完整事实包、关键运行时值来源与消费者 | 不能只剩最终结果；关键 producer → consumer 关系仍在 | task-demonstrate |
| **S7 提炼必要步骤** | Raw Trace → DistilledSteps | 哪些真实动作必须保留，哪些可以删、合并或作为恢复动作 | DistilledSteps | 必要动作不丢；运行时数据来源和消费者不断链 | trace-distill |
| **S8 业务语义** | DistilledSteps → Business Steps | 每个必要步骤在业务上为什么存在 | 业务步骤、输入、输出、来源 | 不重新猜 Raw Trace；业务步骤可追溯到必要事实 | procedure-synthesize |
| **S9 可复用过程** | Business Steps → SemanticProcedure | 把一次成功过程变成可复用过程，区分参数、运行时值和支持范围 | Procedure、data dependencies、scope | runtime value 不被写成默认常量；producer → consumer 明确 | procedure-synthesize |
| **S10 应用工程化** | Procedure + 应用事实 → 可靠操作规则 | 怎样稳定定位、读取、等待、点击、清空和验证 | AppProfile / rules / helper | 每个必要操作有依据；工程实现不改变业务要求 | application-engineer / harden·repair |
| **S11 生成 Recipe** | Procedure + 可靠操作规则 → Candidate | 把已确认规格实现成普通 JavaScript | Recipe.js、CandidateManifest | 代码真实消费运行时数据；源码与依赖被冻结 | recipe-build |
| **S12 独立验收** | 冻结 Candidate → QualificationRecord | 同一个 Candidate 在声明范围内是否真实成立 | Fresh Run、Qualification、未通过项 | 不修改 Candidate 来取得通过；未运行不得写 PASS | recipe-qualify |

需要了解某个阶段的完整职责，读 [task-decomposition.md](design/task-decomposition.md)。  
需要了解某个 Skill 专业上怎样产出结果，进入对应 `skills/*/SKILL.md`。

---

## 4. 一个阶段实际怎样推进

无论当前是 S1 还是 S12，都先执行同一套阶段推进协议：

```text
1. 确认现在真正应该从哪个阶段开始
   ↓
2. 明确本阶段唯一要解决的问题
   ↓
3. 检查本阶段需要的输入、证据和授权是否真实存在
   ↓
4. 读取并执行对应 Skill 的专业方法
   ↓
5. 形成本阶段 Actual Output
   ↓
6. 独立检查本阶段结果是否正确
   ↓
7. 决定下一步

通过
→ 固定结果
→ 正常进入下一合法阶段

失败
→ 找到第一个“输入仍正确、输出开始错误”的阶段
→ 返回真正 failure owner 修复
→ 只重验受影响下游

阻塞 / 无法确认
→ 记录缺口和解除条件
→ 停止受影响路径
```

### 每个阶段至少要回答 7 个问题

| 问题 | 必须能回答什么 |
| --- | --- |
| 我现在在哪？ | 当前阶段或首个真实缺口 |
| 我收到什么？ | 实际输入、版本、证据、授权 |
| 我负责什么？ | 本阶段唯一核心职责 |
| 我实际做了什么？ | Actual，不是 Expected 或计划 |
| 我得到什么？ | 本阶段可被下一阶段消费的结果 |
| 为什么相信它？ | 证据、测试、观察和限制 |
| 接下来去哪？ | 下一阶段、定向返修或停止 |

如果这 7 个问题答不清楚，就不应该仅因为“文件已经生成”而继续。

---

## 5. 阶段正确性怎样判断

S1—S12 都需要独立判断，不能因为最终 Recipe 正确，就反推前面的阶段正确。

正常退出一个阶段，至少同时满足：

```text
本阶段职责完成
AND
本阶段独立评分 ≥ 95
AND
适用 Hard Fail = 0
AND
必需证据完整
AND
阻断性 Unknown = 0
AND
必需测试通过
```

95 分是**验收门槛**，不是预设结果。

详细五维评分、必需证据、Gate、Hard Fail 和测试空间由 [validation-plan.md](design/validation-plan.md) 负责；WORKFLOW 只规定：

> **每个正式阶段必须独立得到结论，不能用后一阶段的正确结果替前一阶段补分。**

尤其要注意：

- S3、S4、S5、S6 虽由同一个 `task-demonstrate` Skill 承担，仍是四个不同判断；
- S8、S9 虽由同一个 `procedure-synthesize` Skill 承担，仍分别验收；
- S2、S10 虽都使用 `application-engineer`，职责完全不同；
- S11 代码生成成功不代表 S12 已通过；
- S12 最终数字正确，也不能证明 S3/S4 当时真实执行和观察正确。

---

## 6. 用 Calculator 一眼看懂整条工作流

Calculator 基准案例的核心需求是：

```text
25 × 4 + 10 =
→ 从结果区真实读取 firstResult
→ 清空 Calculator UI，但保留任务数据 firstResult
→ 6 × firstResult =
→ 从结果区真实读取 finalResult
→ print + return finalResult
```

沿 S1—S12 看，就是：

| 阶段 | Calculator 中真正发生什么 |
| --- | --- |
| S1 | 明确“第二次必须使用第一次现场真实读取的 firstResult”，Expected 110 只能验收，不能充当输入 |
| S2 | 确认本次 Calculator 窗口、按钮区、结果区和下一步需要的对象 |
| S3 | 真正点击按钮、读取结果、清空界面等 |
| S4 | 重新观察正确结果区，取得 Actual，而不是只看工具回执 |
| S5 | 根据观察决定继续、修复、恢复还是停止 |
| S6 | 固定“第一次结果 → firstResult → 第二次输入”的真实事实链 |
| S7 | 去掉无关动作，但必须保留读取 firstResult 和它的后续消费者 |
| S8 | 把这些必要动作解释成 ReadFirstResult、ClearUI、EnterSecondCalculation 等业务步骤 |
| S9 | 把 firstResult 定义成 runtime value，并建立它到第二次输入的 data dependency |
| S10 | 让 click / read / clear / wait / verify 有可靠应用规则 |
| S11 | 生成 JS，让第二次按钮输入真实展开并消费本次 firstResult 的全部字符 |
| S12 | 对同一个冻结 JS 做独立 Fresh Run，确认真实数据链和最终结果 |

完整逐阶段参考结果见 [calculator.md](cases/calculator.md)。

真正执行时不要让 S1—S11 Producer 提前读取 Calculator 的未来阶段参考答案或参考 JavaScript 来“推导”自己的结果。参考案例用于工作流维护、教学和独立 Evaluator 校准；它不能替代本次真实生产事实。

---

## 7. 做错以后回哪里

核心原则只有一句：

> **找到第一个“输入仍正确、输出第一次错误”的阶段，从那里修；不要默认回 S1。**

常见例子：

| 发现的问题 | 返回哪里 |
| --- | --- |
| 用户要求、成功标准、授权或计划理解错 | S1 |
| Calculator 窗口、按钮、结果区认识错 | S2 |
| 动作根本没有真实发生，或 Actual 记录错误 | S3 |
| 动作发生了，但没有真正观察业务结果 | S4 |
| 已有 Unknown 却错误决定继续 | S5 |
| 事实包丢掉 firstResult 的来源或消费者 | S6 |
| 提炼时把必要读取动作删掉 | S7 |
| 把步骤业务意义解释错 | S8 |
| 把 runtime firstResult 写成固定 110 | S9 |
| locator / read / wait / clear 规则错误 | S10 |
| Procedure 正确，但 JS 没真实消费 firstResult | S11 |
| Candidate 没变，但资格场景、证据或 Fresh Run 不足 | S12 |

修复后，只让真正依赖错误结果的下游失效。

例如：

```text
S7 错
→ 修 S7
→ 重验 S8—S12 受影响部分
→ S1—S6 不因为“想完整”而机械重做

S11 Candidate 字节变化
→ 旧 S12 Qualification 失效
→ 重新验收新的同一 Candidate
```

同类失败如果没有新证据、新修复依据或新授权，不重复尝试。

---

## 8. 新任务、接续任务和修复任务从哪里进入

主流程始终是 S1—S12，但不是所有任务都必须从 S1 重跑。

| 情况 | 默认进入方式 |
| --- | --- |
| 全新的 Agent 自动化任务 | 从 S1 开始 |
| 已有任务中断后继续 | 找到第一个真实缺口，从该阶段继续 |
| 已有合格上游，只是下游出错 | 保留有效上游，从 failure owner 修 |
| Candidate 已冻结，只缺独立资格 | S12 |
| 应用定位 / 读取 / 操作规则失效 | 通常 S10 repair，再重验受影响下游 |
| 已有普通 JS 需要独立改进 | code-rebuild → 冻结新 Candidate → S12 |
| Runtime / API 真正缺能力 | 阻塞受影响路径，交给对应能力 owner；不要虚构 API 绕过 |

恢复时不要只看旧聊天里的“做到 S9”之类文字。至少重新确认：

- 当前目标是否仍一致；
- 实际上游产物及版本是否仍有效；
- 当前现场、授权和副作用状态；
- 第一个不能可靠继续消费的边界。

---

## 9. 什么时候必须停止

出现以下情况时，停止受影响路径：

- 必需输入缺失，且无法从获准来源确认；
- 授权不足或边界不清；
- 动作可能已经产生副作用，但结果未知；
- 当前应用对象无法可靠确认；
- Runtime / API 能力真实缺失；
- 必需实际证据仍未运行；
- 同类失败没有新信息；
- 有人试图把 `not-run`、`blocked` 或 Unknown 写成 PASS。

停止不是失败掩盖，而是工作流正确行为的一部分。

暂停或交给另一会话时，至少留下：

```text
当前目标
当前阶段 / 首个真实缺口
实际读取的上游版本
本轮实际产物
已经执行的检查
失败 / 阻塞原因
已知或未知副作用
仍可复用的上游
下一责任阶段
下一步最小安全动作
```

---

## 10. S11 与 S12 的最后边界

### S11 做什么

S11 把已经确认的 Procedure 和应用操作规则实现成普通 JavaScript。

结束时必须冻结：

- Candidate 实际源码；
- 依赖；
- 入口；
- 必要运行环境；
- 上游版本关系。

### S12 做什么

S12 不继续“帮 S11 改代码”。

它对**同一个冻结 Candidate**做独立资格验收：

```text
冻结 Candidate
→ 在预先声明的 scope / scenarios 中 Fresh Run
→ 收集实际 evidence
→ 检查需求覆盖与真实 runtime data flow
→ QualificationRecord
```

Candidate 字节或影响性依赖一变，旧 Qualification 不再证明新的 Candidate。

只有 S1—S12 所有适用阶段分别满足自己的退出条件，并且 S12 对同一 Candidate 的独立验收成立，整项任务才可以称为完成或 qualified。

---

## 11. 工程机制放在哪里看

第一次理解工作流时，不需要先掌握 hash、Gate、handoff schema、Stage Guard 或具体 Node 命令。

当进入工程实现或独立审查时，再按问题进入对应权威文档：

| 你现在要解决什么 | 去哪里 |
| --- | --- |
| S1—S12 每阶段完整做什么 | [task-decomposition.md](design/task-decomposition.md) |
| Producer / Consumer、Route、Handoff、Resume、Failure Owner | [chain-design.md](design/chain-design.md) |
| 怎样快速检查相邻阶段有没有交错 | [acceptance-map.md](design/acceptance-map.md) |
| 五维评分、95 门槛、Gate、Hard Fail、证据、测试、Reference Alignment | [validation-plan.md](design/validation-plan.md) |
| 应用定位、读取、等待、动作工程方法 | [application-operations.md](design/application-operations.md) |
| 已有普通 JS 怎样独立改进 | [code-rebuild.md](design/code-rebuild.md) |
| request / handoff / artifact 的字段、版本、hash 规则 | [共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md) |
| 某项职责专业上怎样执行 | `skills/<skill-name>/SKILL.md` |
| 完整可检查参考案例 | [Calculator 基准案例](cases/calculator.md) |
| Agent 实际求解主线 | [Calculator 执行过程演练](cases/calculator-execution-walkthrough.md) |
| 某一版本实际上验证到了什么 | `docs/quality/` |

仓库中的 `check-handoff.js`、`check-artifact-chain.js`、`stage-review.js`、`check-workflow-stage.js` 等工具，只证明它们实际检查到的结构、引用、版本或退出条件。

> **检查器 PASS 不能替代真实业务事实、真实桌面观察、Skill 独立行为或 Candidate 的业务资格。**

详细使用方法和具体命令留在验证/工程文档，不在 WORKFLOW 主入口展开。

---

## 12. 读完本文以后应该能回答什么

如果 WORKFLOW 是清楚的，一个第一次接触 Agent-to-Recipe 的人应该能直接回答：

1. 一个用户需求最后为什么会变成 Recipe，而不是直接让 AI 写代码；
2. S1—S12 每一步把什么变成什么；
3. 每一步实际产出什么；
4. 每一步怎么判断基本正确；
5. Calculator 的 `firstResult` 怎样从真实读取一路进入最终代码；
6. 某一步错误以后应该回哪里；
7. 为什么不需要每次失败都重跑 S1；
8. 为什么最终结果正确不能倒证前面的真实执行正确；
9. 为什么 S11 Candidate 改动以后 S12 必须重新验；
10. 什么时候必须停止，而不能把未知写成通过。

如果这些问题仍然需要先理解大量 Gate、hash、schema 或检查器字段才能回答，说明 WORKFLOW 又开始偏离它的职责，应把工程细节重新下沉到对应权威文档。
