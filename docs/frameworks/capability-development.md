# 能力开发与成熟度路径（Capability Development）

## 定位

本文件定义 Clawdesk 桌面自动化能力从简单到复杂的开发、测试和升级顺序。

它回答：

> Clawdesk 自身应该先把哪些基础能力做可靠，再逐步进入真实应用、跨应用 Workflow 和自主 Agent？

## 一、总体原则

```text
先底层可靠
→ 再单控件
→ 再复杂控件
→ 再动态页面
→ 再真实应用
→ 再跨应用 Workflow
→ 最后复杂 Agent
```

不要用微信、千牛等复杂应用作为最早期能力证明。

每一级都重复同一闭环：

```text
实现能力
→ 构造 Benchmark / 场景
→ 观察（Observe）
→ 定位（Locate）
→ 动作（Act）
→ 验证（Verify）
→ 失败分类（Failure）
→ 恢复（Recovery）
→ Evidence
→ 达标后升级
```

## 二、能力等级

### L0 底层输入能力（Low-level Input）

鼠标、键盘、窗口、截图、剪贴板等基础能力可稳定调用。

### L1 单一固定控件（Single Fixed Control）

在固定页面中可靠识别并操作一个明确控件。

### L2 多候选控件（Multiple Candidates）

在多个相似目标中正确选择目标，并处理歧义。

### L3 复合控件（Composite Controls）

输入框、复选框、单选框、下拉框、Tab、Dialog、Slider、Drag 等组合交互。

### L4 动态 HTML Benchmark

通过可控网页制造动态位置、不同状态、异步反馈和机器可验证结果。

### L5 动态布局与干扰（Dynamic UI）

滚动、遮挡、Resize、异步加载、焦点变化、局部更新、DPI / 坐标变化等。

### L6 简单系统应用（Simple System Apps）

进入计算器、文本编辑器、设置、文件管理器等结构相对清晰的真实应用。

### L7 普通桌面应用（Ordinary Desktop Apps）

在普通真实软件中完成单页面、多控件业务任务。

### L8 动态真实 UI（Dynamic Real-world UI）

处理真实应用中的动态布局、内容变化、虚拟列表和不稳定元素。

### L9 多窗口 / 多页面（Multi-window / Multi-page）

处理窗口切换、弹窗、页面跳转、窗口身份和状态迁移。

### L10 跨应用工作流（Cross-app Workflow）

多个应用之间复制、查找、输入、保存、验证，并保持上下文一致。

### L11 复杂应用（Complex Apps）

微信、千牛等具有多区域、多状态、多窗口、业务语义和高风险动作的综合应用。

### L12 自主桌面 Agent（Autonomous Desktop Agent）

Agent 基于 Skill 和 Workflow 进行任务规划、不确定性判断、恢复和长期运行，而不是直接依赖裸坐标操作。

## 三、测试环境顺序

```text
确定性 HTML Benchmark
→ 简单系统应用
→ 普通真实应用
→ 动态真实应用
→ 多窗口
→ 跨应用
→ 微信 / 千牛等复杂场景
→ Agent 长任务
```

HTML Benchmark 用于快速复现基础问题；真实应用用于证明能力不是只在测试页面中成立。

## 四、升级条件

从当前 Level 升到下一级前，至少确认：

- 核心动作有明确成功判据。
- 不把“没有抛异常”当成业务成功。
- 能区分目标未找到、歧义、动作失败、验证失败等主要失败类型。
- 失败后有明确停止或恢复策略。
- 关键步骤能够留下 Evidence。
- 当前 Level 已有可重复的回归场景。

## 五、与其他框架的关系

- [自动化总体框架](./automation-framework.md)：定义所有 Level 共用的系统分层与执行闭环。
- [应用自动化开发框架](./app-development-framework.md)：进入真实应用后，具体应用应该如何拆解和开发。
- [Playbook 驱动自动化](./playbook-driven-automation.md)：为已进入具体应用的单次 Workflow 规定可审查计划、fail-closed 执行与 Evidence 的落地方式。
- `../quality/`：各 Level 的测试、质量门禁和 Evidence 规则。
