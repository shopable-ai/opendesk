# Agent-to-Recipe：独立 Skill 与成果交接合同

状态：路线 A 的作业规范 v1，应用工程增量修订于 2026-09-08。原记录日期：2026-09-06；原接口及目录基线：`823b7308c367fa3c408d7922bc94aa9a2cc1beef`。本次文档核对基线：`f41f0e2ddf1beda40ce90f46d7ea51d127553e9e`；实际执行仍须核对当次代码、构建物和接口。规范与 Skill 文件不证明宿主调度、权限隔离、自动校验或桌面测试已经实现／通过。

## 1. 定位与唯一职责

本文件维护原六项 Agent Skill 职责的输入、输出、交接和恢复约定，不另建开发阶段或业务执行引擎。独立 code-rebuild 仍以工作流设计中的待实现职责为准，不因本次应用工程修订自动获得调用支持。

- 阶段与完整生命周期：[示范到自动化执行方法](demonstration-to-automation-pipeline.md)。
- 业务拆解、数据依赖和六类解题模式：[自动化任务求解方法](automation-problem-solving-framework.md)。
- 专业操作依据：[应用开发框架](app-development-framework.md)、[总体执行闭环](automation-framework.md)。
- 可调用能力：[API 入口](../api/README.md)、[Execution](../api/execution.md)、[扩展放置原则](runtime-api-extension-framework.md)。
- 已有质量体系：[G0—G7](../quality/gates-and-evidence.md)、[F0—F10](../quality/failure-taxonomy.md)。不另造平行 Gate／Failure 编号。
- 工作流导航：[当前入口](../../workflows/agent-to-recipe/WORKFLOW.md)。本次唯一正式 Skill 文件：[application-engineer](../../workflows/agent-to-recipe/skills/application-engineer/SKILL.md)。旧 prompts 目录不是有效入口；其他职责名称不证明当前存在已安装实现。
- 原首个验证任务：[计算器规程](../quality/agent-to-recipe/calculator-validation.md)。应用工程增量评测和批次沿用[当前验证计划](../../workflows/agent-to-recipe/design/validation-plan.md)。

业务 Skill／普通 JS helper 与本文 Agent Skill 不同。前者在业务运行中复用动作；后者生产并验证业务程序。本文只约束明确选择多 Skill 开发链的任务，不强制所有短 Recipe 创建整套工件。

### 路线 A 的边界

Agent 使用 OpenDesk 当前能力完成真实任务，保存关键事实，复盘和参数化，然后直接交付普通 JavaScript Recipe／Workflow，由现有入口 Fresh Run 并验证。不建设 Browser Recorder、人工全局录制、Recorder Session、JS／HTTP Recorder routing、Go Distillation、可执行 Skill／Workflow IR、Recorder Compiler、独立 Replay Runtime 或专用运行入口。

任务合同定义正确性；普通 JS 定义业务执行；Evidence 证明实际发生的事实。过程说明与交接 JSON 不能成为第二份可执行规格。计划可变更，但不得为了通过而静默修改目标或降低成功条件。

已有普通 JS 的接续也是路线 A 的受限入口：先冻结资产来源和内容，再按实际目标选择原样复用或最小修复，只补当前交付所需的证据、过程和验收缺口。既有代码或历史运行不能被追认成一次新的 Agent 示范；接续验收通过也不能表述为完整新生成链通过。用户要求完整新 Agent 示范／新生成时，仍须满足原 S1—S12 的全部适用要求。

## 2. 六项原职责与阶段映射

| Skill | 原方法阶段 | 主要输入 | 本环节必须保存的主产物 | 正常消费者 |
| --- | --- | --- | --- | --- |
| `automation-plan` | S1，含前置拆解 | 用户任务、授权、已有任务资料 | TaskContract、WorkPlan | 应用工程、示范及所有后续环节 |
| `application-engineer` | S2、S10 | 合同、所需操作、观察证据或定向缺口 | AppProfile、必要的普通 JS helper、同版审阅／验证记录 | 示范、提炼、生成与验收，各按限定范围消费 |
| `task-demonstrate` | S3—S6 | 合同、计划、应用资料、获准业务输入 | DemonstrationDossier、关键业务值及证据索引 | 提炼 |
| `procedure-synthesize` | S7—S9 | 合同、示范包、应用资料 | SemanticProcedure、参数与数据依赖 | 应用补强、生成 |
| `recipe-build` | S11 的路线 A 实现 | 已确认过程、应用资料、当前 API | 普通 JS、CandidateManifest | 验收 |
| `recipe-qualify` | S12 | 冻结合同、候选版本、验证场景 | QualificationRecord、失败及修复请求 | 协调者／交付者 |

S1 先形成任务合同，再形成粗粒度工作包计划。初始计划允许明确的未知项，禁止编造全部点击细节。S3—S5 是操作、观察、标注的微循环；S6 是整次示范的业务验证。一个工作包完成不代表全部任务完成。

```text
新任务／完整新生成
→ 规划
→ 应用初步认识
→ 真实示范并逐节点保存事实
→ 过程提炼
→ 按缺口补强应用能力（无缺口则复用）
→ 直接生成普通 JS
→ 独立 Fresh Run 验收
→ 交付，或按问题归属定向返回

已有普通 JS 接续
→ 规划并冻结已有资产、目标范围与证据作用
→ 盘点适用证据，并按真实缺口定向补证
→ 在证据边界内反向提炼，并按需补强应用认识
→ 原样复用，或只对已确认缺口做最小修复
→ 为冻结候选建立清单
→ 独立 Fresh Run 做明确范围的验收
→ 限定范围交付，或按问题归属定向返回
```

接续分支复用现有职责和十二阶段，不新增阶段或执行入口。未调用的环节表示本次接续范围不需要它，不表示相应完整开发 Gate 已通过。

应用工程每次调用明确 `discover`、`harden` 或 `repair` 模式；不是重复研究整个应用。discover 不要求完整 SemanticProcedure；harden 消费已确认过程和工程缺口；repair 消费旧规则、具体失败和受影响范围。仅界面认识与审阅是交付范围，不新增模式或 ui-understanding 独立 Skill。

AppProfile 的事实条目标注 `observed`、`demo-confirmed` 或 `qualified`，且附环境范围和证据；阶段名称本身不能自动提升成熟度。模型解释与候选并非事实，不能为满足此枚举而伪标 observed／qualified；其认识依据与候选状态按下文分开保存。

## 3. 调用与宿主责任

默认由同一个 Agent 按工作流顺序使用专业方法。Skill 不等于 Agent 或进程；返回某项职责不要求换 Agent。正常使用与独立性测试不同：独立性测试让未参与上游的执行者仅凭指定 Skill、合同和输入接续，或准确指出缺失项；不通过复制全部聊天补救接口缺陷。

宿主可顺序执行，也可提供分离上下文；必须记录实际方式。同一 Agent 可以执行冻结候选的测试，但须使用事先确定的标准和独立结果来源，不以自述作 Oracle。没有独立上下文能力时，不宣称通过“无历史上下文交接测试”。Skill 文件不会自动安装、注册、运行、调度或隔离权限。

薄协调者只负责：读取合同／计划／状态；选择输入就绪的工作包；派发调用；检查交接完整性及 Gate；维护唯一进度；管理预算、暂停、取消与计划变更；把失败送回责任 Skill。协调者不代替专业判断，也不自行修改验收标准。V1 可以由具备文件与工具能力的 Agent 宿主执行这些步骤，不依赖新增 Go 管理器；协调者也是职责，不强制独立 Agent。

同一任务只有一个进度写入者；同一桌面同一时刻只有一个操作拥有者。离线分析可并行，桌面输入不得并行。宿主不支持强制工具隔离时，记录限制，不得承诺无人值守高风险安全。

## 4. 工作包与文件组织

先按可独立解释、验收、接续的子目标拆分，再按数据和现场依赖组合。阶段、Skill、工作包、JS 文件不是一一对应。多个工作包最终可以交付一个普通 JS 文件；是否拆代码文件以当前 Runtime 加载能力为准，不凭空使用 import／require。

同一工作包内的截图、认识、审阅和规则整理直接共享明确版本的数据，不为每个子步骤创建新 request／handoff。只有真正派发、发布或另一次尝试才处理对应边界；不能因此省略已有 request／handoff 必需字段。可由程序生成的引用、hash 和摘要不反复要求 Agent 手填。输入版本改变仍执行第七节影响分析。

任务根目录由协调者选定并保存绝对解析基准，例如：

```text
.runtime/automation-authoring/<task-id>/
  user-task.md                  # 用户目标和授权来源，非共享 Skill
  plan/r001/task-contract.json
  plan/r001/work-plan.json
  steps/W010.md                 # 必要时才拆步骤说明文件
  progress.json                 # 唯一当前状态；可由已发布交接重新核对
  attempts/<attempt-id>/
    request.json
    <本 Skill 的主产物>
    handoff.json                # 所有输出完成后才发布
```

主产物文件名分别为 `task-contract.json`／`work-plan.json`、`app-profile.json`、`dossier.json`、`procedure.json`、`candidate.json`、`qualification.json`。请求固定引用实际版本，不盲读 `latest`。文件可通过明确引用共用，不复制多套权威数据。

每个工作包写明：稳定 ID、子目标、责任 Skill、依赖、输入、现场前提、预期输出、成功标准、允许副作用、探索／执行／重试预算、恢复边界。工作状态使用 `pending / ready / running / blocked / passed / failed / needs-revalidation / canceled`，不以时间推算完成百分比。

真实 JS 运行的截图、日志和业务结果优先使用 `Execution.artifactDir`；任务目录只保存必要索引和交接。证据位于任务目录之外时，由协调者登记该 execution 的允许根目录及 executionId，再引用相对路径。不得为了读取交接而允许任意本地绝对路径。

遵守根 [AGENTS.md](../../AGENTS.md)：`.runtime/` 是可清理目录而非永久知识库。活跃任务由宿主明确保留；清理前核对引用并归档获准保留的脱敏资料。清理后无证据的旧进度不能继续表示有效。不要提交运行截图、秘密、探测产物或会话快照。

## 5. 通用 Invocation 与交接字段

这是作业数据约定，不是新增公开 Runtime API。V1 由宿主／Agent 按此合同检查；本文件没有安装自动 schema validator。

### 调用输入 `request.json`

| 字段 | 约束 |
| --- | --- |
| `schemaVersion` | 固定 `agent-to-recipe/v1`；未知版本阻塞，不能猜测兼容 |
| `taskId / workPackageId / attemptId / skill` | 属于当前任务；尝试 ID 唯一，重复接收不得重复触发桌面动作 |
| `mode` | 例如 plan/create、plan/revise、application/discover、harden、repair；其他 Skill 可为 normal／targeted-repair |
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
| `producerVersion / requestRef / inputRefs` | 记录 Skill 文件内容版本／hash 及实际消费的输入 |
| `executionStatus` | `completed / failed / canceled / interrupted`；只描述本次作业是否结束 |
| `artifacts[]` | `kind / rootId / path / sha256 / schemaVersion`；列出实际存在的主产物及必要索引 |
| `gate` | `verdict: pass / warn / fail`、明确 scope、criterionRefs、evidenceRefs、理由；区分计划通过、示范通过、候选通过与整链通过 |
| `facts / assumptions / unresolved` | 分开记录有证据事实、解释／假设和未决问题，较长内容以主产物引用表达 |
| `sideEffects` | 已执行／结果待核对的关键动作、目标及证据；不能把 uncertain 写成 not-executed |
| `failures[]` | primaryClass 映射 F0—F10；可有 secondaryClasses、责任环节、下一步安全动作 |
| `planDelta / nextRequest` | 建议变更或补采请求；生产者不得越权直接覆盖全局进度、上游事实和授权 |
| `continuation` | 可选；记录本 attempt 实际消费或产生的接续来源、证据作用和处置边界，不代替 artifacts、Gate 或失败记录 |

除表中明确标为可选的 `continuation` 外，所有交接都要有这些字段；不适用使用空数组或明确说明，不能用缺字段掩盖未知。门禁适用已有 G0—G7；只有 `pass` 可进入依赖该结果的正常路径，`warn` 仅可探测／诊断。格式完整的失败包可进入诊断，不能作为成功示范进入生成。

仅认识与审阅的 gate.scope 可以只放行该范围；定位／操作／业务未测不填 pass。若请求本来要求操作验证而未完成，不能改为只认识的 scope 后宣称原工作包全部通过。blocked 是工作状态，不擅自加入 executionStatus；已结束作业仍可能 gate.fail。

文件写完／格式正确／生产者自报成功，分别不等于业务成功。负向测试中，“错误期望被拒绝”是测试通过，但该业务执行仍应记录失败，不能混用两种 verdict。

### 已有资产接续的可选 v1 增量字段

`agent-to-recipe/v1` 的 request、handoff 和需要记录来源的主产物可以带可选 `continuation` 对象；旧产物不因此失效。该对象及其子字段缺失一律表示“未知／未记录”，不得推断为 false、空范围、从零生成或已满足。它只记录来源、证据作用和资产处置事实，不新增工作状态、scenario 状态或 Gate。尤其不得把 `reuse-unchanged`／`minimal-repair` 写进 `executionStatus`，也不得用 `gate.verdict` 表示资产是否被采用。

`continuation` 的字段词汇只在此定义：

下列所有 `*Ref`／`*Refs` 都使用现有引用结构 `rootId / path / sha256 / schemaVersion`；需要区分同一文件中的声明时再由 claim／scope 限定，不引入无 hash 的旁路引用。

| 字段 | 约束 |
| --- | --- |
| `sourceAssetRefs[]` | 接续起点的已有脚本、清单或相关资产。引用只能证明所指字节和来源记录，不能证明业务正确 |
| `evidenceRoles[]` | 每项包含 `evidenceRef / role / claimRefs / scope`。`role` 仅为 `asset-provenance`、`historical-evidence`、`reference-execution`、`agent-demonstration` 或 `candidate-qualification`：依次表示来源依据、当前接续前产生的历史证据、当前为理解已有资产而执行的参考观察、当前 Agent 示范事实、冻结候选的独立验收事实。历史事实不证明当前现场，reference execution 也不自动成为示范或资格证据。同一证据只有在分别满足条件时才能登记多个作用；一种作用不能自动升级为另一种 |
| `reverseSynthesis` | 可选对象，包含 `sourceRefs / scope / bounds / unresolved`；记录从已有实现反向提炼的明确来源、允许确认的范围、不得外推的边界和未决项。代码可证明实现结构，不能单独证明业务意图、真实行为或完整正确性 |
| `assetDisposition` | 可选对象，包含 `treatment / preservedScope / changedScope / reasons / changeRefs`。`treatment` 仅为 `reuse-unchanged` 或 `minimal-repair`；前者要求消费的脚本 ref／hash 不变，后者要求新候选、新 hash 和可核对的最小变更引用。它是处置分类，不是生命周期状态 |

完整新生成不得用 `continuation` 绕过成功 Agent 示范、完整 SemanticProcedure 或新候选验收。接续则可以只对声明范围做反向提炼和修复；范围外保持未知或未资格化，不能因未改动而自动继承结论。

## 6. 六类主产物最小内容

### TaskContract＋WorkPlan

TaskContract 包含 `goal / businessObjects / inputs / config / secretRefs / initialState / authority / successCriteria / failureCriteria / stopConditions / verificationPlan / supportedScope`。每条成功条件有稳定 criterionId、期望、证据来源、所需证明强度。输入、Config、Secret 和运行时派生值明确分开。

WorkPlan 包含 `revision / contractRef / workPackages / dependencies / budgets / changeLog`。先规划业务子目标，临近工作包详细化，远期未知项显式列出；新增步骤保持原稳定 ID，记录原因与受影响依赖。扩大对象、权限、支出或改变成功标准必须重新取得授权。

### AppProfile

包含 `applicationIdentity / environmentScope / states / regions / targets / geometryRules / operations / verifiers / preconditions / limitations / evidenceRefs / maturity`。每个 operation 有输入输出、前后条件、失败方式和当前公开 API 依据。描述规则，而非把一次窗口坐标当永久身份。未知布局、provider 或平台不得伪标 qualified。

### 应用工程增量

本节是字段职责与交接的唯一正文；专业方法见 application-operations.md，不建立第二份 AppProfile 或公共 UI Runtime schema。下列新格式是本次定义的方法合同，尚无自动校验器、宿主加载或运行兼容性通过证据。

**版本与兼容。** request／handoff 仍用 `agent-to-recipe/v1`。使用本增量的 AppProfile 主文件用 `schemaVersion: agent-to-recipe/app-profile/v1.1` 并保留既有字段，新增 `revision / observationRefs / relations / claimSources / changeLog`。新增数组没有适用条目时可为空，但关键缺口必须写入 limitations／unresolved，不以空数组代表已经核验。旧 AppProfile 可以作为历史／接续来源；新消费者对缺失关系、审阅、验证信息保持未知，不能默认通过。不了解新产物版本的消费者必须拒绝正式消费，不能丢弃新约束后继续；不冒称旧消费者已经通过兼容测试。

| 内容 | 归属与最小含义 | 消费与失效 |
| --- | --- | --- |
| 本次观察 | observationRefs 指向不可变观察记录：截图引用、来源、采集时间或未知、应用／窗口／页面范围、imageSize、裁剪缩放 mapping 或未知、原始文字／原生属性及完整性 | 支持当时可见事实；未知映射不阻止认识，但阻止依赖其的桌面坐标操作。新页面／时刻是新观察 |
| 界面认识 | states／regions／targets 保存稳定本地 ID、类型／名称／parentRegionId、必要状态与 observationId 关联；一次 textBounds、controlBounds、safeActionRegion 分开，注明坐标空间，未知用 null 加原因 | 图片矩形只属对应观察，不作永久目标；动态业务值和记录实例不写成以后运行的固定答案 |
| 关系 | relations 每项有 id、kind、from、to、来源及未知说明；父子用 parentRegionId；标签—输入、Tab—面板、记录—动作明确对应 | ID 唯一、引用存在、父关系无环；字段形式合法不证明关系语义正确 |
| 主张来源 | claimSources 按对象 ID 和字段路径关联 evidenceRefs、观察事实／模型解释／假设／人工修订的来源类型与简短依据 | 模型分类、置信度及算法结果不自动成为实测事实；没有读到状态不等于 false |
| 候选规则 | 在 targets 的定位描述、geometryRules、operations 和 verifiers 内记录实际条件、环境范围、必要依赖和失败去向；不新建并行规则注册表 | 同屏坐标、人审标注、模型候选不自动升级成熟度；布局／环境变化重新核对 |
| 修改影响 | changeLog 保存旧版本引用、字段、旧新值、原因、修改者、范围；规则／操作／verifier 用 dependsOn 的本地对象 ID 表达必要依赖 | 按依赖传播 needs-revalidation 建议；依赖不明保守复核。工作状态仍由协调者更新，不覆盖历史验证 |

上述 ref 均沿用本合同的带根目录、hash 和格式版本的引用结构；对象内引用用本地 ID，与文件 ref 区分。外部截图或原生观察的原始格式不能被模型重写成“实际读取”。不在这里制造观测数据、placeholder hash 或伪造原生元素 ref。

**任务优先级。** 当前核心目标、必要依赖／安全前提和次要候选，在 WorkPlan 当前工作包范围中按目标 ID 表达，并记录延后原因、影响、再处理条件。原本必需的目标不能因识别困难被降级；范围改变走计划授权流程，而不是改 AppProfile 中的永久重要性。

**审阅和验证。** 当前认识数据先冻结，再由独立审阅／测试记录引用该 AppProfile 的精确 ref；handoff.artifacts 发布 Profile、记录和视图的引用，不把当前审阅记录的 hash 写回其所引用的 Profile，避免互相引用的 hash 环。记录可以同一文件按对象／范围组织，不强制每个控件一个文件。

审阅记录至少写实际 appProfileRef、scope、核验方法、执行者或实际人工、时间、结论、未知及修改请求。结构校验、自动语义核验、人工审阅分别记录；不存在的人审不填确认者。修订 Profile 后发布新版本，再生成视图并按影响复核；旧记录仍只证明旧版本和范围。

验证记录至少写实际 appProfileRef／helperRef、目标或操作、环境与场景、criterionRefs、预期与实际、evidenceRefs、pass／fail／not-run／blocked、重验范围；位置、人审、动作返回、后置及业务结果分别判断。只有候选脚本正式验收使用 QualificationRecord；应用局部验证记录不能冒充整份候选资格。

原图、叠加图、简化布局、属性差异视图来自同版数据。视图保存源版本、源 hash、涉及目标 ID；每个视图自身 hash 在 handoff 清单记录。未生成的视图不能列为已存在输出；原型需实际取得并复核才可引用，不继承聊天中的通过声明。

**正常路径的最小记录。** 始终保留当前业务对象、所用版本、关键观察／动作／读值、必要验证、范围和未知；新认识或影响性修订生成审阅材料；详细候选比较、全量结构、视频和跨环境分析仅按诊断／能力建设范围采集。减少冗余，不减少已经约定的审阅或关键证据。异常前证据不能事后补造。

**消费者放行。** 示范可消费最小认识并受控探索；提炼用应用术语与关系，但真实过程仍来自 Dossier；生成依赖已落实的操作及实际 API；只有认识时不能假装已有可执行操作；验收冻结具体候选和依赖。仅认识包的 pass 只支持该范围，定位、操作和业务未测保持未测。

### DemonstrationDossier

包含 `contractRef / planRevision / appProfileRefs / executionRefs / actualInputs / initialState / finalState / actionsRef / runtimeValues / verification / evidenceRefs / unresolved / privacy / sideEffects`。

重要节点随操作保存，不等结束后回忆：动作与脱敏参数、目标及简短依据、预期变化、实际观察、验证、分类、重试／恢复关联。允许复用已有工具／execution 日志并加语义引用；不启用 Recorder Session，不保存模型私有思维过程，不要求所有场景强制 OCR。

每个 `runtimeValues` 项包含 `name / type / observedValue / origin / evidenceRefs / consumers / validity / reacquireOnFreshRun`；金额等还须标单位／精度，身份须有业务依据。示范观察值不是以后运行的默认业务答案。

### SemanticProcedure

包含 `businessSteps / parameters / config / secretRefs / runtimeValues / dataDependencies / retainedReasons / omittedReasons / recoveryCandidates / supportedScope / unresolved / evidenceRefs`。每步定义输入、前后条件、输出、验证与副作用；区分事实、解释和待测规则。去除探索不等于删除事实。未证明分支只作为候选或补采请求，不进入支持声明。

接续中的反向提炼只能在 `continuation.reverseSynthesis` 声明的边界内确认过程；已有代码说明“实现了什么”，不自动说明“业务为何如此”或“现场确实成功”。用于最小修复的局部 SemanticProcedure 可以有受限 Gate scope，但不能冒充完整新生成所需的完整过程。

### CandidateManifest

包含 `scriptRef / scriptHash / contractRef / procedureRef / appProfileRefs / apiRefs / entryCommand / workingDirectory / inputContract / dependencies / supportedScope / sourceMapping / limitations`。脚本以普通 JS 的函数、验证、失败处理表达业务；sourceMapping 可为业务步骤到函数的简表，不是 SourceMap／IR 引擎。读取在线 OCR／Vision 或模型依赖必须明示；不得把依赖 Agent 实时规划的程序称为确定性离线 Recipe。只有 `reuse-unchanged` 且本次声明范围不要求反向提炼时，`procedureRef` 才可为 `null`，并须在 `limitations` 与接续处置中说明；不能用该例外规避新生成或最小修复所需的过程依据。

接续时清单通过可选 `continuation` 保存已有资产 lineage 和实际处置。原样复用可以直接引用获准路径下 hash 不变的脚本，不要求复制或重写；任何代码修改都形成新候选并使旧资格结论不能自动沿用。

### QualificationRecord

包含 `candidateRef / contractRef / scenarios / actualCommands / workingDirectories / executionRefs / buildProvenance / environmentScope / observedResults / evidenceRefs / failedCriteria / skipped / verdict / repairRequests`，并可带 v1 增量字段 `qualificationScope`；旧记录缺失该字段表示资格范围与链路来源未知，不能推断为完整范围或任一链路。`qualificationScope` 包含 `lineage / requested / exercised / qualified / excluded`。`lineage` 仅为 `reference-only`、`continuation-chain` 或 `new-generation-chain`，分别表示只验参考候选、从已有资产接续、由当前完整新生成链产生；这是来源分类，不是状态或 Gate。其余四项分别记录调用者要求验证的范围、实际执行范围、证据足以支持的子集，以及候选已声明但明确不在本次 requested 内的范围与原因。requested 中未资格化的部分不得移入 `excluded`，必须保留在场景／`skipped`／`failedCriteria` 中；只有 requested 全部进入 qualified 且没有对应 fail、not-run 或 blocked 时，`verdict` 才可为 pass。生产者不得为取得 pass 静默缩小 requested；handoff 的 `gate.scope` 不得宽于 requested，且 gate 为 pass 时不得宽于 qualified。场景结果至少区分 pass、fail、not-run、blocked，不得把没有执行写成通过。验收只针对具体候选与范围，不能修改候选和标准后仍沿用旧资格结论。

## 7. 发布、消费与恢复

1. 生产者写入本次 attempt，保留错误和未完成资料；每次新尝试新目录。
2. 检查必要字段、输入版本、引用可读性、路径根、敏感信息及 Gate 依据。
3. 最后发布 `handoff.json`，由协调者重新检查再更新 progress。宿主支持安全替换时可用于发布；不得假设 OpenDesk File 已保证跨文件事务。无该能力时，消费者必须以完整性和 hash 检查拒绝半写入。
4. 下游独立核对 taskId、合同、版本、scope、产物和证据。hash 仅核对内容一致，不证明真实或可信；关键事实仍检查原证据。
5. 输入在下游运行期间更新时，该尝试仍属于旧输入版本。不得把旧结果发布为新计划通过；协调者进行影响分析并标 needs-revalidation。
6. 产物已完成而 progress 未更新：核对产物后补状态，不重做业务动作。只有 running／旧 done 标签而缺产物：不得跳过。
7. 现场状态与历史事实分开处理。窗口、焦点、账号、页面和坐标每次重新检查；知识可复用不代表现场仍有效。

业务动作前中断：重新确认现场后决定执行。动作可能已生效但未记录：先核验实际效果，不能默认重试。结果不明时进入待核对并停止后续副作用。自造 UUID、文件 checkpoint 或阶段标记不证明 exactly-once，不恢复 JS 调用栈，也不能回滚外部应用。

## 8. 暂停、取消与定向返回

暂停：安全边界不再派发下一工作包。取消：请求宿主停止当前执行并核对结果；取消不撤销已产生副作用。恢复：重新检查产物和现场。`Execution` 是只读上下文，不是 execution 管理器；外部控制按 [HTTP API](../api/http-server.md) 等实际入口核对。未支持的暂停／隔离／取消不得伪造为已生效。

工作包开始、结束、阻塞、计划修订、风险升级时报告；长阶段按宿主实际可实现的预算内间隔报告当前问题、最近证据、阻塞和下一步，不能让“正在分析”代替进度。同类失败无新证据时停止盲重试。生产者互相回退也消耗任务总预算。

| 问题归属 | 返回责任 |
| --- | --- |
| 目标、授权、成功条件或拆解错误 | automation-plan；需变更授权时先停止 |
| 应用／窗口／定位／布局／等待假设错误 | application-engineer；已知加载先按已有有界规则等待，未被覆盖或存在冲突才重新认识 |
| 缺真实动作、关键数据或结果证据 | task-demonstrate 定向补采 |
| 因果、参数来源、业务分段错误 | procedure-synthesize |
| JS API、代码组织、异步或错误处理错误 | recipe-build |
| Oracle／测试设置／验收证据不足 | recipe-qualify；不能通过放宽条件修复 |

F0—F10 描述问题，不单独决定是否可重试；同时检查风险与 Gate。独立验收只提交 repairRequests，不静默改脚本。修改后生成新候选，重跑受影响场景并保留必要回归。

## 9. 交付、维护与验收基线

交付具体脚本版本、正常命令、工作目录、输入／配置、能力和平台范围、实际测试及未测项、证据与停止／恢复说明。应用版本、provider、代码或关键配置改变后做影响分析；旧记录保留但不能证明新版本。

共享 Skill 是方法资产，不接收任务临时记忆。AppProfile／helper 可在脱敏、证据与范围审查后晋级复用；一次成功不自动写回通用规则。V1 采用人工／宿主审核，不新建自主学习平台。

必须分别验证：无旧聊天交接、关键证据缺失、半写产物、混入旧任务、版本更新、三个中断位置、现场变化、暂停／取消、数据类型／单位不匹配、越界路径／恶意内容、入口环境差异、自报假成功、Fresh Run 旧结果污染。优先用离线副本／低风险计算器，不对真实付款、发送或删除进行破坏性注入。

原合同保留交接 20、恢复 20、业务验证 25、安全控制 20、兼容交付 15 的历史评审权重作为来源；当前工作流统一使用 validation-plan.md 的五维、20 项评分办法，不同时维护两份有效验收评分。没有实际证据不填写能力成绩，不声称进行过多专家讨论。设计评审与运行资格必须区分。

2026-09-08：本次只深化应用工程合同并写入正式 Skill 方法入口。保留既有主产物和 request／handoff 枚举，修正失效调用入口，明确同一 Agent、工作包内部复用、最小数据和 AppProfile 增量版本；辅助工具、模型提取、独立上下文、实际桌面及整链验收尚未因写入通过。
