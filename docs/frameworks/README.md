# 自动化框架总导航

## 先看结论

OpenDesk 按“框架分类 → 任务求解方法 → 解题模式 → 案例 → 接口与验收”组织自动化知识。

不要从一串 API 名称开始设计，也不要把总体架构中的每个名词都实现成一个模块。先明确要解决的业务问题，再选择所需方法，最后只补现有能力真正缺少的机制。

本文是导航与职责边界，不是新的执行框架或第二份 API 清单。核心方法集中在本目录；Target、Adapter、Recorder 等专项设计通过直接链接按需阅读，无需遍历整个 `docs/architecture/`。

## 一、主阅读线与按需分支

### 主阅读线：先理解怎样做自动化

| 学习顺序 | 文档 | 读完应得到什么 |
| --- | --- | --- |
| 1. 看全貌 | [自动化总体框架](automation-framework.md) | 系统有哪些能力，怎样协作 |
| 2. 学解题 | [自动化任务求解方法](automation-problem-solving-framework.md) | 业务对象、子目标、数据交接、验证与停止条件 |
| 3. 认识软件 | [应用自动化开发框架](app-development-framework.md) | 任务所需的窗口、状态、区域和应用专属知识 |
| 4. 从示范到复用 | [示范到自动化执行方法](demonstration-to-automation-pipeline.md) | 从真实执行、复盘、泛化到验证的阶段与成果交接；第 10 节为千牛案例 |

这是学习顺序，不是要求每个任务开始前都重新读完四份文件。已有任务合同和应用认识可以在有效条件满足时复用。

### 按需分支：进入当前问题所需的细节

| 当前问题 | 直接入口 | 阅读时机 |
| --- | --- | --- |
| 怎样表示目标、处理歧义与安全失败？ | [Action Target Model](../architecture/desktop-automation/action-target-model.md) | 设计定位、动作前置条件、业务验证或失败策略时阅读；不是使用每个 UI 方法前的必读项 |
| 通用结构与应用专属语义怎样分开？ | [App Adapter Contract](../architecture/desktop-automation/app-adapter-contract.md) | 封装应用 helper／adapter 时阅读 |
| 怎样实现录制、蒸馏、编译和回放？ | [Agent-first Recorder](../architecture/desktop-automation/agent-first-recorder.md) | 仅在明确研究或实施 Recorder／编译路线时深入阅读；普通 Recipe 可以跳过 |
| 能力应该在哪一层扩展？ | [Runtime API 扩展与定制框架](runtime-api-extension-framework.md) | 选择 Recipe、JS helper、外置服务、Native Extension 或 native owner 时阅读 |
| 当前该验证到什么程度？ | [能力开发与成熟度路径](capability-development.md) | 确定受控、集成、真机与业务验证范围时阅读 |
| 某个方法现在怎样调用？ | [用户 API 文档](../api/README.md) | 编写实际调用时核对签名、结果、错误与平台限制 |

剩余桌面专项文件及边界见[桌面自动化架构导航](../architecture/desktop-automation/README.md)。方法指导选择，架构解释设计，当前 API 才定义实际可调用合同。

## 二、沿用六类框架，不新增平行层级

这六类沿用[示范到自动化执行方法](demonstration-to-automation-pipeline.md)第 1 节的分层，只统一阅读入口与职责。

| 类别 | 回答的问题 | 主要文档归属 | 不承担什么 |
| --- | --- | --- | --- |
| A. 系统一级架构 | 系统有哪些能力，怎样协作？ | `automation-framework.md` | 不代替逐步解题或 API 教程 |
| B. 执行与解题方法 | 先判断什么，为什么采取下一步？ | 任务求解、应用开发、示范到自动化方法 | 不凭方法名声明 Runtime 已实现 |
| C. 知识与工件生命周期 | 每步留下什么，怎样交接和失效？ | 主流程文档的工件生命周期；任务求解文档的步骤交接 | 不强迫普通 Recipe 先建设工件管理系统 |
| D. 技术实现机制 | 定位、坐标、动作、接口怎样落地？ | 专项架构、扩展框架、`implementation/`、`api/` | 不内置某个应用的业务决策 |
| E. 开发与验证路线 | 怎样逐级增加不确定性并证明成熟？ | `capability-development.md`；对应质量文档 | 不把一次成功当通用能力验证 |
| F. 横切约束 | 权限、隐私、取消、副作用、成本和漂移怎样控制？ | 各方法合同与质量要求 | 不仅在文末提醒，而要进入各步骤的完成门槛 |

分类与目录不是一一对应。主流程文档跨 B、C、D、E 类，但作为常读的执行方法集中在 `docs/frameworks/`；专项实现设计仍由架构目录中的唯一正文维护。

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
| 千牛源码事实与案例反向校准 | [主流程文档第 10 节](demonstration-to-automation-pipeline.md#10-qianniujs-真实案例反向校准) | 方法文档只保留必要摘取和改进假设，不复制完整案例 |
| 示范的阶段门、Recorder 工件链 | 主流程文档；Recorder 专项文档 | 普通 Recipe 路线注明适用边界 |
| Target、Adapter 的设计模型 | [Action Target Model](../architecture/desktop-automation/action-target-model.md)、[App Adapter Contract](../architecture/desktop-automation/app-adapter-contract.md) | 区分架构模型与已公开 API |
| 当前接口合同 | `docs/api/`，结合当前源码、类型和 Runtime 验证核对 | 框架文档不另行定义同名公开 API |
| 能力成熟度 | `capability-development.md` | 引用受控、集成、真机和业务验证要求 |

状态用语必须区分：**源码已有、已在明确范围验证、设计建议、尚待确认**。历史文档中的 Current 或 Validated 必须保留其核验时间与范围，不能因为导航或目录更新就获得新的验证状态。

## 五、目录位置与迁移记录

| 文件或内容 | 当前目录决定 | 理由 |
| --- | --- | --- |
| 总导航、任务求解与应用开发方法 | `docs/frameworks/` | 跨应用选方法、做判断，集中日常阅读 |
| `demonstration-to-automation-pipeline.md` | 正文从 `docs/architecture/desktop-automation/` 迁入 `docs/frameworks/` | 核心职责是从示范到复用的执行方法，与其他方法同目录阅读 |
| `agent-first-recorder.md` | 保留在 `docs/architecture/desktop-automation/` | 特定 Recorder 路线的架构决策与核心模型，按需进入 |
| `action-target-model.md`、`app-adapter-contract.md` | 保留在原架构目录 | 专项模型与合同，不是通用任务教程 |
| 千牛案例 | 随迁入后的主流程第 10 节维护 | 不拆出第三个日常阅读位置，不搬动 `examples/app/qianniu.js` |

旧主流程路径只保留迁移说明和常用章节入口，不维护第二份正文；当前维护的引用应使用新路径。旧入口并非 HTTP 自动重定向，也不承诺兼容所有外部书签锚点。

未来只有当单一应用案例形成可独立维护的业务规则、验证材料和回归内容时，才考虑将案例正文独立到对应 `docs/scenarios/<app>/`。届时同步入口、章节链接和维护映射，并在原位置保留指向唯一正文的导航；不能两处长期复制维护。

本次目录调整只迁移主流程并修正导航和链接，不重新解释原阶段、重写 Recorder 决策或修改源码。目录治理总原则继续以 [项目文档入口](../README.md) 为准。
