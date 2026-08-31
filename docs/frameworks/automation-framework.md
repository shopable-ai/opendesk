# 自动化总体框架（Automation Framework）

## 定位

本文件定义 OpenDesk 自动化能力的最高层长期框架。

它回答：

> OpenDesk 应该怎样把底层输入、界面感知、目标定位、动作验证、业务技能、工作流与 Agent 组织成一个可靠自动化系统？

具体实现细节、单一应用规则和阶段计划不应替代本文件。

## 一、核心执行闭环

```text
发现界面（Discover）
→ 观察界面（Observe）
→ 理解状态（Understand）
→ 定位目标（Locate）
→ 解析位置（Resolve Geometry）
→ 执行动作（Act）
→ 再次观察（Observe Again）
→ 验证结果（Verify）
→ 诊断失败（Diagnose）
→ 恢复处理（Recover）
→ 保存证据（Evidence）
```

核心原则：

- 坐标不是元素身份，只是动作执行位置。
- 动作没有报错，不等于任务成功。
- 重要动作必须经过动作后观察与结果验证。
- 失败需要分类、诊断和受限恢复，不能无限盲目重试。
- 关键步骤应保留可检查 Evidence。

## 二、系统分层

```text
底层驱动（Driver）
→ 感知识别（Perception）
→ UI 结构与状态模型（UI Model）
→ 目标定位与坐标解析（Target / Geometry）
→ 可验证动作（Verified Action）
→ 业务技能（Skill）
→ 工作流编排（Workflow）
→ Agent 推理 / 长期运行监督（Agent / Supervisor）
```

### 底层驱动（Driver）

鼠标、键盘、窗口、截图、剪贴板等最底层能力。

### 感知识别（Perception）

通过 Accessibility、DOM、OCR、图色、模板匹配、布局分析、视觉模型等获取界面信号。

### UI 结构与状态模型（UI Model）

把界面组织成应用、窗口、页面、区域、元素、状态和它们之间的空间关系。

### 目标定位与坐标解析（Target / Geometry）

把“要操作哪个对象”转换成经过验证的目标与最终动作位置。

### 可验证动作（Verified Action）

执行点击、输入、滚动、拖动等动作，并在动作后重新观察和验证结果。

### 业务技能（Skill）

把多个可靠动作封装成可复用业务能力，例如打开会话、发送消息、保存文件、查找订单。

### 工作流编排（Workflow）

把多个 Skill、条件、分支、等待、验证和恢复组合成完整任务。

### Agent / 长期运行监督（Agent / Supervisor）

处理不确定性推理、长期运行、异常决策、任务调度和必要的人机协作。

## 三、问题推理顺序

新增自动化能力时，优先按以下顺序分析：

```text
场景
→ 任务目标
→ 需要识别的状态
→ 需要操作的对象
→ 可用定位信号
→ 空间与坐标关系
→ 动作
→ 成功判据
→ 失败类型
→ 恢复方式
→ Evidence
```

技术选择优先级不是固定唯一顺序，但默认先考虑低成本、可重复、可验证的方法：

```text
结构化接口
→ Accessibility / DOM
→ Anchor / Geometry
→ 图色 / Template
→ OCR / Layout
→ Vision
→ Agent Reasoning
```

当简单方法无法可靠完成任务时，再逐步增加多信号融合、视觉模型或 Agent 推理。

## 四、通用框架与具体应用的边界

通用框架负责：

```text
怎么观察
怎么定位
怎么执行
怎么验证
怎么诊断
怎么恢复
怎么记录 Evidence
```

具体应用负责：

```text
有哪些窗口
有哪些页面和状态
有哪些重要区域和元素
有哪些业务 Skill
有哪些 Workflow
```

具体应用中的固定标题、颜色、图标、区域和业务状态，不应直接写入通用核心。

## 五、配套框架

- [能力开发与成熟度路径](./capability-development.md)：OpenDesk 自身如何从简单能力逐级发展到复杂桌面 Agent。
- [应用自动化开发框架](./app-development-framework.md)：新增一个具体桌面应用时应如何分析、开发、验证和封装。
- [Playbook 驱动自动化](./playbook-driven-automation.md)：把一个可审查的应用流程收敛成文档定义、受限数据读取和可验证运行脚本。
- `../architecture/desktop-automation/`：目标模型、Adapter Contract、应用分类等专项技术架构。
- `../quality/`：测试、Failure Taxonomy、Gate 与 Evidence 规则。
