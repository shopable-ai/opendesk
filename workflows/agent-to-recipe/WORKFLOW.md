---
title: "Agent-to-Recipe｜工作流导航与应用工程入口"
description: "Agent-to-Recipe 的设计导航、应用工程方法入口及运行边界。"
order: 10
---

# Agent-to-Recipe｜工作流导航与应用工程入口

本文件负责整体工作流导航和当前已存在的方法入口，不是自动调度程序。当前已建立 [application-engineer/SKILL.md](skills/application-engineer/SKILL.md) 方法入口；其余职责只有在对应实现、宿主加载和验证实际完成后才视为可用。本文不复制专业正文，也不自动授予桌面权限。

## 与普通任务运行及能力发布的交接

跨层唯一架构见 [Automation Capability Lifecycle](../../docs/architecture/desktop-automation/task-capability-lifecycle.md)。本工作流负责生产/维修自动化，不是用户每次自然语言任务的运行链；Chat Runner 的 Runtime 状态机不另建平行 Workflow 目录。

进入本链前先消费明确的 Capability Gap、Failure Package 或已有资产工作包，固定目标、来源、允许副作用与预算。已有有效 AppProfile、过程、候选和证据优先复用；仅缺资格时先重验，仅缺登记时走受控发布，不强制重走新示范。用户在 Normal Mode 确认一次运行，不等于授权 Agent 探索、生成、验收和发布。

出口仍是现有合同下的普通 JS Candidate 与独立 QualificationRecord，再由生命周期的显式发布门登记 Capability。任何代码/依赖修复形成新候选，不能热改生产脚本沿用旧资格；完整发布门与 recipe-qualify 正式入口尚待实施，不因本文存在而自动可用。Agent 的 S1—S12、Human 的 H1—H8 与原始来源分别保留，不把来源适配做成第二份 AppProfile 或业务步骤真相。

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

开发期可以选择或替换策略，正常运行只执行已验证且明确配置的方法。最终代码可以只保留一条可靠路径，不要求每个按钮包含 OCR、Accessibility、图像和 fallback 字段。已有本地实现优先核对复用，不重复建设或按讨论对象重构；没有代码缺口时只补方法、记录或验证。

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
- 当前已建立 application-engineer 方法入口，但实际模型提取、审阅辅助程序、留出规则测试、宿主加载和真实桌面验收仍按验证计划分批完成；未运行项如实保留。
