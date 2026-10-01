---
title: "Calculator 阶段产物链｜每一步应该留下哪些可检查文件"
description: "把 S1—S12 的正式产物、真实运行文件、阶段检查点和 Calculator 示例内容连接起来，便于人工逐阶段定位首错。"
order: 11
---

# Calculator 阶段产物链｜每一步应该留下哪些可检查文件

本文回答两个问题：每个阶段完成后应该留下什么可检查文件或固定引用，以及出错后应该先打开哪里。求解过程见 [Calculator 执行过程演练](calculator-execution-walkthrough.md)；逐阶段正确性见 [Calculator 基准案例](calculator.md)。

---

## 0. 先确定：人工看 Markdown，程序认权威数据

这条产物链默认采用 **“机器权威 + 人工首读”双层结构**。

### A. 机器权威层

负责程序消费、hash、checker、正式引用和后续自动化：

~~~text
结构化 JSON
+ exact Recipe.js
+ Execution 原始 evidence
+ content-bound refs / hashes
~~~

这些才是正式事实来源。

### B. 人工阅读层

负责让人快速看懂、排错和定位首错：

~~~text
stage-review.md
+ 与复杂主产物同版的 Markdown 视图
~~~

人工视图必须：

- 注明来源主产物或 Execution evidence 的 path/ref/hash；
- 从权威数据生成或重生成；
- 不单独维护另一套事实；
- 发现错误时先修权威产物/事实，再刷新 Markdown。

因此这里不是：

~~~text
JSON 一套真相
Markdown 又写一套真相
~~~

而是：

~~~text
JSON / Execution / exact JS
  ↓ 同版本投影
Markdown
~~~

### B.1 `stage-review.md` 的正式生成边界

`stage-review.md` 不由人工重新判断一次 S1—S12，也不维护第二套分数。正式路径是：

~~~text
StageReview / artifact / evidence refs
  ↓
check-workflow-stage.js
  ↓ 唯一负责 score / Gate / Hard Fail / Unknown / firstInvalidBoundary
stage-review.js
  ↓ 只读 Markdown 投影
<task-root>/stage-review.md
~~~

例如检查到 S7、准备进入 S8 时：

~~~bash
node workflows/agent-to-recipe/scripts/check-workflow-stage.js \
  --record <active-review.json> \
  --root run=<artifact-root> \
  --from S7 \
  --to S8 \
  --format markdown \
  > <task-root>/stage-review.md
~~~

最终 S12 完整检查使用：

~~~bash
node workflows/agent-to-recipe/scripts/check-workflow-stage.js \
  --record <active-review.json> \
  --root run=<artifact-root> \
  --from S12 \
  --to S12 \
  --final \
  --format markdown \
  > <task-root>/stage-review.md
~~~

如果一次 task 使用多个 `rootId`，按 checker 合同重复提供 `--root id=/absolute/root`。Shell 重定向只是把同一次 checker 结果落盘；renderer 本身不执行桌面动作、不修改 StageReview，也不授予 PASS。

报告首屏至少必须直接显示：

~~~text
当前状态
first invalid boundary
failure owner
last confirmed correct stage
preserved upstream
invalidated / blocked downstream
next minimum action
~~~

随后按 `## S1` … `## S12` 展示本阶段 Actual Input / Output / Evidence、独立 score、Hard Fail、Blocking Unknown、required tests、Gate、verdict 和 checker errors。**高分遇到 Hard Fail 仍必须显示 FAIL。**

### C. 阶段产物链（Stage Artifact Chain）

S1—S12 真正产生、更新或固定的成果链：

~~~text
Source
→ TaskContract / WorkPlan
→ AppProfile
→ Actual Action / Observation / Decision
→ Demonstration Dossier
→ DistilledSteps
→ Business Steps
→ SemanticProcedure
→ hardened AppProfile / operation rules
→ Recipe.js + CandidateManifest
→ QualificationRecord
~~~

### D. 阶段检查点（Stage Checkpoint）

每个 S 阶段退出前，都必须在任务根 `stage-review.md` 中有稳定人工入口，并能看到：

~~~text
actual inputs
machine artifact / evidence refs
human-readable view
actual output
required evidence
score / Hard Fail / Unknown
verdict
failure owner / next action
~~~

机器验证继续使用既有 `acceptanceRef → stages[S1…S12]`；`stage-review.md` 只是它和实际产物的人工投影，不新增 S13，也不创建第二套评分 schema。

### E. Calculator 黄金产物包（Golden Artifact Pack）

本文给出的内容属于**参考答案视图**：告诉维护者“正确形状大概是什么”。真实运行仍必须在自己的 task / attempt / Execution 目录中产生新文件和新证据，不能复制这里的 Actual。

---

## 0.1 本次接续的真实入口（2026-09-30 UTC / 2026-10-01 本地）

任务 `revision-20260929-s1` 的实际产物保存在 [calculator-completion-20261001](../../../.runtime/automation-authoring/calculator-completion-20261001/)。本节是事实导航；第 3 节仍是参考示例。当前权威入口是 [根 stage-review.md](../../../.runtime/automation-authoring/calculator-completion-20261001/stage-review.md)，引用解析依据是 [roots.json](../../../.runtime/automation-authoring/calculator-completion-20261001/roots.json)。

导航的阅读顺序是阶段业务正文 → 原始来源与同版产物 → 证据及限制 → 检查结论与评分。此轮维护只允许静态读写；生产和桌面权限仍以用户指令及工作包为准。已发生的 Execution 保留原状态，暂停后没有执行的修复验证标为未运行，投影源码与文档修改标为未执行验证。

下表绑定固定检查 [check-2026-10-01T09-34-11-006Z-6f6568fc](../../../.runtime/automation-authoring/calculator-completion-20261001/checks/check-2026-10-01T09-34-11-006Z-6f6568fc/checker-result.json)，计划 `completion-recovery-r3`；该检查仅放行 S2 → S3。[同次快照索引](../../../.runtime/automation-authoring/calculator-completion-20261001/checks/check-2026-10-01T09-34-11-006Z-6f6568fc/snapshot-index.md)包含完整 hash 和固定文件。后来进度以根视图链接的新检查为准；保留的旧示范不能自动继承新准入。

**比该固定检查更新的事实：** 2026-10-01 17:35（Asia/Shanghai）的新 S3 Execution `ai-20261001-173517-643000` 已 failed，`Wrong display binding`，Calculator 按钮输入为 0。此失败尚未由本文件给出正式阶段分数或 verdict。原始 [summary](../../../.runtime/ai/ai-20261001-173517-643000/summary.json)、[源码快照](../../../.runtime/ai/ai-20261001-173517-643000/script_snapshot.js)、[stdout 请求／回执](../../../.runtime/ai/ai-20261001-173517-643000/stdout.log)绑定源码 hash `f2822f77a0f769d593a3fb33e11004f19216e0f60d001810b5604d6b56613e01`。新失败的定位正文见 [正确性案例](calculator.md#21-本次-actual-的审阅边界)。根投影尚需唯一协调者在正式检查后更新；不能把旧放行误读为本次运行成功。

| 阶段及责任 Skill | 应达到的业务结果 | 实际产物、版本及下游 | cases 对照入口 | 本固定检查与已知修复责任 |
| --- | --- | --- | --- | --- |
| S1 automation-plan | 固定按钮任务、实际读值链、权限、停止和预算 | [TaskContract](../../../.runtime/automation-authoring/calculator-completion-20261001/s1-binding-broker-006/task-contract.json) `994930bcd1b2…`；[r3 WorkPlan](../../../.runtime/automation-authoring/calculator-completion-20261001/recovery-current/continuation-001/work-plan.json) `de66161ff8c7…`；S2 实际复用业务要求 | [S1 六问](calculator.md#s1任务与计划) | 正式阶段判断见固定报告；历史未知不由新预算追写 |
| S2 application-engineer discover | 确认目标、按钮、结果区和清空规则的依据与范围 | [AppProfile 人工视图](../../../.runtime/automation-authoring/calculator-completion-20261001/application-increment/broker-r004/app-profile.md)对应 JSON `80309cb181ca…`；当前复用绑定、独立审阅和预检进入 S3 | [认识方法](calculator-execution-walkthrough.md#4-建立最小应用认识并验证所选能力能否在当前现场成立-s2) | 清空规则缺口已有定向真实试验；新的输入仍须现场和预算预检 |
| S3 task-demonstrate | 保存真实动作及回执 | 旧 [第一段事件索引](../../../.runtime/automation-authoring/calculator-completion-20261001/demo-first-actual-event-index.json)和 [第二段事件索引](../../../.runtime/automation-authoring/calculator-completion-20261001/demo-second-actual-event-index.json)分别绑定 `direct-20261001-044351-656000` / `ai-20261001-051140-472000`；新示范 `ai-20261001-173517-643000` 的 [固定失败源码](../../../.runtime/ai/ai-20261001-173517-643000/script_snapshot.js)和 [summary](../../../.runtime/ai/ai-20261001-173517-643000/summary.json)独立保留 | [S3 六问](calculator.md#s3执行当前获准动作) | 旧准入 F01 保留；新尝试在显示区绑定校验失败，owner 尚未确定，无新业务读值 |
| S4 task-demonstrate | 从正确结果区实际读取 | [firstResult 保存](../../../.runtime/automation-authoring/calculator-completion-20261001/first-result-actual.json)绑定 A032；[读值／输出核对](../../../.runtime/automation-authoring/calculator-completion-20261001/demo-independent-result-verification.json)绑定 B052 与两个独立观察；值交给旧事实包 | [S4 六问](calculator.md#s4观察并验证实际效果) | 保留真实 `110` 和 `660` 观察；不补成当前 S4 验收 |
| S5 task-demonstrate | 保存继续、停止、恢复的决定 | 两段实际原始事件含 decision/stop；[四阶段审阅](../../../.runtime/automation-authoring/calculator-completion-20261001/reviews/demo-review-findings.json)区分事实可信与准入不足 | [S5 六问](calculator.md#s5分类并决定下一步) | 旧 S5 受 F01 影响；不以正常结果抹去停止条件 |
| S6 task-demonstrate | 交出完整示范事实包 | [Dossier 同版人工视图](../../../.runtime/automation-authoring/calculator-completion-20261001/s6-bound/dossier.md)、[权威 JSON](../../../.runtime/automation-authoring/calculator-completion-20261001/s6-bound/dossier.json)、[RawTrace](../../../.runtime/automation-authoring/calculator-completion-20261001/demo-raw-trace.json)；48 条动作/读值切片保留原始来源 | [S6 六问](calculator.md#s6任务级事实收口) | 已有产物；旧 S6 退出受 F01 阻塞，未交为合格 S7 输入 |
| S7 trace-distill | 保留必要路径和全部数据关系 | 本固定检查尚未发布 DistilledSteps；不能从最终代码反推 | [S7 六问](calculator.md#s7提炼必要步骤) | 等待合格 S6，复核 firstResult 生产者和逐字符消费者 |
| S8 procedure-synthesize | 明确业务语义 | 本固定检查尚未发布业务步骤版本 | [S8 六问](calculator.md#s8解释业务语义) | 不把参数、运行时值和验收 Expected 混用 |
| S9 procedure-synthesize | 固定过程与数据依赖 | 本固定检查尚未发布 SemanticProcedure | [S9 六问](calculator.md#s9形成可复用业务过程) | 核对固定 S7/S8 版本、生产者和消费者 |
| S10 application-engineer harden | 补强过程所需应用规则 | S2 discover Profile 与未来 harden 版本须分开绑定 | [S10 六问](calculator.md#s10应用操作工程化) | 已有清空试验可作为限定资产，不能代替完整过程规则验收 |
| S11 recipe-build | 生成并冻结普通 JS | 本固定检查没有最终 Candidate；示范 JS 和历史维护候选均不能代替 | [S11 六问](calculator.md#s11生成并冻结-javascript-候选程序) | 待真实上游交接后生产、固定源码和依赖 |
| S12 recipe-qualify | 同一冻结候选独立运行 | 本固定检查没有本生产链 Qualification | [S12 六问](calculator.md#s12独立资格验收) | 按合同三次完整 Fresh Run；其他任务两次 Human H7 不进入本链 |

**定位错误直接进入 [Actual 数据链和四项问题](calculator.md#21-本次-actual-的审阅边界)。** 其中清空规则、Runtime 类型修复、旧预算准入缺口和新显示区绑定失败分别有原始记录、保留范围及责任确定程度；不能统称为 Skill 出错。表内职责和导航不独立评分，正式判断仍由唯一 checker 与其投影提供。

本次可读性修订仅静态读取、编辑既有文件。没有运行 Node、render、测试或 Runtime，没有刷新根 stage-review/progress/production，也没有生成独立 preview。用户暂停执行期间，这些修改的生成效果、链接全面核验和新失败修复均保持未验证；现有源码修改不能冒充运行结果。

`.runtime/` 是可清理的运行目录。证据被清理、同版链接失效或 hash 不匹配后，必须标记不可验证；本案例正文不能保留无依据的当前通过声明。

---

## 1. 一次真实运行的文件应该从哪里找

推荐的人机双层目录视图如下。并不是每个 attempt 都会拥有下面所有文件；只生成该职责实际产生的主产物和对应视图。

~~~text
.runtime/automation-authoring/<task-id>/
  user-task.md

  plan/r001/
    task-contract.json       # 机器权威
    task-brief.md            # 人工视图
    work-plan.json           # 机器权威
    operation-plan.md        # 人工视图

  progress.json              # 机器当前状态
  stage-review.md            # 人工首读：S1—S12 状态、产物、证据、评分、首错

  attempts/<attempt-id>/
    request.json

    app-profile.json         # S2 / S10 权威
    app-profile.md           # S2 人工视图
    operation-rules.md       # S10 人工视图

    dossier.json             # S6 权威
    dossier.md               # S6 人工视图

    distilled-steps.json     # S7 权威
    distilled-steps.md       # S7 人工视图

    procedure.json           # S8 / S9 精确阶段版本
    business-steps.md        # S8 人工视图
    procedure.md             # S9 人工视图

    Recipe.js                # S11 exact candidate source
    candidate.json           # S11 CandidateManifest
    candidate-summary.md     # S11 人工视图

    qualification.json       # S12 权威
    qualification-summary.md # S12 人工视图

    handoff.json

  <Execution.artifactDir>/
    ... actual action / observation / logs / screenshots / receipts ...
~~~

真实桌面动作、观察、截图、日志和业务输出仍优先位于对应 `Execution.artifactDir`；任务目录和 `stage-review.md` 保存其固定引用。

因此人工排错的默认顺序应该是：

~~~text
先打开 stage-review.md
  ↓
找到第一个 fail / uncertain / missing artifact 的 S 阶段
  ↓
打开该阶段的 Markdown 人工视图
  ↓
必要时再下钻到 JSON / Recipe.js / Execution 原始 evidence
~~~

而不是一开始就在大型 JSON 中人工找字段。

---

## 2. S1—S12：机器文件和人工首读文件

| 阶段 | 机器权威 / 原始事实 | 人工首先打开 | 人工主要检查什么 |
| --- | --- | --- | --- |
| **S1** | `plan/rNNN/task-contract.json` + `work-plan.json` | `task-brief.md` + `operation-plan.md`，总览见 `stage-review.md#S1` | 原需求是否被偷换；Expected、固定输入、runtime value、Unknown 是否分开 |
| **S2** | attempt 内 `app-profile.json` + 发现 evidence | `app-profile.md`，总览见 `stage-review.md#S2` | Calculator/window/按钮/结果区依据和限制是否真实 |
| **S3** | `Execution.artifactDir` 的 actual request / action / raw receipt + `acceptanceRef.stages.S3` | `stage-review.md#S3` | 动作是否真的发生、目标是谁、原始返回和 side effect 状态是什么 |
| **S4** | `Execution.artifactDir` 的 actual observation + `acceptanceRef.stages.S4` | `stage-review.md#S4` | 是否观察正确对象；Actual 是否与 Expected 分开 |
| **S5** | 实际 decision / planDelta / failures + `acceptanceRef.stages.S5`，必要引用 `handoff.json` | `stage-review.md#S5` | continue / revise / recover / stop 是否有据；unknown side effect 是否错误继续 |
| **S6** | `dossier.json` + Raw Trace / Evidence refs | `dossier.md`，总览见 `stage-review.md#S6` | 整次示范是否保留 firstResult producer → consumer 数据链 |
| **S7** | `distilled-steps.json` | `distilled-steps.md`，总览见 `stage-review.md#S7` | 必要读取、清空、重复数字和数据依赖是否被误删/误合并 |
| **S8** | 当前 S8 attempt 固定的 `procedure.json` 精确版本中的 Business Steps + `acceptanceRef.stages.S8` | `business-steps.md`，总览见 `stage-review.md#S8` | 每步业务目的、输入、输出、来源和消费者是否完整；不能提前把 runtime value 常量化 |
| **S9** | 当前 S9 attempt 固定的 `procedure.json` 精确版本 | `procedure.md`，总览见 `stage-review.md#S9` | 参数、runtime value、dataDependencies、scope 是否有来源 |
| **S10** | 新版本 `app-profile.json` + helper + validation evidence | `operation-rules.md`，必要时同时看 `app-profile.md`；总览见 `stage-review.md#S10` | locator/read/clear/wait/verifier 是否可靠且不改变业务语义 |
| **S11** | exact `Recipe.js` + `candidate.json` | `candidate-summary.md`，总览见 `stage-review.md#S11` | 代码是否真实消费 firstResult；源码、入口、依赖、hash 是否冻结 |
| **S12** | `qualification.json` + S12 Fresh Run Execution evidence | `qualification-summary.md`，总览见 `stage-review.md#S12` | 是否对同一 Candidate 真跑；requested 中 not-run/blocked 是否被错误写 PASS |

> **为什么 S3、S4、S5 不再各造一个 JSON？**  
> 这三个阶段的权威事实本来就来自真实 Execution、阶段 acceptance 和 handoff/planDelta。再造 `s3.json / s4.json / s5.json` 容易产生第二套事实。人工可读性由 `stage-review.md#S3/#S4/#S5` 解决。

> **为什么 S2/S10、S8/S9 可以出现相同主文件名？**  
> 因为它们是不同 attempt / revision 的精确文件，正式引用依赖 path + hash，而不是文件名猜版本。S2 与 S10 的 `app-profile.json`、S8 与 S9 的 `procedure.json` 必须分别由各自阶段 acceptance 绑定准确版本，不能盲读 latest。

---

## 3. Calculator 各阶段的最小示例内容

下面只展示人应当一眼看见的关键内容。完整字段仍看正式 schema 和对应 Skill 输出规格。

### S1｜机器：`task-contract.json` / `work-plan.json`｜人工：`task-brief.md` / `operation-plan.md`

~~~text
goal
  两次 Calculator 计算；第二次必须使用第一次现场读取的 firstResult

fixed inputs
  25, 4, 10, 6

runtime values
  firstResult = 第一次结果区真实读取
  finalResult = 第二次结果区真实读取

expected oracle
  firstResult = "110"
  finalResult = "660"

data rule
  P50 必须消费本次 P30 actual firstResult

state rule
  P40 清空 Calculator UI，但不能删除任务数据 firstResult

plan
  P10 → P20 → P30 → P40 → P50 → P60
~~~

首错信号：合同只写“最后得到 660”，没有真实 firstResult 数据链。

### S2｜机器：`app-profile.json`｜人工：`app-profile.md`

~~~text
application
  Calculator

window
  本次任务当前目标窗口

targets
  数字、×、+、=、clear 按钮
  当前结果显示区

known
  点击目标和读取目标必须属于同一个当前 Calculator window

unknown / limits
  目标唯一性
  读取稳定性
  clear 后可观察状态
  当前布局支持范围
~~~

首错信号：按钮/结果区来自猜测、旧截图或历史坐标，却被写成当前现场事实。

### S3｜机器：Execution actual action / receipt｜人工：`stage-review.md#S3`

~~~text
planned step
  P30 读取第一次结果

actual request
  read current Calculator result display

actual return
  "110"

also keep
  actual target
  execution identity
  raw receipt
  evidence refs
  sideEffect = known / unknown
~~~

S3 只能证明“动作/调用实际发生及其原始返回”；是否观察到了正确业务对象由 S4 判断。

### S4｜机器：Execution actual observation｜人工：`stage-review.md#S4`

~~~text
source action
  P30 actual read action

observed object
  当前 Calculator 结果显示区

Actual
  read1 = "110"
  read2 = "110"
  sameTarget = true
  stable = true

Expected
  "110"

comparison
  pass
~~~

首错信号：因为 Expected 是 110，就直接把 Actual 写成 110。

### S5｜机器：decision / planDelta / acceptance｜人工：`stage-review.md#S5`

~~~text
classification
  runtime-value-producer

decision
  continue

next
  P40

reason
  firstResult 已由正确对象的实际 observation 支持

if verification uncertain AND sideEffect unknown
  decision = stop
~~~

首错信号：uncertain / unknown effect 仍继续，或直接重放可能已经发生的副作用动作。

### S6｜机器：`dossier.json`｜人工：`dossier.md`

~~~text
first Calculator input
→ actual firstResult read
→ save firstResult
→ clear Calculator UI but preserve taskData.firstResult
→ second input consumes firstResult
→ actual finalResult read
→ print + return finalResult
~~~

同时必须保留：initial/final state、actions、observations、runtime values、consumer、side effects、evidence refs、unresolved。

首错信号：只剩 finalResult=660，看不到 firstResult 从哪里来、被谁消费。

### S7｜机器：`distilled-steps.json`｜人工：`distilled-steps.md`

~~~text
D010 准备第一次计算
D020 输入第一次算式
D030 读取并保存 firstResult
D040 准备第二次计算并保留 firstResult
D050 使用 firstResult 输入第二次算式
D060 读取 finalResult → final output
~~~

首错信号：把 firstResult 读取当“重复动作”删掉，或把 `1,1,0` 去重成 `1,0`。

### S8｜机器：S8 固定版本 `procedure.json` 中的 Business Steps｜人工：`business-steps.md`

~~~text
ReadFirstResult
  output = firstResult
  source = 当前 Calculator 第一次结果区
  consumer = EnterSecondCalculation

PrepareSecondCalculation
  clear UI
  preserve firstResult

EnterSecondCalculation
  input = firstResult
  consume all characters in order

ReadFinalResult
  output = finalResult
  consumer = print + return
~~~

首错信号：S7 仍正确，但 S8 第一次把业务输入写成常量 `110`。

### S9｜机器：`procedure.json`｜人工：`procedure.md`

~~~text
runtimeValues.firstResult
  producer = ReadFirstResult
  consumer = EnterSecondCalculation
  allowed transform = character expansion
  reacquireOnFreshRun = true

runtimeValues.finalResult
  producer = ReadFinalResult
  consumer = final output

rule
  clear Calculator UI != delete firstResult
  no Expected fallback
~~~

首错信号：`firstResult.default = "110"`、把 firstResult 变成 caller parameter，或扩大未证明 scope。

### S10｜机器：hardened `app-profile.json` / helper / evidence｜人工：`operation-rules.md`

~~~text
button rule
  在当前 Calculator window 中唯一定位目标 button

read rule
  只读当前结果区
  禁止 Expected fallback

clear rule
  清空 UI
  不触碰 taskData.firstResult

wait / verify
  每个关键副作用后重新观察

stop
  identity ambiguity / read failure / unknown side effect
~~~

首错信号：API 文档存在被当成 Runtime 已通过，或 clear 的效果没有可观察验证。

### S11｜机器：`Recipe.js` + `candidate.json`｜人工：`candidate-summary.md`

~~~js
const firstResult = await readCalculatorResult(win);
await clearCalculator(win);
await pressKeys(win, ["6", "×", ...firstResult, "="]);
const finalResult = await readCalculatorResult(win);
console.log(finalResult);
return finalResult;
~~~

CandidateManifest / `candidate.json` 还必须固定源码 bytes/hash、entry、working directory、dependencies、API refs、upstream refs、source mapping、supported scope。

首错信号：

~~~js
const firstResult = "110";
~~~

或者虽然读了 firstResult，第二式仍固定输入 `110`。

### S12｜机器：`qualification.json` + Fresh Run evidence｜人工：`qualification-summary.md`

~~~text
candidate
  exact frozen S11 candidate/hash

scenario
  Fresh Run

Expected
  firstResult = "110"
  finalResult = "660"

Actual
  来自本次 S12 execution
  firstResult = actual Calculator read
  second input = consumes this run's firstResult
  finalResult = actual Calculator read

verdict
  pass / fail / not-run / blocked

evidence
  exact execution refs
~~~

首错信号：Candidate 已改字节仍沿用旧 Qualification，或某 requested scenario 没运行却写 PASS。

---

## 4. 出错以后怎么用这条产物链

不要先问“最后 660 对不对”。固定当前 task / attempt / Candidate 后，沿相邻边界检查：

~~~text
Source
→ S1 actual artifact
→ S2 actual artifact
→ S3 actual action
→ S4 actual observation
→ S5 actual decision
→ S6 dossier
→ S7 distilled
→ S8 business semantics
→ S9 procedure
→ S10 operation rules
→ S11 exact candidate
→ S12 actual qualification
~~~

找到第一处：

~~~text
input 仍正确
AND
本阶段 output 第一次错误
~~~

该处就是 first invalid boundary。然后按 [acceptance-map](../design/acceptance-map.md) 保留可信上游，只重做真正依赖错误输出的下游。

例如：

~~~text
S6 dossier 正确
S7 distilled-steps.json 错误删除 firstResult read
S8—S12 因依赖 S7 失效

=> failure owner = S7
=> 保留 S1—S6
=> 修 S7
=> 重验受影响 S8—S12
~~~

---

## 5. 为什么“95 分以上”仍然可能错

评分只在有**固定对象和真实证据**时有意义。

下面这种记录不得作为正式 PASS：

~~~text
score = 97
verdict = pass
artifact refs = missing
actual output = missing
required evidence = missing
~~~

正常阶段退出必须同时成立：

~~~text
actual input refs exist
AND
actual output / output refs exist
AND
required evidence exists
AND
stage acceptance is complete
AND
score >= 95
AND
Hard Fail = 0
AND
blocking Unknown = 0
AND
required tests passed
~~~

所以以后再出现“AI 连续十次说 95+，某次却突然坏掉”，第一检查对象不是分数，而是：

> **这一次的 S1—S12 实际文件、版本、证据和阶段检查点是否真的存在，并且是否与本次 execution / Candidate 绑定。**

---

## 6. 本文、测试 fixture 和真实运行三者不要混

仓库已有：

`tests/workflows/fixtures/calculator-artifact-chain/source.json`

它包含 contract、plan、actions、dossier、distilled、procedure、candidate、qualification 等合成结构，适合 checker / schema 测试。

但它明确是 synthetic / fixture-only：

- 不能冒充真实桌面运行；
- 不能交给隔离 Producer 当答案；
- 不能替代本次 task 的 actual artifacts。

因此职责分工应保持：

~~~text
cases/calculator-execution-walkthrough.md
  = 正确求解过程怎么走

cases/calculator.md
  = 每个阶段什么算正确

cases/calculator-artifacts.md
  = 每个阶段应该留下什么可检查文件，以及示例内容

tests/.../calculator-artifact-chain/source.json
  = checker / schema 的合成测试夹具

真实 .runtime task / attempt / Execution artifacts
  = 本次执行真正发生了什么
~~~

这四者互相引用，但不能互相冒充。

### 6.1 隔离评测使用边界

本文包含同源黄金案例的未来阶段答案，只供工作流维护、教学和 Candidate 冻结后的独立 Evaluator 使用。隔离 Producer 的 S1—S11 不得提前读取本文来补答案；本文中的示例也不是新的真实桌面证据。

### 6.2 正式规范来源

正式 schema、hash、request / handoff 和任务目录规则以 [Agent-to-Recipe Skill Contract](../../../docs/frameworks/agent-to-recipe-skill-contract.md) 为准；评分、Hard Fail 和 `acceptanceRef` 以 [validation-plan](../design/validation-plan.md) 为准。本文只提供 Calculator 的可读产物链，不创建第二套 schema 或判断规则。
