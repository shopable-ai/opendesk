# Agent 驱动的示范到自动化执行方法

## 阅读入口与路线适用边界

先看[框架总导航](../../frameworks/README.md)；面对具体业务任务，先用[自动化任务求解方法](../../frameworks/automation-problem-solving-framework.md)选择模式、拆分步骤和明确交接。本页继续维护完整示范生命周期、工件关系、工程化门槛和第 10 节千牛案例，保留当前路径，不复制为第二份框架正文。

| 路线 | 怎样使用本页 |
| --- | --- |
| 普通 Recipe／应用 helper | 复用任务合同、可信执行、业务分段、参数化、定位和验证方法；用普通 JavaScript 函数及必要结果表达，不要求先建设 IR、Compiler、Recorder 或独立 Workflow Runtime |
| 明确选择的 Recorder／编译专项 | 使用下述完整工件链、Canonical IR、Compiler、Replay 和资格验证要求；不能跳过该路线必要的验证门槛 |

下文“IR 是权威源”“JavaScript 是派生产物”只约束已选择的 Recorder／编译路线，不否定人工维护 Recipe 的源码地位。方法与路线分类不是新公共 API，也不是所有目标模型已经实现的证明。

下述 Current／Gap 保留原核验时间和范围；本次文档组织调整没有重新验证 Recorder 实现或真实业务效果。

## 0. 结论：缺少的不是更多架构名词，而是一套可执行的方法

本文回答一个核心问题：**Agent / 人怎样从亲自完成一次真实任务，逐渐理解、提炼、泛化并生成长期可靠的自动化。**

当前“真实任务执行、证据采集、状态重建、语义落地、行为归纳、统一模型、健壮性工程、代码生成、回放验证”适合作为**系统一级架构**，但不能直接指导 Agent 工作。原文所谓“二级执行链”仍主要按技术对象和生成物排序，混合了执行方法、数据模型、运行机制和产品成熟过程，所以读者看得到名词，却看不到：为什么此刻做这一步、Agent 正在判断什么、怎样进入下一阶段、判断错了回到哪里。

本轮推荐把最重要的中间层正式命名为：

> **示范到自动化执行方法（Demonstration-to-Automation Execution Method）**

它采用优化后的 12 个阶段：

1. 建立录制契约，先知道什么叫成功。
2. 确认起点，并建立最小可用的界面认识。
3. 真实执行任务，并在关键动作前声明意图。
4. 动作后观察并验证实际结果。
5. 分离探索、错误、重试与 Recovery。
6. 以任务级证据关闭示范。
7. 复盘完整 Trace，先分类，再理解刚才到底发生了什么。
8. 按业务状态转换分段，形成可阅读的 Business Episode。
9. 归纳 Skill、变量和控制结构。
10. 为语义目标合成可长期重定位的 Target、Locator 和 Geometry。
11. 构造唯一 Automation IR，并生成接近人工质量的代码。
12. 真实 Replay、认证、晋级，并在运行中持续维护。

这样拆分不是为了追求层数，而是因为每一阶段都产生一个新的、可检查的判断或工件，并且有不同的阶段门和回退方向。最关键的区别是：

- 一级架构说明**系统有哪些大能力**；12 阶段方法说明**Agent / 人具体怎样推进**。
- 技术模型放在执行方法之后，为方法服务，不再用 `State / Target / Locator / IR` 等名词代替思考过程。
- 第一次执行不是代码生成过程，而是**完成任务并建立可信示范**的过程。
- Trace 不直接进入 JavaScript；中间必须经过语义重建、因果提炼、业务分段、参数化、控制流推断和健壮性工程。
- “生成一次可运行代码”不是终点；正式链路包含独立验证、扰动测试、晋级、漂移监控、修复和重新认证。
- 本文描述目标方法与目标架构，不代表 `pkg/recorder` 已经实现全部能力。

当前状态边界：

- **Current**：`pkg/recorder` 已有会话、Trace、`ActionHint`、动作前后观察、Verification、最小 Distill 和确定性 Compiler 骨架。
- **Gap**：当前 Distill 仍主要生成平面 `Flow.steps[]`，变量产物为空，未知 Verification 可进入 Flow；Compiler 对部分未知后置条件不会失败；Replay 仍缺完整资格验证、修复和晋级闭环。
- **Target**：本文描述目标执行方法和工程链，不代表这些能力已经实现或验证完成。
- **Evidence Case**：`examples/app/qianniu.js` 用于反向发现真实桌面业务中的知识和公共能力缺口，不用于证明当前 Recorder 已成熟。

本文的当前实现判断基于 2026-09-03 对本地 `master` 源码的核验；`examples/app/qianniu.js` 仍然存在，历史提交只用于观察演进，不能代替当前源码或当前实现完成度。

## 1. 六个层级及其边界

原始需求最准确地横跨六个层级，其中只需要新增一个此前没有被清楚表达的层级。

### A. 系统一级架构

回答：Recorder 从任务输入到正式自动化，整体需要哪些系统能力。

**真实任务执行；证据采集；界面与状态重建；目标语义落地；行为规律归纳；统一自动化模型；Workflow / Skill 合成；健壮性工程；编译生成；真实回放与验证；运行维护与修复。**

这是系统地图，不应承担逐步教学。

### B. 示范到自动化执行方法

回答：Agent / 人在一次真实任务及其后续工程化过程中，怎样观察、操作、记录、复盘、抽象、生成、验证和修复。

这是本文的执行方法层。跨应用可反复使用的任务求解模式已独立提炼到[任务求解方法](../../frameworks/automation-problem-solving-framework.md)，本页不再维护另一套平行模式分类。执行方法必须包含：

- 当前目标和要解决的不确定性；
- Agent 此时在想什么；
- 实际做什么；
- 同时留下什么；
- 怎样判断阶段完成；
- 判断错误时回到哪里。

### C. 自动化知识与工件生命周期

这是需要新增并单独区分的一层。它回答：每一步形成什么权威工件，下一步以什么作为输入，哪些内容不可被覆盖。

**Task Contract；Raw Trace；Experience Unit；Demonstration Dossier；Semantic Procedure；Generalized Workflow / Skill Spec；Automation IR；Compiled Artifact；Qualification Record；Runtime Evidence；Repair Patch。**

推荐的工件关系为：

`Task Contract + 不可变 Raw Trace + Evidence` 形成 `Demonstration Dossier`；经人类可读的语义重建和批准形成 `Semantic Procedure`；经泛化形成 `Generalized Workflow / Skill Spec`；经目标、状态、Geometry、Verifier 和 Recovery 工程形成 `Automation IR`；再派生 JavaScript、Skill、Playbook 或其他运行产物。

这一层不能省略，否则系统很容易退化成 `Trace → JavaScript`，并失去来源、置信度、审核状态和重新生成能力。

对于明确选择的 Recorder／编译路线，事实源关系必须明确：

- Raw Evidence 是不可变审计事实。
- Agent 的 Intent / Hint 是很有价值的语义主张，但不能覆盖 Evidence。
- IR 是人类审查与机器执行共享的自动化规格。
- JavaScript、Skill 和 Playbook 是可重新生成的交付物，不是唯一事实源。

### D. 技术实现机制

回答：`State、Surface、Target、Locator、Anchor、Region、Geometry、Evidence、Oracle、Cache、Compiler、Replay、Repair` 怎样实现。

普通语言解释：

- **State**：现在处于哪个可操作状态。
- **Target**：业务上真正要操作的是谁或什么。
- **Locator**：这一次凭哪些线索重新找到它。
- **Geometry**：怎样把窗口、区域和元素的相对位置换算到当前屏幕。
- **Coordinate**：这一次动作最终落下的临时位置。
- **Verifier / Oracle**：凭什么证明动作或业务结果真的发生。
- **Cache**：哪些界面认识可以复用，什么时候必须作废。
- **IR / Compiler**：怎样把已经确认的自动化知识稳定地变成程序。

### E. 开发与验证路线

回答：怎样逐级增加环境不确定性。

**可控 HTML；真实浏览器；简单桌面应用；结构化桌面应用；动态 / 自绘桌面应用；微信 / 千牛；跨应用组合。**

Recorder／编译路线在所选验证等级执行完整生命周期，而不是只测试“能不能点”。普通 Recipe 同样必须验证目标、状态、动作和业务结果，但不要求先构造全部 Recorder 工件。

### F. 横切约束

贯穿所有层级：可靠性、证据可信度、权限与风险、隐私和 Secret、感知与 AI 成本、错误恢复、幂等性、可维护性、可移植性、版本与漂移。

`automation-framework.md` 主要描述一次自动化运行时的闭环；`app-development-framework.md` 主要描述怎样为具体应用建立 Profile、State、Region、Target 和 Skill；`capability-development.md` 主要描述能力怎样逐级成熟。三者都与本文互补，但不能代替示范到自动化执行方法。

## 2. 五次关键跃迁

12 个阶段可以压缩为五次性质不同的跃迁，阶段门不能互相代替。

1. **模糊任务变成有效示范**：先定义任务契约，再真实执行并证明完成。
2. **原始轨迹变成人类认可的语义过程**：先重建意图，再去噪、分段和批准。
3. **一次具体过程变成可复用规格**：识别变量、常量、分支、循环、Skill 和 Workflow。
4. **可复用规格变成可靠程序**：设计 Target、Locator、State、Geometry、Verifier、Recovery，形成 IR 和代码。
5. **候选程序变成长期自动化**：真实回放、扰动验证、晋级、运行监控、修复和重新认证。

任何阶段都不能用后面的“代码能跑”倒推前面的“理解一定正确”。一段错误理解也可能生成语法正确、偶尔可运行的代码。

## 3. 12 阶段示范到自动化执行方法

### 阶段 1：接住任务，先定义什么结果才算真正完成

Agent 接到任务以后，首先不是开始录鼠标，而是把用户目标变成可执行、可验证的任务契约。用户说“给张三发一条消息”时，真正目标是消息到达指定会话并产生可观察结果，不是“点击发送按钮”。

- **目标**：明确最终业务结果、执行边界、输入、风险和成功证明。
- **Agent 在想**：最终要改变什么；当前在哪个应用和业务对象；哪些值由用户提供；是否有发送、付款、删除、发货等高风险副作用；屏幕提示是否足以证明成功；能否从 API、剪贴板、文件、数据库、第二会话或稳定业务状态独立验证。
- **执行**：确认 Goal、应用 / Surface、预期初始状态、输入与候选变量、权限、风险级别、成功条件、失败条件、停止条件、隐私与 Secret 规则；为关键结果指定 Verifier / Oracle 及证据等级。
- **留存**：`TaskContract`，至少包含 `goal、inputs、surface、initialState、authority、risk、successCriteria、failureCriteria、verificationPlan、privacyPolicy、environmentFingerprint`。
- **阶段门**：Agent 和人能够用一句业务语言说明“做成什么”，并能说明“拿什么证据证明”。高风险任务没有足够独立验证时，只能进入实验 / Rehearsal，不能承诺 `VERIFIED`。
- **回退**：目标或权限不清时继续澄清；没有可靠成功证明时先补 Oracle、降低自动化权限或把任务拆小；不能用“工具调用未报错”填补验证缺口。

### 阶段 2：进入应用，确认任务起点并建立初始界面认识

第一次进入陌生应用或陌生状态时，Agent 可以支付一次较完整的观察成本，确定当前到底在哪个应用、窗口和页面状态。此时的目标是建立方向感，不是过早冻结长期 Locator。

- **目标**：确认正确 Surface、窗口身份、初始状态、主要区域和当前可操作对象。
- **Agent 在想**：这是正确应用和窗口吗；是否有遮挡、弹窗、登录过期或错误账号；当前状态是否满足任务前置条件；窗口位置、尺寸、DPI、多显示器和主题会不会影响坐标；哪些区域之后可能变化。
- **执行**：聚焦或恢复窗口；读取进程、标题、窗口边界、显示器与缩放；优先读取 DOM / Accessibility / UIA / AX；必要时采集完整窗口截图、OCR、Layout 和关键颜色；识别页面 / 状态、区域和关键元素，建立初始状态假设。
- **留存**：`SurfaceSnapshot、InitialStateHypothesis、RegionMap、EnvironmentFingerprint、PerceptionBudget、CacheKey`，每项带来源、时间和置信度。
- **阶段门**：应用、窗口、账号 / 上下文和初始状态已经确认；影响下一步的未知项已被识别；高风险情况下不存在未处理的遮挡或目标歧义。
- **回退**：发现目标应用、账号、任务输入或成功条件不正确时回到阶段 1；状态变化或观察证据冲突时重新观察本阶段，不带着旧截图继续推理。

### 阶段 3：以完成业务为先，真实执行并同步形成操作经验

第一次执行的首要任务是把真实业务做成功，而不是边探索边硬凑最终代码。允许 Agent 试探、点错、返回、重试和恢复，但每个重要动作都应留下“为什么做、准备操作谁、希望发生什么、实际发生什么、为什么认为成功或失败”的结构化记录。

每个重要动作采用紧凑微循环：

`动作前观察 + 当前子目标 + Target 假设与依据 + 动作 + 预期状态转换 + 动作后观察 + 实际效果 + 验证 + 下一决策`

- **目标**：完成真实任务，同时形成比裸鼠标键盘事件更有学习价值的经验。
- **Agent 在想**：当前业务子目标是什么；目标是已确认还是猜测；依据来自结构、文字、Anchor、颜色、布局还是图像；动作后应看到哪个状态变化；如果没有发生，应继续、重试、恢复还是停止；这个动作是业务步骤、状态准备、探索还是 Recovery。
- **执行**：在动作前观察必要状态并提交结构化 Hint；按成本阶梯定位目标；执行点击、输入、滚动、快捷键、窗口切换或 API 调用；动作后优先观察预期变化区域；运行步骤级 Verifier；根据结果继续、有限重试、恢复或停止。
- **留存**：不可变 Raw Event，加一个 `ExperienceUnit`：`BeforeState + Intent/Subgoal + TargetHypothesis + Basis + Action + ExpectedTransition + AfterState + ActualEffect + Verification + Evidence + Classification + Retry/Recovery Links`。
- **阶段门**：每个重要动作都得到明确的 `pass / fail / uncertain`，并有证据；“点击函数返回成功”只能证明动作被调用，不能自动证明业务效果。
- **回退**：目标或状态理解错误时回到阶段 2；只是短暂加载或安全可重试错误时留在本阶段；任务目标或成功条件本身错误时回到阶段 1；未知结果不得伪装成成功继续执行高风险后续动作。

### 阶段 4：动作后观察并验证实际结果

每个重要动作执行以后，Recorder 必须先回答“实际发生了什么”，再决定继续、重试、恢复还是停止。**工具调用没有报错，只能证明动作被调用；不能证明点到了正确目标，更不能证明业务已经成功。**

- **目标**：把动作执行结果与业务 / 状态效果分开判断，尽早发现错误目标、无效动作、延迟和假成功。
- **Agent 在想**：实际变化是否符合动作前预期；这是立即成功、延迟加载、无变化、错误目标还是未知；下一步是否安全继续。
- **执行**：优先观察预期变化区域或结构化状态；运行步骤级 Verifier；必要时局部 OCR、截图或重新读取 Accessibility。
- **留存**：补齐 `AfterState、ActualEffect、Verification、Evidence、Verdict`，使每个重要动作形成完整 `ExperienceUnit`。
- **阶段门**：关键动作不能长期处于未知状态；高风险后续动作之前必须有足够证据。
- **回退**：目标或状态理解错误回到阶段 2；可安全短暂等待或重试留在执行阶段；任务定义错误回到阶段 1。

### 阶段 6：以任务级证据关闭示范

Agent 认为任务完成以后，先退出“继续操作”模式，重新检查最终业务结果。只有成功路径和最终结果都有足够证据，这次运行才是一份可学习的示范；失败运行仍可保存为反例，但不能作为成功示范直接生成程序。

- **目标**：区分“界面看起来完成”“工具调用走完”和“业务真的完成”。
- **Agent 在想**：最终状态是否满足阶段 1 的成功条件；证据是否独立于执行动作；是否可能出现重复发送、重复发货或界面假成功；是否存在尚未解释的高风险动作、未知结果或遗留弹窗。
- **执行**：读取最终 UI 状态；按 Task Contract 调用业务 Oracle；必要时通过第二通道或重新读取目标对象确认；检查幂等键、业务对象身份和副作用；把成功、失败或待人工对账写入 Verdict。
- **留存**：封存 `DemonstrationDossier`：`TaskContract + RawTrace + ExperienceUnits + Initial/FinalState + EvidenceManifest + FinalVerdict + Environment + PrivacyMetadata`。Raw Trace 只追加，不被后续“美化”覆盖。
- **阶段门**：达到要求的证据等级；示范边界清楚；最终业务对象身份正确；所有关键不确定性已显式记录。仅有屏幕成功提示时，可以标记 UI-Rehearsed，但不能冒充独立业务验证。
- **回退**：业务尚未完成时回到阶段 3；成功条件定义错误时回到阶段 1；证据不足且无法补采时把本次标为 `inconclusive`，重新执行一份定向示范。

### 阶段 7：复盘完整 Trace，先分类，再理解刚才到底发生了什么

任务结束后不能直接执行 `Trace → JavaScript`。系统先基于时间线、动作、窗口、URL、剪贴板、Hint、前后状态、关键帧和最终结果，重建一份人能够检查的任务叙事：总目标是什么、经历了哪些有意义的步骤、每一步为什么存在。

- **目标**：把机器事件流还原成有业务含义、证据可追溯的意图和步骤。
- **Agent 在想**：哪一个意图最能解释整段行为；哪些操作是前置条件或为后续提供输入；哪些看似无关的动作实际上是登录、查找、复制或验证；哪些结论只是猜测。
- **执行**：先读低成本时间线和结构化事件；读取 Agent Hint / 人的旁白；围绕歧义窗口补看局部事件或关键帧，而不是顺序观看全部视频；交叉核对窗口、文字、剪贴板、命令、状态差异和最终证据；生成意图、理由、步骤、证据和置信度。
- **留存**：`Analysis`，包含人类可读 `title、intent、intentRationale、orderedSteps、evidenceRefs、confidence、openQuestions、revision`。
- **阶段门**：每个语义步骤都能回指真实证据；意图没有通过“想象缺失步骤”来补全；人或负责审核的 Agent 已批准，或所有未决问题已列出。
- **回退**：证据仍能解歧时继续补读；意图无法确定时请求人工修订；缺少关键状态或业务结果时回到阶段 1～4 进行新的定向示范，不能凭语言自信补齐。

### 阶段 5：分离探索、错误、重试与 Recovery

真实执行天然混有噪声。目标不是简单删除所有失败动作，而是判断每个操作是否对最终结果有因果作用，并把正常路径与异常经验分开保存。

- **目标**：得到完成任务所必需的成功路径，同时保留可转化为异常策略的经验。
- **Agent 在想**：这个动作直接推进业务、建立前置状态、提供数据、验证结果，还是只是在探索；一次返回是无效绕路还是必要恢复；连续重试是网络等待、错误定位还是未来循环；删除它以后任务是否仍能成立。
- **执行**：把 Experience Unit 分类为 `business、setup、state-preparation、verification、exploration、off-task、error、retry、recovery`；建立前后依赖和因果链；合并键入、滚动等低层碎片；把固定停顿转换为待推断的状态等待；为删除、保留或移入异常策略的动作写理由。
- **留存**：`ClassificationMap、CausalSuccessPath、OmissionLog、RecoveryCandidates、UnresolvedAmbiguities`。探索和失败证据不删除，只是不进入正常路径。
- **阶段门**：每个保留动作都服务于业务结果、必要前置或验证；每个被排除动作都有可审查理由；重试没有被误判成业务循环；Recovery 没有混入正常路径。
- **回退**：意图不稳定时回到阶段 5；无法判断某动作是否必要时请求一次对照示范，或在新环境做可逆消融测试；不能用“动作成功”作为唯一保留标准。

### 阶段 8：按业务状态转换分段，形成可阅读的 Business Episode

这一阶段回答：“我刚才做了很多鼠标键盘操作，实际上完成了哪几个业务步骤？” 一个业务步骤应围绕同一子目标，具有清楚的输入、前置状态、后置状态和可观察结果，并能用业务语言命名。

- **目标**：形成普通人可以阅读、修改和批准的 `SemanticProcedure`。
- **Agent 在想**：哪些相邻动作共同完成一个子目标；步骤边界是否对应明显状态转换；该步骤对外接收什么、产生什么；是否能独立验证；这个粒度适合复用还是只是实现细节。
- **执行**：按子目标、状态转换、数据流和验证点分段；把实现动作折叠到业务步骤内部；为每步补充前置条件、输入、输出、后置条件、证据、风险和失败语义；检查是否遗漏隐藏等待、选择或验证。
- **留存**：`SemanticProcedure`，由 `BusinessStep + StateTransition + Inputs/Outputs + Preconditions/Postconditions + Evidence` 组成，并保留到 Experience Unit 的双向映射。
- **阶段门**：人只看该过程就能判断系统是否理解正确；步骤名称不再是“点击坐标”“等待 1 秒”；每一步有业务目的和可观察后置条件；实现细节仍可追溯但不污染主叙事。
- **回退**：步骤中仍含探索或重复错误时回到阶段 6；业务命名不能解释动作时回到阶段 5；缺少必要证据时补示范。

示例：

- `点击搜索框 + 输入“张三” + 等待结果 + 点击结果 + 确认聊天标题`，归纳为 `打开联系人(contactName)`。
- `聚焦输入框 + 输入“你好” + 点击发送 + 确认消息出现在正确会话`，归纳为 `发送消息(message)`。
- 两个步骤组合为 `发送消息给联系人(contactName, message)`。

等待不是独立业务步骤，应尽量变成步骤内部的 `waitFor(searchResultsReady)` 或 `waitFor(messageVisible)`。

### 阶段 9：归纳 Skill、变量和控制结构

阶段 7 描述“这一次实际发生了什么”；阶段 8 描述“未来不同输入和状态下应该怎样做”。单次示范只能支持有限泛化，系统必须区分已确认规律、候选规律和仍需新示范的问题。

- **目标**：把具体实例变成明确输入输出、可复用边界和可执行控制逻辑。
- **Agent 在想**：哪些文字、对象和文件每次会变；哪些属于环境配置或稳定业务常量；哪些值由界面运行时产生；是否存在 Secret；重复片段是真循环还是偶然重试；哪些不同路径形成分支；一个业务步骤是否值得成为独立 Skill。
- **执行**：先利用阶段 3 的候选变量和数据来源，再对所有字面量分类；定义参数类型、来源、默认值、约束和敏感级别；推断顺序、条件、分支、循环、Retry、Recovery、Checkpoint 和完成 / 失败条件；优先把可以由 API、CLI 或已有稳定能力完成的动作替换为原生工具；为候选 Skill 定义合同。
- **留存**：`GeneralizedWorkflowSpec`，包含 `parameters、constants、config、secretRefs、derivedValues、steps、branches、loops、retryPolicy、recoveryPolicy、skillContracts、workflowContract、confidence、recordNext`。
- **阶段门**：所有录制字面量都已分类；Secret 只保存引用；每个 Skill 有清楚目标、输入、输出、前置 / 后置、失败语义和验证方式；单示范无法证明的分支或循环不会被假装成事实。
- **回退**：泛化需要改变业务分段时回到阶段 7；参数来源不清时回到阶段 5 或 Task Contract；关键分支、循环或数据差异欠定时生成 `record-next` 清单，回到阶段 1～4 补录针对性示范。

Skill 边界不等于任意动作组。一个好的 Skill 通常同时满足：业务语义明确、合同清楚、可独立验证、在多个 Workflow 中可能复用、内部实现允许变化、粒度不会小到退化成 `clickButton()`。

### 阶段 10：为语义目标合成可长期重定位的 Target、Locator 和 Geometry

语义正确不代表运行稳定。本阶段把“操作发送按钮”工程化为：先确认正确应用和状态，使用多种线索重新找到正确按钮，解决当前 Geometry，执行动作，等待预期状态，并由独立 Verifier 判断结果。

- **目标**：让同一业务步骤能在窗口移动、尺寸变化、数据变化、轻微 UI 漂移和异步加载下安全执行。
- **Agent 在想**：Target 的业务身份是什么；可用哪些 Locator；每个 Locator 是否唯一、稳定、最新；需要哪些 Anchor、父区域和状态上下文；坐标属于哪个空间；错误目标点击的后果；验证失败能否安全重试；重复动作是否幂等。
- **执行**：建立 Target Candidate Set；为候选 Locator 记录结构、Role / Name / Text、稳定标识、父级 / Anchor、OCR、Layout、Image、Color、Vision 和历史命中；测试唯一性和跨运行稳定性；定义 Region、Geometry 变换和动作点；把固定 sleep 改为状态等待；建立步骤级与业务级 Verifier、失败分类、有限 Recovery、幂等键和 Checkpoint。
- **留存**：`StateModel、TargetSpec、LocatorCandidateSet、AnchorContext、RegionSpec、GeometrySpec、WaitCondition、VerifierContract、FailureTaxonomy、Retry/RecoveryPolicy、IdempotencyContract`。
- **阶段门**：Target 不依赖单个裸坐标；Locator 歧义会 fail closed；高风险动作具有强前置和后置验证；坐标回退绑定到明确 Surface / Region / DPI；固定 sleep 不是主要同步机制；Recovery 不会重复产生不确定副作用。
- **回退**：找不到稳定目标时回到阶段 2～4 补采；Target 身份依赖遗漏变量时回到阶段 8；业务结果无法验证时回到阶段 1；不能通过叠加更多 magic number 掩盖模型缺失。

这里必须坚持：

- **Target 是要找谁或什么业务对象。**
- **Locator 是凭什么认出它。**
- **Geometry 是怎样把相对位置投影到当前窗口和屏幕。**
- **Coordinate 只是这一次真正落下动作的临时点。**

把四者分开，UI 移动时改变的是投影结果，不是业务目标身份；某个 Locator 失效时可以换其他候选，而不必重写 Workflow。

### 阶段 11：构造唯一 Automation IR，并生成接近人工质量的代码

在明确选择的 Recorder／编译路线中，正式知识先进入 Canonical Automation IR，再由编译器派生 JavaScript、Skill 或 Playbook。第一版代码可以只达到“正确可回放”，但在晋级前必须完成业务化重构。普通 Recipe 的业务化组织与验证参照任务求解方法，不以本阶段的 IR／Compiler 建设为前置条件。

- **目标**：形成可重新生成、可审计、可维护的唯一事实源，并派生清晰程序。
- **Agent 在想**：哪些是业务 Workflow，哪些属于应用 Adapter，哪些属于通用 Runtime；编译器是否支持每个条件、Verifier 和 Recovery；生成代码是否仍携带探索噪声、固定坐标、固定等待或含糊成功判断。
- **执行**：把 Task、State、Target、Locator、Geometry、Variable、Skill、Control Flow、Verifier、Recovery 和 Evidence 编入 IR；进行 Schema、静态语义和安全检查；生成最小可执行版本；再提取业务函数、类型化参数、稳定命名、状态等待、验证、错误类型、日志和 Evidence；删除死步骤和重复观察。
- **留存**：版本化 `AutomationIR、GeneratedArtifact、SourceMap、CompileDiagnostics、OptimizationReport`。Source Map 能从生成代码回到业务步骤、IR、Experience Unit 和原始证据。
- **阶段门**：编译器不得静默忽略未知 Postcondition、Locator 或 Recovery；每个副作用步骤有验证；业务层看不到不必要的屏幕坐标和截图路径；代码审阅者能从函数名和合同理解流程。
- **回退**：定位和验证问题回到阶段 9；参数、分支和 Skill 结构问题回到阶段 8；业务步骤理解错误回到阶段 5～7。

人工质量代码至少应满足：

- 业务函数命名表达意图，而不是录制事件编号；
- 参数、配置、运行时值和 Secret 明确分离；
- 原生 API / CLI 优先于脆弱 UI 重放；
- 业务 Workflow 不直接手写窗口坐标换算；
- 用状态等待和 Web-first / UI-state-first 断言替代固定 sleep；
- 目标解析、动作、验证和 Recovery 分层；
- 对危险副作用使用幂等键、Checkpoint 或人工确认；
- 失败显式停止，不以 `return true` 代表未经证明的业务成功；
- 正常稳定回放不依赖在线大模型；AI 主要用于歧义、归纳、诊断和修复。

### 阶段 12：真实 Replay、认证、晋级，并在运行中持续维护

录制环境中的成功只能证明“这个样本曾经成功”。正式自动化需要在新会话、新数据和受控扰动下重新完成原任务，并重新证明业务结果。

- **目标**：验证自动化不是对一次窗口布局和一组字面量的过拟合。
- **Agent 在想**：这次是新运行还是偷偷复用了旧状态；是否点击了错误目标；Locator 失败后采用了什么候选；最终结果是否由独立证据确认；修复是局部 Locator 修复还是业务流程已变化。
- **执行**：从清洁起点 Replay；使用不同参数；重启应用；改变窗口位置与尺寸、DPI / 显示器、主题、语言、延迟、列表长度和滚动位置；注入弹窗、网络失败、目标缺失、后端拒绝等反例；统计错误目标、假成功、重试、恢复和 AI 成本；产生可审阅 Repair Diff 后重跑相关矩阵。
- **留存**：`ReplayRun、VerificationReceipt、PerturbationMatrix、FailureReport、RepairProposal、RepairDiff、QualificationRecord`。
- **阶段门**：达到所选等级的通过矩阵；关键业务结果由要求等级的 Oracle 证明；没有未解释的错误目标点击或假成功；修复后已重新认证；不能用一次 happy path 直接晋级生产。
- **回退**：业务理解错误回到阶段 5～8；目标 / Geometry 漂移回到阶段 9；编译问题回到阶段 10；成功证明错误回到阶段 1；欠定控制流要求新增 Demonstration。

推荐晋级状态：

- `Captured`：只有原始示范。
- `Semantically Approved`：人类可读过程已批准。
- `Compiled`：IR 和程序通过静态门禁。
- `Rehearsed`：至少一次新会话回放成功，但验证可能仍是 UI 级。
- `Verified`：最终业务效果由所要求的独立 Oracle 证明。
- `Qualified`：通过指定参数与环境扰动矩阵。
- `Production`：在监控、版本、回滚和重新认证策略下运行。

### 阶段 12：投入运行后持续监控漂移、错误目标、假成功与成本

自动化不是编译后永久正确的文件。应用版本、文案、主题、布局、权限、业务流程和后端接口都会变化；维护必须是正式生命周期，而不是运行失败后临时改坐标。

- **目标**：及时发现自动化已偏离原合同，并以最小、可审查的修改恢复可信运行。
- **Agent 在想**：这是偶发运行错误、Locator 漂移、State 漂移、Geometry 变化、数据变化、权限变化、Verifier 失效，还是业务流程本身变化；旧修复是否仍符合原 Goal；是否需要重新示范。
- **执行**：保存运行 Evidence 和环境指纹；监测定位置信度下降、候选排序变化、目标歧义、错误目标、Verifier 失败、Recovery 频率、AI 调用和成本；按故障类型提出局部修复；保留旧版本并执行回归 / 扰动矩阵；必要时重新录制差异路径。
- **留存**：`RuntimeEvidence、DriftReport、RepairPatch、VersionLineage、RequalificationRecord、DeprecationDecision`。
- **阶段门**：任何修复都保持 Task Contract、语义步骤和业务验证不变，或明确升级版本并重新批准；Verifier 不可用时停止或进入 `reconciliation-required`，不继续声称成功。
- **回退**：Locator / Geometry 变化回到阶段 9；参数或控制流变化回到阶段 8；业务步骤变化回到阶段 5～7；目标、权限或成功定义变化回到阶段 1；无法从现有证据判断时录制新的定向示范。

## 4. Recorder 的三个不同学习单位

### 4.1 Raw Event：发生了什么低层事件

例如：`mouse.click(742, 513)`、输入一段文字、按下 `PageUp`、窗口获得焦点。Raw Event 必须真实、按时间追加、不可被语义重写，但单独不足以学习业务自动化。

### 4.2 Experience Unit：一次有理由、有预期、有结果的操作尝试

推荐结构：

```text
BeforeState + BusinessIntent/Subgoal + TargetHypothesis + Basis/Evidence
+ ActionRequest/Result + ExpectedTransition + AfterState/ActualEffect
+ Verification/Oracle + Classification + Retry/Recovery Links
```

它对人的意义是：不是只告诉读者“点了哪里”，而是告诉读者“为了完成什么，基于什么判断操作了谁，希望出现什么变化，实际发生了什么，为什么认为成功或失败”。

Recorder 应收集**任务相关、可外化、可审核的理由**，不要求也不保存 Agent 私有 Chain-of-Thought。当前 `ActionHint` 的 `goal、subgoal、intent、targetDescription、expectedPostconditions、risk、variableHints、recoveryReason` 是正确起点，但还需要补充：

- `actionClass`：业务、状态准备、探索、验证、重试、恢复；
- `targetCandidates / alternatives`；
- `basisEvidenceRefs` 和置信度；
- `expectedStateTransition`；
- `verificationPlan` 与 Verifier 身份；
- `ifUnexpected`；
- 动作后的 `actualEffects、verificationVerdict、nextDecision、retryOf、recoveryFor`。

### 4.3 Business Step / Skill：多个操作经验共同完成什么业务子目标

一个 Business Step 折叠多个 Experience Unit；一个 Skill 则是在多个运行中仍有清楚合同、可复用、可独立验证的业务能力。不能从“连续发生”直接推出“属于同一个 Skill”，还要检查子目标、数据流、状态转换和复用边界。

## 5. 从完整 Trace 到业务流程的语义归纳

任务完成后的处理顺序应保持以下逻辑，而不是机械把几十项都升格为一级阶段。

1. **重建**：按时间还原应用、窗口、状态、动作、数据和结果。
2. **解释**：提出总意图与子目标假设，并给证据和置信度。
3. **分类**：区分业务、前置准备、验证、探索、错误、重试、恢复和离题。
4. **因果提炼**：保留对最终结果必要的动作，异常经验进入策略，不污染正常路径。
5. **状态化**：把“等了一秒”改写成“等待搜索结果出现”，把“按 End 三次”解释为“进入列表底部状态”并检查是否有更稳定做法。
6. **分段**：以业务子目标、输入输出和可观察后置条件划分步骤。
7. **命名**：使用业务语言命名，保留到低层 Evidence 的映射。
8. **泛化**：识别参数、固定配置、运行时值、分支、循环、Retry、Recovery 和 Skill。
9. **补证**：对单次示范无法确定的控制流生成下一次定向示范任务。
10. **批准**：人或授权审核者确认语义过程后，才进入可靠性工程和编译。

有效路径不是“所有返回成功的工具调用”，而是**能够解释并导致最终业务结果的因果路径**。登录、复制数据、打开正确上下文和独立验证可能不直接改变目标对象，但仍是必要步骤；相反，一个无报错的错误点击可能完全不属于成功路径。

## 6. 变量、参数与多次示范

### 6.1 变量什么时候识别

采用“两次识别”而不是只在最后猜测：

- **执行时记录候选**：用户明确提供、从文件 / 剪贴板 / API 读取、在界面选择、在多处重复使用的值，立即标注来源和可能角色。
- **任务后正式确认**：结合业务步骤、输入输出、其他字面量和多次示范，决定它是参数、配置、状态、派生值、Secret 还是常量。

### 6.2 字面量分类

- **业务输入**：`contactName、message、productId、file、date`。
- **业务输出**：`messageId、orderStatus、savedFilePath、confirmationId`。
- **运行时派生值**：从页面或 API 读取并在后续使用的价格、行数、会话 ID。
- **环境 / 配置**：应用路径、固定工作区、基础 URL、默认超时。
- **状态值**：当前页面、选中联系人、列表游标；通常不暴露为用户参数。
- **Secret Reference**：凭据、Token、个人敏感信息的安全引用，不保存明文。
- **业务不变量**：真正跨运行不变的规则或固定入口。
- **实现偶然值**：一次窗口的 `(x, y)`、某次加载的 `1000ms`、临时文件名；不应误当业务常量。

单次示范中，明确的用户输入和有来源的数据可以高置信参数化；仅出现一次的其他值最多是候选，不能因为“看起来会变化”就自动确认。

### 6.3 Multi-Demonstration Differencing

两次示范：

`张三 / 你好` 与 `李四 / 明天开会`

可支持 `contactName` 和 `message` 的参数假设，但多示范的价值不止替换字面量。推荐过程：

1. 按 Semantic Step 对齐，而不是按鼠标事件序号对齐。
2. 比较输入、目标、状态、定位证据、重复次数和结果。
3. 同一步骤中同角色不同值，形成参数候选。
4. 同一 Target 的不同结构 / 视觉证据，形成 Locator 候选或稳定性数据。
5. 重复的同构步骤形成循环候选。
6. 某些示范出现、某些示范不出现的片段形成可选分支候选。
7. 不同条件触发不同路径时形成条件分支。
8. 仍无法区分“分支、偶然错误、恢复或环境差异”时，生成最小 `record-next` 场景，而不是猜测。

参数、Skill 输入输出和控制流应一起确定，因为参数往往正是业务步骤之间的数据接口。

## 7. Browser Recorder 的完整学习路线

浏览器适合作为第一阶段，不只是因为“更简单”，而是因为 DOM、事件目标和可查询属性让系统能够先验证语义归纳、Selector 工程、变量、等待、断言、代码生成和回放，而不同时承担桌面感知的全部不确定性。

### 7.1 浏览器从录制到高质量代码的方法

1. 先定义业务结果和最终断言。
2. 捕获真实 DOM Event Target、动作、页面 / Frame、URL 和动作前后 DOM / 状态。
3. 为目标生成多个候选 Selector，而不是只保存一个 CSS 路径。
4. 优先使用用户可理解和显式契约：Role + Accessible Name、Label、Test ID、稳定文字和稳定属性；CSS / XPath 作为必要回退。
5. 立即测试唯一性、可操作性和当前状态下的匹配数量；多匹配必须消歧，不能默认第一个。
6. 识别动态 ID / Class、跟踪参数、临时节点和 Shadow DOM；保存 Anchor、父级和上下文。
7. 把固定等待改为 URL、元素状态、网络 / DOM 条件或业务断言。
8. 删除 Recorder 起止、误点、无关浏览和重复输入；保留真正前置条件。
9. 分段成业务步骤，抽取变量、分支、循环和可复用子流程。
10. 生成带自动等待、重试边界和断言的第一版代码，再进行人工质量重构。
11. 在新数据、重启、不同 Viewport、登录状态和延迟下回放。
12. Selector 漂移时生成可审阅修复，重新运行稳定性矩阵。

### 7.2 主流系统给 OpenDesk 的启发和边界

| 系统 | 可迁移原则 | 不能直接替代的部分 |
|---|---|---|
| Chrome DevTools Recorder | 捕获多个 CSS / ARIA / Text / XPath / Pierce Selector；支持自定义测试属性、等待、条件、断言、编辑、调试和导出 | 生成物仍偏用户流 / 测试步骤，不负责业务意图、变量与 Skill 边界的完整归纳 |
| Playwright Codegen | 优先 Role、Text、Test ID；发现多匹配时改进 Locator；Locator 每次重新解析；自动等待、Actionability 和 Web-first Assertion | Codegen 仍需要人审阅和重构，不知道一次操作背后的完整业务目的 |
| Selenium IDE | 为元素记录多个 Locator 并在回放失败时尝试后备；提供 Test Case 复用和 `if / while / times` | 控制流主要由人补充，不能从单次 Trace 自动证明分支和循环 |
| UiPath Unified Target | Target + Anchor；Strict / Fuzzy Selector、Image、Native Text、Computer Vision 和 Semantic Selector 的组合；对重复目标显式消歧 | 复杂 Target 配置不等于业务步骤、独立 Oracle 和长期知识生命周期 |
| Power Automate Desktop | UIA / MSAA 等桌面捕获；Selector 测试可暴露成功、失败和多匹配；修复会结合旧 Selector 与重新捕获结果并由人审核 | 多匹配时采用某个具体元素仍可能导致错误目标；修复 Locator 不能修复错误业务理解 |
| Microsoft Skill Recorder | 以低成本 OS 事件和旁白建立时间线；只在歧义处抽取关键帧；重建 Intent + Steps，允许人工反馈和批准，再泛化为 Skill / Automation；优先原生工具 | 更偏 Agent 指令与原生工具 Skill，不等于完整的桌面 Target / Geometry / Verified Replay 编译链 |
| OpenAdapt Flow | 录制、编译、回放、资格审查、独立 System-of-Record 效果验证；健康路径可零模型调用；多示范一致时归纳程序，不足时要求下一次示范 | 强工程门禁不能替代 OpenDesk 需要的人类可读语义重建、业务步骤批准和应用能力分层 |

研究也给出一致结论：自然语言和示范可以互相消除歧义；多条 Trace 有助于对齐不同路径并发现过程结构；复杂循环和条件需要程序草图、额外示范或交互式补全；低层轨迹直接生成脚本通常难以泛化和复用。因此单次示范应产生**带置信度的候选程序**，而不是未经验证的唯一真相。

### 7.3 可直接迁移与不可直接迁移

可直接迁移：

- 先捕获真实目标，而不是只捕获动作坐标；
- 多 Locator、唯一性测试、稳定性排序和 Anchor；
- 状态等待、动作后断言和失败即停；
- 删除录制噪声、转换为业务步骤；
- 参数化、控制流、代码重构、真实回放和修复版本。

不能直接迁移：

- DOM 节点身份、CSS / XPath、浏览器 Event Target 和 Frame 生命周期；
- 默认完整的 Accessibility / Role；
- 浏览器内统一坐标和相对稳定的渲染环境。

Desktop 必须额外引入 Application / Window / State / Region、DPI 与多显示器 Geometry、遮挡和弹窗、虚拟列表、OCR / Image / Color / Vision、窗口身份和跨应用上下文。

## 8. Desktop 比 Browser 多出的不确定性

桌面端可能没有 DOM，Accessibility 可能不完整，自绘 Canvas / 游戏式界面可能只剩像素；同一控件会因窗口 Resize、DPI、显示器、主题、语言、滚动、虚拟列表、多窗口 / 多进程弹窗、动态加载和遮挡改变位置或外观。

推荐统一理解层级：

`Application > Window / Surface > Page / State > Region > Target > Action Point`

目标解析顺序不是永久固定的单一梯子，而是在当前 State 和预算下组合证据：

1. 原生结构：DOM、Accessibility、UIA、AX、稳定控件 ID。
2. 语义属性：Role、Name、Label、Text、业务对象 ID。
3. 上下文：Page / State、父级、Region、邻近 Anchor、列表行身份。
4. 轻量视觉：OCR、Layout、Color、Template。
5. 局部 Vision / 多模态理解。
6. 与明确窗口、区域和 DPI 绑定的 Geometry / Coordinate 回退。

候选 Target 必须评分并保留来源：语义一致性、状态一致性、唯一性、Anchor 一致性、视觉匹配、Geometry 合理性、历史稳定性、证据新鲜度。多个候选接近时应停止、补观察或请求确认，不能默认点击左上角第一个。

### Coordinate 不是知识，只是运行时投影

长期保存 `(742, 513)` 相当于保存“上次它在哪里”，没有保存“它是谁”。更稳定的表达是：

`在 AliWorkbench 的接待中心状态中，订单区域内，与当前 orderId 同行、文字 / 颜色 / Anchor 符合“发货”的按钮；运行时解析其当前 Bounds，再点击安全动作点。`

Geometry 服务于 Target，而不是反过来用坐标定义 Target。

## 9. 感知预算、局部观察与缓存

“不能每一步把全屏上传在线视觉模型”应成为执行方法，而不只是性能优化。每次观察都应回答：当前不确定性需要哪一级证据，最小观察范围是什么。

### 9.1 感知成本阶梯

- **P0 无图像**：复用已确认 State / Target Cache、工具返回值、业务 API 和前一步状态转换。
- **P1 结构化观察**：窗口信息、DOM、Accessibility / UIA / AX、可查询属性。
- **P2 本地轻量感知**：OCR、Layout、图色、像素、局部差异。
- **P3 局部截图**：只截已知 Region 或预期变化区域，优先本地模型。
- **P4 完整窗口**：陌生状态、结构严重缺失、局部证据冲突或复杂修复时使用。
- **P5 全屏 / 跨应用 Vision**：连目标窗口和上下文都不确定时才使用，不是正常动作循环默认值。

初次进入陌生状态可以使用 P4 建模；之后每个动作应根据 `ExpectedTransition` 优先观察变化区域。例如点击发送后，先检查当前会话的消息列表尾部，而不是重新理解整块桌面。

### 9.2 应建立的缓存

- `ApplicationModel`：版本、进程、能力和稳定入口。
- `StateModel`：页面 / 状态签名、允许动作和转换。
- `RegionModel`：稳定区域及相对关系。
- `Element / TargetModel`：目标语义、候选 Locator 和 Anchor。
- `LocatorHistory`：跨运行命中、失败、歧义和修复记录。
- `Visual / Layout Cache`：区域视觉特征、OCR、布局和变化摘要。

Cache Key 至少考虑应用版本、窗口身份、State、布局、主题、语言、DPI / Scale 和显示器。以下情况应失效或降级置信度：

- 应用 / 窗口身份、版本、主题、语言、DPI 或显示器变化；
- State Fingerprint 与缓存不一致；
- 预期变化区域之外发生较大变化；
- Locator 多匹配、目标歧义或连续失败；
- Verifier 与缓存预测冲突；
- 人工明确标记界面已更新。

### 9.3 成本和隐私也要进入 Evidence

每次示范与回放记录：结构化查询次数、OCR 次数、截图像素、上传像素、Vision / LLM 调用、Token、延迟、Cache Hit、敏感内容遮罩结果。稳定正常路径的目标是尽量零在线 Vision；高风险验证不能为了省 Token 降低证据等级。

## 10. `qianniu.js` 真实案例反向校准

本节是千牛案例的维护正文。可跨应用复用的六类解题模式及步骤交接统一见[自动化任务求解方法](../../frameworks/automation-problem-solving-framework.md)。源码做法、从中提炼的方法和改进后的目标合同必须分开阅读；案例代码存在不等于定位、发送或发货已经得到当前真机验证。

### 10.1 当前事实

`examples/app/qianniu.js` 仍存在于当前 `master`。早期提交 `008d9d9726d4ab9ec215a73f6d30ec7e0f7e763e` 可以说明最初实现，但当前文件已经扩展出更多窗口、区域、状态、订单、复制、发送和恢复逻辑；架构判断应以当前文件为主、历史为演进证据。

### 10.2 人在复杂桌面自动化中实际怎样解决问题

当前代码自然出现了：

- 通过 `AliWorkbench.exe`、标题、PID 和前台状态确认窗口身份；
- 活动窗口截图和多个局部区域截图；
- 固定像素、颜色相似度和色块搜索判断状态 / 目标；
- 根据窗口原点、区域偏移和色块位置换算屏幕动作点；
- 根据窗口宽高划分聊天区、订单区和发送区；
- 使用 `PageUp / End` 把列表推到作者认为可处理的状态；
- 通过剪贴板变化验证“复制”；
- 调用 API 获取商品文案；
- 使用通知和 Sound 暴露异常；
- 用业务函数组织“找会话、联系、读取订单、复制、发送、发货”等过程。

这些做法提示需要提炼的不只是“记住鼠标”，而是以下组合；它们不是强业务验证已经实现的证明：

`窗口身份 + 状态认识 + 区域模型 + 目标语义 + 相对 Geometry + 动作 + 业务验证`

### 10.3 哪些工作由作者在脑内完成

从作者写入脚本的规则可以读出以下应用假设；其跨版本适用性仍需验证：

- 黄色块代表“和我联系”；
- 订单面板位于窗口右侧；
- 某个色块下方固定偏移处是复制或发货动作；
- 绿色 / 灰色等颜色对应业务状态；
- `PageUp / End` 是为了建立可预测列表状态；
- 哪些底层动作共同构成“发送商品信息”或“发货”。

这些知识不应继续只存在于代码作者脑中，应分别进入：

- `AppProfile / StateModel`：接待中心、聊天状态、订单状态；
- `RegionModel`：会话区、聊天区、订单区、发送区；
- `TargetSpec / LocatorCandidates`：联系按钮、复制按钮、发货按钮；
- `GeometrySpec`：区域和元素的相对关系；
- `SkillContract`：读取当前订单、生成文案、发送消息、执行发货；
- `Verifier / Oracle`：消息是否进入正确会话、订单是否真正变为已发货；
- `RecoveryPolicy`：窗口丢失、无订单、复制失败、后端结果不确定。

### 10.4 不应被 Recorder 学习的实现债务

- 大量 magic number、固定窗口尺寸和固定偏移；
- `sleep(500 / 800 / 1000)` 作为主要同步；
- 单像素、单色和第一个色块作为强事实；
- 找不到订单时使用固定矩形兜底；
- `PageUp / End` 等准备动作与业务语义混合；
- 点击发送或发货后缺少强业务结果验证；
- 某些函数 `return true` 只表示代码走完；
- 主流程没有始终检查子函数 Verdict；
- 正常路径、重试、Recovery 和持续轮询混在一起；
- 缺少基于 `conversationId / orderId` 的目标身份、幂等性和独立效果证明。

### 10.5 理想 Recorder 应生成什么

它不应生成更长的 `qianniu.js` 录像，而应形成如下目标业务分解。这里的函数和身份字段是设计表达，不是当前 Runtime API，也不表示当前脚本已取得稳定的 conversationId／orderId：

```text
Workflow: processPendingQianniuOrder(orderInput)
Skills:
  openPendingConversation(conversationId)
  readCurrentOrder() -> order
  fetchProductMessage(order.productId) -> message
  sendMessage(conversationId, message)
  verifyMessageDelivered(conversationId, message)
  # 可选：仅在本次任务单独授权发货且当前订单资格满足时执行
  shipOrder(order.orderId)
  verifyOrderStatus(order.orderId, "shipped")
```

业务代码只表达合同和状态转换；App Adapter 内部使用 AX、OCR、Color、Layout、Region、Geometry 和候选 Locator；Verifier 用正确会话、消息内容、订单身份和业务状态证明结果。坐标、截图和色块只是可替换的定位实现，不是 Workflow 的事实源。

### 10.6 从源码行为提炼解题模式，而不是复制实现债务

| 案例行为 | 应提炼的判断 | 不能直接沿用的结论 |
| --- | --- | --- |
| 窗口查找、颜色状态判断 | 分开确认窗口、业务对象、状态与操作资格 | 某种颜色不等于已确认订单，更不等于获准发货 |
| 复制商品线索并查询文案 | 按数据依赖分段，输出可用内容及适用对象 | 剪贴板变化不证明复制了正确字段；错误文字不能当作业务内容 |
| 聚焦、PageUp／End | 先建立并验证可操作起点 | 固定按键次数与 sleep 不证明状态达成 |
| 右侧订单区、色块与偏移 | 分层观察、按当前参照关系定位 | 旧坐标、首候选和固定矩形兜底不能充当目标身份 |
| 输入、发送、随后发货 | 每个写操作有独立资格和结果验证 | 发送调用成功不能自动授权发货 |
| 重试、恢复和循环 | 先分类失败与副作用，保留成果和失效条件 | 结果不确定时不能盲目重发或从头重放 |

普通 Recipe 可以用独立业务函数及返回结果表达这些步骤；不需要为此先建设新的编排系统。下一步只接受已核对且仍有效的输出，不能依赖前一步遗留的窗口焦点或截图。详细合同模板和非千牛对照场景只在任务求解方法文档维护。

## 11. 当前 OpenDesk 实现位置与真实缺口

### 11.1 已有的正确基础

当前 `pkg/recorder` 已有：

- `ActionHint`：Goal、Subgoal、Intent、Target Description、Expected Postconditions、Risk、Variable Hints、Recovery Reason；
- Trace Event 的动作前后观察、Result 和 Verification；
- Raw Trace、Flow、Compiler、Replay 和隐私相关基础；
- `page.screenshot` 的 `activeWindow / screen` 与 `clip`；
- `Screen` 的显示器、像素尺寸、Scale、区域选择和录屏；
- `window` 的窗口身份、边界、能力状态和歧义 / stale / verification 错误类型；
- `ImageColor` 的像素、色块、模板、裁剪和 Layout 分析。

因此“OpenDesk 完全没有窗口截图、区域截图或窗口信息”已经不是准确说法。

### 11.2 当前仍未实现的方法层

现有 Distill 主要完成删除失败 / 无变化步骤、合并连续输入和生成扁平 Flow Step；`variables.json` 仍缺少正式推断；Locator 通常只有一个 Hint / 坐标候选；Compiler 和 Replay 是受限 MVP。当前尚未形成：

- Task Contract 与最终业务成功合同；
- Demonstration Dossier 和 Experience Unit；
- 人类可读 Intent / Step 重建、反馈、批准与修订；
- 因果成功路径和完整动作分类；
- Business Step / Skill / Workflow 的正式归纳；
- 参数分类、多示范对齐、分支和循环推断；
- 多 Locator 的真实捕获、排序、唯一性与稳定性测试；
- 统一坐标空间、截图空间和 Region Geometry 契约；
- Verifier 身份、来源、独立性、信任等级和 Evidence Tier；
- Qualification、Repair、Version、Drift 和长期维护闭环。

因此当前 `Flow 0.1` 更接近**动作级 IR**，不能直接视为完整 Workflow IR；当前 `Distill` 更接近**机械规范化**，不能等同于本文的语义蒸馏。

## 12. 建议增加或统一的公共契约

重点不是再复制一组相似函数，而是把已有低层能力统一成 Recorder、Runtime 和 App Adapter 都能复用的类型化合同。

### 12.1 Recorder 与示范合同

- `TaskContract`：Goal、输入、Surface、初始状态、权限、风险、成功 / 失败条件、Oracle、隐私。
- `ActionIntent`：Subgoal、Action Class、Target Hypothesis、依据、预期转换、验证计划、异常决策。
- `ActionOutcome`：实际效果、Verifier Verdict、Evidence、下一决策、Retry / Recovery 关系。
- `ExperienceUnit`、`DemonstrationDossier`、`sealDemonstration()`。
- `analyzeDemonstration()`、`reviseAnalysis()`、`approveSemanticProcedure()`。
- `generalizeDemonstrations()` 与 `recordNext`。

### 12.2 Surface、截图与 Geometry

已有截图原语之上补齐：

- `SurfaceRef / WindowRef / DisplayRef / RegionRef`；
- 明确 `screen、display、windowFrame、windowContent、region、screenshotPixel、normalized` 坐标空间；
- `captureSurface()`、`captureRegion()` 返回图像和完整 Geometry Metadata；
- `convertPoint / convertRect()`；
- `projectTargetToActionPoint()`；
- 跨 DPI、多显示器、负坐标、窗口边框 / 内容区和截图 Scale 的一致测试。

### 12.3 State、Perception 与 Cache

- `observe({surface, region, modalities, budget, cachePolicy})`；
- `identifyState()`、`diffState()`、`waitForState()`、`waitForTransition()`；
- `ApplicationModel / StateModel / RegionModel / ElementModel`；
- Cache Key、置信度衰减、失效原因和局部重建；
- 感知成本、隐私遮罩和模型调用计量。

### 12.4 Target、Locator 与解析

- `TargetSpec` 与业务身份；
- `LocatorCandidateSet`，允许结构、语义、Anchor、OCR、Layout、Color、Image、Vision 和 Geometry 候选并存；
- `resolveTarget()`、`probeLocator()`、`rankCandidates()`、`testUniqueness()`、`testStability()`；
- `AMBIGUOUS_TARGET` 默认 fail closed；
- Locator History、Repair Proposal 和可审阅 Diff。

### 12.5 可验证动作与业务 Oracle

- `VerifiedAction = Preconditions + Target Resolution + Action + ExpectedTransition + Postconditions + Verifier + Evidence`；
- Verifier Identity、数据源、与执行通道的独立性、信任等级和失败语义；
- 幂等性、Checkpoint、危险副作用的人工确认；
- `reconciliation-required`，用于结果不确定且不能安全重试的情况。

### 12.6 Workflow / Skill / IR / Qualification

- 参数、常量、Config、Secret、运行时数据和业务对象身份；
- Business Step、Skill Contract、Workflow、Branch、Loop、Retry、Recovery；
- 从 Raw Trace 到生成代码的 Source Map；
- 编译器对未知语义 fail closed；
- Replay Matrix、Qualification Profile、Promotion Gate、Runtime Evidence、Drift、Repair 和 Requalification。

## 13. 建议开发顺序

- **P0 结果可信门禁**：Task Contract、业务对象身份、Verifier / Oracle、未知结果不得通过、危险副作用幂等 / 对账。
- **P1 人类可读示范闭环**：Experience Unit、Demonstration Dossier、Intent / Step 重建、分类、语义审核和修订。
- **P2 Browser Recorder Benchmark**：真实 Event Target、多 Selector、唯一性、动态属性、状态等待、断言、变量、业务分段、代码重构和新会话 Replay。
- **P3 统一 Target / State / Surface / Geometry**：在现有截图、Window、Screen、ImageColor 基础上统一坐标空间、Region、Locator Candidate 和 Cache。
- **P4 泛化与 Multi-Demonstration**：参数分类、Skill / Workflow、分支、循环、`record-next`。
- **P5 编译、资格审查与维护**：Canonical IR、确定性 Compiler、扰动矩阵、Repair Diff、Promotion、Drift 和 Requalification。
- **P6 简单桌面应用**：Calculator、Settings、Text Editor，验证 AX、窗口相对 Geometry 和动作后状态。
- **P7 结构化与动态桌面应用**：列表、Dialog、滚动、Resize、DPI、虚拟列表、不完整 Accessibility。
- **P8 千牛 / 微信综合验证**：复杂状态、区域、图色 / OCR / Vision、高风险业务验证和 Recovery。
- **P9 跨应用组合**：优先组合已经独立 Qualified 的子 Workflow，并为 Handoff 定义参数和结果证据，不把跨应用巨型 Trace 直接当成一个可靠程序。

## 14. Benchmark 与验收矩阵

每一级 Benchmark 不只统计“执行成功率”，至少覆盖：

- **语义正确性**：Intent、业务步骤、步骤顺序、遗漏、错误归纳。
- **去噪正确性**：探索、离题、错误、重试、Recovery 的 Precision / Recall。
- **泛化正确性**：参数、常量、Secret、分支、循环和 Skill 边界。
- **目标正确性**：唯一性、多 Locator、一致 Target、错误目标点击。
- **状态与等待**：异步加载、弹窗、滚动和虚拟列表。
- **Geometry**：窗口移动 / Resize、DPI、多显示器、截图与屏幕坐标转换。
- **业务验证**：真成功、假成功、后端拒绝、重复副作用和结果不确定。
- **恢复**：可安全重试、不可安全重试、Checkpoint 和 Reconciliation。
- **成本**：截图范围、上传像素、OCR / Vision / LLM 调用、Token、Cache Hit。
- **维护**：UI 漂移、Repair Diff、回归矩阵和重新认证。
- **可读性**：人是否能只看 Semantic Procedure 判断理解正确，是否能只看业务代码理解 Workflow。

## 15. 目标文档的信息架构决策

本文件最终采用“方法优先、机制随后、案例校准、工程落地”的顺序：

1. 先给结论、层级和 12 阶段执行方法，让人先看懂 Agent 怎样推进。
2. 再解释 Experience Unit、Trace 后处理、变量、多示范、Browser 和 Desktop 迁移。
3. 然后给出感知预算、`qianniu.js` Evidence Case、当前实现差距和公共合同。
4. 最后给开发顺序、Benchmark、自审、原则和参考资料。

从旧版保留并深化的正确内容：

- 第一次执行优先把真实任务做成；
- Evidence 高于 Agent 自述；
- 完整操作经验优于裸 Event；
- Target、Locator 和 Coordinate 必须分离；
- 先在 Browser 跑通低复杂度闭环；
- 正常路径优先缓存、结构化信息和局部低成本感知；
- `qianniu.js` 用于反向校准公共能力；
- 生成程序后必须真实 Replay 和验证。

本轮修正的主要问题：

- 删除“一级主链 / 二级执行链”两条同质名词流水线的混用，把第二条改成真正有阶段门和回退的执行方法；
- 增加 Task Contract、语义批准、工件生命周期、Qualification 和长期维护；
- 把技术模型移到方法之后，避免技术对象覆盖人的思考逻辑；
- 把 `qianniu.js` 从“仅历史文件”纠正为“当前 `master` 真实案例 + 历史演进证据”；
- 区分 OpenDesk 已有截图 / Window / Screen / ImageColor 原语与仍缺的统一 Surface / Geometry / Target / Verifier 契约；
- 明确当前 `pkg/recorder` 是实验性动作记录与扁平 IR 基础，不把目标方法误写为已实现事实。

## 16. 专家自审

本轮按架构方案而不是当前实现成熟度评分。

| 视角 / 指标 | 分数 | 修正后的判断 |
|---|---:|---|
| Programming by Demonstration / Program Synthesis | 97 | 明确单示范欠定、多示范对齐、控制流候选和 `record-next` |
| Desktop Automation / RPA | 96 | Target、Anchor、State、Region、Geometry、Verifier、Recovery 与漂移闭环完整 |
| Agent Architecture | 96 | 区分任务相关外化理由与私有 CoT，支持 Hint、Evidence、反馈、批准和分级感知 |
| HCI / Human-readable Workflow | 97 | 语义叙事、业务步骤和审核位于技术模型之前 |
| Compiler / IR / Code Generation | 96 | 工件生命周期、Canonical IR、Source Map、fail-closed Compiler 和派生代码边界清楚 |
| Reliability / Verification | 97 | Task Contract、独立 Oracle、假成功、幂等、扰动、晋级和 Reconciliation 被纳入主链 |
| Developer Experience | 95 | 公共合同、优先级和 Benchmark 已明确；具体 Schema / API 仍需后续设计 |
| Browser → Desktop 迁移 | 97 | 明确可迁移原则与 DOM、AX、视觉、DPI、多窗口差异 |
| 长期维护能力 | 96 | 漂移、修复、版本、重新认证成为正式阶段 |
| 信息架构与排版 | 96 | 方法优先，模型、案例、API、路线和自审依次展开 |

综合判断：**96 / 100**。未发现仍会迫使一级结构重写的明显缺口，但存在四个不能靠文档消除的工程风险：

1. 当前 `pkg/recorder` 与目标方法仍有较大实现距离，架构分数不能作为实现完成度。
2. 单次示范无法可靠覆盖未出现的分支、循环和异常，必须允许补录或人工确认。
3. 纯像素应用可能没有独立 System-of-Record Oracle，只能诚实降低验证等级，不能把 UI 提示包装成 `VERIFIED`。
4. 截图、剪贴板、旁白和在线 Vision 涉及隐私、Secret 与数据驻留，需与功能同步实现本地过滤和计量。

这些是后续实现与资格审查问题，不再是本文一级方法结构缺失。

## 17. 工程原则

1. 第一次执行先真正完成业务，但必须同步保存可验证语义和证据。
2. Evidence 高于 Agent 自述；工具调用成功不等于业务成功。
3. Raw Trace 不可变；语义分析、泛化、IR 和代码分别版本化。
4. Experience Unit 是 Raw Event 与 Business Step 之间的核心学习单位。
5. 正常路径只保留因果必要行为；探索、错误、重试和 Recovery 作为独立知识保留。
6. 等待表达状态条件，不表达无理由的时间长度。
7. Target 不是 Locator，Locator 不是 Coordinate；Coordinate 只是运行时投影。
8. 一个 Target 保存候选定位集合、上下文、置信度、来源和历史，不永久固化单一坐标。
9. 当前唯一不等于跨运行稳定；唯一性和稳定性都必须测试。
10. 参数在执行时记录候选，在任务后确认；单示范不确定项保持候选。
11. 分支和循环不能从一次偶然重试中直接推断；用多示范或 `record-next` 解歧。
12. JavaScript、Skill 和 Playbook 是派生产物，Canonical IR 才是可重新生成的事实源。
13. Compiler 不得静默忽略未知条件、Verifier 或 Recovery。
14. 正常稳定回放优先结构、规则、缓存和局部低成本感知，尽量零在线 Vision。
15. 高风险动作不能为了省 Token 降低业务验证等级。
16. 无法独立证明关键业务结果时停止、降级或进入 Reconciliation，不伪造成功。
17. 一次 Replay 不能晋级生产；必须通过所选参数、环境、失败和漂移矩阵。
18. 修复是版本化、可审阅、可回归的工程过程，不是失败后追加 magic number。

## 18. 参考资料

### 当前仓库事实

- [`agent-first-recorder.md`](./agent-first-recorder.md)
- [`action-target-model.md`](./action-target-model.md)
- [`app-adapter-contract.md`](./app-adapter-contract.md)
- [`../../frameworks/automation-framework.md`](../../frameworks/automation-framework.md)
- [`../../frameworks/app-development-framework.md`](../../frameworks/app-development-framework.md)
- [`../../frameworks/capability-development.md`](../../frameworks/capability-development.md)
- [`../../../pkg/recorder/`](../../../pkg/recorder/)
- [`../../../examples/app/qianniu.js`](../../../examples/app/qianniu.js)

### 产品与开源系统

- [Chrome DevTools Recorder — Features reference](https://developer.chrome.com/docs/devtools/recorder/reference)
- [Playwright — Test generator](https://playwright.dev/docs/codegen)
- [Playwright — Locators](https://playwright.dev/docs/locators)
- [Selenium IDE](https://www.selenium.dev/selenium-ide/)
- [UiPath — Advanced descriptor configuration / Unified Target](https://docs.uipath.com/activities/other/latest/ui-automation/advanced-descriptor-configuration)
- [UiPath — Semantic selectors](https://docs.uipath.com/activities/other/latest/ui-automation/about-semantic-selectors)
- [Power Automate Desktop — Repair a selector](https://learn.microsoft.com/en-us/power-automate/desktop-flows/repair-selector)
- [Power Automate Desktop — Test a selector](https://learn.microsoft.com/en-us/power-automate/desktop-flows/test-selectors)
- [Microsoft Skill Recorder](https://github.com/microsoft/skill-recorder)
- [OpenAdapt Flow](https://github.com/OpenAdaptAI/openadapt-flow)

### Programming by Demonstration / Program Synthesis

- [AgentPbD: Interactive Agentic Workflow Generation from User Demonstration on Web Browsers](https://doi.org/10.1109/VL-HCC65237.2025.00064)
- [PUMICE: Interactive Task and Concept Learning from Natural Language Instructions and GUI Demonstrations](https://arxiv.org/abs/1909.00031)
- [Programming-by-Demonstration for Long-Horizon Robot Tasks / PROLEX](https://arxiv.org/abs/2305.03129)
- [Sheepdog: Learning procedures for technical support](https://research.ibm.com/publications/sheepdog-learning-procedures-for-technical-support)
- [Integrating Programming by Example and Natural Language Programming](https://ojs.aaai.org/index.php/AAAI/article/view/8695)
- [DiLogics: Creating Web Automation Programs With Diverse Logics](https://arxiv.org/abs/2308.05828)
