---
title: "Agent-first Recorder｜设计总纲与文件地图"
description: "Agent-to-Recipe 工作流的有效决定、阅读顺序与实施前核对事项。"
order: 10
---

# Agent-first Recorder｜设计总纲与文件地图

状态：设计基线 v0.6，2026-09-10。Structured UI Collection Reading 已按最新决策收敛为“当前明确观察范围的通用集合读取”；滚动、分页、跨批去重、结束判断和后续业务控制归 Recipe。本文不新增 Collection/VLM Skill，也不表示 `UI.readCollection()`、`ObservationBundle`、`CollectionProfile`、`SemanticVisionProvider` 等目标合同已经成为 Runtime API。先读本页，无需拼接历史对话。返回[工作流总入口](../../README.md)。

## 一、当前要建设什么

- 继承[项目背景与本工作流的职责](requirements.md#项目背景与本工作流的职责)：OpenDesk 面向工作与生活中的重复及复杂任务，Agent-to-Recipe 是生产自动化成果的开发链，不是整个产品的范围。
- 从真实任务／人工开发目标／已有自动化资产出发，形成有依据、可验证并可维护的普通 OpenDesk JavaScript 与必要组合能力；存在必要判断时交付明确接入的 JS／Agent 混合流程。
- 已明确、能够验证的步骤交给 JS；必要的理解与动态判断交给 Agent；授权决策保留人工。
- 默认同一个 Agent 按工作流连续作业；专业作业、Skill、工作包、文件和 Agent 不一一对应。已有成果先复用，异常时定向补证。
- 普通脚本不以前置建设 Recorder Session、Compiler、可执行 IR、独立 Replay Runtime、LangGraph 或资产平台为条件；明确选择完整 Recorder 专项时仍遵守其独立模型和验证门槛。
- 对 list/table/timeline/grid/cards/tree/virtualized list 等重复 UI，工作流负责发现业务需要、建立／修订应用侧 CollectionProfile、生成／消费普通代码并做资格验证；跨应用技术边界只维护在[结构化界面集合读取](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。

## 二、只区分三条不同层次的链

- 需求推导链：来源 → 事实／未知 → 业务需求与场景 → 可验证需求基线，回答真正需要什么。
- 自动化开发工作流：取得可信依据 → 解释过程 → 归纳规则 → 形成程序 → 验证与维护，回答怎样生产自动化。
- 业务执行工作流：生成后的程序每次实际完成的业务步骤，计算器例子是首次计算 → 真实读数 → 再次计算 → 读取并打印。
- Capability 是需要具备的业务能力；业务 Function 不等于 JS 函数；Agent Skill 是专业作业；已有 API 和普通函数是实现方式。这些对象不能一一硬配。
- 业务运行继续按“框架原语 → 应用语义操作 → 组合业务能力 → 完整业务流程”理解粒度，不新增 Runtime 层。

Structured Collection 只增加一条职责边界，不增加开发链：

```text
AX/UIA + OCR + Screenshot/Layout
→ ObservationBundle
→ 划分记录 + 字段归属 + 结构验证
→ generic CollectionItem[]
→ App Adapter
→ Conversation[] / Message[] / Order[] 等业务对象
→ Recipe
→ 滚动 / 分页 / 跨批去重 / 结束判断 / 后续动作
```

其中 VLM 只提出 grouping/profile proposal，必须重新经过确定性结构检查；`CollectionItem[]` 与业务对象不是同一层。

## 三、建设顺序与唯一正文

- [requirements.md](requirements.md)：项目背景与业务目标、来源、事实／未知、业务叙事、开发入口、功能和质量需求及范围变更；Collection 需求只保存工作流层要求，不复制 Runtime 算法。
- [task-decomposition.md](task-decomposition.md)：完整保留工作流任务分解树、五个结果层次、S1—S12、R1—R13 对照和三个循环；Structured Collection 只作为现有节点增量，不新增 S13。
- [chain-design.md](chain-design.md)：明确环节、输入输出、组合、复用、跳过、失败和中断返回；Collection 链应保持“Profile → generic item → App Adapter → business object → Recipe”。
- [application-operations.md](application-operations.md)：负责应用认识与审阅、模型／程序／人工分工、CollectionProfile authoring、定位规则和实际应用操作；不复制集合算法。
- [code-rebuild.md](code-rebuild.md)：独立、可选的代码质量改进，不替代 recipe-build。
- [validation-plan.md](validation-plan.md)：定义行为案例、分层测试及唯一评分依据；集合结构正确、业务映射正确和完整业务流程正确必须分别验证。
- [结构化界面集合读取](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)：跨工作流唯一技术正文，定义 ObservationBundle、CollectionProfile、记录分段、字段归属、Validator、VLM proposal、generic Item、App Adapter 和 Recipe 边界。
- [计算器案例](../cases/calculator.md)：保留需求代入、数据关系、失败反例和设计演变，不因新集合能力改写已有业务事实。
- [WORKFLOW.md](../WORKFLOW.md)：保留过渡导航和当前 Skill 入口；未实现的整体调度不冒充可运行能力。
- [application-engineer/SKILL.md](../skills/application-engineer/SKILL.md)：在既有应用工程职责中认识 Collection、组织 evidence、建立 Profile、必要时使用 VLM proposal、生成 overlay 并校验；不新增 collection/VLM Skill。

建设关系仍是：需求及行为案例 → 完整任务树 → 链路／交接／测试设计 → Skill 方法与辅助程序 → 独立和组合验证。不是不可回退的瀑布链。

## 四、当前有效决定

- 先按需求语义拆任务，再分配给人、Agent Skill、普通 JS 或已有 API；不按 Agent 人数、文件数、函数数拆需求。
- 保留 recipe-build 负责生成或登记合格基础代码；code-rebuild 只做独立、按需改进；recipe-qualify 负责独立验收。
- 应用工程保留 discover／harden／repair。首次发现不依赖完整 SemanticProcedure；已有认识和规则足够时直接复用。
- 界面认识与审阅继续属于 application-engineer 内部可独立进入和评测的子作业；Structured Collection 不新增第二个 Skill。
- 模型主导初次应用认识，程序负责证据组织、坐标转换、结构校验、确定性绘图和已验证规则；人工纠错关键认识及必要批准。
- VLM 默认优先用于 authoring-time Profile 建立；运行期辅助只有确定性路线不足且任务显式允许时才评审。模型输出只作为 proposal/evidence，不直接成为 Truth。
- `Vision.runOCR()` 保持 OCR 职责，不扩成通用 GUI VLM；生产 Runtime 不嵌套 `opendesk ai` 调 Coding Agent。
- CollectionProfile 只描述“当前明确观察区域里一条 generic item 怎样识别”，不保存 `sender`、`price`、`customerName`、`conversationTitle` 等业务字段，也不保存滚动／分页策略。
- generic `CollectionItem[]` 由 App Adapter 映射成具体业务对象；业务字段解释错误不能通过篡改底层 Collection 结果掩盖。
- **滚动、分页、跨批去重、结束判断由 Recipe 负责。** 当前不把 `UI.collectCollection()` 作为目标公共 API；以后只有多个真实应用证明存在稳定、跨应用、可验证的 traversal 合同，才单独重新评审公共 helper。
- 当前也不直接发布 `UI.readCollection()`。先完成合同、fixture 和普通 JavaScript 确定性原型，再依据重复使用、生命周期和性能证据决定是否值得成为公共 facade。
- Collection 与 Target/Locator 共用 Observation 基础，但保持两个问题：Collection 回答“当前有哪些数据项”，Target/Locator 回答“选定业务对象后现在应操作哪个真实目标”。一次 CollectionItem bbox 不能直接持久化成点击目标。
- 不创建 `UI.extractList()` 万能 API、不新建 collection/VLM Skill、不创建第二份 Collection 技术正文。
- 默认全局粗识别、关键部分精查；任务必需范围含父区域、锚点、进入路径、结果、阻塞与歧义，核心不能因困难而降级。
- 材料可支持认识却缺屏幕映射时允许限定交付，但禁止据此点击；观察事实、模型解释、人审、定位和操作验证分别记录。
- 简单受控使用可以跳过不适用的深度优化，不能跳过正确对象、实际数据、必要验证、授权和安全停止。
- 普通脚本优先已有框架 API 与必要普通函数，不新增应用对象方法层；未实现 helper 不写成可执行事实。
- 执行与采集同步，关键验证在动作后发生；正常保留必要事实，详细诊断按需展开，不事后补造现场。
- 原始证据、叠加、简化结构和属性差异来自同版数据；修改保存旧版、理由和影响，下游不混用版本。
- `Vision.analyzeLayout()` 和既有颜色分割是可评测辅助，不因源码存在就宣布可靠，也不成为应用认识的强制前提。
- 来源／需求 → 行为案例 → 任务节点 → 责任 Skill／JS／API → 测试与证据保持双向对应。

## 五、Structured Collection 在工作流里的位置

### application-engineer

负责：

```text
明确要读取的重复区域
→ 复用已有 AppProfile / CollectionProfile
→ 取得最小必要 AX/UIA / OCR / Screenshot/Layout evidence
→ 必要时让 VLM 提出 grouping/profile 建议
→ 程序结构校验 + overlay review
→ 人工按需要纠正
→ 发布 versioned CollectionProfile + limits + evidence
```

### recipe-build

只使用当前真实 API 生成普通 JavaScript。如果公共 Collection API 尚未实现，就用当前公开 Accessibility / Vision / Geometry 等能力组成最小实现，或者明确记录能力缺口；不得保留貌似可运行的占位调用。

### App Adapter

负责：

```text
generic CollectionItem[]
→ 应用字段规则
→ Conversation[] / Message[] / Order[] / ...
```

### Recipe

负责：

```text
消费业务对象
→ 判断是否继续
→ 必要时滚动 / 翻页
→ 验证界面确实发生预期变化
→ 再读取当前区域
→ 按业务 identity / 规则合并和去重
→ 判断结束
→ 后续业务动作
```

### recipe-qualify

分层验证：

```text
1. 当前观察范围的 Collection 结构是否正确
2. App Adapter 的业务字段映射是否正确
3. Recipe 的滚动 / 翻页 / 去重 / 结束判断是否正确
4. 最终业务结果是否正确
```

任何一层失败都不能由另一层高分抵消。

## 六、与已有框架和合同的关系

- [框架导航](../../../docs/frameworks/README.md)、[总体框架](../../../docs/frameworks/automation-framework.md)、[任务求解](../../../docs/frameworks/automation-problem-solving-framework.md)、[示范到自动化方法](../../../docs/frameworks/demonstration-to-automation-pipeline.md)提供长期方法来源。
- [应用开发](../../../docs/frameworks/app-development-framework.md)、[能力成熟度](../../../docs/frameworks/capability-development.md)、[扩展框架](../../../docs/frameworks/runtime-api-extension-framework.md)约束应用认识、验证层次和 API 晋级。
- [结构化界面集合读取](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)是 Collection 技术边界唯一正文；本目录只维护工作流如何消费它。
- [共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)继续是字段和交接的唯一正文；Collection 不创建新的可执行 IR 或第二套 Workflow Runtime。
- [当前 API](../../../docs/api/README.md)定义可调用事实。`ObservationBundle`、`CollectionProfile`、`SemanticVisionProvider`、`UI.readCollection()` 等设计名称不能仅因文档出现就当成当前 API。

## 七、实施前仍需核对

- 先更新受新 Collection 边界影响的 requirements、task-decomposition、chain-design、application-operations 和 validation-plan 引用，旧的“公共 scroll collector / `UI.collectCollection()`”描述视为已被 v0.6 决策替代。
- 第一批实施只做 `ObservationBundle / CollectionProfile / CollectionItem` 合同、离线 fixture 和 current-region deterministic JavaScript prototype；不做滚动 collector。
- 至少用聊天会话列表、variable-height 消息 timeline、订单／表格三类案例验证“分段”和“业务映射”能独立失败。
- macOS 与 Windows 的 AX/UIA、DPI 和真实应用资格分别报告；未真机的平台不外推。
- 建模耗时、人工修订、模型费用和复用收益需要实际测量；设计评分不替代运行证据。

## 八、保留与变更规则

- 此处记录的是可审阅的需求结论、设计依据、假设和取舍，不记录模型私有思维。
- 任务级实际合同、过程、候选、笔记和交接放 `.runtime/automation-authoring/<task-id>/`；实际截图日志使用当次 execution 证据目录。
- 保留失败、局部补证和旧候选；清理 `.runtime/` 前核对引用。证据丢失应标不可复核，不能保留虚假的通过结论。
- 需求变更先修订相应基线和行为案例，再进行影响分析、更新受影响设计／Skill／代码并重验。

## 历史修订

- **v0.2**：初始归位设计材料，未改 Runtime／API、未运行计算器、未发布生产自动化。
- **v0.3**：补充项目目标、组合能力、混合运行和资产复用；不恢复已删除旧 Skill 目录。
- **v0.4**：深化 application-engineer、界面认识与审阅、同一 Agent 正常／异常路线；设计预评审不代表真实运行通过。
- **v0.5**：接入 Structured Collection 初版，并曾保留 `UI.collectCollection()` / scroll collector 作为未来目标合同。
- **v0.6（当前）**：依据最新批准方案取消“公共 `UI.collectCollection()` / Runtime traversal”方向；Collection 只负责当前明确观察范围，App Adapter 负责业务解释，Recipe 负责滚动、分页、跨批去重、结束判断和业务控制。