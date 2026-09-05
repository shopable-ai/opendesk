# OpenDesk Workflows

## 先区分通用流程、Skill、阶段和目标应用

本目录的 Agent-to-Recipe 是 **一条应用无关的开发工作流**。它组织 **6 个独立专业 Skill、12 个通用阶段执行卡**。计算器只是该流程的一个目标测试应用，不是一个独立的开发工作流。

| 要找什么 | 入口 | 内容 |
| --- | --- | --- |
| 通用开发工作流 | [agent-to-recipe/WORKFLOW.md](agent-to-recipe/WORKFLOW.md) | 顺序、输入输出、产物流向、继续／回退、接续 |
| 全部 12 个阶段 | [agent-to-recipe/stages/README.md](agent-to-recipe/stages/README.md) | 每阶段一个文件：输入、操作、输出、门禁与下游 |
| 全部 6 个独立 Skill | [Skill 目录](../prompts/automation/agent-to-recipe/README.md) | 专业职责、调用条件、主产物与独立验收 |
| 测试目标应用 | [macOS Calculator 目标资料](../docs/quality/agent-to-recipe/targets/macos-calculator.md) | 测什么应用与能力、场景与范围；不另定义工作流 |
| 计算器测试命令与判据 | [验证规程](../docs/quality/agent-to-recipe/calculator-validation.md) | BASIC／LIVE-GATE／PIPELINE 范围与实际证据要求 |
| 已有具体业务参考程序 | [calculate-and-reuse-result.js](macos/calculator/calculate-and-reuse-result.js) | 保留现有源码位置与正常运行命令 |

```text
workflows/agent-to-recipe/WORKFLOW.md       通用路由（1）
workflows/agent-to-recipe/stages/*.md      阶段卡（12，另有索引）
prompts/automation/agent-to-recipe/*/SKILL.md  独立 Skill（6）
docs/quality/agent-to-recipe/targets/      目标测试资料
.runtime/automation-authoring/<task-id>/  每次任务计划、产物、进度
```

`WORKFLOW.md` 由 Agent 宿主读取，不是新 Runtime、DSL、自动调度或 OpenDesk 可执行格式。每个 Skill 不等于一个 Agent，十二阶段也不等于十二个业务动作。只加载当前需要的 Skill 与阶段卡，并按[共享合同](../docs/frameworks/agent-to-recipe-skill-contract.md)交接。

## 普通 JavaScript 的作者约定

现有 `.js` 是具体业务程序；通用开发流程最终仍交付普通 JS，不要求 IR／Compiler／Recorder。程序应清楚表达 taskContract／goal、successCriteria、应用与对象身份、必要配置、业务语义函数、verification／oracle、qualificationAssumptions、异步入口和失败处理。

脚本内的合理默认业务数据仍是作者体验主路径；Execution.input 默认为 `{}`，需要部署或测试覆盖时才使用正式参数入口，不强制所有 Workflow 使用额外 JSON 外壳。实际 API 和入口语义以当前 `docs/api/` 为准。

业务程序使用公开 Runtime 能力，确认当前应用／窗口、读取新 bounds、定位、操作、重新观察并验证。坐标只是当前投影；OCR／其他读取结果应来自真实业务观察，不能用示范答案或内部算术替代任务所要求的 UI 数据。

目标歧义、身份变化、权限缺失、布局不匹配、读取不唯一或业务验证不通过时，保存当前 Evidence 并失败，不继续点击或返回未经证明的成功。

Recipe／应用 helper 可先与业务逻辑放在同一个 JS 文件，是否分模块以实际加载能力为准，不凭空使用 import／require。开发分阶段与最终同文件交付并不矛盾。

## 计算器参考 JS 的兼容位置

原 `workflows/macos/calculator/WORKFLOW.md` 已撤下，不再把 Calculator 应用包装成专属开发流程。其测试范围由 docs/quality 的目标与验证规程说明，通用执行方法归入 agent-to-recipe 的十二阶段。

既有 [calculate-and-reuse-result.js](macos/calculator/calculate-and-reuse-result.js) 暂不迁移或改写，以免改变公开命令、现有 runner 的路径和验证对象。它表达一个具体计算与结果复用任务，不代表每个应用都应建立一个 WORKFLOW.md。

公开参考命令（工作目录：仓库根目录）：

```bash
./dist/opendesk ai run workflows/macos/calculator/calculate-and-reuse-result.js
```

仅要求运行一次不自动扩大为 BASIC；BASIC 不自动扩大为完整开发链或全部测试。读取目标资料、Skill 或阶段卡都不构成桌面操作授权。正式判据只维护在验证规程，不在这里复制。

## 产物、验证与方法来源

每个生产者逐节点保存关键业务值、来源、验证和证据，跨环节通过确定版本的产物交接，而不是隐含聊天。开发接续可复用有效知识与代码；独立 Fresh Run 必须重新完成业务并读取本次真实数据。

运行日志、截图和临时结果进入 `.runtime/` 或 Execution.artifactDir，不写入稳定流程和 Skill。候选发布按实际授权与验收办理，不覆盖已有参考脚本冒充新版本测试。

方法源：[docs/frameworks/demonstration-to-automation-pipeline.md](../docs/frameworks/demonstration-to-automation-pipeline.md)。原架构路径是迁移入口。本文及新增阶段文件只落实路线 A 的作业组织，不宣称所有目标架构已实现，也不声明本次完成了桌面测试。
