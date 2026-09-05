# 自动化框架总导航

## 先看结论

OpenDesk 按“框架分类 → 任务求解方法 → 解题模式 → 案例 → 接口与验收”组织自动化知识。

不要从一串 API 名称开始设计，也不要把总体架构中的每个名词都实现成一个模块。先明确要解决的业务问题，再选择所需方法，最后只补现有能力真正缺少的机制。

本文是导航与职责边界，不是新的执行框架或第二份 API 清单。

## 一、按问题选择入口

| 现在要回答的问题 | 首选入口 | 读完应得到什么 |
| --- | --- | --- |
| 系统整体怎样组织？ | [自动化总体框架](automation-framework.md) | 共用执行闭环与系统分层 |
| 这个业务任务应该怎样解？ | [自动化任务求解方法](automation-problem-solving-framework.md) | 对象、子目标、数据依赖、验证与停止条件 |
| 一个陌生软件怎样分析？ | [应用自动化开发框架](app-development-framework.md) | 任务所需的窗口、状态、区域和应用专属知识 |
| 一次真实示范怎样变成可维护自动化？ | [示范到自动化执行方法](../architecture/desktop-automation/demonstration-to-automation-pipeline.md) | 从示范、复盘到泛化、验证的阶段与成果交接 |
| 某个能力应该放在哪一层？ | [Runtime API 扩展与定制框架](runtime-api-extension-framework.md) | Recipe、JS helper、外置服务、Native Extension 或 native owner 的选择 |
| 当前该验证到什么程度？ | [能力开发与成熟度路径](capability-development.md) | 受控测试、简单软件与复杂场景的推进顺序 |
| 某个方法现在怎样调用？ | [用户 API 文档](../api/README.md) | 当前公开签名、返回值、错误与平台限制 |

典型阅读路线：

**总导航 → 任务求解方法 → 所需的应用分析／专项模型 → 当前 API → 对应验证。**

只有明确选择 Recorder／编译路线的任务，才继续进入相关 IR、Compiler 和 Replay 工程。

## 二、沿用六类框架，不新增平行层级

这六类沿用[示范到自动化执行方法](../architecture/desktop-automation/demonstration-to-automation-pipeline.md)第 1 节的分层，只统一阅读入口与职责。

| 类别 | 回答的问题 | 主要文档归属 | 不承担什么 |
| --- | --- | --- | --- |
| A. 系统一级架构 | 系统有哪些能力，怎样协作？ | `automation-framework.md` | 不代替逐步解题或 API 教程 |
| B. 执行与解题方法 | 先判断什么，为什么采取下一步？ | 任务求解、应用开发、示范到自动化方法 | 不凭方法名声明 Runtime 已实现 |
| C. 知识与工件生命周期 | 每步留下什么，怎样交接和失效？ | 主流程文档的工件生命周期；任务求解文档的步骤交接 | 不强迫普通 Recipe 先建设工件管理系统 |
| D. 技术实现机制 | 定位、坐标、动作、接口怎样落地？ | 专项架构、扩展框架、`implementation/`、`api/` | 不内置某个应用的业务决策 |
| E. 开发与验证路线 | 怎样逐级增加不确定性并证明成熟？ | `capability-development.md`；对应质量文档 | 不把一次成功当通用能力验证 |
| F. 横切约束 | 权限、隐私、取消、副作用、成本和漂移怎样控制？ | 各方法合同与质量要求 | 不仅在文末提醒，而要进入各步骤的完成门槛 |

分类与目录不是一一对应。主流程文档跨 B、C、D、E 类，仍保持原路径；本导航以链接组织它，不因分类调整复制正文。

## 三、两条路线，共用方法但不混淆前置条件

| 路线 | 适用任务 | 交付与事实边界 |
| --- | --- | --- |
| 普通 Recipe／应用 helper | 手写或 Agent 辅助编写业务脚本、组合现有公开 API | 用普通 JavaScript 函数、必要配置和验证结果表达任务；不要求先建 IR、Compiler、Recorder 或独立 Workflow Runtime |
| Recorder／编译路线 | 明确要求采集示范、蒸馏、生成和认证程序的专项 | 复用主流程文档与 [Agent-first Recorder](../architecture/desktop-automation/agent-first-recorder.md)；其中 IR 权威源与派生产物规则只约束这条路线 |

普通 Recipe 可以复用示范方法中的目标澄清、可信执行、复盘、参数化、相对定位和扰动验证。复用这些方法不等于承诺实现所有目标架构。

这里的 Skill 首先表示有明确目标、输入输出和验证方式的业务能力；它不自动意味着必须新增 `skill.md`、Go package 或新的运行时。复杂任务可以拆成独立步骤，但步骤怎样落成文件或工具要由实际复用和交接需求决定。

## 四、单一维护位置

| 内容 | 权威维护位置 | 其他文档怎样使用 |
| --- | --- | --- |
| 系统分层与运行闭环 | `automation-framework.md` | 引用，不另造总体框架 |
| 六类解题模式、业务步骤交接 | `automation-problem-solving-framework.md` | 应用开发与主流程文档链接此处 |
| 千牛源码事实与案例反向校准 | 主流程文档第 10 节 | 方法文档只保留必要摘取和改进假设，不复制完整案例 |
| 示范的阶段门、Recorder 工件链 | 主流程文档；Recorder 专项文档 | 普通 Recipe 路线注明适用边界 |
| Target、Adapter 的设计模型 | [Action Target Model](../architecture/desktop-automation/action-target-model.md)、[App Adapter Contract](../architecture/desktop-automation/app-adapter-contract.md) | 区分架构模型与已公开 API |
| 当前接口合同 | `docs/api/`，结合当前源码、类型和 Runtime 验证核对 | 框架文档不另行定义同名公开 API |
| 能力成熟度 | `capability-development.md` | 引用受控、集成、真机和业务验证要求 |

状态用语必须区分：**源码已有、已在明确范围验证、设计建议、尚待确认**。历史文档中的 Current 或 Validated 必须保留其核验时间与范围，不能因为本次导航更新就获得新的验证状态。

## 五、目录位置：本轮保留旧路径

| 文件或内容 | 目录决定 | 理由 |
| --- | --- | --- |
| 总导航、任务求解与应用开发方法 | 放在 `docs/frameworks/` | 它们用于跨应用选方法、做判断 |
| `demonstration-to-automation-pipeline.md` | 保留在 `docs/architecture/desktop-automation/` | 同时包含方法、工件合同和目标架构；先提炼通用方法并链接，不整体搬迁 |
| `agent-first-recorder.md` | 保留在原架构目录 | 它仍是特定 Recorder 路线的架构决策与核心模型 |
| `action-target-model.md`、`app-adapter-contract.md` | 保留在原架构目录 | 属于专项模型与合同，不是通用任务教程 |
| 千牛案例 | 本轮继续由主流程第 10 节维护 | 尚无必要建立第二份完整案例或搬动 `examples/app/qianniu.js` |

未来只有当单一应用案例形成可独立维护的业务规则、验证材料和回归内容时，才考虑将案例正文独立到对应 `docs/scenarios/<app>/`。届时同步入口、章节链接和维护映射，并在原位置保留指向唯一正文的导航；不能两处长期复制维护。

本轮不创建过渡空目录，不移动源码，不重命名已有公开文档。目录治理总原则继续以 [项目文档入口](../README.md) 为准。
