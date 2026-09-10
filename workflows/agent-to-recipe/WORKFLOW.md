---
title: "Agent-to-Recipe｜工作流导航与应用工程入口"
description: "Agent-to-Recipe 的设计导航、应用工程方法入口及运行边界。"
order: 10
---

# Agent-to-Recipe｜工作流导航与应用工程入口

本文件负责整体工作流导航和当前已存在的方法入口，不是自动调度程序。当前已建立 [application-engineer/SKILL.md](skills/application-engineer/SKILL.md) 方法入口；其余职责只有在对应实现、宿主加载和验证实际完成后才视为可用。本文不复制专业正文，也不自动授予桌面权限。

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

## 从当前目的进入

- 先看[设计总纲](design/README.md)，了解当前有效决定、文件职责和待完成事项。
- 明确项目背景、业务交付与本轮建设要求：看[需求与基线](design/requirements.md)。
- 理解完整需要做什么：看[任务分解树](design/task-decomposition.md)。
- 明确由谁做、消费什么、交付什么：看[链路设计](design/chain-design.md)。
- 深入专业问题：看[应用操作](design/application-operations.md)或[独立代码改进](design/code-rebuild.md)。
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
- 当前已建立 application-engineer 方法入口，但实际模型提取、审阅辅助程序、留出规则测试、宿主加载和真实桌面验收仍按验证计划分批完成；未运行项如实保留。
