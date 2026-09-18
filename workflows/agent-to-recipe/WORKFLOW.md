---
title: "Agent-to-Recipe｜工作流导航与应用工程入口"
description: "Agent-to-Recipe 的手工协调执行规程、交接完整性检查、设计导航及运行边界。"
order: 10
---

# Agent-to-Recipe｜工作流导航与应用工程入口

本文件负责整体工作流导航、手工协调执行规程和当前已存在的方法入口，不是自动调度程序。当前已建立 [application-engineer/SKILL.md](skills/application-engineer/SKILL.md) 方法入口；其余职责只有在对应实现、宿主加载和验证实际完成后才视为可用。本文不复制专业正文，也不自动授予桌面权限。

## 本轮执行规程：从已有成果继续，而不是重新开始

本节是现有 S1—S12 的**手工协调执行清单**，不是新增 Skill、自动调度器或数据格式。默认由当前 Agent 消费真实文件后连续推进；不能调用尚未实现的 `automation-plan`、`trace-distill`、`recipe-build` 或 `recipe-qualify` 命令。专业方法、字段和完整任务树仍分别以原文件为准。

### 1. 固定入口与本轮边界

先读根 `AGENTS.md`、本入口、当前任务包，确认本轮目标、授权、已有成果及首个真实缺口；没有任务包时从用户业务目标进入 S1，不凭空补造历史记录。需要发现或调用 API 时从 [Agent API 短入口](../../docs/api/agent/README.md) 进入相关能力目录，比较候选并取得选中方法的完整正文与必要公共约束，不默认通读机器索引、全部类型或历史案例。[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)第 4—8 节按当前阶段的字段与交接需要读取，不能跳过适用门禁；定位代码还须读下文的定位修复方法。再按真实来源选择：

| 当前任务 | 从哪里继续 | 不允许偷换为 |
| --- | --- | --- |
| 没有既有成果，明确要求新的 Agent 示范与生成 | S1 建立合同与计划，完成全部适用 S1—S12 | 从参考脚本倒推一次“新示范” |
| 已有任务包、脚本、候选或失败记录 | 先盘点与核验；在首个真实缺口恢复 | 因为换了会话而重新演示全部任务 |
| 只缺应用认识、定位规则或局部修复 | `application-engineer` 的 discover／harden／repair | 重建第二套应用工程工作流 |
| 来源是人工 Recorder actions | 返回 [Human 主 Skill](../human-to-recipe/skills/human-to-recipe/SKILL.md) | 改写为 Agent 示范，或跳过 Human plan 门禁 |
| 只需行为保持的 Recorder 静态精炼 | 返回 [recorder-script-refiner](../human-to-recipe/skills/recorder-script-refiner/SKILL.md) | 借“优化”授权语义变更、参数化或真实执行 |
| 候选未变，只缺资格证据 | 固定候选后进入 S12 的适用验证 | 重生成代码，或用旧 pass 代替新环境验证 |

本轮要修改仓库时核对实际分支、HEAD 和相关文件；本地可用时检查 `git status`，只有 GitHub 工具时明确无法观察用户未提交工作区。继续用户指定的现有分支，写入前重读最新 HEAD；不创建新分支、强推或覆盖并行修改。

### 2. 先交一张接续盘点表

读取用户指定的 `.runtime/automation-authoring/<task-id>/`，沿 request／handoff 引用找到合同、计划、AppProfile、过程、候选和资格。没有指定任务包时先根据已给出的任务身份与资产路径检索；不能仅凭“最近修改”选中另一个任务。多个候选无法确定时保留歧义，先完成无副作用的盘点，不擅自操作桌面。

| 已完成、可复用 | 需要补充 | 证据／授权阻塞 |
| --- | --- | --- |
| 实际路径、固定版本／hash、仍适用的范围 | 缺少的业务成果、下一责任环节、最小补充动作 | 缺文件／hash 漂移／现场未知／未获授权，以及解除条件 |

文件存在只能证明有文件，`progress.json` 也只是进度索引。依次核对：同一 task／工作包／attempt → request 版本 → 实际引用字节 → Gate 声明与证据 → 本轮合同、计划和环境适用性。资格不存在、已失效或证据不可复核的部分仍放在后两列，不能以 `completed` 标签提升为可复用。

同一任务只保留一个进度写入者。没有权限读取的本地任务包明确写“未读取”，不能用仓库里的 Calculator golden 充当该任务的真实成果。

### 3. 按当前输入就绪的阶段推进

以下是完整任务树的执行投影，不新增阶段，不要求短任务每个单元格都建一份文件；真正交接仍使用共享合同。

| 现有阶段 | 输入与本轮动作 | 交给下一环节的最低成果／通过条件 |
| --- | --- | --- |
| S1（含前置业务拆解与计划） | 用户来源、目标、已有资产、授权与预算；按业务子目标及依赖拆工作包 | TaskContract／WorkPlan；成功条件、允许副作用、前后依赖和高影响 Unknown 明确；缺授权只做离线整理 |
| S2 | 有效 AppProfile 优先复用；只核查下一步必需的应用／窗口／结果读取能力 | 限定环境的最小应用认识；关键读值不可行时先暴露，不先执行大量依赖动作 |
| S3—S6 | 获准真实示范；执行—观察—验证并保存 planned／actual 差异 | Dossier、实际关键业务值及来源、整次示范的独立结果；工具无报错不是成功 |
| S7 | 消费 Dossier／真实 trace，不从预期结果编造动作 | DistilledSteps；每项保留／合并／省略／恢复有来源，未决动作不进入确定路径 |
| S8—S9 | 从必要路径建立业务步骤和参数关系 | SemanticProcedure；稳定步骤标识、输入来源、前后条件、实际输出、验证及消费者明确；Expected 不能冒充运行读值 |
| S10 | 消费过程及应用缺口；调用现有应用工程方法定向加固 | 有范围与失效条件的定位／读取／等待／动作规则；测量来源、父区域、单位、坐标空间、容差可审阅 |
| S11 | 依据过程、AppProfile 和当前 API 生成普通 JS；仅按需要改进代码 | 冻结 CandidateManifest、真实入口与依赖 hash；完成生成者自检和无输入预检，不把自检当独立资格 |
| S12 | 固定候选与请求验证范围，从干净状态执行真实入口 | QualificationRecord、实际命令、环境、结果及证据；分别记录 pass／fail／not-run／blocked，失败定向回流 |

S8—S11 必须保留跨步骤真实数据依赖。例如当前计算器案例的第二次计算只能消费第一次从 UI 实际读取的 `firstResult`，不能用 expected 或 JS 算术替代。helper 可以表达业务语义，但不能隐式清空状态、偷偷补点或改变用户要求的操作方式。

Measurement／Recorder／Accessibility／OCR 等都只是依据或实现选择。按短入口定位当前方法契约，仅在冲突、缺口或失败时定向核对实现，再消费已有适用证据；不因架构文档出现某个名称就生成未知 API。应用限定的替代定位遵守现有安全模型；任何动作可能已发生或结果未知时立即停止重复输入。

### 4. 交接完整性检查：可执行，但不替代资格

宿主侧只读辅助程序为 [scripts/check-handoff.js](scripts/check-handoff.js)。它检查 `agent-to-recipe/v1` 的 request／handoff 信封必需字段、身份绑定、请求文件绑定、显式引用的文件与 SHA-256，并检查文件是否位于调用者明确允许的根目录。只接受规范相对路径，拒绝跨目录、符号链接、未知根、半写 JSON 和超限输入。

**这是 Node 维护工具，不是 OpenDesk 业务脚本或 Runtime API 测试。** 它不会导入或执行候选、启动新 Execution、修改 progress、生成 handoff、自动恢复或发布。它不是完整 schema／业务 Gate validator，不递归打开产物内部的引用链，也不根据 JSON 中的 `evidenceRoots` 自行扩大读权限。规范化检查不是面对恶意并发文件系统的沙箱；核验前应冻结文件，真正消费前仍需重查版本。

从仓库根目录执行以下命令。`TASK_ID`、`ATTEMPT_ID` 必须替换为已找到的实际任务／尝试；`task` 必须与引用中的 `rootId` 一致，不为适配命令而改写已有引用：

```bash
node workflows/agent-to-recipe/scripts/check-handoff.js --request ".runtime/automation-authoring/TASK_ID/attempts/ATTEMPT_ID/request.json" --handoff ".runtime/automation-authoring/TASK_ID/attempts/ATTEMPT_ID/handoff.json" --root "task=.runtime/automation-authoring/TASK_ID"
```

外部 `Execution.artifactDir` 或已有资产根只有经调用者确认后，才通过额外 `--root "实际rootId=实际目录"` 开放。`rootId` 使用字母／数字开头及字母、数字、点、下划线、连字符；引用路径使用 `/` 分隔的相对路径。不要把仓库根或用户主目录作为省事的通配授权。

退出码 `0` 只表示本工具检查的完整性通过；`1` 表示检查失败；`2` 表示命令参数错误。报告中的 `declared.gateVerdict` 原样表达交接声明，不是重新验收；`desktopActionsAuthorized` 始终为 `false`。失败包也可以完整性通过并进入诊断，但不能因此进入正常生成／运行路径。

检查通过后，由协调者继续核对当前计划、producer 版本、必需输出含义、Gate scope／成功条件覆盖、未决项、副作用、授权预算和真实现场。引用 hash 不证明发布者可信，也不证明 macOS／Windows 任何平台运行成功。Human plan 继续使用其原 validator／scorer，不改造成此工具的输入。

本工具的离线测试命令可从仓库根目录直接执行，fixture 仅生成于 `.runtime/tests/workflows/`：

```bash
node --test tests/workflows/handoff-integrity.test.js
```

### 5. 结束与恢复必须交付什么

先写实际产物，再发布完整 handoff，最后由唯一协调者核对并更新 progress。产物已存在但 progress 落后时补核状态，不重做业务；只有旧 running／done 标签而缺产物时不得跳过。新尝试、新候选与旧证据分别保留，不能覆盖失败历史。

每次暂停、阻塞或交给新会话时，交付**任务根及当前计划版本、可复用成果引用、本轮变更与受影响范围、实际检查结果、未决项／副作用状态、下一工作包与最小安全动作**。这些内容写回现有 progress／handoff／工作包，不另建一套平行状态文件。

网页环境止于能够完成的源文件、离线检查和明确交接；本地再补当前主程序／UI host 的构建与加载证明、真实窗口／业务结果、视觉及平台资格。macOS 通过不外推 Windows 通过；缺设备的项目标未测，不补写通过。需要安装 Skill、统一调度或 Catalog 发布时仍须单独实现与验证，本规程不宣称这些能力已经落地。

## 能力发现与实际调用：两个接入位置

**执行决定：先按业务步骤发现框架能力，再用现有入口做有界操作；生成时复核复用机会。** 不必先增加 Runtime、CLI 子命令或完整 Skill 调度。可直接使用的两段提示词及取证规程集中在[能力发现与代码提炼](design/capability-discovery.md)，不从历史对话拼接。

| 接入位置 | 当前 Agent 必须做什么 | 留在现有工作包中的最低记录 |
| --- | --- | --- |
| S2、S3—S6 的操作前／中 | 按业务意图读相关模块概览及方法契约；选择实际可用入口；执行一个有界片段并观察 | 候选与选择依据、契约来源、实际入口、真实读值与证据、未决副作用 |
| S10—S11 的补强／生成 | 再查框架可复用能力；保留必要业务约束；改变策略后形成新候选并交 S12 重验 | 保留／替换理由、过程与代码对应、候选版本、受影响验证范围 |

默认读取链是：`AGENTS.md` → 本 `WORKFLOW.md` → 当前任务包 → [Agent API 短入口](../../docs/api/agent/README.md) → 当前业务需要的一个或少数能力目录 → 选中方法的完整 canonical Reference 与必要公共约束 → 必要关联类型。只有冲突、缺口或失败时定向深入实现和测试；[框架导航](../../docs/frameworks/README.md)负责方法选择，不是全部可调用 API 清单。[用户 API 总导航](../../docs/api/README.md)仍保留给全部用户，但不是 Coding Agent 日常能力发现的首个详细入口。普通 Coding Agent 不读取机器维护总表来补能力清单；未检索到方法时回到相关 Markdown 目录和 canonical contract，必要时再查类型、实现与测试。`ai schema` 的遗漏不能证明 Runtime 能力不存在。

具体职责仍由当前外部 Coding Agent 手工协调：读取文件、编写短普通 JS、调用适用的 `ai run`／`-script`、读取返回的 artifacts；不假设 Runtime 内部 `Agent.run()` 拥有同样工具权限。可共享原生引用的操作留在同一 Execution；跨 Execution 只传普通数据与证据，并重新解析目标。

从已有任务包接续，不重复加载全部资料或重做已完成业务。资料版本可复用不等于现场状态可复用；源码、实际二进制、平台和权限分别核对。`UI.tapTexts` 等只是候选，不指定全局方法或 backend 优先顺序；使用某个方法时仍遵守该方法自己的 Runtime 默认策略与约束。

## 与普通任务运行及能力发布的交接

跨层唯一架构见 [Automation Capability Lifecycle](../../docs/architecture/desktop-automation/task-capability-lifecycle.md)。本工作流负责生产/维修自动化，不是用户每次自然语言任务的运行链；Chat Runner 的 Runtime 状态机不另建平行 Workflow 目录。

进入本链前先消费明确的 Capability Gap、Failure Package 或已有资产工作包，固定目标、来源、允许副作用与预算。已有有效 AppProfile、过程、候选和证据优先复用；仅缺资格时先重验，仅缺登记时走受控发布，不强制重走新示范。用户在 Normal Mode 确认一次运行，不等于授权 Agent 探索、生成、验收和发布。

出口仍是现有合同下的普通 JS Candidate 与独立 QualificationRecord，再由生命周期的显式发布门登记 Capability。任何代码/依赖修复形成新候选，不能热改生产脚本沿用旧资格；完整发布门与 recipe-qualify 正式入口尚待实施，不因本文存在而自动可用。Agent 的 S1—S12、Human 的 H1—H8 与原始来源分别保留，不把来源适配做成第二份 AppProfile 或业务步骤真相。

application-engineer 保持下述唯一路径，供 Agent、Human 与运行失败维修共享；其局部规则/审阅和资格范围建议不等于整份 Recipe 通过，也不授予最终发布权。详细字段、路由、优先级和跨层任务树只在上述生命周期文档维护。

## 当前可使用的应用工程方法

默认同一个 Agent 按工作流继续。要认识应用、只做界面认识与审阅、补强定位和操作，或依据失败维修时，读取 application-engineer 方法及指定工作包；按 discover／harden／repair 进入。不假设宿主会扫描此目录，不虚构 Skill 调用命令。

```text
当前任务和已有资料
→ 认识与规则足够且仍适用：核对现场后复用并继续
→ 有缺口：进入 application-engineer 对应子作业
  → 界面认识与审阅：材料检查、模型提取、同版视图、纠错和限定发布
  → 规则与操作补强：只补所需定位、读取、等待、动作及后置验证
  → 定向维修：消费具体失败和旧版本，保留有效部分并交重验范围
→ 返回当前工作流，或明确阻塞及已完成的局部成果
```

ui-understanding 只是认识子作业标签，不是第二个正式 Skill。仅认识完成不等于定位、操作或业务通过；工作包内部不逐步骤创建交接，真正发布时仍遵守共享合同。详细路由见[链路设计](design/chain-design.md)，批次完成标准见[验证计划](design/validation-plan.md)。

遇到会话列表、消息时间流、订单表、文件列表等重复 UI 数据时，应用工程仍负责认识区域、item 边界和必要模型提取；跨应用 Runtime 的 Collection／Observation／VLM／滚动遍历职责不在本工作流重复设计，统一参考[Structured UI Collection Reading](../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。其中 `UI.readCollection()`、`UI.collectCollection()` 和 `SemanticVisionProvider` 当前是 Target contract，不得当作已发布接口调用。

## 开发期策略适配、生成自检与失败维修

生成／修改 UI 定位与动作代码，或遇到观察、定位、读取、状态准备及结果验证缺口时，必须读取[UI 定位失败诊断与修复](../../docs/frameworks/ui-locator-repair.md)。其核心是“目标与验收不变，方法可以依据证据调整”，OCR 别名和原生语义只是实例。它补充现有应用工程方法，不增加 Skill、阶段、公共 API 或自动调度程序。

```text
固定业务目标、授权、数据依赖与成功条件
→ 核对并复用已有适用能力，提前识别当前任务的策略弱点
→ 选择最小必要策略，复用／生成候选
→ 无输入预检当前阶段必要目标与结果读取方式
→ 获准最小真实执行与独立结果验证
→ 缺口：保留证据并分类，进入现有应用工程 harden／repair
→ 在不变量内调整最小策略，形成新候选并重验
→ 返回当前流程，交接采用依据、适用范围、失效条件及未测项
```

S10 消费策略选择、风险和定位证据，S11 执行生成者自检，S12 负责验证与定向维修回流；已知缺口在前面的应用发现阶段即可处理，不要求故意制造失败。编号和共享合同不变。最小策略决定记录沿用方法正文第 1 节，附在现有工作包中，不创建第二套 schema。

开发期可以选择或替换策略，正常运行选择已验证的公开 API；其默认 auto 定位策略由 Runtime 内部执行，不要求调用者重复配置。最终代码可以只保留一条可靠路径，不要求每个按钮包含 OCR、Accessibility、图像和 fallback 字段。已有本地实现优先核对复用，不重复建设或按讨论对象重构；没有代码缺口时只补方法、记录或验证。

应用内有据 OCR 别名、一次 OCR 批量预检、模板／原生语义、Recorder／测量规则和开发期视觉模型补证均按该方法的边界选择。别名不能补回漏检，批量预检不授权永久复用坐标，输入可能已发生时不能换 backend 重复点击。需要改变业务动作、结果来源要求或成功标准时返回任务合同确认，不能把需求变更叫作容错。Human 来源继续沿用自身来源记录和完整 Skill 路由，不能扩大静态精炼权限；没有真实环境时不声称真机通过。

## 从当前目的进入

- 先看[设计总纲](design/README.md)，了解当前有效决定、文件职责和待完成事项。
- 明确项目背景、业务交付与本轮建设要求：看[需求与基线](design/requirements.md)。
- 理解完整需要做什么：看[任务分解树](design/task-decomposition.md)。
- 明确由谁做、消费什么、交付什么：看[链路设计](design/chain-design.md)。
- 深入专业问题：看[应用操作](design/application-operations.md)或[独立代码改进](design/code-rebuild.md)。
- 提前识别策略弱点、处理观察／定位／读取失败，或选择局部适配和替代方法：看[UI 定位失败诊断与修复](../../docs/frameworks/ui-locator-repair.md)。
- 需要把 list／table／timeline 等重复 UI 转成通用 `Item[]`，或设计 VLM fallback、虚拟列表、滚动连续性与合并去重时，看[Structured UI Collection Reading](../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。
- 确认怎样证明通过：看[验证计划](design/validation-plan.md)和[计算器案例](cases/calculator.md)。

## 使用依据与编号

阶段和来源对照见[完整任务树](design/task-decomposition.md)。S1—S12 沿用现行合同，R1—R13 是讨论视图；只有需求和合同本身发生变更时才重新评估编号。

## 主任务树

唯一设计正文在[Agent-first Recorder｜工作流任务分解树](design/task-decomposition.md)，保留三种起点、五个大类及全部关键子任务，不在本入口复制。用户提供的界面认识简化树用于增量补齐，不替换完整任务树。

## 三个循环与工件关系

执行、学习、可靠性循环和成果关系继续在任务树维护，实际组合与交接在链路设计中确认；AppProfile 及应用工程增量字段唯一维护在[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)。

## 十三节点讨论视图

完整 R1—R13 见任务树，具体代入见计算器案例。

## 专业责任、交接与长任务接续

- 正式执行前核对本次目标、来源、权限、实际宿主、工具、输入版本与场景；设计文档不能替代这些前提。
- 同一个 Agent 可连续承担专业工作和检查；独立上下文测试须真实隔离，不能以在同一对话切换角色冒充通过。
- 生成与可选改进分开，失败按原因返回，不必所有任务重走完整链。结果可能已经生效时先核对，不从头重放。
- 正常保存必要事实，异常再展开诊断，不等失败后补造现场。原图、审阅、规则与验证不混用版本；只有认识时不声明已有可靠操作。
- 当前已建立 application-engineer 方法入口，但实际模型提取、审阅辅助程序、留出规则测试、宿主加载和真实桌面验收仍按验证计划分批完成；未运行项如实保留。
