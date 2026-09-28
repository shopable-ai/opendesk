---
title: "Agent-to-Recipe｜工作流执行入口"
description: "Agent-to-Recipe 的进入、路由、交接、恢复与停止规则。"
order: 10
---

# Agent-to-Recipe｜工作流执行入口

本文只回答一个问题：

> **Agent 实际怎样进入、协调、暂停、恢复并完成 Agent-to-Recipe 工作流？**

完整“需要做什么”见 [task-decomposition.md](design/task-decomposition.md)；职责与交接关系见 [chain-design.md](design/chain-design.md)；字段、版本与正式交接约束见[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)。本文不复制专业方法正文，不维护质量报告，也不记录某一版本的实现成熟度。

## 30 秒总览

先用这一条主线理解整个工作流：

```text
收到任务
  ↓
确认现在做到哪一步
  ↓
确认这一步要解决什么
  ↓
检查开始需要的材料是否齐全
  ↓
读取这一步对应的专业方法
  ↓
真正执行并得到明确结果
  ↓
检查结果是否正确
  ↓
正确 → 固定结果并进入下一步
错误 → 回到真正出错的位置修复
阻塞 → 记录原因并安全停止
```

执行时先记住五条规则：

1. **阶段、专业方法包、文件、实际执行者不是一回事。**
2. **已有合格成果优先复用，只从第一个真实缺口继续。**
3. **真实事实、业务解释、程序实现、最终资格不能互相替代。**
4. **失败按责任定向返回，不默认回 S1。**
5. **普通业务运行直接使用已经交付的 Recipe，不重复执行 S1—S12。**

## 1. 先判断为什么进入这条工作流

| 入口 | 默认进入点 | 首先确认 | 不应该做什么 |
| --- | --- | --- | --- |
| 新的 Agent 自动化任务 | S1 | 用户目标、来源、授权、限制 | 先写代码、先猜点击细节 |
| 已有资产接续 | 第一个真实缺口 | source/hash/scope/evidence 是否仍有效 | 为了“完整”重跑有效上游 |
| 已有 Candidate，只缺资格 | S12 | Candidate 字节、依赖、requested scope | 重生成代码来取得 PASS |
| 应用规则失效 | S10 repair/harden | Procedure 是否仍成立、哪些规则失效 | 把定位失败改写成业务需求变化 |
| 已有普通 JS 需独立改进 | code-rebuild → S12 | 代码基线、允许修改范围、业务依据 | 强迫重做示范链 |
| Human Recorder 来源 | Human 来源链 → 共享专业职责 | 来源 lineage 与可消费输入 | 把 Human 记录追认为 Agent Dossier |
| Runtime primitive 真缺失 | 独立能力缺口 | 缺失能力、影响范围、解除条件 | 虚构 API 或改业务目标绕过 |

用户只给出 `workflows/agent-to-recipe` 时，给出的是**方法入口**，不是具体业务任务的 TaskContract、桌面执行授权或历史任务恢复点。先区分本轮是：维护方法、接续具体业务任务，还是验证工作流本身。方法维护不能冒充一次 S3—S12 业务示范。

## 2. 当前阶段与恢复点怎样确定

开始或恢复前，读取当前任务根、正式 request / handoff、实际主产物和当前进度索引；不要只根据旧聊天、文件名、修改时间或历史质量报告判断。

按下面顺序判断：

```text
1. 当前 TaskContract / WorkPlan 是否仍有效？
2. 当前工作包要求的输入是否真实存在并版本一致？
3. 上游 Gate 是否允许正常消费？
4. 是否存在会改变路线的授权、未知副作用或环境漂移？
5. 已有下游成果是否仍绑定当前上游版本？
6. 第一个不能被可靠消费的边界在哪里？
```

**第一个真实缺口就是默认恢复点。**

恢复时可使用下面的最小接续视图；它只是可读投影，不是新的 schema、Gate 或状态系统：

| 核对项 | 必须知道什么 |
| --- | --- |
| 本轮目标 | 这次只解决什么；来源在哪里 |
| 当前输入 | 实际消费哪些 request、handoff、主产物、Candidate / Qualification 版本 |
| 首个缺口 | 哪项事实、交接、实现或资格还不能可靠消费 |
| 责任方 | 哪个既有职责负责修复 |
| 权限／副作用 | 本工作包允许哪些真实动作；哪些结果仍 unknown |
| 输出 | 本次应该交付什么主产物 |
| 完成／停止 | 什么条件允许 handoff；什么情况必须 blocked / stop |

## 3. 选择职责，而不是重新发明阶段

开发链仍是 S1—S12；完整阶段内容由 [task-decomposition.md](design/task-decomposition.md) 拥有。本文件只给出执行路由：

| 职责 | 主要阶段 | 正常消费 | 正常交付 |
| --- | --- | --- | --- |
| automation-plan | S1 | Source、已有资产、授权、限制 | TaskContract / WorkPlan |
| application-engineer / discover | S2 | 合同、近期计划、旧 Profile、获准观察 | 最小 AppProfile / evidence / limits |
| task-demonstrate | S3—S6 | 合同、计划、Profile、真实输入、授权 | Dossier / Raw Trace / Evidence |
| trace-distill | S7 | 固定 Dossier / Trace、必要证据 | DistilledSteps |
| procedure-synthesize | S8—S9 | DistilledSteps、合同、必要应用资料 | SemanticProcedure |
| application-engineer / harden|repair | S10 | Procedure、旧规则、工程缺口 |可靠 Profile / rules / helper |
| recipe-build | S11 | Procedure、Profile/helper、正式 API 合同 | Recipe.js / CandidateManifest |
| code-rebuild | S11 可选 / 独立入口 | 精确代码基线、业务依据、修改范围 | 原样保留结论或新 Candidate |
| recipe-qualify | S12 | 冻结 Candidate、scope、场景、环境、授权 | QualificationRecord |

> **责任分组不等于阶段合并。** 表中的 S3—S6 表示同一个 task-demonstrate 方法包连续承担四个正式阶段：S3 Execute、S4 Observe/Verify、S5 Classify/Decide、S6 Close；S8—S9 同理，S8 是 Business Semantics，S9 才是 Reusable Procedure。需要判断某一阶段是否正确时，以 [task-decomposition.md](design/task-decomposition.md) 和 [Calculator 案例](cases/calculator.md) 的逐阶段定义为准。

具体怎么完成某项专业职责，进入对应 `skills/*/SKILL.md`；本文件不复制其方法正文。

正式方法包入口：[automation-plan](skills/automation-plan/SKILL.md)、[application-engineer](skills/application-engineer/SKILL.md)、[task-demonstrate](skills/task-demonstrate/SKILL.md)、[trace-distill](skills/trace-distill/SKILL.md)、[procedure-synthesize](skills/procedure-synthesize/SKILL.md)、[recipe-build](skills/recipe-build/SKILL.md)、[code-rebuild](skills/code-rebuild/SKILL.md)、[recipe-qualify](skills/recipe-qualify/SKILL.md)。

## 4. 一个阶段实际怎样执行

这一节只回答最实际的问题：

> **Agent 到了某一个阶段以后，下一步到底怎样做？**

所有阶段先共用下面七个动作；至于“专业上具体怎样做”，再进入对应方法包。

```text
1. 确认现在做到哪一步
   ↓
2. 明确这一阶段要解决什么
   ↓
3. 检查开始需要的材料是否齐全
   ↓
4. 读取并执行这一阶段自己的专业方法
   ↓
5. 产出这一阶段应有的明确结果
   ↓
6. 检查这个结果是否正确
   ↓
7. 决定下一步

正确
→ 固定结果
→ 交给下一阶段

错误
→ 找到第一处真正错误
→ 回到负责该错误的阶段修复
→ 修复后从受影响位置继续

无法安全继续
→ 记录缺什么、为什么不能继续
→ 停止受影响路径
```

这七步不是新的 S 编号，也不是新的 Skill。它只是 S1—S12 在实际执行时共用的推进方法。

### 4.1 七步分别要回答什么

| 步骤 | Agent 必须回答的问题 | 执行后应该得到什么 |
| --- | --- | --- |
| 1. 确认位置 | 我现在真正应该从哪一步开始？ | 当前阶段或恢复点 |
| 2. 明确问题 | 这一阶段负责解决什么，不负责什么？ | 本阶段清晰目标和完成条件 |
| 3. 检查材料 | 上一步的结果、版本、证据、授权够不够？ | 可以开始，或明确缺少什么 |
| 4. 执行方法 | 这个阶段专业上应该怎样做？ | 实际执行过程 |
| 5. 形成结果 | 这一阶段真正做出了什么？ | 本阶段主产物 |
| 6. 检查结果 | 结果是否满足本阶段完成条件？有没有丢失关键事实或数据关系？ | 通过、失败或无法确认 |
| 7. 决定去向 | 正确后交给谁？错误最早从哪里开始？ | 下一阶段、定向修复或安全停止 |

例如到了 S7：

```text
现在做到哪里？
→ S7

这一阶段解决什么？
→ 从真实执行记录中提炼真正必要的步骤

材料够不够？
→ 必须有已经冻结的真实执行事实、动作记录和必要证据

怎样做？
→ 使用 trace-distill 方法判断哪些动作保留、合并、省略、作为恢复动作，哪些仍无法确认

得到什么？
→ DistilledSteps（必要步骤）

怎样检查？
→ 必要步骤有真实来源；firstResult 之类的运行时数据来源和消费者没有被删掉

下一步？
→ 正确：进入 S8
→ S7 自己取舍错误：留在 S7 修
→ 前面根本没有真实事实：返回 S3—S6 补事实
```

完整 Calculator 求解过程见 [Calculator 执行过程演练](cases/calculator-execution-walkthrough.md)。

### 4.2 一个工作包开始前要固定什么

一次工作包开始时至少固定：

- 当前任务和本次尝试；
- 当前有效的任务要求和计划；
- 本次允许使用的上游结果及版本；
- 当前允许修改的对象；
- 权限、副作用和预算；
- 这一步预期产生什么；
- 什么情况算完成；
- 什么情况必须停止，以及错误应由谁负责。

若材料不足，只补当前缺口；不要为了“流程完整”重做已经有效的上游，也不要通过读取完整聊天或未声明目录绕过正式输入。

### 4.3 工程记录怎样对应上面的七步

工程字段只用于让执行结果可以被机器核对、暂停后恢复、跨会话交接。它们不应该取代前面的七步人类可读流程。

| 人类可读问题 | 工程上主要记录 |
| --- | --- |
| 我现在做到哪一步？ | 当前 request、进度和实际恢复点 |
| 开始材料够不够？ | 输入引用、版本、文件字节或 hash、上游 Gate |
| 这一步做出了什么？ | 主产物和版本 |
| 为什么相信结果？ | evidence / 实际证据 |
| 现在能不能继续？ | Gate 与 unresolved |
| 错误应该回哪里？ | failure owner / failures |
| 修复会影响哪些下游？ | preserved / changed scope、nextRequest |
| 怎样让下一次独立继续？ | handoff / continuation |

保留这些英文标识，是因为它们是现有文件字段或代码标识；理解流程时优先看左侧中文。

### 4.4 正式交接前怎样检查

消费者生产新成果前，按下面顺序核对：

```text
上一步已经正式交付
→ 当前请求已经固定
→ 本阶段要求的输入引用齐全
→ 实际文件和版本一致
→ 专业方法要求的输入足够
→ 当前检查结论允许继续
→ 才产生新的下游结果
```

材料“存在”但没有正式交付时，先回到协调职责补齐交接；材料本身错误时，回原生产阶段修复。

仓库中的辅助检查只证明它们实际检查到的引用、版本、字节绑定或有限结构关系：

- [check-handoff.js](scripts/check-handoff.js)：检查 request / handoff 身份、引用和 hash；
- [check-artifact-chain.js](scripts/check-artifact-chain.js)：检查当前支持范围内的相邻工件关系；
- [acceptance-map.md](design/acceptance-map.md)：供人工快速检查相邻边界。

检查器通过，**不等于**真实业务事实已经成立，也不等于桌面任务成功或 Candidate 已获得最终资格。验证层级和证据要求见 [validation-plan.md](design/validation-plan.md)。

同一专业方法包内部也仍然保留正式阶段边界：例如 task-demonstrate 要能指出错误首先属于 S3、S4、S5 还是 S6；procedure-synthesize 要能指出首先属于 S8 还是 S9。只有前一阶段最低条件成立，后一阶段结果才可以作为正常下游输入。

## 5. 结束与恢复必须交付什么

暂停、阻塞、完成当前工作包或交给新会话时，至少留下：

- 当前任务根和计划版本；
- 本轮实际读取的上游版本；
- 本轮新增／修改产物；
- 实际执行过的检查及结果；
- 当前失败／阻塞原因；
- 已发生、未发生或结果未知的副作用；
- 仍可复用的成果；
- 下一责任阶段／职责；
- 下一步最小安全动作；
- 剩余授权与预算。

不要只留下“做到 S9”“测试通过”“继续优化”这类无法独立恢复的信息。

恢复时重新核对原件和当前现场。接续卡、摘要或旧质量记录都是导航，不自动成为新授权、新资格或当前事实。

## 6. 失败以后怎样路由

先判断错误属于哪一层，再决定返回哪里：

| 问题 | 默认责任 | 默认动作 |
| --- | --- | --- |
| 目标、授权、成功标准、计划错误 | S1 automation-plan | 修合同／计划，不让代码倒推用户意图 |
| 应用身份、页面、读取依据不足 | S2 application-engineer | 定向补认识；必要时重新确认路线 |
| 实际动作、读值、结果事实缺失 | S3—S6 task-demonstrate | 补真实事实，不事后造 observation |
| 必要动作取舍错误 | S7 trace-distill | 修 DistilledSteps；事实不足再回 S3—S6 |
| 业务语义、参数、数据依赖错误 | S8—S9 procedure-synthesize | 修 Procedure，不用硬编码绕过 |
| locator/read/wait/action 规则错误 | S10 application-engineer | repair/harden，只重验受影响下游 |
| Candidate 实现错误 | S11 recipe-build / code-rebuild | 修代码并冻结新 Candidate |
| Qualification 场景、Oracle、证据问题 | S12 recipe-qualify | 留在 S12；不修改 Candidate 来取得通过 |
| Runtime primitive 真缺失 | Runtime capability owner | 阻塞受影响路径，记录解除条件 |
| 动作结果 unknown | 当前执行 owner + coordinator | 先对账或停止，不盲重放 |

影响性变化只使依赖它的下游失效：

```text
TaskContract 变化 → 重新判断依赖旧语义的下游
Dossier / Trace 变化 → S7 及受影响下游
DistilledSteps 变化 → S8—S12 受影响部分
SemanticProcedure 变化 → S10—S12 受影响部分
AppProfile / helper 变化 → 依赖它的 Candidate / Qualification
Candidate 字节变化 → S12
Qualification 配置修正且 Candidate 未变 → 只重验 S12 受影响范围
```

同类失败在没有新证据、修复依据或新授权时，不重复尝试。

## 7. Stop：什么时候必须停

出现以下任一情况，应停止受影响路径并留下准确状态：

- 必需输入缺失且无法从获准来源核实；
- 授权不足或权限边界不清；
- 副作用可能已经发生但结果无法确认；
- 目标身份无法可靠消歧；
- Runtime / API 能力真实缺失；
- 当前预算或停止条件已到；
- 同类失败没有新信息；
- requested scope 中关键证据仍 `not-run` / `blocked`，但有人试图把它写成 PASS。

能够独立、安全完成的其他工作可以继续；Unknown 只阻塞依赖它的部分。

## 8. 能力发现与专项工程从哪里接入

能力发现不是新阶段，也不是 S13：

```text
业务需要
→ 找候选能力
→ 阅读 canonical contract
→ 在当前范围验证
→ 把选择与依据写回现有 Procedure / Candidate 来源关系
```

应用工程统一使用 application-engineer 的 `discover / harden / repair`；具体定位、读取、VLM、Structured Collection、Traversal、Runtime primitive 等专项算法进入各自权威文档，不在 WORKFLOW 展开。

## 9. 作者链与普通业务运行的边界

Agent-to-Recipe 是**作者链**：生产、修复和验证自动化成果。

- 普通运行已有合格 Recipe：不进入 S1—S12。
- 出现 Gap / Failure / 新支持范围：从第一个责任缺口进入作者链。
- S12 通过：得到固定 Candidate 的资格结论。
- 是否登记到 Catalog / Registry 或其他发布系统：由显式发布边界处理，S12 不自动发布。

跨 Runtime / Catalog / Authoring 的产品生命周期见 [Automation Capability Lifecycle](../../docs/architecture/desktop-automation/task-capability-lifecycle.md)。

## 相关权威文档

- **为什么做、必须满足什么** → [requirements.md](design/requirements.md)
- **完整需要做什么** → [task-decomposition.md](design/task-decomposition.md)
- **谁生产什么、交给谁、错了回哪里** → [chain-design.md](design/chain-design.md)
- **怎样快速检查交接** → [acceptance-map.md](design/acceptance-map.md)
- **怎样证明每一层做对** → [validation-plan.md](design/validation-plan.md)
- **怎样做应用工程** → [application-operations.md](design/application-operations.md)
- **怎样独立改进已有 JS** → [code-rebuild.md](design/code-rebuild.md)
- **字段、版本与正式 handoff** → [共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)
- **某一版本实际上验证到了什么** → `docs/quality/`

当前执行只使用 S1—S12。历史 R1—R13、某次测试 PASS、某个 Calculator 版本、某轮宿主加载结果和逐日期迁移记录属于设计历史或质量证据，不在本 canonical 执行入口维护。