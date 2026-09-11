---
title: "Human-to-Recipe 金标方法论"
description: "先从真实金标恢复解题思路，再把可复用决定归纳成规则，并用新录制前向检验这些规则。"
order: 25
---

# Human-to-Recipe 金标方法论

这份文档首先写给需要把一段录制变成可靠自动化的人，其次才写给 validator 和 scorer 的维护者。

如果只记住一句话，请记住：

> 录制告诉我们“人做过什么”，金标计划解释“为什么这样设计”，金标 Recipe 展示“设计最后长什么样”；
> 方法论要保存的是三者之间的推理，而不是某一份 JavaScript 的写法。

因此，正确链路不是 `actions → 改得更漂亮的 JS`，而是：

```text
actions + 金标 SemanticBuildPlan + 金标 Recipe
                    ↓
         恢复每一个关键设计决定
                    ↓
       归纳适用条件、证据和禁用边界
                    ↓
              写回 Skill
                    ↓
        新录制 → 新计划 → 新 Recipe
                    ↓
        比较差距，把失败原因回灌
```

这就是“金标驱动的策略蒸馏闭环”。下面先完整走一遍 Calculator 金标，再讨论通用规则。

## 1. Calculator 金标到底教会了我们什么

### 1.1 先像人一样读录制

Calculator 金标的 actions 一共有 12 个动作。忽略坐标和事件 ID 后，人看到的是：

```text
清除，2，5，×，4，=，+，2，0，−，5，=
```

这串动作能直接证明：

- 用户在 Calculator 的同一个窗口中按过这些按钮；
- 按钮顺序是固定的；
- Accessibility 在录制时认出了按钮名称；
- 当时窗口尺寸是 232×321。

它不能单独证明：

- 用户是不是想长期自动化“25 × 4 + 20 − 5”；
- 最终值 115 是否就是业务成功条件；
- 第一个清除动作是业务步骤，还是为了建立稳定起点；
- 换一个窗口尺寸后原坐标是否仍然安全；
- 可以不可以操作另一个 Calculator 窗口；
- Recipe 是否应该自己判断最终结果。

这是蒸馏的第一个关键认识：**动作事实不等于业务意图。**

金标之所以能继续，不是因为按钮看起来足够明显，而是因为计划另外记录了用户确认的目标：
“在系统 Calculator 中计算 25 × 4 + 20 − 5”，成功条件是“最终显示 115”，允许的副作用也只限于
唯一合格的 Calculator 窗口。

### 1.2 把 12 个点击重新解释成 4 个决定

机械回放会把 12 个点击写成 12 行。金标没有这样组织代码，而是先回答每一段动作在业务里承担什么责任。

| 录制片段 | 人类解释 | 在计划中的身份 | 在 Recipe 中的形态 |
| --- | --- | --- | --- |
| 清除 | 让未知初始状态回到可重复起点 | runtime guard / recovery | `allClear()` |
| 2、5、×、4、= | 得到第一个中间结果 100 | 业务 Episode：计算 25×4 | 一次 `pressKeys(...)` |
| +、2、0 | 在当前结果上建立 +20 | 业务 Episode：加 20 | 一次 `pressKeys(...)` |
| −、5、= | 得到最终结果 115 | 业务 Episode：减 5 | 一次 `pressKeys(...)` |

这里最重要的不是函数被缩短了，而是“清除”和“算式”被分开了：

- 清除不是用户最终想完成的业务，它是为了让后续步骤可重复；
- 三段算式各自产生一个能用业务语言说明的状态变化；
- Episode 的边界来自业务目的，不来自“每五个 action 分一组”之类的格式规则。

这就是 **Design Recovery（设计逆向）**：从 actions、计划和最终代码之间的差异，恢复设计者当时解决了什么问题。

### 1.3 为什么 actions 没有启动应用，Recipe 却主动 launch

录制从 Calculator 已经打开、已经位于前台的状态开始。这个状态只是录制发生时的环境，不是未来每次执行都能依赖的前提。

金标 Recipe 因而先做了几件 actions 中没有的事：确认运行在 macOS，按 bundle ID 启动或激活 Calculator，等待窗口 ready，
再从窗口列表中确认只有一个匹配可执行路径和标题的目标。计划允许这样做，是因为用户已经授权“启动或激活系统 Calculator”。

这里恢复出的不是“所有 Recipe 都先调用 App.launch”，而是：

> 录制时已经成立、但生产运行不能假定成立的前置条件，需要由 Recipe 主动建立或由 guard 明确拒绝；新增的准备动作
> 必须来自业务所需前置条件和已授权副作用，不能因为 actions 没录到就偷偷补上。

如果任务要求继续使用一个已有会话、启动应用会丢失上下文，或用户没有授权启动，那么同样的 launch 反而是错误的。

### 1.4 为什么录制只按一次清除，Recipe 却按两次

这是 Calculator 金标里最值得蒸馏的决定。

Calculator 的同一个按钮可能处在 `C` 或 `AC` 状态。录制时的一次点击只能证明当时成功清除了界面，
不能证明未来执行时按钮仍处在相同状态。金标引入了一个应用规则：

- 第一次点击把可能的 `C` 变成 `AC`，或者直接完成清除；
- 第二次点击确保落在同一个 all-clear 起点；
- 最多两次，不无限重试；
- 只操作已经确认的同一个 clear 控件；
- 这个变化需要独立资格验证，而不能仅凭“更稳”三个字加入。

因此，多出来的一次点击不是从录制里“抄”出来的，也不是随意优化。它是由已知应用状态机、有限重试边界和
资格证据共同支持的恢复策略。

可复用经验不是“清除总要点两次”，而是：

> 当同一个幂等控件存在少量已知初始状态，并且每次操作都把状态收敛到同一个安全起点时，可以把一次示范
> 提升为有上限的恢复动作；如果动作有破坏性、状态未知或不能证明收敛，就不能这样做。

这一步就是 **Decision-Rule Induction（决策规则归纳）**。

### 1.5 为什么不用录制时的屏幕绝对坐标

录制里的按钮位置是屏幕坐标。直接保存这些数值意味着只要窗口移动，Recipe 就可能点到别的应用。

金标做了三层转换：

1. 先用可执行路径、标题和唯一匹配确认“这是哪个窗口”；
2. 再要求窗口仍是经过资格验证的 232×321 布局；
3. 最后把按钮保存为窗口内偏移，并在每次点击前从当前窗口位置重新投影。

它还在每次点击前重新确认目标窗口仍然处于前台，并拒绝投影到窗口边界之外的点。

所以真正被蒸馏的经验也不是 Calculator 的九组偏移值，而是：

> 先确认对象，再确认布局，再把相对位置投影到当前对象；任何一步不成立都停止，不能静默退回原始屏幕坐标。

Calculator 的具体偏移只是应用数据。这条判断顺序才是可复用方法。

### 1.6 Recipe 可以确认“做完了”，但不能给自己颁发资格证

当前 Calculator 金标在最后一步后读取显示值，并等待它成为 `115`，确认后才报告任务完成。这个读取不是资格验证，
而是生产过程中的完成自检：如果界面没有进入计划要求的最终状态，Recipe 就不应继续声称业务动作已经完成。

独立 Qualification Gate 仍然要读取冻结 production 的实际字节，执行同一份代码，并独立观察中间状态和最终结果。
Recipe 自己看到 `115`，只能说明它本次控制流程满足了完成条件；不能因此把 `liveVerified`、`qualified` 或视觉验证写成
`passed`，也不能由 Recipe 自己保存资格证据、覆盖测试矩阵或给自己打分。

这条边界可以用一句人话记住：

> Recipe 负责做事，并在必要时确认自己能否安全地继续或结束；Qualification Gate 负责独立证明结果；Evidence 负责保存证明。
> 三者可以观察同一个业务状态，但不能用同一次自我观察冒充独立资格验证，也不能各自复制一套业务动作。

因此，生产自检只有同时满足下面条件才成立：

- SemanticBuildPlan 明确声明要观察什么、为何影响控制流程，以及允许使用的 primitive；
- 观察失败只会阻止或安全结束 Recipe，不会触发未授权补救动作；
- Recipe 不把自检结果写成 qualification、live 或 visual 结论；
- Gate 仍以冻结 production 的 path/hash 为对象独立执行和取证。

### 1.7 用一张账本看完整推理

设计逆向时，至少应能写出下面这样的账本。读者不需要先懂 schema，也能理解每个变化为什么发生。

| actions 中的事实 | 设计问题 | 金标决定 | 可复用到什么范围 | 不能怎样照搬 |
| --- | --- | --- | --- | --- |
| 录制开始时 Calculator 已在前台 | 下次运行怎样建立同一前提 | 在授权范围内 launch/activate、等待 ready，再确认目标 | 生产运行不能假定录制环境仍存在的任务 | 不能在未授权时启动应用，也不能破坏必须保留的已有会话 |
| 12 次点击都落在同一 Calculator 窗口 | 怎样避免点错窗口 | 用应用路径、标题和唯一窗口共同确认目标 | 所有会产生桌面副作用的流程 | 不能只取“第一个标题相同的窗口” |
| 第一个动作是“全部清除” | 它是业务还是准备动作 | 归为起点恢复，不计入算式 Episode | 有明确安全起点的状态机 | 不能把任何开场点击都称为 guard |
| clear 存在 C/AC 两种状态 | 一次示范是否足够 | 同一控件最多两次，使状态收敛 | 已知、幂等、有限状态的恢复 | 不能用于发送、删除、付款等副作用 |
| 后续按钮形成三段算式 | 怎样从点击得到业务结构 | 按中间结果和目的组成三个 Episode | 能说明前后状态的连续动作 | 不能按 action 数量机械分段 |
| 按钮有录制时坐标 | 窗口移动后怎样安全操作 | 保存窗口相对点，先检查身份和布局 | 固定布局且已资格验证的 UI | 不能静默回退到屏幕绝对坐标 |
| 最终目标是 115 | 谁来证明任务成功 | 独立 Gate 读取显示结果 | 有独立可观察结果表面的任务 | 不能把“API 没报错”当业务成功 |

如果一个所谓方法论只能列出 BUTTON 常量、函数名和 API 调用，却写不出这张账本，它仍然只是代码摘要。

## 2. 从一个金标归纳规则，而不是模仿代码

### 2.1 先区分四种信息

每个结论都先问“它从哪里来”：

- **录制事实**：用户确实点击了什么、顺序是什么、录制时看到了哪个对象；
- **用户规则**：用户明确确认的业务目标、成功条件和副作用授权；
- **应用规则**：只对某个应用、版本、布局或状态机成立的知识；
- **通用方法**：换一个任务后，仍能用相同证据和判断过程得到的规则。

例如：

- “按过数字 2”是录制事实；
- “目标是计算 115”是用户规则；
- “C/AC 可以用最多两次 clear 收敛”是 Calculator 应用规则；
- “有副作用的恢复必须有上限”则由更一般的安全合同支持，可以成为通用规则。

把应用规则误写成通用方法，是金标蒸馏最常见的过拟合。

### 2.2 每条经验都要能回答七个问题

从金标看到一个好设计时，不要只写“应该加 guard”。应继续问：

1. 什么证据让我们做出这个决定？
2. 它解决了什么具体风险？
3. 哪些任务或状态下适用？
4. 做决定前必须拿到哪些输入？
5. 哪些相似场景反而禁止使用？
6. 证据不足时是降级、询问，还是停止？
7. 怎样证明实现没有偏离这条经验？

后面的 GM-01～GM-12 都按这七个问题记录。这样，经验才可以被另一个 Agent 执行，而不是只让作者自己看懂。

### 2.3 模式要经过多个样本，不能看到一次就晋级

单个 Calculator 样本最多能发现候选模式。它不能独自证明“所有桌面应用都应该这样做”。

| 层级 | 人类含义 | 可以怎样使用 |
| --- | --- | --- |
| P0：观察 | 在一个样本里看到了重复形状 | 记录下来，不能改变其他任务 |
| P1：应用内规则 | 同一应用有额外证据和明确反例 | 只在已声明的应用和环境使用 |
| P2：可复用规则 | 至少两个独立任务支持，或另有明确 API/安全合同 | 可以写入通用方法 |
| P3：已资格规则 | P2 规则又通过冻结代码的独立 live Gate | 只能在已验证范围内声明 qualified |

例如“双 clear”目前是 Calculator 应用规则；“有副作用的恢复必须有上限”则由更一般的安全合同支持，可以成为通用规则。
类似地，Recipe 中每次点击后的固定短等待只是在当前 Calculator 资格范围内成立的执行参数，不能从一个样本提升成
“桌面点击后总要 sleep”的通用模式。

## 3. 拿第二份录制做前向检验

方法论有没有用，不看它写得多完整，而看它面对陌生录制时能否做出正确决定。

当前录制 `rec-20260909T182158.370718000Z-27868797ab72` 有 16 个动作。仅按可观察控件名称，可以读成：

```text
Calculator：清除，2，5，×，4，=，+，3，0，=，−，5，=
随后：一次显示区域点击，一次 WeChat 窗口点击，输入文本 “125”
```

它很容易诱导出一个听起来合理的故事：“计算 25×4+30−5 得到 125，然后把 125 发到微信”。

但 actions 并没有证明：

- 用户是要发送消息，还是只把 125 留在输入框；
- 应该进入哪个联系人或群聊；
- 点击显示区域是否承担复制、聚焦或别的作用；
- 成功条件只看 Calculator 的 125，还是还要检查 WeChat 草稿/消息；
- 输入和发送分别是否获得副作用授权。

所以这一轮正确结果不是“尽快生成一个像金标的 JS”，而是交付一个可复核的 blocked plan，并把需要用户确认的问题说清楚：

1. 业务目标是否包含从 Calculator 取得 125，并把它输入 WeChat？
2. WeChat 的目标会话是什么，如何唯一识别？
3. 只允许输入草稿，还是也允许发送？
4. 成功 Oracle 是 Calculator 显示 125、WeChat 输入框等于 125，还是消息已经发送？
5. 显示区域点击和窗口点击分别是必要业务动作、定位动作，还是可删除的录制噪声？

这说明方法论开始发挥作用：它没有因为序列“看起来很明显”就越权补全业务。当前 75 分不是生成质量目标，
而是一个诚实的静态基线；补齐上面事实后，才能继续比较新计划和新 Recipe 与 Calculator 金标的结构差距。

## 4. 真正的蒸馏闭环怎样运行

### 第 1 轮：从金标恢复解题过程

同时阅读 actions、SemanticBuildPlan 和冻结 Recipe。先写人类可读的设计账本：

- 原始动作可以直接说明什么；
- 哪些业务信息来自用户确认；
- 每段动作解决什么业务问题；
- 金标相对机械回放增加、删除、合并或改写了什么；
- 每项变化依赖什么证据，又有哪些反例。

这一轮不修改 schema，也不先设计评分项。目标是把“为什么”讲明白。

### 第 2 轮：把经验写回方法和 Skill

只有能跨样本复用的判断进入本方法。只对 Calculator 成立的知识留在样本计划或应用知识里。

Skill 不复制整套规则，只负责保证执行顺序：

1. 先读方法；
2. 先写语义草图；
3. 再形成结构化 plan；
4. plan 通过后才生成 Recipe；
5. 用差距评估回到正确的问题层。

### 第 3 轮：用新 actions 前向生成

对新录制先写五段语义草图：

1. 一句话业务目标；
2. 人能读懂的动作序列；
3. Episode 及每段的前后状态；
4. 相对机械回放需要做的设计变化；
5. 尚未确认、因而必须阻断 production 的问题。

只有这五段能够由证据支持，才把它们编码进 SemanticBuildPlan。不得直接从 actions 写 production JS。

### 第 4 轮：比较新产物与金标的“决策质量”

比较的重点不是代码行数和变量名，而是：

- 相同类型的动作有没有得到同样严谨的解释；
- 新任务是否遗漏了金标已有的目标确认、对象身份、状态恢复或 Gate 分层；
- 新任务出现的新风险是否被旧方法覆盖；
- Recipe 是否忠实消费 plan，还是生成时又临时猜了一遍。

### 第 5 轮：把失败归还给正确的维护层

| 发现的差距 | 应该修哪里 | 不应该怎样处理 |
| --- | --- | --- |
| Episode 分错、把 guard 当业务 | 方法论或本次 plan 判断 | 不要靠 renderer 改函数名遮掩 |
| 方法已有规则，但 Agent 没读取或没执行 | Skill 路由/工作流 | 不要再复制一份规则 |
| plan 正确，JS 却增加新动作或 fallback | renderer/生成约束 | 不要修改 plan 去迎合坏代码 |
| 来源映射、hash 或字段结构错误 | schema/validator | 不要靠文字说明人工放行 |
| 总分很高但混入 Oracle 或未知副作用 | hard gate/scorer | 不要降低阈值 |
| 业务目标或授权本来就不知道 | 向用户补证并保持 blocker | 不要把缺信息说成模型能力不足 |
| 静态设计合理但真实应用失败 | application rule/qualification | 不要把一次 live 失败泛化为通用规则 |

这个归因步骤决定闭环是否真的学习。否则每次失败都会变成更多工程术语，却没有增加解决问题的能力。

## 5. 十二条可执行的决策规则

这一节是查证索引。第一次阅读应先看前四节，实际处理样本时再按问题回到对应规则。

### GM-01：先冻结真实来源，再解释动作

- **Evidence**：磁盘 actions 字节、hash、revision、raw reference、action ID 与 source event ID。
- **Decision / rationale**：所有解释都绑定同一份来源；basic/candidate JS 只能证明 lineage，不能代替 actions。
- **Applicability**：任何新计划、重新生成或质量复核。
- **Required inputs**：仓库、录制目录、actions 文件及可读取的实际字节。
- **Forbidden cases / counterexamples**：只看 UI 摘要、只比较动作数量、hash 已变化仍沿用旧结论。
- **Confidence / unknown policy**：来源无法核对就停止，不能用“看起来相同”补置信度。
- **Validation**：修改 actions、删除 raw reference 或伪造 source-event mapping 必须失败。

### GM-02：动作事实、业务解释和执行授权分开取证

- **Evidence**：action 的 kind/args/target，以及用户明确给出的目标、成功条件和副作用边界。
- **Decision / rationale**：动作证明做过什么；用户证据才决定为什么做、是否还应再做。
- **Applicability**：看似明显的按钮序列、跨应用切换、文本输入、提交和删除。
- **Required inputs**：录制事实，加上 business goal、success conditions、side effects 各自的确认状态。
- **Forbidden cases / counterexamples**：从 WeChat 窗口和文本推断收件人或发送意图；从最后一个数字反推 Oracle。
- **Confidence / unknown policy**：缺一项就明确写 unknown，可以继续审计但不能生成 production。
- **Validation**：无 sourceRefs 的肯定措辞不能通过 intent/authorization hard gate。

### GM-03：每个 action 只能有一个主要去向

- **Evidence**：完整 action 顺序、raw event、disposition 和实际 consumer。
- **Decision / rationale**：每项归入 business、runtime-guard、qualification、evidence、excluded 或 unknown，不能遗漏或重复。
- **Applicability**：包括误点、等待、恢复和验证在内的全部录制动作。
- **Required inputs**：每项 action ID、source event ID、处置理由和 consumer。
- **Forbidden cases / counterexamples**：为了高分把不理解的动作标为 excluded；让同一动作同时成为 production 和 Gate 的隐藏实现。
- **Confidence / unknown policy**：无法判断就用 unknown；unknown 会阻断 production。
- **Validation**：删除、复制或改变一项映射的 mutation 必须失败。

### GM-04：按业务状态变化组成 Episode

- **Evidence**：已确认目标、连续 business actions、可说明的前置状态和完成状态。
- **Decision / rationale**：共同完成一个业务目的的动作才合为一段，名称使用用户业务语言。
- **Applicability**：需要把低层点击/输入提升为可维护流程时。
- **Required inputs**：业务目标、动作角色、Episode purpose、precondition、postcondition 和顺序。
- **Forbidden cases / counterexamples**：按固定动作数分组；用 a0001/click1 命名；从一次示范发明循环或参数。
- **Confidence / unknown policy**：不能解释状态变化就不制造 Episode，相关动作保留 unknown。
- **Validation**：business action 恰好被一个 Episode 消费，并保持来源顺序。

### GM-05：业务目标和成功 Oracle 必须分别确认

- **Evidence**：用户确认的目标、独立可观察的成功条件及其 sourceRefs。
- **Decision / rationale**：goal 决定 Recipe 做什么；完成条件可决定 Recipe 何时安全结束；Oracle 决定 Gate 独立证明什么，三者不能互相冒充。
- **Applicability**：所有可能生成 production 的计划。
- **Required inputs**：confirmed goal、至少一个 confirmed success condition、允许和禁止对象。
- **Forbidden cases / counterexamples**：把 API 返回成功、Recipe 的 `[DONE]` 日志、一次生产自检或录制末值直接当成 qualification 证据。
- **Confidence / unknown policy**：任何一项不确定就交付 blocked plan，不生成假 Recipe。
- **Validation**：删除 unknown 或伪造 Oracle 不能使门禁通过。

### GM-06：应用经验不能冒充通用业务规则

- **Evidence**：应用、版本、布局、状态机范围及独立反例。
- **Decision / rationale**：Calculator 的双 clear 和 232×321 都留在 Calculator 范围；只有跨样本证据充分的判断才通用化。
- **Applicability**：定位、等待、窗口生命周期和应用恢复知识。
- **Required inputs**：明确 scope、来源、支持样本和失效边界。
- **Forbidden cases / counterexamples**：从单个 Calculator 推出所有计算器规则；从 TextEdit 推出所有文档应用生命周期。
- **Confidence / unknown policy**：单样本默认只是 candidate/P1，环境未知时缩小范围。
- **Validation**：跨应用反例必须保留，不能为了晋级规则而删除。

### GM-07：先确认对象，再决定定位、坐标和操作方式

- **Evidence**：target identity、locator、geometry、action strategy 及每层来源。
- **Decision / rationale**：按“哪个对象 → 怎样找到 → 怎样投影 → 怎样操作”的顺序决定，替代路线必须显式。
- **Applicability**：窗口、控件、显示器、文本字段和跨应用目标。
- **Required inputs**：identity、坐标空间、当前 API、动作等价性和失效条件。
- **Forbidden cases / counterexamples**：AX → OCR → 坐标 → 键盘静默降级；目标重复时取第一个；用物理 click 无依据替换 invoke。
- **Confidence / unknown policy**：任何依赖层 unavailable/unknown 都阻断该路径。
- **Validation**：检查 API catalog、Geometry、边界拒绝和 `noImplicitFallback`。

### GM-08：guard 和 recovery 必须与副作用风险相称

- **Evidence**：授权范围、前置状态、动作是否幂等、失败分类和最大尝试次数。
- **Decision / rationale**：首个副作用前拒绝错误目标；只对已知且不会扩大副作用的失败做有限恢复。
- **Applicability**：启动、激活、输入、发送、删除、付款以及任何可能重复的动作。
- **Required inputs**：allowed side effects、forbidden objects、action state、max attempts 和恢复后身份检查。
- **Forbidden cases / counterexamples**：无限重试、固定 sleep 掩盖状态缺失、unknown actionState 后重做有副作用动作。
- **Confidence / unknown policy**：不能证明动作尚未发生就不自动重试；改变 primitive/时序必须回到 plan。
- **Validation**：增加未授权动作或重试的 mutation 必须失败。

### GM-09：Recipe 做事，Gate 证明，Evidence 留痕

- **Evidence**：三个独立输出位置、Gate 绑定的 production path/hash、qualification claims 和 API surface。
- **Decision / rationale**：production 实现业务、必要安全控制及计划声明的完成自检；Gate 执行冻结 production 并独立判定；Evidence 保存本次运行事实。
- **Applicability**：计划生成以及现有 Recipe 的静态审阅。
- **Required inputs**：production path/hash 或 not-generated、独立 Gate、Evidence root；若 production 自检结果，还要有计划声明的观察目标、控制用途和 primitive。
- **Forbidden cases / counterexamples**：production 内嵌 qualification 判定或截图矩阵；把生产自检写成 qualified；Gate 复制业务动作；旧 hash 资格转移给新代码。
- **Confidence / unknown policy**：只做静态检查时，live/qualified/visual 始终是 not-run。
- **Validation**：路径、hash、声明 primitive 和 API 分层扫描；未声明观察、qualification-only 取证或自授资格必须失败。

### GM-10：plan 作决定，Recipe 只消费决定

- **Evidence**：已验证 plan、Episode、target/strategy/guard/recovery ID 和输出 hash。
- **Decision / rationale**：生成代码时不重新解释 actions、不补 unknown、不临时增加 fallback。
- **Applicability**：Agent 生成和未来 renderer。
- **Required inputs**：productionReady plan、质量门槛和新的 exclusive-create 路径。
- **Forbidden cases / counterexamples**：actions 直接变 JS；手改 Recipe 后只换 hash；覆盖旧版本。
- **Confidence / unknown policy**：renderer 未实现时可以由 Agent 生成，但不能绕过同一计划。
- **Validation**：固定执行 plan validator → scorer → generator；新产物必须重新核对 hash。

### GM-11：置信度只决定怎样补证，不能替代门禁

- **Evidence**：证据层级、冲突、unknown reason、target 状态和验证层状态。
- **Decision / rationale**：置信度帮助选择下一个验证动作，不按比例授权副作用。
- **Applicability**：OCR/视觉候选、单样本解释、跨版本 locator 和模型输出。
- **Required inputs**：来源类型、范围、冲突和下一种可获得证据。
- **Forbidden cases / counterexamples**：模型自报 0.99 就生成；多个相同模型回答当独立证据；总分抵消 hard gate。
- **Confidence / unknown policy**：证据不足就降为 candidate/unknown。
- **Validation**：所有得分都必须指向结构化 path/observed evidence，形容词不能加分。

### GM-12：用新样本和反例持续修正规则

- **Evidence**：冻结正例、结构负例、业务直觉反例、当前未知录制以及 mutation/metamorphic 结果。
- **Decision / rationale**：规则必须同时让好样本通过、坏样本失败、无关表示变化保持稳定。
- **Applicability**：方法、Skill、schema、validator、scorer 或 renderer 的任何修改。
- **Required inputs**：每个样本预期的 gate、score、dimension 和被改变的真实结构。
- **Forbidden cases / counterexamples**：只匹配文档标题；只拟合 Calculator；把当前 unknown 录制硬改成第二个正例。
- **Confidence / unknown policy**：缺少第二应用时明确校准范围，不用测试数量冒充样本独立性。
- **Validation**：删字段、伪造映射、unknown、Oracle 混层、坐标 fallback、非法 API 与 key-order/空白变形矩阵。

## 6. 工程门禁是护栏，不是方法论主体

方法论先解释怎样得到好决定；工程检查再阻止决定在编码时丢失。

### Hard gates

候选只要出现下面任一问题，就不能因为总分高而进入 production：

1. schema 或来源字节不完整；
2. action 没有唯一 disposition/source mapping；
3. business goal 或 success condition 未确认；
4. 副作用没有授权；
5. action、target 或 locator 仍存在会进入 production 的 unknown；
6. production、Gate、Evidence 职责混在一起；
7. 使用未登记、退役或不属于该层的 Runtime primitive；
8. 生成物 path/hash 与计划不一致。

### 100 分只是差距仪表

| 维度 | 满分 | 最低分 |
| --- | ---: | ---: |
| 语义忠实与业务抽象 | 25 | 24 |
| 来源追踪 | 20 | 19 |
| Episode 与代码结构 | 15 | 14 |
| target/guard/recovery 鲁棒性 | 20 | 19 |
| Oracle/Gate/Evidence 分层 | 15 | 14 |
| 可维护性 | 5 | 4 |

通过条件是 hard gates 全过、总分至少 95、每个关键维度也达到最低分。95 分意味着只允许非关键表达或维护细节
留下少量空间，不能在对象、授权、业务语义或 Oracle 上“基本正确”。

每个得分必须来自结构化 evidence。评分器只能告诉我们差距出现在哪里，不能替我们发明业务意图。

## 7. 每次迭代结束时，应该能回答这些问题

- 我能否不用 action ID 和 schema 字段，向人解释这项自动化究竟完成什么？
- 每段动作为什么存在，开始前是什么状态，完成后又是什么状态？
- 相比机械回放，哪些动作被合并、增加、删除或改写？每项变化的证据是什么？
- 哪些知识只属于当前应用，哪些规则真的可以带到下一个任务？
- 哪些猜测被明确留成 unknown，而没有藏进函数名或注释？
- Recipe、runtime guard、Qualification Gate 和 Evidence 是否各自只承担一种职责？
- 如果新 Recipe 不如金标，我能否指出应修改方法、Skill、plan、renderer、scorer 还是输入事实？
- 本轮没有运行的 synthetic/live/qualified/visual 层是否诚实标为 not-run？

只有这些问题能由人读懂并逐项复核，金标才真正被蒸馏成了方法，而不只是一份通过机器检查的工程合同。
