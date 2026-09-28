---
title: "计算器案例｜逐阶段检查 Agent-to-Recipe 是否正确"
description: "用同一个 Calculator 任务展示 S1—S12 的关键输入、参考输出、数据关系、典型错误和失败定位。"
order: 10
---

# 计算器案例｜逐阶段检查 Agent-to-Recipe 是否正确

这个案例只有一个目的：

> **用一个人可以直接理解的小任务，逐阶段检查 Agent-to-Recipe 有没有把原始任务正确地传到最终 Recipe；如果出错，找到最早“输入仍正确、输出已经错误”的环节。**

本文必须能够**独立读懂**。读者不需要先读历史版本、Qualification、SHA 或完整 Skill 规范，才能理解 Calculator 在每个关键阶段应该是什么样。

## 本轮真实重建｜2026-09-27

### 业务目标

在当前 macOS Calculator 窗口按按钮完成 `25 × 4 + 10 =`，从显示区取得 `firstResult`；清空当前计算状态后，按 `6 × firstResult =` 的实际数字逐键输入；再从显示区取得、打印并由函数返回 `finalResult`。不能由 JS 算术、键盘整式、历史读值或预写答案替代。本轮授权只覆盖目标应用的观察、激活、必要按钮与当前计算状态清空。

### 当前证据状态

本轮开始前先封存了工作区/阅读边界；真实局部示范在当前 Calculator 中得到原始 AX 首值 `"110"`、终值 `"660"`，并保留每步请求、原生回执、读值和实窗截图。普通 [新 JavaScript](../../../examples/agent-to-recipe/calculator-fresh-20260927.js) SHA-256 为 `6d1383249a9f12084cc877cea2883d8fa1c70c557216a8242ac7f542759f2d2a`。当前 S7 r003 → S9 r002 → S10 r003 → S11 r003 → S12 r003 的内容绑定交接均通过只读完整性检查；S12 r003 的两个新 execution `direct-20260927-025457-988000`、`direct-20260927-025553-861000` 各有 16 个原生按钮回执，首次实际读 `110`、最终实际读 `660`，各由另一个 execution 的 AX 读取与窗口 PNG 交叉核对。第一次读值失败的停止检查是**离线注入**，没有声称真机故障测试。

独立新上下文的 S7 核查从固定上游材料独立列出 16 个按钮、两次结果读取和一次实际打印；它的信封完整性 PASS，但完整 S7→S9 **交接 Gate FAIL**，因为给它的受限包没有固定的 S2–S6 动作关联选型记录与所选 API 合同/证据字节。主链 S9 另有明确固定这些材料的输入；不能因此把独立包失败改写成通过。通用方法由独立准备者从混杂文档裁剪，原版 Skill 的完整加载与未见新任务泛化未验证。主协调与早期示范上下文曾见旧案例的文档片段，不能称整轮完全答案盲；旧完整脚本和案例正文直到本轮结果封存后才阅读。以上本轮运行资料只在本地 `.runtime/agent-to-recipe/calculator-20260927-G6T44k/`，它不是版本控制资产；[封存清单](../../../.runtime/agent-to-recipe/calculator-20260927-G6T44k/prehistory-seal.json)、[阶段案例表](../../../.runtime/agent-to-recipe/calculator-20260927-G6T44k/case-review-final.md)记录原件及哈希。

### 关键输入输出

> 下表按本轮实际工件/交接做摘要分组，**不是正式阶段合并**。S3/S4/S5/S6 与 S8/S9 的独立判断责任见后文逐阶段案例卡。

| 现有阶段 | 本轮输入和来源 | 实际输出与下游消费 |
| --- | --- | --- |
| S1–S2 | 用户要求、动作前 `00-contract.md` 与本机 Calculator 的窗口/AX 观察 | TaskContract/WorkPlan、AppProfile；任务前显示 `115` 被清空，不作本轮值 |
| S3–S6 | 当前窗口真实按钮请求、回执和显示读取 | `firstResult` 原文 `"110"`；分段示范经机器提取传到第二段按钮 `6,×,1,1,0,=`；最终原文/打印 `"660"` |
| S7 | 固定 Dossier、Raw Trace 与原日志 | r003 DistilledSteps 保留 19 个实际片段，最终读值→打印顺序明确；三个数字消费者分别有来源 |
| S8–S10 | r003 步骤、TaskContract、AppProfile、固定的能力选型与 API 合同 | r002 Procedure 的 B3 值进入 B5，B6 读并输出；S10 r003 复用已证的六项窗口/AX 操作规则 |
| S11–S12 | 已确认过程/应用规则与安全 API 包，冻结源码/候选和预先登记的验收标准 | r003 普通 JS 每次自行新读并逐字符消费；两次全新运行与独立观察均为 `110 → 660`，函数返回由同次调用捕获打印 |

候选不包含 `110/660` 结果常量；这两个值只属于本次观察和独立验收 Oracle。`-script` 当前公开合同没有普通 JS 函数返回值的宿主序列化字段，所以已证的是 `main()` 从本次最终读值 `return finalResult`，顶层同次 `await main()` 捕获并打印相同字符串；**宿主独立返回字段未验证**。

### 本轮运行与验收入口

工作目录必须是仓库根。下面是一条会在本轮任务目录下创建唯一日志子目录的可复制命令；操作会清空当前 Calculator 计算状态并按本案例按钮执行：

```bash
./dist/opendesk -script examples/agent-to-recipe/calculator-fresh-20260927.js -console-mode script -log-dir "$(mktemp -d .runtime/agent-to-recipe/calculator-20260927-G6T44k/manual-XXXXXX)"
```

本轮正式资格的确切两条运行命令及各自观察命令见本地 [S12 r003 QualificationRecord](../../../.runtime/agent-to-recipe/calculator-20260927-G6T44k/attempts/s12-r003/qualification.json)，原始结果、截图及限制见 [独立审计](../../../.runtime/agent-to-recipe/calculator-20260927-G6T44k/attempts/s12-r003/independent-audit.json) 与 [视觉复核](../../../.runtime/agent-to-recipe/calculator-20260927-G6T44k/attempts/s12-r003/visual-review.md)。上面的一行命令已从仓库根目录原样执行，exit 0、16 个按钮回执、本次首值 `110`／终值 `660`；[附加验证记录](../../../.runtime/agent-to-recipe/calculator-20260927-G6T44k/posthistory-public-command.md)与 r003 两次同版资格分别保存，不倒填入历史对照前的试验。

### 失败定位

| 本轮实际发现 | 责任和定向处理 | 证据／未解决边界 |
| --- | --- | --- |
| 预写整段示范后才回填材料 | S3–S6 排除该尝试，分段重新真实示范；保留错误日志 | `demo-stdout.log` 与 `s3-s6-seal.md` |
| 清空后的截图附近失前台、续跑前窗口位移 | S2/S10 先只读确认显示/同一窗口，再按当前几何恢复前台；不重放已执行清空 | `stage2-stdout.log`、`stage2-failure-state-stdout.log`、`stage2-resume-check-stdout.log`；截图因果未单独证明 |
| S7 首版引用不全且旧 Dossier 字节丢失，r002 漏实际最终打印的逐片段决定 | S7 r003 只补第 19 个打印取舍；原 Dossier/Raw Trace 不改；S9–S12 按依赖重新绑定并重验 | `attempts/s7-r001/handoff.json`、`attempts/s7-r003/r002-r003-delta.json`；旧输入原字节不可复核 |
| S10 将完整 C5 写过宽；S11 handoff 未声明一个输入；S12 r001 把软链接当内容 ref 且方法引用缺字段 | 各自保留旧失败，S10 r002 缩窄为读值/打印，S11 r002 修输入绑定，S12 r002 绑定物理二进制；r003 再绑定新步骤来源 | 各版本 request/handoff 与 `attempts/s12-r001/integrity-failure.md`；checker PASS 只说明字节完整 |
| 独立 S7 包缺选型/所选合同字节 | 协调者须交付原 S2–S6 固定材料后再做完整独立交接，不由 S7 编造或口头补答案 | `attempts/independent-s7-r002/handoff.json` 仍为 Gate FAIL；本案例不宣称原版 Skill 泛化 |

### 历史说明（保留下面原有教学记录）

本节以上的新记录是在 [历史阅读前封存](../../../.runtime/agent-to-recipe/calculator-20260927-G6T44k/prehistory-seal.md)之后才与旧代码对照；[差异表](../../../.runtime/agent-to-recipe/calculator-20260927-G6T44k/posthistory-comparison.md)单列对照后的判断。旧脚本使用 `UI.tapTargets`、重复 `UI.readText`、最多两次 C→AC 清空及固定 Basic 尺寸；本轮用现场唯一 AX 按钮 `invoke` 和原生 Display 值，一次清空在当前测试起点经后续真实结果证明足够。这些差异按业务合同和现场证据判断，不要求结构相同。对照后没有改写普通 JS、原始示范或 S1–S12；下面的教学材料保留其原始性质与限制。

正式工作流仍以 [WORKFLOW.md](../WORKFLOW.md) 的 S1—S12 为准；本文只给 Calculator 的可读参考切片，不另建阶段、schema 或第二套规范。

> **样本边界**
>
> - 本文里的 A001—A010、D010—D060 沿用现有 Calculator synthetic fixture / Skill example，用来展示“数据应该怎样穿过各阶段”，**不是本轮真实桌面执行证据**。
> - 110 / 660 在任务里是 Expected；在 synthetic fixture 中也可作为合成 observedValue。它们不能被预填成未来真实运行的 actual value。
> - S11 展示的 JavaScript 片段来自当前仓库源码，只能证明当前源码怎样表达数据流，不能反推历史 Agent 当时实际做过什么。

---

## 1. 先固定唯一业务任务

~~~text
第一次计算：
1. 准备 Calculator。
2. 通过按钮输入：2、5、×、4、+、1、0、=。
3. 从本次结果显示区实际读取 firstResult。

第二次计算前：
4. 清空 Calculator 当前计算状态。
5. 但保留任务数据中已经保存的 firstResult。

第二次计算：
6. 点击 6、×。
7. 输入 firstResult 的全部字符。
8. 点击 =。

最终交付：
9. 从本次结果显示区实际读取 finalResult。
10. 打印并返回 finalResult。
~~~

本固定任务的独立验收期望是：

~~~text
Expected first result = "110"
Expected final result = "660"
~~~

但业务运行时必须保持：

~~~text
Expected "110"
    ≠
actual firstResult

Expected "660"
    ≠
actual finalResult
~~~

也就是说，正确的第二次输入必须来自：

~~~text
第一次显示区
    ↓ actual read
firstResult
    ↓ characters
第二次按钮输入
~~~

而不能来自：

~~~text
Expected 110
历史 110
JS 自己计算出的 110
测试代码注入的 110
~~~

---

## 2. 整个案例只检查这一条“黄金数据链”

~~~text
用户任务
  ↓
S1：明确“必须读取真实首值并继续使用”
  ↓
S2：认识正确 Calculator、按钮和结果区
  ↓
S3：执行当前获准动作并记录 actual action
  ↓
S4：重新观察并验证 actual effect
  ↓
S5：分类并决定 continue / revise / recover / stop
  ↺ continue 时进入下一次 S3
  ↓ task end
S6：冻结任务级 Dossier / Raw Trace / Evidence
  ↓
S7：D030 produces firstResult → D050 consumes firstResult
  ↓
S8：D030 / D050 → B025 / B040，形成 Business Steps
  ↓
S9：firstResult 被定义为 runtime value，固定 producer → transform → consumer
  ↓
S10：提供可靠 read / clear / target / wait 规则
  ↓
S11：const firstResult = await read...;
     ...firstResult...
  ↓
S12：对冻结的同一 Candidate 验证实际 producer → consumer 和最终结果
~~~

以后出现错误，不先问“最后为什么不是 660”，而是依次比较相邻交接：

> **哪一个阶段的输入仍然正确，而它的输出第一次破坏了这条关系？**

那就是当前最早已证实的错误位置。

---

## 3. S1｜把用户要求变成可检查的任务合同

### 本阶段收到什么

用户原始要求的核心内容：

~~~text
用计算器按钮完成 25 × 4 + 10 =
实际读取第一次结果。

第二次计算前清空计算器，
但保留已经读取的 firstResult。

再用按钮完成 6 × firstResult =
实际读取、打印并返回最终结果。
~~~

### 参考输出应该至少看得见什么

这是 TaskContract / WorkPlan 的**可读切片**，不是正式 JSON：

~~~text
Goal
  两次运算都通过 Calculator 按钮完成。

Fixed business input
  25, 4, 10, 6

Runtime values
  firstResult:
    source = 第一次结果显示区的本次实际读取
    consumer = 第二次计算
  finalResult:
    source = 第二次结果显示区的本次实际读取
    consumer = print / return

Expected
  firstResult = "110"
  finalResult = "660"

Required data rule
  第二次计算必须消费本次 firstResult，
  不能消费 Expected、历史值或重算值。

Required state rule
  第二次计算前准备 Calculator 新计算状态；
  该 UI 状态准备不能删除已经保存到任务数据中的 firstResult。

Stop
  首值没有真实读到、读值身份不明、结果格式不支持、
  或前一步副作用 unknown 时，不继续正常第二次输入。
~~~

### 怎样判断 S1 对不对

重点不是有没有 TaskContract 文件，而是核对原始任务有没有被改变。

**正确：**

~~~text
firstResult = runtime value from Calculator display
~~~

**错误：**

~~~text
firstResult = 25 × 4 + 10 = 110
~~~

后一种写法已经把“从 UI 实际读取”偷换成“自己知道答案”。

### 如果这里错了

返回 **S1**。下游即使完全按照错误合同执行，也不能证明原任务正确。

---

## 4. S2｜建立下一步真正需要的 Calculator 认识

### 本阶段收到什么

~~~text
S1 已固定的 TaskContract / WorkPlan
+ 当前获准观察
+ 可复用且仍有效的 AppProfile（如果有）
~~~

### 参考输出应该至少看得见什么

这是 AppProfile 的**可读切片**：

~~~text
Application
  Calculator

Current task surface
  当前获准的 Calculator 主窗口

Required input region
  Calculator 按钮区域

Required targets
  0, 1, 2, 4, 5, 6, +, ×, =, clear

Required result region
  当前运算结果显示区域

Required relations
  按钮属于当前 Calculator window
  result display 属于同一个 Calculator window

Known
  只填写本次观察真正支持的身份、区域、目标和关系

Unknown / not validated
  当前 Geometry 是否已映射到可操作坐标
  同名目标是否唯一
  当前 read 方法是否稳定
  当前 clear 的真实语义
  当前布局是否仍在支持范围
~~~

### 怎样判断 S2 对不对

S2 的关键问题是：

> **“下一步要操作/读取的对象，有没有真实来源支持？”**

**错误示例 1：凭空坐标**

~~~text
× button = (126, 220)
~~~

但没有任何当前观察、映射或旧规则适用性证据。

**错误示例 2：结果区定义过宽**

~~~text
result = 当前窗口里出现的任意数字
~~~

这不能证明读到的是当前计算结果。

**错误示例 3：从最终 JS 反推历史认识**

~~~text
calculator-current.js 里写了 232×321
→ 所以 S2 当时一定发现并确认过 232×321
~~~

源码不是历史 observation。

### 如果这里错了

对象认识、定位/读取前提的问题留在 **S2**；如果新事实推翻了任务路线或授权，再回 **S1**。

---

## 5. S3｜执行当前获准动作：记录 actual action

S3、S4、S5 是同一真实任务中的**微循环**，但不是同一个判断点：

~~~text
planned step
  ↓
S3 Execute：实际做了什么？
  ↓
S4 Observe / Verify：实际效果是什么？
  ↓
S5 Classify / Decide：继续、修订、恢复还是停止？
  ├─ continue → 下一 planned step，再进入 S3
  └─ task end → S6
~~~

同一个 task-demonstrate Skill 可以连续完成 S3—S6；这只表示职责由同一个方法包承担，不表示四个正式阶段可以合并判断。

### 本阶段收到什么

~~~text
current planned step
+ AppProfile / target 依据
+ 当前授权和副作用边界
+ 当前现场
+ expected transition（只作期望）
~~~

第一次结果读取的 planned 输入可以是：

~~~text
plannedStep = P30 / 读取 firstResult
target = 当前 Calculator result display
expectedCriterion = "110"
~~~

### Calculator 参考：S3 应留下什么

沿用现有 synthetic fixture，A005 是一个可读的 actual action 参考：

~~~text
actionRef = A005
plannedStep = P30
operation = read result display
actualTarget = Calculator result display
rawReturn = "110"        # fixture synthetic value
evidenceRef = 本次实际调用/返回记录
~~~

输入第一式时：

~~~text
actionRef = A004
plannedStep = P20
actualInput = [2,5,×,4,+,1,0,=]
receipt = 本次动作回执
~~~

S3 的核心输出是：

~~~text
plannedStepRef
actual actionRef
actual target
actual request / input
actual tool return / receipt
evidence refs
sideEffect = known / unknown
~~~

动作产生读值时要保存真实 origin；**该读值能不能被认定为正确业务事实，由 S4 继续判断。**

### 怎样判断 S3 对不对

**错误 1：计划冒充 actual**

~~~text
P30 计划读取
→ 直接写成 A005 已读到 110
~~~

没有真实调用就没有 actual action。

**错误 2：Expected 冒充 raw return**

Expected 和 actualReturn 即使同为 110，也必须来自不同来源。

**错误 3：目标身份不清仍执行**

不知道读的是主结果显示区还是历史区域时，不能为了形成 Trace 先执行再解释。

**错误 4：副作用 unknown 后重放**

点击超时但可能已发生时，不能再次点击来“补一个干净记录”。

### 错了回哪里

- action 没发生、记录被补造：**S3**。
- target / read 依据本身不可靠：**S2 / S10**。
- 授权或目标变化：**S1**。
- 动作已发生但效果未知：进入 **S4**，不是由 S3 宣布成功。

---

## 6. S4｜观察并验证实际效果：把 receipt 与业务结果分开

S4 回答：

> **S3 之后真实对象变成什么状态？它是否满足这个 planned step 的 Expected Outcome？**

### 本阶段收到什么

~~~text
S3 actual action
+ expected transition / criterion
+ 当前对象身份
+ observation / verifier
~~~

### Calculator 参考：A005 怎样成为可信 observation

现有 synthetic fixture 对 A005 保存了两次相同读取，可读参考是：

~~~text
sourceAction = A005
target = Calculator result display
read1 = "110"
read2 = "110"
sameTarget = true
stable = true

actualObservation = "110"
expectedCriterion = "110"
comparison = pass
verificationStatus = pass
~~~

这里必须保留两个来源：

~~~text
actualObservation = "110"   # 本次实际观察
expectedCriterion = "110"   # 任务期望
~~~

A004 的按钮 receipt 全部 acknowledged，也只能证明 receipt 覆盖的动作；没有结果区 observation，不能仅凭 receipt 宣称第一式业务结果成立。

### S4 的正确输出 / 状态

~~~text
sourceAction / plannedStep
observed object identity
actualObservation
Expected
comparison
status = pass / fail / uncertain
evidence refs / limitations
~~~

### 怎样判断 S4 对不对

**错误 1：receipt ok = 业务成功。**

**错误 2：没有观察到就写 false。** 缺观察只能保持 uncertain。

**错误 3：观察的是另一个窗口/数字区域。** 值恰好相同也不能通过。

**错误 4：Expected 反向生成 observation。**

### 错了回哪里

- observation / verification 判断错误：**S4**。
- 缺必要 observation：定向补 **S3→S4**，不重做整条示范。
- 对象或读取规则失效：**S2 / S10**。

---

## 7. S5｜分类并决定下一步：continue / revise / recover / stop

S5 不产生新的 UI 真相。它使用 S3/S4 已经成立的事实回答：

> **这一段属于什么性质？接下来是否安全继续？**

### 本阶段收到什么

~~~text
planned step
+ S3 actual action
+ S4 verification status
+ 当前副作用状态
+ WorkPlan / budget / authorization
~~~

### Calculator 参考 1：首值确认后继续

~~~text
source = A005 + S4 pass
classification = verification + runtime-value-producer

runtimeValue:
  name = firstResult
  origin = A005
  value = "110"          # fixture synthetic value
  freshRun = reacquire

decision = continue
nextPlannedStep = P40
~~~

### Calculator 参考 2：第二次 clear 不是重复噪音

~~~text
source = A007 / A008
classification = setup / state-preparation
effect = prepare second Calculator state
preserveTaskData = firstResult
decision = continue
nextPlannedStep = P50
~~~

A007/A008 所处状态已经不同于 A002/A003，不能仅因动作名称重复就判为 off-task。

### Calculator 参考 3：效果 unknown 时停止

~~~text
verificationStatus = uncertain
sideEffect = unknown
classification = unresolved
decision = stop
retry = false
~~~

### S5 的正确输出 / 状态

~~~text
classification
decision = continue / revise / recover / stop
nextPlannedStep
planDelta（如有）
recovery relation（如有）
sideEffect handling
reason / evidence refs
~~~

### 怎样判断 S5 对不对

**错误 1：把 setup 当噪音。**

**错误 2：S4 已 uncertain，仍继续依赖 firstResult。**

**错误 3：没有新事实就用 planDelta 覆盖过去 actual。**

### 错了回哪里

- 事实正确但 classification / decision 错：**S5**。
- S4 本身把 observation 判错：回 **S4**。
- actual action 本身就不成立：回 **S3**。

---

## 8. S6｜任务级证据收口：冻结 Dossier，而不是再做一次执行

S6 在任务结束时汇总多轮 S3—S5，回答：

> **这次真实任务最终是 complete、fail、partial 还是 inconclusive？哪些事实可以固定交给 S7？**

### 本阶段收到什么

~~~text
TaskContract / WorkPlan
+ 全部 S3 actual actions
+ 全部 S4 observations / verification
+ 全部 S5 classifications / planDelta / recovery
+ evidence / sideEffect state
~~~

### Calculator 参考 Dossier 摘要

~~~text
taskStatus = complete-success / fail / partial / inconclusive

firstResult:
  producer = A005
  observedValue = "110"        # fixture synthetic value
  consumer = A009
  transform = characters
  freshRun = reacquire

secondPreparation:
  actions = A007, A008
  changes = Calculator UI state
  preserves = firstResult

finalResult:
  producer = A010
  observedValue = "660"        # fixture synthetic value
  consumer = final output

unresolved = [...]
sideEffects = [...]
evidenceIndex = [...]
~~~

S6 真正需要冻结的是：

~~~text
A005 → firstResult → A009
A010 → final output
~~~

以及它们的证据、范围和未决项。

### 怎样判断 S6 对不对

**错误 1：只有 final=660，就写 complete success。**

**错误 2：把 partial / uncertain 升级为 complete。**

**错误 3：Dossier 补写 S3/S4 从未发生的历史。**

**错误 4：把人工开发 / 参考执行改写成 Agent demonstration。**

### 错了回哪里

- 原始事实齐全，但 Dossier 汇总、范围、taskStatus 错：**S6**。
- actual action 缺失：**S3**。
- observation / verification 缺失：**S4**。
- continue / stop / recovery 决策错：**S5**。

S6 不提前做 S7 的 retain / omit。

---

## 9. S7｜把“原始执行记录”整理成真正必要的步骤

S7 的工作可以先用一句话理解：

> **前面已经真实执行了一遍任务。S7 现在要把那一长串真实操作整理成一条“完成任务真正需要的步骤”，但不能把重要数据、顺序或状态关系整理丢。**

这里先把几个正式名称翻成中文。后文以中文为主，英文名称只用于和正式工件对照：

| 正式名称 | 本文中的中文理解 |
| --- | --- |
| Raw Trace | 原始执行记录：真实发生过的点击、读取、观察、恢复等 |
| Evidence | 证据：证明这些动作和结果确实发生过的记录 |
| Demonstration Dossier | 示范事实包：S6 对整次真实示范的汇总 |
| DistilledSteps | 提炼后的必要步骤：S7 最终交给下一阶段的结果 |

S7 **不重新执行 Calculator**，也不重新决定业务目标。它只根据已经存在的真实记录判断：

1. 哪些操作必须保留；
2. 哪些只是探索或绕路，可以去掉；
3. 哪些连续小动作可以合并成一个更容易理解的步骤；
4. 合并时哪些数据、顺序和状态关系绝对不能改变。

### S7 收到什么

用中文理解，就是：

~~~text
原始任务要求
+ S6 已经整理好的示范事实包
+ 真实执行时留下的原始操作记录
+ 对这些操作和结果的证据
+ 必要的 Calculator 应用认识
~~~

### Calculator 原始记录里最关键的几件事

为了便于追溯，原始记录仍保留 A005、A007 这样的编号；**编号只是索引，不是理解内容的前提。**

| 实际发生的事情 | 原始记录编号 | 为什么重要 |
| --- | --- | --- |
| 第一次计算完成后，从结果显示区真实读取到第一次计算结果 | A005 | 这是 firstResult 的真实来源 |
| 保存一张辅助截图 | A006 | 可以辅助核对，但不能代替真实读取 |
| 第二次计算前再次清空 Calculator | A007 | 建立第二次计算需要的新界面状态 |
| 清空后再次读取结果区，确认界面处于干净状态 | A008 | 证明第二次计算的起点 |
| 输入 6 × firstResult =；在这个示例中实际输入 6,×,1,1,0,= | A009 | 证明第二次计算真的使用了第一次读取的完整结果 |
| 第二次计算完成后，从结果显示区真实读取最终结果 | A010 | 这是 finalResult 的真实来源 |

最重要的业务关系其实非常简单：

~~~text
第一次计算完成
  ↓
真实读取第一次计算结果
  ↓
保存为 firstResult
  ↓
第二次计算前清空 Calculator 界面
  ↓
firstResult 仍然保存在任务数据中
  ↓
把 firstResult 的每一个字符重新输入第二次计算
  ↓
真实读取最终结果
~~~

### S7 整理后应该得到什么

S7 可以把很多细小操作整理成下面六个必要步骤。

> D010、D020……只是正式步骤编号。读者先看中文步骤名称即可。

| 中文必要步骤 | 正式编号 | 来自哪些真实记录 | 这一步必须保留什么 |
| --- | --- | --- | --- |
| 准备第一次计算 | D010 | A001、A002、A003 | 确认正确窗口；清空；确认起始状态 |
| 输入第一次算式 | D020 | A004 | 2,5,×,4,+,1,0,= 的顺序和次数不能改变 |
| **读取并保存第一次计算结果** | **D030** | **A005、A006** | **真实读取结果，并把它保存为 firstResult** |
| 准备第二次计算 | D040 | A007、A008 | 清空 Calculator 当前界面，但**不能删除已经保存的 firstResult** |
| **使用第一次计算结果输入第二次算式** | **D050** | **A009** | 第二次输入必须来自 firstResult 的全部字符 |
| 读取最终结果 | D060 | A010 | 真实读取 finalResult，供最终输出使用 |

所以 S7 最关键的一条关系可以直接用中文写成：

~~~text
“读取并保存第一次计算结果”
        ↓
得到 firstResult
        ↓
“使用第一次计算结果输入第二次算式”
~~~

如果这一条关系还在，说明最重要的数据链没有被整理丢。

---

### 怎样判断 S7 是否正确

#### 错误 1：误删“读取并保存第一次计算结果”这一步

错误版本可能变成：

~~~text
输入第一次算式
  ↓
准备第二次计算
  ↓
使用 firstResult 输入第二次算式
~~~

问题非常直接：

> 后面要求使用 firstResult，但前面已经没有任何步骤真正读取并保存 firstResult。

因此这不是“少写了一步”这么简单，而是**第一次结果的数据来源被删除了**。

正式编号上，这相当于误删 D030；但判断错误时不需要记住 D030 这个编号。

---

#### 错误 2：把 110 里的两个 1 当成重复动作删掉一个

真实第二次输入是：

~~~text
6 × 1 1 0 =
~~~

错误整理成：

~~~text
6 × 1 0 =
~~~

这不是“去掉重复操作”，而是把业务数据 110 改成了 10。

所以 S7 在整理重复动作时必须区分：

~~~text
可以删除的重复噪音
≠
业务数据本身包含的重复字符
~~~

两个连续的 1 都属于 firstResult，一个都不能少。

---

#### 错误 3：因为第一次已经清空过，就删掉“第二次计算前清空”这一步

第一次清空发生在：

~~~text
第一次算式输入之前
~~~

第二次清空发生在：

~~~text
第一次算式已经算完之后
第二次算式输入之前
~~~

两次所处的 Calculator 状态完全不同。

因此不能因为动作名称都叫“清空”，就把第二次清空当成重复动作删除。

同时要特别注意：

~~~text
清空 Calculator 界面
≠
清空任务中已经保存的 firstResult
~~~

第二次清空只改变 Calculator 当前界面状态，不能把已经读取保存的 firstResult 一起丢掉。

---

#### 错误 4：把多个按键动作合并成一个步骤时，顺便改变了真实输入方式

S7 可以把：

~~~text
点击 6
点击 ×
点击 1
点击 1
点击 0
点击 =
~~~

整理成一句：

~~~text
输入第二次算式：6 × firstResult =
~~~

这是允许的，因为只是把多个细小动作**概括成一个更容易理解的业务步骤**。

但不能因为做了概括，就把真实执行偷偷改成：

~~~text
直接粘贴 "110"
~~~

或者：

~~~text
只输入 1 和 0
~~~

S7 的“合并”只改变**文档表达粒度**，不能改变真实业务动作、数据顺序或次数。

---

### S7 正确完成后，下一阶段到底拿到什么

下一阶段不应该只拿到一句：

~~~text
任务完成，结果是 660
~~~

而应该至少知道：

~~~text
步骤 1：准备第一次计算
步骤 2：输入第一次算式
步骤 3：真实读取并保存 firstResult
步骤 4：准备第二次计算，同时保留 firstResult
步骤 5：使用 firstResult 的全部字符输入第二次算式
步骤 6：真实读取 finalResult

关键数据关系：
  第一次结果显示区
    → firstResult
    → 第二次计算输入

最终结果：
  finalResult
    → 最终输出
~~~

这样下一阶段才能继续判断这些必要步骤在业务上分别意味着什么。

### 如果 S7 出错，应该返回哪里

先区分两种情况：

**情况 A：真实记录本来是完整的，只是 S7 整理错了。**

例如：

- 真实记录里有第一次结果读取，但 S7 把它删了；
- 真实记录里有 1,1,0，但 S7 整理成 1,0；
- 第二次清空真实发生了，但 S7 把它当重复动作删掉。

这时只修 **S7**，然后重新检查受影响的后续阶段。

**情况 B：S7 想保留某个关键事实，但上游真实记录里根本没有。**

例如真实执行记录中从来没有：

~~~text
从结果显示区读取 firstResult
~~~

那就不是 S7 可以自己补出来的。

应该返回前面的真实示范阶段，补足缺失的执行或观察事实。

---

## 10. S8｜DistilledSteps → Business Steps：解释业务语义

S8 只回答：

> **这些必要步骤在业务上分别意味着什么？输入、输出、前后条件和消费者是谁？**

S8 还不负责把一次案例泛化成参数化规格。

### 本阶段收到什么

~~~text
fixed DistilledSteps
+ TaskContract / WorkPlan
+ 必要 AppProfile
+ source refs / evidence refs
~~~

关键输入，用中文理解就是：

~~~text
“读取并保存第一次计算结果”（D030）
  → 得到 firstResult

“准备第二次计算”（D040）
  → 清空 Calculator 当前界面
  → 但保留 firstResult

“使用第一次计算结果输入第二次算式”（D050）
  → 使用 firstResult
~~~

### Calculator 参考 Business Steps

~~~text
B010 PrepareFirstCalculation
  source = D010

B020 EnterFirstExpression
  source = D020
  input = [2,5,×,4,+,1,0,=]

B025 ReadFirstResult
  source = D030
  output = firstResult
  origin = Calculator result display
  consumer = B040

B030 PrepareSecondCalculation
  source = D040
  preserve = firstResult

B040 EnterSecondCalculation
  source = D050
  input = firstResult
  demonstratedTransform = characters

B050 ReadFinalResult
  source = D060
  output = finalResult
  consumers = print, return
~~~

### 怎样判断 S8 对不对

正确关系：

~~~text
D030 → B025 → firstResult
D050 → B040 consumes firstResult
~~~

**错误 1：S8 已经把“使用本次 firstResult”改成“固定使用 110”。**  
例如正式记录里 B040 的输入已经从 firstResult 变成固定 110。这时错误发生在业务解释层，不需要等 S9。

**错误 2：只有 B025 producer，没有 B040 consumer。**

**错误 3：按按钮次数/函数长度拆 Business Step，而不是按业务目的。**

### 错了回哪里

- Business Step 目的、边界、输入输出、消费者解释错：**S8**。
- DistilledSteps 自身取舍已经错：回 **S7**。

---

## 11. S9｜Business Steps → SemanticProcedure：定义复用规格

S9 回答：

> **哪些值是 caller input，哪些是 runtime value？数据怎样流动？允许哪些变化？支持范围到哪里？**

### 本阶段收到什么

~~~text
Business Steps from S8
+ TaskContract
+ 补充证据
+ 必要 AppProfile
+ capability / API 选择事实
~~~

S8 已固定：

~~~text
B025 produces firstResult
B040 consumes firstResult
~~~

### Calculator 参考 SemanticProcedure

~~~text
runtimeValues.firstResult:
  producer = B025
  origin = Calculator result display
  consumers = [B040]
  transform = characters
  freshRun = reacquire

runtimeValues.finalResult:
  producer = B050
  consumers = [print, return]

dataDependencies:
  B025
    → firstResult
    → characters
    → B040

fixed / caller inputs:
  25, 4, 10, 6 是否允许参数化
  由 TaskContract 与 supported scope 决定

supportedScope:
  只写已有证据支持的变化

pendingEngineering:
  交 S10 的 locator / read / wait / clear 等缺口
~~~

### 怎样判断 S9 对不对

**错误 1：**

~~~text
parameters.firstResult.default = "110"
~~~

如果 S8 仍然写的是 B025→firstResult→B040，那么：

~~~text
最后正确产物 = Business Steps
最早错误产物 = SemanticProcedure
责任 = S9
~~~

**错误 2：一次示范自动泛化为任意表达式 / 任意布局。**

**错误 3：API 文档存在就写 runtimeValidation=pass。**

### 错了回哪里

- 参数分类、runtime value、dataDependencies、分支、scope、capability decision 错：**S9**。
- Business Step 本身已把 firstResult 解释错：回 **S8**。
- action 取舍错：回 **S7**。

---

## 12. S10｜把 Procedure 需要的应用操作补成可靠规则

S10 不重新决定“第二式是否应该使用 firstResult”。

这个业务关系已经在 S8—S9 固定。

S10 只回答：

> 怎样可靠找到、点击、清空、等待和读取 Calculator？

### 参考规则切片

~~~text
LOC-01 / target
  必须限定当前任务 Calculator window
  必须限定正确父区域
  target 必须唯一且可用

  0 candidate  -> stop
  >1 candidate -> stop / disambiguate
~~~

~~~text
READ-01 / result
  source = 当前 Calculator result display
  return = actual raw display text

  要求：
    当前对象一致
    读取稳定
    格式在支持范围

  禁止：
    expected fallback
    history fallback
    JS arithmetic fallback
~~~

~~~text
PREP-01 / clear
  purpose = 准备下一段 Calculator UI state

  要求：
    只作用于获准 Calculator state
    保存动作回执
    用实际 post-observation 检查干净状态

  注意：
    PREP-01 不删除任务变量 firstResult
~~~

~~~text
WAIT-01
  使用可观察 ready condition
  有明确 timeout / retry budget
  超时后 action effect unknown 时停止核对

  禁止：
    sleep 固定时间后直接假定成功
    未知效果时换 backend 再点一次
~~~

### 怎样判断 S10 对不对

**错误 1：**

~~~text
READ-01 失败时返回 "110"
~~~

这直接污染 runtime provenance。

**错误 2：**

~~~text
点击超时
→ 改用另一个 backend 再点击
~~~

如果第一次动作可能已经发生，第二次点击可能制造重复副作用。

**错误 3：**

无证据把整个窗口均分为按钮矩阵，并把推算坐标当 confirmed target。

### 如果这里错了

定位、读取、clear、wait、stability 等应用规则问题留在 **S10**。

如果工程验证发现原先能力选择或业务假设需要变化，要把有来源的新事实返回 **S8—S9** 更新 Procedure，再生成一致候选。

---

## 13. S11｜Procedure 到 JavaScript 必须保持同一条数据链

### 本阶段收到什么

~~~text
固定 SemanticProcedure
+ 已确认 AppProfile / helper / operation rules
+ 当前正式 API contract
+ 支持范围和入口
~~~

### 当前源码中的关键正确映射

当前 [calculator-current.js](../../../examples/agent-to-recipe/calculator-current.js) 的关键业务数据流是：

~~~js
const firstClear = await clearCalculator(win);
const firstInput = await clickCalculatorButtons(
  win,
  ['2','5','×','4','+','1','0','='],
);
const firstResult = await readCalculatorResult(win);

const secondClear = await clearCalculator(win);
const secondInput = await clickCalculatorButtons(
  win,
  ['6','×', ...firstResult, '='],
);
const finalResult = await readCalculatorResult(win);

return {
  firstResult,
  finalResult,
  firstInput,
  secondInput,
  firstClear,
  secondClear,
};
~~~

这个片段对应：

~~~text
B025
  ↓
readCalculatorResult
  ↓
firstResult
  ↓
...firstResult
  ↓
B040 second input

B050
  ↓
readCalculatorResult
  ↓
finalResult
  ↓
return
~~~

这里只能说明**当前源码字节表达了这条关系**，不能证明历史示范或本轮真实执行已经发生。

### 最典型的 S11 错误

~~~js
const firstResult = await readCalculatorResult(win);

await clickCalculatorButtons(
  win,
  ['6','×','1','1','0','='],
);
~~~

这段代码“读了 firstResult”，但消费者没有使用它。

所以不能因为源码里出现字符串 firstResult 就判数据流正确。

另一个错误：

~~~js
const finalResult = "660";
return finalResult;
~~~

即使输出数字正确，也没有实现 B050 的实际读取。

### 如果这里错了

如果 Procedure 明确要求 runtime firstResult，但 JS 写死 110，责任在 **S11**。

修复后 Candidate 字节改变，必须冻结新 Candidate；旧 Qualification 不能自动转给新字节。

### S11 内的可选 code-rebuild

code-rebuild 只是 S11 内的按需质量改进职责，不是 S13。

没有明确收益时允许：

~~~text
baseline-retained
~~~

有依据修改时：

~~~text
candidate-revised
→ 新 hash
→ 新受影响范围
→ 新资格
~~~

不能为了评分强制增加 Calculator 类、adapter 或额外抽象。

---

## 14. S12｜到底怎样证明“这份 Recipe 正确”

S12 不能只看“最后是不是 660”。

它必须固定验收对象，并证明这份 Candidate 真正保持了前面的业务关系。

### 运行前要固定什么

~~~text
Candidate
  exact script bytes / hash
  entry
  dependencies

TaskContract
  exact version

Requested scope
  运行前确定

Scenarios
  运行前确定

Environment / build
  明确

Oracle
  独立 Expected
  不能向 Candidate 注入 firstResult
~~~

### 一次 Calculator Fresh Run 至少应该能核对

~~~text
clean start
  actual Calculator state 可归因

first expression
  实际按钮动作属于同一 Candidate execution

first observation
  actual result display read
  → firstResult

second preparation
  Calculator UI state 被准备
  firstResult 仍存在于运行数据

second input
  实际输入来自本次 firstResult 的 characters
  例如本次读到 "110" 时：
  ["6","×","1","1","0","="]

final observation
  actual result display read
  → finalResult

final delivery
  print / return 使用 actual finalResult

candidate binding
  实际运行字节与冻结 Candidate 一致
~~~

### 不同资格声明不能混在一起

| 声明 | 至少需要什么 |
| --- | --- |
| 一次 Fresh Run 成功 | 同一冻结 Candidate 的一次干净、可归因实际运行与独立结果证据 |
| 可重复运行 | 同一冻结 Candidate 至少两次彼此独立 Fresh Run |
| 参数化可复用 | 除基线外，至少一个合同允许的不同合法输入，通过同一 Candidate / inputContract |
| 其他布局/平台稳定 | 对应 requested scope 的真实扰动/平台场景；不能从单一环境外推 |

### 怎样判断 S12 对不对

**错误 1：验错 Candidate**

~~~text
frozen hash = A
actual executed hash = B
~~~

不能 PASS。

**错误 2：最终 660 正确，但第二式写死 110**

如果合同要求第二式消费本次 firstResult，则该 criterion 应失败。

**错误 3：requested 有 baseline + variation，只跑 baseline**

variation 必须保持 not-run / blocked / fail 的真实状态，不能移到 excluded 后宣布整个 request PASS。

**错误 4：改代码后再跑一次，宣称“同版重复运行两次”**

Candidate 已变化，不是同一个对象的 repeatability evidence。

### 如果这里错了

验收对象、Oracle、scenario、scope 或证据设置错误：在 **S12** 修验收。

如果 S12 发现的是上游真实缺陷，则返回**最早有证据的责任阶段**，修复后重新冻结 Candidate 并重验受影响范围。

---

## 15. 一次完整错误定位示例

假设最后看到这样的错误代码：

~~~js
const firstResult = await readCalculatorResult(win);
await clickCalculatorButtons(
  win,
  ['6','×','1','1','0','='],
);
~~~

不能直接说“S11 写错了，所以根因就是 S11”。要沿相邻阶段向上比较。

### 第一步：先看 S8 的 Business Steps

如果 S8 已经写成：

~~~text
B025:
  output = firstResult

B040:
  input = 110
~~~

说明 runtime firstResult 在**业务语义层**就被替换成常量。

继续比较 S7：

~~~text
D030 produces firstResult
D050 consumes firstResult
~~~

如果 S7 仍然正确，则可以定位：

~~~text
最后正确产物 = DistilledSteps
最早错误产物 = Business Steps
最早错误阶段 = S8
~~~

### 第二步：如果 S8 正确，再看 S9

如果 Business Steps 仍然是：

~~~text
B025 produces firstResult
B040 consumes firstResult
~~~

但 S9 的 SemanticProcedure 变成：

~~~text
parameters.firstResult.default = "110"
~~~

则可以定位：

~~~text
最后正确产物 = Business Steps
最早错误产物 = SemanticProcedure
最早错误阶段 = S9
~~~

### 第三步：如果 S8、S9 都正确，再看 S11

如果 SemanticProcedure 明确要求：

~~~text
B025 → runtime firstResult → characters → B040
~~~

而 exact JS 却仍输入：

~~~js
['6','×','1','1','0','=']
~~~

则最早错误才是：

~~~text
最后正确产物 = SemanticProcedure / operation rules
最早错误产物 = Candidate JS
最早错误阶段 = S11
~~~

### 第四步：只有上游也可疑时才继续回查

如果 S8 错了，要继续比较 S7；如果 S7 也已经把 D050 写成常量 110，则继续比较 Dossier / Raw Trace。

同理，S3—S6 内部也按正式阶段比较：

~~~text
没有 actual read action         → S3
有 action，但 observation 判错  → S4
observation 对，但继续/停止错    → S5
前三者对，但 Dossier 收口错      → S6
~~~

因此一次 S8 错误的最小修复范围可以是：

~~~text
需要修复 / 重验
  S8
  S9
  S10（只核受影响规则）
  S11
  S12

不因这个错误自动重做
  S1
  S2
  S3
  S4
  S5
  S6
  S7
~~~

这就是本案例最重要的诊断方法：

> **不要从最后结果猜根因；比较相邻阶段，找到第一份“输入仍正确、输出第一次变错”的产物。**

---

## 16. 常见错误 → 最早应检查哪里

| 看到的问题 | 先比较什么 | 最可能的责任（需证据确认） |
| --- | --- | --- |
| 合同没有“实际首值继续参与第二式” | 用户原始要求 vs TaskContract | S1 |
| 按钮/结果区凭空猜出来 | S1 需求 vs AppProfile 观察来源 | S2 |
| planned step 有读取，但没有 actual read action | Plan vs Raw Trace action | **S3** |
| 有 read action，但 receipt / Expected 被当作可信 observation | S3 action vs S4 verification | **S4** |
| S4 已 uncertain，却仍继续；或 setup 被误分成 off-task | S4 result vs S5 decision | **S5** |
| S3—S5 完整，但 Dossier 漏 producer/consumer 或错误升级 complete | Trace/Evidence vs Dossier | **S6** |
| 实际读过，但 DistilledSteps 删除读取 | Raw Trace vs DistilledSteps | S7 |
| 1,1,0 被去重 | A009 actual input vs D050 | S7 |
| 第二段准备被机械删掉 | A007/A008 vs D040 | S7 |
| S7 仍要求“读取 firstResult 后继续使用”，但 S8 已改成固定 110 | 必要步骤 vs 业务步骤 | **S8** |
| Business Steps 正确，SemanticProcedure 才把 firstResult 变 default 110 | Business Steps vs SemanticProcedure | **S9** |
| read 失败 fallback 到 110 | Procedure vs operation rule | S10 |
| Procedure 正确，代码仍写死 110 | Procedure vs JS | S11 |
| 代码正确但运行的是另一 hash | CandidateManifest vs execution | S12 |
| 只跑一个场景却声明全部 requested 通过 | requested scope vs scenarios/evidence | S12 |
| 点击效果 unknown 后继续重放 | S3 action + S4 uncertain vs S5 decision；若规则本身错误再查 S10 | **S5 / S10，按最早证据判断** |

如果证据还不足以区分两个阶段，就写：

~~~text
root cause not established
next comparison = ...
~~~

不要为了“必须归责”而猜一个阶段。

---

## 17. 实际执行时建议保存的最小检查摘要

正式 schema 仍由共享合同和各 Skill 维护；为了人工排错，可以从正式产物生成下面这张可读摘要：

~~~text
当前阶段：
本阶段实际输入及版本：
本阶段输出及版本：

本阶段必须保持的关键关系：
  ...

实际观察到的输出：
  ...

与参考案例相比：
  correct / incorrect / insufficient evidence

最后一个已确认正确的上游产物：
最早已确认错误的交接：
证据不足时下一步要比较什么：

副作用：
  known / unknown

最小修复责任：
受影响的下游：
无需重做的上游：
~~~

这张摘要是**诊断视图**，不是新 schema，也不能替代正式 handoff / QualificationRecord。

---

## 18. 想继续核对时，去哪里看

只读本文应该已经能够理解和检查 Calculator 的主链。需要更深证据时，再进入正式 owner：

| 想检查什么 | 权威/详细位置 |
| --- | --- |
| 正式 S1—S12 与阶段责任 | [WORKFLOW.md](../WORKFLOW.md) |
| 工作流任务树 | [task-decomposition.md](../design/task-decomposition.md) |
| S2 / S10 Calculator 应用工程示例 | [application-engineer example](../skills/application-engineer/examples/calculator.md) |
| S3 execute / S4 verify / S5 decide / S6 close 的方法示例 | [task-demonstrate example](../skills/task-demonstrate/examples/calculator.md) |
| A001—A010 → D010—D060 的完整 fixture 解释 | [trace-distill example](../skills/trace-distill/examples/calculator.md) |
| D → Business Step / runtime value | [procedure-synthesize example](../skills/procedure-synthesize/examples/calculator.md) |
| Procedure → JS 正反实现 | [recipe-build example](../skills/recipe-build/examples/calculator.md) |
| Fresh Run / repeatability / parameterization 边界 | [recipe-qualify example](../skills/recipe-qualify/examples/calculator.md) |
| 当前固定业务 JS | [calculator-current.js](../../../examples/agent-to-recipe/calculator-current.js) |
| 历史 r009 声明与版本限制 | [examples README](../../../examples/agent-to-recipe/README.md) |
| r003 历史资格/问题 | [r003 质量记录](../../../docs/quality/agent-to-recipe-calculator-r003.md) |
| 后续 Skill closure / r009 相关历史说明 | [skill closure](../../../docs/quality/agent-to-recipe/skill-closure-20260922.md) |
| 本案例文档的分项审阅 | [calculator document review](../../../docs/quality/agent-to-recipe/calculator-document-review-20260927.md) |

历史运行证据如果只存在 .runtime/，它就是可清理的本地证据，不伪装成 fresh checkout 一定存在的仓库文档。缺失原始运行包时，正确结论是“当前无法独立复核相应历史声明”，而不是从当前 JS 或质量报告倒造 PASS。

---

## 19. 这个案例通过什么标准才算“有用”

不是“文档看起来完整”，而是一个新读者可以拿实际任务产物做下面的事：

1. 看出 Expected 110 和 actual firstResult 不是一回事。
2. 找到 firstResult 的实际 producer。
3. 找到 firstResult 的实际 consumer。
4. 看出第二次 clear 改 UI state、但不应删除任务变量。
5. 在 task-demonstrate 内区分：S3 是否真的执行、S4 是否真的验证、S5 是否做出正确继续/停止决定、S6 是否正确收口。
6. 比较 Raw Trace → DistilledSteps 有没有误删/误合并。
7. 区分 S8 Business Steps 与 S9 SemanticProcedure，判断错误发生在业务解释还是复用规格。
8. 比较 SemanticProcedure → JS 有没有真正消费运行时返回值。
9. 比较 Candidate → S12 execution 是否验了同一份字节和完整 requested scope。
10. 出错时能指出“最后正确产物”和“最早错误交接”，而不是从 S1 全部重做。

如果这些事情做不到，Calculator 案例就还没有完成它最重要的职责。
