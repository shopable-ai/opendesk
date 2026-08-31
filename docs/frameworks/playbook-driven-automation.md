# Playbook 驱动自动化（Playbook-Driven Automation）

## 定位

本文件定义 Clawdesk 如何把一个具体、可审查的应用流程收敛成 Playbook，并让运行脚本只执行受限、可验证的数据计划。

它回答：

> 当一个 Workflow 已经有明确业务目标、状态和风险边界时，怎样让人类审查的流程说明、运行实现、测试和 Evidence 保持同一个事实，而不退化为难以复查的 click → sleep → click 脚本？

Playbook 不是通用自动化内核，也不是让 Markdown 执行任意代码的机制。它是具体应用、具体任务的受控运行契约。

## 一、适用边界

适合使用 Playbook 的流程通常具有：

- 明确且有限的 Business Goal、输入、状态序列和验收结果。
- 可审查的应用、窗口、元素和定位规则。
- 可以在每个重要动作前后重新观察与验证的闭环。
- 明确的失败停止条件、恢复边界和 Evidence 要求。

不应以 Playbook 代替以下能力：

- 尚未建立稳定状态模型的探索式 Agent 推理。
- 需要任意拖拽、画布手势或原始 mouse down/up 语义的交互。
- 未经确认就会产生不可逆外部影响的高风险业务操作。
- 为了方便而把历史绝对坐标、固定 sleep 或未经验证的视觉猜测固化为规则。

## 二、Playbook 主链

一个 Playbook 按如下主链组织：

```text
Business Goal
→ App Profile
→ State
→ Locator / Geometry
→ Verified Action
→ Workflow
→ Failure / Recovery
→ Evidence
```

### Business Goal

说明要完成的业务结果、不能发生的错误、是否允许真实动作，以及最终如何验收。目标必须可区分“API 没报错”和“业务确实完成”。

### App Profile

记录应用名称、bundle ID、可执行路径、进程与窗口身份、版本或窗口形态假设，以及权限前置条件。运行时必须重新确认这些动态身份；文档中的历史 PID、窗口号和位置不能被当作可复用事实。

### State

定义起始状态、每步动作前后的可观察状态、状态时间新鲜度和状态序号规则。对于延迟生效的控件，必须说明由哪一个后续状态证明其语义。

### Locator / Geometry

先定义元素身份和定位信号，再说明几何换算。坐标只能由当前窗口或区域原点加经审查的相对坐标推导；每次动作前需重新验证目标、窗口、显示器和命中关系。

### Verified Action

每个动作都遵循：

```text
读取新鲜状态
→ 验证 App / Window / Locator / Geometry
→ 一次受限动作
→ 读取晚于动作开始时间的新鲜状态
→ 验证预期结果
```

动作接口的语义和边界以 `docs-user-api/` 为准。例如 `mouse.clickForPID` 只可对支持 `AXPress` 的控件作 PID 定向 press；它不是画布点击、拖拽或原始鼠标 down/up 的替代品。

### Workflow

按业务顺序列出步骤、每步目标、预期前后状态、步骤间依赖和最终验收。步骤必须可逐项审查，不能把语义藏在难以复核的循环、重试或随机坐标中。

### Failure / Recovery

为状态过期、身份变化、目标歧义、动作错误和结果不符分别定义处理方式。默认选择 fail-closed：立即停止并保留证据。只有被 Playbook 明确允许且可验证的恢复才可执行；恢复不是无界自动重试。

### Evidence

规定运行报告、每步状态、截图、trace、watcher 记录、失败信息和验收摘要的输出位置。一次性产物必须进入 `.runtime/`，不作为源码提交。

## 三、PLAYBOOK.md 与 run.js 的职责

建议结构：

```text
examples/<platform>/<workflow>/
├── PLAYBOOK.md
└── run.js
```

`PLAYBOOK.md` 是面向人类的业务、风险和验证来源。它解释为什么这样做，并以受限、纯数据的 canonical contract 定义按钮、步骤和预期状态。

`run.js` 是唯一实际运行的 JavaScript 文件。它只能读取并校验 Playbook 的受限数据、调用已文档化的 Runtime API、生成 Evidence；它不应把 Markdown 当成代码 `eval`，也不应从自由文本推断动作。

因此，文档驱动不表示 Markdown 可以执行 JavaScript。推荐做法是：在 Markdown 中放置一个有明确开始和结束标记的严格 JSON contract；运行脚本使用 `JSON.parse`，再按 schema、步骤连续性、目标几何和状态关系进行校验。JSON 以外的叙述始终只供审查。

## 四、文档与代码防漂移

Playbook 必须明确哪个文件是每类事实的单一来源：

- 业务顺序、按钮身份、相对坐标、预期状态和验证依赖：`PLAYBOOK.md` 的 canonical contract。
- API 调用、身份 guard、状态新鲜度、fail-closed 控制流和 Evidence 写入：`run.js`。
- 模拟成功、注入失败、静态结构和真实无动作自检：测试与 `.runtime/` 运行 Evidence。

防漂移规则：

1. 不在 `run.js` 再维护第二份步骤或坐标表；运行时从 canonical contract 读取。
2. `run.js` 必须拒绝缺失、非 JSON、schema 不符、步骤不连续或目标不合法的 contract。
3. 回归 harness 必须从实际 `PLAYBOOK.md` 加载并驱动真实的 `run.js`，而非复制步骤定义。
4. 任何变更同时审查文档可读流程、canonical contract、运行报告结构和模拟回归结果。
5. 默认运行不得因为缺少或未 armed 的 live config 执行动作；live 路径必须另有明确短时授权。

## 五、目录与生命周期

- 稳定的 Playbook、运行脚本和可重复测试资产进入版本控制。
- 截图、watcher 状态、trace、报告、配置快照和 smoke 输出统一写入 `.runtime/runs/<workflow>/...`。
- 运行产物不放在顶层 `artifacts/`、`temp/`、`.archive/` 或 `.staging-sync/`，也不纳入提交。
- 旧入口只有在仍有调用者时才保留最薄兼容层；兼容层不得定义第二套步骤，也不得依赖未验证的模块加载语义。

## 六、测试、Evidence 与成熟度

测试要覆盖三个层次：

```text
静态 contract / 语法检查
→ 模拟状态机成功与 fail-closed 回归
→ 明确授权的真实应用闭环
```

前两层验证脚本结构、状态机和停止行为，不能代替真实应用证据。真实运行需要按能力成熟度选择环境，并满足对应的观察、定位、动作、验证和 Evidence 门槛。

一个 Playbook 的成熟度至少取决于：

- 它所依赖的底层能力已达到的 Level。
- 是否有可重复的正常路径与关键失败路径回归。
- 是否在真实目标应用中完成过对应等级的闭环验证。
- 是否保存了能够复查动作前后状态和停止原因的 Evidence。

## 七、与其他框架的关系

- [自动化总体框架](./automation-framework.md) 定义通用执行闭环和系统分层；Playbook 把该闭环落到一个有边界的具体 Workflow。
- [应用自动化开发框架](./app-development-framework.md) 定义如何理解一个应用；Playbook 记录其中一个已经建模完成的业务流程。
- [能力开发与成熟度路径](./capability-development.md) 定义何时可以进入真实应用与更高风险场景；Playbook 不得越过尚未验证的能力等级。
- `docs-user-api/` 定义 Runtime API 的实际接口语义；Playbook 与脚本都不得擅自扩展接口能力。
