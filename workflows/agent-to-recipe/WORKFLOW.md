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

完整新 Agent 任务从 S1 开始，只有当前阶段退出合格才能正常进入下一个正式阶段，直到 S12；一次可验证工作包可以覆盖多个阶段，但不能跳过其中任一正式验收。合法 Continuation / Repair 复用经重新核验仍有效的上游，并把首个真实缺口作为恢复点。最终 Candidate、参考答案或事后正确结果都不能倒证尚未验收的早期阶段。

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

### 在另一对话接续的可复制入口

在已连接本仓库、能读取实际工作区与必要执行入口的 Codex 对话中，连同具体业务目标或现有任务根发送：

```text
请按 workflows/agent-to-recipe/WORKFLOW.md 接续这项任务：<业务目标或任务根>。
先核对当前工作区、原始需求、授权、正式 request/handoff、实际工件版本与证据，找到首个真实缺口；复用仍有效的上游。按 S1—S12 的适用职责读取对应 Skill，执行并逐阶段独立验收；正常交接时调用当前 Stage Guard，失败则记录责任和最小恢复动作。真实桌面动作前核对唯一执行者和新鲜状态，保留实际证据。输出普通 JS、冻结 CandidateManifest、独立资格与未完成项；未执行不得写通过。不要从参考代码或旧答案推断新的生产事实。
```

这段话会让当前对话的 Agent 选择方法，不是配置文件触发器。`skills/_nav.yml` 只控制文档排序；`.github/workflows/api-doc-contract.yml` 的 `agent-to-recipe-chain` 只运行 CI 合同与语法测试。仓库目前没有由自然语言自动启动 S1—S12 的通用宿主路由。实际 Agent 必须逐包核对、执行和调用检查器；`check-workflow-stage.js` 是有界只读 Gate，不能独自证明业务事实。若对话没有桌面权限、隔离上下文或必要资料，对应阶段保持未运行／阻塞，不能把复制提示词本身当作完成证明。

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

S2 的最小 discover PASS 只放行其已证明的应用认识。S3 拟执行的某个输入若仍缺操作性前置（例如准备动作是否消除了会影响下一业务动作的残留效果），先暂停该输入，把精确问题、旧规则、已知副作用与反例交 `application-engineer` 定向补证。审阅补证的版本、适用环境、可观察判据和限制后，作为原 S3 工作包的新输入返回；S1/S2 已合格的限定范围不因此自动失效，也不能把补证追写成原 S2 的历史观察。若补证改变 S2 已放行的主张，须按依赖重新审阅受影响边界。不要要求无法观察的内部状态全复位，也不要仅凭可见显示值或动作回执推断下一操作已独立。

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

具体怎么完成某项专业职责，进入对应 `skills/*/SKILL.md`；本文件不复制其方法正文。一个 Skill 同时承担的 S3/S4/S5/S6、S8/S9、S2/S10 分别固定输入、形成 Actual Output、分别评分和退出；其中 S3→S4→S5 可针对每个动作循环，S6 才收口整次示范。循环中的下一次 S3 不是跳过正式阶段；本次 S4 缺真实观察就不能以 S3 动作回执进入 S5。

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

- task / attempt 身份；
- 当前 TaskContract / WorkPlan；
- 本次允许消费的上游产物及版本；
- 当前允许修改的对象；
- 权限、副作用和预算；
- 预期交付物；
- 完成条件；
- 阻塞条件与 failure owner。

若输入不足，只补当前缺口；不要先重做无关阶段，也不要通过读取完整聊天或未声明目录绕过正式输入合同。

### 4.3 工程记录怎样对应执行流程

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

消费者生产新成果前，应按以下顺序检查：

```text
published handoff
→ frozen request
→ required artifact refs
→ actual bytes / hash
→ method input sufficiency
→ current Gate / unresolved items
→ produce downstream artifact
```

材料“存在”但没有正式交付时，先返回协调者；材料本身错误时，返回原 Producer / failure owner。

### 4.5 辅助检查与交接边界

仓库中的辅助检查只证明其实际检查的引用、版本、字节绑定或有限结构关系：

- [check-handoff.js](scripts/check-handoff.js)：request / handoff 身份、引用和 hash；不独立判断阶段语义、得分或桌面事实；
- [check-artifact-chain.js](scripts/check-artifact-chain.js)：当前支持范围内的相邻工件关系；`--through` 只检查前缀，不证明 S1—S12 全部已经执行；
- [stage-review.js](scripts/stage-review.js)：从上述固定工件生成有界只读审阅视图；它不读写进度、不计算分数、不做 Gate 退出决策；
- [check-workflow-stage.js](scripts/check-workflow-stage.js)：对本次阶段审查记录中的得分、必需测试／证据、Hard Fail、冻结版本和合法依赖做**只读确定性退出检查**；不亲眼见证真实桌面、不替审阅者给分；
- [acceptance-map.md](design/acceptance-map.md)：人工快速审阅相邻边界。

检查器 PASS **不等于**事实真实、Skill 独立行为正确、宿主已加载、桌面任务成功或 Candidate 已获得业务 Qualification。验证层级和证据要求见 [validation-plan.md](design/validation-plan.md)。

Calculator 的正式 S12 资格入口是仓库根目录的 `node tests/workflows/calculator/fresh-qualification.cjs --check <本次请求文件> --reviewed-source-sha256 <独立审阅的源码SHA256>`。请求必须以 `stageReviewRef` 绑定当前阶段审查记录；入口内部强制调用 S11→S12 Guard，并核对 S11 输出的 Candidate/source 与当前请求、合同身份一致。S11 必须提供当前 artifact-chain 报告及 `consumerVerification` 的 descriptor/evaluator 引用，不能通过省略 `requiredValidators` 绕开真实消费检查。入口只有收到可信调用者明确的同字节审阅授权，才通过固定 host callback 执行维护中的有界 L1 替身验证；不提供此参数时保持只读并拒绝需要执行的放行，记录内手填授权无效。Node vm 不是安全沙箱，未知代码必须先独立审阅；L1 不等于 live。缺来源链、失败或过期记录不能进入本工作流资格验证。`--postcheck <同一请求> <首次freeze-check> --reviewed-source-sha256 <同一SHA256>` 重读同版记录并产生独立受控观察，再核验冻结身份。此限制不延伸到与本工作流无关的普通 JS 运行，也不把确定性自洽检查冒充独立语义评审或真实现场证明。

### 4.6 正式阶段 Driver Loop

一个工作包可以覆盖一个或多个正式阶段，但**每个正式阶段都必须独立完成一次责任判断和一次五维 100 分评分**。从原始用户需求或正式 request 开始，协调者重复下面的循环；同一 Agent 可以连续担任 Producer，不要求每步新建会话或工件：

    resolve route（新任务 S1 / 合法接续的首个真实缺口）
    ↓
    resolve current stage：核对仍有效的前序 PASS、版本、证据和本次权限
    ↓
    freeze exact stage inputs：固定本阶段 request、输入原字节/hash、scope、证据与预算
    ↓
    load corresponding Skill 及该 Skill 明列的 input/output/validation/failure 规格
    ↓
    execute current stage（不预取未来标准答案）→ 形成 Actual Output
    ↓
    validate：逐项核对输入充分性、独有责任、真实输出、适用 Gate、证据、测试和 Hard Fail
    ↓
    score：对**本阶段**按 validation-plan 的 25/20/20/20/15 五维记录证据与得分
    ↓
    Stage PASS?（得分 ≥95 且无适用 Hard Fail、必需证据完整、无阻断 Unknown、必需测试通过）
      ├─ 是 → 先检查允许的后继与同版 handoff → 下一合法正式阶段
      └─ 否 → fail / blocked / not-run，禁止正常后继
    ↓
    找到第一个输入仍正确、输出首次错误的边界和真正 failure owner
    ↓
    保留有效上游，只失效依赖该错误的下游；定向修复并重验受影响阶段
    ↓
    新 evidence / 修复依据 / 授权足够且预算未尽 → 再判断退出；否则停止并交接缺口

该阶段正常退出的逻辑式是 `score >= 95 AND applicable Hard Fail == 0 AND required evidence complete AND blocking Unknown == 0 AND required tests passed`。高分只代表已计分维度，不抵消任何独立 Hard Fail；缺实际读取、缺证据、未获授权的真实执行以及 `not-run`/`blocked` 都不能借下游完成改写为 PASS。先选本阶段适用 G0—G7，记未适用 Gate 的原因；S1—S12 每阶段保留独立 score、verdict、输入版本、Actual Output、evidence 与未覆盖范围，不建立新的评分体系或共享 schema。`pass / fail / blocked / not-run` 是现有 Gate、scenario 或工作状态的可读归纳，不新增 `executionStatus` 枚举；`Minimum Next Gate` 也只表示下一阶段最低消费条件，不新增 G 编号。

在仓库根目录运行 Stage Guard。下面的 `my-run` 要替换为本次实际运行目录；阶段记录与临时证据存放在 `.runtime/tests/agent-to-recipe/` 下，不能把测试 fixture 或旧记录冒充本次真实 evidence：

```bash
node workflows/agent-to-recipe/scripts/check-workflow-stage.js --record .runtime/tests/agent-to-recipe/my-run/stage-reviews.json --root run=.runtime/tests/agent-to-recipe/my-run --from S4 --to S5
node workflows/agent-to-recipe/scripts/check-workflow-stage.js --record .runtime/tests/agent-to-recipe/my-run/stage-reviews.json --root run=.runtime/tests/agent-to-recipe/my-run --from S12 --to S12 --final
```

正常推进按冻结依赖核查职责，而不是以编号紧邻代替合法性。`acceptance.routing` 固定当前 `planRevision`、S1—S12 的 `dependencies` 与获准 `workPackages`。非相邻交接以记录的 `workPackageId` 选择冻结的工作包；包的 `from`、`to` 和 `members` 必须覆盖实际必需职责，各成员绑定 `stage`、`attemptId`、`planRevision`、`producerVersion`。复用成员另绑定 `reuseReviewRef`、`reuseReason` 和 `applicabilityEvidence`，重验旧成果、当前适用性及本次合法输入；缺少任一必需职责或版本依据仍拒绝。例如缺 S3—S6 时 S2→S7 不成立，但逐项已合格并正式分组／复用的工作包不因编号非相邻被拒。

`--final` 专用于完成 S12 后的独立最终校准。Guard 退出码 0 表示记录所能确定的退出／后继条件允许，退出码 2 表示拒绝，JSON 给出 `firstInvalidBoundary`、`failureOwner`、`preservedUpstream`、`invalidatedDownstream` 等诊断。S3/S4/S5 对多个动作的微循环由 task-demonstrate 在同一示范工作包内留逐动作证据；Guard 检查正式阶段出口，不将微循环当作未完成职责的绕过许可。

此记录是**本次验证的只读输入**，不是新的业务工件、共享合同或第二状态机。S1 先冻结 `acceptanceRef`：JSON 含 `taskId` 及 S1—S12 各自的 `requiredTests`、`requiredEvidenceKinds`；后续审查消费其同一精确引用，失败后不可删必测项。顶层保留 `taskId`、`attemptId`、`planRevision`、`acceptanceRef` 与按顺序排列的 `stages`；每阶段当前只选一份有效 review，旧失败另留历史。review 固定 `stage`、任务／attempt／计划、`producerVersion`、`producer`、`reviewer`，`inputs`、`outputs`、`evidence` 都使用 `{rootId,path,sha256,kind,schemaVersion}` 精确引用；分别写 `inputsSufficient`、`actualOutputCorrect`、`gate`、五维 `score` 和各维 `scoreEvidence`、`hardFails`、`blockingUnknowns`、`requiredTests`、`disposition` 与 Producer 实际读取 `audit.accessedRefs`，S1—S11 另明确 `audit.referenceRead=false`、`audit.futureOutputsRead=false`。S11 的 Candidate 源码和 Manifest 要按字节/hash 精确互绑并列全依赖；S12 reviewer 不得是 S11 Candidate Producer，且需绑定原字节、独立 Fresh Run 与 QualificationRecord。审阅结论和读取审计必须来自真实过程；Guard 能查它们与文件引用是否自洽，不能证明记录没有漏写的读取或编造的现场事实。

工具读取的是审查记录投影，不能把共享 handoff 原封不动当成此投影。最小字段映射如下（得分与 verdict 必须来自本阶段审查，不能照抄示例默认通过）：

| 投影字段 | 写法与来源 |
| --- | --- |
| `acceptanceRef` | 指向执行前冻结的验收 JSON；`stages` 可按 `S1`…`S12` 索引或数组，每阶段冻结测试名、证据角色和 `scoring:{denominator:100,granularity:5,items:[{id,dimension,maxPoints:5,criterion,requiredEvidenceKinds}]}`；二十项 ID 与职责映射见 validation-plan。顶层 `routing` 固定依赖及获准工作包 |
| `score` / `scoreEvidence` | 五维键为 `requirements`、`responsibility`、`continuation`、`validation`、`cost`；每维 `{reason,refs,items:[{id,score,reason,refs}]}` 逐项对应冻结判据，单项仅0/5/null，维度等于其项和；未评价维度为null，不能插值97/98或用满分填缺证 |
| `requiredTests` | `[{name, status, evidence:[精确引用]}]`，逐项对应 S1 名单；适用检查器报告可另用 `validationReports:[{tool,boundary,reportRef}]` 绑定，检查器失败不能被审查高分覆盖 |
| `gate` | `{verdict, evidence:[精确引用]}`，从本阶段适用 Gate 及证据投影；不是修改共享合同的 `gate.evidenceRefs` 字段 |
| 必需 actual evidence | S3 使用 `ActualExecution`，S4 使用 `ActualObservation`，S12 使用 `FreshRun` 的引用角色；业务证据仍按 S1 名单列全 |
| S11 / S12 输出 | S11 的源码、manifest 角色分别是 `CandidateSource`、`CandidateManifest`；S12 是 `QualificationRecord`。角色标签不能替代字节及内容核验 |
| S12 `qualificationRequestRef` | 指向运行前冻结的资格请求，并以同一精确引用列入 `inputs`；角色为 `QualificationRequest`，引用的版本与正文一致。请求先固定 Candidate/合同、`requested` 范围和 `scenarios`（各含 `id`、`scopeRefs`），最终同时对照请求、Qualification 和汇总，不能连同两份结果一起缩小范围 |
| `repair`（发生返修时） | `{ownerStage,previousReviewRef,basisRefs,attempt,maxAttempts}` 绑定旧失败与新依据；保留旧记录，不能仅重命名 attempt 或调高分数 |
| `final` | 独立 Evaluator 填写 `evaluator`、同候选 `candidateRefs`、`qualification`、`freshRun`、`requirementCoverage`、逐项 `requestedScenarios` 和 `requirementCriteria`；`referenceAlignment` 使用 `basis:requirements`、冻结 `referenceRef`、`verdict:compliant`、`hardFails` 和六方面 `aspects`（behavior/runtimeDataFlow/apiSemantics/failureSafety/engineering/applicability）。各项保存 `verdict`、`reason`、`differences`、`requirementRefs` 与 `refs`，不再写竞争分数；阻断发现绑定真正 owner 与证据 |

失败或阻塞时，必须能恢复出下面七项诊断视图：

    last confirmed correct artifact
    first invalid boundary
    failure owner
    missed-check owner
    invalidated downstream
    preserved upstream
    next minimum action

这七项同样不是新 schema。分别记录产生错误和应发现却漏过错误的责任；缺根因证据时标待诊断。优先映射到现有合同：

- `requestRef / inputRefs / artifacts`：固定输入、产物和最后确认正确的版本；
- `gate / failures[]`：当前阶段 verdict、失败分类和责任；
- `unresolved`：不能证明或尚未运行的缺口；
- `planDelta / nextRequest`：下一步最小修复／补采动作；
- `continuation.assetDisposition.preservedScope / changedScope`（适用时）：保留范围与受影响范围；
- 其他不能机器表达的诊断可作为 handoff 的可读 facts / unresolved / 主产物视图保存，不因此修改共享 schema。

同一 Skill 内部也按正式阶段分界：task-demonstrate 必须能指出错误首先属于 S3、S4、S5 还是 S6；procedure-synthesize 必须能指出首先属于 S8 还是 S9。只有前一阶段最低条件成立，后一阶段的输出才可以被当作正常下游输入。

S11 只能在 S10 的必要工程缺口已经关闭或有精确的仍有效规则可复用时正常进入。S11 冻结 Candidate 的**实际源码字节、hash、依赖、入口、工作目录及上游版本**后，S12 对同一对象独立 Qualification；Candidate 字节、依赖或影响性上游一变，旧 S12 不再有效。正式 S12 PASS 仍须完成第 6.1 节的最终闭合检查，才能对整项任务使用 `complete` 或 `qualified`。

### 4.7 Producer 输入隔离与独立评测

针对有参考实现的回归，新 Agent 的 S1—S11 Producer 只接收**原始用户需求、该阶段已固定的正式上游输入、对应 Skill 与其权威约束**。不要为“便利”把下游的 DistilledSteps、SemanticProcedure、Candidate、Qualification、测试 fixture 或完整旧聊天输入提前交给上游，也不能读取 `examples/agent-to-recipe/calculator.js`、Calculator 案例中的未来阶段答案或其他参考 JS 作为 Producer 的生成依据；对应 Skill 内的教学示例同样不得提供该目标任务的答案。执行工作流的维护者可以阅读案例检查方法，实际 Producer 的输入集合须独立记录以便审计。

新上下文不是访问隔离。新生产前必须记录并验证工具／文件系统的实际访问边界，拒绝参考、旧解答、历史日志、Git 历史与隐藏测试答案；仅提示禁止读取、`fork_context=false` 或手填读取清单不能证明受控隔离。通用知识、已验证通用 AppProfile、必要公开 API 和最终验收要求可以提供，但要记录来源及当前适用性。无法建立边界时把独立新生产标为 blocked，维护工作和冻结 JS Fresh Run 的证据不得冒充该项通过。

S11 的源码与 manifest 冻结以后，**独立 Evaluator** 才读取参考 JS 和任务 Oracle，做最终 Reference Alignment；不得将比较结果反向充当 S3/S4 的实际观察，或让生成者在原字节上偷改后沿用旧 S12。参考实现是校准目标而非必须复制的源码模板，等价或更好的独立实现按行为和数据流评判。

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

### 6.1 S12 之后的最终闭合（仍属于现有验收，不是 S13）

独立 Evaluator 针对**同一冻结 Candidate**核对 S12 Qualification、真实 Fresh Run、最终 Requirement Coverage 和 Reference Alignment。参考对照按 [validation-plan.md](design/validation-plan.md) 的业务行为、运行时数据流、API／操作语义、失败停止、工程质量及适用范围逐项给出基于需求的合规判断，不另设参考总分。源码文本 diff / token / AST 相似只能帮助定位，不作为通过阈值。若发现示范常量替代本次读值、清空 UI 后任务值丢失、第二次输入未消费实际读到的全部字符，或未运行却报 S3/S4/S12 PASS，即使最终数字正确也直接 Hard Fail。

评分或对照失败须返回**首个有证据的错误阶段**：S8 首次固化运行时值时修语义；若 S8/S9 数据角色正确而仅 S11 没消费真实字符串，则保留有效上游、修 S11并重验受影响S12。S10 定位失效时须检查对象身份及旧证据是否仍有效，不能预填 S1—S9 一律保留。按实际依赖记录七项诊断与最小动作；Reference Alignment 不改写原始要求、Oracle 或冻结 Candidate，也不以最终正确结果倒证上游。

只有以下项目**同时成立**，才可称整项完整新 Agent-to-Recipe 任务 `complete`、`qualified` 或 `fully passed`：

1. S1—S12 所有适用正式阶段逐一有独立 verdict；
2. 所有适用阶段各自得分 ≥95；
3. 所有适用 Hard Fail 均为零，必需证据与测试齐全、阻断 Unknown 为零；
4. requested scope 内的 `fail`、`not-run`、`blocked` 未被隐藏；
5. 阶段推进与接续没有非法跳步；
6. S11 Candidate 已冻结；
7. Candidate 的源码字节、入口、依赖、hash 及上游版本均已固定；
8. S12 对同一 Candidate 的独立 Qualification 已通过；
9. 本次 Calculator 等要求 Fresh Run 的场景在真实应用中成立，实际 `firstResult` 从结果显示区读出，保存在任务数据，UI clear 后仍存在，且完整字符进入第二次真实按钮输入；
10. Reference Alignment 六方面合规、Hard Fail 为零，参考差异未违反原始需求；
11. 最终 Requirement Coverage 完整；
12. 所有返修的实际受影响下游重新验证。

本轮 Calculator 同一冻结候选及依赖至少三次独立 Fresh Run，每次由普通 JS 重新读取并消费本次值；Agent 示范不计作 JS Fresh Run，历史单次成功不能替代本轮要求。三次成功不外推生产成功率。

最终报告分别列 S1、…、S12 的得分／状态、Reference Alignment 各项合规判断、Qualification、各项 `not-run` / `blocked` 和证据来源，不能只报综合分。若真实桌面或独立上下文不可用，准确记录 `not-run` / `blocked` 与解除条件，不能以静态 fixture、参考 JS 或历史通过记录代替。

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
