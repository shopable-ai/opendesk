---
title: "Calculator 基准案例｜从需求到交付的端到端可检查参考"
description: "从原始需求开始，用六个直观问题逐一检查 S1—S12，并定位最早错误阶段与最小返工范围。"
order: 10
---

# Calculator 基准案例｜从需求到交付的端到端可检查参考

从原始需求开始，沿 S1—S12 检查 Calculator 每一步是否正确，并在失败时定位最早出错阶段。实际求解过程见 [Calculator 执行过程演练](calculator-execution-walkthrough.md)；每阶段应该留下哪些文件见 [Calculator 阶段产物链](calculator-artifacts.md)；人工只录关键片段后由 AI 接续的正式样本见 [Calculator 人工关键录制 → Agent 接续黄金案例](calculator-human-agent-continuation.md)。

---

## 0. 原始需求与验收边界

### 原始需求

~~~text
第一次计算：

通过 Calculator 按钮输入：

25 × 4 + 10 =

第一次计算结束后：

从 Calculator 结果显示区实际读取 firstResult。


第二次计算前：

清空 Calculator 当前界面状态，

但必须保留已经读取并保存到任务数据中的 firstResult。


第二次计算：

通过 Calculator 按钮输入：

6 × firstResult =

其中 firstResult 必须使用本次第一次计算真实读取到的全部字符。


最后：

从 Calculator 结果显示区实际读取 finalResult。

打印并返回 finalResult。
~~~

独立验收期望（Expected）：

~~~text
Expected firstResult = "110"
Expected finalResult = "660"
~~~

生产运行必须始终保持：

~~~text
Expected "110"
≠
runtime firstResult

Expected "660"
≠
runtime finalResult
~~~

也就是说：

~~~text
第一次结果显示区
  ↓ 实际读取
firstResult
  ↓ 保存到本次任务数据
第二次计算前清空 Calculator 界面
  ↓ firstResult 仍保留
firstResult 的全部字符
  ↓
第二次按钮输入
  ↓
最终结果显示区
  ↓ 实际读取
finalResult
  ↓
print + return
~~~

禁止把 Expected 110、历史运行中的 110、JavaScript 自己算出的 110、测试代码注入的 110 或示例文档里的 110 当成运行时 firstResult。

### 不依赖 S1—S12 的业务真相

下面这些约束直接来自原始需求。它们先于阶段设计成立，用来反向检查 WORKFLOW、design 和 Skills，而不是由阶段定义反推出来。

| 编号 | 不可丢失的业务事实 |
| --- | --- |
| R1 | 第一次计算必须通过 Calculator 按钮输入 `25 × 4 + 10 =`。 |
| R2 | `firstResult` 必须来自本次 Calculator 结果显示区的真实读取。 |
| R3 | `firstResult` 必须保存为本次任务的运行时数据，不能由 Expected、历史值或本地算术替代。 |
| R4 | 第二次计算前必须清空 Calculator 的当前计算状态，但不能删除任务数据中的 `firstResult`。 |
| R5 | 第二次计算必须通过 Calculator 按钮输入 `6 × firstResult =`，并真实消费本次 `firstResult` 的全部字符和顺序。 |
| R6 | `finalResult` 必须来自本次第二次计算后的 Calculator 结果显示区真实读取。 |
| R7 | 最终必须打印并返回本次 `finalResult`。 |
| R8 | Expected `"110"` / `"660"` 只属于验收 Oracle，不得进入 production runtime data path。 |

反向审计时先问：

~~~text
这个阶段的输出是否仍然保持 R1—R8？
~~~

如果某个阶段定义、Skill 或实现无法保留这些业务事实，应先修对应 owner，而不是修改这些事实来适配工作流。

---

## 1. 全链路阶段地图

~~~text
原始需求
  ↓
S1 明确任务与成功标准
  ↓
S2 认识 Calculator 中真正需要操作和读取的对象
  ↓
S3 执行当前获准动作
  ↓
S4 重新观察并验证实际效果
  ↓
S5 判断继续 / 修订 / 恢复 / 停止
  └─ continue → 下一次 S3
  ↓ task end
S6 汇总本次真实示范事实
  ↓
S7 从真实记录提炼必要步骤
  ↓
S8 把必要步骤解释成业务步骤
  ↓
S9 形成可复用业务过程、运行时数据关系和支持范围
  ↓
S10 把定位 / 读取 / 等待 / 清空等应用操作工程化
  ↓
S11 生成并冻结真实 JavaScript 候选程序
  ↓
S12 对同一候选程序做独立资格验收
  ↓
Delivery / Publish Handoff
~~~

本案例按 **S1—S12** 逐阶段检查；同一个 Skill 可以连续承担多个阶段，但每个阶段仍分别验收并定位首错。详细边界说明见文末“附录 A｜阶段边界说明”。

---

## 2. 核心业务数据链

~~~text
原始需求
  ↓
S1：要求“真实读取第一次结果，并让第二次计算使用它”
  ↓
S2：知道哪个 Calculator、哪个按钮区、哪个结果区
  ↓
S3：真的执行读取动作
  ↓
S4：真的观察到结果区的 actual value
  ↓
S5：把该值作为可信 runtime value 后才继续
  ↓
S6：事实包保留“来源 → firstResult → 后续使用”
  ↓
S7：必要步骤保留“读取并保存 firstResult”
  ↓
S8：业务步骤保留“ReadFirstResult → firstResult → EnterSecondCalculation”
  ↓
S9：firstResult 被定义为 runtime value，不是 caller parameter 或 default
  ↓
S10：读取 / 清空 / 等待规则不允许 Expected fallback
  ↓
S11：真实代码把 firstResult 展开到第二次按钮输入
  ↓
S12：验收同一 Candidate，确认真实 producer → consumer
~~~

诊断原则：

> **逐个比较相邻阶段，找到第一份“输入仍正确、输出第一次变错”的产物。**

找到以后，从该责任阶段修复，只重做受它影响的下游；没有证据说明失效的上游不自动重跑。

---

## 2.1 本次 Actual 的审阅边界

下面十二个阶段的六问正文用于判断“应当怎样做”；本节与 [产物主表](calculator-artifacts.md#01-本次接续的真实入口2026-09-30-utc--2026-10-01-本地)连接已经发生的事实。以固定检查 `check-2026-10-01T09-34-11-006Z-6f6568fc` 为边界，正式发布到 S2；S3—S12 未纳入该次阶段验收。保留的真实示范、当前新示范提案和历史维护候选必须分别阅读。

每阶段先核对业务正文、原始要求和产物来源，再看判断与评分。维护这些文件不自动授权生产或桌面操作。当前暂停要求优先于先前执行授权：17:35 的失败已经发生，应保留真实失败；其后修复、重验和独立资格运行均未运行，静态修订不能填为验证成功。

**旧示范的读值链可直接检查：**

| 环节 | 实际内容 | 固定事实入口 |
| --- | --- | --- |
| 第一次读值 | Execution `direct-20261001-044351-656000`，A032 从当前主显示器取得字符串 `110` | [first-result-actual.json](../../../.runtime/automation-authoring/calculator-completion-20261001/first-result-actual.json)；[277 条原始事件索引](../../../.runtime/automation-authoring/calculator-completion-20261001/demo-first-actual-event-index.json) |
| 跨清空保留 | 第二段实际 C → AC 后显示为 `0`，任务中保存的原文清空前后均为 `110` | [第二段原始日志](../../../.runtime/ai/ai-20261001-051140-472000/stdout.log)的 B016 和 preservation/verification 记录 |
| 全字符消费 | B031/B037/B043 分别消费索引 0/1/2 的 `1/1/0`；重复 `1` 没有被去重 | [消费者核对](../../../.runtime/automation-authoring/calculator-completion-20261001/demo-independent-result-verification.json)与同次原始日志 |
| 最终交付 | B052 实读 `660`；代码中的实际调用方打印并取得该字符串。CLI envelope 本身没有导出 JS return value | [同次 summary](../../../.runtime/ai/ai-20261001-051140-472000/summary.json)、原始 finalPrint/finalReturn；独立 witness `direct-20261001-051405-666000` |
| 事实收口 | Producer 已依据真实记录形成 Dossier；尚未获得正常 S6 → S7 交接 | [同版 Dossier 人工视图](../../../.runtime/automation-authoring/calculator-completion-20261001/s6-bound/dossier.md)；[独立审阅](../../../.runtime/automation-authoring/calculator-completion-20261001/reviews/demo-review-findings.json) |

**问题如何出现、定位与接续：**

| 真实问题 | 怎样发现／最早边界 | 保留什么、修哪里、怎样证明继续 |
| --- | --- | --- |
| C 后显示 `0` 仍不能证明独立起算 | 受控应用规则试验：待处理乘法经 C 后输入 `2 =` 实读 `16`；显式 AC 路径实读 `2`。原 S2 → S3 操作前提不足 | 保留原 Profile 和原停止提案；application-engineer 补有证据的清空规则，并验证下游实际使用显式 AC。见 [试验证据](../../../.runtime/automation-authoring/calculator-completion-20261001/reset-rule-001-evidence.json) |
| 输入数值在 JS 中变成对象 | 原第二段在第一个 Calculator API 前失败，输入为 0；`Execution.input` 身份校验边界失效 | 保留第一段实际值、原失败和源码；修 Runtime JSON 转换，六个真实 JS 输入契约场景验证后，使用同源第二段完成接续。见 [失败修复记录](../../../.runtime/automation-authoring/calculator-completion-20261001/runtime-input-failure-repair.json) |
| 旧示范缺派发前共享预算依据 F01 | 独立审阅确认每槽用量，却不能确认共享余额和单位；最早责任是旧 S3 准入，不是“已经证明超额” | 保留动作、观察和数据链；Coordinator 修预算派发方法。历史证据缺口仍保留，新预算只约束未来运行。S3/S5/S6 尚不能正常发布到 S7。见 [F01 原始判断](../../../.runtime/automation-authoring/calculator-completion-20261001/reviews/demo-review-findings.json) |
| 新 S3 在显示区绑定校验失败 | `ai-20261001-173517-643000` 的 `inspect:68` 报 `Wrong display binding`；4 个 API 调用已结束，Calculator 按钮输入为 0。完整 snapshot 内 `_NS:11` 下存在 `_NS:16`、string `660`；本次没有 firstResult | 保留 S1/S2、失败源码和树。对象引用相等的假设是疑点，owner 尚未确定；静态核对条件与 API 契约，提交有依据的归属判定修订。尚未修复验证，不宣称 Runtime bug。见 [summary](../../../.runtime/ai/ai-20261001-173517-643000/summary.json)、[源码快照](../../../.runtime/ai/ai-20261001-173517-643000/script_snapshot.js)和 [原始日志](../../../.runtime/ai/ai-20261001-173517-643000/stdout.log) |

四项问题的证据类型不同：第一项是受控真实 UI 规则试验，第二项是真实 Runtime 失败与修复，第三项是对真实示范的独立证据审阅，第四项是新示范已结束的真实失败。它们都不是最终 Recipe 的独立资格运行。

新失败应从 **S3 的显示区归属校验**开始定位，不能因为 snapshot 里有 `660` 就判断计算成功。窗口激活确实发生；预算预留的 1 次输入额度不能当作 Calculator 按钮事实。`includes` 的对象引用假设需要和接口契约核对，责任目前未确定。它与先前已修复的 `Execution.input` 数值类型问题不同，不能沿用那次修复结论。

当前用户已暂停执行脚本、Node 检查、测试和桌面动作。本次案例修订仅静态对照保存的事实；没有新的修复运行或资格结论。根报告若仍指向上面的 S2 → S3 检查，尚未覆盖此新失败，应先读此次 Execution；正式 S3 判断由唯一协调者补充证据并通过原 checker 发布。Node 维护工具的检查通过不能证明 OpenDesk Runtime 中的按钮、读值和输出成功。

审阅最新进度时打开 [根 stage-review.md](../../../.runtime/automation-authoring/calculator-completion-20261001/stage-review.md)，沿它的同版快照继续；不得从本文参考示例或旧执行的 `110 → 660` 给新运行填值。

---

## 3. 怎样阅读下面的 12 个阶段

下面不再把每个阶段拆成九个工程化栏目。每个阶段只回答六个问题：

~~~text
1. 这一步为什么存在
2. 开始前已经有什么
3. Calculator 中实际做什么
4. 做完后应该得到什么
5. 怎样判断是否做对
6. 错了怎么修，什么时候继续
~~~

阅读时优先看“Calculator 中实际做什么”和“做完后应该得到什么”；需要检查边界时，再看输入、错误信号和返回位置。正式字段名只在确实需要交接或验收时保留，不要求先理解字段结构才能理解业务过程。

每个阶段的“正式产物”都必须对应本次执行真实存在的文件或固定引用；本文中的参考内容不能替代本次 Actual。文件名、目录位置与最小示例统一放在 [Calculator 阶段产物链](calculator-artifacts.md)，避免在 12 个阶段正文里重复一整套文件组织说明。

---

## S1｜任务与计划

### 1. 这一步为什么存在

把用户原始要求变成可检查的任务合同和操作计划，明确“要做什么、允许做什么、怎样算成功、哪些地方还不知道”。重点防止把“真实读取 firstResult”偷换成“我们已经知道 firstResult=110”。

### 2. 开始前已经有什么

~~~text
原始需求
  第一次按钮计算 25 × 4 + 10 =
  实际读取 firstResult
  第二次计算前清空 Calculator 界面
  任务数据中的 firstResult 必须保留
  第二次按钮计算 6 × firstResult =
  实际读取 finalResult
  print + return finalResult

固定业务输入
  25, 4, 10, 6

Expected
  firstResult = "110"
  finalResult = "660"

授权
  仅允许目标 Calculator 的必要观察、激活、按钮操作和当前计算状态清空

Unknown
  当前窗口身份、结果区是否可读、按钮定位是否可靠、clear 的现场语义等
~~~

### 3. Calculator 中实际做什么

本阶段负责保留原始需求来源，区分固定业务输入、运行时值、Expected、Unknown，固定成功/失败/停止条件、授权边界和粗粒度 WorkPlan。

本阶段不猜坐标，不声称已经读到 110，不生成 JavaScript，不做最终 Qualification。

#### 本例

~~~text
P10 准备第一次计算状态
P20 通过按钮输入 25 × 4 + 10 =
P30 从结果显示区实际读取并保存 firstResult
P40 清空 Calculator 当前界面，但保留任务数据 firstResult
P50 通过按钮输入 6 × firstResult =
P60 实际读取 finalResult，打印并返回

firstResult
  类型 = runtime value
  来源 = P30 的现场读取
  后续使用 = P50
  Expected = "110" 仅用于验收

finalResult
  类型 = runtime value
  来源 = P60 的现场读取
  Expected = "660" 仅用于验收
~~~

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，原始需求已经被整理成可直接执行和检查的任务定义：固定输入、运行时读值、Expected、关键数据规则、状态规则和未知项都已分开。

#### Calculator 本例的结果

~~~text
任务目标
  两次 Calculator 计算；第二次必须使用第一次现场读取的 firstResult
固定业务输入
  25, 4, 10, 6
运行时值
  firstResult = 第一次结果区真实读取
  finalResult = 第二次结果区真实读取
验收期望
  firstResult = "110"
  finalResult = "660"
关键数据规则
  P50 必须消费本次 P30 实际读到的 firstResult
关键状态规则
  P40 只清空 Calculator UI，不删除任务数据 firstResult
执行计划
  P10 → P20 → P30 → P40 → P50 → P60
仍需后续确认
  当前窗口身份、结果区读取、按钮定位、clear 现场语义
~~~

#### 正式产物

- TaskContract
- WorkPlan / Operation Plan
- 初始业务任务树
- 高影响 Unknown 与阻塞项

### 5. 怎样判断是否做对

- 原始需求没有被改写成“只要最后得到 660”。
- Expected 和 runtime value 分开。
- P30 明确要求真实读取 firstResult。
- P40 明确“清空 UI ≠ 清空 firstResult”。
- 首值未可靠取得时，计划不会允许正常进入依赖它的第二次输入。

#### 常见错误信号

- 把 Expected 110 直接写成 firstResult 的来源。
- 计划只写“计算两次”，没有写第一次结果必须被第二次实际消费。
- 把清空 Calculator 界面理解成同时删除任务变量 firstResult。
- 在 S1 就预写未知按钮坐标、窗口尺寸或读取 API。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S1**。重新对照原始要求修合同。依赖错误合同的下游需要重新判断；没有证据受影响的外部事实不必机械重做，但不能继续消费旧合同。

#### 什么时候可以继续

**现在可以继续了吗？** 只有当目标、授权、成功/失败标准、运行时数据关系、关键 Unknown 和近期计划没有互相冲突时，才进入 S2。

---
## S2｜最小应用认识

### 1. 这一步为什么存在

确认下一步要操作和读取的 Calculator 对象到底是什么，避免凭经验猜坐标、看到数字就当结果、看见界面就当获得操作授权。

### 2. 开始前已经有什么

~~~text
S1 TaskContract / WorkPlan
+ 当前获准观察
+ 可复用 AppProfile（如果仍有效）
+ 当前 Calculator 现场

应用：Calculator
当前窗口：本次任务的 Calculator 窗口
按钮区域：数字、×、+、=、clear
结果显示区：本次运算结果来源
必要目标：0,1,2,4,5,6,×,+,=,clear
~~~

### 3. Calculator 中实际做什么

本阶段确认应用、窗口、模式、按钮区域和结果显示区，分开记录对象身份、外观、当前 Geometry 与可执行定位依据，写清 Known / Unknown 与证据来源。

如果还不知道怎样完成“找窗口、点按钮、读结果、清空状态”，先从 OpenDesk 的公开能力入口发现已有能力，再比较候选、读取选中方法的准确契约，并在当前 Calculator 现场验证。顺序应是：

~~~text
当前业务问题
  ↓
发现已有能力
  ↓
比较候选方法
  ↓
读取 selected method 的 canonical contract
  ↓
当前环境验证
  ↓
形成足够推进下一动作的最小 AppProfile
~~~

本阶段不因为“Calculator 通常这样布局”就猜坐标，不因为能截图就宣称能安全点击，不把当前屏幕任意数字当成结果区，也不重新决定业务上是否要使用 firstResult；同样不能因为文档中存在某个 API，就写成当前环境已经验证通过。

#### 本例

~~~text
Application
  Calculator

Current window
  当前获准的 Calculator 主窗口

Required regions
  button region
  result display

Required targets
  0,1,2,4,5,6,×,+,=,clear

Known
  目标必须属于同一个当前 Calculator window
  结果必须来自同一个窗口的结果显示区

Capability candidates
  window.get / window.activate / window.current
  UI.tapTargets / UI.readText
  必要时 Accessibility.snapshot 等结构化只读检查

Selection state
  selected / to validate
  不能仅因 API 名存在就写 runtime passed

Unknown until evidenced
  当前布局是否仍受支持
  同名按钮是否唯一
  结果读取是否稳定
  clear 的现场后置状态
  当前 Geometry 是否可直接用于动作
~~~

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，Agent 已知道近期要操作哪个 Calculator、哪些按钮、从哪里读取结果，以及哪些认识仍未验证；后续不再靠猜。

#### Calculator 本例的结果

~~~text
应用
  Calculator
当前业务对象
  本次任务的 Calculator 主窗口
操作区域
  按钮区
读取区域
  当前计算结果显示区
近期目标
  0,1,2,4,5,6,×,+,=,clear
已确认
  点击目标和结果区必须属于同一个当前 Calculator 窗口
仍未验证
  布局支持、目标唯一性、读取稳定性、clear 后状态、Geometry 是否足够
~~~

#### 正式产物

- 最小 AppProfile 或有效旧版本引用
- 近期动作所需定位 / 读取依据
- 未验证项、限制和必要 planDelta

### 5. 怎样判断是否做对

- 每个将要点击或读取的对象都有真实来源。
- 不知道怎样执行时，先发现并比较现有公开能力，而不是默认自己造低层实现。
- selected method 的文档契约与当前环境验证分开记录。
- 结果区定义不是“窗口里任何数字”。
- 当前 Geometry 与可执行定位依据没有混为一谈。
- Unknown 没有被熟悉感补成事实。
- 界面认识和动作授权保持分离。

#### 常见错误信号

- 无证据写固定按钮坐标。
- 看到 110 就认定它一定是本次运算结果。
- 从最终 JavaScript 的尺寸、按钮表反推历史 S2 观察。
- 截图没有 screen mapping，却直接把图中位置变成点击坐标。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S2**。对象身份、区域、读取依据不足时留在 S2；新事实推翻任务路线或授权时回 S1。依赖错误对象认识的 S3 及以后需要重验；S1 原始业务语义若未被推翻，不重做。

#### 什么时候可以继续

**现在可以继续了吗？** 只有当下一步真正需要操作/读取的关键对象有依据，且 Unknown 不会让即将执行的动作越权或盲目时，才进入 S3。

---
## S3｜执行当前获准动作

### 1. 这一步为什么存在

回答：**当前获准动作到底有没有真的发生？** 计划不是事实，Expected 不是事实，后来的代码也不能代替本次实际动作。

### 2. 开始前已经有什么

~~~text
planned step = P30
business subgoal = 读取第一次结果
target basis = S2 已确认的 Calculator 结果显示区
authorization = 只读
expected criterion = "110"（只作期望）
current state = P20 已完成且当前对象身份仍有效
~~~

### 3. Calculator 中实际做什么

本阶段绑定 planned step，执行一个当前获准动作，保存 actual action、actual target、actual request、工具回执/原始返回、证据和副作用状态。

本阶段不凭 receipt 宣布业务结果正确，不用 Expected 补 actual return，不把未执行计划写成已执行，不在副作用结果 unknown 时盲目重放。

#### 本例

> **阅读边界：** 下面的 A004、A005、A007 等编号是为了展示“正确的阶段产物应该怎样保留事实”的参考 fixture。它们不是本文声称刚刚发生的一次新桌面 execution。新的生产运行仍必须重新执行并取得自己的 Actual / Evidence。

~~~text
P20
  actual action（A004）
  request = 按顺序输入 [2,5,×,4,+,1,0,=]
  target = 当前 Calculator 按钮
  receipt = 每个动作的实际回执

P30
  actual action（A005）
  request = read current result display
  target = 当前 Calculator 结果显示区
  raw return = "110"  # 参考解中的实际读值位置；生产运行必须来自本次读取
  evidence = 本次调用/返回记录

P40
  actual action（A007）
  request = clear current Calculator UI state
  target = 当前 Calculator
  taskData.firstResult = 保留，不属于 clear 的作用对象
~~~

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，已经留下“这次实际执行了什么”的记录，而不只是计划。真实请求、目标、工具返回和副作用状态都可追溯。

#### Calculator 本例的结果

~~~text
示例：P30 读取第一次结果
actual action
  read current Calculator result display
actual return
  "110"
注意
  这是本次真实动作产生的读值候选
  还需 S4 验证对象与实际效果
同时保存
  actual target / request / receipt
  execution identity / timestamp
  evidence refs
  sideEffect = known / unknown
~~~

#### 正式产物

- Raw Trace / Experience Unit
- Evidence
- 实际 action / request / tool return
- 运行时值来源候选
- side-effect 状态

### 5. 怎样判断是否做对

- 能找到真实 action/调用，不是只有计划。
- actual target 与 S2 依据一致。
- actual request 保留真实输入顺序和次数。
- Expected 没有写进 raw return。
- 有副作用动作结果 unknown 时没有再次执行来“补记录”。

#### 常见错误信号

- “P30 计划读取”直接写成“已读到 110”。
- 按钮序列来自预期脚本，而不是实际请求记录。
- 工具超时后再次点击同一个按钮。
- 目标身份有歧义仍先执行再解释。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S3**。target/read 依据错误回 S2 或已有工程规则的 S10；授权或目标改变回 S1。本次 action 之后的 S4/S5 和最终 S6 受影响；之前已确认且无依赖的微循环不自动重放。

#### 什么时候可以继续

**现在可以继续了吗？** 当前动作必须有可追溯 actual action 事实和明确副作用状态，S4 才有真实对象可观察和验证。

---
## S4｜观察并验证实际效果

### 1. 这一步为什么存在

S3 只说明动作发生了什么。S4 要回答：**动作之后，正确业务对象实际上变成了什么状态？**

~~~text
tool receipt ≠ business observation
Expected ≠ actual observation
~~~

### 2. 开始前已经有什么

~~~text
S3 actual action
+ 正确对象身份
+ expected transition / criterion
+ 当前 observation / verifier

第一次结果读取参考
  source action = A005
  Expected = "110"
  target = Calculator result display
~~~

### 3. Calculator 中实际做什么

本阶段重新观察正确对象，保存 actual observation，与 Expected 分开比较，给出 pass / fail / uncertain，并记录证据和限制。

本阶段不因 API 返回 ok 就宣布业务成功，不把没观察到写成 false，不用 Expected 生成 observation，也不决定下一步一定继续。

#### 本例

~~~text
sourceAction = A005
observedObject = 当前 Calculator result display

actualObservation
  read1 = "110"
  read2 = "110"
  sameTarget = true
  stable = true

Expected
  criterion = "110"

comparison = pass
verificationStatus = pass
~~~

A004 的按钮 receipt 即使都 acknowledged，也仍需要结果区 observation 才能证明业务结果。

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，已经知道动作后正确业务对象实际变成什么，并将 Actual 与 Expected 分开比较；证据不足时保持 uncertain。

#### Calculator 本例的结果

~~~text
来源动作
  P30 的实际 read action
实际观察对象
  当前 Calculator 结果显示区
Actual
  read1 = "110"
  read2 = "110"
  sameTarget = true
  stable = true
Expected
  "110"
比较
  pass
~~~

#### 正式产物

- actual observation
- observed object identity
- Actual / Expected comparison
- pass / fail / uncertain
- evidence refs 与 limitations

### 5. 怎样判断是否做对

- Actual 与 Expected 有不同来源。
- observation 来自正确 Calculator 结果区。
- receipt 没有替代业务观察。
- 证据不足时保持 uncertain。
- 读值稳定性、对象一致性和格式限制被明确处理。

#### 常见错误信号

- receipt ok → verificationStatus=pass。
- Expected 110 → actualObservation=110。
- 读到另一个数字区域恰好也是 110，就当成当前结果。
- 没观察到某状态，直接写该状态为 false。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S4**。缺 actual observation 时定向补 S3→S4 所需观察；目标或读取方式失效回 S2 / S10。依赖错误 verification 的 S5 和 S6 需要重做；S3 已真实发生的 action 不因 S4 判断错误而重放。

#### 什么时候可以继续

**现在可以继续了吗？** 必须已经有对正确对象的 actual observation，并明确 pass、fail 或 uncertain。S5 只能基于这个真实状态作决策。

---
## S5｜分类并决定下一步

### 1. 这一步为什么存在

把 S3/S4 已经成立的事实分类，然后决定 continue / revise / recover / stop。S5 不创造新的 UI 真相。

### 2. 开始前已经有什么

~~~text
planned step
+ S3 actual action
+ S4 verification status
+ sideEffect state
+ WorkPlan
+ authorization / budget
~~~

### 3. Calculator 中实际做什么

本阶段分类 normal/setup/verification/exploration/retry/recovery/off-task/error，决定继续、修订、恢复或停止，必要时记录 planDelta，并对副作用 unknown 做停止或对账。

本阶段不修改过去 actual，不在 uncertain 时假装成功，不把“动作名称重复”自动当噪音，不自己补新 observation。

#### 本例

~~~text
首值确认后
  source = A005 + S4 pass
  classification = runtime-value-producer
  runtimeValue = firstResult
  origin = A005
  decision = continue
  nextPlannedStep = P40

第二次 clear
  source = A007/A008
  classification = setup / state-preparation
  effect = 准备第二次 Calculator UI state
  preserveTaskData = firstResult
  decision = continue
  nextPlannedStep = P50

未知效果
  verificationStatus = uncertain
  sideEffect = unknown
  classification = unresolved
  decision = stop
  retry = false
~~~

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，Agent 已基于 S3/S4 的真实事实决定继续、修订、恢复还是停止；本阶段不创造新的 UI 事实。

#### Calculator 本例的结果

~~~text
firstResult 已可靠读取
  classification = runtime-value-producer
  decision = continue
  next = P40
第二次 clear
  classification = setup / state-preparation
  preserveTaskData = firstResult
  decision = continue
  next = P50
若 verification uncertain 且 sideEffect unknown
  classification = unresolved
  decision = stop
~~~

#### 正式产物

- classification
- continue / revise / recover / stop
- nextPlannedStep
- planDelta / recoveryRelation
- sideEffectHandling
- reason 与 evidence refs

### 5. 怎样判断是否做对

- S4=uncertain 时不会正常继续依赖该结果。
- 第二次 clear 被理解为新的状态准备。
- planDelta 不覆盖过去事实。
- recovery 与正常路径分开。
- stop/retry 符合副作用和预算边界。

#### 常见错误信号

- 把第二次 clear 误认为重复噪音。
- firstResult 尚 uncertain，却继续输入 6 × firstResult。
- 点击结果 unknown 后直接重放。
- 用新的计划解释覆盖已发生的错误 actual。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S5**。S4 判断错回 S4，S3 action 不成立回 S3。后续微循环和 S6 受错误决策影响；正确的上游 action/observation 保留。

#### 什么时候可以继续

**现在可以继续了吗？** 只有 decision 有真实依据，且 unknown 副作用已安全处理时才 continue 到下一次 S3；任务已结束时才进入 S6。

---
## S6｜任务级事实收口

### 1. 这一步为什么存在

把多轮 S3→S4→S5 收成一次任务级事实包，回答这次真实示范最终完成、失败、局部完成，还是证据不足。

### 2. 开始前已经有什么

~~~text
TaskContract / WorkPlan
+ 全部 S3 actual actions
+ 全部 S4 actual observations / verification
+ 全部 S5 classifications / decisions / planDelta
+ runtime values
+ side effects
+ evidence
~~~

### 3. Calculator 中实际做什么

本阶段汇总真实动作和观察，固定 taskStatus、firstResult 的真实来源与后续消费、finalResult 的真实来源，保存 side effects/unresolved/evidence index，冻结示范事实包（Demonstration Dossier）与原始执行记录引用。

本阶段不补造未发生事实，不只因最终 660 就宣称完整成功，不做 S7 的 retain/omit/merge，不把人工参考执行追认为 Agent demonstration。

#### 本例

~~~text
taskStatus = complete-success / fail / partial / inconclusive

firstResult
  producer = A005
  observedValue = "110"  # 参考解中的观察值；生产运行必须来自本次观察
  consumer = A009
  transform = characters
  freshRun = reacquire

secondPreparation
  actions = A007, A008
  changes = Calculator UI state
  preserves = firstResult

finalResult
  producer = A010
  observedValue = "660"  # 参考解中的观察值；生产运行必须来自本次观察
  consumer = final output

sideEffects = [...]
unresolved = [...]
evidenceIndex = [...]
~~~

关键关系：

~~~text
A005 → firstResult → A009
A010 → final output
~~~

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，本次 Calculator 示范已收口成“这次真实任务到底发生了什么”的事实包，下游不需要依赖聊天记忆。

#### Calculator 本例的结果

~~~text
真实事实链
  第一次按钮输入
    ↓
  实际读取 firstResult
    ↓
  保存 firstResult
    ↓
  清空 Calculator UI，但保留 firstResult
    ↓
  第二次输入真实消费 firstResult
    ↓
  实际读取 finalResult
    ↓
  print + return finalResult
同时说明
  taskStatus / initialState / finalState
  sideEffects / evidenceIndex
  coverage / unresolved
~~~

#### 正式产物

- Demonstration Dossier
- 冻结的 Raw Trace / Evidence 引用
- 实际数据流
- 未决问题与覆盖范围

### 5. 怎样判断是否做对

- taskStatus 与证据强度一致。
- firstResult 的来源和后续使用同时存在。
- finalResult 有真实来源。
- unresolved / sideEffect 没被隐藏。
- S7 只读固定事实包就能知道“实际发生过什么”。

#### 常见错误信号

- 只留下 final=660，丢掉 firstResult 的生产与消费。
- S4=uncertain，却在 S6 升级成 complete-success。
- Dossier 写入从未真实执行的读取步骤。
- 丢失第二次 clear 与“保留 firstResult”的状态关系。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S6**，如果原始事实齐全只是汇总错误。缺 action 回 S3；缺/错 observation 回 S4；决策错回 S5。S7—S12 中依赖错误 Dossier 的部分重做；可信的 S1/S2 和不受影响的 S3—S5 事实不自动重跑。

#### 什么时候可以继续

**现在可以继续了吗？** 只有 S7 能仅凭固定输入判断“真实发生过什么”，且关键 runtime 数据链、范围和未决项都没有被隐藏时，才进入 S7。

---
## S7｜提炼必要步骤

### 1. 这一步为什么存在

把真实执行中大量点击、读取、准备、验证整理成“完成任务真正必要的步骤”，去掉噪音，但不能把数据、顺序、状态和证据关系整理丢。原始执行记录（Raw Trace）在这里被提炼成**提炼后的必要步骤（DistilledSteps）**。

### 2. 开始前已经有什么

~~~text
TaskContract / WorkPlan
+ S6 示范事实包
+ 原始执行记录
+ 必要证据
+ 必要 Calculator 应用认识
~~~

| 业务含义 | 追溯索引 | 关键作用 |
| --- | --- | --- |
| 第一次计算后真实读取结果 | A005 | firstResult 的真实来源 |
| 辅助截图 | A006 | 辅助证据，不能替代读取 |
| 第二次计算前清空 Calculator | A007 | 建立新的界面状态 |
| 清空后确认干净状态 | A008 | 验证第二段起点 |
| 输入 6 × firstResult = | A009 | firstResult 的真实消费者 |
| 读取最终结果 | A010 | finalResult 的真实来源 |

### 3. Calculator 中实际做什么

本阶段判断哪些原动作保留、删除、合并、作为恢复经验或保持未决，保存每项取舍理由和来源，把低层动作组织成可理解的必要步骤，并保留 producer→consumer 数据关系、状态准备和验证。

本阶段不重跑 Calculator，不重新决定用户目标，不把一次示范直接泛化成参数化 Procedure，不用语言推理补齐不存在的事实。

#### 本例

| 中文必要步骤 | 辅助编号 | 来自 | 必须保留 |
| --- | --- | --- | --- |
| 准备第一次计算 | D010 | A001,A002,A003 | 正确窗口、清空、起点检查 |
| 输入第一次算式 | D020 | A004 | 2,5,×,4,+,1,0,= 的顺序和次数 |
| **读取并保存第一次计算结果** | D030 | A005,A006 | 真实读取并保存 firstResult |
| 准备第二次计算 | D040 | A007,A008 | 清空 UI，但保留 firstResult |
| **使用第一次计算结果输入第二次算式** | D050 | A009 | firstResult 的全部字符 |
| 读取最终结果 | D060 | A010 | 真实读取 finalResult |

~~~text
读取并保存第一次计算结果
  ↓
firstResult
  ↓
准备第二次计算，但 firstResult 保留
  ↓
使用 firstResult 的全部字符
  ↓
读取最终结果
~~~

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，原始执行经历已被整理成真正完成任务所必需的步骤；保留、合并、删除和恢复都有来源和理由。

#### Calculator 本例的结果

~~~text
必要步骤
  1. 准备第一次计算状态
  2. 输入第一次算式
  3. 读取并保存 firstResult
  4. 准备第二次计算并保留 firstResult
  5. 使用 firstResult 输入第二次算式
  6. 读取 finalResult
每一步保留
  source action / evidence
  input / output
  precondition / postcondition
  verification
另外明确
  merge / omit / recovery / unresolved
~~~

#### 正式产物

- versioned DistilledSteps
- Omission Log
- Recovery Candidates
- unresolved items
- 同版可读审阅视图

### 5. 怎样判断是否做对

- 每个必要步骤都有真实来源。
- firstResult 的读取来源和后续使用都还在。
- 合并动作没有改变输入顺序和次数。
- 两次 clear 因状态不同而被正确区分。
- 被删除或合并的动作有可解释理由。

#### 常见错误信号

- 误删“读取并保存第一次计算结果”这一步（D030），导致后面 firstResult 无来源。
- 把 110 中两个 1 去重成一个，把业务数据 110 改成 10。
- 误删第二次计算前清空（D040），只因为第一次已经清空过。
- 合并按键动作时改变真实输入方式，例如偷偷改成固定粘贴 110。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S7**，如果真实记录完整只是提炼错误。上游根本没有真实读取 firstResult 时，回 S3—S6 的首个事实缺口。S8—S12 受影响部分重做；S1—S6 已确认正确事实不自动重跑。

#### 什么时候可以继续

**现在可以继续了吗？** 只有必要步骤能独立表达完整业务路径，关键数据和状态关系都没有被“去噪”丢失时，才进入 S8。

---
## S8｜解释业务语义

### 1. 这一步为什么存在

把必要步骤解释成稳定业务步骤：这一步在业务上做什么？输入从哪里来？输出给谁？

### 2. 开始前已经有什么

~~~text
S7 DistilledSteps
+ TaskContract / WorkPlan
+ 必要 AppProfile
+ 来源 / 证据引用

读取并保存第一次计算结果（D030）
  → firstResult

准备第二次计算（D040）
  → 清空 Calculator UI
  → firstResult 保留

使用第一次计算结果（D050）
  → 消费 firstResult
~~~

### 3. Calculator 中实际做什么

本阶段按业务目的形成 Business Steps，明确每步输入、输出、来源、前置、后置、验证和消费者，保持 Business Step→DistilledSteps→原始事实来源链。

本阶段不再次删除/保留原动作，不把 firstResult 参数化，不决定 locator/read/wait 的具体工程实现，不写 JavaScript。

#### 本例

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

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，下游看到的不再只是点击序列，而是每一步的业务目的、输入来源、输出和消费者；firstResult 的生产消费关系已明确。

#### Calculator 本例的结果

~~~text
读取第一次结果
  output = firstResult
  source = 当前 Calculator 第一次结果区
  consumer = 第二次算式输入
准备第二次计算
  清理 UI
  必须保留 firstResult
输入第二次算式
  input = firstResult
  必须消费其全部字符
读取最终结果
  output = finalResult
  consumer = print + return
~~~

#### 正式产物

- 稳定 Business Steps
- 业务对象与数据交接关系
- 语义缺口 / 工程缺口

### 5. 怎样判断是否做对

- Business Step 按业务目的组织，不按点击次数组织。
- B025 output 是 firstResult。
- B040 input 仍是 firstResult，不是固定 110。
- B050 保留真实 finalResult 读取。
- 每步仍能追到 S7 来源。

#### 常见错误信号

- 在 S8 已把 B040 输入写成固定 110。
- 有 B025 产生 firstResult，却没有后续消费者。
- 把每个按键都拆成独立 Business Step。
- 为了简化删除 B050 最终读取。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S8**，如果必要步骤正确只是业务解释错。必要步骤本身已错回 S7。S9—S12 受影响部分重做；S1—S7 的正确事实与取舍不自动重跑。

#### 什么时候可以继续

**现在可以继续了吗？** 只有下游可以不读完整 Raw Trace，就理解每个必要步骤的业务目的、输入输出和消费者时，才进入 S9。

---
## S9｜形成可复用业务过程

### 1. 这一步为什么存在

把一次案例的 Business Steps 提升为有依据的可复用业务过程（SemanticProcedure），明确运行时值、参数、配置、Secret、状态、分支和支持范围。

### 2. 开始前已经有什么

~~~text
S8 Business Steps
+ DistilledSteps
+ TaskContract
+ 必要补充证据
+ 必要 AppProfile
+ capability / API 选择事实

已固定
  B025 produces firstResult
  B040 consumes firstResult
  B050 produces finalResult
~~~

### 3. Calculator 中实际做什么

本阶段分类 caller input/runtime value/configuration/secret/state/expected/unknown，固定运行时值来源、消费者、变换和重新获取要求，定义分支、失败、恢复、scope，并明确 S10 工程缺口。

本阶段不重新做 S7 动作取舍，不把 Expected 变成 runtime default，不因一次成功宣称任意表达式/布局，不写具体 locator 或 JavaScript。

#### 本例

~~~text
caller input
  none
  当前固定 Calculator recipe 不接受调用方参数
  是否参数化 25/4/10/6 需要额外合同与资格证据

fixed business inputs
  25, 4, 10, 6

runtime value: firstResult
  producer = B025
  origin = Calculator result display
  consumers = [B040]
  transform = characters
  freshRun = reacquire

runtime value: finalResult
  producer = B050
  consumers = [print, return]
  freshRun = reacquire

configuration
  当前业务不需要调用方配置
  应用身份/定位规则交 S10 工程化

secret
  none

branch / stop
  firstResult 不可可靠读取 → stop
  副作用 unknown → stop / reconcile

supported scope
  只声明已有证据支持的 Calculator 环境与固定业务输入

pending engineering
  locate current Calculator
  locate buttons
  read result
  clear state
  wait / verify
  unknown-effect handling

data dependency
  B025 → firstResult → characters → B040
~~~

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，单次示范已提升为可复用业务规格：运行时值的 producer/consumer、支持范围和不能承诺的范围都已明确。

#### Calculator 本例的结果

~~~text
firstResult
  producer = 第一次结果读取
  consumer = 第二次算式输入
  不能变成 caller parameter
  不能使用 Expected fallback
finalResult
  producer = 第二次结果读取
  consumer = 最终输出
关键状态
  clear Calculator UI ≠ 删除 firstResult
过程要求
  第二次计算必须使用本次运行产生的 firstResult
  读取失败或不确定时不能正常继续
~~~

#### 正式产物

- SemanticProcedure
- 参数与数据依赖
- supported / unsupported scope
- capability decisions
- 待 S10 工程化事项

### 5. 怎样判断是否做对

- firstResult 被分类为 runtime value。
- firstResult 不是 caller parameter，也没有 default=110。
- producer、consumer、transform、freshRun 完整。
- 支持范围没有从单次示范无证据扩大。
- S10 工程缺口明确留下，没有通过改业务语义绕过。

#### 常见错误信号

- parameters.firstResult.default = "110"。
- 只有 producer，没有 B040 consumer。
- 把一次固定案例成功推广成任意表达式。
- 因 API 文档存在就写 runtime validation 已通过。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S9**，如果 S8 Business Steps 正确只是复用规格错。Business Step 已错回 S8；动作取舍已错回 S7。S10—S12 受影响部分重做；正确 S1—S8 不自动重跑。

#### 什么时候可以继续

**现在可以继续了吗？** 只有 S10/S11 不需要重新猜 firstResult 是什么、从哪里来、给谁用、允许哪些变化时，才进入 S10。

---
## S10｜应用操作工程化

### 1. 这一步为什么存在

把 Procedure 需要的“找到、点击、读取、清空、等待、验证、停止”落实成可靠 Calculator 应用规则。

### 2. 开始前已经有什么

~~~text
S9 SemanticProcedure
+ 现有 AppProfile / helper
+ 具体工程缺口
+ 当前应用与 Runtime 能力证据

业务关系已经确定
  firstResult 必须来自结果区
  第二次输入必须消费 firstResult
~~~

### 3. Calculator 中实际做什么

本阶段负责定位规则、结果读取规则、clear 状态准备规则、wait/ready、verifier、unknown effect 停止规则，以及适用范围和失效条件。

本阶段不把 firstResult 改成 110，不用 Expected fallback，不重新决定业务步骤，不发明不存在的 Runtime API。

#### 本例

当前仓库的 Calculator 参考实现提供一个与本阶段规则一致的实现参考：

~~~text
定位规则（Locator）
  app.bundleId = com.apple.calculator
  当前窗口用 id / pid / handle 保持同一身份
  每次动作前重新检查 within-run geometry
  按钮用 Accessibility role=button + name
  同名候选必须唯一、enabled，并支持 invoke

读取规则（Read）
  结果目标 role=staticText, name=主显示器
  读取 raw value
  只在结果边界把 decimal string 解析为 runtime value
  禁止 Expected / history / JS arithmetic fallback

清空规则（Clear）
  先区分本地化目标“清除”和“全部清除”及当前可用状态
  本次需要独立计算时，已审阅的当前版本诊断支持显式“全部清除”
  动作后实际读取并确认可见 0；还需核对这条操作规则的版本和适用范围
  只清 Calculator UI state，不删除 taskData.firstResult

等待 / 验证规则（Wait / Verify）
  通过当前可观察窗口/Accessibility 状态验证
  不以固定 sleep 代替 ready 证据

Unknown effect
  原生动作未明确 acknowledged 时停止
  不盲重放同一按钮
~~~

这些规则受当前 Calculator 结构、locale、layout 和 Runtime 能力限制；未覆盖环境不能自动算支持。

本案例已经确认一个关键反例：**“清除后显示 0”本身不足以证明上一段计算状态已经被彻底清除。** 因此 S10 的正确规则必须显式区分 Calculator 的“清除”和“全部清除”等状态语义，并通过真实后置观察确认新的计算起点。具体历史环境、运行路径和证据属于质量记录，不放在本阶段主参考答案里。

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，业务规则已落实成程序如何可靠定位、读取、等待、清空、验证和停止；只有真实缺口才需要更低层实现。

#### Calculator 本例的结果

~~~text
按钮规则
  唯一定位当前 Calculator 中需要的按钮
结果读取规则
  只读当前结果区
  禁止 Expected fallback
clear 规则
  清空 UI，不触碰 firstResult
等待 / 验证
  明确动作后等待与重新观察
恢复 / 停止
  身份歧义、读取失败、副作用 unknown 时安全处理
同时记录
  适用范围、失效条件、局部验证证据、Runtime gap
~~~

#### 正式产物

- 加固或修复后的 AppProfile
- 必要 helper / locator / stability rules
- 局部验证证据
- 精确 Runtime 能力缺口

### 5. 怎样判断是否做对

- Locator 能区分 0/1/多个候选。
- Read 返回 actual raw display，不提供 110 fallback。
- Clear 后置状态由真实 observation 验证。
- unknown effect 不盲重放。
- 规则没有改变 S9 的业务数据关系。

#### 常见错误信号

- 读取失败时返回 "110"。
- 点击超时后换 backend 再点一次。
- 无证据把窗口均分成按钮矩阵并当已确认定位。
- 把“文档里有 API”写成“现场已验证 API 可用”。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S10**，如果是 locator/read/wait/action/verifier 问题。新证据推翻业务对象或语义时返回 S2/S8/S9。依赖变化规则的 S11 Candidate 与 S12 Qualification 重验；未受影响的 S1—S9 不自动重做。

#### 什么时候可以继续

**现在可以继续了吗？** 只有 S11 所需关键应用操作都有可靠执行依据，或者已明确阻塞在真实 Runtime 能力缺口时，才可生成或冻结 Candidate。

---
## S11｜生成并冻结 JavaScript 候选程序

### 1. 这一步为什么存在

把已确认业务过程和应用规则忠实实现成普通 JavaScript，并冻结明确的候选程序（Candidate）供 S12 独立验收。

### 2. 开始前已经有什么

~~~text
固定 SemanticProcedure
+ AppProfile / helper / operation rules
+ 正式 API contract
+ 支持范围
+ 现有代码基线（如有）

关键规格
  B025 read → firstResult
  firstResult → characters → B040 second input
  B050 read → finalResult
  finalResult → print + return
~~~

### 3. Calculator 中实际做什么

本阶段忠实实现规格，使用真实 runtime value，检查异步顺序、错误、等待和停止，固定源码字节/hash、入口、依赖、source mapping 和 scope。

本阶段不靠代码修正错误 S8/S9，不用 Expected 常量绕过读取，不为工程化强制增加无收益抽象，不自己给自己 Qualification。

#### 本例

正确核心数据流：

~~~js
const firstRaw = await readDisplay(base, bounds, 'B3-first-result');
const firstResult = decimalDigits(firstRaw, 'B3-first-result');

await clearAndCheck(base, bounds, 'B4-clear');

const secondButtons = ['6', '×', ...firstResult.split(''), '='];
for (const name of secondButtons) {
  await press(base, bounds, name, 'B5-' + name);
}

const finalRaw = await readDisplay(base, bounds, 'B6-final-result');
const finalResult = decimalDigits(finalRaw, 'B6-final-result');

console.log(finalResult);
return finalResult;
~~~

错误版本：

~~~js
const firstResult = await readCalculatorResult(win);

await clickCalculatorButtons(
  win,
  ['6', '×', '1', '1', '0', '='],
);
~~~

错误版本虽然出现 firstResult 变量，但真实消费者没有使用它。

当前仓库可检查候选参考：

~~~text
path = examples/agent-to-recipe/calculator.js
candidate binding = S12 必须执行与该 Candidate 相同的 exact bytes
~~~

具体 Git blob、历史 SHA-256 与证据边界只作为阅读辅助，见附录 B。

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，业务过程已变成一份固定、可独立运行和验收的 JavaScript Candidate；S12 验的是同一份确定字节。

#### Calculator 本例的结果

~~~text
Recipe.js 必须做到
  按钮输入 25 × 4 + 10 =
  真实读取并保存 firstResult
  清空 Calculator UI，但保留 firstResult
  按钮输入 6 × firstResult =
  实际消费 firstResult 全部字符
  真实读取 finalResult
  print + return finalResult
禁止
  把 "110" 写死成生产 firstResult
Candidate 冻结
  source bytes / hash / entry / dependencies / API refs
  upstream versions / source mapping / supported scope
~~~

#### 正式产物

- Recipe.js
- CandidateManifest
- source mapping
- 依赖与运行说明
- 必要重验范围

### 5. 怎样判断是否做对

- 代码真实读取 firstResult。
- 第二次按钮序列由 firstResult 字符展开生成。
- 没有 110/660 production fallback。
- finalResult 真实读取后再 print/return。
- Candidate identity、入口、依赖和 scope 已冻结。

#### 常见错误信号

- 代码里有 firstResult 字符串，但第二次输入仍硬编码 1,1,0。
- 用 String(25 * 4 + 10) 代替 UI 读取。
- 直接 return "660"。
- Candidate 修改后仍沿用旧 hash/旧 Qualification。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S11**，如果 Procedure/operation rules 正确只是实现错误。业务语义错误回 S8/S9，应用规则错误回 S10。修复后冻结新 Candidate，S12 重验受影响范围；上游正确且未受影响的 S1—S10 不自动重跑。

#### 什么时候可以继续

**现在可以继续了吗？** 只有 exact Candidate 已冻结，而且能明确证明代码结构忠实消费 runtime firstResult 与 runtime finalResult 时，才进入 S12。

---
## S12｜独立资格验收

### 1. 这一步为什么存在

对**同一份冻结 Candidate**独立资格验收，回答：哪个候选程序，在什么环境、场景、范围，被怎样运行和观察以后，证明了什么？

### 2. 开始前已经有什么

~~~text
Candidate identity
  exact bytes / hash
  entry
  dependencies

TaskContract
  fixed version

requested scope
  运行前固定

scenario
  运行前固定

environment
  当前 macOS / Calculator / locale / build

Oracle
  Expected firstResult = "110"
  Expected finalResult = "660"

authorization
  测试允许的真实动作范围
~~~

### 3. Calculator 中实际做什么

本阶段固定验收对象、requested scope、scenario、Oracle，实际运行同一 Candidate，获取新 execution 与独立 observation，核对 producer→consumer 和最终结果，为每项 criterion 标 pass/fail/blocked/not-run，并区分 Fresh Run、可重复、参数化和跨环境证明强度。

本阶段不修改 Candidate、Expected/Oracle，不把没跑的 requested 项移到 excluded，也不用历史日志代替本次 fresh execution。

#### 本例

~~~text
Candidate identity
  path = examples/agent-to-recipe/calculator.js
  hash = 精确绑定的 candidate hash

TaskContract
  25 × 4 + 10
  actual firstResult
  6 × firstResult
  actual finalResult

requested scope
  fixed Calculator case
  当前声明的 environment / locale / layout

scenario
  clean attributable start
  exact Candidate execution
  first actual read
  second input from firstResult characters
  final actual read
  print + return

Oracle
  first Expected = "110"
  final Expected = "660"

actual execution
  每个按钮/读取属于同一 execution

actual observation
  firstResult = 本次真实读取
  secondInput = ["6","×", ...firstResult, "="]
  finalResult = 本次真实读取

evidence
  action receipts
  display reads
  independent observation
  candidate binding

verdict
  每项 criterion = pass / fail / blocked / not-run
~~~

本节只保留 S12 的参考解结构。历史运行记录、未入库的 .runtime 证据和 fresh execution 边界统一见附录 B，不参与正文主线。

### 4. 做完后应该得到什么

#### 人能直接看懂的结果

到这里，已经对同一个冻结 Candidate 做了独立运行和观察，并明确哪些范围真实通过、失败、未运行或被阻塞。

#### Calculator 本例的结果

~~~text
验收对象
  S11 冻结的同一个 Candidate
检查
  第一次计算真实执行
  firstResult 来自本次现场读取
  clear 未破坏 firstResult
  第二次输入真实消费 firstResult 全部字符
  finalResult 来自本次现场读取
  实际 print + return finalResult
Expected
  firstResult = "110"
  finalResult = "660"
Actual
  必须来自 S12 新 execution 和新观察
每项记录
  expected / actual / evidence
  pass / fail / not-run / blocked
  limitation / repair owner
~~~

#### 正式产物

- QualificationRecord
- Recipe Review / Run Summary
- qualified / excluded / not-run / blocked 范围
- 修复请求或晋级结论

### 5. 怎样判断是否做对

- 实际执行字节与冻结 Candidate 一致。
- Oracle 独立于 Candidate 的运行时数据来源。
- 最终 660 不是唯一 criterion；中间 firstResult 消费链也被检查。
- requested 项没跑时保持 not-run/blocked。
- 声明强度与证据强度一致。

#### 常见错误信号

- frozen hash=A，实际执行 hash=B，却仍 PASS。
- 最终 660 正确，但第二次输入写死 110。
- requested 有 variation，只跑 baseline 后把 variation 移出范围。
- 改过代码的第二次运行被当成“同一 Candidate 重复两次”。

### 6. 错了怎么修，什么时候继续

#### 错了怎么修

当前责任阶段是 **S12**，如果问题是 Oracle/scenario/scope/candidate binding/证据设置。如果暴露上游真实缺陷，则返回第一个有证据的责任阶段。未交付时不发布；修复后重验受影响范围；无依赖的正确上游保持有效。

#### 什么时候可以继续

**现在可以继续了吗？** 只有 QualificationRecord 对 requested scope 给出真实、版本绑定、证据充分的结论，并且没有被隐藏的 fail/not-run/blocked，才允许进入最终交付边界。

---

## 最终交付边界

这是 S12 之后的外部交付边界。

S12 完成以后，只有下面这些东西一起成立，才具备向外部消费者交付的最低条件：

~~~text
Candidate
+ Qualification
+ support scope
+ limitations
+ entry
+ dependencies
~~~

可交付的外部消费者可以是 Catalog、Runtime、Publisher 或普通业务调用方。

必须保持：

~~~text
Qualification ≠ 自动发布
~~~

交付包至少说明：

~~~text
candidate identity / hash
entry
dependencies
supported scope
unsupported / not-run / blocked scope
known limitations
Qualification reference
runtime inputs / outputs
configuration / secrets（如有）
repair / owner information
~~~

不允许：

- Candidate 有，但没有与其字节绑定的 Qualification。
- Qualification 属于旧 Candidate。
- requested scope 有关键 not-run/blocked，却描述成完整支持。
- 依赖作者私有聊天、私有路径或无法交付证据才能运行。
- 把“已资格验收”直接等同“已发布到 Catalog/Runtime”。

如果交付边界失败：发布资料缺失留在 Delivery / Publish Handoff；Qualification 不足回 S12；Candidate 变化回 S11 冻结新 Candidate 再做 S12；上游业务缺陷按已定位的最早责任阶段返回。

---

## 3. 首错定位矩阵

| 看到的问题 | 先比较什么 | 第一个应检查的阶段 |
| --- | --- | --- |
| 原需求要求真实首值，但合同只写“得到 660” | Source vs TaskContract | S1 |
| 按钮/结果区来自猜测 | Contract vs AppProfile 来源 | S2 |
| 有 planned read，没有真实 read action | Plan vs actual action | S3 |
| 有 read action，但 Expected/receipt 被当 observation | S3 vs S4 | S4 |
| S4=uncertain 仍继续；第二次 clear 被当噪音 | S4 vs S5 | S5 |
| 动作与观察完整，但事实包只留下 final=660 | S3—S5 facts vs Dossier | S6 |
| 真实记录完整，但必要步骤删除首值读取或去重 1,1,0 | Dossier/Trace vs DistilledSteps | S7 |
| 必要步骤正确，Business Step 已把 firstResult 改成 110 | S7 vs S8 | S8 |
| Business Step 正确，Procedure 才出现 firstResult.default=110 | S8 vs S9 | S9 |
| Procedure 正确，读取失败 fallback 到 110 | S9 vs S10 | S10 |
| Procedure 正确，JS 第二式仍硬编码 1,1,0 | S10/Procedure vs Candidate | S11 |
| Candidate 正确，但验错 hash/漏 requested scenario | Candidate/request vs execution | S12 |
| Qualification 正确，但发布包缺 scope/limitations/dependencies | Qualification vs handoff | Delivery |

证据不足时写：

~~~text
root cause not established
last confirmed correct artifact = ...
next comparison = ...
~~~

不要为了强行归责而猜阶段。

---

## 4. 反方测试：故意破坏以后，首错应该落在哪里

这张表用于验证 Calculator 是否真的能反向审计工作流，而不只是“按 S1—S12 重写一次设计”。

| 故意制造的错误 | 首个应失败阶段 | 违反的业务事实 |
| --- | --- | --- |
| 合同只写“最后得到 660”，删除真实读取 firstResult | S1 | R2、R3、R5、R8 |
| 不查已有能力和现场对象，直接猜固定坐标 | S2 | R1、R2、R6 |
| 只有 planned read，没有真实 read action | S3 | R2 |
| API receipt 成功就写 firstResult 已正确 | S4 | R2、R3 |
| firstResult observation 仍 uncertain，却继续第二次输入 | S5 | R3、R5 |
| Dossier 只保存 final=660，丢失 firstResult producer/consumer | S6 | R2、R3、R5 |
| 去噪时删除“读取并保存 firstResult” | S7 | R2、R3、R5 |
| Business Step 把第二次输入改成固定 110 | S8 | R5、R8 |
| Procedure 写 `firstResult.default = "110"` | S9 | R3、R8 |
| 只按一次“清除”，见到显示 0 就认定完整 reset | S10 | R4 |
| JavaScript 读取了 firstResult，但第二次仍硬编码 `1,1,0` | S11 | R5、R8 |
| 冻结 Candidate A，却实际运行 Candidate B 后给 A PASS | S12 | R1—R8 的资格证明链 |

如果这张表中的某个反例无法被当前阶段边界准确捕获，优先检查对应 canonical design / Skill，而不是把反例从案例中删掉。

---

## 5. 最小返工规则

~~~text
S1 变化
  → 重新判断依赖旧合同的下游

S2 变化
  → 只重验依赖该应用认识的执行/工程/候选/资格

S3/S4/S5 事实补采
  → S6 重新收口
  → S7 及依赖它的下游重做

S6 只做汇总修正
  → S7 及依赖它的下游重做
  → 不重跑已可信实际动作

S7 变化
  → S8—S12 受影响部分

S8 变化
  → S9—S12 受影响部分

S9 变化
  → S10—S12 受影响部分

S10 变化
  → 依赖规则的 S11 / S12

S11 Candidate 字节变化
  → S12

S12 只修验收配置且 Candidate 未变
  → 只重验 S12 受影响范围

Delivery 资料缺失且 Candidate / Qualification 未变
  → 只补交付边界
~~~

---

## 6. 一页数据链检查表

| 阶段 | Calculator 里必须看见的核心数据 | 最典型错误 | 错了返回 |
| --- | --- | --- | --- |
| S1 | 原始需求、固定输入、runtime values、Expected、授权、成功/失败、Unknown、WorkPlan | Expected 110 冒充 runtime firstResult | S1 |
| S2 | Calculator、当前窗口、按钮区、结果区、clear、Known/Unknown、证据来源 | 猜坐标/任意数字当结果 | S2 |
| S3 | planned step、actual action/target/request/receipt/evidence/sideEffect | 计划冒充 actual | S3 |
| S4 | S3 action、actual observation、Expected、comparison、verdict | receipt 冒充 observation | S4 |
| S5 | classification、decision、next step、planDelta、sideEffect handling | uncertain 仍继续 | S5 |
| S6 | taskStatus、关键动作/观察、firstResult 来源与消费、finalResult 来源、evidence | 只留 final=660 | S6 |
| S7 | 原始记录 → 保留/删除/合并 → 必要步骤 | 删首值读取/去重 1,1,0/删第二次 clear | S7 |
| S8 | D030→B025→firstResult；D050→B040 | B040 input=110 | S8 |
| S9 | firstResult=runtime value；producer→transform→consumer；scope | firstResult.default=110 | S9 |
| S10 | locator/read/clear/wait/stop 规则 | read fallback=110/unknown effect 重放 | S10 |
| S11 | exact JS 真正消费 runtime firstResult | 读了 firstResult 但仍硬编码 110 | S11 |
| S12 | exact Candidate、scope、scenario、Oracle、execution、observation、evidence | 验错候选/漏 requested 场景 | S12 |
| Delivery | Candidate + Qualification + scope + limitations + entry + dependencies | Qualification=自动发布 | Delivery |

---

## 7. 需要更深检查时去哪里

只读本文已经应该能够完成主链诊断。需要查看正式 owner 或更细方法时，再进入：

| 想检查什么 | 位置 |
| --- | --- |
| Agent 实际怎样从需求一路推进、发现 API、执行并形成 Candidate | [Calculator 执行过程演练](calculator-execution-walkthrough.md) |
| S1—S12 正式阶段定义 | [task-decomposition.md](../design/task-decomposition.md) |
| 工作流进入、恢复、定向返工 | [WORKFLOW.md](../WORKFLOW.md) |
| 相邻边界快速审阅 | [acceptance-map.md](../design/acceptance-map.md) |
| 专业职责与 handoff | [chain-design.md](../design/chain-design.md) |
| 验证层、Hard Fail、评分 | [validation-plan.md](../design/validation-plan.md) |
| S2 / S10 Calculator 方法示例 | [application-engineer 示例](../skills/application-engineer/examples/calculator.md) |
| S3—S6 Calculator 方法示例 | [task-demonstrate 示例](../skills/task-demonstrate/examples/calculator.md) |
| S7 Calculator 方法示例 | [trace-distill 示例](../skills/trace-distill/examples/calculator.md) |
| S8 / S9 Calculator 方法示例 | [procedure-synthesize 示例](../skills/procedure-synthesize/examples/calculator.md) |
| S11 Calculator 方法示例 | [recipe-build 示例](../skills/recipe-build/examples/calculator.md) |
| S12 Calculator 方法示例 | [recipe-qualify 示例](../skills/recipe-qualify/examples/calculator.md) |
| 当前固定案例实现参考 | [calculator-fresh-20260927.js](../../../examples/agent-to-recipe/calculator.js) |
| 本文档静态复核记录 | [Calculator 反方审计记录](../../../docs/quality/agent-to-recipe/calculator-reverse-audit-20260930.md) |

---

## 8. 本案例什么时候才算真正达标

一个没有旧聊天上下文的新读者，应当能够只读本文回答：

1. 原始业务要求是什么？
2. Expected 110/660 与 runtime firstResult / finalResult 怎样分离？
3. 25 × 4 + 10 → firstResult → clear → 6 × firstResult → finalResult 的业务数据链怎样贯穿 S1—S12？
4. S1—S12 每一阶段分别收到什么、做什么、产出什么？
5. planned read、actual read、actual observation、continue/stop、Dossier 分别在哪个阶段判断？
6. S8 的业务步骤与 S9 的可复用规格怎样区分？
7. 第二次 clear 怎样既清空 Calculator UI，又保留任务数据 firstResult？
8. Candidate 怎样真实消费 runtime firstResult，而不是只出现 firstResult 变量名？
9. Qualification 怎样绑定同一 Candidate、requested scope、actual execution 与 observation？
10. 某一步首次出错时，怎样定位第一责任阶段并只重做受影响下游？
11. S12 之后的 Delivery / Publish Handoff 需要额外交付哪些内容？
12. 哪些内容只是静态参考或历史说明，不能冒充本次运行事实？

如果这些问题无法从本文直接回答，这个 Calculator 案例就还没有完成“端到端可检查基准案例”的职责。

---

## 附录 A｜阅读辅助：阶段边界说明

这一附录不属于 Calculator 主解决方案。它只在需要解释**为什么相邻阶段必须分别归责**时使用；首错判断本身仍应优先看各阶段参考卡和“首错定位矩阵”。

### A.1 S3、S4、S5、S6 为什么分别判断

| 阶段 | 业务上只回答什么 | Calculator 中的首错例子 |
| --- | --- | --- |
| S3｜执行 | **动作真正发生了吗？** | 只有“计划读取 firstResult”，没有实际 read action |
| S4｜观察 / 验证 | **动作后真实对象是什么状态？** | read action 存在，但把 Expected 110 或工具 receipt 当成 actual observation |
| S5｜分类 / 决策 | **基于真实状态应该继续、修订、恢复还是停止？** | S4 仍 uncertain，却继续输入第二次计算 |
| S6｜任务收口 | **整次示范事实包是否完整保留关键数据链？** | S3—S5 都正确，但 Dossier 丢失 firstResult 的来源或消费者 |

同一个 task-demonstrate Skill 可以连续承担 S3—S6，但 Skill 边界不替代阶段边界。判断首错时，仍以“第一份输入正确、输出首次错误的阶段”为责任点。

### A.2 S8、S9 为什么分别判断

| 阶段 | 业务上只回答什么 | Calculator 中的首错例子 |
| --- | --- | --- |
| S8｜业务语义 | **必要步骤在业务上是什么意思，输入输出是什么？** | DistilledSteps 仍要求消费 firstResult，但 Business Step 已写成 input = 110 |
| S9｜复用规格 | **哪些是运行时值、参数、配置、分支和支持范围？** | S8 仍正确消费 firstResult，但 SemanticProcedure 才出现 firstResult.default = 110 |

因此：

~~~text
S8 正确
  B025 → firstResult → B040

S9 正确
  firstResult = runtime value
  producer = B025
  consumer = B040
  default = none
~~~

### A.3 阶段、Skill 与交付边界

- 阶段用于独立验收和首错定位。
- Skill 是承担专业方法的责任包，一个 Skill 可以覆盖多个阶段。
- Delivery / Publish Handoff 位于 S12 之后，是外部交付边界，不新增正式阶段。

---

## 附录 B｜阅读辅助：静态参考、历史记录与证据边界

这一附录只用于防止把“可读参考”误写成“本次真实运行证据”。它不改变 Calculator 的业务主解。

### B.1 三类参考材料

| 材料 | 用途 | 不能证明什么 |
| --- | --- | --- |
| 原始需求与 Expected 110/660 | 定义业务目标与验收 Oracle | 不能产生 runtime actual value |
| A001—A010、D010—D060 等教学 fixture | 解释数据怎样穿过阶段；编号只是追溯索引 | 不是新的真实桌面执行证据 |
| 2026-09-27 历史真实运行记录 | 说明曾有 Calculator execution、读值与候选资格记录 | 不能冒充当前 fresh execution；未入库原始证据不能在 fresh checkout 中独立复核 |

### B.2 实现不能反推历史观察

当前仓库案例实现可使用 macOS Accessibility 等工程机制作为参考，但最终 JavaScript、按钮表或读取实现不能反推 S2 当时一定观察到了什么，也不能反推 S3—S6 当时一定真实执行过什么。

### B.3 Candidate 身份说明

当前正文参考实现是：

~~~text
examples/agent-to-recipe/calculator.js
~~~

它用于帮助阅读 S10—S11 的正确实现关系，但**当前文件路径本身不等于当前已经取得新的 Qualification**。Candidate 每次冻结后，S12 仍必须绑定 exact bytes / hash / entry / dependencies 和实际 execution。

历史的 `calculator-fresh-20260927.js`、旧 Git blob、SHA-256 与历史 execution 只作为设计考古或质量记录使用，不再充当正文当前参考 Candidate。这样可以避免已经被新证据否定的旧清空策略继续污染黄金案例。

### B.4 历史运行记录怎样使用

2026-09-27 曾记录两个独立 execution：

~~~text
direct-20260927-025457-988000
direct-20260927-025553-861000
~~~

历史记录中，每次包含 16 个原生按钮回执、first actual read = "110"、final actual read = "660"，并曾用另一 execution 的 AX 读取 / 窗口截图做交叉核对。

这些原始 .runtime 证据没有作为版本控制资产保存在当前 Git 仓库。因此它们只能作为历史说明：不能替代当前需要的 fresh execution，也不能仅凭本文档把 S12 写成新的运行通过。更完整的验证层、Hard Fail 和评分方法继续由 [validation-plan.md](../design/validation-plan.md) 负责。

### B.5 隔离评测使用边界

本文是 Agent-to-Recipe 的端到端可检查参考案例，不是历史日志，也不是第二套工作流规范。正式阶段定义由 [task-decomposition.md](../design/task-decomposition.md) 负责，实际路由由 [WORKFLOW.md](../WORKFLOW.md) 负责，验证方法由 [validation-plan.md](../design/validation-plan.md) 负责。

本文包含 S1—S12 的参考产物。方法维护、教学和 Candidate 冻结后的独立 Evaluator 可以使用；验证“新 Producer 能否从原始需求独立推导 Candidate”时，S1—S11 不得加载本文、配套 Walkthrough、Skill 的 Calculator examples 或参考 JavaScript。Candidate 冻结后，Evaluator 才能打开这些参考材料做最终校准，且不能把参考答案回传 Producer 作为修复实现。

阅读分工：本文负责逐阶段检查；如果要看 Agent 实际怎样求解，读 [Calculator 执行过程演练](calculator-execution-walkthrough.md)；如果要找阶段产物文件，读 [Calculator 阶段产物链](calculator-artifacts.md)。
