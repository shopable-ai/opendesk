# 示范到自动化制作方法｜跨来源共享方法

## 阅读入口与职责边界

本文只维护 Human、Agent 和已有自动化资产都能复用的“示范到自动化制作方法”，**不拥有第三套生命周期编号**。

正式 Workflow 只有两条：

- [Agent-to-Recipe](../../workflows/agent-to-recipe/WORKFLOW.md)：内部阶段仍是 S1—S12。
- [Human-to-Recipe](../../workflows/human-to-recipe/README.md)：内部阶段仍是 H1—H8。

人工关键录制后由 AI 接续，不新增 Hybrid-to-Recipe。Human 提供的真实事实仍是 Human 来源；AI 后续真实执行产生的动作和 observation 仍是 Agent 来源。共同制作的固定引用、Known / Unknown、最小补证和来源边界由[共享制作与分段补证合同](agent-to-recipe-skill-contract.md#shared-authoring-contract)统一定义。

本文的共享主线只有一条无编号方法链：

~~~text
目标
→ 事实
→ 解释
→ 必要路径
→ 数据关系
→ 缺口补证
→ 应用工程
→ Candidate
→ Qualification
→ 后续维护
~~~

这是一组共同问题，不是 S1—S12 或 H1—H8 之外的新阶段。已经被充分证明的工作可以复用，只从第一个真实缺口继续。

普通 Recipe 的目标交付是普通 OpenDesk JavaScript。Human + AI 发生在制作阶段，不意味着最终运行时必须由 Agent 每一步重新观察、推理和点击。本文后半部分保留 Experience Unit、Target / Locator / Geometry、感知预算、Browser/Desktop 和案例等技术方法，供具体 Workflow 按需调用；它们不是普通 Recipe 的强制 IR / Compiler 前置，也不能因文档存在就宣称 Runtime、Recorder 或真实业务资格已经实现。

## 1. 六个层级及其边界

原始需求最准确地横跨六个层级，其中只需要新增一个此前没有被清楚表达的层级。

### A. 系统一级架构

回答：Recorder 从任务输入到正式自动化，整体需要哪些系统能力。

**真实任务执行；证据采集；界面与状态重建；目标语义落地；行为规律归纳；统一自动化模型；Workflow / Skill 合成；健壮性工程；编译生成；真实回放与验证；运行维护与修复。**

这是系统地图，不应承担逐步教学。

### B. 跨来源共享制作方法

回答：Agent / 人在一次真实任务及其后续工程化过程中，怎样观察、操作、记录、复盘、抽象、生成、验证和修复。

这是本文的共享方法层，不新增阶段编号。跨应用可反复使用的任务求解模式已独立提炼到[任务求解方法](automation-problem-solving-framework.md)，本页不再维护另一套平行模式分类。共享方法必须包含：

- 当前目标和要解决的不确定性；
- Agent 此时在想什么；
- 实际做什么；
- 同时留下什么；
- 怎样判断阶段完成；
- 判断错误时回到哪里。

### C. 自动化知识与工件关系

这一层只回答权威工件之间怎样引用、哪些内容不可被覆盖；它不是第三套 Workflow 或生命周期。

**Task Contract；Raw Trace；Experience Unit；Demonstration Dossier；Semantic Procedure；Generalized Workflow / Skill Spec；Automation IR；Compiled Artifact；Qualification Record；Runtime Evidence；Repair Patch。**

推荐的工件关系为：

`Task Contract + 不可变 Raw Trace + Evidence` 形成 `DemonstrationDossier`；经人类可读的语义重建和批准形成 `Semantic Procedure`；经泛化形成 `Generalized Workflow / Skill Spec`；经目标、状态、Geometry、Verifier 和 Recovery 工程形成 `Automation IR`；再派生 JavaScript、Skill、Playbook 或其他运行产物。

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

## 2. 本文不是第三套 Workflow

S1—S12 和 H1—H8 分别由各自 Workflow 拥有。本文不再维护“阶段 1 → 阶段 2 → ……”的另一套编号，也不把运行维护包装成 S13。

同一个制作任务可以从 Agent 自主示范、Human 完整录制、Human 关键片段 + Agent 补证，或已有 Recipe / AppProfile / Qualification 的维修入口进入。入口不同，但可以共用下面的问题；共同方法不要求共用一个伪造的原始事实格式。

## 3. 跨来源共享制作方法

### 3.1 目标：固定最终要做成什么

明确业务结果、输入、授权、成功/失败条件和最终结果怎样被证明。目标可以在录制后补充，但保留真实形成时间；事后说明不能冒充录制前已存在的意图。

### 3.2 事实：只记录实际发生过什么

Human raw/actions、Recorder 采集事实、Agent 动作、Agent observation、用户明确要求、已有资产版本、Qualification 结论分别保留真实来源。工具调用成功不等于业务成功；Expected 不等于 Actual；旧资格不等于新 Candidate 的资格。

### 3.3 解释：恢复业务含义，但不改写事实

解释可以说明动作为什么存在、多个动作构成哪个业务步骤、某个读值由谁消费。解释必须能回指事实；缺证据时写 Unknown，不通过语言自信补齐。

### 3.4 必要路径：只保留真正推进业务的部分

探索、误点、无效重试和 Recovery 可保留在 Evidence 中，不必进入正常 Recipe。删除、合并或重排动作前，要证明目标、输入输出和副作用没有被改变。

### 3.5 数据关系：明确运行时 producer → consumer

每个运行时值都回答：由什么实际读取产生、保存在哪里、允许怎样变换、由谁消费、Fresh Run 是否必须重新取得。数值相同不是因果，正确常量也不能代替真实 producer。

### 3.6 缺口补证：只补阻塞最终 Recipe 的最小信息

先列 Known、Unknown 和 blocker。补证优先顺序：

~~~text
已有固定材料
→ 获准只读观察
→ 获准 Agent 定向执行
→ application-engineer 补应用规则
→ 只有真正无法推断的关键业务片段才请求用户定向补录
~~~

录制包完整性与业务覆盖度是两件事。actions ready 不能解释成整项业务已证明；部分录制也不能自动解释成必须完整重做。

### 3.7 应用工程：让正确过程可以可靠操作

Target、Locator、Geometry、读取、等待、动作策略、Verifier 和 Recovery 服务于已确认业务语义。应用工程不能把业务要求换成更容易实现的另一个任务，也不能用 API 名称冒充当前环境已经验证通过。

### 3.8 Candidate：生成普通、可维护、可重复执行的 JavaScript

Candidate 消费已确认的业务过程、运行时数据关系和应用规则。正常稳定运行不依赖在线 Agent 每步重新思考；完整来源审计、固定 Oracle 和截图矩阵留在 Qualification / Evidence。

### 3.9 Qualification 与维护：验证 exact Candidate

冻结实际 Candidate、入口、依赖和支持范围，再从干净状态执行，并用独立 observation / Oracle 判断结果。Candidate 改变后旧资格失效；not-run、blocked、synthetic 或旧 hash 不能升级为 PASS。

运行失败时按第一个真实缺口定向维修：业务语义错回业务 owner，定位/读取/等待错回 application engineering，代码实现错修 Candidate，资格证据不足只重跑受影响资格；有效上游不机械重做。

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

本节是千牛案例的维护正文。可跨应用复用的六类解题模式及步骤交接统一见[自动化任务求解方法](automation-problem-solving-framework.md)。源码做法、从中提炼的方法和改进后的目标合同必须分开阅读；案例代码存在不等于定位、发送或发货已经得到当前真机验证。

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

### 10.7 Framework 回落到普通 Recipe：新旧对照样本

2026-09-18 增加普通 Recipe 对照，不覆盖早期实现，也不把本案例转成 Recorder／IR／Compiler 专项：

| 文件 | 角色 |
| --- | --- |
| [`examples/app/qianniu.js`](../../examples/app/qianniu.js) | Legacy / Evidence Case：保留真实人工实现、调试债务和历史业务分支，原文件未修改 |
| 本节 10.2–10.6 | 从实际代码中提炼窗口、状态、业务对象、定位、数据依赖和副作用验证原则 |
| [`examples/app/qianniu-recipe.js`](../../examples/app/qianniu-recipe.js) | Refined ordinary Recipe：用普通函数重新落实原则，显式 `main()`，不依赖新的编排系统 |

新版 `runOnce()` 的业务顺序是：确认待处理通知 → 读取状态与收件人 → 找到唯一联系入口 → 打开并核对接待窗口 → 确认单个可见订单 → 复制实际商品标题 → 查询匹配商品 → 生成文案 → 原生写入并回读草稿 → 返回明确结果。原文件末尾实际调用 `clickCopyAndInputProduct()`，最终以 `shouldSend=false` 准备草稿；新版保留这一安全上限，不把旧文件中的其他自动发送／发货分支引入默认业务。

| 提炼出的原则 | 新版落点 | 无法证明时的行为 |
| --- | --- | --- |
| Observation → State interpretation → Business eligibility | `readActualText`、`interpretStates`、`observeNotification`、`observeOrder` | 颜色不是业务状态；缺失、歧义、状态冲突或收件人不符立即停止 |
| Target／Region／Geometry 分离 | `region`、`cardFromStatus`、`copyOptions`；实际 `Geometry` 与同帧文字参照物 | 重新读取同一窗口并计算区域；越界、超出资格尺寸、多订单均停止，无固定矩形兜底 |
| 真实数据按步骤传递 | UI 实际标题 → 新剪贴板文本 → `queryProduct` → `composeMessage` | 剪贴板必须变化且匹配标题；HTTP、业务码、响应字段或商品标题不匹配不得生成正常消息 |
| Action 与 Verification 分开 | `submitOnce`、`prepareDraft`；原生同引用回读后再读取最终输入框并核对上下文 | 不以无异常／`return true` 为成功；不覆盖已有不同草稿，不降级为盲目键盘粘贴 |
| 副作用不确定先核对 | `pendingAction`、`failedResult` | 已提交动作后的只读错误，即使标记 `not_started`，也不能抹去此前副作用；返回 `uncertain`，停止重试 |
| 单次业务与长期等待分开 | `runOnce`、独立且默认不调用的 `supervise` | 只在无通知且所有动作计数为零时有界退避；草稿成功、失败或不确定都会停止，不自动处理下一订单 |

本轮完全没有加入发送／发货函数或可启用它们的配置。`success / DRAFT_VERIFIED` 只证明本次可观察上下文下完整草稿回读匹配，不证明消息已发送、订单已发货或独立业务后台已确认。`conversationId` 与 `orderId` 明确为 `null`；可见收件人、单个订单、状态与标题只是有限依据，同收件人／同标题多订单不能据此可靠消歧。

#### 配置、应用知识与运行边界

配置从 `.runtime/recipes/qianniu/config.json` 有界读取；[配置模板](../../examples/app/qianniu-recipe.config.example.json)故意将未实测的标题、区域、尺寸和原生控件标识留空／`null`。直接复制未填写的模板会安全停止，不表示已有可用千牛布局，不沿用旧 INI／全局 `config` 或 `serviceReady`。

窗口应用知识仍明确限定为早期案例的 Windows `AliWorkbench.exe`。需要填写当前账号完整通知／接待标题、实测逻辑尺寸范围、收件人／状态／联系／订单区域，以及真实唯一聊天 `textField` 的 `name` 或 `identifier`。区域采用父区域的 `0..100` 百分比；订单卡片上下关系以订单面板高度为父级、当前状态文字为参照，标题区域再相对于卡片。订单面板应排除状态筛选标签等非订单内容，且本候选只支持一个可见订单，不能把合成测试的布局抄成真机测量数据。

先填写实际配置并以 `mode: "inspect"` 在已由用户打开、处于前台的接待窗口做只读预检：它不激活、联系、复制、调用商品服务或写入，也不会自动授予资格。它只检查当前接待页，通知到接待的收件人绑定仍需单独真机核验。实际布局／文案／复制／输入框无发送副作用等检查通过后，记录依据，才设置 `layout.qualified`、`layout.evidence`、`layout.exclusiveInteraction`，并为 `mode: "draft"` 分别明确 `allowDraft`、`allowProductQuery`。这些字段是维护者的资格声明，不是程序自行证明过真机的证据。

新版只复用当前已公开且有实现的 [Window](../api/window.md)、[Geometry](../api/geometry.md)、[UI](../api/desktop-ui.md)、`File.readJSON`、`clipboard.paste` 和 `axios.get`；其中部分 Window／原生文本接口仍为 Experimental，真实平台能力和权限不满足时停止。业务方法中的状态与结果 helper 只是本文件的 JavaScript 函数，不是新 Runtime API。

仍需注意：原生文本框不可读写时无键盘兜底；商品服务必须返回与实际复制标题匹配的成功结果；剪贴板原本已是同一标题时，本轮不清空它制造探针，而是报告无法证明新复制。前后检查不是跨窗口业务上下文与输入的原子事务，运行期间不得有并发人工或其他自动化操作；任何收件人、标题或焦点变化均应停止并核对实际效果。

#### 验证入口与本轮证据等级

从仓库根目录执行宿主侧结构／合成检查：

```bash
node --test tests/recipes/qianniu-recipe.test.js
```

本轮实际结果为 **53 / 53 通过**：1 项结构／async 包装解析检查，加 [52 项共享合成场景](../../tests/recipes/qianniu-recipe.contract.js)。这些测试加载未改写的正式 Recipe，复用当前真实 Geometry 源码；窗口、UI、剪贴板、HTTP 和草稿动作使用受控替身，不代表千牛真机成功。

当前 OpenDesk Runtime 的独立解析／合成入口和普通业务入口分别为：

```bash
./dist/opendesk -script tests/recipes/qianniu-recipe-runtime.js -console-mode script
./dist/opendesk -script examples/app/qianniu-recipe.js -console-mode script
```

Windows 使用本机实际构建的 `.exe` 路径。[Runtime 合成入口](../../tests/recipes/qianniu-recipe-runtime.js)继续只运行这 52 项合成场景，即使通过也不等于真实千牛资格。本轮网页执行环境没有可用 OpenDesk 构建物，**真实 Runtime 解析／执行未运行**；真实通知／接待绑定、布局／DPI／窗口平移、剪贴板内容、商品服务合同和原生聊天框草稿写入全部标为 **需要真机资格验证**。后续不得将 Node 检查、配置中的 `qualified` 或旧样本当作这些项目已经通过。

普通入口输出 `QIANNIU_RECIPE_RESULT`，应检查 `status`、`code`、`pendingAction`、动作计数与 `next`。配置失败会明确 `blocked / CONFIG_READ_FAILED`；有处理结果的进程退出码不能替代草稿成功判断。测试日志、配置、截图及资格证据留在 `.runtime/`，不写回 Legacy 源码。

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
- **目标正确性**：唯一性、多 Locator，一致 Target、错误目标点击。
- **状态与等待**：异步加载、弹窗、滚动和虚拟列表。
- **Geometry**：窗口移动 / Resize、DPI、多显示器、截图与屏幕坐标转换。
- **业务验证**：真成功、假成功、后端拒绝、重复副作用和结果不确定。
- **恢复**：可安全重试、不可安全重试、Checkpoint 和 Reconciliation。
- **成本**：截图范围、上传像素、OCR / Vision / LLM 调用、Token、Cache Hit。
- **维护**：UI 漂移、Repair Diff、回归矩阵和重新认证。
- **可读性**：人是否能只看 Semantic Procedure 判断理解正确，是否能只看业务代码理解 Workflow。

## 15. 本文的信息架构

本文件按“共享问题 → 技术方法 → 案例校准 → 工程边界”组织：

1. 顶部说明两条正式 Workflow 和无编号共享主线，避免把本文当成第三套生命周期。
2. 目标、事实、解释、必要路径、数据关系、最小补证、应用工程、Candidate 与 Qualification 是共同问题。
3. Experience Unit、变量、多示范、Browser/Desktop、Target/Locator/Geometry 和感知预算只作为按需方法。
4. qianniu 等案例用于反向发现能力缺口；实现位置、Benchmark 和参考资料继续明确证据边界。

继续保留的核心原则：真实 Evidence 高于自述；Target、Locator 与 Coordinate 分离；Trace 不直接等于 JavaScript；生成程序后仍需独立验证；运行失败只修真实受影响边界。

本轮收敛掉的是“本文自己维护阶段 1 到阶段 13”的职责。正式阶段只属于 Agent-to-Recipe 的 S1—S12 和 Human-to-Recipe 的 H1—H8；本文不再拥有 S13，也不要求普通 Recipe 为了使用共享方法先建设大型 Automation IR / Compiler。

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

- [`agent-first-recorder.md`](../architecture/desktop-automation/agent-first-recorder.md)
- [`action-target-model.md`](../architecture/desktop-automation/action-target-model.md)
- [`app-adapter-contract.md`](../architecture/desktop-automation/app-adapter-contract.md)
- [`automation-framework.md`](automation-framework.md)
- [`app-development-framework.md`](app-development-framework.md)
- [`capability-development.md`](capability-development.md)
- [`../../pkg/recorder/`](../../pkg/recorder/)
- [`../../examples/app/qianniu.js`](../../examples/app/qianniu.js)

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
