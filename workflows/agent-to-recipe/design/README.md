---
title: "Agent-first Recorder｜设计总纲与文件地图"
description: "Agent-to-Recipe 工作流的有效决定、阅读顺序与实施前核对事项。"
order: 10
---

# Agent-first Recorder｜设计总纲与文件地图

状态：设计基线 v0.5，2026-09-10。本次在既有 application-engineer 上接入 Structured UI Collection Reading；不新增第二个 Collection/VLM Skill，也不表示 `UI.readCollection()`、`UI.collectCollection()`、SemanticVisionProvider 或相关 Runtime 已实现。先读本页，无需拼接历史对话。返回[工作流总入口](../../README.md)。

## 一、当前要建设什么

- 继承[项目背景与本工作流的职责](requirements.md#项目背景与本工作流的职责)：OpenDesk 面向工作与生活中的重复及复杂任务，Agent-to-Recipe 是生产自动化成果的开发链，不是整个产品的范围。
- 从真实任务／人工开发目标／已有自动化资产出发，形成有依据、可验证并可维护的普通 OpenDesk JavaScript 与必要组合能力；存在必要判断时交付明确接入的 JS／Agent 混合流程。可独立使用不等于没有在线依赖，未接入片段不冒充完整程序。
- 已明确、能够验证的步骤交给 JS；必要的理解与动态判断交给 Agent，授权决策保留人工。
- 默认同一个 Agent 按工作流连续作业；专业作业、Skill、工作包、文件和 Agent 不一一对应。内部步骤按需进入，正常先复用，异常定向补证，不制造逐步骤交接负担。
- 普通脚本不以前置建设 Recorder Session、Compiler、可执行 IR、独立 Replay Runtime、LangGraph 或资产平台为条件；明确选择完整 Recorder 专项时仍遵守其独立模型和验证门槛。
- 对 list/table/timeline/grid/cards/tree/virtualized list 等重复 UI，工作流负责发现业务需要、建立/修订应用侧 CollectionProfile、生成/消费代码及资格验证；跨应用 Observation、current-viewport reader、Semantic Vision provider、scroll continuity/merge 的详细技术合同只维护在[Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。
- 近期让交付成果可调用、可配置、可验证、可维护；未来按真实需求考虑多人共享与平台化。延期建设平台不取消资产复用要求，也不允许共享作者的凭据、个人数据或未获准证据。

## 二、只区分三条不同层次的链

- 需求推导链：来源 → 事实／未知 → 业务需求与场景 → 可验证需求基线，回答真正需要什么。
- 自动化开发工作流：取得可信依据 → 解释过程 → 归纳规则 → 形成程序 → 验证与维护，回答怎样生产自动化。
- 业务执行工作流：生成后的程序每次实际完成的业务步骤，计算器例子是首次计算 → 真实读数 → 再次计算 → 读取并打印。
- Capability 是需要具备的业务能力；业务 Function 不等于 JS 函数；Agent Skill 是专业作业；已有 API 和普通函数是实现方式。这些对象不能一一硬配。
- 业务运行按“框架原语 → 应用语义操作 → 组合业务能力 → 完整业务流程”理解粒度，沿用已有框架而不新增 Runtime 层。详细对照见[聊天业务示例](application-operations.md#聊天业务的粒度与组合示例)；它不是第四条开发链。
- Structured Collection 再增加一条职责边界而不增加开发链：Runtime 形成 generic `CollectionItem[]`；App Adapter/Recipe/普通 parser 才映射 `Conversation[]`、`Message[]`、`Order[]` 等业务对象。current viewport 读取与 scroll traversal 分离。
- “向指定联系人发送确定内容”可以复用 JS 组合能力；“根据历史回复”再加入必要读取、Agent 判断与校验。开发 Skill 负责生产这些能力，不要求每个业务操作再生成一个 SKILL.md。

## 三、建设顺序与唯一正文

- [requirements.md](requirements.md)：项目背景与业务目标、来源、事实／未知、业务叙事、开发入口和业务场景、功能和质量需求、范围与基线变更；v0.5 新增 DREQ-25—DREQ-29，冻结 generic collection/business mapping、多源 Observation、Collection/Traversal、VLM 与 mutation/partial completion 边界。
- [task-decomposition.md](task-decomposition.md)：完整保留《Agent-first Recorder｜工作流任务分解树》、五个结果层次、S1—S12、R1—R13 对照和三个循环；Structured Collection 只作为 S1/S2/S8—S12 增量，不新增 S13。
- [chain-design.md](chain-design.md)：将任务节点分配给专业作业，明确输入输出、组合、复用、跳过、失败与中断返回；新增 CollectionProfile → reader/collector → business mapping → qualification 交接及 profile drift/evidence conflict/continuity/mutation/VLM unavailable 路由。
- [application-operations.md](application-operations.md)：界面认识与审阅、模型／程序／人工分工、材料充分性、同源视图、纠错影响，以及原 Layout 到可靠操作的专业方法；v0.5 增加 Collection discovery/Profile authoring 的应用工程职责，算法仍只链接专项架构。
- [code-rebuild.md](code-rebuild.md)：保留代码改进的依据、方法、质量底线和反例；独立按需，不作为 recipe-build 的改名替代。
- [validation-plan.md](validation-plan.md)：行为案例、四层应用工程测试、分批实施及唯一现行评分依据；v0.5 增加 Structured Collection SC-A—SC-P 与 Phase 1—7 测试阶梯，不复制另一套 Gate 或评分。
- [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)：跨工作流唯一技术正文，定义 Observation、CollectionProfile/Item、`readCollection`/`collectCollection` Working Contract、AX/UIA/OCR/Layout/VLM、scroll continuity/merge、virtualization/mutation、privacy/cost 与实施 Phase 1—7。
- [计算器案例](../cases/calculator.md)：长期保留需求代入、十三节点、数据关系、备选方案、设计演变、失败反例及未决问题，不复制成七份 Skill 案例。
- [WORKFLOW.md](../WORKFLOW.md)：保留过渡导航和当前 Skill 入口，并链接 Structured Collection 架构；未实现的整体调度不冒充可运行。
- [application-engineer/SKILL.md](../skills/application-engineer/SKILL.md)：现有唯一应用工程 Skill，增加“认识 Collection → evidence → CollectionProfile → VLM assist → overlay review → deterministic validation → 发布 Profile”入口；没有安装、自动发现或实际执行通过声明。

建设关系：需求及行为案例 → 完整任务树 → 链路／交接／测试设计 → Skill 方法与辅助程序 → 独立和组合验证。行为案例、研究和验证可反向修订上游，不是不可回退的瀑布链。

## 四、当前有效决定

- 先按需求语义拆任务，再分配给人、Agent Skill、普通 JS 或已有 API；不按 Agent 人数、文件数、函数数拆需求。
- 保留 recipe-build 负责生成或登记合格基础代码，拟新增 code-rebuild 负责独立、可选的代码改进，recipe-qualify 负责独立验收。生成者仍必须自检，不能故意把差代码交给优化者。
- 应用工程保留 discover／harden／repair。首次发现不依赖完整 SemanticProcedure，避免尚未示范就要求先完成提炼的循环依赖；补强时才消费已确认过程。
- 界面认识与审阅作为 application-engineer 内可独立进入、发布和评测的子作业；ui-understanding 暂不发布为独立 Skill。Structured Collection 也进入同一 application-engineer，不新增 collection/VLM Skill。
- 模型主导初次应用认识，程序处理组织、校验、映射、绘图和已验证规则；人工纠错及必要批准。“80%”不是准确率或调用比例，效率须实测。
- Structured Collection 的 VLM 默认用于 authoring-time Profile 建立；runtime assist 默认 off，VLM 只产生 proposal/evidence 并重新经过 validator。`Vision.runOCR()` 不扩成通用 GUI VLM，生产 Runtime 不嵌套 `opendesk ai` 调 Coding Agent。
- `UI.readCollection()` 与 `UI.collectCollection()` 保留两层 Working Contract：前者只观察 current viewport；后者才有 scroll side effect、continuity、merge、mutation、timeout/limits 和 partial completion。没有实现闭环前不写入 Stable API reference。
- CollectionProfile 只描述如何识别一条 generic item；`sender`、`price`、`customerName`、`conversationTitle` 等业务字段留给 Adapter/Recipe parser。TraversalProfile/Strategy 不塞回 CollectionProfile。
- virtualized list 的 viewport coverage 不等于 whole collection coverage；continuity 不能用 text-only/index-only dedupe，无法证明 overlap 时 strict collector 停止而不是静默拼接。
- pagination/load-more 只保留 Traversal 架构扩展位；首批 Phase 1—6 只做 scroll。当前分页动作继续由 Recipe/App Adapter 使用真实已存在 API 编排并验证 page change。
- 默认全局粗识别、关键部分精查。任务必需范围含父区域、锚点、进入路径、结果、阻塞与歧义；次要可延后，核心不能因困难降级。
- 材料可支持认识却缺坐标映射时允许限定交付，禁止据此桌面点击；观察事实、模型解释、人审、定位和操作验证分别记录。
- 简单受控使用可跳过深度优化和不适用的广泛测试；不能跳过正确对象、实际数据、必要验证、授权和安全停止。用途与风险分别判断。
- 普通脚本优先框架 API 与必要普通函数，不新增应用对象方法层。calc.tapButton 是错误示例，不是可选封装；这不限制框架既有 API 形式。按钮矩阵只是需验证的定位候选。
- 执行与采集同步，关键验证在动作后发生；后期独立验收不能替代执行中的安全判断。正常最小记录始终保留，详细诊断按需展开，不事后补造现场。
- 原始证据、叠加、简化结构和属性差异来自同版数据；修改保存旧版、理由和影响，下游不混用版本。明确要求的人审不被自动核验替代。
- Vision.analyzeLayout 与既有颜色分割仅是待评测辅助，不作为认识前提，不因源码／测试存在而宣布可靠，也不无证据删除或重写。
- 下游消费明确版本和范围的成果；未使用环节不等于通过，失败包和局部包不能冒充完整成功示范。
- 来源／需求 → 行为案例 → 任务节点 → 责任 Skill／JS／API → 测试与证据双向对应，避免漏做和无用新增。
- 质量目标按 validation-plan.md 的五维 20 项评审；Structured Collection 再要求 SC-A—SC-P 适用场景和架构专项 16 维边界检查，设计预评审不能替代实现/真机证据。

## 五、迁移与已被替代的决定

- 原 `workflows/agent-to-recipe/WORKFLOW.md` 的框架正文归入本目录任务树；原位置保留导航。不是删掉任务树，也不是把长设计文档直接当最终运行文件。
- 原 `workflows/agent-to-recipe/application-operations.md` 正文归入本目录；旧位置只保留迁移入口。
- 原 `workflows/code-rebuild/WORKFLOW.md` 的代码质量分析归入本目录；旧位置只保留导航。
- 原“recipe-build 改名为 code-rebuild”和“S11 必经独立优化”已被需求修订替代：生成与改进分开，改进按需。旧版本及其理由在 Git 历史和专项修订说明中保留，不同时作为有效指令。
- 拟建的平行 `chains/*.md` 不再创建。chain-design.md 是链路合同，不是又一套专业作业实现。
- 不创建 `UI.extractList()` 万能 API、不新建独立 collection/VLM Skill、不创建第二份 Collection 技术正文；工作流只消费 architecture 的唯一合同。
- 计算器文件原位保留，原需求、分段、R1—R13、矩阵备选和失败记录不能因迁移被删掉；新增业务场景不以计算器成功替代其验证。
- 2026-09-07 的提交 `17ccb9258dd34ce8b7c21296339a17f0c46e6586` 已删除 `prompts/automation/agent-to-recipe/`。原“六个 Skill 仍在原目录”的说明失效；本次只增强现有 application-engineer，不恢复旧目录。
- v0.3 中“本轮不创建 Skill”属于当次设计阶段范围；v0.4 经用户授权创建一个正式方法文件；v0.5 只扩展该 Skill 的 Collection 工作入口，不能据此宣称其他 Skill 也已落地或安装。

## 六、与已有框架和合同的关系

- [框架导航](../../../docs/frameworks/README.md)、[总体框架](../../../docs/frameworks/automation-framework.md)、[任务求解](../../../docs/frameworks/automation-problem-solving-framework.md)、[示范到自动化方法](../../../docs/frameworks/demonstration-to-automation-pipeline.md)提供方法来源；只提取本工作流需要的选择规则，不复制另一个总框架。
- [应用开发](../../../docs/frameworks/app-development-framework.md)、[能力成熟度](../../../docs/frameworks/capability-development.md)、[扩展框架](../../../docs/frameworks/runtime-api-extension-framework.md)分别约束应用认识、验证层次和能力归属。
- [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)是集合读取、VLM provider、scroll traversal、virtualization/mutation 与 business mapping boundary 的唯一技术正文；本目录只维护工作流如何消费它。
- [共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)是字段与交接的唯一正文，本次不因为 Collection 概念创建新的可执行 IR 或第二套 Workflow Runtime。
- 七项目标职责、独立优化和交付裁剪中未实施的部分仍是设计，不表示宿主支持新调用名。失效链接不作为安装入口；实际实现与加载状态须重新核实。
- [当前 API](../../../docs/api/README.md)定义可调用能力；`readCollection`/`collectCollection`/SemanticVisionProvider 等 Target 名称不是实现证明。文档、类型与实现冲突要单列，不能自行择一后声称核验通过。

## 七、实施前仍需核对的事项

- 完成需求、任务树、行为案例、责任环节和测试覆盖检查；确认 DREQ-25—DREQ-29 与 SC-A—SC-P 已有责任和失败路由，不新增 S13。
- 核实目标宿主 Skill 加载、工具权限、文件访问、独立上下文和实际停止能力。目录存在不等于已安装，不虚构 skill run。
- application-engineer 原第一批实际模型提取、确定性审阅工具、纠错与同版交接仍需按旧计划验证；Collection authoring 增量不能用文档写入代替实际模型/validator/overlay。
- Structured Collection Runtime 按 Phase 1—7 分批实施：Observation/Profile schema + fixture → deterministic segmenter/validator → `readCollection` Experimental → SemanticVisionProvider → scroll continuity/merge → `collectCollection` Experimental → list/timeline/no-tree 真实应用验证。
- Phase 1—6 不自动加入 pagination/load-more；出现真实跨应用共同合同后再单独评审。
- 独立 code-rebuild、原候选与新候选交接，以及人工开发来源继续做相应兼容设计，不能硬塞成旧 minimal-repair 后宣称支持。
- 应用真实 OS、版本、布局、读数方式、已有脚本路径和构建来源须在获准运行时确认；没有证据不承诺 Windows／macOS 特定场景已通过。
- 建模耗时、人工修订、模型费用、runtime VLM 成本与复用收益尚待测量；设计预评审不替代这些数据。

## 八、保留与变更规则

- 此处的分析是可审阅的需求结论、设计依据、假设和取舍，不是模型私有思维记录。每次修订写明改变了什么、依据和受影响范围。
- 任务级实际合同、过程、候选、笔记和交接放 `.runtime/automation-authoring/<task-id>/`；实际截图日志使用当次 execution 证据目录，不能把示例路径当已存在文件。
- 保留失败、局部补证和旧候选；清理 `.runtime/` 前核对引用，长期复核需要的资料经授权脱敏保留。证据丢失应标不可复核，不能保留虚假的通过结论。
- 需求变更先修订相应基线和行为案例，再进行影响分析，更新受影响设计／Skill／代码并重验；不靠调整期望消除失败。

## 初始归位范围（v0.2）

依据用户当时“先按照当前结构执行，写入文件”的授权整理设计材料。读取基线为远端 master `2707893a9581ccf356dc8130ad608158145b4fc6`；不代表用户本地工作树。初次写入七个设计文件、更新入口与案例引用；未生成或搬迁 Skill、未改 Runtime／API、未运行计算器、未发布生产自动化。文档写入授权不等于逐项技术假设被确认。

## 历史修订范围（v0.3）

依据用户补充的“OpenDesk 项目背景与目标”和当次“执行”授权，在远端 master `17ccb9258dd34ce8b7c21296339a17f0c46e6586` 上补充项目目标、组合能力、混合运行、资产复用及相应行为案例，保留原任务树与编号；同步设计和工作流导航中已删除 Skill 的状态与引用。当次不新增目录、Skill、Runtime、平台或真实业务操作，不将需求设计写成通过报告。

## 历史写入范围（v0.4）

基线为远端 master `f41f0e2ddf1beda40ce90f46d7ea51d127553e9e`。依据用户对当前应用工程方案的写入授权，修改已有唯一正文、共享合同和导航，新增唯一 application-engineer/SKILL.md。辅助程序、测试实现、宿主安装、模型提取和真实桌面运行不在已完成声明中；分批实施规格已保存。设计预评审见[对应质量记录](../../../docs/quality/agent-to-recipe/application-engineer-design-review.md)，不以该分数给运行能力授予资格。

## 本次写入范围（v0.5）

基线为 2026-09-10 当前 master 的 Structured Collection architecture 已落盘版本；本次把该跨工作流技术合同接入 requirements、S1—S12 任务树、chain-design、application-operations、validation-plan 与现有 application-engineer。仅修改架构/framework/workflow 文档和 Skill 方法，不修改 Runtime 生产代码、类型或 Stable API reference，不声明 Phase 1—7 已实现或真实应用已通过。