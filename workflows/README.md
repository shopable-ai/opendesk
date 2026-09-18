# 工作流入口

本目录保存 Agent-first Recorder／Agent-to-Recipe、人工 Recorder／Human-to-Recipe、官方产品配置维护，以及受保护包发布和 Script App Packaging 等面向开发、发布与交付的工作流、Skill、设计与案例。文档存在不表示 Skill 已加载、整体调度已实现或桌面任务已通过；这些工作流也不代表 OpenDesk 的全部产品范围。

## 先按本轮目标选择入口

先区分“运行已经会的任务”和“开发／维修新的自动化”，再区分原始来源与授权范围。不要看到“优化脚本”就默认重走完整示范，也不要因为工作流文件存在就假设宿主已自动加载。

| 本轮目标 | 正式入口 | 本轮边界 |
| --- | --- | --- |
| 运行已有自动化 | [Conversational Task Runner](../docs/architecture/conversational-task-runner.md)及其真实已实现入口 | 按当前运行合同校验／确认，不顺便探索、开发或发布 |
| Agent 新示范、已有任务接续、普通 JS 定向修复 | [Agent 执行规程](agent-to-recipe/WORKFLOW.md) | 保留 S1—S12；先盘点可复用成果，缺哪段补哪段 |
| 人工录制后的业务提炼、参数化、资格 | [human-to-recipe Skill](human-to-recipe/skills/human-to-recipe/SKILL.md) | 保留 Human plan、来源与 H1—H8，不伪装 Agent 示范 |
| Recorder generated script 的行为保持静态精炼 | [recorder-script-refiner Skill](human-to-recipe/skills/recorder-script-refiner/SKILL.md) | 默认不删改业务意图、不自动参数化、不运行桌面 |
| 应用认识、定位加固、失败维修 | [application-engineer Skill](agent-to-recipe/skills/application-engineer/SKILL.md) | 被 Agent／Human 共用，返回原工作包，不另建完整生命周期 |
| 已验证 JS 打包为桌面应用 | [Script App Packaging](script-app-packaging/README.md) | 交付形态，不等于业务开发或源码保护 |
| `.odpkg` 保护与授权交接 | [受保护包发布](protected-packages/README.md) | 从已有脚本之后开始，不默认扩大 License／发布权限 |
| 官方网址、按钮地址与生成配置 | [Official Product Config](official-product-config/README.md) | 单一配置来源，不接管业务自动化 |

执行前先交“**已完成可复用／需要补充／证据或授权阻塞**”盘点，并说明本轮入口、来源、目标产物及允许副作用。缺少本地环境时仍可完成仓库与离线部分，但不得把代码存在、静态分数或一次历史通过写成当前真机资格。

## 当前已经可直接使用的推进方式

Agent 主链的逐阶段动作、最低交付和接续顺序集中在 [WORKFLOW.md](agent-to-recipe/WORKFLOW.md)，由当前 Agent 手工协调执行；专业 Skill 仍复用现有入口，不新增平行调度器或每阶段一个 Skill。

新增的 [handoff 完整性检查器](agent-to-recipe/scripts/check-handoff.js) 是只读 Node 维护工具，可核对 Agent request／handoff 的身份、文件引用与 hash；命令、限制和退出码见 [执行规程](agent-to-recipe/WORKFLOW.md)。它不是通用业务资格 Gate，不能将 `integrity: pass` 当成自动恢复或发布许可，也不替代 Human 的现有 validator／scorer。

从仓库根目录运行该工具自身的离线测试：

```bash
node --test tests/workflows/handoff-integrity.test.js
```

## 自动化能力生命周期：运行与生产怎样接起来

跨 Runtime、Catalog 与作者链的唯一架构见 [Automation Capability Lifecycle](../docs/architecture/desktop-automation/task-capability-lifecycle.md)。它定义最小能力发布合同、已有能力/Capability Gap 路由、独立资格、失败维修与新版本发布，以及跨层任务分解树；字段仍复用现有共享合同和 Human 原生 plan，不复制另一套 AppProfile 或业务步骤权威来源。

```text
普通用户自然语言 → 受控 Planner → Capability Resolver
  → 已发布且当前适用的 Qualified Capability → 校验/预览/确认 → 普通 JS → 真实结果
  → 没有能力或资格不适用 → 明确 Gap/阻塞/重验/维修
    → 用户明确进入创建/教学/录制 → Agent/Human/已有资产作者链
    → 冻结 Candidate → independent qualification → 明确 publish → 后续运行复用
运行失败 → Failure Package → 定向维修 → 新候选/资格/发布版本
```

- Chat Runner 是产品运行状态机，不在本目录建立平行 `conversational-task-runner/`、`capability-resolver/` 或 `chat-agent/` 工作流。当前 Calculator Chat 的源码、命令与真实验收状态仍见 [Conversational Task Runner](../docs/architecture/conversational-task-runner.md)。
- Agent 的 S1—S12 与 Human 的 H1—H8 保留各自入口和来源；`application-engineer` 由两条作者链及失败维修共用，不另建应用工程 Skill。方法名称不表示已安装或已有自动调度。
- 现行 `recorder-script-refiner` 从固定 actions 确定性编译保真候选，其静态 PASS 不等于业务 qualification；需要参数化、业务意图或真实结果资格时使用 `human-to-recipe`。
- Catalog、发布器与通用 recipe-qualify 是生命周期方案中的待实施部分，不因本文写入而变成当前可调用能力。Normal Mode 不生成并立即执行任意 JS，也不把一次运行确认隐式扩大为探索、开发、验收和发布授权。

## Official Product Config：从这里开始

- 阅读 [Official Product Config 工作流](official-product-config/README.md)，或使用 [`manage-official-product-config`](official-product-config/skills/manage-official-product-config/SKILL.md) 维护官网、帮助、定制、商店、专业版等官方产品入口。
- 官网与 Help / Customize / Marketplace / Upgrade 的唯一明文维护源都是 `configs/product.json`；Runtime 从生成资源派生只读 `System.product.website`，Script Runner、Recorder 等官方 UI 不得各自硬编码地址。官方发行显式执行 `opendesk config compile --input configs/product.json --output apps/opendesk/assets/product.odcfg`，再用 `config inspect --input ...` 查看、`config verify --input ... --output ...` 检查一致性。编译器本身不内置产品路径或打包行为。
- 本工作流解决“产品级单一来源 + 编译 + 发行检查”，不把官方链接放进用户可编辑的 `opendesk.app.json`，也不把 ODCFG1 的轻量混淆描述为 secret、DRM 或密码学签名。

## 受保护包发布：从这里开始

- 阅读 [受保护包发布工作流](protected-packages/README.md)，或使用
  [`build-odpkg`](protected-packages/skills/build-odpkg/SKILL.md) 把已经写好的 JavaScript 安全
  打包为 `.odpkg`、完成 inspect/verify，并按需准备 P1/P2 授权交接和平台资格说明。
- Agent-to-Recipe / Human-to-Recipe 是普通 `.js` 的作者链；受保护包发布从它们的完成产物之后开始，不优化
  Recorder generated script，不接管普通
  archive/app packaging，也不实现 P3 Publisher key lifecycle。

## Script App Packaging：从这里开始

- 阅读 [Script App Packaging 工作流](script-app-packaging/README.md)，或使用
  [`build-script-app`](script-app-packaging/skills/build-script-app/SKILL.md) 把已经写好并验证过的 OpenDesk JavaScript
  组织为 App Mode package，建立或检查 `opendesk.app.json`，再按需装入 macOS `.app` 或 Windows portable distribution。
- 普通用户和开发者查看公开目录结构、`-app` 命令、Manifest、平台 staging 与验证边界时，阅读
  [Script App Packaging 用户文档](../docs/api/script-app-packaging.md)；App Mode 内的 `automation.app` 方法、Tray/Menu、Single Instance 与退出语义仍以 [automation.app API](../docs/api/automation-app.md) 为准。
- Script App Packaging 解决桌面交付形态，不等于 `.odpkg` 源码保护或 License，也不把当前未实现的 MSI/MSIX、自动快捷方式、文件关联或固定端口字段写成已支持能力。

## 人工 Recorder：从这里开始

- 阅读[Human-to-Recipe 入口](human-to-recipe/README.md)：理解受控坐标、增强普通 JS、JS／Agent 混合出口及其边界。
- 阅读[完整作业任务树](human-to-recipe/design/task-decomposition.md)：H1—H8、点击与无文字图标分析、其他动作分支及贯穿约束。
- 阅读[Recorder 工程设计](human-to-recipe/design/recorder-design.md)：Recorder 的规范性需求、数据合同和实际调用链。
- 阅读[实施与验收计划](human-to-recipe/design/implementation-plan.md)：阶段交接、数据责任、最小工作包、待核查类方法和验证门槛。
- 人工录制设计不重写 Agent-first 工作流，不把候选方法写成已实现 API，也不要求基础坐标脚本先完成大模型分析。上述四份主文档各有唯一职责，不按每个阶段另建文件或 Skill。

## Agent-to-Recipe：从这里开始

- 直接推进任务先读[手工协调执行规程](agent-to-recipe/WORKFLOW.md)，完成成果盘点、阶段交付和接续检查；下面的设计文档按当前缺口深入阅读。
- 阅读[设计总纲与文件地图](agent-to-recipe/design/README.md)：了解当前有效决定、职责、资料位置和待完成事项。
- 阅读[需求发现与基线](agent-to-recipe/design/requirements.md)：先看项目背景与业务目标，再明确来源、事实／未知、开发入口、业务场景、质量和授权。
- 阅读[Agent-first Recorder｜工作流任务分解树](agent-to-recipe/design/task-decomposition.md)：完整保留五个结果层次、S1—S12、十三节点对照和三个循环。
- 阅读[链路与成果交接](agent-to-recipe/design/chain-design.md)：理解 Workflow／Skill、输入输出、可选路由、失败返回和过程文件。
- 按需阅读[应用操作分析](agent-to-recipe/design/application-operations.md)、[代码改进分析](agent-to-recipe/design/code-rebuild.md)和[验证计划](agent-to-recipe/design/validation-plan.md)。
- 用[计算器案例与设计记录](agent-to-recipe/cases/calculator.md)检查方法是否接得起来；保留真实数据关系、布局备选、反例和未知项，未运行的场景不写成通过。
- 用[聊天业务粒度示例](agent-to-recipe/design/application-operations.md#聊天业务的粒度与组合示例)区分发送确定内容与根据历史回复；跨应用、混合运行和他人复用的验证均单独规划，不由计算器通过替代。

## 文件职责

- `design/` 保存为什么这样拆、需要什么、怎样交接和怎样验证，不是最终运行指令。
- [agent-to-recipe/WORKFLOW.md](agent-to-recipe/WORKFLOW.md)负责当前工作流导航、手工协调执行规程和已存在的方法入口；未实现的整体调度不冒充可运行能力。
- 各工作流下的 `skills/` 保存已经实际建立的方法入口；规划中的职责只有在对应文件和宿主能力实际落地后才视为可用。
- 生成与代码改进分开：recipe-build 保留生成职责，code-rebuild 为拟新增的独立可选改进；简单脚本可以跳过深度优化，但不能跳过必要正确性与安全检查。
- 不新增与 Skill 平行的 `chains/` 目录，不按每个任务节点创建文件或 Skill。计算器是贯穿案例，不另建计算器产品或专用工作流。
- 已归入 `agent-to-recipe/design/` 的专业正文只保留唯一现行文件，不再为未投入使用的旧路径维护迁移入口或兼容壳。

## 与现有方法的关系

- [框架导航](../docs/frameworks/README.md)、[示范方法](../docs/frameworks/demonstration-to-automation-pipeline.md)与[任务求解](../docs/frameworks/automation-problem-solving-framework.md)提供依据；不复制成新的总框架。
- [应用开发](../docs/frameworks/app-development-framework.md)、[能力成熟度](../docs/frameworks/capability-development.md)和[扩展框架](../docs/frameworks/runtime-api-extension-framework.md)继续负责原有领域。
- [共享合同](../docs/frameworks/agent-to-recipe-skill-contract.md)继续维护公共字段、权限、版本、交接和资格范围；尚未实施的目标职责不表示当前存在或已加载实现。
- [Agent API 短入口](../docs/api/agent/README.md)决定真正可调用能力；优先框架 API 和必要普通函数，不强制 calc 对象，不虚构 UI.tap 或新 Runtime。
- 普通 JS 路线不以前置 Recorder Session、Compiler、可执行 IR、独立 Replay Runtime、LangGraph 或平台为条件；明确选择完整 Recorder 专项时仍执行对应门槛。
- 近期先交付可调用、可配置、可验证、可维护的成果；未来按需求考虑共享与平台化，不把平台延期误解为不需要资产复用。

## 资料留存与进度真实性

- 长期设计、取舍、备选、未知和脱敏案例留在本目录，不能只放入可清理的临时目录。
- 实际任务按共享合同在 `.runtime/automation-authoring/<task-id>/` 保存过程与交接，真实截图日志使用当次 `Execution.artifactDir`；路径示意不是已存在证据。
- 保留探索、失败、局部补证与旧候选，原始事实不因新尝试成功而覆盖。临时分析保存可审阅结论，不保存模型私有思维过程。
- `.runtime/` 不是永久证据库，清理前核对活动引用；需要长期复核时经授权脱敏保留。证据丢失应标不可复核，不能继续声称通过。
- 遵守[AGENTS.md](../AGENTS.md)：不提交凭据、个人屏幕和运行日志，不删除已有用户资料，不新建根级 temp 或 test。
- 当前设计、方法文件和案例分别按其实际状态描述；未生成、安装、运行或验收的内容不得写成已经完成。
