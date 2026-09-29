---
title: "Calculator 执行过程演练｜Agent 实际怎样从需求走到可验证程序"
description: "用“当前问题 → 需要查看或调用什么 → 实际执行 → 得到什么事实 → 下一步”展示 Agent 怎样真实解决 Calculator，并继续推进 S1—S12。"
order: 9
---

# Calculator 执行过程演练｜Agent 实际怎样解决这个任务

> **定位：求解过程演练。**

> **本文含完整参考路线和未来阶段答案。** 教学及方法维护可以使用；本轮或后续隔离 Producer 评测的 S1—S11 不得读取。新 Producer 从 [WORKFLOW](../WORKFLOW.md) 与当前阶段 Skill 出发；冻结 Candidate 后独立 Evaluator 才能使用本文与参考 JavaScript 校准。阅读演练不算一次真实阶段执行，也不能据此填写阶段 PASS。

本文回答的不是“每个 S 阶段怎样验收”，而是：

> **如果一个没有历史聊天上下文的新 Agent 收到 Calculator 需求，它实际应该先看什么、调用什么、执行什么、取得什么事实，再根据结果怎样继续。**

逐阶段检查、首错定位和最小返工范围仍看 [Calculator 基准案例](calculator.md)。正式阶段定义仍由 [task-decomposition.md](../design/task-decomposition.md) 负责。

本文展示的是**外部可以检查的实际求解过程**，不是隐藏推理过程，也不是 S3—S6 保存的原始执行记录。统一使用下面五个外显问题：

> **编号说明：**本文的 `## 1`—`## 9` 是为了讲清楚实际求解顺序的**叙事步骤编号**，不是另一套 Workflow 阶段。标题中的 `[S1]`、`[S2]`、`[S3 → S4 → S5]` 等才表示它映射到哪个正式阶段；`0`、`10`、`11` 是导览或说明，不新增阶段。

~~~text
当前要解决什么问题
  ↓
需要查看或调用什么
  ↓
实际执行什么
  ↓
执行后得到了什么
  ↓
下一步为什么这样走
~~~

文中的 API 选择是本案例在当前公开能力下的参考路线，不建立“某个高层 API 永远优先”的全局规则。文档存在、方法被选中、当前 Runtime 实际可用、业务动作成功，是四件不同的事。

---

## 0. 一眼看懂整条求解主线

~~~text
收到 Calculator 需求
  ↓
[S1] 先把用户真正要求什么说清楚
     特别确认第一次结果必须真实读取，
     第二次必须真正使用这次读取到的结果
  ↓
[S2] 搞清楚怎样可靠操作当前 Calculator
     先看 OpenDesk 已有什么现成能力
     再选择合适方法
     再到当前 Calculator 现场验证这些方法是否真的可用
  ↓
[S3 → S4 → S5] 真正执行第一式
                 → 读取第一次真实结果
                 → 判断是否可以继续
  ↓
[S3 → S4 → S5] 清空 Calculator 当前界面
                 → 但保留第一次真实结果
                 → 用这个真实结果执行第二式
                 → 读取最终结果
                 → 判断本次真实执行是否完成
  ↓
[S6] 把“这次实际上发生了什么”完整固定下来
  ↓
[S7] 从真实记录中提炼真正必要的步骤
  ↓
[S8] 说明每一步在业务上是什么意思
  ↓
[S9] 把一次具体执行变成以后可以重复使用的规则
  ↓
[S10] 把需要的应用操作方法工程化并确认可靠范围
  ↓
[S11] 生成并固定最终 JavaScript 候选程序
  ↓
[S12] 从干净状态重新运行同一份程序并独立验收
~~~

这里最重要的是：**每一步执行以后都必须得到一个明确的新结果，下一步只能消费已经成立的结果。** 如果某一步没有做对，就回到真正出错的位置修，而不是为了“完整”从 S1 全部重跑。

---

## 1. 先固定不能被实现偷换的要求 [S1]

### 当前问题

用户究竟要求什么？哪些条件即使“最后算出 660”也不能被省略？

### 查看 / 调用什么

先读取原始需求和当前任务合同，不需要先研究 Calculator API。可对照 [Calculator 基准案例的原始需求](calculator.md#0-原始需求与验收边界)。

### 实际执行什么

形成最小任务合同和近期计划：

~~~text
第一次计算：
  通过 Calculator 按钮输入 25 × 4 + 10 =

第一次结果：
  必须从 Calculator 当前结果显示区真实读取 firstResult

第二次计算前：
  清空 Calculator 当前 UI 状态
  但任务数据中的 firstResult 必须保留

第二次计算：
  通过 Calculator 按钮输入 6 × firstResult =
  firstResult 必须来自本次第一式实际读取的全部字符

最后：
  真实读取 finalResult
  print + return
~~~

Expected 110 / 660 只进入验收 Oracle，不进入 runtime producer。

### 得到什么事实

此时已经知道业务数据关系：

~~~text
Calculator display
  → actual firstResult
  → task data
  → second Calculator input
  → actual finalResult
~~~

但仍然不知道：

- 当前哪个 Calculator window 是目标；
- OpenDesk 已经提供哪些窗口 / UI 能力；
- 结果显示区怎样可靠读取；
- clear 在当前 Calculator 中怎样安全执行。

### 下一步为什么这样走

这些 Unknown 会阻塞真实动作，因此进入 S2。**下一步不是写坐标，也不是直接写 Accessibility traversal；先发现已有执行能力。**

---

## 2. 不知道怎样操作时，先发现 OpenDesk 已有能力 [S2]

### 当前问题

OpenDesk 已经有什么公开能力可以完成：

1. 找到并限定 Calculator window；
2. 点击 Calculator 按钮；
3. 读取真实结果；
4. 在目标歧义、读取失败或副作用不确定时安全停止？

### 查看 / 调用什么

从 [Agent API 阅读入口](../../../docs/api/agent/README.md) 开始，只按当前业务步骤展开。

窗口问题进入：

- [应用、窗口与几何](../../../docs/api/agent/targets.md)

UI 目标、点击与取值进入：

- [桌面目标与取值](../../../docs/api/agent/elements.md)

如果当前问题已经从“OpenDesk 有什么能力”变成“Calculator 这个应用怎样建立 Window / State / Region / Locator 认识”，按需参考：

- [App Development Framework](../../../docs/frameworks/app-development-framework.md)

完整的能力发现、方法选择、契约读取与运行验证边界见：

- [Capability Discovery](../design/capability-discovery.md)

### 实际执行什么

先形成**候选能力集合**，而不是马上实现：

~~~text
Window candidates
  window.get
  window.activate
  window.current

Button-action candidates
  UI.tapText
  UI.tapTexts
  UI.tapTargets
  lower-level Accessibility.*

Result-read candidates
  UI.readText
  native value / lower-level Accessibility.*

Application inspection candidates
  Accessibility.snapshot
  other current documented observation methods
~~~

这一阶段只回答“有什么可考虑”，不把候选存在写成当前环境已经通过。

### 得到什么事实

对于 Calculator 当前需求：

- 连续按钮输入确实存在高层 UI 候选，不必默认从 Mouse / Coordinate 或手写 AX traversal 开始；
- UI.tapTexts 适合纯文本序列，但是否足以表达本任务的目标身份和歧义约束仍需比较；
- UI.tapTargets 能表达扁平语义目标，例如 role + name，并可限定在当前 window；
- UI.readText 是读取当前窗口文本结果的高层候选；
- Accessibility.* 仍是合法的较低层能力，但只有在需要额外结构检查、身份约束或高层能力无法完整满足任务时才有理由下沉。

### 下一步为什么这样走

Capability Discovery 只给出了候选。下一步必须做 **Method Selection + Contract Reading**，不能因为 API 名字看起来合适就执行副作用动作。

---

## 3. 比较候选，再读取选中方法的准确契约 [S2]

### 当前问题

对于“Calculator button + exact window + actual display read”，哪条方法最能保留当前业务约束？

### 查看 / 调用什么

读取候选方法的 canonical Reference，而不是只看 elements.md 的摘要。当前相关事实以：

- [Desktop UI API](../../../docs/api/desktop-ui.md)
- [Window API](../../../docs/api/window.md)
- 必要时 [Accessibility API](../../../docs/api/accessibility.md)

为准。

需要精确调用契约时，按 [Agent API 阅读入口](../../../docs/api/agent/README.md) 规定的方法读取 selected method 的正文与必要公共约束。

### 实际执行什么

对候选做有界比较。

#### 按钮输入

任务需要：

~~~text
目标属于当前 Calculator window
+ 目标是 button
+ name 与当前 token 一致
+ 歧义时失败
+ 每次副作用次数可控
~~~

因此当前生产参考实现可以选择：

~~~text
UI.tapTargets([{ role: "button", name }, ...], { within: win })
~~~

而不是仅因为 UI.tapTexts 更短就机械采用它。

#### 结果读取

任务需要：

~~~text
从当前 Calculator window 读取实际显示值
+ 不返回 Expected
+ 读取失败必须停止
+ 必要时重复只读核对稳定性
~~~

因此 UI.readText({ within: win }) 是当前高层候选。

#### 应用结构预检

如果还需要证明：

- 所有本阶段按钮在当前窗口中唯一；
- button 真实 enabled；
- 具有可执行 native action；
- 结果区存在且类型可读；

则可以保留有明确目的的 Accessibility.snapshot 等结构化只读检查。它是**额外工程约束**，不是因为高层 UI API 不存在而默认重写一套点击器。

### 得到什么事实

此时可以形成一份临时选择：

~~~text
window identity
  → window.get / activate / current

button action
  → UI.tapTargets

result read
  → UI.readText

structural preflight when required
  → Accessibility.snapshot
~~~

但状态仍应是：

~~~text
selected / to validate
~~~

不是：

~~~text
runtime passed
~~~

### 下一步为什么这样走

方法选择和文档契约都不能证明当前 Calculator / 当前 Runtime / 当前权限下真实成立。下一步要把能力选择带回现场验证，并建立最小 AppProfile。

---

## 4. 建立最小应用认识，并验证所选能力能否在当前现场成立 [S2]

### 当前问题

当前 Calculator 到底是哪一个 window？按钮、clear、结果区在当前状态中是否唯一、可读、可操作？

### 查看 / 调用什么

使用 S2 获准的当前观察能力，并按需参考 [App Development Framework](../../../docs/frameworks/app-development-framework.md) 的最小应用认识：

~~~text
Application
→ Window
→ Page / State
→ Region
→ Target
~~~

不要为了一个 Calculator 任务先建模整个应用。

### 实际执行什么

至少确认：

- com.apple.calculator 对应的当前 Calculator window；
- window identity、foreground / focus 和本案例声明的支持布局；
- 本任务需要的数字、×、+、=、clear 目标；
- 当前结果显示区；
- 目标唯一性和关键读取能力；
- 当前选择的 UI / Accessibility 方法在真实环境中的 pass / fail / partial / not-run。

如果只取得截图但没有 screen mapping，就只能形成有限认识，不能直接把图中像素位置升级成点击坐标。

### 得到什么事实

形成足够推进近期动作的最小 AppProfile，以及：

~~~text
Capability Discovery
≠ Method Selection
≠ Contract Reading
≠ Runtime Validation
~~~

四类分离的记录。

### 下一步为什么这样走

只有对象身份、方法契约和当前环境验证都足够，才允许进入有副作用的 S3。否则留在 S2 定向补缺口。

---

## 5. 真实执行第一式，并取得本次 firstResult [S3 → S4 → S5]

这一段开始以后，计划、Expected、API 文档都不能再冒充 actual。

### 当前问题

怎样证明 25 × 4 + 10 = 确实通过当前 Calculator 按钮执行，而且 firstResult 来自本次 Calculator display？

### 查看 / 调用什么

消费 S2 已确认的：

- Calculator window；
- button action rule；
- result read rule；
- clear / ready rule；
- 当前授权、停止和副作用边界。

### 实际执行什么

参考微循环：

~~~text
准备 Calculator 初始状态
  ↓
执行第一式按钮序列
  [2, 5, ×, 4, +, 1, 0, =]
  ↓
保存 actual action receipts
  ↓
重新读取当前 Calculator display
  ↓
保存 actual firstResult
  ↓
将 Actual 与 Expected 分开比较
~~~

如果某次按钮动作处于 unknown / partial，停止依赖动作并先对账，不能换 backend 后把同一个按钮再点一次来“保证执行”。

### 得到什么事实

正确结果不是“我们知道答案应该是 110”，而是类似：

~~~text
firstResult
  origin = 本次 Calculator display read
  raw/value = 本次实际返回
  expected = "110" 仅用于比较
  status = pass / fail / uncertain
~~~

参考案例中的成功路径实际值是 "110"，但新的生产运行必须重新读取，不能预填该值。

### 下一步为什么这样走

只有 firstResult 已由 S4 对正确对象验证，并由 S5 决定可以继续，才允许进入依赖它的第二次计算。

---

## 6. 清空 UI，但保留 firstResult；让第二式真正消费它 [S3 → S4 → S5]

### 当前问题

怎样同时满足：

~~~text
Calculator UI 被清空
~~~

和：

~~~text
任务数据 firstResult 仍然存在
~~~

并证明第二次输入使用的是**本次** firstResult？

### 查看 / 调用什么

继续使用已验证的 clear / button / read 操作规则。此时不重新把 Expected "110" 引入 runtime。

### 实际执行什么

~~~text
taskData.firstResult = 本次真实读取值
  ↓
clear Calculator UI
  ↓
验证 Calculator 已进入允许的干净状态
  ↓
保留 taskData.firstResult
  ↓
构造第二次按钮序列

["6", "×", ...firstResult, "="]

  ↓
通过 Calculator 按钮真实执行
  ↓
读取 finalResult
~~~

...firstResult 表达的是把本次实际字符串逐字符展开。例如本次真实值恰好是 "110" 时，实际消费者得到 ["1", "1", "0"]；不是在源码中预写这三个字符。

### 得到什么事实

成功路径应能证明：

~~~text
producer
  Calculator first display read

runtime value
  firstResult

consumer
  second Calculator button input

transform
  character expansion

final producer
  Calculator final display read
~~~

### 下一步为什么这样走

到这里才完成“这次任务实际上发生了什么”的核心业务执行。接下来不是直接把这次操作记录当成可复用 Recipe，而是先在 S6 冻结事实，再进入 S7—S9 提炼。

---

## 7. 从真实执行中得到可复用方法 [S6 → S9]

前面已经真实完成过一次 Calculator。这里开始不再操作 Calculator，而是把那次真实经历逐层变成以后可以复用的方法。

### S6：先固定“这次实际上发生了什么”

**收到什么**

- 前面真实点击过什么；
- 实际读取到了什么；
- 第一次结果怎样被第二次计算使用；
- 最终结果和证据；
- 哪些动作成功、失败或仍无法确认。

**实际做什么**

把这些事实固定成一份完整的示范事实包。这里不能把预期答案补成实际结果，也不能把没有发生的动作写成已经发生。

**得到什么**

一份可以独立回答“这次真实任务到底发生了什么”的事实材料。

**下一步**

事实完整，进入 S7；事实缺失，就回 S3—S5 定向补采。

---

### S7：从真实记录中提炼真正必要的步骤

这一段完整展示 [WORKFLOW](../WORKFLOW.md) 中的七步执行方法怎样真正落到一个阶段。

**1. 现在做到哪里？**

~~~text
当前阶段：S7
~~~

**2. 这一阶段要解决什么？**

不是重新操作 Calculator，也不是写 JavaScript，而是回答：

> 刚才真实发生的那些动作里，哪些是完成任务真正必要的？

**3. 开始需要什么材料？**

至少需要：

- 已固定的真实执行事实；
- 原始动作和观察记录；
- 第一次结果的真实来源；
- 第二次计算实际怎样使用第一次结果；
- 必要证据。

如果这些材料本身不存在，S7 不能靠推理补出来，应返回 S3—S6。

**4. 实际怎样做？**

使用 `trace-distill` 方法逐项判断：

~~~text
这个动作必须保留？
可以和相邻动作合并？
只是探索，可以省略？
属于失败后的恢复动作？
还是证据不足，暂时不能判断？
~~~

对于 Calculator，尤其检查：

~~~text
第一次计算
→ 读取 firstResult
→ 清空 Calculator 界面
→ 任务数据里的 firstResult 仍保留
→ 第二次输入真正使用 firstResult 的全部字符
→ 读取 finalResult
~~~

不能因为参考成功值恰好是 110，就把“读取 firstResult”删掉并直接留下固定的 110。

**5. 执行以后得到什么？**

得到“真正必要步骤”，例如：

~~~text
1. 输入第一次计算
2. 从 Calculator 真实读取 firstResult
3. 清空 Calculator 当前界面，但保留任务数据 firstResult
4. 输入 6 × firstResult =
5. 从 Calculator 真实读取 finalResult
6. 返回最终结果
~~~

这里的关键是 `firstResult` 表示**本次运行重新读取到的值**，不是固定常量 110。

**6. 怎样判断 S7 做对了？**

检查：

- 每个必要步骤能否追溯到真实执行；
- 被删除或合并的动作有没有理由；
- 第一次结果的数据来源有没有保留；
- 第二次计算还能不能说明自己的输入从哪里来；
- 清空 Calculator 界面有没有误删任务数据；
- 是否把历史成功值、预期值误当成运行时真实值。

例如，如果删掉“读取 firstResult”，第二次计算的数据就没有真实来源，因此 S7 不合格。

**7. 下一步去哪？**

~~~text
S7 正确
→ 固定必要步骤
→ 进入 S8

S7 自己删错或合并错
→ 留在 S7 修

前面的真实事实根本缺失
→ 返回 S3—S6 补事实

原始任务要求理解错
→ 返回 S1
~~~

---

### S8：把必要步骤解释成业务步骤

**实际做什么**

把“点击、读取、清空”解释成稳定业务含义，例如：

~~~text
完成第一次计算
→ 读取第一次结果
→ 清理 Calculator 当前计算状态
→ 使用第一次结果进行第二次计算
→ 读取最终结果
~~~

同时说明每一步的输入从哪里来、输出给谁使用。

**得到什么**

得到下游可以理解的业务步骤，而不只是鼠标或按钮动作。

---

### S9：把一次成功经历变成可重复规则

**实际做什么**

把本次具体值和具体经历泛化为以后运行时必须遵守的规则。

Calculator 最关键的规则是：

~~~text
firstResult 不是固定 110

而是：
每次运行都必须重新从 Calculator 真实读取
↓
保存为本次 firstResult
↓
第二次计算真正消费这个值
~~~

**得到什么**

得到一份可重复执行的业务过程说明，其中明确：

- 哪些值来自用户；
- 哪些值必须运行时重新读取；
- 谁产生这些值；
- 谁使用这些值；
- 怎样转换；
- 哪些情况支持，哪些情况还没有证据。

**下一步**

业务方法已经稳定，才进入 S10，把它落实成可靠的应用操作规则。

---

## 8. 生产实现前再次复核框架复用，不把历史低层代码当唯一答案 [S10]

### 当前问题

S11 真正需要的 Locator / Read / Wait / Action / Verifier 应该怎样实现？当前公开 API 有没有比历史实现更直接且仍满足约束的方式？

### 查看 / 调用什么

按当前版本重新核对：

- [Agent API 阅读入口](../../../docs/api/agent/README.md)
- selected canonical API contract
- [Capability Discovery](../design/capability-discovery.md)
- [应用操作工程方法](../design/application-operations.md)

具体应用结构需要时再参考 [App Development Framework](../../../docs/frameworks/app-development-framework.md)。

### 实际执行什么

优先复用已经满足：

- target identity；
- parent / window scope；
- uniqueness；
- read semantics；
- failure / partial / unknown behavior；
- side-effect boundary；

的现有高层能力。

只有高层能力无法保留关键约束，或需要额外结构化预检时，才保留有依据的低层组合。

当前仓库正好展示了两种不同性质的实现参考：

- [calculator.js](../../../examples/agent-to-recipe/calculator.js)：使用 UI.tapTargets、UI.readText，并用 Accessibility.snapshot 做必要结构预检，适合作为“当前框架能力怎样被生产实现复用”的参考；
- [calculator-fresh-20260927.js](../../../examples/agent-to-recipe/calculator-fresh-20260927.js)：使用更底层的 Accessibility.find/read/perform/release，它可以说明那次历史 Candidate 实际采用了什么，但不能自动变成今天所有 Calculator 实现的 API 选择规则。

### 得到什么事实

S10 应交付的是：

~~~text
selected operation rules
+ exact API contracts
+ runtime guards
+ verified / not-run scope
+ invalidation conditions
+ real capability gaps
~~~

而不是“高层 API 一定更好”或“历史 Candidate 一定必须照抄”。

### 下一步为什么这样走

到这里 S11 才能在不重新设计业务、不重新发明 UI resolver 的前提下忠实生成代码。

---

## 9. 生成 Candidate，再对同一份字节做独立资格验收 [S11 → S12]

### 当前问题

怎样证明代码既忠实实现 Procedure，又没有把 Expected / 历史值 / 隐藏上下文写进 runtime？

### 查看 / 调用什么

S11 使用：

- SemanticProcedure；
- S10 AppProfile / operation rules；
- selected API canonical contract；
- 当前支持范围。

S12 只消费冻结后的 exact Candidate、requested scope、scenario、Oracle 和独立执行证据。

### 实际执行什么

S11：

~~~text
生成普通 JavaScript
  ↓
检查 producer → runtime value → consumer
  ↓
冻结 exact script bytes / hash / entry / dependencies / apiRefs / sourceMapping
~~~

S12：

~~~text
拿同一 Candidate
  ↓
从干净状态独立运行
  ↓
观察真实 firstResult / finalResult / side effects
  ↓
用独立 Oracle 比较
  ↓
给 requested scope 中每一项真实 verdict
~~~

### 得到什么事实

只有 S12 才能回答冻结 Candidate 在声明范围内是否具有资格。S11 “代码看起来正确”、历史某次成功、API 文档完整，都不能代替这一层。

### 下一步为什么这样走

Qualification 通过以后才进入外部 Delivery / Publish Handoff；它不是新的 S13，也不等于自动发布。

---

## 10. “求解过程演练”和“逐阶段检查”怎样配合

如果你正在问：

> **Agent 接下来到底应该做什么？**

读本文。

如果你正在问：

> **S1—S12 哪个阶段第一次做错了？应该从哪里返工？**

读 [Calculator 基准案例](calculator.md)。

两者的关系是：

~~~text
求解过程演练
  = Agent 实际下一步怎样做
  = 当前问题 → 查看或调用 → 执行 → 得到事实 → 下一步

Calculator 逐阶段检查
  = S1—S12 每一步到底做对没有
  = 输入 → 阶段职责 → 输出 → 验收 → 错误应该回哪里
~~~

它们描述同一个 Calculator，但不维护两套 Workflow。

---

## 11. 本轮没有做的抽象

本文只证明 Calculator 可以用这套外显程序性求解方式讲清楚。

当前**不因此新增**新的全局执行手册文件，也不要求所有专业方法包立刻改写。更稳妥的后续验证是：

1. 用本文反向检查 application-engineer、task-demonstrate、recipe-build 是否真的缺少相应行为；
2. 再用至少一个非 Calculator 案例验证相同的“当前问题 → 找需要的知识和能力 → 执行 → 得到事实 → 决定下一步”模式；
3. 只有出现稳定的跨案例共性时，才考虑进一步抽象。

这样可以避免因为一个案例刚暴露出共性，就过早再造第二套主框架。
