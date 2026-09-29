---
title: "Calculator 阶段产物链｜每一步应该留下哪些可检查文件"
description: "把 S1—S12 的正式产物、真实运行文件、阶段检查点和 Calculator 示例内容连接起来，便于人工逐阶段定位首错。"
order: 11
---

# Calculator 阶段产物链｜每一步应该留下哪些可检查文件

> **定位：Calculator 的阶段产物链参考（Stage Artifact Chain Reference）。**

> **隔离评测边界：**本文包含同源黄金案例的未来阶段答案，只供工作流维护、教学和 Candidate 冻结后的独立 Evaluator 使用。隔离 Producer 的 S1—S11 不得提前读取本文来补答案。本文中的示例也不是新的真实桌面证据。

本文专门解决一个实际问题：

> **当某次 Agent-to-Recipe 执行在中途或最终出错时，人应该打开哪个文件，看到哪个阶段的 Actual Output，再判断第一处错误发生在哪里？**

[Calculator 执行过程演练](calculator-execution-walkthrough.md) 说明“Agent 实际怎样做”；[Calculator 基准案例](calculator.md) 说明“S1—S12 什么算正确”；本文补上第三个视角：

> **每一步做完以后，应该留下什么可检查文件或固定引用。**

正式 schema、hash、request / handoff 和任务目录规则仍以 [Agent-to-Recipe Skill Contract](../../../docs/frameworks/agent-to-recipe-skill-contract.md) 为准；评分、Hard Fail 和 `acceptanceRef` 仍以 [validation-plan](../design/validation-plan.md) 为准。本文不创建第二套 schema。

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
