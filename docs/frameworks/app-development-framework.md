# 应用自动化开发框架（App Development Framework）

## 定位

本文件定义新增一个具体桌面应用时的标准分析、开发、验证和封装方法。

它回答：

> 面对微信、千牛、计算器、设置、文本编辑器等具体应用，应该怎样把应用界面和业务流程转化为可靠的 Clawdesk 自动化？

## 一、应用开发主链

```text
业务目标（Business Goal）
→ 应用画像（App Profile）
→ 窗口发现（Window Discovery）
→ 页面 / 状态识别（Page / State Detection）
→ 区域模型（Region Model）
→ 元素定位（Element / Locator）
→ 空间与坐标解析（Geometry）
→ 可验证动作（Verified Action）
→ 业务技能（Skill）
→ 工作流（Workflow）
→ 长期运行监督（Supervisor）
→ 测试与证据（Test / Evidence）
```

## 二、应用结构模型

具体应用优先按以下层级理解：

```text
应用（Application）
└── 窗口（Window）
    └── 页面 / 状态（Page / State）
        └── 区域（Region）
            └── 元素（Element）
```

例如聊天类应用可以进一步拆成：

```text
主窗口
├── 导航区域
├── 会话列表
└── 会话区域
    ├── 顶部信息区
    ├── 消息列表
    └── 输入区域
```

## 三、开发步骤

### 1. 明确业务目标

先定义任务、输入、输出、成功结果和不能发生的错误。

### 2. 建立应用画像（App Profile）

识别应用进程、窗口类型、主要页面、主题 / 版本差异和可用结构化接口。

### 3. 建立窗口发现（Window Discovery）

找到正确应用和窗口，并确认窗口身份、前台状态和可见范围。

### 4. 建立页面与状态识别（Page / State Detection）

判断当前处于哪个页面、业务状态或交互阶段。

### 5. 建立区域模型（Region Model）

先定位稳定的大区域，再在区域内部寻找具体元素。

### 6. 建立元素定位器（Locator）

根据场景组合 Accessibility、DOM、文本、OCR、图色、模板、Anchor、相对位置、布局或 Vision 等信号。

### 7. 建立空间与坐标关系（Geometry）

明确窗口坐标、区域坐标、截图坐标、元素坐标之间的转换，不把历史屏幕坐标当成元素身份。

### 8. 建立可验证动作（Verified Action）

重要动作统一采用：

```text
检查前置状态
→ 定位目标
→ 执行动作
→ 再次观察
→ 验证结果
```

### 9. 封装业务技能（Skill）

把多个可靠动作组合成有明确业务语义的能力，例如：

```text
打开联系人
发送消息
读取消息
查找订单
保存文件
```

### 10. 组成工作流（Workflow）

把 Skill、条件、分支、等待、验证和恢复组合成一次完整业务任务。

### 11. 增加长期运行监督（Supervisor）

需要连续运行时，再增加事件等待、轮询、暂停、恢复、退避、去重、Checkpoint 和失败上限。

### 12. 建立测试与 Evidence

从单个 Locator / Action 测试，到 Skill、单次 Workflow、连续运行和真实应用回归测试逐层验证。

## 四、应用开发十问

开始写具体应用脚本前，先回答：

1. 当前要完成什么任务？
2. 涉及哪些应用和窗口？
3. 当前有哪些页面和状态？
4. UI 可以拆成哪些稳定区域？
5. 需要操作哪些元素？
6. 每个元素有哪些可用识别信号？
7. 动态位置和坐标怎样从 Anchor / Region 推导？
8. 每个重要动作执行后怎样证明成功？
9. 主要失败方式是什么，失败后怎样恢复或停止？
10. 哪些动作应该进一步封装成 Skill 和 Workflow？

## 五、脚本分层参考

应用脚本不应长期停留在：

```text
click
→ sleep
→ click
→ type
```

建议逐步形成：

```text
发现（Discovery）
→ 感知与状态（Perception / State）
→ 定位（Locator）
→ 可验证动作（Verified Action）
→ 业务技能（Skill）
→ 单次工作流（Workflow）
→ 连续运行监督（Supervisor）
```

旧应用脚本中的窗口发现、图色判断、相对位置、业务组合和连续运行逻辑可以作为经验来源；固定坐标、固定 sleep、动作后直接返回 true 等做法只能作为待改进的历史实现，不能成为通用规则。

## 六、通用与应用专属边界

应该进入通用框架的能力：

```text
窗口观察
截图
目标候选
坐标转换
动作执行
结果验证
失败分类
恢复机制
Evidence
```

应该留在具体应用中的内容：

```text
应用标题和进程特征
页面和业务状态
专属区域和元素语义
业务 Skill
业务 Workflow
应用专属验证规则
```

## 七、与其他框架的关系

- [自动化总体框架](./automation-framework.md)：定义所有应用共用的执行闭环和系统分层。
- [能力开发与成熟度路径](./capability-development.md)：定义应该在什么成熟度阶段进入何种真实应用。
- `../architecture/desktop-automation/app-adapter-contract.md`：具体 App Adapter 的详细结构契约。
- `../architecture/desktop-automation/action-target-model.md`：目标、区域、候选和坐标的专项模型。
- `../quality/`：失败分类、测试、质量门禁和 Evidence。
