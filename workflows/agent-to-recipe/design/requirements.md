---
title: "Agent-to-Recipe｜需求发现与需求基线"
description: "定义 Agent-to-Recipe 为什么存在、必须满足什么、哪些范围明确不属于本工作流。"
order: 20
---

# Agent-to-Recipe｜需求发现与需求基线

本文只回答一个问题：

> **为什么需要 Agent-to-Recipe，以及这条工作流必须满足哪些业务、质量、安全和复用要求？**

本文是**需求基线**，不是某次业务任务的 TaskContract，也不是实现状态或质量报告。完整 S1—S12 见 [task-decomposition.md](task-decomposition.md)；职责与交接见 [chain-design.md](chain-design.md)；实际执行入口见 [WORKFLOW.md](../WORKFLOW.md)。

## 30 秒总览

Agent-to-Recipe 要解决的是：

```text
真实任务 / 人工开发目标 / 已有自动化资产
  ↓
得到可信事实
  ↓
提炼必要业务过程和真实数据依赖
  ↓
形成可复用规格
  ↓
生成普通 OpenDesk JavaScript
  ↓
独立验证
  ↓
成为可维护、可继续交付的自动化成果
```

它必须同时满足六类要求：

1. **忠实于来源**：用户原话、事实、未知、提案、期望和现场观察不能混写。
2. **开发链完整**：从任务定义、真实执行事实、必要步骤、业务语义到 Candidate 和 Qualification 不跳层证明。
3. **实际数据真实**：运行时读取值必须真正流向消费者，不能被示范常量或 Expected 替代。
4. **执行受控**：授权、对象身份、副作用、预算、失败和恢复都有明确边界。
5. **工程可复用**：已有能力优先复用，简单任务不过度设计，跨应用和他人复用仍可追溯。
6. **验证可区分**：文档存在、实现存在、测试通过、宿主加载、真实桌面成功和业务资格是不同事实。

## 项目背景与本工作流的职责

OpenDesk 面向工作与生活中的重复和复杂桌面任务。除了窗口、输入、界面识别、文件处理等基础能力，还需要一条开发路径，把一次真实完成的任务或已有自动化资产转成后续可重复使用的程序。

Agent-to-Recipe 负责的是**自动化成果的生产、修复和资格验证**，不是整个 OpenDesk 产品，也不是普通用户每次运行 Recipe 的 Runtime 链。

本工作流允许三类起点：

- **Agent 新任务**：从用户目标开始，取得真实执行事实，再沉淀自动化。
- **人工正向开发**：从明确开发目标和受控试验形成实现，不伪造 Agent 示范历史。
- **已有资产接续**：从现有代码、工件、Failure Package 或旧资格开始，只补第一个真实缺口。

本工作流可以交付：

- 普通 OpenDesk JavaScript；
- 必要的普通 helper / application rules；
- 在业务确实需要动态判断时，明确接入并受约束的 JS / Agent 混合流程。

已明确且可验证的步骤优先使用普通 JS。必要内容理解和动态判断可交 Agent；授权决策仍由有权主体控制。

### 本工作流明确不承担

- 不因为文档设计需要而新增 S13。
- 不把 Agent-to-Recipe 变成新的 Workflow DSL、Compiler、IR 或 Replay Runtime。
- 不把 Catalog、商城、Registry、LangGraph 或平台化作为普通 Recipe 生成的前置条件。
- 不在本文件复制 Structured Collection、VLM、AX/UIA、Recorder、Compiler 等专项技术算法。
- 不把某次 Calculator、聊天或 Collection 案例的限制升级成所有任务的全局限制。
- 不把某个 Skill 文件存在写成宿主已加载或业务已通过。

## 一、来源、事实与未知项

所有关键需求和后续结论必须区分：

| 类型 | 含义 | 约束 |
| --- | --- | --- |
| **Source** | 用户原始要求、业务背景、已有代码、文档、现场观察、外部合同 | 保留来源身份和适用范围 |
| **Fact** | 在明确版本和范围下由来源支持的事实 | 不能从“文件存在”外推“运行成功” |
| **Unknown** | 当前无法确认、会影响后续工作的事项 | 标明影响、阻塞范围和所需证据 |
| **Assumption / Proposal** | Agent 或设计者提出的候选解释／方案 | 验证前不能升级为事实 |
| **Expected Outcome** | 计划或验收期望 | 与 Actual Observation 分开 |
| **Actual Observation** | 本次真实观察到的结果 | 不能由 Expected 倒填 |

任何后层产物都不能反向改写历史 Source / Fact。

## 二、人类需求发现入口

用户不需要先编写 TaskContract JSON。自然语言、截图、样例、已有文件或明确资产引用都可以作为 Source。

Agent 必须：

1. 保留用户原始表达。
2. 形成内部结构化 TaskContract / WorkPlan。
3. 给较长任务提供可读的任务理解和操作计划，使人可以纠正业务含义。
4. 把人类纠正回写到结构化成果，而不是维护两套互相漂移的真相。
5. 只在真正缺少业务决定或授权时请求确认；能从仓库或获准现场核实的技术事实应先核实。
6. 不因为 Unknown 存在就停止全部工作；只阻塞依赖它的部分。
7. 优先验证会推翻大量后续工作的高影响 Unknown。

可读视图是结构化成果的投影，不成为第二份需求合同。

## 三、受控业务需求推导链

需求形成遵循下面的逻辑关系：

```text
Source
→ Fact / Unknown
→ Business Requirement
→ Scenario / Trigger
→ Business Chain
→ Capability
→ Functional Requirement
→ Decision / Acceptance Conditions
→ Requirement Baseline
→ Behavior Case / Test Space
→ Engineering Design
```

这不是要求每一步单独建文件，而是要求语义不能跳跃。

### 推导要求

- 先定义要改善的业务结果，再决定技术实现。
- Capability 表达业务能力，不等于 Agent Skill 或 JS 函数。
- Business Chain 表达业务对象、输入输出、前后条件和完成边界，不等于 S1—S12 开发链。
- 需求必须同时包含正常功能、失败、安全、数据、权限、成本、版本、维护和验证要求。
- 重大 Unknown 有明确研究问题、证据目标、预算和停止条件。
- 架构决定不能把 Proposal 写成已实现 Runtime。
- 验证发现需求矛盾时修订需求基线，不在 S12 末端降低标准取得通过。

## 四、业务需求叙事与范围

Agent-to-Recipe 应支持：

- 把一次真实成功任务转成后续可重复运行的自动化。
- 把已有代码与既有工件接续到正确责任环节，而不是强制从头重做。
- 把简单、清楚、可验证的任务交付为小型普通 JS，而不是以类、文件数或抽象层数衡量质量。
- 将必要动态判断显式保留为受约束的 Agent 接口；无真实 provider / host 接线时明确未集成。
- 保存必要的用途、输入、依赖、权限、支持范围、失败语义和验证方法，使成果可维护。
- 在声明他人可复用时，不依赖作者聊天、私有路径、历史窗口、个人凭据或旧通过结论。
- 对跨应用任务保存来源对象、实际值、转换、目标对象和结果之间的关系。
- 对重复 UI / collection 只在工作流层规定“需要获得什么结构事实、谁消费、怎样验证”，专项识别和 traversal 算法由专项架构拥有。

## 五、场景与触发

### 自动化开发入口

| 场景 | 需求 |
| --- | --- |
| 完整新示范与生成 | 必须取得真实执行事实、DistilledSteps、SemanticProcedure、Candidate 和独立 Qualification |
| 人工正向开发 | 保留人工来源，不追认为 Agent 示范；用受控试验支持实现 |
| 已有资产接续 | 固定来源、字节、范围和证据；只补真实缺口 |
| 独立代码改进 | 可直接消费代码基线和需求，不强迫重跑完整示范 |
| 简单受控使用 | 可以跳过无收益的深度优化，但不能跳过正确对象、实际数据、安全和必要验证 |
| 局部应用维修 | 只修受影响应用规则及候选依赖，并重验受影响范围 |
| 仅候选验收 | 固定 Candidate 后进入 S12，不先重生成 |
| 仅界面认识／审阅 | 可以形成限定认识；缺屏幕映射时不得据此执行桌面坐标动作 |

### 典型业务场景

- **确定内容发送**：目标、内容和授权已给定时，不应额外读取无关历史或增加任务级模型判断。
- **基于历史判断回复**：读取获准历史后由受约束判断决定回复／不回复／人工处理，再复用发送能力。
- **跨应用任务**：源应用实际数据必须绑定到目标业务对象并独立验证目标结果。
- **他人复用**：新的使用者依据交付说明配置自己的输入、权限和环境，不继承作者私有上下文。
- **结构化集合读取**：generic collection 结构与业务字段 mapping 分开；跨 viewport traversal 作为有副作用行为单独验证。

具体业务示例不是本需求文件的正文，见相应案例与专业方法。

## 六、可追溯的设计需求

DREQ 是需求追溯标识，不是 Runtime 枚举或新的 Gate。

### A. 来源、入口与任务定义

- **DREQ-01｜来源可信与未知显式化**：事实、假设、提案、期望、历史证据和本次观察分开；关键主张可追到来源与范围。
- **DREQ-02｜需求语义与多入口**：Agent 新任务、人工开发、已有资产可作为不同入口；不同来源的资格不能互相升级。
- **DREQ-30｜自然语言入口与内部结构化合同**：用户无需提供 JSON；结构化任务理解必须保留原始自然语言来源，并可生成可读投影供纠正。
- **DREQ-31｜执行前操作计划与早期否证**：较长任务先形成业务操作计划和检查点，优先验证高影响 Unknown；未知现场不编造点击细节。
- **DREQ-32｜计划与事实分离及偏差接续**：维护 planned → actual action → observation → verification → planDelta；计划外必要动作不能被自动删成噪音。

### B. 开发链完整性与专业交接

- **DREQ-03｜完整方法与循环**：从任务定义、事实采集、必要路径、业务语义、工程化、实现到资格完整覆盖，并保留执行／学习／可靠性闭环。
- **DREQ-04｜独立作业与交接**：每个专业职责有清楚前提、输入、输出、消费者、范围和失败返回；新 Agent 不依赖旧聊天也能继续或准确报告缺口。
- **DREQ-33｜DistilledSteps 与专业职责边界**：S7 独立负责 retain / merge / omit / recovery / unresolved 取舍；S8—S9 消费其结果，不维护第二套 Raw Action disposition。
- **DREQ-12｜设计、执行与案例分离**：任务树、WORKFLOW、专业方法、案例、合同和质量证据各有唯一职责，不以复制获得“完整”。

### C. 代码、数据与应用工程

- **DREQ-05｜生成与可选改进分离**：recipe-build 先生成或登记合格基础实现；code-rebuild 只在有真实收益时独立改进，允许不改。
- **DREQ-06｜实际数据流完整**：现场读取值必须进入真实消费者；Expected、默认答案或示范常量不能替代业务取数。
- **DREQ-07｜应用认识与框架复用**：只认识任务必需的布局、对象和规则；优先复用已验证 API / helper；一次坐标不能冒充长期身份。
- **DREQ-18｜组合能力与粒度**：框架原语、应用语义操作、组合业务能力、完整流程按输入输出和可验证目标组织，不按动作数、文件数或 Agent 数组织。
- **DREQ-20｜跨应用业务一致性**：跨应用交接保存来源对象、实际值、转换、有效条件和目标结果，不把剪贴板／旧焦点当合同。

### D. 安全、版本与验证

- **DREQ-08｜有界安全执行**：对象、授权、前提、副作用、等待、重试、探索和停止受控；动作效果 unknown 时先核对而非盲重放。
- **DREQ-09｜用途与风险适配**：单次使用、反复复用、长期交付和高风险操作采用适量但足够的工程与验证。
- **DREQ-10｜独立验证与限定晋级**：Candidate、依赖、范围和实际执行对象固定；未运行项不能通过，生成者自报不能替代资格。
- **DREQ-11｜版本追溯与变更影响**：需求、计划、事实、Profile、Procedure、Candidate 和 Qualification 保持版本关系；影响性变化只重验受影响下游。
- **DREQ-13｜Research 与 ADR 有界**：Unknown 研究有问题、证据、预算和停止条件；授权与业务偏好不能由研究者擅自决定。
- **DREQ-14｜隐私与资料生命周期**：最小权限，Secret 只引用，日志脱敏；失败与历史版本可追溯，证据丢失时降低结论而非保持假通过。
- **DREQ-15｜真实宿主与混合运行**：Skill 文件不等于实际加载；工具、权限、上下文和停止能力需单独核实；模型输出必须校验后再进入动作。
- **DREQ-16｜可复核的质量目标**：95 分是文档／能力目标，不是预设结果；硬失败不能被平均分抵消。

### E. 交付、共享与维护

- **DREQ-17｜项目目标与交付形态**：工作流服务于减少重复操作与不必要推理；按需求交付普通 JS 或真实接入的混合流程。
- **DREQ-19｜可维护与他人复用**：共享成果说明用途、输入输出、配置、依赖、支持范围、权限、验证、停止和维护边界；不携带个人凭据与私有历史。
- **DREQ-23｜同一 Agent 与轻量正常路径**：默认同一 Agent 可连续推进；内部子作业按需进入，不为每一步强制制造 handoff；已有有效成果直接复用。

### F. 应用认识、Collection 与视觉证据

- **DREQ-21｜模型主导与材料充分性**：模型可承担布局和关系理解，程序承担确定性组织与校验；认识、定位、操作三类材料充分性分别判断。
- **DREQ-22｜同源审阅与纠错**：原始证据、overlay、简化视图和属性差异来自同版数据；修订保留旧版和影响范围。
- **DREQ-24｜分层应用工程评测**：确定性工具、模型提取、规则复用、真实应用／工作流分别验证，不能互相替代。
- **DREQ-25｜Generic Collection 与业务 Mapping 分离**：结构读取形成有 provenance 的 generic item；sender / price / title 等业务字段由 Adapter / Recipe 解释。
- **DREQ-26｜多源 Observation 与无 UI tree 路径**：AX/UIA、OCR、Layout/Image、Semantic Vision 的来源和冲突保留；无 usable UI tree 时允许受控视觉路径，而不是虚构 native 事实。
- **DREQ-27｜Collection 与 Traversal 分离**：current viewport recognition 与 scroll / pagination 分开；visible count 不等于全量。
- **DREQ-28｜VLM 作者期优先与运行期受限**：VLM 默认用于 authoring proposal；运行期只有明确需要且受预算／隐私约束时才进入，并经确定性校验。
- **DREQ-29｜动态变化与部分完成**：mutation、continuity 不明、预算／timeout／cancel 时必须保存 partial 和 stop reason，不静默拼成完整集合。

## 七、用途、风险与验收强度

| 用途 | 最低要求 |
| --- | --- |
| 单次受控使用 | 正确对象、实际结果、错误和安全边界；不宣称通用复用 |
| 反复复用 | 参数、重新取数、代表性状态变化和支持范围 |
| 长期交付 | 依赖、版本、诊断、维护、回归和更新策略 |
| 对外共享 | 独立配置、运行条件、许可、脱敏和新环境重新核验 |
| 高风险操作 | 无论脚本长短都按风险执行授权、确认和副作用控制 |

requested outputs、requested scope 和适用场景应在验证前固定；失败后不能静默缩小范围取得 PASS。

## 八、需求基线与变更

需求变化时，按下面的影响链分析：

```text
Source / Requirement
→ Behavior Case
→ S1—S12 受影响节点
→ 专业职责
→ AppProfile / DistilledSteps / Procedure
→ Candidate
→ Qualification
```

不受影响的历史事实可以继续保留；依赖旧语义的下游必须重新核对。

本文件不维护逐版本迁移日志。需要设计考古时使用 Git history；实际测试和某一 commit 的质量状态见 `docs/quality/`。

## 九、当前未知与处理方向

需求基线允许 Unknown 长期存在，但必须明确 owner 和影响。例如：

- 某目标宿主的 Skill 自动加载、隔离与停止能力；
- 某业务应用的真实布局、版本、权限和结果读取方式；
- 某混合 Agent/provider 的真实接线；
- 某跨应用、共享或维护场景的实际业务合同；
- Structured Collection 专项的实现与跨平台资格；
- 实际成本、人工修订量、复用收益和成功率。

这些 Unknown 不写成“当前实现状态列表”；只有进入具体任务时才按其影响决定研究、阻塞或继续。

## 方法依据

长期方法来源包括：

- [总体自动化框架](../../../docs/frameworks/automation-framework.md)
- [任务求解方法](../../../docs/frameworks/automation-problem-solving-framework.md)
- [应用开发框架](../../../docs/frameworks/app-development-framework.md)
- [示范到自动化方法](../../../docs/frameworks/demonstration-to-automation-pipeline.md)
- [能力成熟度](../../../docs/frameworks/capability-development.md)
- [Runtime API 扩展框架](../../../docs/frameworks/runtime-api-extension-framework.md)
- [共享 Agent-to-Recipe 合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)
- [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)
- [质量门禁与证据](../../../docs/quality/gates-and-evidence.md)

本文只拥有 Agent-to-Recipe 的需求基线；实现状态、测试结果和迁移历史不在这里维护。
