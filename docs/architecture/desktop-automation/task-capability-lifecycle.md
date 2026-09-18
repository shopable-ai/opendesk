---
title: "Automation Capability Lifecycle｜运行、生产、资格与复用"
description: "以任务与可选资产为中心，Agent/Human/已有资产产出普通 JS；复用唯一 Flow Catalog，制作、保存、安装、启用与运行分别授权。"
---

# Automation Capability Lifecycle

架构与实施合同 v0.4，2026-09-18。当前源码与官方机制核查基线统一见 [主方案](../assistant-script-invocation.md) 第 4—5 节；写入按当前目标 SHA 核对。本轮仅修订文档，不修改 Runtime、安装器、Recipe 或 UI，不运行真实业务／模型／Runtime 测试。

v0.4 纠正 v0.3 的必需项目假设：**制作绑定本次任务和可选资产，开发项目可选；工作资料由系统按需准备。** 唯一 Local Flow Catalog、普通顶层 JS、本地 Codex 与助手共用任务资料的原决定保留。不用工作区改名继续强制项目管理。

## 1. 最终架构决定

**一个 Flow 安装／Catalog／执行体系、制作与使用两条链、保留真实来源、精确候选与独立资格。**

制作：真实目标 → 任务＋可为空的资产引用 → 按需自动准备工作资料 → 获准操作并同步留证 → 业务结果核验 → 提炼普通 JS → 冻结候选 → 获准独立验证 → 明确保存／按需要安装／启用。

使用：允许的 Flow 范围或明确资产 → 核对固定行为／真实可变参数 → 宿主可信预览与确认 → 共同执行 owner → 当次结果与证据。使用不隐式改代码或进入作者态；Gap 只有经用户明确同意才能进入制作，不能自动重跑已完成业务。

普通问答和已确定 Flow 运行不强制创建制作目录。Normal Mode 自动选择满足可信来源、启用、资格与当前可用条件；开发者明确直接运行自己 JS 的既有方式不因此被全局禁止，也不强迫先安装。脚本本身无模型依赖时，Runner／CLI／Scheduler 确定运行不依赖 Codex。

独立 Execution 使用既有 Runtime；不新增聊天专用 Runtime、Workflow IR、可执行 DSL、递归启动器或每个脚本一套 Skill/profile。

## 2. 三层责任与唯一真相

| 层 | 拥有 | 不拥有 |
| --- | --- | --- |
| Runtime Execution Plane | 请求／运行身份、输入及固定约束、确认、执行／取消、资源仲裁、真实结果 | 业务代码修改、扩大资格、模型自授权 |
| Capability Resolution / Catalog Plane | 唯一 Flow Catalog 的受控调用投影、候选／资格引用、支持范围、澄清／Gap | 第二安装库／Trust Store，执行源码探测 metadata |
| Capability Authoring Plane | TaskContract、可选资产、应用规则、普通 JS 候选、独立资格和保存／发布请求 | 热改安装版本、继承运行授权自由开发、建立项目管理系统 |

[主方案](../assistant-script-invocation.md) 拥有四类入口、总体结构、历史调用链、官方机制与实施顺序；[绑定合同](../assistant-workspace-bindings.md) 拥有任务／会话／资产／授权／工作目录／运行身份；本文拥有作者、资格、发布、运行及维修生命周期。

[Flow 分发安装](../execution/flow-distribution-installation.md) 拥有格式、安装、信任、权益和物理根；[共享 Skill 合同](../../frameworks/agent-to-recipe-skill-contract.md) 拥有既有 TaskContract／AppProfile／SemanticProcedure／CandidateManifest／QualificationRecord；[Agent 链](../../../workflows/agent-to-recipe/design/chain-design.md) 和 [Human 链](../../../workflows/human-to-recipe/README.md) 保留来源方法。G0—G7 与 F0—F10 继续分别由 [Gates](../../quality/gates-and-evidence.md) 与 [Failure Taxonomy](../../quality/failure-taxonomy.md) 维护。

不新增同义 Program／Skill 注册、第二份商业 B0—B6 台账或 conversational-task-runner 工作流。索引／说明只是来源摘要固定的只读投影；AppProfile 是应用规则权威，Recipe 是真实代码，Qualification 是验证记录，不形成双向独立编辑的多份事实。

## 3. 真实基线与缺口

2026-09-16 的 Calculator 专用注入、固定 envelope、旧 Runner 用户目录与 App-owned execution 接缝保存在主方案第 3 节。主方案第 4 节于 `a3ad21f2699f4b56db50dea959d5a20ba95f573e` 复核了 task-service、analysis-only Agent adapter、App-owned JS 入口、实际 Flow Catalog／authority 与作者合同；这是源码范围，不是当前发行包或所有跨入口功能已通过。

Flow 分发合同已选定 flows/installId、内容／数据／状态分离和共享安全链，真实 flowinstall/Catalog 已存在；不能因旧 IMPLEMENTATION_PENDING 从零重做。Catalog 的 ready 不能直接代表助手已启用、业务资格或本次许可。

| 范围 | 源码事实 | 仍不能推断 |
| --- | --- | --- |
| 正式 AI 助手 | main.js 直接注入 `capabilities/calculator.js`，两个固定 task；模型只生成 envelope | 用户业务应放该目录、通用目录已完成 |
| 产品用户目录 | Flow Runner 使用 `OPENDESK_APP_DATA_DIR`/用户 home 下的 appDataRoot；runnableRoot 可由 `OPENDESK_FLOW_RUNNER_DIR` 指定，旧 `OPENDESK_SCRIPT_RUNNER_DIR` 仅为兼容 fallback，默认 `recipes` | 目录里每个 JS 都有助手可调用资格 |
| 产品执行器 | `cmd/opendesk/app_recipe_runner.go` 为 JS 创建新 Runtime/Execution，同 App host 进程；有 BUSY、Recorder 检查、取消和入口快照 | 第三方沙箱、全局原子桌面锁、结构化业务 input/result、依赖闭包或 `.odpkg` 已支持 |
| 助手接线 | 当前仍在助手已有上下文调用 Calculator 模块 | 已经复用上述用户任务执行器 |
| 调用历史 | request/message/终态存在 | 完整的候选、参数来源、版本与步骤审计记录 |

早期 Chat mock 12/12、Recorder／golden 和静态 refiner 记录保留其原范围，不是本轮重跑或当前业务资格。task-demonstrate／trace-distill 等历史职责名称不证明同名 Skill 已安装。新 opendesk-author／opendesk-use 是两个通用方法入口的设计名称，不是新增业务分发格式，也未由本轮部署。

当前作者通道、有效加载来源隔离、任务工具权限、实时留证、联合停止及四类入口的真实集成仍需验收；不能从一份 Skill 或官方 CLI 支持推断已经完成。

## 4. 最小 Automation Capability Contract

### 4.1 不可变对象与发布条目

```text
CapabilityDefinition：用途、固定行为、输入输出、支持范围、安全合同
CandidateManifest：固定 Definition、入口／适配器、真实依赖、来源
QualificationRecord：精确 Candidate、预定标准与独立证据
CatalogEntry：这些记录到唯一 Local Flow Catalog 确定内容的受控关联／投影
```

引用无环：Definition 不回指 Candidate／Qualification；Candidate 不回指 Qualification。入口与摘要由 Candidate 固定，不由模型给任意路径。现有严格 schema／签名 Manifest 不支持的表达采用版本化映射和兼容测试，不偷偷加字段。

能力说明不是新的分发格式。Flow 的已验证来源／flowId、installId、内容摘要／版本及必要逻辑 operation 与候选／资格关联。历史独立 CatalogEntry 映射为唯一目录的关联／投影，不新建可执行安装库，不修改原始签名 Manifest 字节。未知描述符不能靠“本地文件”自获信任。

### 4.2 Definition 最小信息

身份与用途；固定业务效果和禁止项；严格输入／输出或明确无业务参数／无结构化结果；相关平台／应用／版本／layout／locale／账号范围；入口与候选关联；只读预检与权限；副作用、可信预览、超时／取消／重试；配置／Secret／模型外发政策。

资格与发布不是模型可写的 qualified:true。允许域是声明、证据、当前环境／策略与本次授权的交集。图标、热度或语义相似度不提供资格。助手调用集合是授权条目的过滤／索引，不要求源码项目。

### 4.3 固定／参数化是输入维度，不是代码形态要求

固定顶层 JS 可直接作为 entry，不强制改函数。零参数只允许空业务输入，但固定门店、收件人、输出与副作用必须符合本次完整请求；不支持改变就澄清／明确扩展，不能吞掉限制照跑。

参数化必须实际代码消费并通过扩域验证。预设绑定确定内容与锁定／可变字段，不复制 JS。业务输入、环境配置、Secret、定位常量和 Observation 分开。当前账号、窗口、剪贴板、选中对象及日期可能是隐式输入，必要未知则停止。

### 4.4 Executor 仍是普通 JS

助手、Runner 和受支持 CLI／调度入口复用正式 Flow／Recipe owner，不模拟点击 UI，不向常驻助手 eval 用户脚本，不造第二 Runtime。直接源文件、任务候选和已安装 Flow 保留不同来源语义，共同进入既有执行边界。

script 由 loader 在获准 Execution 执行；module 通过预先固定的入口调用，launcher 同样进入依赖。内部组合 helper 不需要每个 helper 一个 Execution，也不开放任意 DAG 自动组合。

结构化 per-run input/result、期限或事件能力不足时扩展原 owner 并同步类型／API／JS 测试，不虚构 global。禁止字符串替换、共享状态、模型临时写 launcher 或任意 Shell／代码路径注入；业务文件沿 schema 与资源授权解析。

Agent cwd、源文件位置、Execution cwd、脚本／资源根和输出位置分别固定；任务目录不是新的业务 cwd。复制候选不能自动证明相对路径兼容，未知依赖／入口不能错误运行。详细路径、冻结和保存规则见绑定合同。

独立 Runtime 不等于 OS 沙箱；没有强制边界的第三方脚本不能被描述为按 metadata 自动安全。native、Command、网络／文件权限和崩溃边界分别核验。保留现有 App 身份，不为每个 Flow 自动启动另一个主 App。

### 4.5 Planner / Resolver

候选来自唯一目录授权投影，先约束再召回／排序；模型只提议允许集合里的 Flow／operation 与业务输入，宿主固定版本、路径、资格与授权。已明确选定 Flow 和后续修订不重新模糊匹配全库。

区分 runnable、clarify、blocked、待重验／维修／扩展和 Gap 的语义，不强迫旧 API 采用新 enum。未知 ID 拒绝；同 ID/version 不同内容隔离；重名按来源／对象消歧。索引可重建，内容变化失效，查索引零业务执行。

## 5. 普通用户 Runtime 状态机

目标／上下文修订 → 可信条目与固定候选／资格 → 固定行为／输入校验 → 只读 preflight → 必要准备另获有界授权 → 宿主预览／RunBinding → 用户确认 → 原子取得执行权并重查 → JS → Observation／业务验证 → 真实终态。

加载 preflight／preview／verifier 代码前先校验信任和内容，这些代码也属于候选依赖。发现或解释时不执行不可信探测代码；预检不隐式打开、清空、发送、登录或反复弹权限窗。动作型准备须独立授权。

确认固定请求 revision、候选／安装内容摘要、资格、输入／固定影响、相关配置、目标账号／对象、策略和有效期。范围、内容、参数或目标变化使旧确认失效；无关目录新增只有在可证不影响绑定时才可不影响确认。

同一桌面操作权由共同 owner 仲裁；UI 单活动请求不证明外部 CLI／Recorder／其他 Runtime 互斥。未覆盖执行者按受监督单操作者范围说明。BUSY 不建隐形队列；计划运行使用原调度授权并重新核查时效，不强制经过模型。

重复确认最多启动一次。停止阻止新动作，并向 Codex 与实际工具／Execution 两侧取消，待真实收口；迟到事件归档原任务而不复活旧请求。关闭窗口、崩溃或断连不能伪装业务安全完成。取消不撤销已提交效果，不承诺 exactly-once。

## 6. 能力解析与 Gap 路由

| 情况 | 处置 |
| --- | --- |
| 已启用且当前适用 | 校验／确认／执行，不改代码 |
| 意图、参数、固定对象或目录入口不清 | 在原会话澄清，不跨会话借参数，不随便挑 JS |
| 用户要求改变固定效果 | 拒绝错跑，选择真正适用资产或明确作者态扩展 |
| 未激活、权限／认证／依赖／状态受阻 | 具体 guidance／有界准备，不静默换任务 |
| 候选合格但未发布或启用 | 核对证据和相应批准，不强制重新生成 |
| 代码未变、证据不足或新环境未验证 | 重验，不先强迫修代码 |
| 应用／定位／过程／代码失效 | 定向维修，新候选和必要回归 |
| 无能力 | Gap → Existing Assets 优先 → 用户选择 Agent／Human／Recorder |
| primitive 缺失 | 证据化 gap → 原 Runtime 扩展 owner → 回到原任务 |
| 政策禁止或所需权限边界不能实施 | blocked，不提权／安装绕过 |
| 已安装保护 Flow 无可编辑源码 | 允许范围内解释或依法使用；改进需另有合法来源，不解密给模型 |
| 外部效果未知 | 核对／人工接管，不自动重试 |

Gap 保存原请求及修订、脱敏目标／标准、拒绝原因、已知／未知环境、可复用资产、缺失能力、建议入口、权限与预算。它不是扩大文件读取或模型外发范围的许可。收件人、正文／文件和日期时区在真实发送前明确；作者／验证授权不自动批准真实客户发送。

## 7. 两条作者链共享结果，不伪造来源

Agent：TaskContract／WorkPlan → 最小应用认识 → 获准真实 Dossier → DistilledSteps → SemanticProcedure → 普通 JS Candidate → 独立资格。

Human：Recorder 原始记录与审阅 → 仅保真时 recorder-script-refiner；固定业务足够可靠时直接冻结验证；需要行为修改／参数化时走 human-to-recipe 的 disposition／Episode／SemanticBuildPlan，按缺口调用 application-engineer。

Existing Assets：固定来源与内容，复用有效证据，只补当前缺口。无资产是合法的新任务起点，不建空项目；单脚本无需轻量项目包装；目录需要明确入口与依赖；安装资产的使用不要求源码。

三者共用已有 TaskContract、AppProfile、SemanticProcedure、Candidate、Qualification，不强制六份重复 JSON。完整新示范不借接续例外绕过要求，旧有效证据也不因换入口清零。

保留 sourceRef/hash/source format/mappingVersion 与 unknown；Qualification lineage 与 Human／Agent 来源正交，不伪造枚举。taskId、产物、阶段和下一缺口持久保存。Codex thread 可替换且不是任务包，不能为换线程从零重做。正常同一 Agent 可连续使用多个方法，不要求每个职责另起模型。

opendesk-author 是通用方法门面，引用现有链；opendesk-use 不进入作者工具。Skill 不复制每份业务 JS，不提供授权。实际工具能力不足时报告 gap，不新建通用 Agent 编排来绕过。

## 8. application-engineer 的共享位置

保留 `workflows/agent-to-recipe/skills/application-engineer/`，Agent／Human／失败修复共同使用。

discover 只补当前任务必要认识；harden 补定位、等待、读数与后置保障；repair 消费精确失败现场定向修复。交付身份／locator／geometry／guard、来源、unknown、局部验证与范围建议，不拥有业务标准、整份 Recipe 资格或发布批准。

业务脚本复用应用 helper；共享 helper／Profile 变化纳入全部消费者影响分析。不为 Calculator／微信／Excel／ERP 分别建权限、窗口和执行服务；不复制整个 OpenDesk 开发仓库作为每个任务资料。

## 9. Independent Qualification、保存与发布

独立性包括冻结候选／依赖、预定标准／场景、获准 fresh run、独立 Observation／Oracle，验收中不改候选或降标准。不是另一个模型说 PASS，也不强制每阶段另开 Agent。

Qualification 固定实际代码／适配器／依赖摘要、Runtime／UI-host 来源、相关平台／版本／locale／layout、固定范围／参数域、实际入口／cwd／资源映射、requested/exercised/qualified/excluded、证据和未运行项。Gate 执行真正候选，不另写动作替身，不用模型补做。

先确定测试对象、首次真实任务已经产生的效果、恢复／去重策略和授权，再运行、反例、取消及必要回归。不能安全重复时保留已获有限证据，独立业务资格不标 PASS。旧证据按精确内容和范围复用，扩域不复制旧 PASS 到新 hash；缩域需明确保留原失败。

候选默认不覆盖源资产。回写／另存依据审阅 diff 与目标、源基线摘要和当前权限；并行变化返回冲突，目录无事务则另存完整候选，不能假称原子回写。保存不自动安装、启用或运行；保护 Flow 不因改进而改安装树或泄露源码。

发布、安装、助手启用分别处理：`.odflow` 复用 parser/signature/Trust/Entitlement/install/transaction owner，`.js` 走既有轻量导入或明确直接运行；本地记录不伪称发布者签名。声明合格不替代信任／权益，安装成功不自动得到业务资格。

内容只进入现有 flows/installId，无正式 version 子目录；数据、状态分离。不建设 capability-catalog／capability-releases。版本由摘要及发布引用固定，运行中更新／删除由原 owner 协调。投影增加调用说明不能改签名 Manifest，schema 变化需版本映射。

任务持久资料与可丢缓存分开。未另存唯一候选、未完成任务、未知效果对账材料及有效资格引用是保护集，不能按 TTL 删除；历史 `.runtime/automation-authoring` 也先检查引用和唯一性。有效证据进入既有持久设施，缺能力则在原 owner 补齐并阻止相应放行，不造新可执行库。删除会话不删除源脚本、Flow 和输出。

拒绝半写入、重复身份异内容、越界／链接逃逸、缺依赖／证据／引用与过宽范围。并行保存／发布按 revision/hash 比较更新。撤销是策略事件，不篡改历史；回退只选仍可信适用版本，不偷偷改绑请求。哈希只证明字节身份。

## 10. App 版本与资格失效

放行同时要求：可信且启用条目、实际内容一致、资格可复核未撤销、固定效果／输入符合请求和验证域、相关应用／平台／版本／layout／locale／账号适用，以及 Runtime／权限／权益／策略／本次授权满足。

与任务无关维度可证明不适用，不要求纯文件任务都验证 UI 布局。关键相关未知则阻塞；产品支持 Windows 不代表每个脚本跨平台。允许窗口平移不等于 resize／DPI／reflow 都兼容。

旧环境仍适用的版本不必全局撤销；新环境先重验，已证实缺陷按影响暂停／撤销。加载点固定真实内容，不能先 hash 再重新读被替换文件。业务可变数据、配置和 Secret 身份分别按影响管理。

## 11. Runtime Failure → Repair → Requalification

Failure Package 沿用 F0—F10，保存 task/run/step、Flow／候选／资格／Profile、固定约束／脱敏输入、授权／环境、最后 Observation、错误／原因／unknown、已尝试恢复和证据保留条件。

区分动作未提交、已提交待核对、效果已确认及未知；无证据就是 unknown，不补造现场或 exactly-once。

理解／参数错回澄清；权限／准备错归原 owner；观察／定位错回 application-engineer；顺序／数据流错回原过程；代码错修 Recipe；primitive 缺陷归 Runtime；Gate／证据错修验证；外部未知先核对。不要一律重录或重新认识应用。

修复产生新候选及相应资格；纯重验同一代码可追加资格，不伪造代码变更。只允许事前声明、已验证、有界且未越权的运行中恢复；无新证据的同类失败停止重复。共享依赖改变验证受影响消费者。使用态提出维修需求不自动授权作者态。

## 12. 混合 JS + LLM + Agent Recipe

真实 JS 读取 → 合同内模型节点 → 输出结构／语义校验 → 有界参数或枚举 → 已验证 JS 分支 → 实际 Observation／业务验证。

模型 backend/profile、prompt/schema/validator、允许工具／外发、版本／预算／期限和拒绝／歧义／不可用处理纳入候选。远端模型不能保证不变，保留评测集、配置身份与变化重验规则。

网页、邮件、控件、录制注释、源码说明仅作数据，不升为指令、权限或目录事实。模型输出不是任意代码／路径／Shell；未知则停。外发内容／对象最初未知时，在最终副作用前展示实际内容并确认，最初总确认不能代替。

Codex 官方机制与实际 OpenDesk 接入分开。当前只读 Planner 不扩权；作者工具在服务端校验，配置／Skills／hooks 来源限制及中断需要真实版本验收。近期有界 exec；富交互才评估 App Server，不让后者成为本地制作的前置。主方案维护本次官方核验，[历史研究](../../research/rpa-authoring-reuse-design.md) 保留其原版本范围。

## 13. 统一任务分解树

```text
A 接住目标：任务修订、可选资产／开发来源、使用范围、固定约束与预算
B 查找能力：唯一目录投影、资格／环境、适用／澄清／阻塞／Gap
C 受管执行：预检、独立准备授权、确认、共同仲裁、现有 Execution
D 真实结果：同步动作／观察／验证、联合停止／未知效果、精确身份
E 接续资产：Existing Assets 优先，Agent／Human 来源不混同
F 生产候选：任务资料按需，固定 JS 可直接冻结，按需提炼／参数化
G 独立资格：精确候选与标准、获准测试状态、反例／取消／回归
H 保存与安装启用：候选不默认回写，既有 Flow owner，分别批准不自动运行
I 定向维修：失败归属、依赖影响、保留有效证据、新候选／重验
J 贯穿治理：文件／工具授权、信任／权益、隐私、并行修改与保护集清理
```

保留 S1—S12／Human 内部方法树，不把它当成必须安装的一组 Skill 或一组新 Agent。

## 14. 近期实施与后续

按 [主方案](../assistant-script-invocation.md) 第 9 节 T0—T5 推进：先无项目任务绑定与资源反例，再本地受管 Codex、独立验证和接续资料；闭合真实资产的对话复用，最后按需增加助手富交互。相关宿主接缝可并行补齐，已有资产只从实际缺口继续。

旧 P0／P1 是历史排期，不重建已完成 Flow 安装／上下文／Catalog。商业安装状态引用原台账，不在此复制进度。Calculator 新路径真实通过后才移除旧注入，golden 保留原范围。

大规模语义检索、任意 DAG／DSL、第二 Runtime、通用多 Agent 平台和无人审发布均非前置。第三方强隔离若未提供，就阻塞要求该保证的执行，而不是声称默认安全。Marketplace 独立推进但复用安装链；Remote Catalog 不是本机可运行集合。

## 15. 验收与评分边界

唯一权威为 [制作与复用验收合同](../../quality/assistant-authoring-reuse-acceptance.md)：A 真实完成、B 脚本独立复用、C 助手正确选择运行；AR-01—44；五专业视角模拟评审、评分及硬否决。不要在其他页复制一份会漂移的分数或测试状态。

本轮未执行这些业务测试。mock／静态／真实模型／Runtime／业务／视觉分别留证；公共 Runtime 行为用正式 JS。缺目标平台按既有规则记录，不伪造 PASS 或启动未授权 VM。

强制项目、未授权读取／执行、跨会话／版本错绑、丢弃固定约束、绕过信任／权益、未知效果盲重试、停止不实、丢失唯一资产与未验证宣称成功均为硬失败，不能用设计分数补偿。
