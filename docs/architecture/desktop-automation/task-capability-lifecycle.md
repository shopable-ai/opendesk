---
title: "Automation Capability Lifecycle｜运行、生产、资格与复用"
description: "Agent/Human/已有资产生产普通 JS；能力合同投影到唯一 Flow Catalog；制作、安装、启用和运行分别授权。"
---

# Automation Capability Lifecycle

架构与实施合同 v0.3，2026-09-18。文档核对起点为 `master@a1a02edab815567bd1a10e869adee50081c05af1`，写入按当前目标 SHA 核对。本轮是文档修订，不修改 Runtime、安装器、Recipe 或 UI，不运行测试；旧源码快照的 NOT RUN/PENDING 不推断当前实现状态。

本次在 v0.2 基础上同步三项决定：制作绑定项目，使用绑定 Flow 范围；能力目录是唯一 Local Flow Catalog 的调用投影，不另建物理安装库；本地 Codex 与后期助手内 Codex 共用制作任务包。固定顶层 JS 继续是一等对象，不恢复“必须先函数化/参数化”的旧限制。

## 1. 最终架构决定

**一个 Flow 安装/Catalog/执行体系、两种用户模式、保留来源的作者工作流、精确候选与独立资格。**

制作：真实目标 → 用户工作区/制作任务 → 获准操作并同步留证 → 业务结果核验 → 提炼普通 JS → 冻结候选 → 独立验证 → 明确发布/安装/启用。

使用：允许 Flow 范围 → 符合请求的固定行为/可变参数 → 可信预览与确认 → 共同执行 owner → 当次结果与证据。Gap 只有在用户明确同意后才进入制作，不隐式提升模型工具权限，不自动重跑已完成的真实业务。

Normal Mode 的自动选择需符合可信来源、启用、资格和当前可用条件；普通开发者直接运行自己的 JS 的既有方式不因此全局禁止。独立 Execution 仍使用既有 Runtime；不新建聊天专用 Runtime、Workflow IR、可执行 DSL 或递归启动器。

## 2. 三层责任与唯一真相

| 层 | 拥有 | 不拥有 |
| --- | --- | --- |
| Runtime Execution Plane | 请求/运行身份、输入和固定约束、确认、执行/取消、资源仲裁、真实结果 | 修改业务代码、扩大资格、模型自授权 |
| Capability Resolution / Catalog Plane | 唯一 Flow Catalog 的授权投影、候选/资格引用、支持范围、澄清/Gap | 第二安装库、Trust Store、执行源码探测 metadata |
| Capability Authoring Plane | TaskContract、来源、应用规则、普通 JS 候选、独立资格、发布请求 | 热改已安装/运行版本，继承普通运行授权后自由开发 |

[制作与复用主方案](../assistant-script-invocation.md) 拥有总体结构、历史调用链、迁移和阶段顺序；[入口绑定合同](../assistant-workspace-bindings.md) 拥有会话/项目/范围/任务/Codex 关系；本文拥有跨作者/资格/发布/运行/维修的生命周期。

[Flow 分发安装模型](../execution/flow-distribution-installation.md) 拥有格式、安装、信任、授权和物理根；[共享 Skill 合同](../../frameworks/agent-to-recipe-skill-contract.md) 拥有既有 TaskContract/AppProfile/SemanticProcedure/CandidateManifest/QualificationRecord；[Agent 链](../../../workflows/agent-to-recipe/design/chain-design.md)、[Human 链](../../../workflows/human-to-recipe/README.md) 保留来源方法。G0—G7 与 F0—F10 继续分别由既有 [Gates](../../quality/gates-and-evidence.md) 与 [Failure Taxonomy](../../quality/failure-taxonomy.md) 维护。

不新增同义 Program/Skill 注册、第二份商业 B0—B6 台账或 `workflows/conversational-task-runner/`。描述/索引只读投影绑定来源摘要，AppProfile 是应用规则权威，Recipe 是实际代码，Qualification 是验证记录；不能双向独立编辑成多套事实。

## 3. 真实基线与缺口

2026-09-16 的正式助手 Calculator 专用注入、固定 envelope、产品 Runner 用户目录及 App-owned execution 接缝已保存于 [主方案历史快照](../assistant-script-invocation.md#3-已保存的真实调用链2026-09-16-源码快照)。这些代码引用不能替代 2026-09-18 真实构建核验。

2026-09-17 的 Flow 分发合同已经选定 `flows/<installId>/`、安装内容/数据/状态分离和共享安全链；本修订必须接续它，不能继续建设旧能力目录。具体 parser/install/catalog/context 完成度需读真实源码与既有交付报告，不能从历史文档 Pending 从零重做。

早期 Chat mock 12/12、历史 Recorder/golden 和静态 refiner 记录继续保留其原范围，不是本轮重跑或当前业务资格。曾设计的 task-demonstrate/trace-distill 等职责名称不证明同名 Skill 已安装；application-engineer 等现有资产以当前目录为准，不恢复旧占位 Skill。

## 4. 最小 Automation Capability Contract

### 4.1 不可变对象与发布条目

```text
CapabilityDefinition：用途、固定行为、输入输出、支持范围、安全合同
CandidateManifest：固定 Definition、入口/适配器、真实依赖、来源
QualificationRecord：精确 Candidate、预定标准与独立证据
CatalogEntry：上述记录到 Local Flow Catalog 确定内容的受控关联/投影
```

引用无环：Definition 不回指 Candidate/Qualification；Candidate 不回指 Qualification。实际入口及摘要由 Candidate 固定，不能由模型给路径。现有严格 schema/签名 Manifest 不支持的表达需版本化映射及兼容测试，不偷加字段。

能力描述不是新的分发格式。Flow 的已验证来源/flowId、installId、内容摘要/版本和必要逻辑 operation 与候选/资格关联。CatalogEntry 若历史独立存在，迁移为唯一目录的记录或投影，不另建能力安装区，也不修改原始签名 Manifest 字节。未知描述符不能靠“本地文件”自获信任。

### 4.2 Definition 最小信息

身份与用途；固定业务效果及禁止项；严格输入/输出或明确无业务参数/无结构化结果；平台/应用/版本/layout/locale/账号等相关范围；逻辑入口与实际候选关联；只读预检和权限；副作用、可信预览、超时/取消/重试；配置/Secret/模型外发政策。

qualification 和发布不是模型可写的 `qualified:true`。允许域是声明、资格、当前环境/策略与本次授权的交集。图标、热度或高相似度不提供执行资格。助手调用集合只是已授权条目的过滤/索引，不强制用户选择源码项目。

### 4.3 固定/参数化是输入维度，不是代码形态要求

固定顶层 JS 可以直接作为 entry，不为接入强制改函数。零参数只允许空业务输入，但固定门店、收件人、输出和副作用必须满足本次完整请求；不支持变化就澄清/扩展，不能吞掉用户限制。

参数化只有在代码实际消费且扩域验证后启用；预设绑定确定内容和锁定/可变字段，不复制 JS。业务输入、环境配置、Secret、定位常量与 Observation 分开。当前账号、窗口、剪贴板、选中对象和日期也可能是隐式输入，必要未知则停止。

### 4.4 Executor 仍是普通 JS

共用正式 Flow/Recipe 执行 owner，助手、Runner 和受支持 CLI/调度入口只是适配，不模拟点击 UI、不向常驻助手 eval 用户脚本、不新造另一套 Runtime。

script 在获准任务 Execution 中由 loader 执行；module 通过预先固定的启动入口调用，launcher 同样进入依赖。一个业务内部组合 helper 不需要为每个 helper 新 Execution，也不开放任意 DAG 自动组合。

结构化 per-run input/result、期限或事件能力不足时扩展既有 owner 并同步类型/API/JS 测试，不在文档虚构可用 global。禁止字符串替换、共享状态、模型写 launcher 或任意 Shell/代码路径；业务文件输入沿 schema 与资源授权解析。

独立 Runtime 不等于进程或 OS 沙箱。没有强制限制的第三方脚本不得被描述为按 metadata 自动安全；native 调用、网络/文件权限和崩溃边界需分别核验。保留现有 App 身份/权限模型，不为每个 Flow 自动另起主 App。

### 4.5 Planner / Resolver

候选来自唯一目录的授权投影，先约束再召回/排序；模型只提议允许集合中的逻辑 Flow/operation 和业务输入，宿主固定版本、路径、资格、权限与授权。

区分 runnable、clarify、blocked、待重验/维修/扩展和 Gap 的语义，不强行以某套新 enum 修改旧接口。已明确选定的 Flow 和会话修订不再模糊匹配全库，未知 ID 拒绝；同 ID/version 不同内容隔离，重名按来源/对象消歧。索引可重建，更新失效，查索引零业务执行。

## 5. 普通用户 Runtime 状态机

目标/上下文修订 → 可信条目与固定候选/资格 → 固定行为/输入校验 → 只读 preflight → 必要准备单独受限授权 → 宿主预览/RunBinding → 用户确认 → 原子取得执行权并重查 → JS → Observation/业务验证 → 真实终态。

在加载 preflight/preview/verifier 代码之前先校验信任与内容，它们也属于候选依赖。预检不能隐式打开、清空、发送、登录或反复弹权限窗；动作型准备要有相应授权。

确认固定请求 revision、候选/安装内容摘要、资格、输入/固定影响、相关配置、目标账号/对象、策略和有效期。范围、内容、参数或目标改变使旧确认失效；不相关目录新增仅在可证绑定不变时可不影响本次确认。

同一桌面操作权由实际共同 owner 仲裁；UI 单活动请求不证明外部 CLI/Recorder/其他 Runtime 互斥。未覆盖的执行者按受监督单操作者范围说明。BUSY 不建隐形队列；后续计划运行重新核查时效和授权。

重复确认最多启动一次，stopping 等待实际收口，迟到事件不能复活旧任务。关闭窗口、进程崩溃、断连不能伪装业务安全完成。取消不撤销已提交的外部效果，不承诺 exactly-once。

## 6. 能力解析与 Gap 路由

| 情况 | 处置 |
| --- | --- |
| 已启用且当前适用 | 校验/确认/执行，不改代码 |
| 意图/参数/固定对象不清 | 本会话澄清，不跨会话借参数 |
| 用户要求改变固定效果 | 拒绝错跑，选择真实适用任务或明确作者态扩展 |
| 未激活、权限/认证/依赖/状态受阻 | 具体 guidance/受限准备，不静默换另一个任务 |
| 候选已合格未发布或未启用 | 核对证据和相应批准，不强制重新生成 |
| 代码未变，证据不足或新环境未验证 | 重验，不先强迫修复代码 |
| 应用/定位/过程/代码失效 | 定向维修，新候选和必要回归 |
| 无能力 | Gap → Existing Assets 优先 → 用户选择 Agent/Human/Recorder |
| primitive 缺失 | 证据化 gap → 原 Runtime 扩展 owner → 回到原任务 |
| 政策/权限禁止或控制不能实现 | blocked，不自动提权/安装绕过 |
| 外部效果未知 | 核对/人工接管，不自动重试 |

Gap 保存原请求和修订、脱敏目标/标准、候选拒绝原因、已知/未知环境、可复用资产、缺失能力、建议入口、权限与预算。它不是扩大模型外发范围的许可。收件人、正文/文件和日期时区须在实际发送前明确；作者/验证授权不自动批准真实客户发送。

## 7. 两条作者链共享结果，不伪造相同来源

Agent：TaskContract/WorkPlan → 最小应用认识 → 获准真实 Dossier → DistilledSteps → SemanticProcedure → 普通 JS Candidate → 独立资格。

Human：Recorder 原始记录与审阅 → 仅保真时 recorder-script-refiner；固定业务足够可靠时直接冻结验证；需要行为修改/参数化时走 human-to-recipe 的 disposition/Episode/SemanticBuildPlan，按缺口调用 application-engineer。

Existing Assets：固定已有资产与有效证据，只补当前缺口。三者共用 TaskContract、AppProfile、SemanticProcedure、Candidate、Qualification 的既有结构，不强制六份重复 JSON。完整新示范不能用接续例外绕过要求，已有证据也不该因换入口而无故清零。

来源适配保留 sourceRef/hash/source format/mappingVersion 和字段 unknown；共享 Qualification 的 lineage 与 Human/Agent 来源种类正交，不伪造枚举。taskId/产物/阶段/下一缺口必须持久，Codex thread 可替换且不充当任务包。正常同一 Agent 可连续工作，不要求每个职责另起模型。

## 8. application-engineer 的共享位置

保留既有 `workflows/agent-to-recipe/skills/application-engineer/`，Agent/Human/失败修复共同使用。

discover 只补当前任务必要的应用认识；harden 补定位、等待、读取和后置保障；repair 消费精确失败现场定向修复。交付身份/locator/geometry/guard、来源、unknown、局部验证与范围建议，不拥有业务成功标准、整份 Recipe 资格或发布批准。

业务脚本复用应用 helper；共享 helper/Profile 变化纳入所有消费者影响分析。不为 Calculator/微信/Excel/ERP 分别建第二套权限、窗口或执行服务。

## 9. Independent Qualification 与发布

独立性包含冻结候选/依赖、预先确定标准/场景、获准 fresh run 与独立 Observation/Oracle、验收中不改候选或降标准。不是另一个模型说 PASS，也不强制每阶段另开 Agent。

Qualification 固定实际代码/适配器/依赖摘要、Runtime/UI-host 来源、相关平台/版本/locale/layout、固定范围/参数域、实际入口/workdir、requested/exercised/qualified/excluded、证据和未运行项。Gate 执行真正候选，不写第二份动作替身，不用模型临时补做。

先按明确测试对象与恢复策略获得测试授权，再运行、反例、取消和必要回归。固定任务无需先参数化；有效旧证据可按精确内容和范围复用，扩域不能复制旧 PASS 到新 hash。缩小发布范围须显式变更且保留原失败。

发布、安装和启用到助手分开：`.odflow` 复用既有 parser/signature/Trust/Entitlement/install/transaction owner，`.js` 走已有轻量本地导入；本地生成记录不伪称发布者签名。声明合格不替代签名/信任/权益，安装成功也不自动获得业务资格。

内容只进入既有 `flows/<installId>/`，无正式 version 子目录；数据和状态分离。不建设 capability-catalog/capability-releases。版本身份通过内容摘要和发布引用固定，运行中安装更新/删除由原 owner 协调。投影加入调用说明不能改签名 Manifest，未知 schema 采用有版本的显式映射。

必要长期资格证据保存在现有持久发布/证据设施，临时 `.runtime/` 不是唯一证据库；若设施不足，在已有 owner 内补齐并阻止相应范围放行，不再造可执行发布仓库。索引可清理重建，用户源文件/唯一证据不可按缓存删除。

拒绝半写入、重复身份指向不同内容、越界/符号链接逃逸、缺失依赖/证据/引用、过宽范围。并行发布按 revision/hash 比较更新。撤销是策略事件，不篡改历史；回退只选仍可信适用版本，不偷偷改绑当前请求。包哈希只证明字节身份，不证明发布者可信或业务正确。

## 10. App 版本与资格失效

放行同时要求：可信且启用条目、实际使用内容一致、资格可复核未撤销、固定效果/输入符合请求与验证域、当前相关应用/平台/版本/layout/locale/账号适用、Runtime/权限/权益/策略/本次授权满足。

与任务无关维度可用证据说明不适用，不要求纯文件任务都校验 UI 布局。相关关键未知则阻塞；产品支持 Windows 不代表每个脚本跨平台。允许平移不等于 resize/DPI/reflow 都兼容。

旧环境仍适用的旧版本不必全局撤销；新环境先重验，已证实安全缺陷才按影响范围暂停/撤销。加载点固定真实内容，不能先 hash 后重新读已变文件；业务可变数据、配置和 Secret 身份分别按影响管理。

## 11. Runtime Failure → Repair → Requalification

Failure Package 继续用 F0—F10，保存 task/run/step、Flow/候选/资格/Profile 身份、固定约束/脱敏输入、授权/环境、最后 Observation、原始错误/原因/unknown、已尝试恢复与证据保留权限。

明确动作未提交、提交待核对、效果已确认或未知。没有证据就 unknown，不补造现场或 exactly-once。

理解/参数错回澄清；权限/准备错归原 owner；观察/定位错回 application-engineer；业务顺序/数据流错回原作者过程；代码错修 Recipe；primitive 缺陷归 Runtime；Gate/证据错修验证；外部未知先核对。不要一律重新认识应用或重录任务。

修复产生新 Candidate 与对应资格；纯重验同一代码可追加资格，不伪造代码改动。仅事先声明、已验证、有界、未越权的恢复可在运行中执行；无新证据的相同失败停止重复。共享依赖改动验证受影响消费者。

## 12. 混合 JS + LLM + Agent Recipe

真实 JS 读取 → 合同内模型节点 → 输出结构/语义校验 → 有界参数或枚举 → 已验证 JS 分支 → 实际 Observation/业务验证。

模型的 backend/profile、prompt/schema/validator、允许工具/外发、版本/预算/期限和拒绝/歧义/不可用处理纳入候选。远端模型行为不能保证不变；保留评测集、配置身份及变化时重验规则。

网页、邮件、控件、录制注释、任务说明仅作数据，不升格为指令、权限或可信目录事实。模型结果不是任意代码/路径/Shell；未知则停。外发内容/对象初始未知时，在最终副作用前展示实际内容并确认，初始流程总确认不能替代。

Codex 接入在适配器验证实际版本/认证/审批/中断和上下文隔离，不把当前只读 Planner 扩权为作者态。上游协议可用不等于 OpenDesk 集成完成，官方依据与实验性限制见 [研究记录](../../research/rpa-authoring-reuse-design.md)。

## 13. 统一任务分解树

```text
A 接住目标：模式、范围/项目、任务修订、输入/固定约束和预算
B 查找能力：唯一目录投影、资格/环境、适用/澄清/阻塞/Gap
C 受管执行：预检、准备、确认、共同资源仲裁、独立任务 Execution
D 真实结果：实际动作/观察/验证、停止/未知效果、可核对运行身份
E 接续资产：Existing Assets 优先，Agent/Human 来源不混同
F 生产候选：固定 JS 可直接冻结，按需提炼/参数化/应用补强
G 独立资格：明确标准、精确候选、fresh run、反例/取消/回归
H 安装与启用：既有 Flow owner、持久证据、明确批准、不自动运行
I 定向维修：失败分类、依赖影响、保留有效证据、新候选/重验
J 贯穿治理：信任/权益、Secret/隐私、并行写入、保留/删除和真实状态
```

保留 S1—S12/Human 内部方法树，不把该树当作新 Skill 安装列表。

## 14. P0 / P1 / Later

近期按 [主方案第 9 节](../assistant-script-invocation.md#9-分阶段推进不重做已有-flow-能力) 推进：先本地制作、独立验证和可接续任务包，再闭合两个用户 Flow 的对话复用，然后接助手内 Codex；相关宿主接口可并行完善，已有资产从对应缺口继续。

原 P0/P1 是历史排期，不要求重建已经完成的 Flow 安装/上下文/Catalog。安装验证仍使用原商业交付台账；本合同不再复制开发进度。Calculator 新路径通过后才去掉旧注入，不先搬必需文件，黄金样本保持其证据范围。

大规模语义检索、任意 DAG/DSL、第二 Runtime、第三方强沙箱、无人审发布不作为当前前置。已有 Marketplace 项目保持独立进度并复用同一安装链，不因本助手排期被撤销；Remote Catalog 不是本机可运行集合。

## 15. 实施验收用例与评分边界

唯一验收与设计评分源为 [制作与复用验收合同](../../quality/assistant-authoring-reuse-acceptance.md)：A 真实完成、B 脚本独立复用、C 助手正确选择运行三份证明；28 项覆盖行、误命中/规模评测、96/100 设计自评及硬否决。

这些是本轮未执行的测试要求，不是实际 PASS。mock/静态/应用局部/真实模型/Runtime/业务/视觉分层留证。公共 Runtime 行为使用 `.js`，新增 API 按现有规范同步类型/实现/文档。缺目标平台实机按项目阶段规则如实标注，不伪造通过或自动启动未授权 VM。

本页记录合同，不输出实现已经 95 分以上的声明。未确认执行、跨会话/版本错绑、丢弃固定约束、绕过信任/权益、未知效果盲重试和未验证声称成功都是实施硬失败。
