---
title: "Automation Capability Lifecycle｜运行、生产、资格与复用"
description: "用户资产与产品核心分离；固定及参数化 Recipe 共用本地 Catalog、独立资格、发布和 App-owned 执行生命周期。"
---

# Automation Capability Lifecycle

状态：架构与实施合同 v0.2，2026-09-16。用户脚本调用修订的源码基线为 `master@d7bfffacb59b5f5c557aa47561e4af262d37d86c`。本次整合原 v0.1 的生命周期、安全、作者来源、资格、失败接续和实施边界；原文及其 2026-09-13 基线通过 Git 历史保留。

**本次是文档修订，不表示通用 Catalog、发布器、结构化 input/result、独立 recipe-qualify Skill、跨入口桌面锁或真实 UI 验收已经完成。没有修改 Runtime、搬迁 Calculator 或运行测试。**

本次明确取代旧版两项限制：不再把“仅随产品内置条目”作为本地固定用户任务接入的前提；不再要求顶层业务 JS 必须先函数化才能调用。用户固定脚本接入列入最小闭环，但来源审阅、独立验证、发布及单次授权仍不可省略。

## 1. 最终架构决定

**一个可信任务目录、一条受管执行服务、两条保留来源差异的作者链和 Existing Assets 接续；用户任务存放在应用核心之外。固定任务与参数化任务同等正式，参数化是按业务需要进行的可选演进。**

```text
普通请求 → 对话/明确任务引用 → Task Intent
→ Resolver 查询本地已发布能力
  ├─ 当前可用：核对固定行为/可变参数 → 预检/预览/确认
  │            → App-owned 独立任务 Execution → 实际观察/验证
  ├─ 有能力但受阻：澄清/准备/重验/维修/扩展
  └─ 无能力：Gap → 用户明确进入作者态
               → Agent-to-Recipe / Human-to-Recipe / Existing Assets
               → 冻结 Candidate → 独立资格 → 明确发布
               → 新的运行预览与确认，不自动重跑旧请求
失败 → Failure Package → 定向修复/重验 → 新版本或新资格
```

Normal Mode 消费可信已发布且当前适用的 Qualified Capability。普通开发者通过 Script Runner/CLI 使用自己的 JS 不被全局禁止；其手动开发者授权不自动变成助手可发现/可自动选择的资格。

Chat Runner 是产品状态机，不新增 `workflows/conversational-task-runner/`、`workflows/capability-resolver/` 或另一套 Workflow IR。Qualification/Publish 是作者态通向目录的出口，不另造第四套开发系统。

## 2. 三层责任与唯一真相

| 层 | 拥有 | 不拥有 |
| --- | --- | --- |
| Runtime Execution Plane | 请求身份、输入/固定约束校验、预检、确认、任务 Execution、停止、资源仲裁、实际结果 | 修改业务代码、扩大资格、模型自授权 |
| Capability Resolution / Catalog Plane | 可信描述符索引、固定候选/资格引用、发布/撤销、适用性与 Gap | 执行脚本探测 metadata、任意路径运行、模型签发权限 |
| Capability Authoring Plane | 来源、业务合同、应用规则、普通 JS 候选、独立验证与发布请求 | 在普通运行确认内隐式开发、热改生产版本、自述通过 |

文档职责：

- 本文：跨 Runtime/Catalog/Authoring 生命周期、发布/资格/失效/维修和信任边界的总纲。
- [AI 助手真实调用链与用户脚本设计](../assistant-script-invocation.md)：当前源代码地图、用户目录、固定/参数化接入、调用机制、迁移和验收的阅读入口。
- [对话工作台](../conversational-task-workspace.md)：用户会话、对话优先、任务详情；不强制增加任务商城、脚本选择器或参数表单。
- [Calculator Chat P0](../conversational-task-runner.md)：历史示例的合同、命令、证据边界，不证明通用目录已完成。
- [共享 Skill 合同](../../frameworks/agent-to-recipe-skill-contract.md)：TaskContract、AppProfile、SemanticProcedure、CandidateManifest、QualificationRecord、request/handoff；不复制同义 schema。
- [Agent 链路](../../../workflows/agent-to-recipe/design/chain-design.md)与 [Human 入口](../../../workflows/human-to-recipe/README.md)：S/H 内部职责和来源。
- [Gates](../../quality/gates-and-evidence.md)、[Failure Taxonomy](../../quality/failure-taxonomy.md)：继续沿用 G0—G7、F0—F10。

业务定义是搜索说明的权威源；Catalog 只是版本绑定的索引投影；AppProfile 拥有应用规则；QualificationRecord 拥有资格与证据；Recipe 是真实执行代码。聊天 UI 不复制应用规则或独立业务任务清单。

## 3. 真实基线与缺口

### 2026-09-16 本次复核

| 范围 | 源码事实 | 仍不能推断 |
| --- | --- | --- |
| 正式 AI 助手 | main.js 直接注入 `capabilities/calculator.js`，两个固定 task；模型只生成 envelope | 用户业务应放该目录、通用目录已完成 |
| 产品用户目录 | Script Runner 使用 `OPENDESK_APP_DATA_DIR`/用户 home 下的 appDataRoot；scriptRoot 可由 `OPENDESK_SCRIPT_RUNNER_DIR` 指定，默认 `recipes` | 目录里每个 JS 都有助手可调用资格 |
| 产品执行器 | `cmd/opendesk/app_recipe_runner.go` 为 JS 创建新 Runtime/Execution，同 App host 进程；有 BUSY、Recorder 检查、取消和入口快照 | 第三方沙箱、全局原子桌面锁、结构化业务 input/result、依赖闭包或 `.odpkg` 已支持 |
| 助手接线 | 当前仍在助手已有上下文调用 Calculator 模块 | 已经复用上述用户任务执行器 |
| 调用历史 | request/message/终态存在 | 完整的候选、参数来源、版本与步骤审计记录 |

源码定位见 [阅读入口第 2 节](../assistant-script-invocation.md#2-当前真实调用链两条路径尚未统一)。没有核验用户本机正在运行的具体构建。

### 2026-09-13 历史检查的保留边界

旧记录中的 Calculator Chat 纯 JS/mock 12/12，不是本次重跑或真实模型/桌面 PASS。Agent 当时只有正式 application-engineer 入口，不能凭 task-demonstrate/trace-distill 等职责名称推断可调用 Skill 已安装；不得恢复已删除的历史占位目录。Human 的 human-to-recipe、recorder-script-refiner、SemanticBuildPlan 及 Calculator golden 属于既有资产，但不证明通用业务 renderer、用户安装或整链自动调度已完成。

actions-first refiner 已有编译/静态保真能力，与“通用业务 renderer 尚未落地”不同。历史录制/回放资格不自动转移到新 Chat 模块、新输入域、平台或布局。上述作者链历史状态本次没有全量重审，实施以当前源码为准。

## 4. 最小 Automation Capability Contract

### 4.1 不可变对象与发布条目

```text
CapabilityDefinition：业务说明、固定效果、输入输出、支持范围、安全合同
CandidateManifest：固定 Definition、真实入口、依赖闭包、适配器和作者来源
QualificationRecord：精确 Candidate、预定标准/范围、独立验证与证据
CatalogEntry：汇总引用及受控发布/暂停/撤销状态
```

引用无环：Definition 不引用 Candidate/Qualification；Candidate 不引用 Qualification；CatalogEntry 检查各引用的一致性。Definition 的 executor 是逻辑入口，实际路径/导出/字节摘要由 Candidate 固定。已有 schema 不支持新增表达时，做有版本的兼容增量或外部发布清单，不把未知字段/枚举强塞旧结构。

本地登记必须显式批准；查目录只读可信 metadata，不扫描后 import/eval 任意脚本探测用途。用户自己编写或已审阅信任的本地固定 JS 可以在验证后进入最小目录；任意第三方自动安装、远程 Registry 与复杂签名分发后置，不能把本地自有任务也全部阻塞到市场完成以后。

### 4.2 Definition 最小信息

| 信息组 | 必须表达 |
| --- | --- |
| 身份 | schemaVersion、命名空间下稳定 capabilityId、version、显示名称及用途 |
| 业务效果 | 固定应用/对象/影响、禁止项和实际成功条件；不能只写模糊 description |
| 输入输出 | 严格 inputSchema/resultSchema 或引用；无参数明确只接受空对象，无结构化业务结果明确声明 |
| 适用范围 | 应用身份、平台、经过验证的版本/layout/locale、输入子域、必要当前状态 |
| 入口 | script 或 module 的逻辑入口策略；真实文件/adapter/dependencies 属于 Candidate |
| 现场检查 | 只读 preflight、Permission/Runtime 要求、准备动作边界 |
| 授权 | 实际副作用、确认政策、宿主可信预览，默认每次确认 |
| 执行政策 | 超时、取消、桌面排他、重试/未知效果、输出与证据边界 |
| 配置/模型 | 业务输入、机器配置、Secret 引用、允许模型节点及外发/预算分离 |

资格和发布引用不是模型可写的 `qualified: true`。实际允许域是业务声明、资格、当前策略、环境和本次授权的交集。图标、作者联系信息、计费和流行度不是执行放行条件。

### 4.3 固定/参数化是输入维度，不是代码形态要求

固定录制或顶层业务 JS 可直接作为 script entry；无需为了进入助手强制提取函数/参数。其固定行为必须可理解、可验证、与用户请求一致。用户要求改变未开放字段时返回澄清/扩展，不能丢掉要求后传空对象。

参数化只开放代码真实消费且已经验证的业务字段；只改 metadata 不改硬编码行为不得发布。参数提取在作者态进行，产生新 Candidate 和扩域资格。已保存参数预设是精确版本的参数绑定，不复制 JS；锁定字段和升级兼容必须明确。

固定流程仍可能读取当前账号、剪贴板、选中对象或系统日期，这些是隐式输入而非“无依赖”；声明和验证关键上下文，未知则阻止。业务参数、机器配置、Secret、定位常量和 Observation 数据依赖相互区分。

### 4.4 Executor 仍是普通 JS

复用 App-owned execution owner，让每次用户任务拥有独立 Runtime/Execution；禁止把用户业务 eval 进常驻助手会话。独立 Execution 不要求独立 OS 进程，不给任意用户 Recipe 新建递归 executor API，也不把同进程 Runtime 说成沙箱。

script entry 由 production loader 在获准任务中直接运行；module entry 可由作者/发布时固定的启动入口调用模块。一个业务内部组合多个模块仍在该任务 Execution 内完成，不为每个 helper 创建运行实例。静态 launcher 计入依赖闭包，不由模型每轮生成代码。

当前内部桥 `{scriptPath, workdir, logDir, signal}` 不能冒充已支持业务 input/result。后续由原生 owner 提供 per-run 数据输入/结果及期限，初始化时绑定只读输入，具体公共 API 要实现、类型、文档和 JS 测试同步后公布。旧零参数脚本可先接入；不通过字符串替换、共享全局/配置或任意环境变量绕过输入合同。

P0 不允许临时拼任意能力 DAG；已编写组合业务可以是普通 JS Recipe，但整个组合仍需验证，子模块分别通过不证明组合副作用/数据顺序通过。

### 4.5 Planner / Resolver

宿主先过滤有权访问的发布条目；模型只提议 capabilityId 与业务输入或澄清/不支持，不签发版本、路径、权限、资格、风险和执行器。稳定 ID 不是显示文件名，重复 ID+version 不同内容必须拒绝。

Resolver 区分 runnable、clarify、blocked、requalification-needed、repair-needed、extension-needed、gap 等语义；实际 enum 在版本化合同落地时确定。先检验固定效果与显式约束，再排序；相关但受阻的任务不能被无声替换为另一个语义不符的任务。

## 5. 普通用户 Runtime 状态机

```text
本轮目标 + 明确的任务 draft/revision
→ 可信目录与固定候选/资格引用
→ 固定行为/业务输入语义校验
→ 只读现场预检
→ 必要准备动作单独受限授权
→ 宿主预览并冻结 RunBinding
→ 用户确认
→ 原子获得执行/桌面操作权并重查绑定、撤销和现场
→ 普通 JS 执行；仅声明节点允许模型调用
→ 真实 Observation / postcondition / result validation
→ completed / failed / canceled / outcome-unknown
```

先校验候选可信性与完整性，再允许执行受信的 preflight/preview/validator。它们也是代码依赖，不因名为 preflight 就允许任意导入。预检不隐式打开、切前台、滚动、清空、发送或反复弹权限窗；需要准备时明确取得授权。

预览显示真实应用、账号/对象、固定效果、参数来源、清空/覆盖/发送、模型外发、读取内容和停止限制。模型 prose 不能扩大宿主授权。

确认绑定请求修订、Definition/Candidate/依赖摘要、资格、固定行为/参数、相关配置和环境/目标、策略/时效。进入执行锁后及关键副作用前再次核验。相关变更令旧确认失效；目录增加无关条目仅在能证明本次绑定未变时不必全局作废。

重复确认最多启动一次。取消阻止后续动作，但不撤销已提交动作；崩溃/迟到结果不能显示成安全完成，也不自动恢复执行。第一阶段 BUSY 明确拒绝，不建隐形队列；后续队列/计划运行必须重新核对时效与授权。

一个 ChatSession 单活动请求不等于全桌面单执行者。助手、Runner、Scheduler、Recorder 和外部 Runtime 需要共同资源仲裁及接管规则。现有检查不证明原子全局锁；未强制覆盖的外部执行者只能列为受监督单操作者限制，不宣称无人值守并发安全。

## 6. 能力解析与 Gap 路由

| 情况 | 处置 |
| --- | --- |
| 已发布、已验证、当前适用 | 固定行为/参数校验、确认、执行，不改代码 |
| 意图、固定对象、参数歧义 | 本会话澄清，不能猜默认目标或跨会话借参数 |
| 固定任务与用户变更要求冲突 | 明确不能按新要求执行；选择另一真实适用任务或进入作者态扩展 |
| 权限/认证/依赖/应用状态受阻 | 具体 guidance 或受限准备，不重新开发脚本 |
| Candidate 合格但未发布 | 核对证据和发布批准，不必重新生成 |
| 代码未变、证据缺失或新环境未验证 | requalification，不先强迫 repair |
| locator/layout/过程/代码错误 | 定向修复，新 Candidate 与必要回归 |
| 相似能力需要新输入域 | 明确变更合同，qualification delta，不靠相似度继承资格 |
| 没有能力 | Gap → 优先查 Existing Assets → 用户选择 Agent/Human/Recorder |
| Runtime primitive 缺失 | 证据化 gap → [扩展框架](../../frameworks/runtime-api-extension-framework.md) → 回到原作者工作包 |
| 授权/政策禁止或控制不可实现 | 明确 blocked，不自动提权、安装或开发绕过 |
| 外部效果未知 | 核对/人工接管，不自动重复发送、支付或删除 |

Gap 保存 request/taskRef、脱敏目标和成功标准、候选及拒绝原因、已知/未知环境、可复用资产、缺操作/primitive 证据、建议入口、权限与预算。它不是执行或对外泄露全量聊天/截图的授权。

发送类业务必须明确收件人的唯一身份、账号、文件/正文版本与日期时区；示范用已授权测试对象或停在发送前。作者态许可不自动授权真实业务发送，发布后仍需新预览和确认。

## 7. 两条作者链共享结果，不伪造相同来源

```text
Agent：TaskContract/WorkPlan → application-engineer
  → 真实 Dossier → DistilledSteps → SemanticProcedure
  → 普通 JS Candidate → 可选 code-rebuild → 独立资格

Human：Recorder raw/actions/JS + 人工审阅
  → 静态保真：recorder-script-refiner → refined Candidate（不是业务资格）
  → 固定业务已清楚且可靠：原 JS 冻结 → 固定范围验证
  → 需业务改进：human-to-recipe 的 disposition/Episode/SemanticBuildPlan
       ↔ application-engineer → JS Candidate → 独立资格

Existing Assets：冻结已有资产/证据 → 只补缺口 → 独立资格
共同出口：发布规格 + 精确 Candidate + 可复核 Qualification → 明确发布
```

共同逻辑成果包括 TaskContract、AppProfile、SemanticProcedure、Recipe Candidate、QualificationRecord 和 Capability，但不强制六份重复 JSON。来源通过版本化 ref/只读投影适配，保留 sourceRef/hash、source format、mappingVersion、字段来源和 unknown；不双向独立修改投影与原资料。

QualificationRecord 的 lineage 继续区分 reference-only、continuation-chain、new-generation-chain，不把 Human/Agent 来源类型塞入该枚举。来源种类与资格链类型正交，需扩 schema 时做版本化兼容；不能把 Human 录制冒充新 Agent 示范。

## 8. application-engineer 的共享位置

保留 `workflows/agent-to-recipe/skills/application-engineer/`，供 Agent、Human、Failure repair 共享，不复制第二套应用规则。

discover 用于缺必要认识的新应用/页面；harden 用于已有认识但操作缺定位/等待/读取/后置保障；repair 消费精确 Failure Package 定向修复。按证据缺口选择，不为每个新操作普查整个应用。

它交付应用身份、locator/geometry/guard、来源、unknown、局部验证和范围建议；不拥有业务成功标准、整份 Recipe 资格或发布批准。Calculator/微信/Excel/ERP 应不同在应用规则和业务脚本，不各建权限/窗口/Chat Runtime。

## 9. Independent Qualification 与发布

独立性至少包含：候选及依赖冻结；业务标准/场景预先确定；fresh run 和独立 Observation/Oracle；验收期间不改候选或降低标准。不是“第二个模型说通过”，也不要求每阶段另起模型。同一人员可启动固定 Gate，但记录真实执行者和独立性边界。

QualificationRecord 绑定 Candidate/hash、Runtime/UI-host provenance、平台/应用版本/locale/layout、固定业务范围或参数域、实际入口/工作目录、requested/exercised/qualified/excluded、结果/证据与 NOT RUN。Gate 执行真实 production 文件，不再写第二份动作实现冒充资格。

```text
定义固定行为或参数范围 → 冻结 Candidate/依赖
→ 固定成功标准、场景与权限
→ 获准 fresh run、独立验证、反例、取消、回归
→ pass/fail/not-run/blocked
→ 覆盖明确发布范围 + 可信来源 + 发布批准
→ staging 校验 → 原子激活 Catalog revision
```

固定任务也要验证，但不得强迫先参数化。已有仍对应本次候选/范围的有效证据可以复用；扩域形成新资格，不复制旧 pass 到新 hash。关键失败不能靠事后缩小原要求伪装通过；变更发布范围需显式记录，保留原失败。

发布记录与必要证据保存到用户数据内的持久发布区；临时运行日志、截图仍归 `.runtime`/Execution artifacts。`.runtime` 可清理，不能是发布资格唯一证据库。缺持久证据则阻止相应资格放行；摘要只能证明字节身份，不证明发布者可信或业务正确。

本地自有脚本显式接入不需要远程平台，但依然拒绝半写入、未知 schema、重复身份、缺失依赖/资格、过宽范围、路径穿越、符号链接逃逸。并行发布按 revision/hash 比较更新；受管理发布内容不可就地编辑。

工作区、发布区、可重建索引、运行记录和业务输出职责分开。撤销不篡改旧资格，只阻止后续放行；运行中版本与必要证据不能被垃圾回收。回退只选择仍可信、适用且未撤销的版本，不静默改绑历史请求。App Package/`.odpkg` 的打包或授权不是业务资格。

## 10. App 版本与资格失效

可运行必须同时满足：

```text
可信且已发布条目
AND 实际加载入口/依赖与候选一致
AND 资格有效、可复核、未撤销
AND 固定效果或本次参数与用户要求一致且在验证范围内
AND 当前应用/平台/版本/layout/locale/账号与前提适用
AND Runtime、权限、配置、策略和本次授权满足
```

平台支持不是产品级全局开关。只验证 macOS Calculator 不代表 Windows 或其他布局可用；只观察一个应用版本不声明任意新版兼容。允许窗口平移不等于允许 resize/reflow/DPI 变化。

脚本不受某环境维度影响时可以用证据说明不适用，不机械要求每个纯文件脚本都核对 UI layout。关键相关维度未知则阻塞。旧环境仍适用时旧版本不必全局撤销；新环境用待重验，已证实安全问题才按影响范围暂停/撤销。

代码与依赖在加载点固定，不能只先 hash 再读可能已被替换的内容。配置/Secret 身份变化需按影响检查；运行输出与可变业务数据不能伪装成不可变代码依赖。

## 11. Runtime Failure → Repair → Requalification

Failure Package 复用 F0—F10，最少保存 task/run/step、能力/候选/资格/Profile 身份、脱敏参数和固定约束、授权、实际环境、最后关键 Observation、原始错误/原因与 unknown、已尝试恢复、证据及保留权限。

附实际动作后果：未提交、提交待核对、效果已确认或未知。provider 不能确认时就是 unknown，不补造 exactly-once。关键动作正常留证，不能在失败后猜造现场。

| 原因 | owner/修复方向 |
| --- | --- |
| 请求理解/参数/固定约束 | 澄清或 Planner 修正；不因用户变更就热改生产脚本 |
| 权限/认证/应用准备 | 原 Permission/Runtime/preflight owner |
| 观察缺失/歧义 | 有界只读复查或 application-engineer，不猜结果 |
| 应用/layout/locator | application-engineer harden/repair，保留有效规则 |
| 业务顺序/数据依赖 | procedure/业务作者；Human 修改原 plan，不复制第二套步骤事实 |
| JS/API/异步缺陷 | recipe-build；独立代码质量目标才用 code-rebuild |
| Runtime primitive | 原 Runtime owner，不靠自由 Agent/Shell 绕过 |
| Gate/证据缺陷 | qualification/evidence owner，不自动判业务本身错误 |
| 外部效果未知 | 停止并核对/人工接管，禁止盲重放 |

修复生成新 Candidate，新资格和发布版本。代码未改而只是重验时可以增加资格记录/目录 revision，不伪造代码修改。共享 helper/Profile 变化要做依赖影响分析。只有事先声明、已验证、有界且未越权的恢复可以在运行中执行；无新证据的相同失败停止重复尝试。

## 12. 混合 JS + LLM + Agent Recipe

任务不必是纯坐标宏，也不能是自由 Agent 会话。需要模型时保持：

```text
JS 读取本次真实内容
→ 已声明节点调用 LLM.generate()/受控 Agent.run()
→ 输出结构/语义校验
→ 严格枚举或有界参数
→ JS 选择已验证分支
→ 实际观察与业务验证
```

backend/profile、prompt/schema/validator、工具限制、外发范围、预算/期限、拒绝/歧义/不可用行为纳入候选与资格。远程模型行为不能保证永久不变，保留配置可观测性和回归集合，变化按影响重验。

网页、邮件、控件、录制注释、脚本说明是数据，不升格为权限、目录事实或指令。模型结果不能作为任意代码/路径/Shell 运行。涉及尚未知的外发正文、收件人或文件时，最终副作用前展示真实对象与内容并确认；流程开始的总确认不代替该次实际内容授权。

模型注解和 read-only 描述不能代替宿主强制限制或当前 CLI 的真实兼容/安全验证。未知判断停止/人工处理，不凭猜测继续高风险分支。

## 13. 统一任务分解树

```text
A 接住请求：会话/任务修订、目标、固定约束、输入来源、运行与作者态分离
B 判断能力：可信目录、候选/资格、语义与当前环境、具体 blocked/Gap
C 受管执行：预检、必要准备授权、确认绑定、原子仲裁、独立 Execution
D 真实结果：步骤/观察/验证、取消/未知效果、持久运行身份
E 接续资产：Existing Assets 优先，Agent/Human 来源保留，只补缺口
F 候选生产：固定脚本可直接冻结；按需要参数化或修复；Profile/helper 共享
G 独立资格：预定标准、精确候选、fresh run、反例/取消/回归、范围边界
H 发布复用：用户持久发布区、原子索引、明确批准、更新/暂停/撤销
I 定向维修：失败分类、有效证据复用、依赖影响、重验、不覆盖旧版本
J 贯穿治理：信任、Secret、隐私、目录边界、预算、保留/删除、真实完成度
```

该树不替代既有 S1—S12/Human 内部树，不要求每项对应一个新 Skill 或多份 JSON 文件。

## 14. P0 / P1 / Later

### P0：用户固定任务的最小完整闭环

1. 以用户目录中的一个低风险顶层 JS 为对象，明确固定业务合同；不修改应用主程序、不强制函数化/参数化。
2. 最小本地 Definition/Candidate/Qualification/Catalog 发布门和持久证据；可复用有效既有资产，但未验证不得被助手自动选择。
3. 助手经同一受管执行 owner 启动独立任务 Runtime，补齐身份/停止/期限/仲裁必要边界；导入和匹配阶段零业务动作。
4. 确认固定效果与实际代码版本，保存 run/Execution、入口/工作目录、步骤/观察/验证；未知结果不伪造成功。
5. Gap/Failure 接续、撤销/版本漂移/重复确认/目录越界和固定约束反例测试；真实入口与视觉证据独立记录。

### P1：可选参数化、预设与通用性

补齐 per-run input/result 通道与公共合同后，开放确实被代码消费的参数；参数预设绑定精确版本；本会话修订使旧确认失效。将 Calculator 经同一用户任务路径迁移为可安装示例再移除旧专用注入，不先搬文件破坏启动。

使用第二个真实业务及固定/参数变体验证通用性，增加规模检索/语义反例和跨平台范围。逐步补有消费者的作者方法、qualification delta 与共享依赖回归，不恢复历史空 Skill、不强迫重新生产所有录制。

### Later

远程市场/Registry、自动安装任意第三方、计费评分、复杂依赖求解、任意 DAG、Workflow IR/Compiler 必经路径、独立 Replay Runtime、无人审自主发布均不作为当前前提。

“一键接入”只压缩用户操作，不省略内部信任、候选、独立资格、发布与单次授权。需要高强度第三方隔离时单独建设，并明确现有同进程模型的局限。

## 15. 实施验收用例与评分边界

本次没有测试 PASS 数量。验收至少覆盖：应用外资产且新增任务无需重编；未参数化旧脚本可调用；要求改变固定效果时拒绝错跑；参数真实生效；目录发现零执行；版本/依赖/配置/预设漂移；缺资格与撤销拒绝；多轮/跨会话隔离；重复确认/停止/并发；无结构化结果的诚实展示；未知效果不重试；证据保留与删除互不混淆；当前真实入口、构建与视觉。

原始静态 refiner、历史 golden、mock、应用局部验证、真实 Runtime、模型和业务资格分别记账，不能互相代替。用户可观察的契约用 `.js` 测试；新增 Runtime 接口先核对并按 `docs/api/.rules.md` 更新类型/实现/文档，不用 Go 白盒代替公共 JS 验收。

本修订的设计自评 **96/100**，权重、扣分与硬否决项统一维护在 [阅读入口第 11 节](../assistant-script-invocation.md#11-验收标准与评分)，不复制一套平行评分。它不是独立专家认证、不是产品完成率，也不是任何应用的运行资格。用户资产进核心、发现即执行、错绑代码、忽略固定约束、未确认执行或未知副作用自动重试，任一发生都不得验收。
