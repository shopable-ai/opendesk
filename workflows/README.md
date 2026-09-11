# 工作流入口

本目录保存 Agent-first Recorder／Agent-to-Recipe、人工 Recorder／Human-to-Recipe，以及受保护包发布和 Script App Packaging 等面向开发、发布与交付的工作流、Skill、设计与案例。文档存在不表示 Skill 已加载、整体调度已实现或桌面任务已通过；这些工作流也不代表 OpenDesk 的全部产品范围。

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
  [Script App Packaging 用户文档](../docs/api/script-app-packaging.md)；App Mode 内的 `automation.app` 方法、Tray/Menu、Single Instance 与退出语义仍以 [automation.app API](../docs/api/app-shell.md) 为准。
- Script App Packaging 解决桌面交付形态，不等于 `.odpkg` 源码保护或 License，也不把当前未实现的 MSI/MSIX、自动快捷方式、文件关联或固定端口字段写成已支持能力。

## 人工 Recorder：从这里开始

- 阅读[Human-to-Recipe 入口](human-to-recipe/README.md)：理解受控坐标、增强普通 JS、JS／Agent 混合出口及其边界。
- 阅读[完整作业任务树](human-to-recipe/design/task-decomposition.md)：H1—H8、点击与无文字图标分析、其他动作分支及贯穿约束。
- 阅读[实施与验收计划](human-to-recipe/design/implementation-plan.md)：阶段交接、数据责任、最小工作包、待核查类方法和验证门槛。
- 人工录制设计不重写 Agent-first 工作流，不把候选方法写成已实现 API，也不要求基础坐标脚本先完成大模型分析。只保留上述三份主文档，不按每个阶段另建文件或 Skill。

## Agent-to-Recipe：从这里开始

- 阅读[设计总纲与文件地图](agent-to-recipe/design/README.md)：了解当前有效决定、职责、资料位置和待完成事项。
- 阅读[需求发现与基线](agent-to-recipe/design/requirements.md)：先看项目背景与业务目标，再明确来源、事实／未知、开发入口、业务场景、质量和授权。
- 阅读[Agent-first Recorder｜工作流任务分解树](agent-to-recipe/design/task-decomposition.md)：完整保留五个结果层次、S1—S12、十三节点对照和三个循环。
- 阅读[链路与成果交接](agent-to-recipe/design/chain-design.md)：理解 Workflow／Skill、输入输出、可选路由、失败返回和过程文件。
- 按需阅读[应用操作分析](agent-to-recipe/design/application-operations.md)、[代码改进分析](agent-to-recipe/design/code-rebuild.md)和[验证计划](agent-to-recipe/design/validation-plan.md)。
- 用[计算器案例与设计记录](agent-to-recipe/cases/calculator.md)检查方法是否接得起来；保留真实数据关系、布局备选、反例和未知项，未运行的场景不写成通过。
- 用[聊天业务粒度示例](agent-to-recipe/design/application-operations.md#聊天业务的粒度与组合示例)区分发送确定内容与根据历史回复；跨应用、混合运行和他人复用的验证均单独规划，不由计算器通过替代。

## 文件职责

- `design/` 保存为什么这样拆、需要什么、怎样交接和怎样验证，不是最终运行指令。
- [agent-to-recipe/WORKFLOW.md](agent-to-recipe/WORKFLOW.md)负责当前工作流导航和已存在的方法入口；未实现的整体调度不冒充可运行能力。
- 各工作流下的 `skills/` 保存已经实际建立的方法入口；规划中的职责只有在对应文件和宿主能力实际落地后才视为可用。
- 生成与代码改进分开：recipe-build 保留生成职责，code-rebuild 为拟新增的独立可选改进；简单脚本可以跳过深度优化，但不能跳过必要正确性与安全检查。
- 不新增与 Skill 平行的 `chains/` 目录，不按每个任务节点创建文件或 Skill。计算器是贯穿案例，不另建计算器产品或专用工作流。
- 已归入 `agent-to-recipe/design/` 的专业正文只保留唯一现行文件，不再为未投入使用的旧路径维护迁移入口或兼容壳。

## 与现有方法的关系

- [框架导航](../docs/frameworks/README.md)、[示范方法](../docs/frameworks/demonstration-to-automation-pipeline.md)与[任务求解](../docs/frameworks/automation-problem-solving-framework.md)提供依据；不复制成新的总框架。
- [应用开发](../docs/frameworks/app-development-framework.md)、[能力成熟度](../docs/frameworks/capability-development.md)和[扩展框架](../docs/frameworks/runtime-api-extension-framework.md)继续负责原有领域。
- [共享合同](../docs/frameworks/agent-to-recipe-skill-contract.md)继续维护公共字段、权限、版本、交接和资格范围；尚未实施的目标职责不表示当前存在或已加载实现。
- [当前 API](../docs/api/README.md)决定真正可调用能力；优先框架 API 和必要普通函数，不强制 calc 对象，不虚构 UI.tap 或新 Runtime。
- 普通 JS 路线不以前置 Recorder Session、Compiler、可执行 IR、独立 Replay Runtime、LangGraph 或平台为条件；明确选择完整 Recorder 专项时仍执行对应门槛。
- 近期先交付可调用、可配置、可验证、可维护的成果；未来按需求考虑共享与平台化，不把平台延期误解为不需要资产复用。

## 资料留存与进度真实性

- 长期设计、取舍、备选、未知和脱敏案例留在本目录，不能只放入可清理的临时目录。
- 实际任务按共享合同在 `.runtime/automation-authoring/<task-id>/` 保存过程与交接，真实截图日志使用当次 `Execution.artifactDir`；路径示意不是已存在证据。
- 保留探索、失败、局部补证与旧候选，原始事实不因新尝试成功而覆盖。临时分析保存可审阅结论，不保存模型私有思维过程。
- `.runtime/` 不是永久证据库，清理前核对活动引用；需要长期复核时经授权脱敏保留。证据丢失应标不可复核，不能继续声称通过。
- 遵守[AGENTS.md](../AGENTS.md)：不提交凭据、个人屏幕和运行日志，不删除已有用户资料，不新建根级 temp 或 test。
- 当前设计、方法文件和案例分别按其实际状态描述；未生成、安装、运行或验收的内容不得写成已经完成。
