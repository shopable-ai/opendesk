---
title: "Agent-to-Recipe｜工作流导航与应用工程入口"
description: "Agent-to-Recipe 的手工协调执行规程、交接完整性检查、设计导航及运行边界。"
order: 10
---

# Agent-to-Recipe｜工作流导航与应用工程入口

本文件负责整体工作流导航、手工协调执行规程和当前已存在的方法入口，不是自动调度程序。当前八项专业职责均已有正式方法入口：[automation-plan](skills/automation-plan/SKILL.md)、[application-engineer](skills/application-engineer/SKILL.md)、[task-demonstrate](skills/task-demonstrate/SKILL.md)、[trace-distill](skills/trace-distill/SKILL.md)、[procedure-synthesize](skills/procedure-synthesize/SKILL.md)、[recipe-build](skills/recipe-build/SKILL.md)、[code-rebuild](skills/code-rebuild/SKILL.md) 和 [recipe-qualify](skills/recipe-qualify/SKILL.md)，可由当前 Agent 显式读取使用；文件、辅助程序、宿主加载、独立上下文评测和真实业务资格分别判断。本文不复制专业正文，也不自动授予桌面权限。


## 先看这里：S1—S12 一页主框架

Agent-to-Recipe 的核心目标不是“把桌面操作记录下来”，而是把一次真实完成的任务，逐步转成**有来源、有数据依赖、可复用、可生成普通 JavaScript、并能独立验收**的自动化 Recipe。

主链只保留下面八组阶段；后面的 handoff、validator、API 阅读和测试说明都服务于这条主链，不应反过来淹没它。

开发时：S1 合同／计划 → S2 应用认识 → S3—S6 真实示范／留证 → S7 必要步骤 → S8—S9 业务过程／数据关系 → S10 补强或复用规则 → S11 普通 JS／候选 → S12 独立资格／交付。业务运行时消费已交付的普通 JS，不重新走十二阶段；循环与失败回流见交接审阅地图和完整任务树。

| 阶段 | 这一阶段解决什么 | 主要输入 | 主要输出 | 怎么判断做对；失败回哪里 |
| --- | --- | --- | --- | --- |
| **S1｜明确任务与制定计划** `automation-plan` | 把用户真正要完成的业务任务、限制、授权和成功标准说清楚，并形成可执行计划 | 用户原始要求、已有材料、业务输入、授权、限制 | **TaskContract + WorkPlan** | 要求不能遗漏或被改写；计划不能越权；会推翻后续路线的高影响 Unknown 要尽早暴露。目标／授权／计划错误回 S1，不改写用户原始来源 |
| **S2｜认识应用与核查关键可行性** `application-engineer / discover` | 只认识“下一步安全推进所必需”的应用、窗口、目标、读取和前提，不从零研究整个软件 | TaskContract、当前 WorkPlan、可复用旧资料、必要现场观察 | **最小 AppProfile**，或对仍有效旧版本的精确引用 | 后续必须操作和读取的对象要有依据；“认识界面”不等于“已允许点击”。应用资料不足回应用工程；路线不可行或授权冲突回 S1 |
| **S3—S6｜真实示范、逐步验证与同步留证** `task-demonstrate` | 在真实任务中执行、观察、验证，保存“实际发生了什么”，而不是只保存预期 | 固定 TaskContract、实际生效的 WorkPlan、AppProfile、获准业务输入 | **DemonstrationDossier + Raw Trace / Evidence** | 必须区分 planned / actual，保存真实动作、观察、业务值、消费者、验证和副作用状态。缺历史事实只能定向补采，不能事后编造 |
| **S7｜提炼必要步骤** `trace-distill` | 从真实轨迹中去掉探索噪声，但保留真正必要的准备、动作、读取、验证和数据依赖 | 固定合同／计划、Dossier、Raw Trace、必要 Evidence | **DistilledSteps** | 每个原动作都要有 retain / merge / omit / recovery / unresolved 处置及依据；真实消费者关系不能丢。取舍错回 S7，事实不足回 S3—S6 |
| **S8—S9｜形成业务过程与数据关系** `procedure-synthesize` | 把必要步骤变成稳定 Business Step，并明确参数、运行时值、生产者→消费者和支持范围 | 固定 DistilledSteps、TaskContract／WorkPlan、必要 AppProfile、有来源的能力选择记录及其实际验证状态 | **SemanticProcedure** | 每步明确目的、来源、输入、前提、执行意图、观察、输出、后置、验证、停止条件、消费者；用户输入 / 配置 / Secret / 运行时值 / Expected / Unknown 必须分开。业务解释错回 S8—S9，动作取舍错回 S7，缺事实回 S3—S6 |
| **S10｜补强或复用应用操作规则** `application-engineer / harden / repair` | 只补 Procedure 真正需要的定位、读取、等待、动作和失效规则；已有规则可直接复用 | 已确认 SemanticProcedure、旧 AppProfile、具体工程缺口 | **有来源和适用范围的 AppProfile / locator / stability / helper 增量** | 操作必须能落实，失效条件和安全停止必须明确；无缺口不重新研究应用。应用规则问题回 S10；真正 Runtime 缺口单独处理，不通过改业务目标掩盖 |
| **S11｜生成代码与按需优化** `recipe-build`；可选 `code-rebuild` | 把已确认 Procedure 和应用规则实现成普通 OpenDesk JavaScript；只有有收益时才优化 | 固定 Procedure、AppProfile／helper、正式 API contract；优化时再加精确代码基线和允许变更范围 | **Recipe.js + CandidateManifest** | 代码必须忠实实现业务语义、真实数据关系和停止边界；固定入口、源码、依赖、上游版本与步骤映射。实现错回 S11；语义错回 S8—S9；应用规则错回 S10 |
| **S12｜独立资格验收、评审与最终结论** `recipe-qualify` | 固定同一个 Candidate 后，用预先确定的范围和场景验证真实行为，再给最终结论 | 精确冻结 Candidate、TaskContract、验收范围、场景、环境、测试授权 | **QualificationRecord + Recipe Review / Run Summary** | 必须运行同一候选，记录实际命令、环境、观察、证据及 pass / fail / not-run / blocked；验收不能改候选或降低标准。失败按缺陷责任返回对应上游 |

### 这条主链的四条总规则

1. **阶段 ≠ Skill ≠ 文件 ≠ Agent。** S2 与 S10 可以复用同一个 `application-engineer`；S11 可以包含生成和可选代码改进；一个 Agent 也可以连续完成多个阶段。
2. **能力发现不是额外的 S13。** 当某个业务步骤需要框架能力时，在 S2、S3—S6 或 S10 的真实上下文中完成：**能力需求 → Capability Discovery → Method Selection → Canonical Contract Reading → Runtime Validation**，然后把最终决定收敛进 S8—S9 的 `capabilityDecisions`，由 S11 的 Candidate 继续绑定。
3. **事实、语义、代码、资格不能互相替代。** Raw Trace 记录实际发生；DistilledSteps 决定哪些动作必要；SemanticProcedure 定义业务过程和数据关系；Recipe 是实现；Qualification 才说明某个固定候选在什么范围真正通过。
4. **已有成果优先接续，不从零重跑。** 先核对已有 TaskContract、AppProfile、Dossier、Procedure、Candidate、Qualification 的版本和证据，只从第一个真实缺口继续。

如果只想理解工作流，先读本节；如果要看“每个交接怎样拒绝错误结果”，再读 [交接审阅地图](design/acceptance-map.md)；如果要看完整子任务和恢复循环，再读 [task-decomposition.md](design/task-decomposition.md)；字段和版本规则按需读[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)。


## 当前 Skill 划分与下游输入充分性

2026-09-22 当前 HEAD 已为 **8 个 SKILL.md、8 项专业职责、8 组交接**。9 月 20 日的五方法输入充分性审查仍作为其当时基线证据保留，但 `automation-plan`、`task-demonstrate`、`recipe-build` 已在 9 月 21 日补成正式方法包及输入输出适用规格；不能继续把“当时没有同名 Skill”当作当前事实。方法版本用仓库提交／方法 hash 核对；业务输入版本仍必须由每次 request 的固定 ref／hash 核对，二者不能混用。

### 职责与输入充分性审查决定

| 阶段／Skill／模式 | 下游必须知道什么 | 实际输入来源及版本 | 应产出 → 正常消费者 | 缺口、失败责任与本轮决定 |
| --- | --- | --- | --- | --- |
| S1／automation-plan | 原始目标、授权、成功标准、数据政策及未知 | 原始用户来源；固定 request／来源；方法包读取共享合同、任务求解方法及实际旧产物 | TaskContract／WorkPlan → 后续各环节 | 正式方法与 io-spec 已落地；规划范围可检查，但宿主自动加载、独立上下文生产和真实业务使用仍分别验证。政策／授权缺口回 S1 |
| S2、S10／application-engineer；discover／harden／repair | 应用身份、关系、规则、证据范围和失效条件 | discover：合同／近期目标／观察；harden：已确认过程／工程缺口；repair：旧规则／失败／范围，均固定版本 | AppProfile／helper／局部验证 → 示范、过程、生成 | 保留三模式。认识、工程验证、业务资格分别判断；应用关系缺口回本职责，不能由 S9 猜 |
| S3—S6／task-demonstrate | 实际动作、读值、消费者、选型记录及副作用 | 固定合同／计划／应用资料＋获准现场；方法包要求同步 Capture、实际观察和 planned／actual 绑定 | Dossier／Raw Trace／Evidence → S7 及获准定向补证 | 正式方法与 io-spec 已落地；缺事实回本职责，新观察不能冒充过去事实。方法存在不代表真实示范或桌面资格已经运行通过 |
| S7／trace-distill | 必要路径、值的含义／类型、读值与实际消费、政策、应用目标 | 固定 Dossier／Trace＋合同政策／Profile／证据；输出保留精确 lineage | 有来源的 DistilledSteps → S9 | **补强运行时值投影和实际消费绑定**。S7 丢信息由 S7 修；来源原本不足回原责任方；顺序切片已做输入驱动验证，模型行为未运行 |
| S8—S9／procedure-synthesize | 业务步骤、值来源、实际转换、有效期／重读、应用关系、有来源的选型 | S7 实际输出＋获准且实际交付的 Profile、读值证据、选择记录／API；不取得全量 Trace | SemanticProcedure／待工程事项 → S10／S11 | **补强收件核对、缺口拒绝和定向重消费**。材料未交付先找协调者，源资料缺失回原记录者，语义映射错误留 S9；未完成工程验证仍可明确交 S10 |
| S11／recipe-build | 完整语义、已落实操作、当前 API、入口和依赖 | 固定 Procedure／Profile／API／helper；方法包明确使用 canonical contract 和真实数据依赖 | 普通 JS／CandidateManifest → 按需 code-rebuild 或 S12 | 正式方法与 io-spec 已落地；实现错误由 S11 修，语义／规则缺口定向返回。方法存在不代表模型生成能力、宿主加载或 Candidate 业务资格已通过 |
| S11／code-rebuild；可选 | 精确代码基线、改进目标、允许变更与旧资格范围 | 固定代码／候选／过程／应用规则／API | 保留结论或新候选／重验范围 → S12 | 保留；不改合格代码，不补造上游语义；改变候选字节不能沿用旧资格 |
| S12／recipe-qualify | 固定候选、预定场景、环境、授权、预算及独立结果 | Candidate／依赖／合同／验收请求／当前环境的固定来源 | QualificationRecord／定向修复 → 交付者或原责任 | 保留；只有实际运行可证明业务资格，本轮未调用真实桌面或模型资格 |

原先缺少同名方法文件的 `automation-plan`、`task-demonstrate`、`recipe-build` 已补齐；现在八项职责都有方法入口。**方法文件齐全只解决“方法可找到、输入输出可读”这一层，不自动证明宿主加载、独立 Producer 行为、真实桌面执行或端到端资格。** 后续评测仍按实际证据逐层记录。

### 本轮打通的最小相邻链

**原始来源 → S7 本次实际生成的值／步骤投影 → S9 收到必要字节 → 来源和语义检查 → 明确交下一责任。**

新的 [输入充分性测试](../../tests/workflows/artifact-input-sufficiency.test.js) 从上游合成工单场景构造输入，不读取标准 DistilledSteps／Procedure。独立 Node 进程只从 stdin 收包，文件读取仅允许探针源码；“读取编号 → 输入查询 → 读取终点”的实际输出进入下游。合法编号变化、字符展开、相邻合并和可选材料省略均可正常接受。

缺选择记录时，S9 保存失败；协调者补交固定来源，或者原来源责任者定向修复。新尝试重新核验同版 S7，只再次消费 S9；不重跑 S7、不重放界面动作、不覆盖原失败。评测写出固定输入、原输出、检查记录、累计调用预算，以及可从冻结资料恢复的 `resume-request.json`。源输入／方法变化、旧文件被篡改或预算耗尽时不复用旧结果。

**这证明的是输入消费探针与确定性接续，不是实际模型 Producer、盲测、宿主完整隔离或业务资格。** 原 [预制输出接线测试](../../tests/workflows/artifact-producer-eval.test.js) 继续保留为回归，不再被当成新切片的输入充分性依据。原 Calculator 检查没有降低断言；新检查器明确限定为顺序 text／digit-string 数据传递，不把其他有效业务强改成该形状。

字段只在[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md#s7--s9-的输入充分性增量2026-09-20)维护；执行协议、预算与覆盖限制见[验证计划](design/validation-plan.md#输入充分性与失败接续切片2026-09-20)；实际测试、失败保存及版本见[本轮验证记录](../../docs/quality/agent-to-recipe-adjacent-review-20260920.md#本轮输入充分性与失败接续2026-09-20)。[交接审阅地图](design/acceptance-map.md)继续用于全链审阅，不新增流程图或第二份 schema。

下一责任是获准评测宿主：以本次固定输入链进行真实 S7／S9 生产和外部语义判定，记录实际隔离、模型、工具和预算；没有该条件时保持 not-run。复杂恢复、多计划版本、通用语义与真实候选资格仍未由当前切片证明。

### 接续复核：来源身份、合法合并与失败历史（2026-09-21）

本段记录的是提交 `ab4775c77c26f98c567b04912f8d36c6f118864d` 当时的接续复核：彼时仍是五个方法文件、三个职责未设同名 Skill。该历史证据继续有效，但**当前 HEAD 已在后续提交中补齐八个方法包**；不能用本段旧状态覆盖当前目录事实。独立生产能力、宿主加载和真实业务资格仍须分别验证。

本次实际修复四类缺口：**S7 原读取／消费的应用身份漏核对；原消费者集合与 S9 步骤声明漏项或冲突；多个消费者合法合并后不同变换被第一项覆盖；接续时只核对 S7 而漏核对直接前次 S9 的失败证据。** 来源错误回原记录者，语义映射错误由 S9 修，历史被改则协调者先核实，不调用下一 Producer；拒绝接续也保留已耗预算。

可理解的正常例子是合成编号 `0040`：一次按字符消费、一次按完整字符串消费，两次原动作合法合并为一个业务步骤，两个实际变换和最后的状态读取都保留。失败例子是 S9 同时把编号标为 runtime 与 Expected：拒绝后只修 S9，重检并复用同版 S7，累计探针调用 2 → 3，不重放界面动作。

原 183 项离线测试重新执行通过；补充反例与合法合并暴露旧实现缺口，修复后的分层结果及固定实例见[本次接续验证记录](../../docs/quality/agent-to-recipe-adjacent-review-20260920.md#接续复核来源身份合法合并与失败历史2026-09-21)。测试是输入消费探针和确定性检查，不是模型 Producer、宿主完整隔离或真实业务资格；对应模型／桌面层仍为 not-run。

## 本轮执行规程：从已有成果继续，而不是重新开始

本节是现有 S1—S12 的**手工协调执行清单**，不是自动调度器或数据格式。默认由当前 Agent 消费真实文件后连续推进；Skill 方法文件并不是同名 CLI 命令，不能虚构 `automation-plan`、`trace-distill`、`recipe-build` 或 `recipe-qualify` 命令。专业方法、字段和完整任务树仍分别以原文件为准。

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

冻结记录中的待办须按其阶段和写入时点解释。例如 S11 的 Candidate／交接备注写着“S12 未运行”，接续时应沿 progress 中的资格引用查找后续 QualificationRecord 和对应 request／handoff，核对它们绑定同一 Candidate／合同 hash 及所需 scope。后续证据完整时保留已经完成的资格；不因旧备注重跑，也不回写冻结文件或把 qualification hash 填回 Candidate。若引用缺失或绑定不一致，记录具体缺口。已完成 Calculator 的实例见[案例接续入口](cases/calculator.md#已完成整链的接续入口)。

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
| S12 | 固定候选与请求验证范围，从干净状态执行真实入口；按 [recipe-qualify](skills/recipe-qualify/SKILL.md) 形成分层结论 | QualificationRecord、Recipe Review、实际命令、环境、结果及证据；分别记录 pass／fail／not-run／blocked，失败定向回流 |

关键交接按同一 S1—S12 解释，不再增加编号：

| 交接 | Owner / Skill 或能力 | 输入 | 可消费输出 | Gate / 下一消费者 |
| --- | --- | --- | --- | --- |
| 任务事实 → 能力需求 | S1 → S2 / application-engineer | TaskContract、WorkPlan、高影响 Unknown | 当前业务步骤需要的窗口／动作／读取／验证能力 | 需求明确且获准；进入 capability discovery |
| 能力需求 → Discovery / Selection / Contract / Validation | S2、S3—S6，必要时 S10 | `docs/api/agent/README.md`、相关 catalog、当前现场 | 原工作包中的轻量选择记录与真实 evidence；失败候选保留 | 选型与契约来源可核对；验证状态如实记录，未验证工程要求交 S10；S8—S9 收敛 |
| 必要路径 → 稳定业务 Procedure | S7 → S8—S9 / trace-distill → procedure-synthesize | DistilledSteps、AppProfile、选择记录 | SemanticProcedure；业务步骤、数据依赖及 `capabilityDecisions` | 每项 Recipe-driving 选择可追到 catalog、候选、canonical contract 和 Runtime validation 的真实状态；语义完整可交 S10，工程就绪再交 S11 |
| Procedure → Locator / Stability | S10 / application-engineer | Procedure、AppProfile、失败／缺口 | 有范围、坐标空间、父区域、容差、重验条件的规则；无坐标方案时也明确其语义定位依据 | 无裸坐标／未知失效条件；S11 消费 |
| Validated Procedure → Recipe | S11 / recipe-build，按需 code-rebuild | Procedure、AppProfile、已选 API contract | 普通 JS + CandidateManifest；`apiRefs` / `sourceMapping.capabilityDecisionRefs` 固定选择链 | Candidate 字节、依赖、入口和来源映射冻结；S12 消费 |
| Recipe → 最终结论 | S12 / recipe-qualify | 冻结 Candidate、请求范围、独立场景 | QualificationRecord + Recipe Review + Run Summary 投影 | 请求范围无 fail/not-run/blocked 才能 pass；交付／定向返修 |

这里的 `capabilityDecisions` 不保存模型私有推理，只保存接续和复核必需的决定事实。目录命中、方法选择、合同阅读和现场验证必须分别成立；例如 API 文档可读但当前 Calculator 中调用失败时，应记录失败并选择其他候选，而不是把“文档存在”当 PASS。
S8—S11 必须保留跨步骤真实数据依赖。例如当前计算器案例的第二次计算只能消费第一次从 UI 实际读取的 `firstResult`，不能用 expected 或 JS 算术替代。helper 可以表达业务语义，但不能隐式清空状态、偷偷补点或改变用户要求的操作方式。

S11 还必须把生产 Recipe 与资格代码分开。一个应用操作在同一流程中重复时，优先形成接收语义参数并返回实际结果的普通函数；点击序列与“清空后计算”必须在名称、输入合同及 Procedure 中明确区别。Calculator 的当前维护示例使用 `clickCalculatorButtons(win, buttons)`，清空和读值由主流程明确调用。不新增应用对象方法层，也不为每次调用复制整段代码。生产文件只保留业务控制流和运行时必须的身份、状态、唯一性、实际读值及未知结果停止门禁；expected、截图、完整事件审计、hash 断言和独立 Oracle 留在测试／QualificationRecord。框架原样动作回执可以作为普通函数返回值，回执仍不等于业务正确。若要求跨 Recipe 文件复用，再单独核对当前 Runtime 已发布的加载与打包合同，不能先发明 `import`／`require`。

精简交付前再检查以下边界，不能仅用行数或文件数判定完成：

- 稳定界面首次输入（含清除）前，预检全部必要 distinct targets 和实际读值通道；资格分离不能删除这项运行门禁。
- CandidateManifest 完整绑定真实 API 正文、Procedure、AppProfile、入口和依赖闭包。先冻结，再记录资格 request，最后执行；事后补录必须标明，不倒填历史时间。
- S12 将准备动作、独立干净状态观察、精确候选运行、独立结果观察分开，并记录同时点的依赖前后检查。自报按钮数组不是实际动作证据；核对框架完成回执、源码数据流及独立 UI 后置，说明各自能证明的范围。
- 新工作包先进入真实续作 WorkPlan/changeLog；已有候选定向修复属于 `continuation-chain`，不能因其上游曾完整新生成而改称本次 `new-generation-chain`。
- 交付七类主产物的实际路径、版本、用途、复用/修订及验证状态。未变的上游固定 hash 引用；维护源码/测试进入所属 `examples/`、`tests/`，冻结快照和运行输出留在 `.runtime/`。一次固定业务中的两次函数调用不自动证明全部参数组合。

上述边界的实际审计与修复见 [Calculator r003 报告](../../docs/quality/agent-to-recipe-calculator-r003.md)。这仍是手工协调清单，不是新增自动调度器或通用 schema validator。

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
node --test tests/workflows/handoff-integrity.test.js tests/workflows/artifact-chain.test.js
```

### 4.1 相邻工件消费检查与方法入口

完整六类工件已存在时，使用 [check-artifact-chain.js](scripts/check-artifact-chain.js) 检查选定的 Dossier／actions → DistilledSteps → Procedure → Candidate → Qualification 边界。它与信封工具共用 [artifact-validation.js](scripts/artifact-validation.js) 的受限读取基础，但增加动作取舍、顺序、实际值生产者／消费者声明、`Capability Discovery → Method Selection → canonical contract → Runtime Validation → Candidate apiRefs/sourceMapping`、候选直接 await／spread 模式及资格声明范围检查。错误按 `boundary` 返回；未读取的边界为 `not-run`，失败资格只能作为诊断资料。

| 当前工作 | 方法输入 → 输出 | 本轮已落地的验证切片 |
| --- | --- | --- |
| S7 | [trace-distill](skills/trace-distill/SKILL.md)：冻结合同／计划、Dossier／Raw Trace → DistilledSteps | 必要读取／准备不误删，重复数字不去重，缺证据／unknown／事后解释被拒绝 |
| S8—S9 | [procedure-synthesize](skills/procedure-synthesize/SKILL.md)：固定 DistilledSteps → 业务步骤、数据依赖与能力选择记录 | 覆盖及顺序、输出与输入关系、禁止第二套 action disposition；短入口/能力目录、唯一选中方法、内容绑定 canonical contract、Runtime validation 与 Candidate 消费关系不断链 |
| S11 可选审查 | [code-rebuild](skills/code-rebuild/SKILL.md)：精确代码及需求／过程／应用规则 → 原样保留评审或新候选 | 读取首值却消费固定样例被拒绝；代码变更不能沿用旧 hash |
| S12 资格 | [recipe-qualify](skills/recipe-qualify/SKILL.md)：冻结 Candidate／标准／场景／环境 → QualificationRecord + Recipe Review | 不改候选或成功标准换 pass；requested 中 fail/not-run/blocked 不可被高分抵消 |

该工具当前只支持 Calculator 形状的 v1 成功路径及直接调用源码模式，既不是通用 schema validator，也不是任意 JS 的控制流证明。它检查选定引用，不递归证明整个依赖闭包，不判断历史真实性、现场、视觉、人类接受或宿主安装。闭包另由候选专用检查核验；实际语义仍需审阅。工具通过不表示相关 Skill 在隔离上下文中的行为评测通过；`recipe-qualify` 文件存在也不等于当前候选已取得新的 live 资格。

可复制的真实只读命令、Frozen Fixture、代码评审及分层结论集中在[工作流质量总览](../../docs/quality/agent-to-recipe-workflow-review-20260919.md)。稳定 fixture 在 `tests/workflows/fixtures/calculator-artifact-chain/`，它明确标为合成测试资料，不是历史示范；临时实例仍写入 `.runtime/tests/workflows/`。S1—S12、G0—G7 不变，最终业务程序仍为普通 JS。

### 5. 结束与恢复必须交付什么

先写实际产物，再发布完整 handoff，最后由唯一协调者核对并更新 progress。产物已存在但 progress 落后时补核状态，不重做业务；只有旧 running／done 标签而缺产物时不得跳过。新尝试、新候选与旧证据分别保留，不能覆盖失败历史。

每次暂停、阻塞或交给新会话时，交付**任务根及当前计划版本、可复用成果引用、本轮变更与受影响范围、实际检查结果、未决项／副作用状态、下一工作包与最小安全动作**。这些内容写回现有 progress／handoff／工作包，不另建一套平行状态文件。

任务结束时还应提供一个**Run Summary 投影**。它优先由现有 progress／handoff／QualificationRecord 和质量报告组织，不成为新的权威状态文件，也不复制全部工件。最小视图显示：任务与当前状态、S1—S12 完成情况、关键输入／输出、最终 capability decisions、已验证 Procedure、locator/stability 策略、最终 Recipe、Recipe Qualification、剩余风险及关键工件链接。任何一项只存在历史证据或未运行，都在摘要中原样标记，不因“汇总”提升成熟度。

网页环境止于能够完成的源文件、离线检查和明确交接；本地再补当前主程序／UI host 的构建与加载证明、真实窗口／业务结果、视觉及平台资格。macOS 通过不外推 Windows 通过；缺设备的项目标未测，不补写通过。需要安装 Skill、统一调度或 Catalog 发布时仍须单独实现与验证，本规程不宣称这些能力已经落地。

### 5.1 出错以后先判断什么，再决定是否继续

这是上述接续规程的操作检查表，责任与字段仍以共享合同第 7—8 节为准，不新增公共失败枚举或自动重试引擎。

| 遇到的问题 | 保留与核查 | 下一最小动作 |
| --- | --- | --- |
| 输入缺失、内容截断、引用不可读 | 哪项下游必需信息缺失、对应版本与允许根 | 向来源责任方定向补证；不靠整段聊天或猜测填齐 |
| 成果违反合同，或检查器不支持合法输入 | 分开记录成果错误与检查覆盖限制，保存实际输出 | 前者修生产方法／成果；后者审查检查规则，不强改业务或降低标准 |
| 动作可能已经发生、回执不完整 | 保存副作用状态、现场观察和最后可信检查点 | 先核对实际效果；只有重放安全且获准时才重试，不能超时就重复输入 |
| 版本变化、旧资格或进度落后 | 核对有效成果和影响范围；不修改冻结历史 | 发布新版本后只重验受影响下游；成果有效时补核进度，不重做业务 |
| 权限／宿主能力缺失、预算耗尽或同错无新证据 | 保留局部成果、原请求未完成范围、责任与解除条件 | 停止相关路径；可独立且安全的工作继续，不承诺强行跑通 |

恢复是否可用，要验证“能检出错误＋能交给正确责任＋修复后能够重新消费＋没有重放未知副作用”，不只统计拒绝用例。跨会话接续至少让下一执行者取得第 5 节列出的实际成果引用、当前失败、剩余预算与授权边界；摘要不能替代原始证据。本次文档补齐不代表已验证宿主恢复、真实桌面或完整 E2E。

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

出口仍是现有合同下的普通 JS Candidate 与独立 QualificationRecord，再由生命周期的显式发布门登记 Capability。任何代码/依赖修复形成新候选，不能热改生产脚本沿用旧资格；`recipe-qualify` 方法文件已实现，但完整 Catalog 发布门、宿主自动加载和跨来源发布适配仍待独立实施；方法文件存在不自动授予发布或业务运行资格。Agent 的 S1—S12、Human 的 H1—H8 与原始来源分别保留，不把来源适配做成第二份 AppProfile 或业务步骤真相。

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
- 当前八个方法入口见“当前 Skill 划分与下游输入充分性”，限定检查与验证范围见第 4.1 节；实际模型提取、留出规则测试、宿主加载、盲上下文及其他桌面场景仍按验证计划分批完成，未运行项如实保留。
