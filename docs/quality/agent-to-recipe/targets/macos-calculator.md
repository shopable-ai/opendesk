# 测试目标：macOS Calculator

状态：目标与范围说明，尚未因本文件写入而完成任何测试。记录日期：2026-09-06。

## 定位

Calculator 是用于验证通用 Agent-to-Recipe 流程的一个目标应用，不是一个独立开发工作流。通用流程唯一入口为 [WORKFLOW.md](../../../../workflows/agent-to-recipe/WORKFLOW.md)，其中的 [12 阶段](../../../../workflows/agent-to-recipe/stages/README.md) 和 [6 个 Skill](../../../../prompts/automation/agent-to-recipe/README.md) 均不以 Calculator 为前提。

本文件提供测试目标和场景约束，不定义第二套调用顺序、阶段编号、工作包模板或 Runtime 加载格式。应用知识由 application-engineer 根据真实观察形成 AppProfile；本文件中的期望和环境说明不是观察证据。

原 `workflows/macos/calculator/WORKFLOW.md` 已撤下，其可复用方法在通用阶段卡中维护，测试命令与判据由已有[计算器验证规程](../calculator-validation.md)维护。这里不保留同名工作流跳转文件。

## 目标与要检验的能力

| 项目 | 测试设定 |
| --- | --- |
| 目标应用 | macOS Calculator；当前实例的身份、版本和模式需现场核对 |
| 业务目标 | 执行一次计算，读取真实显示结果，把该值用于后续计算，再验证最终显示 |
| 关键业务值 | firstResult；必须来自当前 UI 读取，有来源证据和消费者关联 |
| 跨阶段交接 | 操作与验证记录 → dossier → analysis／procedure → 普通 JS 候选 → qualification |
| Fresh Run | 重新完成业务、重新读值；示范中的数值不能成为运行答案 |
| 不证明的内容 | 其他应用、其他 OS、所有布局、支付／发送等副作用恢复或通用无人值守可靠性 |

具体表达式、输入字段、错误期望及命令只维护在验证规程；目标文件不复制第二份参数规范。

## 用户授权范围怎样选择

| 用户要求 | 执行依据 | 不允许扩大成什么 |
| --- | --- | --- |
| 只运行一次已有脚本 | 验证规程的公开命令与必要前置 | 不自动运行四项 BASIC 或完整开发链 |
| 计算器基本测试 | 验证规程 BASIC B0—B3 | 不自动进行 PIPELINE、窗口扰动 gate 或全量测试 |
| 验证 Agent 完成任务并生成脚本 | 通用 WORKFLOW＋本目标＋验证规程 PIPELINE | 不把已有参考脚本通过冒充新候选或跨 Agent 交接通过 |
| 明确授权受控扰动 | 验证规程 LIVE-GATE | 不自动安装依赖、改权限或启动其他平台 |

仅要求写文件、审查或设计时，不进行桌面动作。输入本目标文档本身不构成运行授权。

## 前置与副作用边界

执行者需有真实 macOS 交互桌面、可追溯的 OpenDesk binary、适用权限、实际可用的观察／读取能力、可写 artifact 目录、预算与停止入口。按当前 API 核验，不用文件存在推导功能已可用。

获准操作会启动／聚焦目标、输入算式并清空当前表达式，必要时按既有能力调整受支持模式。有应保留内容时先停止处理。不得自动丢弃用户数据、关闭其他应用、重置权限或安装依赖。缺真实桌面就报告阻塞，不以 mock／JS 算术代替。

本目标不要求 Windows／Linux 真机或 VM，也不声明这些平台通过；未来可增加其他目标描述，但不复制通用阶段流程。

## 现有参考资产与位置兼容

[calculate-and-reuse-result.js](../../../../workflows/macos/calculator/calculate-and-reuse-result.js) 是现有具体业务参考程序，而不是“Calculator 应用本身是工作流”的定义。本次不移动或改写它，以免破坏已公开命令及现有测试 runner 的固定引用。

测试命令、BASIC／LIVE-GATE／PIPELINE 判据及报告要求统一见[验证规程](../calculator-validation.md)。后续若要迁移参考 JS，应作为单独兼容性变更同步 runner、示例和文档，而不是为纠正方法分类悄悄改变运行路径。

## 本次任务的资料去哪里

目标文档是稳定测试资产；真实合同、工作包、进度、AppProfile、dossier 和候选均进入获准的 `.runtime/automation-authoring/<task-id>/`；截图、日志和真实结果优先使用 `Execution.artifactDir`，按共享合同交接引用。不得把本次观察或测试通过勾选写回本文件。

验收报告分别说明参考脚本、生成候选、无旧聊天交接和完整开发链；未知／未测如实保留。一次计算器成功不自动给通用流程或其他目标认证。
