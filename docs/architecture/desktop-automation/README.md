# 桌面自动化专项架构导航

## 先读方法，需要设计细节时再进入本目录

日常框架与方法集中在 [docs/frameworks/](../../frameworks/README.md)：总体框架 → 任务求解 → 应用分析 → 示范到自动化。这里保存专项模型和设计合同，不要求普通 Recipe 作者逐篇阅读。

[示范到自动化执行方法](../../frameworks/demonstration-to-automation-pipeline.md)的正文已迁入 `docs/frameworks/`；原路径只保留迁移入口，第 10 节千牛案例仍在同一份主流程正文中维护。

## 按问题直接进入

| 文件 | 回答的问题 | 什么时候需要读 |
| --- | --- | --- |
| [Action Target Model](action-target-model.md) | 已经知道要操作某个对象后，怎样形成候选、消歧、动作前后条件和安全失败？ | 设计相对定位、候选消歧、动作保护和结果验证时；一般调用先看公开 API |
| [Native Accessibility](native-accessibility.md) | macOS AX / Windows UIA 的元素读取、原生动作、引用生命周期、取消和清理怎样闭环？ | 维护 Accessibility 后端、UI 菜单组合或 execution lifecycle 时；脚本调用先看公开 API |
| [结构化界面集合读取](structured-ui-collection-reading.md) | 当前界面里有很多会话、消息、订单、表格行或卡片时，怎样可靠地读成一条条通用数据？ | 设计 list／table／timeline／grid／cards／tree 等重复 UI 的读取、字段归属、多源证据和 VLM 辅助时 |
| [App Adapter Contract](app-adapter-contract.md) | 通用界面事实怎样解释成某个应用的会话、消息、订单等业务对象？ | 封装应用 helper／adapter 或划分通用与业务职责时 |
| [App Classification Policy](app-classification-policy.md) | 应用类型怎样影响架构划分与适配范围？ | 选择或设计应用适配方案时 |
| [Agent-first Recorder](agent-first-recorder.md) | 示范采集、Trace、蒸馏、IR、Compiler 与 Replay 怎样组织？ | 明确研究或实施 Recorder／编译路线时；普通 Recipe 不以此为前置条件 |
| [Recorder 与应用运行界面的共存规则](recorder-app-coexistence.md) | Recorder、普通应用界面、系统托盘和运行中的自动化脚本怎样共存，什么时候提醒、什么时候必须阻止？ | 集成 Recorder 产品入口、处理多个窗口与运行冲突、设计托盘入口和 Recorder 生命周期时 |

## 三个容易混淆的问题

### 1. 读取一批数据：看“结构化界面集合读取”

例如当前聊天列表有 8 行，需要知道每一行有哪些文字、图标、状态和来源证据。

核心关系：

```text
AX/UIA + OCR + 截图/布局
→ 界面事实
→ 划分记录
→ 关联记录内字段
→ 检查可信度
→ 通用 CollectionItem[]
→ App Adapter
→ 会话 / 消息 / 订单等业务对象
```

AI/VLM 只在不确定时提出建议，建议必须重新经过结构检查。Collection 核心只处理当前明确观察范围；滚动、分页、跨批去重、结束判断和后续业务流程由 Recipe 负责。

### 2. 已经知道要操作谁：看 Action Target Model

例如业务代码已经选中了“李四”，下一步要在当前界面可靠找到“李四”并点击。

```text
业务对象
→ Target 候选
→ AX/UIA / OCR / 图片 / 相对几何等定位证据
→ 重新解析唯一目标
→ 动作前检查
→ 点击 / 输入
→ 结果验证
```

一次 CollectionItem 的 bbox 不能直接变成永久点击目标。

### 3. “这是什么业务字段”：看 App Adapter Contract

Collection core 只说明“这个 item 里可靠看到了哪些元素”；App Adapter 才解释：

```text
field A → 联系人名称
field B → 最后一条消息
```

或者：

```text
field A → 订单号
field B → 订单状态
```

Recipe 再根据这些业务对象决定下一步怎么做。

## 与实际接口和验证的边界

实际调用以 [Desktop UI API](../../api/desktop-ui.md)、[Accessibility API](../../api/accessibility.md)、[Desktop UI API](../../api/desktop-ui.md#原生菜单选项)、[Geometry API](../../api/geometry.md) 及对应当前源码、类型与测试为准。

设计文档里的 `ObservationBundle`、`CollectionProfile`、`CollectionItem`、`SemanticVisionProvider` 或 `UI.readCollection()` 等名称不自动代表已发布 API。当前结构化集合读取先进行合同、fixture 和 JavaScript 原型验证，再决定是否值得晋级公共 API。

业务对象、授权、步骤交接与成果失效条件见[自动化任务求解方法](../../frameworks/automation-problem-solving-framework.md)。方法阅读不替代业务成功验证；目录迁移不代表本目录模型重新通过源码或真机审计。

## 目录与维护规则

本目录的 Target、Collection、Adapter、应用分类与 Recorder 文档继续保留唯一正文；不为集中阅读把技术细节全部搬进 `frameworks/`，也不在两处复制维护。

主流程迁移映射：`docs/architecture/desktop-automation/demonstration-to-automation-pipeline.md` → `docs/frameworks/demonstration-to-automation-pipeline.md`。新引用使用新路径；旧路径仅为过渡导航，不是第二份方法文档。
