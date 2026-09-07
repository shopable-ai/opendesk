# 工作流入口

本目录当前保存 Agent-first Recorder 的需求与设计结论，后续据此形成正式 WORKFLOW 和多个独立 Skill。2026-09-07 完成设计归位；文档存在不表示 Skill 已加载、调度已实现或桌面任务已通过。

## 从这里开始

- 阅读[设计总纲与文件地图](agent-to-recipe/design/README.md)：了解当前有效决定、职责、资料位置和待完成事项。
- 阅读[需求发现与基线](agent-to-recipe/design/requirements.md)：明确来源、事实／未知、需求、场景、质量和授权。
- 阅读[Agent-first Recorder｜工作流任务分解树](agent-to-recipe/design/task-decomposition.md)：完整保留五个结果层次、S1—S12、十三节点对照和三个循环。
- 阅读[链路与成果交接](agent-to-recipe/design/chain-design.md)：理解 Workflow／Skill、输入输出、可选路由、失败返回和过程文件。
- 按需阅读[应用操作分析](agent-to-recipe/design/application-operations.md)、[代码改进分析](agent-to-recipe/design/code-rebuild.md)和[验证计划](agent-to-recipe/design/validation-plan.md)。
- 用[计算器案例与设计记录](agent-to-recipe/cases/calculator.md)检查方法是否接得起来；保留真实数据关系、布局备选、反例和未知项，未运行的场景不写成通过。

## 文件职责

- design 保存为什么这样拆、需要什么、怎样交接和怎样验证，不是最终运行指令。
- [agent-to-recipe/WORKFLOW.md](agent-to-recipe/WORKFLOW.md)当前仅作过渡导航；正式文件后续负责选择和组合 Skill，不承载完整推理正文。
- 后续 skills 负责各专业环节。当前[六个 Skill](../prompts/automation/agent-to-recipe/README.md)仍在原目录，本轮不新增、改名或搬迁，也不假定宿主自动发现未来目录。
- 生成与代码改进分开：recipe-build 保留生成职责，code-rebuild 为拟新增的独立可选改进；简单脚本可以跳过深度优化，但不能跳过必要正确性与安全检查。
- 原[应用操作入口](agent-to-recipe/application-operations.md)和[代码改进入口](code-rebuild/WORKFLOW.md)只保留迁移导航，不维护两份正文。
- 不新增与 Skill 平行的 chains 目录，不按每个任务节点创建文件或 Skill。计算器是贯穿案例，不另建计算器产品或专用工作流。

## 与现有方法的关系

- [框架导航](../docs/frameworks/README.md)、[示范方法](../docs/frameworks/demonstration-to-automation-pipeline.md)与[任务求解](../docs/frameworks/automation-problem-solving-framework.md)提供依据；不复制成新的总框架。
- [应用开发](../docs/frameworks/app-development-framework.md)、[能力成熟度](../docs/frameworks/capability-development.md)和[扩展框架](../docs/frameworks/runtime-api-extension-framework.md)继续负责原有领域。
- [共享合同](../docs/frameworks/agent-to-recipe-skill-contract.md)继续维护公共字段、权限、版本、交接和资格范围；新 code-rebuild 和人工开发等目标路由的兼容实施尚待完成。
- [当前 API](../docs/api/README.md)决定真正可调用能力；优先框架 API 和必要普通函数，不强制 calc 对象，不虚构 UI.tap 或新 Runtime。
- 普通 JS 路线不以前置 Recorder Session、Compiler、可执行 IR、独立 Replay Runtime、LangGraph 或平台为条件；明确选择完整 Recorder 专项时仍执行对应门槛。

## 资料留存与进度真实性

- 长期设计、取舍、备选、未知和脱敏案例留在本目录，不能只放入可清理的临时目录。
- 实际任务按共享合同在 `.runtime/automation-authoring/<task-id>/` 保存过程与交接，真实截图日志使用当次 Execution.artifactDir；路径示意不是已存在证据。
- 保留探索、失败、局部补证与旧候选，原始事实不因新尝试成功而覆盖。临时分析保存可审阅结论，不保存模型私有思维过程。
- `.runtime/` 不是永久证据库，清理前核对活动引用；需要长期复核时经授权脱敏保留。证据丢失应标不可复核，不能继续声称通过。
- 遵守[AGENTS.md](../AGENTS.md)：不提交凭据、个人屏幕和运行日志，不删除已有用户资料，不新建根级 temp 或 test。
- 本轮仅整理设计文件和迁移入口。未生成或迁移 Skill，未改 API／Runtime，未运行计算器；实际评分、安装、独立交接和业务验收按验证计划后续分别记录。
