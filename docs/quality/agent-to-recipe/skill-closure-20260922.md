# 八方法最后接线与十对象逐因素复核｜2026-09-22

## 一页进度与下一个放行点｜2026-09-23

**结论：原 r003 Calculator 固定场景已有普通 JS 和 q002 历史资格；当前 r004 专项仅完成 S7→S9 的修复生产及 S10 的限定规则审阅，还没有新的 JS Candidate 或新资格。整条 Agent-to-Recipe 工作流的独立模型、正式宿主与可泛化生产能力尚未验收完成。**本页是 `WORKFLOW.md` 规定的 Run Summary 投影，实际状态仍以唯一的 `.runtime/automation-authoring/calculator-fresh-20260918/progress.json`、固定 handoff 和资格记录为准；不能把两条不同版本的进度合并成一次完整通过。

| 正式阶段／专业方法 | 关键交付 | 原 r003 固定场景 | 当前 r004 接续 | 必须过的检查点／下一责任 |
| --- | --- | --- | --- | --- |
| S1 `automation-plan` | TaskContract、WorkPlan | 合同／计划历史有效 | W044 定向续作计划已消费；不扩原合同 | 目标、固定输入、授权和总预算与原合同一致；改目标才回 S1 |
| S2 `application-engineer/discover` | 最小 AppProfile | r002 有来源的 Calculator Profile | 精确复用；没有新现场发现 | 当前窗口、模式、权限和目标新鲜度需在 S10 复核；旧截图不授予现在点击 |
| S3—S6 `task-demonstrate` | Dossier、Raw Trace、实际读值证据 | 历史 UI 读 `110`、实际输入 `6×110`、最终读 `660` | 定向更正原 Dossier 的消费者与来源角色；未重演 | A008 真读取，A018 真消费；A017 计划动作不能冒充输入；新事实不能事后补造 |
| S7 `trace-distill` | DistilledSteps | 旧成果保留作历史 | **通过**：`revisions/r004/distilled-steps.json` | 每个原动作有取舍且不丢读值和实际消费者；正确版本正式 handoff 后才交 S9 |
| S8—S9 `procedure-synthesize` | SemanticProcedure、能力选择和数据依赖 | 旧 Procedure 随旧 q002 保留 | **通过**：新 `revisions/r004/procedure.json`，四项当前验证 `not-run` | B025 当次 UI 读值 → B040 逐字符消费；六步各有来源、停止条件与支持范围；交 S10 不等于工程放行 |
| S10 `application-engineer/harden`；有具体规则故障才 `repair` | 有效 AppProfile／规则增量及验证记录 | 旧规则仅覆盖原场景 | **warn**：`revisions/r004/hardening-review.json`，旧规则复用、当前实测缺失 | 当前唯一窗口／权限／完整目标预检、四项 API 的真实行为与未知副作用停止经适用预算验证；通过前不正常交 S11 |
| S11 `recipe-build`；有明确收益才 `code-rebuild` | 普通 OpenDesk JS、CandidateManifest | [既有 JS](../../examples/agent-to-recipe/calculator.js) 与 `revisions/r003/candidate-q002.json` 仅属旧版本 | **未运行**：未从 r004 Procedure 新生成／冻结候选 | 收到通过的 S10 规则、正确 Procedure 和 API contract，冻结 JS／依赖／每步映射；失败回实际 Owner，不靠代码猜 |
| S12 `recipe-qualify` | QualificationRecord、Run Summary | `revisions/r003/qualification-q002.json` 对原固定场景历史 pass | **未运行**：新候选资格不存在 | 候选与范围先冻结；新干净执行中先真实读取首值、由它输入第二段、再独立读最终值并核对；旧资格不迁移 |

下一组正式检查点按依赖顺序执行，不是新阶段或第二套计划：**CP1 S10 当前环境与规则验证**（新工作包先取得原合同下具体预算／现场前提，记录所有 `not-run` 的实际处置和失败副作用）；**CP2 S10→S11 正式收件与 JS 生成**（只有 CP1 放行后才生成、冻结新 Candidate，不能用旧 `calculator.js` 倒填生产）；**CP3 S11→S12 固定候选资格**（按既定 fixed-scene 范围验证真实命令、同次值传递、独立 UI Oracle 和必要回归；参数变化不在原授权范围，另获合同范围才测）；**CP4 工作流层独立证明**（模型隔离、真实宿主加载及复用收益分别留证，不能由本地手工协调和确定性测试代替）。每一关按 WORKFLOW 正式 request → Producer → Gate/handoff → 下游生产前核对，失败只返回该关 Owner；未知副作用先核对，预算与失败累计保留在唯一 progress 索引。

## 2026-09-23 本地任务包接续：以本节为当前范围结论

工作区 `master` 基线 `1b53cca2fc908b46ff8f21054f1b6a5c6367e7e8`；本机实际存在 `.runtime/automation-authoring/calculator-fresh-20260918/`。下方 9 月 22 日在 Linux 快照中“原包不存在”的结论保留为**当时环境**的事实，本节已从当前本机重新核对，不能跨环境沿用该阻塞。按 `WORKFLOW.md`“从已有成果继续”进入，合同限定 `25×4+10 → 当次 UI 读值 → 6×读值 → 当次最终 UI 读值`。本轮没有新桌面、模型或业务重跑授权；r003 q002 的历史固定场景资格保留为旧版本、旧范围，不替新 Procedure 授资格。

| 已有且核对的成果 | 当前真实缺口 | 阶段／责任 | 本次工作与验收 |
| --- | --- | --- | --- |
| r001 原 TaskContract／WorkPlan、原 RawTrace 与实际 A008=110、A018 输入 `6,×,1,1,0,=`、A019=660；r003 q002 历史固定场景资格 | 旧 Dossier 把计划 A017 和不输入的 D040 标为读值消费者，旧 S7 漏计划动作覆盖；检查器曾错误接受 | S3—S6/task-demonstrate 原事实标注，S7/trace-distill 投影，检查器 owner | 不重演；两次定向修正 Dossier，S7 新版完整投影和严格原消费者检查；失败版本留存 |
| r002 AppProfile 的固定布局、目标与操作，历史执行规则 | S9 缺当次交付的选型来源和 canonical 正文；S10 当前工程验证待办 | 协调者补资料，S8—S9/procedure-synthesize，S10/application-engineer/harden | S9 先拒收；随后交付当前有出处的四方法选择和完整阅读包，复用同一 S7，正式生产／交接新 Procedure；S10 实际消费并限定审阅 |
| r003 候选与 q002 资格（历史 fixed scene） | 新 Procedure 的四项方法当前实测 `not-run`，无新 Candidate／资格 | S10 → S11 → S12 | S10 `warn`，S11/S12 在本次续作 `not-run`；不从旧 q002 或合成测试继承通过 |

### 正式方法、输入、产出及实际消费

同一 Agent 手工协调。每个已执行职责的 `attempts/<id>/request.json` 在生产前固定方法／io-spec SHA、任务合同、权限和输入字节，`handoff.json` 在生产后发布实际产物／Gate；`.runtime` 保留完整正文及检查报告。`r004-plan` 的 W044 增量（总离线 Producer 尝试 6、桌面与模型调用 0、旧业务预算不重置）先通过。`r004-fact-review-2` 以 RawTrace 将计划 A017 纠正为实际 A018；首次 S7 因 Dossier 的 RawTrace 引用角色错误在生产前拒收，原职责 `task-demonstrate` 的 `r004-fact-review-3` 更正来源，`r004-distill-retry` 才用新 Dossier 生产 S7。最初 `r004-fact-review` 未在当时有效计划中登记，作为失败尝试保留，不升级成果。

S7 采用 `trace-distill` 方法 `d34458d7…`／io-spec `7c496021…`，新产物 `revisions/r004/distilled-steps.json` SHA `19c0aac2…`。它保留全部 A001—A020 的必要路径／计划动作来源；`firstResult` 来自 A008，唯一实际消费 A018，D040 只保留内存值前置条件。`s7-check-v2.json` 通过固定历史事实及 S7 绑定；S7 handoff SHA `c21e74a9…`。这不是独立模型 S7 评测，也不是当前桌面新示范。

S9 初次 request `r004-synthesis-missing-selection` 在生产前通过了 S7→S9 主产物引用检查，但实际缺来源选型，故发布 `fail` handoff 且无 Procedure。协调者从当前 `docs/api/agent/README.md`、`elements.md`／`targets.md` 取得 `window.get`、`Accessibility.snapshot`、`UI.tapTargets`、`UI.readText` 四份 canonical 阅读包，生成新的 `capability-selection.json`：当前文档选型与历史 Profile/示范分开，四项当前运行验证均为 `not-run`，未伪造过去的候选失败。`r004-synthesis-retry/request.json` 在输出前列出 S7 主产物、新选型、四份正文、原合同、Profile、实际读值证据；收件 `s7-s9-receipt.json` 核对精确 S7 SHA `19c0aac2…`。按 `procedure-synthesize` 方法 `9014feb8…`／io-spec `98edaf36…` 从这些正文映射 D010—D060 为 B010—B050，产生 `procedure.json` SHA `da45e8c3…`，不读取旧 Procedure 作答案，也不重判 RawTrace 动作。`s9-check.json` 语义切片通过、四项 `pendingEngineering`，S9 handoff SHA `5f24ad91…`。

S10 的 `r004-harden/request.json` 在审阅前固定该新 Procedure 与 r002 Profile、选型及四份阅读包；`s9-s10-receipt.json` 验证精确 SHA `da45e8c3…`。按 `application-engineer/harden` 方法 `1c762766…`／io-spec `07cac5fd…`，实际逐项核对六个 Business Steps、11 个必要目标、清空／输入／读值规则、未知副作用停止与当前 API，生成 `hardening-review.json` SHA `9be5a59e…`。旧 Profile 不修改；它对固定历史布局的规则复用有依据，但 r002 三项 operation 自带 `needs-revalidation`，四个新方法当下均未运行。S10 handoff SHA `381fe6f6…`，Gate `warn`；不能进入新 Candidate 正常生产。`progress.json` 由当前唯一协调者追加 r004 续作状态，顶层 r003 各阶段和 q002 资格仍明确是历史结果。

`r004-distill` 和 `r004-synthesis-missing-selection` 两次拒收均没有启动相应 Producer；旧失败、旧 Dossier 和 r003 原件均保留。实际离线 Producer 尝试共 6：一次未登记的初始 Dossier、Dossier r2、Dossier r3、新 S7、新 S9、S10 审阅；协调者补交选型不计为 Skill Producer。失败后只重做受影响环节，未重置历史业务运行预算，未盲目重放任何未知输入。`old-s9-rejected.json` 证明失败 S9 无 SemanticProcedure，不能进入正常 S10 入口；两个成功收件报告均由下游生产**之前**运行，工具的 `productionOrderVerified=false` 仅表示工具本身不证明先后，实际时序由 request／输出产生顺序和 Producer 的输入读取记录解释。

### 工程修复与验证条件

`check-artifact-chain.js` 原来只核消费者 ID 的存在／时序，允许计划动作或未来业务步骤假冒实际 raw consumer；现在要求真实 RawTrace `actual-input`，终点只接受 `final output`。原检查器也把没有顶层 taskId、但 `contractRef` 精确绑定当前 TaskContract 的旧 WorkPlan 误拒；现在只在该精确绑定及计划 revision 同时成立时识别任务身份，错误合同仍拒绝。修改归属为原 checker、`artifact-chain.test.js` 和本 validation-plan 的原消费者／旧计划判据；原合同目标、Skill 方法字节和历史事实不改。先复现两个错误 PASS 与一个旧计划错误拒绝，再用修订 checker 重核实际 S7、S9 和依赖消费。

关键测试条件：固定业务输入和同次读值；A017 计划动作不得冒充 A018 输入；完整源步骤一次映射，B030 仅保留状态前置，B040 唯一消费 B025.firstResult，最终值仅来自 B050；旧失败不可正常交接；当前候选若触及 `not-run` 工程决策必须停止。公开 checker、正式 handoff 收件与手工 Producer 各给独立证据。`node --test tests/workflows/handoff-integrity.test.js tests/workflows/artifact-*.test.js` 本机 **273/273**；`s7-check-v2.json`、`s9-check.json` 与两个正式收件为限定范围 PASS，S10 为 `warn`。未执行新 Candidate 原字节宿主运行、真实 Runtime API 测试、新桌面、合法变参、独立模型、盲上下文或人工验收；原 q002 只保留旧资格。

### 十对象同一二十项量尺：仅更新新证据支持的项

评审者仍为同一 Agent；沿用下方 9 月 22 日 A1—E3、5／2／0 分档和相同版本的方法，禁止把离线修复、历史桌面或自审当作独立模型。仅 C1“产物可消费”获得新生产消费证据的三个对象从 2 更新为 5；其他分档逐项保持原评价及扣分限制。下表每行依次为 A（5 项）／B（4 项）／C（4 项）／D（4 项）／E（3 项），不将方法小计外推为整链或候选资格。

| 对象 | A /25 | B /20 | C /20 | D /20 | E /15 | 当前方法 /100 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| automation-plan | 25 | 20 | 17（5,5,2,5） | 8 | 7 | 77 |
| application-engineer/discover | 25 | 20 | 17 | 14 | 7 | 83 |
| application-engineer/harden | 25 | 20 | 14 | 8 | 7 | 74 |
| application-engineer/repair | 25 | 20 | 17 | 14 | 7 | 83 |
| task-demonstrate | 25 | 20 | 17（5,5,2,5） | 8 | 7 | 77 |
| trace-distill | 25 | 20 | 20 | 17 | 10 | 92 |
| procedure-synthesize | 25 | 20 | 20（5,5,5,5） | 17 | 10 | 92 |
| recipe-build | 25 | 20 | 14 | 8 | 7 | 74 |
| code-rebuild | 25 | 20 | 17 | 11 | 7 | 80 |
| recipe-qualify | 25 | 20 | 17 | 11 | 7 | 80 |

S7→S9→S10 **当前固定事实离线手工生产与正式交接**通过；S10 当前工程放行 `warn`，S11/S12 当前续作 `not-run`。独立模型评测、宿主自动加载、Runtime 公共 API、真实桌面、人工接受、跨输入复用收益均各自 `not-run` 或未量化；没有一个方法满足逐因素 95，不给整链或当前 Candidate 新资格。后续需为本合同取得新的获准桌面运行预算与可核对宿主环境，验证当前 S10 规则后，再按正式 S11/S12 接续并保留旧版本与费用累计。

## 2026-09-22 Workflow 业务链复核：当时环境与范围

**本次结论：保留现有主链与八项专业职责；修复真实的生产前交接缺陷，补上实际普通 JS 的宿主执行检验，但不宣布 Agent-to-Recipe 整链完成。**此前 220／227 项测试及其原始记录保留在下方历史章节；其中“正式消费已贯通”的结论需要收窄为当时已证明的后置引用绑定。本节纠正该外推，不把历史测试通过改写成未发生，也不继承历史分数为当前能力。

### 从正式入口继续，而不是再跑一遍八个 Skill

本次从 `WORKFLOW.md` 的已有成果入口出发，完整读取指定设计基线、共享合同和本记录，并按专业方法取得 SKILL／io-spec 正文。Calculator 的维护源码、固定 spec、真实资格工具和历史 r003 报告可以读取；原始 Dossier／DistilledSteps／Procedure／AppProfile／Candidate q002 与 Qualification 位于用户本地 `.runtime/automation-authoring/calculator-fresh-20260918/`，本环境没有这些文件，不能把报告中的路径和 hash 当作已重新核验的原包。

因此首个真实接续缺口是**取得并重核原任务包及候选依赖**，不是重新示范。原示范不重做；维护源码按 `reuse-unchanged` 进行限定审阅／宿主测试，不从最终代码反造成功 Dossier、应用现场或历史选型。S7/S9 在本轮只进入既有受控探针评测，未冒充实际业务重新提炼。S10 无现场不补造规则；S11 没有新业务候选；S12 完成可执行的源码层检查并保留真实资格阻塞。

| 业务问题 | 当前 Workflow 怎样解决／实际技术 | 当前证据 | 真实缺口与责任 |
| --- | --- | --- | --- |
| 用户到底要完成什么 | S1 保存原始来源，形成 TaskContract＋WorkPlan，分开输入、配置、运行值、Unknown、授权与停止条件 | 方法／规格、合同消费者及错误政策反例 | 自然语言到计划的独立模型生产未测；S1 规格中请求冻结时序本次修正 |
| 首次任务真实发生了什么 | S3—S6 用现有 Runtime 完成任务，Dossier 保留 planned/actual、动作、观察、值、消费者、副作用与验证 | 原 r003 报告记载历史 UI 110→660；本次只取得报告和源码，未重核原包 | 补取原证据；不能由聊天、Expected 或新执行倒填旧事实 |
| 哪些动作构成必要路径 | S7 从固定事实产生 DistilledSteps，retain/merge/omit/recovery 有来源，保留重复合法输入和读值边 | 顺序合成探针、取舍／数据关系反例、有效 S7 接续回归 | 真实未见探索轨迹的必要性判断仍未证明，不据此合并 S7/S9 |
| 怎样变成可复用业务过程 | S8—S9 消费 DistilledSteps 与明确政策／应用关系／选型正文，形成 Business Steps 和数据依赖 | 本次生产前正式 request 实际决定 S9 worker 收到的正文；缺主产物不调用 | S9→S10 仍只有 request 绑定；实际工程作业和 S9→S11 生成行为未证明 |
| 怎样落成应用操作 | S10 复用或补强定位、读取、等待、状态准备、动作、验证与失效规则 | 现有 Calculator 源码具备身份／布局／唯一性／稳定读取及未知停止；应用工具合成回归 | 当前 AppProfile 原包及 live 适用性待核；无依据不重做 discover 或扩大平台 |
| 怎样得到普通 JS | S11 消费已确认过程、操作规则和真实 API，直接交付普通 JS＋固定候选 | 维护 `calculator.js` 真实存在；本次原字节宿主执行证明 read→firstResult→第二段输入→finalResult | 没有本次从正式 Procedure/AppProfile 独立生成新候选的证据；不能用既有最终代码充作生成答案 |
| 后续能否直接复用 | S12 分层核验固定对象、真实入口、Fresh Run、合法输入变化和独立 UI 结果 | 原源码本次合成接口执行通过；无逐步 Agent 调用；真实资格预检查被 macOS 前提阻止 | 主入口仍是固定 25×4+10／6×首值；未提供可配置业务参数，合法变参资格未成立 |

### 本次缺陷、正式 Owner 与实际修复

| 具体问题／分类 | 根因 | 修复与验证 |
| --- | --- | --- |
| CLI 传了 `--consumer-request` 却返回 producer-only PASS／工具实现 | parser 保存 `consumer-request`，分支读取 `consumerRequest`；原测试只充分覆盖导出函数 | 修正参数映射；旧调用搭配跨 task request 的反例先复现错误 PASS，再验证 CLI 确实进入消费检查 |
| 共享 evidence 能冒充主产物到达／validator 与交接 | 只要求任意 artifact 相交；failed/interrupted/canceled 配 pass 标签也可进入正常消费 | 明确检查本次消费者所需主产物种类；全部精确匹配且 producer completed/pass 才允许正常绑定；基础失败包诊断保留。命令及迁移只在 WORKFLOW 第 4 节维护 |
| 生产结束后补信封被写成生产前消费／验证证据 | 原测试在 evaluateAdjacent 结束后创建正式信封 | 保留并重命名原后置绑定测试；新增真实顺序的确定性适配器：先 request，再生产；S9 从已核对 request 选取实际正文。缺 DistilledSteps 时不启动 S9 worker；不修改 evaluator 为调度器 |
| S1 规格写成产物完成后再固定 request／方法问题 | io-spec 的时序句与共享合同相冲突 | 修正 automation-plan/io-spec：生产前固定并读取请求与方法输入，生产后 handoff 绑定输出。只修该 Owner，不新增 schema |
| 只核源码形状无法证明读值确被消费／S12 验证方法 | 结构声明与最终数值可被正确外观掩盖；此前缺少原生产字节执行层 | 新增原源码合成接口执行测试；返回不同数据流标记、验证后续输入／终点读取／异步顺序／停止，三个故意坏副本均被 Oracle 拒绝。方法在 recipe-qualify 引用 validation-plan 唯一正文 |

`evaluateAdjacent / resumeFrom`、冻结方法字节、失败留存和累计预算继续保留为有限评测基础，未改成 Workflow Engine。`progress.json` 继续只是单写入者维护的索引；本次没有将 evaluator 的 pass 写成 progress done，也没有新增业务状态真相。Human 来源、原始副作用事实及其路由不变。

### 八个 Skill 核定

| Skill | 决定 | 理由与本次实际进入方式 |
| --- | --- | --- |
| automation-plan | 保留，调整 io-spec 时序 | 目标／授权／计划有独立责任；只修请求冻结歧义，未强制重新运行 S1 |
| application-engineer | 保留一个 Skill、三模式 | discover/harden/repair 共享应用专业方法，输入和完成范围不同；没有证据需要拆三个 Skill |
| task-demonstrate | 保留 | 事实采集与必要性判断不同；本次无新桌面示范，历史事实不覆盖 |
| trace-distill | 保留 | 原动作必要性唯一 Owner；本次在受控相邻测试按固定输入执行确定性探针，不冒充模型按方法理解 |
| procedure-synthesize | 保留 | 必要路径到业务语义与数据关系有独立职责；本次验证正式 request 在 S9 生产前驱动输入，而非重读 Raw Trace |
| recipe-build | 保留；生成能力仍需证据 | 过程／规则到普通 JS 不能省略；维护源码存在不等于本次已从规定输入生成 |
| code-rebuild | 保留为可选／独立入口 | 本次限定审阅维护源码并保留原字节，无真实代码缺陷不强行优化，不虚构新 Candidate |
| recipe-qualify | 保留，补强执行与变参判据 | 资格与生成相互独立；补原字节执行及真实公开入口检查，不以 mock 或 helper 参数扩大资格 |

未合并、拆分或增加 Skill／阶段／Gate。以上是当前证据支持的保留决定，不是“八个已经最优”的结论。

### 重新按同一量尺检查十个方法／模式

评审者：本会话同一 Agent；不是多人专家或盲上下文。范围：实际读取的当前方法／规格、共享合同与限定确定性消费者证据；不包含模型、桌面或生产可靠性。A1—A5、B1—B4、C1—C4、D1—D4、E1—E3 的含义保持 validation-plan 第六节，不重设权重。

下表完整给出二十项分档向量，括号内为五因素小计。5 只表示该方法设计或明确工具切片的证据充分；2 为部分覆盖；0 为无证据。每个对象重新对照其方法和本次实际回归；下方历史逐项依据仅在本次同字节／同范围已核对时复用，不让旧测试数量自动续分。

| 对象 | A 五项（/25） | B 四项（/20） | C 四项（/20） | D 四项（/20） | E 三项（/15） | 方法小计 |
| --- | --- | --- | --- | --- | --- | ---: |
| automation-plan | 5,5,5,5,5（25） | 5,5,5,5（20） | 2,5,2,5（14） | 2,2,2,2（8） | 5,0,2（7） | 74 |
| application-engineer/discover | 5,5,5,5,5（25） | 5,5,5,5（20） | 5,5,2,5（17） | 2,5,2,5（14） | 5,0,2（7） | 83 |
| application-engineer/harden | 5,5,5,5,5（25） | 5,5,5,5（20） | 2,5,2,5（14） | 2,2,2,2（8） | 5,0,2（7） | 74 |
| application-engineer/repair | 5,5,5,5,5（25） | 5,5,5,5（20） | 5,5,2,5（17） | 2,5,2,5（14） | 5,0,2（7） | 83 |
| task-demonstrate | 5,5,5,5,5（25） | 5,5,5,5（20） | 2,5,2,5（14） | 2,2,2,2（8） | 5,0,2（7） | 74 |
| trace-distill | 5,5,5,5,5（25） | 5,5,5,5（20） | 5,5,5,5（20） | 5,5,2,5（17） | 5,0,5（10） | 92 |
| procedure-synthesize | 5,5,5,5,5（25） | 5,5,5,5（20） | 2,5,5,5（17） | 5,5,2,5（17） | 5,0,5（10） | 89 |
| recipe-build | 5,5,5,5,5（25） | 5,5,5,5（20） | 2,5,2,5（14） | 2,2,2,2（8） | 5,0,2（7） | 74 |
| code-rebuild | 5,5,5,5,5（25） | 5,5,5,5（20） | 5,5,2,5（17） | 2,5,2,2（11） | 5,0,2（7） | 80 |
| recipe-qualify | 5,5,5,5,5（25） | 5,5,5,5（20） | 5,5,2,5（17） | 2,5,2,2（11） | 5,0,2（7） | 80 |

主要扣分：S1／示范／S10／S11 未完成当前真实业务生产交接，C1/C3/D 保持局部；应用工具的合成 Profile 修订只支持其工具范围；S7/S9 的正常、变化、定向修复和预算由本次确定性测试支持，通用语义、Human 与真实模型路由仍不获满分。**S9 的 C1 从历史 5 调整为 2**：Procedure 被 checker 与 S10 request 绑定，不等于已经驱动 S10 或 S11 实际作业。新的 JS 执行测试提高可核对证据，但未让 code-rebuild/recipe-qualify 取得新候选或真实资格，故不强行加分。E2 全部为 0；没有实际复用收益或费用数据。

相邻交接单列：S7→S9 的生产前正常／拒绝和定向恢复在确定性切片成立，模型层未测；S9→S10 仅引用绑定。整链、具体候选资格、模型、正式宿主、Runtime、桌面、人工接受和真实收益分别保持 not-run／blocked／not measured，不从上述小计推导总分。历史相邻 92 的后置证明范围由本节纠正，不继续称其为完整生产前交接分。本轮不生成 Agent-to-Recipe 单一综合分，也不以达到 95 为修复目标。

### 实际执行与证据边界

首读 master `a5e8f037c4ef41e8454a293253a0e08443ac625b`。本次执行副本来自该提交 Actions run `35730957559` 的 artifact `10695262712`；ZIP SHA-256 `51a0cad056fb825dfe2c724fb4a98efd48f9682577e9e8808162070f419e4e20`，source-head 与 tar commit 一致。它是范围内源码快照，不是用户工作区或完整 Git checkout；本地 `git rev-parse HEAD / git status` 均报告无 `.git`，不能声称用户本地干净。写入沿实际最新 master 增量提交、非强推，提交／远端回读与本地测试是不同事实。

提交前发现 master 已推进到 `b8913337fcc396b3a4265da62b51a284a24ce331`（5 个并行提交）。重新取得 run `35734589988`／artifact `10697041915`，ZIP SHA-256 `0c11831fe06dd4ce044e042908421d97ff52bc3e7fa7bf82f04d5171b0c915d1`；三方合并保留全部 S12 scope/scenario、合同绑定、局部重验及其测试。validation-plan 末尾双方追加的段落显式保留，没有覆盖并行改动。下方并行 S12 记录保持原范围，不算本轮修复。

执行目录 `/mnt/data/opendesk`，Linux、Node v22.16.0。实际命令：

```bash
node --test tests/workflows/handoff-integrity.test.js tests/workflows/artifact-*.test.js
python3 -m unittest discover -s tests/agent-to-recipe/application-engineer -p 'test_*.py' -v
node tests/workflows/calculator/qualify.cjs --check
```

基线 227/227；新增缺陷集先得到 49 pass／10 fail。中途一次修复遗漏 completed 状态保护，111 项中 3 fail，保留该失败后修正；生产前交接相关 113/113；原 JS 执行 17/17；原执行副本全套 **256 pass／0 fail／0 skip**；合并并行 S12 更新后重新执行 **261 pass／0 fail／0 skip**，其中并行更新带来 5 个既有增量，不算本轮新增。新增 29 项为 10 个交接反例／迁移、2 个生产前顺序／拒绝、17 个原 JS 执行与反例敏感性检查。Python 27 项中 26 pass／1 skip，真实模型材料未提供，不冒充模型提取通过。

Calculator `--check` 实际返回 fail：`This qualification is macOS only`，`inputStarted=false`；本环境也缺原作者任务包与构建物。该失败是当前环境／输入前提阻塞，不是此源码业务失败，更不是新资格。保留工具的原 fail 和依赖诊断，不改平台／hash 保护来得到绿色结果。本轮无 Runtime、桌面、Fresh Run 或人工接受。

维护源码保持 SHA-256 `a62c72aa2b00f256755aac2524d14e4655a88194c012bf6765f0d314a62774cc`。合成读值 `0040`→后续字符输入和终点 `777` 用于检测常量替代，不满足原业务算术也不冒充真实观测。测试加载原生产文件，仅加顶层 await 包装；没有第二套 Calculator 业务实现，未修改 spec、真实资格工具或旧候选 hash。

日志位于 `.runtime/tests/workflow-business-20260922/`；原始失败、正常和预检查全部保留，不提交源码仓库。以下摘要及固定测试入口支持复核，证据不可读后须降低相应可复核结论：

| 日志 | SHA-256 |
| --- | --- |
| `baseline.tap` | `e56a7cade8b8ea271513051f90b6b72bea6630e47068426af35774ed443c072b` |
| `reproduced.tap` | `d5b4cb2bd5a1281ca16ac402bf680e93518cf76c9687cbd0255f999100d28243` |
| `fixed-handoff.tap` | `60fd92f48ba6462d6e4f6a2189b32695884418dd23994c7f5657bea505e7a075` |
| `pre-production.tap` | `eac934170e27594c6773a95af66e8dd1592464e56c9bba03c82f32cb0d231589` |
| `production-js.tap` | `ff52b4525d42b4092efc504da701af9005c5b53e6e82de68514166dcbc7974b4` |
| `full-final.tap` | `964a8c5e6ca39b7fc093cb974874ef57618e1bb807837e3bc98976d9bd04b57e` |
| `merged-final.tap` | `314a5b1fa369a36fe36ba5a404bb0a4ddd0cdcf9760d1416934ccf23255447df` |
| `application-engineer.log` | `8ce23d277d37f28573af6acdd57598afb5abd5132ba9f6d85eb0881a1a6c74a4` |
| `qualification-precheck.log` | `05edde69f9957a09732150549ed219b20a1c3b4f7689536da75b6bc8850fa1da` |

本轮实际方法／规格字节：

| 方法目录 | SKILL.md SHA-256 | io-spec.md SHA-256 |
| --- | --- | --- |
| `automation-plan` | `9e274fff7f496fef05035e3be1a6dc6fbf56561b5d42e32aca2acd05cab237d8` | `0094bb9b024d53150c94bc60eb89c8bdf1df74d8c9c974d1d386a080f67d89c1` |
| `application-engineer` | `1c7627669b23caa60497fc1cebd5f73f52ccc38135952cd31e4ab9adcdf59e2e` | `07cac5fd02b548bcad2ea717226a9354d590b71d9a1cc204e071d0b02c4ba23f` |
| `task-demonstrate` | `fa41f980426691e499cdaf0f2703322506c6e67aaef4156d3ef62e47125c0ad5` | `1b405f9debc25404465407d95d518c494bd9525e5c3b30a5347a6fd2d10d0b16` |
| `trace-distill` | `d34458d7912a6aafeea822ce85b9a7a8ce49d659c696202b91af11bbda2948c9` | `7c496021a943a721440191dc1e06ae238c3cd49c7fd6d8c13acd17e47a3de8ff` |
| `procedure-synthesize` | `ff36c0303c4f2440dbbb8dbbd5ff8a8d034e2017b4291666f462c9358fc7d36d` | `98edaf36ab476c232f4ebe7dcbb3d43dec02168b9490ff1eb68867135783842f` |
| `recipe-build` | `6c7014c6c98456e1e94cf4951e1de96f2a1d2dc26527cf7ec3ada6753be85717` | `30f656137aaa5ca9672fb0e370f80ecda10e23a4b825657ea1d2a4e13a801709` |
| `code-rebuild` | `5170bae42879474f8f53cca43ba8c084b9424d5180b1888f37d3f2b5881511fe` | `30a66fa2a85c229e714b3bc7c79d74da1ba7b34cb1a6b73db6406359c4c8c9ef` |
| `recipe-qualify` | `5815b1adf602ae88480b8af1f3bf053369116025c874fe21764633f40284b746` | `4249a8d6bbaeb1ba190694e9d24a10e4fe1eed9b77b679d77f46dee337ce7c0f` |

本轮支持文件版本（报告自身不写自身 hash，避免循环）：

| 文件 | SHA-256 |
| --- | --- |
| `tests/workflows/handoff-integrity.test.js` | `1e36b9fd3210390bdde45f57a0404786c5ab7b1be5fb6417e0afe18d21a33f59` |
| `tests/workflows/artifact-calculator-production.test.js` | `d8fe21a9081b2de4831527cac33c3dff796655eafef04c1aa9629cac74ebb78d` |
| `tests/workflows/artifact-input-sufficiency.test.js` | `3198d4dd2358d957b5d664e400188938eca7970504f8c1ed4397d324e38f6e7f` |
| `workflows/agent-to-recipe/WORKFLOW.md` | `0d5bc53b53abd61b632e3a256e741ee0453f13ce3faa2872fb3638515d01a693` |
| `workflows/agent-to-recipe/design/validation-plan.md` | `362aecf6883d46a11ff0051a6ebe2020b4e6bd0628062f949e6d2b002f0219e0` |
| `workflows/agent-to-recipe/scripts/check-handoff.js` | `4467811f651043bb748ce6e2298f37e817452434aab9f803a7b61b8c35a286ce` |
| `workflows/agent-to-recipe/skills/recipe-qualify/SKILL.md` | `5815b1adf602ae88480b8af1f3bf053369116025c874fe21764633f40284b746` |
| `workflows/agent-to-recipe/skills/automation-plan/references/io-spec.md` | `0094bb9b024d53150c94bc60eb89c8bdf1df74d8c9c974d1d386a080f67d89c1` |

### 下一步只从真实缺口继续

先在已有本地任务根核对 r003/q002 的 TaskContract、WorkPlan、Dossier、DistilledSteps、Procedure、AppProfile、Candidate、Qualification 及必要依赖。能证实仍有效的成果原样保留；缺文件先补取原包，不重做成功示范。只有依赖或现场确实失效，才按共享合同回正确责任。

本轮请求包含合法输入变化，而当前 main 无业务参数入口。原包核定后从 **S8—S9 的业务参数／输入合同缺口**继续，区分用户可变输入和每次必须重新取得的 firstResult；复用有效应用规则，S11 生成并冻结新普通 JS，S12 对同一候选运行固定基线和合法变化。若原候选的当前资格本身缺证，则先完成相应 S12 核验。这个接续不要求再跑全部 S1—S12，也不把“八个 Skill 各跑一次”当作目标。

仍有三项主要未完成：原包／当前环境可复核性；正式 Procedure＋AppProfile 到新普通 JS 的实际生产；同一候选公开入口的 Fresh Run／合法变参资格。真实模型稳定性与复用收益随这些实际作业分别取证，不另扩展工作流平台。

## 以下为此前版本的历史记录

以下 220／227 项、旧版本 hash、评分及完成声明仅保持其原证据范围。与本节对生产顺序、主产物消费及 S9 下游实用性的纠正不一致时，以本节当前结论为准。


## 结论与评审身份

主链仍为 S1 automation-plan → S2 application-engineer/discover → S3—S6 task-demonstrate → S7 trace-distill → S8—S9 procedure-synthesize → S10 application-engineer/harden、repair → S11 recipe-build（可选 code-rebuild）→ S12 recipe-qualify。保留 G0—G7、共享合同、现有 Recorder／Replay 和普通 OpenDesk JavaScript。

八个方法及各自 io-spec 已存在并由正式导航引用；本轮完成有限 S7→S9 评测入口的规格字节接线、定向失败接续和方法命令回归。**原请求尚未全部完成，十对象均未满足“每个必需因素至少95”**。不能把这里的程序通过当作八方法真实模型能力、真实宿主加载、协调者 progress 更新、S1—S12 正式业务整链或真实桌面资格。

评审者：本轮同一 Agent 自审／复核。没有独立专家、人工批准或独立模型评审。日期：2026-09-22。审阅范围：当前方法／规格／共享合同的设计一致性，加本轮实际执行的确定性工具与有限相邻消费证据。分数是方法与配套的就绪性自审，不是运行成功率。A/B 的设计证据不外推为模型遵守能力；C/D 的工具证据严格标明范围；成本收益没有证据不得补分。模型、宿主、业务、桌面与人工接受层不填运行分数。

评分唯一依据：[validation-plan 第六节](../../../workflows/agent-to-recipe/design/validation-plan.md#六95-分目标的评估办法)。沿用 20 项、5／2／0 档及 25／20／20／20／15 权重，不调整分母。5=相应审阅范围证据充分，2=有明确局部覆盖且列出缺口，0=无相应证据或错误。每因素达到95在该离散规则下要求其判据全部5分；总分97但一个因素80也不满足本请求。本报告不继承旧97、旧测试数量或旧设计满分。

## 评分口径补充：统一量尺不等于统一结论

本报告必须按 validation-plan 第六节区分评分范围：**设计、单 Skill／模式、相邻交接、整链、候选业务分别形成结论**。同一套五因素／二十项判据是项目当前的共同审查量尺，不等于把不同层级合成一个统一总分，也不允许一个层级的成绩继承给另一个层级。

本轮“十对象五因素表”只评价用户指定的十个**单 Skill／模式方法对象**。其中 application-engineer 的 discover、harden、repair 虽共用同一 SKILL.md／io-spec 字节，仍因职责、输入、输出、修复路径和证据不同而分别评分；不得给 application-engineer 一个综合分替代三个模式结论。automation-plan、task-demonstrate、trace-distill、procedure-synthesize、recipe-build、code-rebuild、recipe-qualify 也各自保留独立结论，不计算十对象平均分或“Agent-to-Recipe 总分”。

每个对象内部五因素同样独立门禁。总分不能抵消某因素未达标；按现有 5／2／0 离散规则，某一必需因素要满足 95 要求，实际要求其适用判据全部充分满足。真实性、授权、安全停止、关键输入充分性和数据关系继续作为不可平均抵消条件。

以下范围**不并入十对象方法分，也不能继承方法分**：

| 独立评审范围 | 本轮处理方式 |
| --- | --- |
| S7→S9 相邻交接 | 单独记录 evaluateAdjacent／resumeFrom 的正常、拒绝、修复、正式 request／handoff 精确消费和版本接续证据；当前证明确定性 Producer 产物可进入正式信封并被相邻 request 消费，但不把 trace-distill／procedure-synthesize 的方法分相加或平均成“交接分”，也不冒充真实模型／宿主／progress |
| S1→S12 整链 | 本轮没有实际模型＋正式业务贯通证据，保持 not-run／未评分；不能由十个方法分推导 |
| 候选业务／Recipe 资格 | 必须绑定具体 Candidate、范围和真实资格证据独立结论；本轮没有新的正式候选业务资格，不评分 |
| 真实模型／宿主／权限 | 独立记录模型行为、Skill/io-spec 实际加载、工具权限与调用账目；确定性探针不能继承为模型分 |
| Runtime／真实桌面／人工接受 | 各自按实际运行和独立结果来源记录，不进入方法设计分 |
| 复用收益、耗时、费用、调用次数等经验指标 | 按真实样本和分母单独报告；没有数据时不伪造经验百分比。方法层“复杂度与成本”相关判据仍按现有 5／2／0 证据规则评分，两者不能互相替代 |

因此，本报告出现的 74／83／92 等数字仅表示对应**方法对象、对应证据范围**下的五因素审查结果；它们不是工作流整体成熟度、模型成功率、交接成功率或生产可靠性评分。后续取得新的模型、交接、整链或候选业务证据时，只更新相应独立范围，不为了提高总分重算无关对象。

## 2026-09-22 续接收口：真实字节消费、责任路由与独立分层结论

本节是在原 220 项闭包证据之后继续执行的增量，不覆盖前文历史日志。当前仓库没有可由本会话授权并记录完整预算／隔离信息的真实模型 adapter，因此**真实模型生产保持 not-run / blocked**；没有用确定性探针冒充模型。能直接完成的非 GUI 缺口已继续修到正式信封消费边界。

| 对象 | 当前真实状态 | 本轮新增有效证据 | 仍缺什么 |
| --- | --- | --- | --- |
| S7 方法消费 | deterministic Producer PASS | 固定 SKILL.md＋io-spec＋共享合同＋明确输入进入 packet，实际产生 DistilledSteps；方法/规格缺失或变化仍拒绝 | 真实模型按同包生产 not-run |
| S7 → S9 正式相邻消费 | **PASS（限定确定性切片）** | 实际 DistilledSteps 发布到 `agent-to-recipe/v1` handoff，正式 S9 request 以同一 artifact ref/hash 消费 | 真实协调者 progress 写入、真实模型/宿主 |
| S9 方法消费 | deterministic Producer PASS | S9 只取得获准输入＋实际 S7；实际产生并检查 SemanticProcedure | 真实模型一般语义能力 not-run |
| S9 → S10 正式相邻消费 | **PASS（限定确定性切片）** | 实际 Procedure 发布后由 `application-engineer / harden` request 精确消费 | S10 实际工程作业及现场验证 not-run |
| 定向失败接续 | PASS（限定确定性切片） | 缺选型来源 → coordinator/sourceOwner；补交新版本 → 重核 S7 → 只重做 S9；累计调用 3/4；正式下游接受修复版 Procedure、拒绝旧失败版 | 真实模型/业务失败接续 not-run |
| 来源路由 | PASS（已构造类别） | `automation-plan`、`application-engineer`、`task-demonstrate`、`trace-distill`、`procedure-synthesize`、`coordinator` 均有行为证据；validation 覆盖不足保持独立 | Human-to-Recipe 与一般语义/全部失败类别未穷尽 |
| S1 → S12 整链 | not-run / 未评分 | 无 | 真实整链证据 |
| Candidate / Recipe 业务资格 | not-run / 未评分 | 本轮没有新 Candidate | 具体 Candidate bytes/hash＋资格场景＋真实结果 |
| 真实模型 | not-run / blocked | 没有可信 adapter、隔离和费用账目，故未伪造通过 | 获准模型 host |
| 真实宿主加载／权限 | not-run | Node permission subprocess 仍只是测试宿主 | OpenDesk 正式宿主实际加载 Skill/io-spec/权限 |
| Runtime／真实桌面 | not-run | 无本轮桌面执行 | 当前构建、现场 API、真实窗口和业务结果 |
| 人工接受／经验收益 | not measured | 只记录确定性调用数：正常 2 次；失败＋定向修复累计 3 次 | 真实耗时、费用、人工修订、复用样本及分母 |

### S7 → S9 相邻交接独立二十项评审

下表是**重新按同一 validation-plan 量尺评 S7→S9 交接本身**，不是把两个方法分数相加、平均或继承。得分恰与单方法历史分出现相同数字也不表示同一结论；依据是本轮正式信封和实际确定性产物的交付/消费证据。

| 判据 | 分数 /5 | 本层依据／扣分 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 只验证已提炼事实进入业务过程，不把检查器或 Expected 变成业务答案 |
| A2 来源和未知分开 | 5 | S9 仅见获准材料＋实际 S7；缺选型先失败，不静默读 Dossier/Raw Trace |
| A3 任务覆盖完整 | 5 | 正常、缺材料、定向补交、S9 自身修复、旧版本拒绝均覆盖限定切片 |
| A4 真实数据关系成立 | 5 | 生产者/消费者、consumerBinding、变换、终点读值在两阶段保持 |
| A5 成功/失败判据清楚 | 5 | pass 才进入正常 formal consumer；warn/fail 只可诊断 |
| B1 边界明确 | 5 | evaluator 仍是评测工具；formal checker 只读，不生成 handoff/progress |
| B2 必要前提齐备 | 5 | 方法、io-spec、合同、显式输入和精确 artifact ref 均固定 |
| B3 路由正确 | 5 | 补包、源错误、应用工程、S7/S9 自身错误保持不同责任 |
| B4 无职责重叠/循环 | 5 | 未增加 Workflow Engine、DSL、第二套状态或 S9 重做 S7 动作取舍 |
| C1 产物可消费 | 5 | 本次实际 DistilledSteps 经正式 handoff 进入 S9 request |
| C2 版本与来源一致 | 5 | 下游必须消费上游 `artifacts[]` 的 exact root/path/hash/schema/kind；旧版拒绝 |
| C3 可接续 | 5 | 缺材料后保留 S7，补交新版本只重做 S9；修复后 Procedure 继续进入 S10 request |
| C4 证据生命周期 | 5 | 原失败 raw/input/check 与累计预算保留；新版本不覆盖旧失败 |
| D1 正常场景证据 | 5 | GitHub Actions 实际执行完整确定性 Producer＋formal envelope 路径 |
| D2 变化/拒绝证据 | 5 | stale/unpublished、fail Gate、跨 task、缺规格、变方法/输入均有拒绝用例 |
| D3 失败返回正确 | 2 | 已证明多类责任，但 Human 来源、一般语义和所有失败组合未实测，保持局部覆盖 |
| D4 修复后重验 | 5 | 重核 S7 后仅调用 S9；正式 consumer 只接受修复后的新 Procedure |
| E1 工程量符合风险 | 5 | 复用现有 checker/request/handoff；未建调度器或新 schema |
| E2 实际复用/封装收益 | 0 | 没有真实业务费用/耗时/人工收益样本，不以测试调用差值代替 |
| E3 预算和停止有效 | 5 | 无新材料/repair disposition 停止；累计预算不重置；未知副作用不重放 |

独立结果：A=25/25（100%），B=20/20（100%），C=20/20（100%），D=17/20（85%），E=10/15（66.7%），合计 92/100。**D、E 未达到逐因素 95，因此本相邻交接不满足“逐因素95放行”。**这个 92 仅属于上述限定交接审查，不是 trace-distill 分、procedure-synthesize 分、整链分或生产可靠性。

### 本轮增量的远端字节与实际 CI

方法 SKILL.md／io-spec 本轮未改，前文十对象固定版本及方法分不因本次 checker 接线自动变化。下列支持文件使用 Git blob SHA 绑定远端当前字节；前文旧 SHA-256 表保留其历史执行范围，不再冒充这些已修改支持文件的当前摘要。

| 文件 | 当前 Git blob SHA |
| --- | --- |
| `workflows/agent-to-recipe/scripts/check-handoff.js` | `3cfe01a9e64da96f8252d583cad18909de80cf81` |
| `tests/workflows/handoff-integrity.test.js` | `42293dcf245037f61b652489f42a4da4af342068` |
| `tests/workflows/artifact-input-sufficiency.test.js` | `5ce359df0802352a13c3cb3efc8929e6a0a7af32` |
| `workflows/agent-to-recipe/WORKFLOW.md` | `9683ddc64c2fb9b1e79fc66972fccaf666dbe522` |
| `workflows/agent-to-recipe/design/validation-plan.md` | `d4d25d4a21ab4cc648280ac4323cdab64f190aac` |

GitHub Actions `API docs contract` 的 `Agent-to-Recipe capability chain` 已在包含代码/测试修复的 `56002e38e8407e2265c3c387cbd8bd510e101965` 成功，随后在文档同步后的 `2e63adaec7a1a6ee987223e6b4d4d2f613120476` 再次成功。后一次 job `106735863178` 实际报告：**227 tests / 227 pass / 0 fail / 0 skipped**。比前文历史 220 项增加 7 项：formal consumer 正常/拒绝覆盖、实际 S7→S9→S10 信封消费和两类新增来源责任路由；测试数仍不是生产成功率。

同一 `API docs contract` workflow 的 `Layered Agent API reading` 与 `OpenDesk Runtime contract and unit (macOS)` 在父提交 `55040e8aad894aabfcaf82546379e0db166aef70` 就已经失败；父提交的 `Agent-to-Recipe capability chain` 同样成功。本轮 `56002e38...` 仍是相同两项失败、专项成功，因此这些失败不归因于本轮 Agent-to-Recipe 修改，也不在本轮扩大修复。

## 基线、修改及证据范围

首读 master：`af19e5412961012623c6f9c896a1fbe0ca5f0404`。用户给的 `28767979003cc09254b5446f917e5de5d04dca1f` 只作历史线索，没有假称取得上一轮未提交副本。本轮从现有 CI 的固定 source.tar 恢复执行快照，不是用户本地工作区或完整 Git checkout；不声称用户本地干净。

实际先提交 `b98d6a8e62554265fd9ecf3360c916cd997adfeb`：仅让现有 CI 源码证据包含 tests/agent-to-recipe、docs/api、docs/architecture，以便复核方法的真实引用闭包。run `35703583558` 的 capability-chain 作业 `106667074554` 通过；此提交尚未包含本轮后续代码，不以该旧194项作业证明新220项。

从该提交的 artifact `10683327251` 取得补全源码；ZIP SHA-256 `f62f3449f7a1a224ea1bec5eccfdc0425fd9eb043a87010110c6481ec1401a37`。先核 source-head／tar commit，再逐文件比对：原194文件与固定基线一致，保留执行副本7项改动，补135个缺失文件，不整包覆盖。提交时沿 master 当前父提交逐文件增量写入；报告用下方实际文件 SHA-256 绑定受评版本，避免将报告自身 commit/hash 写入自身而产生循环。

| 检查对象 | 本轮保留 | 真正修订／验收 |
| --- | --- | --- |
| 正式导航与八套方法 | 当前 WORKFLOW／设计主图／共享合同已是八入口，日期化五入口历史保留 | N 逐方法核对入口、io-spec、相对链接与检查命令；validation-plan 将两处旧拟实施段标清历史 |
| io-spec 与方法 | 八份规格全部保留，字段仍由共享合同唯一维护 | S9 `--through procedure` 修成实际 `procedure-synthesize`；不扩工具别名；S11 明确关键规则缺失只留草案 |
| evaluateAdjacent／resumeFrom | 原消费者完整性、来源核对、合法合并、预算和原失败保留 | 同时交付 SKILL、io-spec、合同实际字节／摘要；规格缺失在调用前拒绝；冻结资料篡改拒绝 |
| 局部恢复 | 保留有效 S7，不从头生成熟悉答案 | S7 依赖变化拒绝旧输出；S9-only 依赖变化只重做 S9；无新材料／repairReason 不调用；连续拒绝不洗掉原失败 |
| 来源路由 | application-engineer 单入口三模式、Agent／Human 来源责任表 | 不改事实来源；模式不授权桌面或上传；方法审阅与实际路由测试范围分开 |
| 质量记录 | 旧记录保留原日期与范围 | 仅本记录维护本轮十对象评审；日志仍在 .runtime，不进正式源码 |

S9 的方法／规格／共享合同和输入都在 Producer packet 中含实际正文及摘要；不是只记录路径。S9 正常不取得完整 Dossier／Raw Trace。方法／规格通过冻结文件清单和实际输入包双重核对。S7 的任何已消费依赖变化不能盲复用；当前共享合同按整文件交付，因此整文件变化保守失效 S7，不声称段落级语义影响分析。仅 S9 方法、规格或定向材料变化不改 S7 输入包，重检后只调用 S9；没有全链无条件重跑。

同版失败允许显式 repairReason 定向修复；原输出和失败检查作为不可信诊断交付，不是正确答案、事实或新授权。修复仍消耗原总预算并重检新结果。只统计明确提供的接续链，无法认证任意祖先或未报告的并行分叉；协调者仍负责任务总账。方法身份和 hostId 是声明，不是认证。

## 本次执行与失败原样保留

工作目录 `/mnt/data/opendesk`；Node v22.16.0、Python 3.13.5、Pillow 12.3.0，Linux 容器。Node 只运行已有宿主测试，没有把业务 Recipe 改为 Node 项目。

```sh
node --test tests/workflows/handoff-integrity.test.js tests/workflows/artifact-*.test.js
python3 -m unittest discover -s tests/agent-to-recipe/application-engineer -p 'test_*.py' -v
node --check tests/workflows/tools/adjacent-producer-eval.js
```

首次本轮基线194通过；新增缺陷选择集13项中4通过、9失败，证明规格交付／冻结／无修复重试的缺陷可复现；修复后的相邻专项49通过。一次完整重验217通过、3失败，原因是 CI 旧快照没带方法引用的 API／架构文件；保留失败日志，未跳过断言。取得同提交完整引用文件后最终220通过、0失败、0跳过。Python27项：26通过、1跳过、0失败；跳过的真实提取比较缺 OPENDESK_REAL_MODEL_EXTRACTION／OPENDESK_REAL_MODEL_STANDARD，不把合成 ingest 测试冒充模型输入。

本轮测试增量26项：14项 io-spec／版本／接续回归，加12项方法导航与命令。TAP 数量不是业务成功率。所有旧断言和合法正例保留，没有修改业务事实来迎合检查器。

证据标识：N=[方法配套测试](../../../tests/workflows/artifact-method-packages.test.js)；S=[完整输入驱动相邻测试](../../../tests/workflows/artifact-input-sufficiency.test.js)及其 packet-only probe；T=[工件链](../../../tests/workflows/artifact-chain.test.js)、[边界](../../../tests/workflows/artifact-boundaries.test.js)、[交接完整性](../../../tests/workflows/handoff-integrity.test.js)与预制输出包装回归；P=[应用工程程序测试](../../../tests/agent-to-recipe/application-engineer/)。N/T 不是 Producer；S 是经过完整包装的确定性 Producer；P 的本次输入为合成资料。全量 Expected 没有交给 S 的 Producer；故障输出只作诊断，未当标准答案。

日志根 `.runtime/tests/agent-to-recipe/skill-closure/`。原始日志与评测产物沿既有 .runtime 生命周期；正式摘要保留下方摘要及可重复测试入口，证据过期或缺失应降低可复核结论，不虚称永久可用。

| 实际日志 | SHA-256 | 结论 |
| --- | --- | --- |
| `baseline.tap` | `550245e3d0682ddb4e3b1557ebce360c8602ece4f1537a03021ce66f6611d9ef` | 194 pass |
| `reproduced.tap` | `b7f55494cc74953abde2f48ba25d3ba1fd726404aa92b77c7521db2d4ce5a9a3` | 13 tests: 4 pass / 9 fail |
| `precommit.tap` | `f7bf0ee06a7571b7ffa57ef432f500d4abb790e39c7a80e2b614862d630d9da0` | 220 tests: 217 pass / 3 missing-snapshot failures |
| `full-final.tap` | `a0ef6ca880210a51e41e503a9017f5ae82f30065b59db6aeb84316aa82d6c288` | 220 pass / 0 fail / 0 skip |
| `application-engineer.log` | `28a68cbbd82fcdaeddc472a4d33812fb080dff31d5d990660fa62e9a9d334b2e` | 26 pass / 1 skip / 0 fail |

## 一个正常消费与一个失败接续实例

均为本轮真实执行的**合成工单场景、输入驱动确定性探针**，不是新桌面示范或模型能力。实际启动新 Node 进程，stdin 收 packet，文件读取许可外尝试被拒绝；命令、cwd、探针版本、输入输出摘要、退出码保存在 host-call 记录。该隔离不是完整 OS／网络沙箱。

正常：`case-oQ7rvK/merged-consumers`。S7 实际产出 DistilledSteps，S9 消费该确切输出：`0040` 保留前导零；同一业务步骤含两个原消费者，分别实际消费 `['0','0','4','0']` 和 `'0040'`，Procedure 保留两条不同变换边；没有业务输出步骤允许 consumers=[]；终点 `已受理` 仍指向 final output。两个阶段 pass、2/4 次调用，非必需诊断材料未提供仍通过。

失败／修复：`case-Q3QRqY/missing-selection`。只给 S9 API 文档，没有实际选型来源；S7 pass，S9 以 CAPABILITY_SOURCE_MISSING fail，nextRequest.owner=coordinator，sourceOwner=task-demonstrate，要求交付 inputs.supplementRefs。这里是已有合成选型资料未交付，不是要求伪造新历史。

补交有新引用的 `selection-r2.json` 后调用同一 resumeFrom，输出在 `case-Q3QRqY/after-supplement`：先重核原失败和 S7，再只执行一次 S9；累计3/4次，S7 输出摘要完全相同。resumeDecision 记录只改变 inputs/files，原失败 raw 摘要不变。没有重做 S7、没有 UI 重放、没有填写业务 handoff/progress。

实例根：`.runtime/tests/agent-to-recipe/input-sufficiency/`。

| 产物 | SHA-256 |
| --- | --- |
| `case-oQ7rvK/merged-consumers/evaluation.json` | `36a426de2a3138d527925a61ab1b8e5244e943f1e850fee7ee5089f480aad9cd` |
| `case-Q3QRqY/missing-selection/evaluation.json` | `3829b8e47665857495ae9b2ff9ecca660118e9acc3fd4c472bcf74a5e29b7401` |
| `case-Q3QRqY/after-supplement/evaluation.json` | `7138d3467a96905b98bcb7c67a6b6088214cb85729aa2fd324a658bcf25597ea` |
| `case-Q3QRqY/missing-selection/outputs/distilled.json` | `562f8ca492a52ee921c7388557e03c3d9b070e86da1e98d5a2ffefbd10515520` |
| `case-Q3QRqY/after-supplement/outputs/distilled.json` | `562f8ca492a52ee921c7388557e03c3d9b070e86da1e98d5a2ffefbd10515520` |

额外通过的正反例：缺任一阶段规格时0次调用；冻结方法／规格被改时停止；S7 方法／规格／合同变化拒绝旧 S7；只有 S9 方法或只有 S9 规格变化时保持 S7；输入不足／错误消费／Expected 冲突／漏终点拒绝；合法相邻合并、同一步多原消费者不同实际变换、前导零、可选材料省略和合法空消费者接受；旧失败的输入／输出／check 被改拒绝；没有处置的重复接续保持累计预算而不继续调用。

## 十对象固定版本

每行绑定同一目录下实际读取的 SKILL.md 和 references/io-spec.md；application-engineer 三模式独立评审，但共用同一方法／规格字节。路径均从仓库根开始；hash 是实际字节 SHA-256，不是自报版本号。

| 方法目录（workflows/agent-to-recipe/skills/ 下） | SKILL.md SHA-256 | io-spec.md SHA-256 |
| --- | --- | --- |
| `automation-plan` | `9e274fff7f496fef05035e3be1a6dc6fbf56561b5d42e32aca2acd05cab237d8` | `9c61dcc09c7b9ed435e9e0b0a0c0df6ce91cca5fd2ab67a71586c4847f863560` |
| `application-engineer` | `1c7627669b23caa60497fc1cebd5f73f52ccc38135952cd31e4ab9adcdf59e2e` | `07cac5fd02b548bcad2ea717226a9354d590b71d9a1cc204e071d0b02c4ba23f` |
| `task-demonstrate` | `fa41f980426691e499cdaf0f2703322506c6e67aaef4156d3ef62e47125c0ad5` | `1b405f9debc25404465407d95d518c494bd9525e5c3b30a5347a6fd2d10d0b16` |
| `trace-distill` | `d34458d7912a6aafeea822ce85b9a7a8ce49d659c696202b91af11bbda2948c9` | `7c496021a943a721440191dc1e06ae238c3cd49c7fd6d8c13acd17e47a3de8ff` |
| `procedure-synthesize` | `ff36c0303c4f2440dbbb8dbbd5ff8a8d034e2017b4291666f462c9358fc7d36d` | `98edaf36ab476c232f4ebe7dcbb3d43dec02168b9490ff1eb68867135783842f` |
| `recipe-build` | `6c7014c6c98456e1e94cf4951e1de96f2a1d2dc26527cf7ec3ada6753be85717` | `30f656137aaa5ca9672fb0e370f80ecda10e23a4b825657ea1d2a4e13a801709` |
| `code-rebuild` | `5170bae42879474f8f53cca43ba8c084b9424d5180b1888f37d3f2b5881511fe` | `30a66fa2a85c229e714b3bc7c79d74da1ba7b34cb1a6b73db6406359c4c8c9ef` |
| `recipe-qualify` | `f59da7241be0db20b27c35ded394d9ee18ba1d86bb69cfc2c289a3afe6da0c93` | `e5ba6b6eac7605e783193acf114898cc96c2dade56bd7e7d51b120e8ddd6eb8a` |

| 必要公共依据／实际工具 | SHA-256 |
| --- | --- |
| `AGENTS.md` | `9b1eeeaafa372d02c4c28ed52b104cf1f1d576c529e80f56a0fdb4d72d20c504` |
| `docs/frameworks/agent-to-recipe-skill-contract.md` | `c95b03508e5fdbd918ce4ed97eb69f2741e50f015d0939ba933b95a14d01f5bf` |
| `workflows/agent-to-recipe/WORKFLOW.md` | `8664013cf56da94848dc2b3acb790b6b11244482ee90a4381b06e14eca7352cd` |
| `workflows/agent-to-recipe/design/validation-plan.md` | `23479dfe0a628e64eeaf76c427b8b86715060f8d2557df542fd2d07827b529df` |
| `workflows/agent-to-recipe/scripts/check-artifact-chain.js` | `c5212c93e1c267a7fa3bffa8b343f07363a6331b73394a9d2d0c023cc3992e11` |
| `tests/workflows/tools/adjacent-producer-eval.js` | `6219b76da59bbb0036a8716aebed9ce6e1fdc2e954b5555597e26f3031e28800` |
| `tests/workflows/tools/input-sufficiency/check.js` | `509e59de58b4bf629a907c448567ba82cc12ebb378635dc1b133b2477290000c` |
| `tests/workflows/tools/input-sufficiency/probe.cjs` | `2e9e58b368f5c90d6724743772757cf0ce1565a2a176682875af69b4cbbfcffb` |
| `tests/workflows/artifact-input-sufficiency.test.js` | `b4f494f6bf260c6f16e0c02ea51c74814c3e3491d91dc0bed8767d7902b4bf81` |
| `tests/workflows/artifact-method-packages.test.js` | `5447295ae829409cd4081501f2ac3bb80f8ca5010a361a6d7db69611c931726b` |
| `workflows/agent-to-recipe/skills/application-engineer/scripts/review.py` | `f2768eb88da40e368a522c1cb6a976777f3cc69050437425e83a784dfa6894e1` |

## 十个方法对象的五因素汇总（逐项分档求和，不作跨对象或跨层平均放行）

A需求与语义、B职责与独立性、C成果与接续、D验证与修复、E复杂度与成本。表内为得分／原分母；每因素应单独换算百分比，不用总分覆盖短板。全部对象仍未达到本请求的逐因素95。下节列全200项证据与扣分。

| 对象 | A /25 | B /20 | C /20 | D /20 | E /15 | 合计 /100 | 逐因素95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| automation-plan | 25 | 20 | 14 | 8 | 7 | 74 | 未达标 |
| application-engineer／discover | 25 | 20 | 17 | 14 | 7 | 83 | 未达标 |
| application-engineer／harden | 25 | 20 | 14 | 8 | 7 | 74 | 未达标 |
| application-engineer／repair | 25 | 20 | 17 | 14 | 7 | 83 | 未达标 |
| task-demonstrate | 25 | 20 | 14 | 8 | 7 | 74 | 未达标 |
| trace-distill | 25 | 20 | 20 | 17 | 10 | 92 | 未达标 |
| procedure-synthesize | 25 | 20 | 20 | 17 | 10 | 92 | 未达标 |
| recipe-build | 25 | 20 | 14 | 8 | 7 | 74 | 未达标 |
| code-rebuild | 25 | 20 | 17 | 11 | 7 | 80 | 未达标 |
| recipe-qualify | 25 | 20 | 17 | 11 | 7 | 80 | 未达标 |

## 逐对象、逐判据复核

下表 A/B 的5分只表示方法设计清楚且与合同一致，不表示模型执行正确；运行层仍见末节。C/D 的局部工具覆盖不能代替全业务消费。E2没有实际收益证据统一0，不因写有优先复用而打满分。

### 1. automation-plan

范围：S1 首次规划与修订。固定版本：上表 `automation-plan` 的方法＋规格；同一 Agent 自审／复核。

| 判据 | 分数 /5 | 依据、覆盖与扣分原因 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 用户原话到目标、授权、成功标准，不以 Skill 清单替代业务计划 |
| A2 来源和未知分开 | 5 | 事实／解释／Expected／Unknown 分离 |
| A3 任务覆盖完整 | 5 | create／revise／已有资产进入及交接均有方法 |
| A4 真实数据关系成立 | 5 | 运行值不作默认值；单位、精度、前导零政策要求明确（设计） |
| A5 成功／失败判据清楚 | 5 | 成功、失败、未知、补决定与停止条件分开 |
| B1 边界及单独入口明确 | 5 | 只负责合同和计划，不代替示范或代码 |
| B2 必要前提齐备 | 5 | 首次不要求已有合同；修订才需旧版和具体变更 |
| B3 可选路由正确 | 5 | 复用、修订、S2 探测按问题选择，不新增动作权限 |
| B4 没有职责重叠或循环依赖 | 5 | 不要求未来过程、候选或资格；责任没有循环 |
| C1 产物可消费 | 2 | io-spec 有 S2／示范／S9／S12 消费矩阵；未运行 S1 实际生产交接 |
| C2 版本与来源一致 | 5 | 共享合同的 inputRefs／producerVersion／revision；N 检查引用有效 |
| C3 计划／实际／关键步骤／过程分别可接续 | 2 | 修订影响与 planDelta 明确；没有本次计划修订的下游实用记录 |
| C4 证据生命周期明确 | 5 | 共享合同规定原失败保留、临时日志与正式结论分开 |
| D1 正常场景有相应层级证据 | 2 | N 验证方法配套；T 有合同消费者，未验证原话到计划生产 |
| D2 必要变化和拒绝已验证 | 2 | T 验证合同／引用拒绝；规划授权／歧义样例仍为练习 |
| D3 失败返回正确 | 2 | 方法区分协调者缺包／S1 缺决定；实际模型路由未测 |
| D4 修改后重新验证实际依赖成果与候选 | 2 | T 重检版本关系；未跑 S1 产物变更到实际下游 |
| E1 工程量符合用途和风险 | 5 | 只补现有合同／计划，不增加引擎或强制全应用认识 |
| E2 API 复用与封装有收益 | 0 | 没有本轮 API 复用收益或封装前后成本证据，0 分 |
| E3 操作计划与预算、结束条件有效并减少无效执行 | 2 | 计划规定有界探测和终止；尚无本阶段无效执行减少实测 |

修订与重验：方法和规格有效内容保持，仅参与本轮导航／合同／适用程序复核。 N/T/S 全量220通过；P仅在应用工程相关程序范围26通过、1跳过，不外推到本模式全部作业。
关键缺陷／缺口结论：未发现需要重新设计本方法的明确矛盾；但不能证明本方法实际生产、正式交接和全部失败修复已可用。 原请求没有整体放行，不能将证据缺口解释成“无关键缺陷认证”。

### 2. application-engineer／discover

范围：S2 最小应用认识。固定版本：上表 `application-engineer` 的方法＋规格；同一 Agent 自审／复核。

| 判据 | 分数 /5 | 依据、覆盖与扣分原因 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 近期目标只形成最小认识，不偷换为完整应用建模 |
| A2 来源和未知分开 | 5 | 观察／解释／claimSources／Unknown 明确区分 |
| A3 任务覆盖完整 | 5 | 目标、父区、入口、结果、重名及未知的必要依赖齐全 |
| A4 真实数据关系成立 | 5 | 坐标与目标关系的来源要求明确；P 检查范围及映射 |
| A5 成功／失败判据清楚 | 5 | 认识通过不等于定位／操作通过 |
| B1 边界及单独入口明确 | 5 | 单一入口的 discover 模式职责明确 |
| B2 必要前提齐备 | 5 | 合同、近期目标和获准材料可开始，不需完整过程或旧 Profile |
| B3 可选路由正确 | 5 | 有效旧 Profile 复核复用；需要新观察另核授权 |
| B4 没有职责重叠或循环依赖 | 5 | 不强制先 harden／repair，也不负责 S7 取舍 |
| C1 产物可消费 | 5 | P 真实执行 Profile 整理、检查和同源视图消费者（合成资料） |
| C2 版本与来源一致 | 5 | P 同版视图、冻结输出确定性与错 hash 拒绝 |
| C3 计划／实际／关键步骤／过程分别可接续 | 2 | 仅 Profile 到工具消费者接续；未验证模型认识到实际示范 |
| C4 证据生命周期明确 | 5 | 旧版保留、脱敏和产物留存按共享合同与 P 修订测试 |
| D1 正常场景有相应层级证据 | 2 | P 的输入是合成数据；未运行本次模型提取 |
| D2 必要变化和拒绝已验证 | 5 | P 测几何、裁剪、Unicode、缺目标、越界及拒绝 |
| D3 失败返回正确 | 2 | 方法来源矩阵清楚；P 覆盖结构错误，业务归因仍未测 |
| D4 修改后重新验证实际依赖成果与候选 | 5 | P 重新生成视图并标记传递影响；只覆盖该工具依赖 |
| E1 工程量符合用途和风险 | 5 | 最小范围和已有资料复用，无新建模平台 |
| E2 API 复用与封装有收益 | 0 | 没有留出场景中实际规则复用收益数据，0 分 |
| E3 操作计划与预算、结束条件有效并减少无效执行 | 2 | 方法有预算与结束要求；未量测发现调用与无效认识减少 |

修订与重验：方法和规格有效内容保持，仅参与本轮导航／合同／适用程序复核。 N/T/S 全量220通过；P仅在应用工程相关程序范围26通过、1跳过，不外推到本模式全部作业。
关键缺陷／缺口结论：未发现需要重新设计本方法的明确矛盾；但不能证明本方法实际生产、正式交接和全部失败修复已可用。 原请求没有整体放行，不能将证据缺口解释成“无关键缺陷认证”。

### 3. application-engineer／harden

范围：S10 操作规则补强。固定版本：上表 `application-engineer` 的方法＋规格；同一 Agent 自审／复核。

| 判据 | 分数 /5 | 依据、覆盖与扣分原因 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 仅补已确认过程的工程缺口，不改业务语义 |
| A2 来源和未知分开 | 5 | 实际选型／契约／not-run 与验证 pass 分离 |
| A3 任务覆盖完整 | 5 | 定位、读值、等待、动作、停止、恢复及失效条件覆盖 |
| A4 真实数据关系成立 | 5 | 实际值类型、消费者及目标关系不能由临时代码猜测 |
| A5 成功／失败判据清楚 | 5 | 关键规则未验证不正常发布候选；T 拒绝 METHOD_NOT_VALIDATED |
| B1 边界及单独入口明确 | 5 | 同一入口独立 harden，非第二套应用方法 |
| B2 必要前提齐备 | 5 | 需过程与具体缺口／契约；不需要未来候选或资格 |
| B3 可选路由正确 | 5 | 够用先复核规则，不强制重新 discover |
| B4 没有职责重叠或循环依赖 | 5 | 不拥有业务参数化和 S7 原动作取舍 |
| C1 产物可消费 | 2 | 规则消费规格齐全，T 有静态边界；未完成本轮规则到 JS 实用 |
| C2 版本与来源一致 | 5 | 共享 Profile／helper／记录先冻结后引用，避免自引用 hash 环 |
| C3 计划／实际／关键步骤／过程分别可接续 | 2 | 只证明 pendingEngineering 到候选拒绝，未完成真实补强接续 |
| C4 证据生命周期明确 | 5 | 原验证范围和失败保留，未测能力不改标 pass |
| D1 正常场景有相应层级证据 | 2 | T 验证有限规则消费形状，未实际按模式补强 |
| D2 必要变化和拒绝已验证 | 2 | T 验证 not-run／partial／fail 拒绝，未测操作规则变化集合 |
| D3 失败返回正确 | 2 | 来源矩阵有责任；缺少本模式的实际定向补强／误归因测试 |
| D4 修改后重新验证实际依赖成果与候选 | 2 | T 检查候选依赖，未有新规则引起候选重验的真实消费 |
| E1 工程量符合用途和风险 | 5 | 只补必要工程规则；不强制新 helper／全应用类 |
| E2 API 复用与封装有收益 | 0 | 没有本轮 API 或规则复用收益实证，0 分 |
| E3 操作计划与预算、结束条件有效并减少无效执行 | 2 | 有限等待与未知停止有合同；尚无本模式效果与成本数据 |

修订与重验：方法和规格有效内容保持，仅参与本轮导航／合同／适用程序复核。 N/T/S 全量220通过；P仅在应用工程相关程序范围26通过、1跳过，不外推到本模式全部作业。
关键缺陷／缺口结论：未发现需要重新设计本方法的明确矛盾；但不能证明本方法实际生产、正式交接和全部失败修复已可用。 原请求没有整体放行，不能将证据缺口解释成“无关键缺陷认证”。

### 4. application-engineer／repair

范围：S10 定向规则维修。固定版本：上表 `application-engineer` 的方法＋规格；同一 Agent 自审／复核。

| 判据 | 分数 /5 | 依据、覆盖与扣分原因 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 只修具体失效规则，保留有效部分 |
| A2 来源和未知分开 | 5 | 失败、未知效果与推测原因分开 |
| A3 任务覆盖完整 | 5 | 原失败、旧版、依赖、新版与重验链要求齐备 |
| A4 真实数据关系成立 | 5 | 修订保留目标／对象关系；P 测影响传播 |
| A5 成功／失败判据清楚 | 5 | 未知副作用先核对，维修不授予重放权限 |
| B1 边界及单独入口明确 | 5 | repair 独立进入，非 discover 必经后续 |
| B2 必要前提齐备 | 5 | 固定失败、旧规则和允许修复范围，无全套前置要求 |
| B3 可选路由正确 | 5 | 非规则问题定向返回，够用规则原样保留 |
| B4 没有职责重叠或循环依赖 | 5 | S7／S9／代码／验收责任不混入规则维修 |
| C1 产物可消费 | 5 | P 的修订工具实际输出新 Profile 并被渲染／检查消费 |
| C2 版本与来源一致 | 5 | P 拒绝旧 hash／旧 revision，保留原版、patch 输入 |
| C3 计划／实际／关键步骤／过程分别可接续 | 2 | P 覆盖规则影响标记，尚无本次维修到业务继续的实用证据 |
| C4 证据生命周期明确 | 5 | P 证明旧记录不覆盖；共享合同保留原失败与证据 |
| D1 正常场景有相应层级证据 | 2 | P 用程序模拟修改，不是实际模型归因或用户维修 |
| D2 必要变化和拒绝已验证 | 5 | P 测过期修订、Unknown／授权降级和传递影响 |
| D3 失败返回正确 | 2 | 方法有 Agent／Human 路由；P 不证明全部业务原因判断 |
| D4 修改后重新验证实际依赖成果与候选 | 5 | P 新版重检、视图同源及传递影响通过；不外推真实业务 |
| E1 工程量符合用途和风险 | 5 | 局部修订而非全盘建模，不增加修复引擎 |
| E2 API 复用与封装有收益 | 0 | 没有本轮现场复用与维修成本效果，0 分 |
| E3 操作计划与预算、结束条件有效并减少无效执行 | 2 | 工具保护旧输入；尚未量测本模式减少重复操作的业务效果 |

修订与重验：方法和规格有效内容保持，仅参与本轮导航／合同／适用程序复核。 N/T/S 全量220通过；P仅在应用工程相关程序范围26通过、1跳过，不外推到本模式全部作业。
关键缺陷／缺口结论：未发现需要重新设计本方法的明确矛盾；但不能证明本方法实际生产、正式交接和全部失败修复已可用。 原请求没有整体放行，不能将证据缺口解释成“无关键缺陷认证”。

### 5. task-demonstrate

范围：S3—S6 真实执行及同步证据。固定版本：上表 `task-demonstrate` 的方法＋规格；同一 Agent 自审／复核。

| 判据 | 分数 /5 | 依据、覆盖与扣分原因 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 完成获准真实任务，不用 JS 计算替代 UI |
| A2 来源和未知分开 | 5 | 计划／Expected 不变成观察；真实值、解释和未知分开 |
| A3 任务覆盖完整 | 5 | 执行、同步观察、偏差、任务收口和 Dossier 齐全 |
| A4 真实数据关系成立 | 5 | 生产者、实际读值、实际消费者和终点必须取自本次 |
| A5 成功／失败判据清楚 | 5 | 成功须现场结果；未知效果停止，不补造成功 |
| B1 边界及单独入口明确 | 5 | 统一覆盖 S3—S6，不接管 S7／S9 的提炼 |
| B2 必要前提齐备 | 5 | 不要求未来完整 Procedure；合同、计划和获准现场为前提 |
| B3 可选路由正确 | 5 | 已有效示范核验复用；缺历史事实不能用重放伪造 |
| B4 没有职责重叠或循环依赖 | 5 | 与 Recorder／Human 来源并存，不改标人工演示 |
| C1 产物可消费 | 2 | T／S 能消费合成 Dossier；未消费本次新真实示范 |
| C2 版本与来源一致 | 5 | T／S 固定 task／plan／来源引用，错版与冲突被拒绝 |
| C3 计划／实际／关键步骤／过程分别可接续 | 2 | S 验证合成事实到 S7／S9；缺本次实际示范交接 |
| C4 证据生命周期明确 | 5 | 原始观察不覆盖；敏感证据和临时材料生命周期明确 |
| D1 正常场景有相应层级证据 | 2 | S 是合成资料，不是真实桌面示范生产证据 |
| D2 必要变化和拒绝已验证 | 2 | S 拒绝读目标冲突、漏消费者、未知效果；现场变化未测 |
| D3 失败返回正确 | 2 | S 确实退回 task-demonstrate；该责任方补证动作未运行 |
| D4 修改后重新验证实际依赖成果与候选 | 2 | S 重核修订源版本；未执行真实示范修复后的继续 |
| E1 工程量符合用途和风险 | 5 | 复用现有执行／Recorder 能力，不新建录制编译体系 |
| E2 API 复用与封装有收益 | 0 | 无本轮演示生成或 API 复用成本收益数据，0 分 |
| E3 操作计划与预算、结束条件有效并减少无效执行 | 2 | 有动作／观察预算和停止设计；缺现场效果与无效执行实测 |

修订与重验：方法和规格有效内容保持，仅参与本轮导航／合同／适用程序复核。 N/T/S 全量220通过；P仅在应用工程相关程序范围26通过、1跳过，不外推到本模式全部作业。
关键缺陷／缺口结论：未发现需要重新设计本方法的明确矛盾；但不能证明本方法实际生产、正式交接和全部失败修复已可用。 原请求没有整体放行，不能将证据缺口解释成“无关键缺陷认证”。

### 6. trace-distill

范围：S7 必要路径提炼／有限顺序切片。固定版本：上表 `trace-distill` 的方法＋规格；同一 Agent 自审／复核。

| 判据 | 分数 /5 | 依据、覆盖与扣分原因 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 固定事实到必要路径，不参数化或生成代码 |
| A2 来源和未知分开 | 5 | 原始动作不可改，Expected 不作读值；S 注入拒绝 |
| A3 任务覆盖完整 | 5 | retain／merge／omit／recovery／unresolved 及必要值齐全（方法） |
| A4 真实数据关系成立 | 5 | S 验证生产者、完整消费者、前导零与不同实际变换 |
| A5 成功／失败判据清楚 | 5 | 缺来源、矛盾、未知副作用和覆盖不足有停止出口 |
| B1 边界及单独入口明确 | 5 | 仅 S7，S9 不重复拥有动作取舍 |
| B2 必要前提齐备 | 5 | 方法／io-spec／共享合同与获准输入实际交付，S 验证 |
| B3 可选路由正确 | 5 | 可复核复用；S7 自身依赖改动禁止盲用旧产物 |
| B4 没有职责重叠或循环依赖 | 5 | 不要求 S9／S12，N 实际删除未来文件仍通过命令 |
| C1 产物可消费 | 5 | S7 本次实际探针输出被 S9 消费，非预制输出 |
| C2 版本与来源一致 | 5 | S 固定两类方法字节和源版本，篡改拒绝 |
| C3 计划／实际／关键步骤／过程分别可接续 | 5 | S 证明计划／原事实／S7／S9 区分及失败接续（有限切片） |
| C4 证据生命周期明确 | 5 | S 保存原失败与新输出，T／共享合同规定归档边界 |
| D1 正常场景有相应层级证据 | 5 | S 通过完整 evaluateAdjacent 正常输入驱动探针；非模型 |
| D2 必要变化和拒绝已验证 | 5 | S/T 覆盖变参、合法合并、空消费者、改版和拒绝 |
| D3 失败返回正确 | 2 | S 覆盖若干精确责任；Human／一般因果失败路由仍未执行 |
| D4 修改后重新验证实际依赖成果与候选 | 5 | S 重检同版 S7；自身依赖变化返回 S7，不重放业务 |
| E1 工程量符合用途和风险 | 5 | 改现有调用器和测试，无新引擎／状态体系 |
| E2 API 复用与封装有收益 | 0 | 未测业务 API 复用或封装收益，0 分 |
| E3 操作计划与预算、结束条件有效并减少无效执行 | 5 | S9 补证仅增 1 次调用，预算不足与无修复拒绝均 0 新调用 |

修订与重验：io-spec 与方法同时绑定；自身依赖改版拒绝复用；更新接续方法句。 N/T/S 全量220通过；P仅在应用工程相关程序范围26通过、1跳过，不外推到本模式全部作业。
关键缺陷／缺口结论：本轮已复现的规格／重试接线缺陷已修复；仍缺一般语义、双来源真实接续及正式业务交接。 原请求没有整体放行，不能将证据缺口解释成“无关键缺陷认证”。

### 7. procedure-synthesize

范围：S8—S9 业务过程／有限顺序切片。固定版本：上表 `procedure-synthesize` 的方法＋规格；同一 Agent 自审／复核。

| 判据 | 分数 /5 | 依据、覆盖与扣分原因 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 必要步骤到业务过程，不从全轨迹重新做取舍 |
| A2 来源和未知分开 | 5 | 选择记录／契约／实际验证分开；不把文档存在当 pass |
| A3 任务覆盖完整 | 5 | 语义、类型、输入绑定、有效期、应用关系及终点矩阵齐全 |
| A4 真实数据关系成立 | 5 | S 验证同一步两个原消费者的不同实际变换与终点 |
| A5 成功／失败判据清楚 | 5 | 缺交付先补包，缺源回责任；关键业务语义不能留 S11 猜 |
| B1 边界及单独入口明确 | 5 | 只 S8—S9，工程未验证明确交 S10 |
| B2 必要前提齐备 | 5 | 本次 S7 实际输出与明确资料字节，缺规格提前拒绝 |
| B3 可选路由正确 | 5 | S9-only 改版只重做 S9；可选资料省略不误拒 |
| B4 没有职责重叠或循环依赖 | 5 | 无 Dossier／RawTrace 隐式展开，无未来候选／资格依赖 |
| C1 产物可消费 | 5 | S 产出 Procedure 并被检查实际数据关系；T 下游静态消费 |
| C2 版本与来源一致 | 5 | S 固定方法／规格／输入，新版补交与失败字节可核对 |
| C3 计划／实际／关键步骤／过程分别可接续 | 5 | S 原失败到定向补交／修复，S7 不重跑，实际消费新版本 |
| C4 证据生命周期明确 | 5 | S 保存输入／原输出／check／身份／累计预算和待修失败 |
| D1 正常场景有相应层级证据 | 5 | S 真实完整包装调用输入驱动探针；不是模型按 Skill 推理 |
| D2 必要变化和拒绝已验证 | 5 | S 覆盖冲突来源、丢终点、改方法／规格、重复拒绝防洗白 |
| D3 失败返回正确 | 2 | S 有协调者／源责任／S9 路由；Human 与通用语义仍未实测 |
| D4 修改后重新验证实际依赖成果与候选 | 5 | S 补证和修复后仅重做 S9；T 不允许旧候选借新结果晋级 |
| E1 工程量符合用途和风险 | 5 | 复用原 evaluateAdjacent／resumeFrom，不加业务 DSL |
| E2 API 复用与封装有收益 | 0 | 缺本轮实际 API 复用或封装收益，0 分 |
| E3 操作计划与预算、结束条件有效并减少无效执行 | 5 | S 固定 maxCalls／timeout；无新处置不调用，保留已耗预算 |

修订与重验：修正检查命令；补规格字节、S9-only 改版和同版定向修复接线。 N/T/S 全量220通过；P仅在应用工程相关程序范围26通过、1跳过，不外推到本模式全部作业。
关键缺陷／缺口结论：本轮已复现的规格／重试接线缺陷已修复；仍缺一般语义、双来源真实接续及正式业务交接。 原请求没有整体放行，不能将证据缺口解释成“无关键缺陷认证”。

### 8. recipe-build

范围：S11 普通 JS 与候选构建。固定版本：上表 `recipe-build` 的方法＋规格；同一 Agent 自审／复核。

| 判据 | 分数 /5 | 依据、覆盖与扣分原因 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 已确认过程实现成普通 OpenDesk JS，不偷换为 Node 项目 |
| A2 来源和未知分开 | 5 | 方法／历史资格／Expected 不代替当前候选事实 |
| A3 任务覆盖完整 | 5 | 最小结构、数据流、API、停止、检查、冻结与交接覆盖 |
| A4 真实数据关系成立 | 5 | 后续值消费实际生产者返回，禁止历史常量代替 |
| A5 成功／失败判据清楚 | 5 | 关键工程未落实只留草案，不能正常交接；本轮修正歧义 |
| B1 边界及单独入口明确 | 5 | 初次构建与可选 code-rebuild 分开，不授予资格 |
| B2 必要前提齐备 | 5 | 初次不需已有 Candidate／Qualification；需过程和有效规则 |
| B3 可选路由正确 | 5 | 合格代码可不改，缺规则／语义分别返回 |
| B4 没有职责重叠或循环依赖 | 5 | 不重复 S7 取舍或 S9 业务含义，不建立编译引擎 |
| C1 产物可消费 | 2 | T 验证限定 Candidate 消费；未本轮按 Skill 新建候选 |
| C2 版本与来源一致 | 5 | T 固定候选、依赖和 sourceMapping，改字节旧资格无效 |
| C3 计划／实际／关键步骤／过程分别可接续 | 2 | 草案边界有 T 拒绝；真实 S10→S11→S12 交接未执行 |
| C4 证据生命周期明确 | 5 | 原候选／失败保留，源码和运行证据分别归档 |
| D1 正常场景有相应层级证据 | 2 | T 是固定源码检查，不是本次模型构建 |
| D2 必要变化和拒绝已验证 | 2 | T 拒绝假调用、硬编码和未验证规则；任意 JS 未覆盖 |
| D3 失败返回正确 | 2 | 方法明确规则／语义／实现／测试责任；实际路由未测 |
| D4 修改后重新验证实际依赖成果与候选 | 2 | T 重核 hash／依赖；没有本轮新候选及独立资格执行 |
| E1 工程量符合用途和风险 | 5 | 不为凑成果改合格代码；不增加 helper／应用类 |
| E2 API 复用与封装有收益 | 0 | 没有本轮 API／封装前后收益证据，0 分 |
| E3 操作计划与预算、结束条件有效并减少无效执行 | 2 | 停止和有限恢复有方法；未测新脚本实际成本效果 |

修订与重验：消除关键工程未落实仍能正常候选交接的歧义；T 已有拒绝检查保持。 N/T/S 全量220通过；P仅在应用工程相关程序范围26通过、1跳过，不外推到本模式全部作业。
关键缺陷／缺口结论：未发现需要重新设计本方法的明确矛盾；但不能证明本方法实际生产、正式交接和全部失败修复已可用。 原请求没有整体放行，不能将证据缺口解释成“无关键缺陷认证”。

### 9. code-rebuild

范围：S11 可选代码保留／改进。固定版本：上表 `code-rebuild` 的方法＋规格；同一 Agent 自审／复核。

| 判据 | 分数 /5 | 依据、覆盖与扣分原因 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 有依据改进或原样保留，不为优化扩大范围 |
| A2 来源和未知分开 | 5 | 质量意见与业务资格分开；旧分数不能继承 |
| A3 任务覆盖完整 | 5 | 基线、缺陷、最小修改、回归与新候选要求齐全 |
| A4 真实数据关系成立 | 5 | 保持本次读值流向和输入角色；T 有硬编码反例 |
| A5 成功／失败判据清楚 | 5 | 无收益保留，缺语义／规则先退，不伪造改进成功 |
| B1 边界及单独入口明确 | 5 | 可独立改已有代码，不要求重做示范 |
| B2 必要前提齐备 | 5 | 固定旧代码、需求与权限，未来资格不是前置 |
| B3 可选路由正确 | 5 | 复用／修改／拒绝三出口，强制优化被排除 |
| B4 没有职责重叠或循环依赖 | 5 | 不替代业务过程提炼、应用维修和资格评审 |
| C1 产物可消费 | 5 | T/N 原样候选被检查器实际消费（限定代码形状） |
| C2 版本与来源一致 | 5 | T 固定原代码及依赖字节，新版不借旧 hash |
| C3 计划／实际／关键步骤／过程分别可接续 | 2 | 未本轮执行代码修订到正式资格接续 |
| C4 证据生命周期明确 | 5 | 原始代码、意见、失败及候选版本保留 |
| D1 正常场景有相应层级证据 | 2 | T 为源码静态检查，不是本次模型改进能力 |
| D2 必要变化和拒绝已验证 | 5 | T 覆盖常量替代、注释假调用和错版本；不外推任意 JS |
| D3 失败返回正确 | 2 | 方法返回分责明确，未实测模型诊断归因 |
| D4 修改后重新验证实际依赖成果与候选 | 2 | T 验证限定依赖，缺本轮修改候选后的独立业务重验 |
| E1 工程量符合用途和风险 | 5 | 允许零修改，本轮没有改业务代码凑成果 |
| E2 API 复用与封装有收益 | 0 | 没有本轮 API 复用／封装收益实测，0 分 |
| E3 操作计划与预算、结束条件有效并减少无效执行 | 2 | 方法预算与停止明确；缺本次改进前后执行成本数据 |

修订与重验：方法和规格有效内容保持，仅参与本轮导航／合同／适用程序复核。 N/T/S 全量220通过；P仅在应用工程相关程序范围26通过、1跳过，不外推到本模式全部作业。
关键缺陷／缺口结论：未发现需要重新设计本方法的明确矛盾；但不能证明本方法实际生产、正式交接和全部失败修复已可用。 原请求没有整体放行，不能将证据缺口解释成“无关键缺陷认证”。

### 10. recipe-qualify

范围：S12 独立资格与修复请求。固定版本：上表 `recipe-qualify` 的方法＋规格；同一 Agent 自审／复核。

| 判据 | 分数 /5 | 依据、覆盖与扣分原因 |
| --- | ---: | --- |
| A1 目标未偷换 | 5 | 固定候选对预定标准独立核验，不改标准取分 |
| A2 来源和未知分开 | 5 | Expected 与实际观察分离；未运行不写 pass |
| A3 任务覆盖完整 | 5 | 候选身份、请求范围、证据、失败和修复出口齐全 |
| A4 真实数据关系成立 | 5 | 取数链必须实际成立，最终数值正确不能单独放行 |
| A5 成功／失败判据清楚 | 5 | not-run／blocked／fail／pass 分开，关键条件不平均 |
| B1 边界及单独入口明确 | 5 | 验证者不替代生成者或自动改候选 |
| B2 必要前提齐备 | 5 | 固定候选及预定标准，不要求未来资格记录 |
| B3 可选路由正确 | 5 | 按来源定向修复，新候选重新资格；无权自动重放 |
| B4 没有职责重叠或循环依赖 | 5 | 不能回改原示范、业务含义或原请求范围 |
| C1 产物可消费 | 5 | T 实际读取资格声明、候选和证据绑定（非真实资格） |
| C2 版本与来源一致 | 5 | T 拒绝候选 hash／revision 不一致及过期资格 |
| C3 计划／实际／关键步骤／过程分别可接续 | 2 | T 覆盖资格引用；正式修复请求到再次业务资格未执行 |
| C4 证据生命周期明确 | 5 | 原失败、requested 未运行与原证据保留 |
| D1 正常场景有相应层级证据 | 2 | T 是资格消费检查，不是本轮真实候选独立验收 |
| D2 必要变化和拒绝已验证 | 5 | T 错期望、部分 requested 假 PASS、旧资格拒绝 |
| D3 失败返回正确 | 2 | 方法归因矩阵完整；本次真实业务失败路由未实测 |
| D4 修改后重新验证实际依赖成果与候选 | 2 | T 验证依赖和失效；未本轮运行新候选／修复后资格 |
| E1 工程量符合用途和风险 | 5 | 沿用现有标准和门禁，不新增评分规则 |
| E2 API 复用与封装有收益 | 0 | 没有本轮复用 API／验收封装收益数据，0 分 |
| E3 操作计划与预算、结束条件有效并减少无效执行 | 2 | 有限验收预算和停止设计明确；未测实际资格成本效果 |

修订与重验：方法和规格有效内容保持，仅参与本轮导航／合同／适用程序复核。 N/T/S 全量220通过；P仅在应用工程相关程序范围26通过、1跳过，不外推到本模式全部作业。
关键缺陷／缺口结论：未发现需要重新设计本方法的明确矛盾；但不能证明本方法实际生产、正式交接和全部失败修复已可用。 原请求没有整体放行，不能将证据缺口解释成“无关键缺陷认证”。

## 分层结论与未完成范围

| 层 | 本轮实际状态 | 仍未满足的证据 |
| --- | --- | --- |
| 文件、导航、规格和命令 | 八套方法／规格已读；N12项通过，未来文件删除不影响适用检查命令 | 不等于宿主安装或每方法生产可用 |
| 直接检查器与预制输出包装 | T 实际回归通过，保持原拒绝与合法正例 | 有限 Calculator／形状检查，不证明通用 JS 或语义 |
| 完整 evaluateAdjacent／resumeFrom＋输入驱动 Producer | S49项通过，含本轮正常消费、失败修复及新规格版本 | Producer 是确定性探针，不是模型；未发布正式业务 handoff |
| 应用工程确定性工具 | P26通过、1真实材料比较跳过 | 非当前模型提取、视觉人工接受或现场规则复用 |
| 真实模型按固定 Skill／io-spec 生产 | 未运行；当前未建立具备材料隔离、获准模型 adapter、完整调用账目的执行条件 | 八方法／十对象各自的正常、拒绝、变化及修复能力仍未验证，不填运行分数 |
| 真实宿主加载与工具权限 | 未运行 | 需真实宿主可发现并实际消费固定方法和规格，记录加载／权限／预算；现有 Node worker 不代替 |
| 正式 request／handoff 相邻消费 | **确定性实际产物已贯通**：S7→S9→S10 request 精确消费；修复后新 Procedure 可替换旧失败版本 | 真实协调者 progress 更新、真实模型／宿主以及 S1→S12 业务整链仍未运行；不能由本切片宣布完成 |
| Runtime／真实桌面资格 | 本轮未运行这些 Skill 的实际桌面任务 | 当前构建、授权、现场、所选真实 API 与独立结果；其他 CI Runtime 单元通过也不等于该层 |
| 人工接受／实际复用收益 | 未运行／证据不足 | 真实人员批准、留出环境复用、成本效果，无运行分数 |

真实性、授权、安全停止、关键输入充分性与数据关系都是不能被平均抵消的条件。合成资料的内部一致性已在适用切片检查，但来源真实性、模式权限落实和生产环境停止并未因 hash／测试通过自动得到证明。关键工程缺口仍在时，recipe-build 仅可保存受限草案和定向请求，不得发布符合原要求的正常候选。

本轮不是“只剩本地桌面验收”：仍缺非 GUI 的真实模型输入充分性、真实宿主加载、八方法实际模型生产和 S1→S12 正式业务整链。**确定性 S7→S9→S10 的 formal request／handoff 精确消费已完成，不再把它列作未接线。** 下一最小作业是在具备隔离、权限与预算记录的实际宿主中，用同一固定包完成一次真实模型 S7→S9 正常生产＋一次定向失败修复；继续沿现有正式 request／handoff 消费并由协调者更新 progress，保留全部失败及预算，然后按各对象缺口继续，而不是重新设计主链或重跑有效示范。

本记录只在实际文件摘要和可复核证据范围内有效。执行副本测试、Git blob 创建、commit 创建、master 更新、远端回读、远端 CI 是不同事实；仅有 blob 或候选不算交付。后续提交与远端回读须核对本文版本表，结果由真实 GitHub commit／tree／CI 记录证明，不预填成功。

## 2026-09-22 续作：重新以“Agent 成功一次 → 普通 JS Recipe”核定 S12

本节是对前述历史评审的增量记录，不重写旧版本已经发生的测试、评分或未完成事实。当前主链仍为 S1—S12，八项专业职责均已有正式方法包；本轮没有新增 S13、Workflow Engine、IR、Compiler、Replay Runtime 或第九个 Skill。

### 本轮发现并修复的真实问题

1. `design/task-decomposition.md` 仍残留“仅 application-engineer 有正式方法文件”，`design/chain-design.md` 仍残留“五个现有方法”的旧描述；这与当前八个方法包事实矛盾，已纠正。
2. 工作流此前虽有阶段路由，但没有把“阶段完成”“必须硬停止”“正常消费者”和“输入变化后的局部 needs-revalidation”集中表达。`WORKFLOW.md` 与共享合同现已明确：失败从第一个真实责任点继续，旧事实保留，不因一个下游变化从 S1 全量重跑。
3. S12 checker 过去只核对 `qualificationScope.requested/exercised/qualified` 三组声明，无法证明 scope 真正被任何实际 `scenarios[]` 覆盖，因此存在“数组里写成 qualified、场景却没有验证该范围”的假放行空间。
4. Candidate 与 Qualification 对 TaskContract 的 content-bound 绑定此前在限定 checker 中不够强；当前正常链已要求 Candidate、Qualification 都绑定同一固定合同。
5. “一次 Fresh Run”“可重复运行”“参数化复用”“后续无需 Agent 逐步驱动桌面”此前容易被混成一个结论；现已在 `recipe-qualify` 方法、io-spec、共享合同和 validation-plan 中拆开。

### 当前 S12 确定性合同

当前限定消费链要求：

- Candidate 和 Qualification 都绑定精确 TaskContract；
- `qualificationScope.lineage` 明确本次是 reference、continuation 还是 new-generation；
- requested／exercised／qualified／excluded 内部无重复，qualified 不可扩大到 requested 之外；
- 每个资格场景具有唯一 id、非空 `scopeRefs`、合法 verdict 和 evidence；
- 每个 qualified scope 至少被一个 `verdict=pass` 的实际场景显式覆盖；
- requested 中的 fail／not-run／blocked 不能移动到 excluded 或仅靠字符串声明取得 pass；
- checker 继续只读，不执行候选，不授予 live qualification。

进一步的 live 声明保持更高门槛：

- 一次 Fresh Run 只证明一次成功；
- 声称“可重复运行”时，相关 scope 至少两次彼此独立的 Fresh Run；
- 声称“参数化可复用”时，至少一组不同于示范值的合法变参；
- Candidate 含 LLM／Agent 时，只允许预声明、有界、结构化校验的语义判断点；若 Agent 仍按屏幕逐步决定每次点击，不能把该范围称为普通 Recipe 已独立运行。

### 回归证据

远端 HEAD：`939f22e93513d689a33c710346540ccfac70c828`。

GitHub Actions `API docs contract` run `35734362176` 中，`Agent-to-Recipe capability chain` job `106767668897` 为 **success**：

- `Validate workflow and golden Recipe syntax`：PASS；
- `Test handoff and artifact-chain relationships`：PASS，Node TAP **232 tests / 232 pass / 0 fail**；
- `Test Calculator display resolver data path`：PASS。

本次新增负例覆盖：缺 Candidate／Qualification 合同绑定、qualified scope 没有 passing scenario、scenario 声称未 exercised scope、qualified 越过 requested、缺 qualification lineage。既有 `PARTIAL_QUALIFICATION` 错误分类保持兼容，没有为新规则破坏原 failure taxonomy。

同一 workflow 中的 `Layered Agent API reading` 仍有仓库既有失败；在本轮前的 HEAD `a5e8f037...` 已出现相同类别失败，因此不把该无关 job 记为本轮 Agent-to-Recipe 回归。整条 GitHub workflow 的颜色不能替代上述专项 job 结论。

### 仍未被本轮证明

- 没有运行新的真实模型按八个 Skill 生产工件；
- 没有运行新的完整 S1→S12 真实桌面链；
- 232/232 是 validator／fixture／合同消费证据，不是 Calculator live qualification；
- 没有新增两次 Fresh Run 的重复性实证、不同业务参数的 live 变参实证，或一般任务的“无 Agent 逐步桌面驱动”运行证据；
- 宿主自动发现／隔离加载八个方法、真实权限和预算执行仍需单独证明。

因此当前不新增 Skill。下一批最高价值工作应优先把 `recipe-qualify` 的上述 live 声明落到一个受控真实 Candidate（优先复用已有 Calculator 资产，不从零重做），再把失败定向返回到现有责任链；在这一步完成前，继续增加评分表、Skill 数量或抽象工作流层不会提高核心业务闭环的可信度。
