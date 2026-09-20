# Agent-to-Recipe：独立 Skill 与成果交接合同

状态：作业规范文档 v1.2，2026-09-13 增补跨来源 Capability 发布交接；2026-09-11 修订计划—事实—关键步骤交接与目标专业职责，应用工程增量原修订于 2026-09-08。原记录日期：2026-09-06；实际执行仍须核对当次代码、构建物、Skill 宿主与接口。文档版本不自动升级 request／handoff／AppProfile 或 Human schema。规范、职责名称或 Skill 文件不证明宿主调度、权限隔离、自动校验或桌面测试已经实现／通过。

## 1. 定位与唯一职责

本文件维护 Agent-to-Recipe 专业作业的输入、输出、交接和恢复约定，并维护 Human／已有资产进入共同资格与发布出口时的最小适配约束，不另建开发阶段或业务执行引擎。S1—S12 仍是生命周期阶段；专业职责与阶段不是一一对应。当前已有 `application-engineer`、`trace-distill`、`procedure-synthesize`、`code-rebuild`、`recipe-qualify` 五个方法文件，支持当前 Agent 显式读取；宿主发现／加载与独立上下文验证仍须另外证明。Human 的两个现有 Skill 保持独立来源和方法，不因复用本合同而改成 Agent 示范。

- 阶段与完整生命周期：[示范到自动化执行方法](demonstration-to-automation-pipeline.md)。
- 业务拆解、数据依赖和六类解题模式：[自动化任务求解方法](automation-problem-solving-framework.md)。
- 专业操作依据：[应用开发框架](app-development-framework.md)、[总体执行闭环](automation-framework.md)。
- 可调用能力：[API 入口](../api/README.md)、[Execution](../api/execution.md)、[扩展放置原则](runtime-api-extension-framework.md)。
- 已有质量体系：[G0—G7](../quality/gates-and-evidence.md)、[失败分类](../quality/failure-taxonomy.md)。不另造平行 Gate／Failure 编号。
- 工作流导航及五个方法文件：[当前入口](../../workflows/agent-to-recipe/WORKFLOW.md)。旧 prompts 目录不是有效入口；方法文件不证明当前存在已安装实现。
- 原首个验证任务：[计算器规程](../quality/agent-to-recipe/calculator-validation.md)。行为案例与应用工程评测沿用[当前验证计划](../../workflows/agent-to-recipe/design/validation-plan.md)。
- 跨 Runtime／Catalog／Authoring 生命周期、CapabilityDefinition／CatalogEntry、运行路由与 P0／P1 优先级：[Automation Capability Lifecycle](../architecture/desktop-automation/task-capability-lifecycle.md)。本文第 10 节只拥有跨来源作者交接约束，不复制第二套运行状态机或能力目录字段。

业务 Skill／普通 JS helper 与本文 Agent 专业作业不同。前者在业务运行中复用动作；后者生产并验证业务程序。本文不强制所有短 Recipe 创建整套工件；申请进入 Normal Mode 可信目录时，仍须满足第 10 节及生命周期总纲的独立资格和明确发布门。

### 路线 A 的边界

Agent 使用 OpenDesk 当前能力完成真实任务，保存关键事实，先从执行事实提炼必要路径，再形成业务语义、参数和复用规格，直接交付普通 JavaScript Recipe／Workflow，并由现有入口 Fresh Run 验证。不建设 Browser Recorder、Go Distillation Runtime、可执行 Skill／Workflow IR、Recorder Compiler、独立 Replay Runtime 或专用运行入口。

用户仍以自然语言、截图、样例或已有资产表达任务；`TaskContract`、`WorkPlan` 是 Agent／宿主为接续生成的内部结构化成果。用户纠正的是业务含义，不要求编辑 JSON。任务合同定义正确性；操作计划表达“准备怎样做”；Evidence 证明“实际发生了什么”；DistilledSteps 表达“哪些实际动作构成必要路径”；SemanticProcedure 表达“怎样解释和复用”；普通 JS 定义业务执行。它们不能互相冒充。

已有普通 JS 的接续也是路线 A 的受限入口：先冻结资产来源和内容，再按实际目标选择原样复用或最小修复，只补当前交付所需的证据、过程和验收缺口。既有代码或历史运行不能被追认成一次新的 Agent 示范；接续验收通过也不能表述为完整新生成链通过。用户要求完整新 Agent 示范／新生成时，仍须满足 S1—S12 的全部适用要求。

## 2. 目标专业职责与阶段映射

原六项职责保留为历史来源；当前职责增加 S7 `trace-distill`，并将 `procedure-synthesize` 收窄为 S8—S9。`code-rebuild` 继续作为独立、可选职责；`recipe-qualify` 已形成 S12 正式方法文件。下表是职责合同；方法文件的存在不表示宿主已安装它们。

| 专业职责 | 方法阶段 | 主要输入 | 本环节必须保存的主产物 | 正常消费者 |
| --- | --- | --- | --- | --- |
| `automation-plan` | S1，含前置拆解与操作计划 | 用户自然语言／样例／已有资产、授权来源 | TaskContract、WorkPlan、可读任务／操作计划视图 | 应用工程、示范及所有后续环节 |
| `application-engineer` | S2、S10 | 合同、所需操作、观察证据或定向缺口 | AppProfile、必要普通 JS helper、同版审阅／验证记录 | 示范、提炼、生成与验收，各按限定范围消费 |
| `task-demonstrate` | S3—S6 | 合同、操作计划、应用资料、获准业务输入 | DemonstrationDossier、planned／actual 对应、关键业务值及证据索引 | trace-distill／诊断 |
| `trace-distill`（方法文件已实现） | S7 | 合同／计划、Dossier／Raw Trace、必要应用资料 | DistilledSteps、原 action 取舍、必要路径、恢复候选与未决项 | procedure-synthesize、步骤试执行、诊断 |
| `procedure-synthesize` | S8—S9 | 合同、DistilledSteps、应用资料及补证 | SemanticProcedure、Business Step、参数与数据依赖 | 应用补强、生成 |
| `recipe-build` | S11 的路线 A 实现 | 已确认过程、应用资料、当前 API | 普通 JS、CandidateManifest | 按需代码改进或验收 |
| `code-rebuild`（方法文件已实现） | S11 内可选／独立入口 | 代码基线、明确需求与改进目标、相关应用规则 | 原样保留结论，或新候选、变更理由、检查结果与重验范围 | 验收 |
| `recipe-qualify`（方法文件已实现） | S12 | 冻结合同、候选版本、验证场景 | QualificationRecord、Recipe Review、失败及修复请求 | 协调者／交付者 |

S1 先从用户原始来源形成任务合同和粗粒度业务任务树，再形成可审阅的业务操作计划。初始计划允许明确的 Unknown，禁止编造全部点击细节；需要依赖关键能力的大量后续动作前，应优先核实会推翻路线的高影响未知。S3—S5 是计划、操作、观察、验证和修订的微循环；S6 是整次示范的业务验证。一个工作包完成不代表全部任务完成。

```text
新任务／完整新生成
→ 自然语言目标与来源
→ TaskContract／WorkPlan + 可审阅操作计划
→ 应用初步认识与关键可行性核查
→ 按计划真实示范并逐节点保存 planned/actual 事实
→ S7 DistilledSteps：从事实提炼必要路径
→ S8—S9 SemanticProcedure：语义、数据关系与复用规则
→ 按缺口补强应用能力（无缺口则复用）
→ 直接生成普通 JS
→ 按需 code-rebuild
→ 独立 Fresh Run 验收
→ 交付，或按问题归属定向返回

已有普通 JS 接续
→ 规划并冻结已有资产、目标范围与证据作用
→ 盘点适用证据，并按真实缺口定向补证
→ 已有 DistilledSteps／Procedure／AppProfile 有效则直接复用
→ 原样复用，或只对已确认缺口做最小修复
→ 为冻结候选建立清单
→ 独立 Fresh Run 做明确范围的验收
→ 限定范围交付，或按问题归属定向返回
```

接续分支复用现有职责和十二阶段，不新增阶段或执行入口。未调用的环节表示本次接续范围不需要它，不表示相应完整开发 Gate 已通过。

应用工程每次调用明确 `discover`、`harden` 或 `repair` 模式；不是重复研究整个应用。discover 不要求完整 SemanticProcedure；harden 消费已确认过程和工程缺口；repair 消费旧规则、具体失败和受影响范围。仅界面认识与审阅是交付范围，不新增模式或 ui-understanding 独立 Skill。

AppProfile 的事实条目标注 `observed`、`demo-confirmed` 或 `qualified`，且附环境范围和证据；阶段名称本身不能自动提升成熟度。模型解释与候选并非事实，不能为满足枚举而伪标 observed／qualified；其认识依据与候选状态按下文分开保存。

## 3. 调用与宿主责任

默认由同一个 Agent 按工作流顺序使用专业方法。Skill 不等于 Agent 或进程；返回某项职责不要求换 Agent。正常使用与独立性测试不同：独立性测试让未参与上游的执行者仅凭指定方法、合同和输入接续，或准确指出缺失项；不通过复制全部聊天补救接口缺陷。

宿主可顺序执行，也可提供分离上下文；必须记录实际方式。同一 Agent 可以执行冻结候选的测试，但须使用事先确定的标准和独立结果来源，不以自述作 Oracle。没有独立上下文能力时，不宣称通过“无历史上下文交接测试”。Skill 文件不会自动安装、注册、运行、调度或隔离权限。

薄协调者只负责：读取合同／计划／状态；选择输入就绪的工作包；派发调用；检查交接完整性及 Gate；维护唯一进度；管理预算、暂停、取消与计划变更；把失败送回责任职责。协调者不代替专业判断，也不自行修改验收标准。V1 可以由具备文件与工具能力的 Agent 宿主执行这些步骤，不依赖新增 Go 管理器；协调者也是职责，不强制独立 Agent。

同一任务只有一个进度写入者；同一桌面同一时刻只有一个操作拥有者。离线分析可并行，桌面输入不得并行。宿主不支持强制工具隔离时，记录限制，不得承诺无人值守高风险安全。

## 4. 工作包与文件组织

先按可独立解释、验收、接续的子目标拆分，再按数据和现场依赖组合。阶段、Skill、工作包、JS 文件不是一一对应。多个工作包最终可以交付一个普通 JS 文件；是否拆代码文件以当前 Runtime 加载能力为准，不凭空使用 import／require。

同一工作包内的截图、认识、审阅和规则整理直接共享明确版本的数据，不为每个子步骤创建新 request／handoff。只有真正派发、发布或另一次尝试才处理对应边界；不能因此省略已有 request／handoff 必需字段。可由程序生成的引用、hash 和摘要不反复要求 Agent 手填。输入版本改变仍执行第七节影响分析。

任务根目录由协调者选定并保存绝对解析基准，例如：

```text
.runtime/automation-authoring/<task-id>/
  user-task.md                  # 用户自然语言／来源，非共享 Skill；不是 TaskContract JSON
  plan/r001/task-contract.json
  plan/r001/work-plan.json
  plan/r001/task-brief.md       # 可选同版可读视图，不是第二份权威需求
  plan/r001/operation-plan.md   # 可选同版可读视图，不是第二份权威计划
  steps/W010.md                 # 必要时才拆工作包说明；不要与 DistilledSteps 混淆
  progress.json                 # 唯一当前状态；可由已发布交接重新核对
  attempts/<attempt-id>/
    request.json
    <本专业作业的主产物>
    handoff.json                # 所有输出完成后才发布
```

目标主产物分别为 `task-contract.json`／`work-plan.json`、`app-profile.json`、`dossier.json`、`distilled-steps.json`、`procedure.json`、`candidate.json`、`qualification.json`。可读视图（如 `task-brief.md`、`operation-plan.md`、`distilled-steps.md`、`procedure.md`）必须引用同版结构化主产物，不形成平行真相。请求固定引用实际版本，不盲读 `latest`。文件可通过明确引用共用，不复制多套权威数据。

每个工作包写明：稳定 ID、子目标、责任职责、依赖、输入、现场前提、预期输出、成功标准、允许副作用、探索／执行／重试预算、恢复边界。工作状态使用 `pending / ready / running / blocked / passed / failed / needs-revalidation / canceled`，不以时间推算完成百分比。

真实 JS 运行的截图、日志和业务结果优先使用 `Execution.artifactDir`；任务目录只保存必要索引和交接。证据位于任务目录之外时，由协调者登记该 execution 的允许根目录及 executionId，再引用相对路径。不得为了读取交接而允许任意本地绝对路径。

遵守根 [AGENTS.md](../../AGENTS.md)：`.runtime/` 是可清理目录而非永久知识库。活跃任务由宿主明确保留；清理前核对引用并归档获准保留的脱敏资料。清理后无证据的旧进度不能继续表示有效。不要提交运行截图、秘密、探测产物或会话快照。

## 5. 通用 Invocation 与交接字段

这是作业数据约定，不是新增公开 Runtime API。V1 由宿主／Agent 按此合同检查；本文件没有安装自动 schema validator。目标职责名称进入设计合同不表示当前宿主已经接受新的 `skill` 值或自动发现新目录。

### 调用输入 `request.json`

| 字段 | 约束 |
| --- | --- |
| `schemaVersion` | 固定 `agent-to-recipe/v1`；未知版本阻塞，不能猜测兼容 |
| `taskId / workPackageId / attemptId / skill` | 属于当前任务；尝试 ID 唯一，重复接收不得重复触发桌面动作；目标新职责正式接线前按宿主实际能力处理 |
| `mode` | 例如 plan/create、plan/revise、application/discover、harden、repair；其他职责可为 normal／targeted-repair，不能任意发明宿主不认识的新别名 |
| `planRevision / contractRef` | 确定版本；首次 plan/create 可为空，必须有用户任务及授权来源 |
| `inputRefs[]` | 每项含 `kind / path / rootId / sha256 / schemaVersion`；实际值不可留占位符；输入内容固定后计算 hash |
| `requiredOutputs[]` | 本次需要的主产物及验收范围，不要求无关截图或全部 Recorder 工件 |
| `authority / capabilities` | 获准对象、动作、读写根目录及工具；敏感动作绑定目标、内容及相关版本 |
| `budgets` | 本次与任务总执行时间、工具调用、重试和修复上限；给出本次实际预算而非无限循环 |
| `environmentRef / evidenceRoots` | 当前入口、OS／应用／provider／构建来源和获准证据根；不含环境变量全集 |
| `continuation` | 可选的已有资产接续元数据；字段及语义见下文。缺失表示未知，不表示从零生成或没有既有资产 |

应用工程沿用 mode 示例：`application/discover`、`harden`、`repair`。人类文档可简称 discover；不由生产者任意新增别名。交付范围放 requiredOutputs／工作包，而不是 executionStatus。

### 输出交接 `handoff.json`

| 字段 | 约束 |
| --- | --- |
| `schemaVersion / taskId / workPackageId / attemptId / skill` | 与请求一致 |
| `producerVersion / requestRef / inputRefs` | 记录方法文件内容版本／hash 及实际消费的输入 |
| `executionStatus` | `completed / failed / canceled / interrupted`；只描述本次作业是否结束 |
| `artifacts[]` | `kind / rootId / path / sha256 / schemaVersion`；列出实际存在的主产物及必要索引 |
| `gate` | `verdict: pass / warn / fail`、明确 scope、criterionRefs、evidenceRefs、理由；区分计划通过、示范通过、步骤提炼通过、候选通过与整链通过 |
| `facts / assumptions / unresolved` | 分开记录有证据事实、解释／假设和未决问题，较长内容以主产物引用表达 |
| `sideEffects` | 已执行／结果待核对的关键动作、目标及证据；不能把 uncertain 写成 not-executed |
| `failures[]` | primaryClass 映射 F0—F10；可有 secondaryClasses、责任环节、下一步安全动作 |
| `planDelta / nextRequest` | 建议变更或补采请求；生产者不得越权直接覆盖全局进度、上游事实和授权 |
| `continuation` | 可选；记录本 attempt 实际消费或产生的接续来源、证据作用和处置边界，不代替 artifacts、Gate 或失败记录 |

除表中明确标为可选的 `continuation` 外，所有交接都要有这些字段；不适用使用空数组或明确说明，不能用缺字段掩盖未知。门禁适用已有 G0—G7；只有 `pass` 可进入依赖该结果的正常路径，`warn` 仅可探测／诊断。格式完整的失败包可进入诊断，不能作为成功示范进入生成。

仅认识与审阅的 gate.scope 可以只放行该范围；定位／操作／业务未测不填 pass。仅 DistilledSteps 的 pass 只表示必要路径在声明事实范围内可消费，不证明 Business Step 泛化、JS 实现或 Fresh Run 资格。若请求本来要求操作验证而未完成，不能改为只认识或只提炼的 scope 后宣称原工作包全部通过。blocked 是工作状态，不擅自加入 executionStatus；已结束作业仍可能 gate.fail。

文件写完／格式正确／生产者自报成功，分别不等于业务成功。负向测试中，“错误期望被拒绝”是测试通过，但该业务执行仍应记录失败，不能混用两种 verdict。

### 已有资产接续的可选 v1 增量字段

`agent-to-recipe/v1` 的 request、handoff 和需要记录来源的主产物可以带可选 `continuation` 对象；旧产物不因此失效。该对象及其子字段缺失一律表示“未知／未记录”，不得推断为 false、空范围、从零生成或已满足。它只记录来源、证据作用和资产处置事实，不新增工作状态、scenario 状态或 Gate。尤其不得把 `reuse-unchanged`／`minimal-repair` 写进 `executionStatus`，也不得用 `gate.verdict` 表示资产是否被采用。

`continuation` 的字段词汇只在此定义：

下列所有 `*Ref`／`*Refs` 都使用现有引用结构 `rootId / path / sha256 / schemaVersion`；需要区分同一文件中的声明时再由 claim／scope 限定，不引入无 hash 的旁路引用。

| 字段 | 约束 |
| --- | --- |
| `sourceAssetRefs[]` | 接续起点的已有脚本、清单、DistilledSteps、Procedure 或相关资产。引用只能证明所指字节和来源记录，不能证明业务正确 |
| `evidenceRoles[]` | 每项包含 `evidenceRef / role / claimRefs / scope`。`role` 仅为 `asset-provenance`、`historical-evidence`、`reference-execution`、`agent-demonstration` 或 `candidate-qualification`：依次表示来源依据、当前接续前产生的历史证据、当前为理解已有资产而执行的参考观察、当前 Agent 示范事实、冻结候选的独立验收事实。历史事实不证明当前现场，reference execution 也不自动成为示范或资格证据。同一证据只有在分别满足条件时才能登记多个作用；一种作用不能自动升级为另一种 |
| `reverseSynthesis` | 可选对象，包含 `sourceRefs / scope / bounds / unresolved`；记录从已有实现反向提炼的明确来源、允许确认的范围、不得外推的边界和未决项。代码可证明实现结构，不能单独证明业务意图、真实行为或完整正确性 |
| `assetDisposition` | 可选对象，包含 `treatment / preservedScope / changedScope / reasons / changeRefs`。`treatment` 仅为 `reuse-unchanged` 或 `minimal-repair`；前者要求消费的脚本 ref／hash 不变，后者要求新候选、新 hash 和可核对的最小变更引用。它是处置分类，不是生命周期状态 |

完整新生成不得用 `continuation` 绕过成功 Agent 示范、DistilledSteps、完整 SemanticProcedure 或新候选验收。接续则可以只对声明范围做反向提炼和修复；范围外保持未知或未资格化，不能因未改动而自动继承结论。

## 6. 七类主产物最小内容

### TaskContract＋WorkPlan

`user-task.md` 保存用户原始自然语言／来源，不由 TaskContract 取代。TaskContract 是 Agent 对本次任务的结构化解释，包含 `goal / businessObjects / inputs / config / secretRefs / initialState / authority / successCriteria / failureCriteria / stopConditions / verificationPlan / supportedScope`。每条成功条件有稳定 criterionId、期望、证据来源、所需证明强度。输入、Config、Secret 和运行时派生值明确分开。来源不足的内容保持 Unknown／Proposal，不因结构化而自动变成用户事实。

WorkPlan 包含 `revision / contractRef / businessTaskTree / operationPlan / checkpoints / workPackages / dependencies / budgets / changeLog`。`operationPlan` 面向真实业务执行而不是 Skill 调用顺序：每个近期计划步骤至少能表达业务对象／子目标、输入来源、预期结果、检查方式和必要前置；高影响 Unknown 可以作为先行检查步骤。临近工作包详细化，远期未知项显式列出，不编造全部点击。

`task-brief.md`／`operation-plan.md` 可以作为同版本的人类可读视图，必须注明源 TaskContract／WorkPlan ref／hash；用户通过自然语言纠正后由 Agent 修订主产物并重新生成视图，不能让 Markdown 与 JSON 分别成为两套需求或计划。扩大对象、权限、支出或改变成功标准必须重新取得授权。

执行中的计划修订记录在 WorkPlan/changeLog 和 handoff.planDelta；过去已经发生的 action、observation、side effect 不因计划改版而修改。

### AppProfile

包含 `applicationIdentity / environmentScope / states / regions / targets / geometryRules / operations / verifiers / preconditions / limitations / evidenceRefs / maturity`。每个 operation 有输入输出、前后条件、失败方式和当前公开 API 依据。描述规则，而非把一次窗口坐标当永久身份。未知布局、provider 或平台不得伪标 qualified。

### 应用工程增量

本节是字段职责与交接的唯一正文；专业方法见 application-operations.md，不建立第二份 AppProfile 或公共 UI Runtime schema。下列格式是方法合同，不表示宿主已有自动校验、加载或运行兼容性通过证据。

**版本与兼容。** request／handoff 仍用 `agent-to-recipe/v1`。使用本增量的 AppProfile 主文件用 `schemaVersion: agent-to-recipe/app-profile/v1.1` 并保留既有字段，新增 `revision / observationRefs / relations / claimSources / changeLog`。新增数组没有适用条目时可为空，但关键缺口必须写入 limitations／unresolved，不以空数组代表已经核验。旧 AppProfile 可以作为历史／接续来源；新消费者对缺失关系、审阅、验证信息保持未知，不能默认通过。不了解新产物版本的消费者必须拒绝正式消费，不能丢弃新约束后继续。

| 内容 | 归属与最小含义 | 消费与失效 |
| --- | --- | --- |
| 本次观察 | observationRefs 指向不可变观察记录：截图引用、来源、采集时间或未知、应用／窗口／页面范围、imageSize、裁剪缩放 mapping 或未知、原始文字／原生属性及完整性 | 支持当时可见事实；未知映射不阻止认识，但阻止依赖其的桌面坐标操作。新页面／时刻是新观察 |
| 界面认识 | states／regions／targets 保存稳定本地 ID、类型／名称／parentRegionId、必要状态与 observationId 关联；一次 textBounds、controlBounds、safeActionRegion 分开，注明坐标空间，未知用 null 加原因。若 S10 实际采用 geometry/coordinate 规则，`geometryRules` 还要能追到 sourceObservation/referenceRegion、window bounds 或 `safeSize`、`displayRegion`/`keyPoints` 等实际来源、`image / screen / relative / percent` 空间、percent 的 parent region、容差／安全边界、校准证据和 `revalidateWhen`；没有用到的字段不为完整而伪造 | 图片矩形只属对应观察，不作永久目标；动态业务值和记录实例不写成以后运行的固定答案 |
| 关系 | relations 每项有 id、kind、from、to、来源及未知说明；父子用 parentRegionId；标签—输入、Tab—面板、记录—动作明确对应 | ID 唯一、引用存在、父关系无环；字段形式合法不证明关系语义正确 |
| 主张来源 | claimSources 按对象 ID 和字段路径关联 evidenceRefs、观察事实／模型解释／假设／人工修订的来源类型与简短依据 | 模型分类、置信度及算法结果不自动成为实测事实；没有读到状态不等于 false |
| 候选规则 | 在 targets 的定位描述、geometryRules、operations 和 verifiers 内记录实际条件、环境范围、必要依赖和失败去向；不新建并行规则注册表 | 同屏坐标、人审标注、模型候选不自动升级成熟度；布局／环境变化重新核对 |
| 修改影响 | changeLog 保存旧版本引用、字段、旧新值、原因、修改者、范围；规则／操作／verifier 用 dependsOn 的本地对象 ID 表达必要依赖 | 按依赖传播 needs-revalidation 建议；依赖不明保守复核。工作状态仍由协调者更新，不覆盖历史验证 |

上述 ref 均沿用本合同的带根目录、hash 和格式版本的引用结构；对象内引用用本地 ID，与文件 ref 区分。外部截图或原生观察的原始格式不能被模型重写成“实际读取”。不在这里制造观测数据、placeholder hash 或伪造原生元素 ref。

**任务优先级与计划关系。** 当前核心目标、必要依赖／安全前提和次要候选，在 WorkPlan 当前工作包范围中按目标 ID 表达，并记录延后原因、影响、再处理条件。S2 若发现会推翻后续计划的关键事实，发布 planDelta；原本必需的目标不能因识别困难被降级，范围改变走计划授权流程，而不是改 AppProfile 中的永久重要性。

**审阅和验证。** 当前认识数据先冻结，再由独立审阅／测试记录引用该 AppProfile 的精确 ref；handoff.artifacts 发布 Profile、记录和视图的引用，不把当前审阅记录的 hash 写回其所引用的 Profile，避免互相引用的 hash 环。记录可以同一文件按对象／范围组织，不强制每个控件一个文件。

审阅记录至少写实际 appProfileRef、scope、核验方法、执行者或实际人工、时间、结论、未知及修改请求。结构校验、自动语义核验、人工审阅分别记录；不存在的人审不填确认者。修订 Profile 后发布新版本，再生成视图并按影响复核；旧记录仍只证明旧版本和范围。

验证记录至少写实际 appProfileRef／helperRef、目标或操作、环境与场景、criterionRefs、预期与实际、evidenceRefs、pass／fail／not-run／blocked、重验范围；位置、人审、动作返回、后置及业务结果分别判断。只有候选脚本正式验收使用 QualificationRecord；应用局部验证记录不能冒充整份候选资格。

原图、叠加图、简化布局、属性差异视图来自同版数据。视图保存源版本、源 hash、涉及目标 ID；每个视图自身 hash 在 handoff 清单记录。未生成的视图不能列为已存在输出；原型需实际取得并复核才可引用，不继承聊天中的通过声明。

**正常路径的最小记录。** 始终保留当前业务对象、所用版本、关键观察／动作／读值、必要验证、范围和未知；新认识或影响性修订生成审阅材料；详细候选比较、全量结构、视频和跨环境分析仅按诊断／能力建设范围采集。减少冗余，不减少已经约定的审阅或关键证据。异常前证据不能事后补造。

**消费者放行。** 示范可消费最小认识并受控探索；trace-distill 可以消费应用术语辅助解释目标，但真实过程仍来自 Dossier／Raw Trace；procedure-synthesize 消费 DistilledSteps 与应用关系；生成依赖已落实的操作及实际 API；只有认识时不能假装已有可执行操作；验收冻结具体候选和依赖。仅认识包的 pass 只支持该范围，定位、操作和业务未测保持未测。

### DemonstrationDossier

包含 `contractRef / planRevision / appProfileRefs / executionRefs / actualInputs / initialState / finalState / actionsRef / runtimeValues / verification / evidenceRefs / unresolved /privacy / sideEffects`，并应能关联本次实际消费的 WorkPlan revision 和 planned step／planDelta。未支持新字段的旧 Dossier 可以通过现有 evidence/notes/handoff 记录该关联，不能伪造 schema 已升级。

重要节点随操作保存，不等结束后回忆：动作与脱敏参数、对应 planned step／子目标、目标及简短依据、预期变化、实际观察、验证、分类、计划偏差、重试／恢复关联。允许复用已有工具／execution 日志并加语义引用；不启用 Recorder Session，不保存模型私有思维过程，不要求所有场景强制 OCR。

每个 `runtimeValues` 项包含 `name / type / observedValue / origin / evidenceRefs / consumers / validity / reacquireOnFreshRun`；金额等还须标单位／精度，身份须有业务依据。示范观察值不是以后运行的默认业务答案。

### DistilledSteps

DistilledSteps 是 S7 的正式派生成果，位于 Dossier／Raw Trace 与 SemanticProcedure 之间。建议主文件名 `distilled-steps.json`，同版可读视图为 `distilled-steps.md`；具体 schema 实施前仍须按兼容设计落地，本节先冻结字段职责和消费者边界。

最小内容包括：

- `contractRef / planRevision / workPlanRef / dossierRef / appProfileRefs / sourceActionRefs / evidenceRefs`：固定本次消费的来源、计划和事实版本。
- `steps[]`：每项至少有稳定 `stepId / purpose / sourceActionRefs / inputs / outputs / dependencies / preconditions / expectedOutcome / verification / classification`；必要时记录状态、有效期和副作用，但不复制 Raw Trace 全量内容。
- `actionDecisions[]`：每个受处理 action／片段明确 `actionRef / decision / stepRef / reason / evidenceRefs`；`decision` 只在方法层使用 `retain / merge / omit / recovery / unresolved`。连续相同事件不能仅因“重复”被删除，必须依据业务目的和数据依赖判断。
- `recoveryCandidates / unresolved`：保留异常经验、无法解释动作、缺事实和定向补采请求；失败历史不被成功路径覆盖。
- 关键数据链必须能从生产步骤追到消费者步骤，例如运行时 `firstResult` 的实际读取步骤及后续消费步骤，不能只保留最终数值。

DistilledSteps 只对原始事实做有来源的重建、分段和取舍，不改写 Dossier／Raw Trace。计划外但事实证明必要的准备、读取、等待或导航不能因“不在原计划”自动 omit；未执行的计划步骤也不能补成 retain。

`distilled-steps.md` 是结构化主产物的同版可读视图，必须注明源 ref／hash；人工或 Agent 的修订先形成新 DistilledSteps 版本再重新生成视图，不单独编辑成另一份步骤真相。

指定步骤需要试执行时，复用 task-demonstrate 的执行／观察／验证方法，形成新的 execution／Dossier／evidence；不得把新执行结果写回成原历史事实。如果执行者临时补了 DistilledSteps 中没有的必要动作才成功，应修订 DistilledSteps，而不是宣布旧版本步骤通过。

### S7 → S9 的输入充分性增量（2026-09-20）

**事实在上游存在，不等于下游已经取得。** S9 获准输入必须实际包含必要步骤、运行时值的有来源说明、相关应用关系、实际选型记录及其必要证据／契约字节。检查器可以只读核对 Dossier／Raw Trace；这不授权语义 Producer 阅读它们。S7 的 `dossierRef / sourceActionRefs` 可以保留为历史 lineage，但不能被当成已经交付给 S9 的事实正文。

本增量继续使用既有 v1 引用和主产物，不新建状态体系。旧成果缺增量表示未知；不得填假值、删除引用或把旧成果自动升级。不同形状的有效材料可由专业作业按固定来源审阅；下述顺序切片不支持它们时记录检查覆盖限制，不改造业务事实迎合检查器。

**运行时值。** S7 在既有 DistilledSteps 内保存 `runtimeValues` 的必要投影，而不是只写一个值名或一句数据依赖。保留 Dossier 的 `name / type / observedValue / origin / evidenceRefs / consumers / validity / reacquireOnFreshRun`，并明确以下内容的来源：

| 信息 | 本合同中的表达与来源 | 消费规则 |
| --- | --- | --- |
| 业务含义与复用政策 | `meaning / allowedTransforms` 与既有有效期、重新读取要求，来自固定 TaskContract 或获准的定向说明；当前顺序评测把这些政策按值名放在 `TaskContract.runtimeValuePolicies` | 不要求 S1 预知全部未来读值；信息后来确认时形成新版本。政策缺失由 S1／原说明责任方补齐，不能把观察样例当默认值 |
| 实际读取 | 当前结构化切片的 `origin` 为 `actionRef / applicationId / targetId`，`observedValue` 与原始读取和证据一致 | 历史字符串式 origin 保持原格式与原消费范围；不了解该形式的消费者拒绝自动消费，不能丢掉应用／目标约束 |
| S7 步骤对应 | `producerStep / consumerSteps` 来自原 action 到必要步骤的明确映射；终点用既有 `final output` 语义表达 | 终点没有下一原动作，也必须保留读取与输出；合并可以改变步骤数量，不能丢源动作或跨数据依赖偷换顺序 |
| 实际消费方式 | `consumerBindings` 每项为 `actionRef / targetId / transform / observedInput`，从原实际消费者记录派生，只保留本值相关片段 | “允许字符展开”与“当次确实使用字符展开”是两件事；S9 必须取得后者，不能从允许清单中猜选。不能借此复制整条原始轨迹 |
| 应用关系 | 使用固定 AppProfile 的 targets／relations 及对应来源，连接读取目标和消费目标 | 关系 ID 或字段存在不证明关系真实；缺关系回应用工程，不由 S9 根据常见界面补造 |

`runtimeValuePolicies` 的当前评测项为 `name / meaning / type / allowedTransforms / validity / reacquireOnFreshRun`，只表达已确认政策，不放实际观察值。顺序切片仅自动检查 text／digit-string、identity／characters 和前向数据边；金额、分支、循环、恢复等不属于其自动放行范围。政策自然语言是否充分、单位精度及应用真实性仍需对应专业审阅。S7 同时保留本次已知 `sideEffects`；unknown／partial 不能成为正常可消费的成功路径。

**来源一致性与合并（2026-09-21 复核）。** 投影之前先核对原读取动作、对应 observation 与 `origin` 的值、应用和目标一致；只比较读到的字符串相同不够。实际消费者的应用身份须与固定 AppProfile 中该目标一致，不能只检查目标 ID。按原动作核对完整生产／消费集合，不能照抄一份已经漏掉消费者的 Dossier。上述来源互相矛盾时返回示范资料责任方核实；缺少应用关系依据则返回应用工程，不由 S7 选择相信某份来源。

当前顺序切片要求每个值一个明确原读取生产者、每个原消费者一个明确绑定；它不把这些限制外推为通用业务规则。多个原消费者合并到同一步时，仍逐个 `actionRef` 保留 `consumerBindings` 的实际输入和变换；同一步内的 characters 与 identity 不能被“找到的第一项”替代。消费者应用身份由已经核对的固定 AppProfile 目标映射取得，不另增一份可漂移的应用字段。

S9 的每个业务输入必须只有一个与实际值相接的来源；已有正确 runtime 来源不能掩盖另一条 Expected／常量来源。步骤的 `consumers` 与值的消费去向、终点输出保持一致，不能只在 `runtimeValues` 中保留而在业务步骤中丢失。生产和消费合并到同一业务步骤的内部时序仍超出当前检查器的前向跨步覆盖，交验证责任方审阅，不改造合法业务来迎合检查器。

S9 保留上述有来源的值说明，并把 `producerStep / consumerSteps` 映射为 Business Step；`dataDependencies` 与实际 `consumerBindings` 相接，`inputSources` 明确引用运行时生产者。运行时值不得同时变成 parameters／config／Secret 默认答案。新增或缺失读取、错误取舍回 S7／示范；仅业务解释或映射错误由 S9 修订。

**选型与定向证据。** S2—S6 在原工作包保存实际决定，S9 取得明确固定引用及内容后才收敛 `capabilityDecisions`。该来源不能从标准 Procedure、最终代码或 API 文档反推。当前结构化证据仍使用 v1 与既有 `evidence` 引用角色，用 `recordKind` 限定内容，不创建 Registry：

| recordKind | 当前切片的最小内容 |
| --- | --- |
| `observation` | `taskId / actionRef / name / value / applicationId / targetId`，支持一个必要读值 |
| `application-relation` | `taskId / from / to / kind`，支持本次必要应用关系 |
| `capability-selection` | `taskId / planRevision / capabilityDecisions`；来源记录中的每项使用 `sourceActionRefs` 指向已发生的相关动作，其他选型字段沿用下节唯一定义 |

这些记录包含 `schemaVersion`，可有说明其真实／合成来源的 `sourceNote`；不能嵌入全量 actions／Dossier／聊天，也不能改名为 evidence 规避限制。记录中的显式 ref 必须属于获准输入；canonical 与 shared constraint 保留其原角色和内容绑定。普通文本证据或契约的 hash 只证明字节，不认证历史主张。

S9 产物的选型项保存 `sourceRef` 指向实际提供的选择记录，并把来源 `sourceActionRefs` 转为 `businessStepRefs`；不再维护第二份原动作取舍。`runtimeValidation` 为 not-run 时允许交 S10 的 harden 工作包；有 pass／fail／partial 声明仍要有来源和证据，不能把“有文档”写成“已运行”。

**缺口与接续。** 已有材料没有交付给 Producer，先由协调者补交获准固定材料；原资料本身缺事实再返回示范，缺应用规则／关系返回应用工程，缺政策返回 S1，错误投影返回 S7，错误语义返回 S9。`nextRequest` 应指出缺哪项、原来源责任和下一安全动作，不能只说“需要更多上下文”。每次新尝试新目录；有效 S7 的输入与方法未变时仅重检并复用其字节，只重做受影响的 S9。源输入／方法变更、旧文件被改或预算不足时拒绝旧输出接续。失败输出、先前来源与旧资格不被覆盖；候选变更仍走原重验规则。

离线评测入口及版本化续接请求见 [validation-plan 的输入充分性切片](../../workflows/agent-to-recipe/design/validation-plan.md#输入充分性与失败接续切片2026-09-20)。评测记录不是 request／handoff 的替代品，不发布 Gate，不修改 progress，也不操作桌面。

### SemanticProcedure

包含 `distilledStepsRef / businessSteps / parameters / config / secretRefs / runtimeValues / dataDependencies / capabilityDecisions / retainedReasons / omittedReasons / recoveryCandidates / supportedScope / unresolved / evidenceRefs`。若当前实现尚无 `distilledStepsRef` 字段，可由 inputRefs／sourceMapping／handoff 固定实际消费版本，正式 schema 升级另行实施；不能因此重新读取不受约束的 Raw Trace 作为隐式输入。

每个新生成或有策略修订的 Business Step 至少定义 `stepId / purpose / sourceStepRefs / inputs / inputSources / preconditions / execution / observation / outputs / postconditions / verification / stopConditions / consumers / sideEffects`。`execution` 表达业务层执行方式或 operation/helper 意图；具体 OpenDesk 方法选择由 `capabilityDecisions` 追溯，避免把 API 名称复制成第二份真相。`inputSources` 必须区分参数、配置、Secret、前序实际 observation/runtime value 与常量；`observation` 说明本步实际要读取/保存什么；`stopConditions` 明确何时不得继续副作用；`consumers` 说明输出被谁使用。S8 将 DistilledSteps 的必要操作片段组织成业务步骤，S9 再确认参数、数据角色、分支、循环、Recovery 和支持范围。未证明分支只作为候选或补采请求，不进入支持声明。历史 Procedure 缺这些新增字段时保持未知，仅按真实输入版本、来源和调用请求进行其原范围的诊断／审阅，不事后倒填。当前 v1 消费检查按调用者声明的范围适用要求；删除字段不能自行选择 legacy 规则取得 PASS，缺关键语义时拒绝正式消费。

为兼容既有消费者，`retainedReasons / omittedReasons` 可以保留摘要，但原始 action 的 retain／merge／omit／recovery／unresolved 权威取舍属于 DistilledSteps；Procedure 不维护第二套互相漂移的 action disposition。若 Procedure 发现上游取舍错误，应提出 trace-distill 修订并消费新版本。

**能力选择记录。** `capabilityDecisions` 是 Recipe 需要的轻量追溯信息，不是 API Registry，也不保存模型私有推理或复制 canonical 文档。对会影响最终 Recipe 的每项框架能力选择，记录：

- `decisionId / businessStepRefs / capabilityNeed`：说明哪个业务步骤需要什么能力；
- `discoveryPath`：从 `docs/api/agent/README.md` 到一个或少数 capability catalog 的实际发现路径；这里只记录“发现了什么”，不混入最终选择；
- `candidates`：候选方法、`selected / rejected / failed / not-run` 处置、简短依据；`failed` 必须引用实际失败证据，`rejected` 表示有据未选但没有伪造运行失败；
- `selectedMethod / canonicalContractRefs / sharedConstraintRefs`：选定方法及当时实际读取的 canonical contract／必要公共约束内容绑定；类型只在本次确有需要时引用；
- `runtimeValidation`：`pass / fail / partial / not-run`、环境范围和 evidenceRefs。文档可用不等于现场可用，运行失败后允许换候选，但旧失败不能被成功候选覆盖；
- `recipeConsumers / revalidateWhen`：最终普通 JS 的消费者和会使该选择失效的条件。

Capability Discovery、Method Selection、Contract Reading、Runtime Validation 是四个不同事实：目录命中只证明“可考虑”，选择只证明“决定尝试”，合同只证明“知道怎样调用”，只有对应环境的实际证据才能把方法写成已验证。新生成或改变定位／动作／读取／等待策略的修订必须保存这些最小信息；旧 Procedure 缺失时表示未记录／未知，不能事后把当前文档或成功代码倒填成历史选择证据。S2—S6／S10 可先在原工作包留下临时决定，S8—S9 只把最终仍被 Recipe 消费的决定及必要失败候选收敛到本字段，不建立第二个 registry。

接续中的反向提炼只能在 `continuation.reverseSynthesis` 声明的边界内确认过程；已有代码说明“实现了什么”，不自动说明“业务为何如此”或“现场确实成功”。用于最小修复的局部 SemanticProcedure 可以有受限 Gate scope，但不能冒充完整新生成所需的完整过程。

### CandidateManifest

包含 `scriptRef / scriptHash / contractRef / procedureRef / appProfileRefs / apiRefs / entryCommand / workingDirectory / inputContract / dependencies / supportedScope / sourceMapping / limitations`。其中 `apiRefs` 固定本 Candidate 实际采用方法的 canonical contract／必要共享约束版本；`sourceMapping` 对受能力选择影响的代码区域引用对应 `capabilityDecisionRefs`。这样可以从 Recipe 回到“业务步骤 → 能力需求 → 候选 → 选中合同 → 现场验证”，而不把 API 正文复制进 Candidate。脚本以普通 JS 的函数、验证、失败处理表达业务；sourceMapping 可为 Business Step 到函数／代码区域的简表，并可通过 Procedure 追到 DistilledSteps／原始 action，不是 SourceMap／IR 引擎。读取在线 OCR／Vision 或模型依赖必须明示；不得把依赖 Agent 实时规划的程序称为确定性离线 Recipe。只有 `reuse-unchanged` 且本次声明范围不要求反向提炼时，`procedureRef` 才可为 `null`，并须在 `limitations` 与接续处置中说明；不能用该例外规避新生成或最小修复所需的过程依据。

接续时清单通过可选 `continuation` 保存已有资产 lineage 和实际处置。原样复用可以直接引用获准路径下 hash 不变的脚本，不要求复制或重写；任何代码修改都形成新候选并使旧资格结论不能自动沿用。

### QualificationRecord

包含 `candidateRef / contractRef / scenarios / actualCommands / workingDirectories / executionRefs / buildProvenance / environmentScope / observedResults / evidenceRefs / failedCriteria / skipped / verdict / repairRequests`，并可带 v1 增量字段 `qualificationScope`；旧记录缺失该字段表示资格范围与链路来源未知，不能推断为完整范围或任一链路。`qualificationScope` 包含 `lineage / requested / exercised / qualified / excluded`。`lineage` 仅为 `reference-only`、`continuation-chain` 或 `new-generation-chain`，分别表示只验参考候选、从已有资产接续、由当前完整新生成链产生；这是来源分类，不是状态或 Gate。其余四项分别记录调用者要求验证的范围、实际执行范围、证据足以支持的子集，以及候选已声明但明确不在本次 requested 内的范围与原因。requested 中未资格化的部分不得移入 `excluded`，必须保留在场景／`skipped`／`failedCriteria` 中；只有 requested 全部进入 qualified 且没有对应 fail、not-run 或 blocked 时，`verdict` 才可为 pass。生产者不得为取得 pass 静默缩小 requested；handoff 的 `gate.scope` 不得宽于 requested，且 gate 为 pass 时不得宽于 qualified。场景结果至少区分 pass、fail、not-run、blocked，不得把没有执行写成通过。验收只针对具体候选与范围，不能修改候选和标准后仍沿用旧资格结论。

## 7. 发布、消费与恢复

已实现的只读检查分两层：`check-handoff.js` 核对 request／handoff 信封、身份和显式 hash；`check-artifact-chain.js` 检查 Calculator 形状 v1 工件的选定相邻边界及直接 await／spread 源码模式。后者不升级本合同为完整机器 schema，不递归验依赖闭包，不证明任意 JS 的可达性或一般语义；完整输入、计划适用性、历史事实、现场和授权仍由消费者核对。命令及范围见 [WORKFLOW 第 4 节](../../workflows/agent-to-recipe/WORKFLOW.md#4-交接完整性检查可执行但不替代资格)。

当前限定切片还检查 S7 步骤的目的、输入输出、依赖、前提、预期、验证和分类，以及 S9 的运行时声明是否保留同一生产者、消费者和终点 UI 读值。它验证结构和对应关系，不证明自然语言前提／预期的真实性；合法但超出此切片的轨迹应按本合同审阅，不得改写事实适配检查器。S9 语义完整但工程验证尚未通过时，明确交给 S10；语义放行不等于所选方法已验证。S12 当前只检查记录内声明和候选绑定，外部预先确定的请求／场景与真实运行仍由独立消费者核验。

`code-rebuild` 的 `baseline-retained`／`candidate-revised` 是评审处置标签，不新增 executionStatus、Gate 或 continuation.assetDisposition 枚举。评审必须绑定准确脚本／Candidate／Procedure／方法版本，列映射、分项判断、检查和未测范围；可写进现有工作包或质量报告。保持字节不变时不制造新候选；有影响性变化时仍遵循本节新版本与重验规则。

1. 生产者写入本次 attempt，保留错误和未完成资料；每次新尝试新目录。
2. 检查必要字段、输入版本、引用可读性、路径根、敏感信息及 Gate 依据。
3. 最后发布 `handoff.json`，由协调者重新检查再更新 progress。宿主支持安全替换时可用于发布；不得假设 OpenDesk File 已保证跨文件事务。无该能力时，消费者必须以完整性和 hash 检查拒绝半写入。
4. 下游独立核对 taskId、合同、计划、版本、scope、产物和证据。hash 只核对内容一致，不证明真实或可信；关键事实仍检查原证据。
5. 输入或计划在下游运行期间更新时，该尝试仍属于旧输入／计划版本。不得把旧结果发布为新计划通过；协调者进行影响分析并标 needs-revalidation。
6. 产物已完成而 progress 未更新：核对产物后补状态，不重做业务动作。只有 running／旧 done 标签而缺产物：不得跳过。
7. 现场状态与历史事实分开处理。窗口、焦点、账号、页面和坐标每次重新检查；知识可复用不代表现场仍有效。
8. DistilledSteps 修订只影响其依赖的 Procedure／Candidate／Qualification；Raw Trace／Dossier 仍保存原历史事实。Procedure 变更不反向改写 DistilledSteps，除非有证据表明 S7 取舍本身错误并发布新版本。

业务动作前中断：重新确认现场后决定执行。动作可能已生效但未记录：先核验实际效果，不能默认重试。结果不明时进入待核对并停止后续副作用。自造 UUID、文件 checkpoint 或阶段标记不证明 exactly-once，不恢复 JS 调用栈，也不能回滚外部应用。

## 8. 暂停、取消与定向返回

暂停：安全边界不再派发下一工作包。取消：请求宿主停止当前执行并核对结果；取消不撤销已产生副作用。恢复：重新检查产物和现场。`Execution` 是只读上下文，不是 execution 管理器；外部控制按 [HTTP API](../api/http-server.md) 等实际入口核对。未支持的暂停／隔离／取消不得伪造为已生效。

工作包开始、结束、阻塞、计划修订、风险升级时报告；长阶段按宿主实际可实现的预算内间隔报告当前问题、最近证据、阻塞和下一步，不能让“正在分析”代替进度。同类失败无新证据时停止盲重试。生产者互相回退也消耗任务总预算。

| 问题归属 | 返回责任 |
| --- | --- |
| 目标、授权、成功条件、业务拆解或操作计划错误 | automation-plan；需变更授权时先停止 |
| 应用／窗口／定位／布局／等待假设错误 | application-engineer；已知加载先按已有有界规则等待，未被覆盖或存在冲突才重新认识 |
| 缺真实动作、关键数据或结果证据 | task-demonstrate 定向补采 |
| 原始 action 取舍、操作分段、必要路径或恢复分类错误 | trace-distill；发布新 DistilledSteps 后再让下游消费 |
| 业务语义、Business Step、参数来源、分支／循环、business mapping 或复用范围错误 | procedure-synthesize |
| JS API、代码组织、异步或错误处理错误 | recipe-build；独立代码质量改进按 code-rebuild 目标职责处理 |
| Oracle／测试设置／验收证据不足 | recipe-qualify；不能通过放宽条件修复 |

F0—F10 描述问题，不单独决定是否可重试；同时检查风险与 Gate。独立验收只提交 repairRequests，不静默改脚本。修改后生成新候选，重跑受影响场景并保留必要回归。

## 9. 交付、维护与验收基线

交付具体脚本版本、正常命令、工作目录、输入／配置、能力和平台范围、实际测试及未测项、证据与停止／恢复说明。应用版本、provider、代码、关键配置、DistilledSteps 或 Procedure 改变后做影响分析；旧记录保留但不能证明新版本。

共享 Skill 是方法资产，不接收任务临时记忆。AppProfile／helper 可在脱敏、证据与范围审查后晋级复用；一次成功不自动写回通用规则。V1 采用人工／宿主审核，不新建自主学习平台。

必须分别验证：自然语言入口能形成正确合同、操作计划错误能被及时纠正、高影响未知能提前暴露、planned／actual 偏差不改写事实、DistilledSteps 不误删必要动作或机械去重、procedure-synthesize 可从 DistilledSteps 独立接续、无旧聊天交接、关键证据缺失、半写产物、混入旧任务、版本更新、三个中断位置、现场变化、暂停／取消、数据类型／单位不匹配、入口环境差异、自报假成功、Fresh Run 旧结果污染。优先用离线副本／低风险计算器，不对真实付款、发送或删除进行破坏性注入。

原合同保留交接 20、恢复 20、业务验证 25、安全控制 20、兼容交付 15 的历史评审权重作为来源；当前工作流统一使用 validation-plan.md 的五维、20 项评分办法，不同时维护两份有效验收评分。没有实际证据不填写能力成绩。设计评审与运行资格必须区分。

## 10. 跨来源 Capability 发布交接

本节是跨来源交接的目标合同增量，不表示已有可执行 schema／adapter／publisher。CapabilityDefinition、CatalogEntry、运行期 Preflight／确认与路由的唯一规范在[生命周期总纲](../architecture/desktop-automation/task-capability-lifecycle.md)；此处只约束作者输入、产物映射、资格和发布交接。第 7 节“发布 handoff”表示工作包完成交接，**不等于向普通用户发布 Capability**。

### 10.1 三种边界不能互相替代

| 边界 | 必须核对的输入 | 可交付结果 | 不自动授予 |
| --- | --- | --- | --- |
| Runtime → Authoring | Gap／Failure Package 的固定来源、任务目标、已知环境、可复用资产、明确作者授权 | 现有 TaskContract／WorkPlan 或 Human plan 的新工作包 | 桌面探索、录制、模型外发、真实发送或发布权限 |
| Authoring → Qualification | 已确认成功标准、冻结 Candidate 及依赖、请求验证范围、测试授权 | 不可变 QualificationRecord、证据、失败和修复请求 | 修改候选、扩大业务范围或降低标准 |
| Qualification → Catalog | 精确 Candidate、资格覆盖范围、可信来源、可持久复核证据与明确发布批准 | 生命周期合同下的固定 Capability 发布版本 | 执行原用户请求、沿用旧确认或跨环境资格 |

普通运行 Task Intent 不是完整 authoring TaskContract，Planner 的提议也不是作者权限。缺事实可以先交 blocked 工作包，不要求用户手填 JSON；准备动作和业务动作分别取得授权。Normal Mode 不调用目标专业职责生成任意 JS 后立即运行。

### 10.2 来源适配与唯一真相

共同消费 Task Contract、AppProfile、Semantic Procedure、Candidate 和 Qualification 的逻辑含义，不要求两条作者链维护格式完全相同的副本。Human 原生 `SemanticBuildPlan` 的 intent、Episode、数据依赖和 source map 仍是其权威语义；Agent 的 Dossier／DistilledSteps／SemanticProcedure 仍按第 6 节维护。

需要跨来源适配时，保存以下最小逻辑信息；正式字段格式随 adapter/schema 一次性实现并测试，不能把下列工作名直接填进旧 schema 冒充支持：

| 交接信息 | 约束 |
| --- | --- |
| 原始来源引用与格式 | 每份 raw/actions/plan/Dossier/Procedure 使用第 5 节的获准 root、相对 path、hash、实际 schemaVersion；保留来源种类与真实执行者，不伪造 Human 为 Agent 示范 |
| 语义映射 | 保存 mappingVersion、源对象／字段到共同逻辑成果的映射和 unknown；映射是可重建只读投影，不重新解释业务或双向独立编辑 |
| Task 与输入来源 | 追溯到用户已确认目标、参数、约束及成功条件；未知 intent、单位、目标身份或后置条件不能因适配消失 |
| 应用知识 | Candidate 引用固定 AppProfile／helper；不在 Catalog、Chat 或 Human plan 再手写一套权威应用识别规则 |
| 步骤与动作来源 | Human disposition 唯一在其 plan；Agent actionDecisions 唯一在 DistilledSteps；投影保留映射，不生成第二份可改的动作取舍表 |
| 适配结论 | 区分结构可转换、语义可消费与业务已资格化；只读适配通过不能抬高成熟度或 qualification |

`qualificationScope.lineage` 的现有三个值描述参考／接续／完整新生成的验收链类型，不是 Agent／Human 来源枚举。Human 来源不能放进 `agent-demonstration` evidence role，也不能为通过旧 validator 伪填 `new-generation-chain`。无法用当前 schema 真实表达时，保留原文件，通过明确版本的外部发布交接和已实现 adapter 消费；adapter 不存在则阻塞该发布。若需扩展公共字段，集中升级共享 schema／消费者和兼容测试，不擅改旧格式或让消费者丢弃未知约束。

源 hash／revision 改变使相关投影及下游消费绑定失效。旧资料可以继续用于历史诊断，不能悄悄重新绑定到当前候选。

### 10.3 发布候选的冻结闭包

Candidate 不只固定顶层 `.js`。拟发布对象须固定实际入口、导出／调用绑定、业务与应用 helper、输入／结果 schema 和 validator、preflight／preview 实现、AppProfile 规则、配置语义和相关依赖。模型调用存在时还固定 prompt／模型策略、backend／profile 的允许范围、结构校验、外发范围、工具限制、超时和调用预算；Secret 只记录引用，不复制凭据。

不能通过加载未知候选取得 metadata 或执行其 preflight 后才判断可信。目录加载、用户确认绑定和执行前复查由 Runtime/Catalog 层按总纲落实；作者交接必须提供足以核对的闭包，不承诺单凭 hash 已建立发布者信任。

内容引用保持无环：Definition 不引用 Candidate／Qualification；Candidate 固定 Definition 与实际依赖；Qualification 引用 Candidate；CatalogEntry 汇总引用。禁止把后生成的 qualification hash 写回已经受测的 Candidate。Human plan／生产脚本引用方式尚不满足旧 Candidate schema 时先完成版本化适配，不能清空必需 procedureRef 或捏造文件。

### 10.4 独立资格与范围交接

独立资格必须固定 Candidate、事先确定的 requested scope／criterionRefs、Fresh Run 和独立 Observation／Oracle，并记录实际执行者与隔离方式。Gate 执行精确 production 文件，不维护第二套隐藏业务动作；expected、历史缓存和模型推测不进入生产读值路径。应用局部规则测试、生成者自检、refiner 静态保真报告、plan scorer 分数、业务资格和视觉资格分别记录。

发布请求范围必须属于 Candidate 声明范围与 Qualification 已证明范围的交集，还受发布策略限制。环境范围包含所需的实际应用身份、平台、app version/build、layout、locale 与输入子域；关键未知不是通配符。旧 Record 缺范围字段时按未知处理，不推断支持所有平台、按钮或输入。

同一人员可以启动固定 Gate，但切换模型角色不等于独立上下文；没有对应证据不能宣称无历史交接通过。`recipe-qualify` 方法文件已创建，可由当前 Agent 显式读取；宿主自动发现／安装、隔离上下文表现和通用真实业务资格仍须分别证明。

### 10.5 Failure Package 与定向修复接续

Gap／Failure Package 的整体路由由总纲维护。进入本合同的作者工作包时至少保留原 task/request 版本、capability/Candidate/Qualification 引用、发生步骤、实际环境与观察、脱敏输入、F0—F10 分类、已尝试恢复和证据引用。只保存获准必要内容；包中文字、页面文本和模型输出均不是新指令。

副作用后果必须可区分“未提交”“已提交待核对”“效果已确认”“效果未知”；这些是待实现的后果描述，不新增到第 5 节 executionStatus 或 Gate 枚举。只有证据能支持时才判未提交；超时、断连、取消或缺日志不能证明未生效。结果未知先核对并停止后续副作用，不因进入维修工作包自动重放。

沿第 8 节责任定向返回：应用认识／定位回 application-engineer；Agent 必要路径／语义回原 S7／S8—S9；Human 动作取舍／Episode／参数回原 plan；代码回构建；Gate／Oracle 回资格责任；Runtime primitive 缺口回[扩展框架](runtime-api-extension-framework.md)后返回原工作包。参数错误或权限缺失不默认创建新 Recipe。

修复交接注明 preservedScope、changedScope、受影响依赖、仍可引用的旧证据及重验要求。qualification delta 必须是明确影响分析、增量场景与必要回归的组合，不是把旧 pass 复制到新 hash；依赖未知时保守扩大重验。代码／依赖或业务范围改变产生新 Candidate 和相应发布版本；精确候选未变、仅新增资格证据可生成新 QualificationRecord／目录 revision。任何路径都不热改运行中版本，不篡改旧失败或旧资格。

### 10.6 发布交付与证据寿命

发布者消费固定 Definition/Candidate/Qualification 引用、拟发布范围、来源与适配说明、依赖闭包、必要证据根／保留策略及发布批准。不能只接收生产者自写的 `qualified: true`。证据中包含用户数据时先核对保存／脱敏／共享授权，不复制所有聊天或屏幕。

`.runtime/automation-authoring/` 与 Execution.artifactDir 继续保存过程；已发布能力的必要证据按授权保留在明确、不会随运行清理的持久根，未实现持久保留时阻塞对应发布，不把一次性日志提交到源码仓库替代。目录只索引资格引用与发布／撤销状态，不复制资格权威正文。缺失、不可读、hash 漂移或失去必要可复核性时重新审查／暂停放行；旧记录保留事实，不改写成未发生。

发布成功只表明后续可发现。原请求的报价、联系人、账号、时区／日期和其他时效输入必须重新核对，重新预览并确认。App 版本／布局／语言变化只阻止未被资格覆盖的新环境，不能因为一个新环境失败就伪称旧环境也未通过；更不能把旧范围自动扩大到新环境。

### 10.7 跨来源交接的最小验收增量

下表为后续实施要求，本次文档更新没有新增测试 PASS：

| 检查 | 必须证明 |
| --- | --- |
| 双来源消费 | Agent 与 Human 原生格式都能被明确适配，不伪造 Dossier、不复制可编辑语义真相 |
| 来源／枚举兼容 | 未知 format、缺意图、错误 lineage 和不支持 consumer 均阻止发布；诊断仍可阅读原资料 |
| 冻结闭包 | helper／preview／preflight／schema／Profile／model policy 任一影响性变化不能沿用旧绑定 |
| 独立候选执行 | Gate 实际执行所发布字节，结果来自独立观察，验中修改产生新候选 |
| 差量维修 | 复用有效资产且重验受影响范围；发送结果未知时不自动重发 |
| 范围与证据 | 旧 app/layout/locale、静态 PASS、不可读证据都不能被扩大解释为当前业务可运行 |
| 发布与执行隔离 | 作者完成不自动登记，登记不自动执行，旧用户确认不用于新版本 |

### 修订记录

- 2026-09-19：落地 trace-distill、procedure-synthesize、code-rebuild 方法文件、共用读取基础及相邻工件检查切片；稳定 fixture 与正反测试进入 tests/workflows。没有改变 v1 枚举或 S/G 编号；宿主加载、盲上下文与人类验收未据此通过，实际结果见[质量总览](../quality/agent-to-recipe-workflow-review-20260919.md)。
- 2026-09-19 本轮续作：增加 `recipe-qualify` S12 方法文件，复用既有 QualificationRecord 与验证计划，不新增 S13、评分 Gate、发布器或公共 schema；高分不能覆盖 requested scope 的 fail/not-run/blocked。

- 2026-09-08：深化应用工程合同并写入正式 application-engineer 方法入口。保留既有主产物和 request／handoff 枚举，明确同一 Agent、工作包内部复用、最小数据和 AppProfile 增量版本。
- 2026-09-11，v1.1：补自然语言来源与内部结构化合同边界、可读操作计划、planned／actual／planDelta 交接；新增 DistilledSteps 主产物，目标 `trace-distill` 承担 S7，`procedure-synthesize` 收窄为 S8—S9。未据此声明新增 Skill 已安装、宿主已接线或运行验收通过。
- 2026-09-13，文档 v1.2：补 Runtime 输入到 Agent／Human 作者态及共同发布出口；明确源格式适配、来源与 lineage 正交、冻结依赖、独立资格、Failure Package、差量重验与持久证据。未修改既有 schema 枚举、代码、Skill 安装或 live 资格；CapabilityDefinition／CatalogEntry 仍只在生命周期总纲维护。
