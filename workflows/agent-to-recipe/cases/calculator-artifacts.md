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

## 0. 先分清三个东西

### 阶段产物链（Stage Artifact Chain）

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

### 阶段检查点（Stage Checkpoint）

每个 S 阶段退出前，都必须能找到该阶段的：

~~~text
actual inputs
actual output / output refs
required evidence
score / Hard Fail / Unknown
verdict
failure owner / next action
~~~

当前验证设计已经要求 S1—S12 独立记录，并由 `acceptanceRef` 绑定 `stages[S1…S12]`。因此不需要为了可检查性再发明 S13，也不需要把 12 份评分写成 12 套新 schema。

### Calculator 黄金产物包（Golden Artifact Pack）

本文给出的内容属于**参考答案视图**：告诉维护者“正确形状大概是什么”。真实运行仍必须在自己的 task / attempt / Execution 目录中产生新文件和新证据，不能复制这里的 Actual。

---

## 1. 一次真实运行的文件应该从哪里找

共享合同已经给出任务目录模型：

~~~text
.runtime/automation-authoring/<task-id>/
  user-task.md

  plan/r001/
    task-contract.json
    work-plan.json
    task-brief.md          # 可选可读视图
    operation-plan.md      # 可选可读视图

  progress.json

  attempts/<attempt-id>/
    request.json
    <本职责主产物>
    handoff.json
~~~

真实桌面运行的截图、日志、业务输出和其他 evidence 优先位于对应 `Execution.artifactDir`，任务目录保存固定引用。

因此排查错误时，不应该只看聊天里的“95 分”“PASS”或最终 JavaScript；应先固定本次 `task-id / attempt-id / candidate hash`，再沿文件引用检查。

---

## 2. S1—S12：应该打开哪个文件

| 阶段 | 首先查看的正式成果 / 证据 | 常见文件名或位置 | 人工主要检查什么 |
| --- | --- | --- | --- |
| **S1** | TaskContract + WorkPlan | `plan/rNNN/task-contract.json`、`work-plan.json` | 原需求有没有被偷换；Expected 是否和 runtime value 分开 |
| **S2** | 最小 AppProfile + 发现证据 | attempt 内 `app-profile.json` + `handoff.json` | 当前 Calculator、window、结果区、按钮依据是否真实 |
| **S3** | actual action / request / receipt / side-effect state | `Execution.artifactDir` + 当前阶段 acceptance record | 动作是否真的发生、打到谁、返回什么；不能只看计划 |
| **S4** | actual observation + Expected/Actual comparison | `Execution.artifactDir` + 当前阶段 acceptance record | 是否重新观察正确业务对象；Actual 是否由 Expected 倒填 |
| **S5** | continue / revise / recover / stop 决策 | acceptance record + `handoff.json` 的 planDelta / failures | uncertain 是否被错误地当成 continue；重试是否可能重复副作用 |
| **S6** | Demonstration Dossier + Raw Trace/Evidence refs | `dossier.json` | 整次示范是否保留 firstResult 的 producer → consumer 数据链 |
| **S7** | DistilledSteps | `distilled-steps.json`，可选 `distilled-steps.md` | 必要读取、清空、重复数字和数据依赖是否被错误删除/合并 |
| **S8** | Business Steps | 当前 S8 attempt 的 `procedure.json` / 同版可读视图 | 每步业务目的、输入、输出、来源和消费者是否完整 |
| **S9** | SemanticProcedure | 当前 S9 attempt 的 `procedure.json` | firstResult 是否仍是 runtime value；参数、scope、dataDependencies 是否有来源 |
| **S10** | hardened AppProfile / helper / operation rules | 新版本 `app-profile.json` + helper / validation evidence | 定位、读取、clear、wait、verifier 是否可靠且不改业务语义 |
| **S11** | frozen Recipe + CandidateManifest | 实际 `Recipe.js`（或候选脚本）+ `candidate.json` | 代码是否真实消费 firstResult；源码/入口/依赖/hash 是否冻结 |
| **S12** | QualificationRecord + fresh execution evidence | `qualification.json` + S12 Execution artifacts | 是否对同一 Candidate 做真实 Fresh Run；未运行项是否被误写 PASS |

> **关键点：**S3、S4、S5 没有必要为了“一个阶段一个 JSON”再造三种业务主产物。它们的真实动作、观察、决策进入 Execution / Dossier 事实链，同时必须有独立的阶段 acceptance record。这样既能定位首错，又不会制造平行真相。

---

## 3. Calculator 各阶段的最小示例内容

下面只展示人应当一眼看见的关键内容。完整字段仍看正式 schema 和对应 Skill 输出规格。

### S1｜`task-contract.json` / `work-plan.json`

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

### S2｜`app-profile.json`

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

### S3｜actual action

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

### S4｜actual observation

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

### S5｜decision

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

### S6｜`dossier.json`

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

### S7｜`distilled-steps.json`

~~~text
D010 准备第一次计算
D020 输入第一次算式
D030 读取并保存 firstResult
D040 准备第二次计算并保留 firstResult
D050 使用 firstResult 输入第二次算式
D060 读取 finalResult → final output
~~~

首错信号：把 firstResult 读取当“重复动作”删掉，或把 `1,1,0` 去重成 `1,0`。

### S8｜Business Steps

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

### S9｜`procedure.json`

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

### S10｜hardened `app-profile.json` / operation rules

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

### S11｜`Recipe.js` + `candidate.json`

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

### S12｜`qualification.json`

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
