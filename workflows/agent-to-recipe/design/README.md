# Agent-first Recorder｜设计总纲与文件地图

状态：阶段性设计结论 v0.2，2026-09-07。此目录保存构建自动化开发工作流与多个 Skill 的依据，不是每次业务执行的指令，也不是实现或验收通过报告。先读本页，无需拼接历史对话。返回[工作流总入口](../../README.md)。

## 一、当前要建设什么

- 从真实任务／人工开发目标／已有自动化资产出发，形成有依据、可独立运行、可验证并可维护的普通 OpenDesk JavaScript。
- 已明确、能够验证的步骤交给 JS；必要的理解与动态判断交给 Agent，授权决策保留人工。
- 先保存需求、完整任务树、链路交接和验证设计，再完善正式 WORKFLOW 与多个 SKILL.md。不从目录名反推职责，不把设计文件写完视为能力完成。
- 普通脚本不以前置建设 Recorder Session、Compiler、可执行 IR、独立 Replay Runtime、LangGraph 或资产平台为条件；明确选择完整 Recorder 专项时仍遵守其独立模型和验证门槛。

## 二、只区分三条不同层次的链

- 需求推导链：来源 → 事实／未知 → 业务需求与场景 → 可验证需求基线，回答真正需要什么。
- 自动化开发工作流：取得可信依据 → 解释过程 → 归纳规则 → 形成程序 → 验证与维护，回答怎样生产自动化。
- 业务执行工作流：生成后的程序每次实际完成的业务步骤，计算器例子是首次计算 → 真实读数 → 再次计算 → 读取并打印。
- Capability 是需要具备的业务能力；业务 Function 不等于 JS 函数；Agent Skill 是专业作业；已有 API 和普通函数是实现方式。这些对象不能一一硬配。

## 三、建设顺序与唯一正文

- [requirements.md](requirements.md)：来源、事实／未知、业务叙事、场景、功能和质量需求、范围与基线变更。
- [task-decomposition.md](task-decomposition.md)：完整保留《Agent-first Recorder｜工作流任务分解树》、五个结果层次、S1—S12、R1—R13 对照和三个循环。
- [chain-design.md](chain-design.md)：把任务节点分配给独立作业，明确 Workflow／Skill、输入输出、组合、复用、跳过、失败与中断返回。
- [application-operations.md](application-operations.md)：保留从 Layout、区域、组件到目标、定位、Geometry、可验证操作的专业分析。
- [code-rebuild.md](code-rebuild.md)：保留代码改进的依据、方法、质量底线和反例；独立按需，不再作为 recipe-build 的改名替代。
- [validation-plan.md](validation-plan.md)：行为案例、测试空间、独立 Skill／交接／整链／实际脚本的验证与评分。
- [计算器案例](../cases/calculator.md)：长期保留需求代入、十三节点、数据关系、备选方案、设计演变、失败反例及未决问题，不复制成七份 Skill 案例。
- [WORKFLOW.md](../WORKFLOW.md)：当前仅为过渡入口；后续根据已确认链路形成正式调用与路由，不再承载完整推理正文。
- `../skills/`：仅为后续目标位置。本轮不创建空目录、不迁移现有 Skill、不假定 Codex 或其他宿主自动扫描此目录。

建设关系：需求及行为案例 → 完整任务树 → 链路／交接／测试设计 → 各 Skill 实施规格与正式 WORKFLOW → 独立和组合验证。行为案例、研究和验证可反向修订上游；不是不可回退的瀑布链。

## 四、当前有效决定

- 先按需求语义拆任务，再分配给人、Agent Skill、普通 JS 或已有 API；不按 Agent 人数、文件数、函数数拆需求。
- 保留 recipe-build 负责生成或登记合格基础代码，拟新增 code-rebuild 负责独立、可选的代码改进，recipe-qualify 负责独立验收。生成者仍必须自检，不能故意把差代码交给优化者。
- 应用工程保留 discover／harden／repair。首次发现不依赖完整 SemanticProcedure，避免尚未示范就要求先完成提炼的循环依赖；补强时才消费已确认过程。
- 简单受控使用可跳过深度优化和不适用的广泛测试；不能跳过正确对象、实际数据、必要验证、授权和安全停止。用途与风险分别判断。
- 现有框架 API 优先，必要时少量普通函数。不强制 calc 对象、应用类、组件运行时；按钮矩阵只是需验证的定位候选。
- 执行与采集同步，关键验证在动作后发生；后期独立验收不能替代执行中的安全判断。
- 下游消费明确版本和范围的成果；未使用的环节不等于通过，失败包和局部包不能冒充完整成功示范。
- 来源／需求 → 行为案例 → 任务节点 → 责任 Skill／JS／API → 测试与证据双向对应，避免漏做和无用新增。
- 评分目标为已声明范围有证据地达到 95 分以上，不预填分数，不以高分抵消关键门禁失败。

## 五、迁移与已被替代的决定

- 原 `workflows/agent-to-recipe/WORKFLOW.md` 的框架正文归入本目录任务树；原位置保留导航。不是删掉任务树，也不是把长设计文档直接当最终运行文件。
- 原 `workflows/agent-to-recipe/application-operations.md` 正文归入本目录；旧位置只保留迁移入口。
- 原 `workflows/code-rebuild/WORKFLOW.md` 的代码质量分析归入本目录；旧位置只保留导航。
- 原“recipe-build 改名为 code-rebuild”和“S11 必经独立优化”已被本次需求修订替代：生成与改进分开，改进按需。旧版本及其理由在 Git 历史和专项修订说明中保留，不同时作为有效指令。
- 拟建的平行 `chains/*.md` 不再创建。chain-design.md 是进入 Skill 化之前的设计合同，不是又一套专业作业实现。
- 计算器文件原位保留，仅同步设计入口和可选优化语义，原需求、分段、R1—R13、矩阵备选和失败记录不能因迁移被删掉。

## 六、与已有框架和合同的关系

- [框架导航](../../../docs/frameworks/README.md)、[任务求解](../../../docs/frameworks/automation-problem-solving-framework.md)、[示范到自动化方法](../../../docs/frameworks/demonstration-to-automation-pipeline.md)提供方法来源；只提取本工作流需要的选择规则，不复制另一个总框架。
- [应用开发](../../../docs/frameworks/app-development-framework.md)、[能力成熟度](../../../docs/frameworks/capability-development.md)、[扩展框架](../../../docs/frameworks/runtime-api-extension-framework.md)分别约束应用认识、验证层次和能力归属。
- [共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)仍是当前字段与交接的唯一正文；[G0—G7](../../../docs/quality/gates-and-evidence.md)和[失败分类](../../../docs/quality/failure-taxonomy.md)不被本目录评分替换。
- [现有六个 Skill](../../../prompts/automation/agent-to-recipe/README.md)仍在原目录。七项目标职责、独立优化和新的交付裁剪是本次设计，不表示共享合同或宿主已支持新调用名。
- [当前 API](../../../docs/api/README.md)定义可调用能力；历史设计里的 UI.tap、AX、UIA 或示意 helper 名称不是实现证明。

## 七、实施前仍需核对的事项

- 逐项完成任务树、需求、行为案例、责任环节和测试的覆盖检查；确认阻断性未知项及受影响范围。
- 核实目标宿主的 Skill 发现／加载、工具权限、独立上下文、文件访问和实际停止能力。目录存在不等于已安装；不虚构 skill run 或恢复 API。
- 独立 code-rebuild 的调用名、优化范围、原候选与新候选交接，以及人工开发来源需要与当前六 Skill 合同做兼容设计，不能硬塞成旧的 minimal-repair 后宣称全部支持。
- 现有 Skill 索引引用的旧 `stages/README.md` 在当前工作流目录不存在；后续 Skill 化时修正索引与阶段对应，不恢复一套重复阶段卡。本轮不改旧 Skill 或其索引。
- 应用的真实 OS、版本、布局、读数方式、已有脚本路径和构建来源仍须在获准运行时确认；没有对应证据不承诺 Windows／macOS 的特定场景已通过。

## 八、保留与变更规则

- 此处的分析是可审阅的需求结论、设计依据、假设和取舍，不是模型私有思维记录。每次修订写明改变了什么、依据和受影响范围。
- 任务级实际合同、过程、候选、笔记和交接放 `.runtime/automation-authoring/<task-id>/`；实际截图日志使用当次 execution 证据目录，不能把示例路径当已存在文件。
- 保留失败、局部补证和旧候选；清理 `.runtime/` 前核对引用，长期复核需要的资料经授权脱敏保留。证据丢失应标不可复核，不能保留虚假的通过结论。
- 需求变更先修订相应基线和行为案例，再进行影响分析，更新受影响设计／Skill／代码并重验；不靠调整期望消除失败。

## 本次写入范围

依据用户本轮“先按照当前结构执行，写入文件”的授权整理设计材料。读取基线为远端 master `2707893a9581ccf356dc8130ad608158145b4fc6`；不代表用户本地工作树。仅写入七个设计文件、更新入口与案例引用；不生成或搬迁 Skill、不改 Runtime／API、不运行计算器、不发布生产自动化。文档写入授权不等于逐项技术假设被确认，后续验证按验证计划执行。
