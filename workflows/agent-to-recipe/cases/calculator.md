---
title: "计算器案例｜逐阶段检查 Agent-to-Recipe 是否正确"
description: "用同一个 Calculator 任务展示 S1—S12 的关键输入、参考输出、数据关系、典型错误和失败定位。"
order: 10
---

# 计算器案例｜逐阶段检查 Agent-to-Recipe 是否正确

这个案例只有一个目的：

> **用一个人可以直接理解的小任务，逐阶段检查 Agent-to-Recipe 有没有把原始任务正确地传到最终 Recipe；如果出错，找到最早“输入仍正确、输出已经错误”的环节。**

本文必须能够**独立读懂**。读者不需要先读历史版本、Qualification、SHA 或完整 Skill 规范，才能理解 Calculator 在每个关键阶段应该是什么样。

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
S3—S6：真实动作产生 observation
  ↓
A005 actual read → firstResult
  ↓
A009 actual consumer 使用 firstResult 全部字符
  ↓
S7：D030 produces firstResult → D050 consumes firstResult
  ↓
S8—S9：B025 produces firstResult → characters → B040 consumes
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

## 5. S3—S6｜真实执行到底产生了哪些事实

这是整个案例最重要的检查点之一。

S1 说“应该读取 firstResult”，并不证明真的读过。S3—S6 必须形成真实动作、观察、运行时值和消费者。

### planned 只表示准备做什么

例如：

~~~text
P10 准备第一段状态
P20 输入第一式
P30 读取 firstResult
P40 准备第二段状态
P50 用 firstResult 输入第二式
P60 读取并交付 finalResult
~~~

这六行只是计划，不是 actual。

### Calculator synthetic fixture 的参考事实

下面 A001—A010 来自现有冻结 synthetic fixture，用于说明**正式真实记录需要表达什么关系**：

| action | actual / observation 的参考内容 | 为什么重要 |
| --- | --- | --- |
| A001 | 记录当前 Calculator 窗口范围 | 确认这条路径对应哪个任务对象 |
| A002 | 第一段执行 AC 清空并保存动作回执 | 建立第一段输入状态 |
| A003 | 实际读取 clean，原值 0 | 检查第一段起点，而不是只信 clear 回执 |
| A004 | 顺序输入 2,5,×,4,+,1,0,= | 第一式真实输入 |
| **A005** | 从结果区实际 read；fixture 合成读值 110 | **firstResult 的 producer** |
| A006 | first-result 辅助截图标记，fixture=true | 辅助证据；不能替代 A005 actual read |
| A007 | 第二段执行 AC 清空并保存动作回执 | 建立第二段新起点；不是 A002 的重复副本 |
| A008 | 实际读取 second-clean，原值 0 | 检查第二段准备后的 UI 状态 |
| **A009** | 顺序输入 6,×,1,1,0,= | **消费 A005 的完整 firstResult** |
| **A010** | 从结果区实际 read；fixture 合成读值 660 | **finalResult 的 producer** |

最关键的数据记录应该能表达：

~~~text
value = firstResult
producer = A005 / Calculator result display
observedValue = "110"            # 这里只是 fixture 合成值
consumer = A009 / second expression
actualTransform = characters
actualInput = ["1","1","0"]
freshRun = must reacquire
~~~

以及：

~~~text
value = finalResult
producer = A010 / Calculator result display
consumer = final output
freshRun = must reacquire
~~~

### 第二次清空时，到底保留什么

~~~text
A007/A008 改变的是 Calculator UI state
firstResult 保存在任务运行数据中
~~~

所以：

~~~text
Calculator display → 0
~~~

不等于：

~~~text
firstResult → deleted
~~~

### 怎样判断 S3—S6 对不对

**错误 1：Expected 冒充 observation**

~~~text
Expected first result = 110
→ firstResult = 110
~~~

没有 A005 真实读取时，必须保持缺证/unknown。

**错误 2：receipt 冒充 observation**

~~~text
按钮调用全部 ok
→ firstResult 已确认
~~~

动作回执只能证明其覆盖范围内的动作结果，不能代替结果区 read。

**错误 3：只写“使用 firstResult”**

如果没有实际 consumer 和 transform：

~~~text
consumer = ?
actualInput = ?
~~~

下游无法知道本次到底是逐字符、粘贴、identity 还是写死常量。

**错误 4：从最终 JS 倒填历史**

当前源码有 clear/read/click，不等于当次示范事实已经包含这些 action 和 observation。

### 如果这里错了

真实动作/观察本来就缺失：返回 **S3—S6** 定向补采。

已有真实材料只是没有交给本次 worker：先由**协调者补交固定材料**，不要把“材料没交到”误判为“历史事实不存在”。

---

## 6. S7｜把 Raw Trace 提炼成必要步骤，但不能破坏事实

S7 不负责重新决定业务目标，也不负责设计最终代码。

它要回答：

> 原始动作中，哪些是完成这个任务真正必要的？它们之间的数据和状态关系是什么？

### 本阶段收到什么

~~~text
TaskContract / WorkPlan
Demonstration Dossier
Raw Trace / Evidence
必要 AppProfile
~~~

### 参考输出：DistilledSteps

沿用现有 Calculator fixture：

| DistilledStep | sourceActionRefs | 必须保留的内容 |
| --- | --- | --- |
| D010 准备第一段 | A001,A002,A003 | 窗口范围；clear；实际读取 0 |
| D020 输入第一式 | A004 | 2,5,×,4,+,1,0,= 的顺序和次数 |
| **D030 读取首值** | **A005,A006** | **输出 firstResult；实际 read 是 producer** |
| D040 准备第二段 | A007,A008 | 改变 UI state；**保留 firstResult** |
| **D050 使用首值** | **A009** | **消费 D030 的 firstResult；本值字符 1,1,0 不变** |
| D060 读取终值 | A010 | 输出 finalResult → final output |

核心关系：

~~~text
A005
  ↓
D030.outputs[firstResult]
  ↓
D050.inputs[firstResult]
  ↓
A009 actual characters
~~~

### 怎样判断 S7 对不对

**错误 1：删掉 D030**

结果：

~~~text
D050 consumes firstResult
但没有 producer
~~~

立即判错。

**错误 2：把 1,1,0 去重成 1,0**

这是改变业务数据，不是“去噪”。

**错误 3：删掉第二次 clear**

理由只是：

~~~text
前面已经 clear 过一次
~~~

不成立。A002/A003 和 A007/A008 处在不同状态和时间点；第一式执行后 Calculator state 已经变化。

**错误 4：把 merge 理解为减少真实输入**

文档上可以把多个按钮归到一个“输入 firstResult”步骤，但不能因此把两个 1 合成一个，也不能偷偷改成文本粘贴。

### 如果这里错了

原始事实完整、只是 retain/merge/omit 判断错误：只修 **S7**，然后重验受影响的 S8—S12。

如果原始事实本来就不完整，再回 **S3—S6**。

---

## 7. S8—S9｜把必要步骤变成业务过程和运行时数据关系

这一阶段非常容易发生“看起来合理、其实已经把任务改掉”的错误。

### 本阶段收到什么

关键 S7 输入已经是：

~~~text
D030:
  read actual first result
  produces firstResult

D040:
  prepare second calculation
  preserves firstResult

D050:
  consume firstResult
~~~

### 参考输出：Business Steps

~~~text
B010 PrepareFirstCalculation

B020 EnterFirstExpression
  input = [2,5,×,4,+,1,0,=]

B025 ReadFirstResult
  source = D030
  output = firstResult
  valueKind = runtime value
  origin = current Calculator result display

B030 PrepareSecondCalculation
  source = D040
  effect = prepare Calculator UI state
  preserve = firstResult

B040 EnterSecondCalculation
  source = D050
  input = firstResult
  transform = characters
  demonstrated example:
    "110" -> ["1","1","0"]

B050 ReadFinalResult
  source = D060
  output = finalResult
  consumers = print, return
~~~

### SemanticProcedure 中最关键的数据关系

~~~text
runtimeValues.firstResult.producer = B025
runtimeValues.firstResult.consumers = [B040]

dataDependencies:
  B025
    → firstResult
    → characters
    → B040
~~~

固定任务里的 25,4,10,6 是否以后参数化，要由合同和支持范围决定。

但无论是否参数化，firstResult 都不能变成 caller parameter，因为它是本次运行中由 B025 产生的值。

### 怎样判断 S8—S9 对不对

**错误：**

~~~text
parameters.firstResult.default = "110"
~~~

S7 明明交付的是：

~~~text
D030 produces runtime firstResult
D050 consumes runtime firstResult
~~~

到了 Procedure 却变成常量/default。

这时已经可以确定：

~~~text
最后正确产物 = DistilledSteps
最早错误产物 = SemanticProcedure
责任 = S8—S9
~~~

不需要等 S11 写完代码才发现。

另一个错误：

~~~text
B025 produces firstResult
~~~

但没有记录 B040 consumer。

这样 S11 仍然不知道真实数据流。

### 如果这里错了

业务语义、运行时值、consumer、transform 或支持范围解释错误：修 **S8—S9**。

如果发现原动作取舍就已经错了，再回 **S7**；不要在 S9 维护第二套 action truth。

---

## 8. S10｜把 Procedure 需要的应用操作补成可靠规则

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

## 9. S11｜Procedure 到 JavaScript 必须保持同一条数据链

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

## 10. S12｜到底怎样证明“这份 Recipe 正确”

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

## 11. 一次完整错误定位示例

假设最后看到这样的代码：

~~~js
const firstResult = await readCalculatorResult(win);
await clickCalculatorButtons(
  win,
  ['6','×','1','1','0','='],
);
~~~

不要直接说“S11 负责一切”，而是向上比较。

### 第一步：看 S8—S9

如果 Procedure 已经写成：

~~~text
B040
  input = 110
~~~

那么 S11 只是实现了一个已经错误的 Procedure。

继续向上。

### 第二步：看 S7

如果 DistilledSteps 是：

~~~text
D030 produces firstResult
D050 consumes firstResult
~~~

则 S7 仍然正确。

因此可以定位：

~~~text
最后一个已确认正确的产物
  DistilledSteps

最早已确认错误的产物
  SemanticProcedure

最早错误交接
  S7 → S8—S9

责任
  S8—S9

需要重做/重验
  S8—S9
  S10（只核受影响规则）
  S11
  S12

不需要因为这个错误自动重做
  S1
  S2
  S3—S6
  S7
~~~

反过来，如果 S7 自己已经写成：

~~~text
D050 input = 110
~~~

而 Raw Trace 明明记录了 A005 → A009 的 runtime consumer，则最早错误已经提前到 **S7**。

这就是本案例最重要的诊断方法：

> **不要从最后结果猜根因；比较阶段边界，找到第一份破坏正确关系的输出。**

---

## 12. 常见错误 → 最早应检查哪里

| 看到的问题 | 先比较什么 | 最可能的责任（需证据确认） |
| --- | --- | --- |
| 合同没有“实际首值继续参与第二式” | 用户原始要求 vs TaskContract | S1 |
| 按钮/结果区凭空猜出来 | S1 需求 vs AppProfile 观察来源 | S2 |
| 根本没有 firstResult actual read | Plan vs Raw Trace / Dossier | S3—S6 |
| 实际读过，但 DistilledSteps 删除读取 | Raw Trace vs DistilledSteps | S7 |
| 1,1,0 被去重 | A009 actual input vs D050 | S7 |
| 第二段准备被机械删掉 | A007/A008 vs D040 | S7 |
| runtime firstResult 变成 default 110 | D030/D050 vs Procedure | S8—S9 |
| read 失败 fallback 到 110 | Procedure vs operation rule | S10 |
| Procedure 正确，代码仍写死 110 | Procedure vs JS | S11 |
| 代码正确但运行的是另一 hash | CandidateManifest vs execution | S12 |
| 只跑一个场景却声明全部 requested 通过 | requested scope vs scenarios/evidence | S12 |
| 点击效果 unknown 后继续重放 | 本次 action/observation vs recovery decision | S3—S6 / S10，按根因判断 |

如果证据还不足以区分两个阶段，就写：

~~~text
root cause not established
next comparison = ...
~~~

不要为了“必须归责”而猜一个阶段。

---

## 13. 实际执行时建议保存的最小检查摘要

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

## 14. 想继续核对时，去哪里看

只读本文应该已经能够理解和检查 Calculator 的主链。需要更深证据时，再进入正式 owner：

| 想检查什么 | 权威/详细位置 |
| --- | --- |
| 正式 S1—S12 与阶段责任 | [WORKFLOW.md](../WORKFLOW.md) |
| 工作流任务树 | [task-decomposition.md](../design/task-decomposition.md) |
| S2 / S10 Calculator 应用工程示例 | [application-engineer example](../skills/application-engineer/examples/calculator.md) |
| S3—S6 planned / actual / observation 示例 | [task-demonstrate example](../skills/task-demonstrate/examples/calculator.md) |
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

## 15. 这个案例通过什么标准才算“有用”

不是“文档看起来完整”，而是一个新读者可以拿实际任务产物做下面的事：

1. 看出 Expected 110 和 actual firstResult 不是一回事。
2. 找到 firstResult 的实际 producer。
3. 找到 firstResult 的实际 consumer。
4. 看出第二次 clear 改 UI state、但不应删除任务变量。
5. 比较 Raw Trace → DistilledSteps 有没有误删/误合并。
6. 比较 DistilledSteps → Procedure 有没有把 runtime value 改成常量。
7. 比较 Procedure → JS 有没有真正消费运行时返回值。
8. 比较 Candidate → S12 execution 是否验了同一份字节和完整 requested scope。
9. 出错时能指出“最后正确产物”和“最早错误交接”，而不是从 S1 全部重做。

如果这些事情做不到，Calculator 案例就还没有完成它最重要的职责。
