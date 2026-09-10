# AstronRPA 竞品分析与 OpenDesk 借鉴建议

日期：2026-09-10

> 文档性质：Research / 竞争与产品决策输入。本文依据 AstronRPA、Astron Agent 当前公开仓库、README、FAQ、发布说明及 OpenDesk 当前 Recorder / Agent-to-Recipe 架构进行比较。竞品存在不等于 Roadmap 自动改变；本文区分“值得借鉴的机制”和“不应当前复制的产品面”。

## 1. 结论

`iflytek/astron-rpa` 应进入 OpenDesk 的 **Tier 0 持续跟踪竞品**。

它不是单纯的宏录制器，而是已经把以下能力组合成一个完整 RPA 产品面：

```text
可视化 Designer / Recorder
+ 元素拾取与定位
+ Windows / Web / Java 自动化
+ 300+ 原子组件
+ 执行器与调试
+ 计划 / 调度 / API / MCP 触发
+ Agent 双向调用
+ 插件与凭据管理
+ 企业协作 / 机器人管理
```

对 OpenDesk 最有价值的不是复制低代码 Designer 或 300+ 组件，而是研究它如何把：

```text
目标发现
→ 元素定位
→ 动作编排
→ 可调试执行
→ Agent / MCP 接入
→ 可复用流程资产
```

连接成产品闭环。

OpenDesk 更适合保持自己的差异化定位：

> **Agent-native desktop action runtime + evidence-first semantic Recorder / Recipe compiler**

即 Agent 负责必要理解与动态判断，普通 OpenDesk JavaScript 负责已经明确、可验证的确定步骤；普通 Recipe 不应被强制要求先经过复杂 IR、Compiler 或大型 Workflow Runtime。

## 2. 竞品与配套生态

### 2.1 AstronRPA

仓库：

- https://github.com/iflytek/astron-rpa

当前公开定位：企业级、Agent-ready 的开源 RPA 桌面应用，主要支持 Windows 10/11；通过可视化设计器完成桌面和网页自动化。

公开能力包括：

- 低代码 / 可视化流程设计；
- 操作录制并生成 Workflow；
- Web / Windows / Java 元素拾取与智能定位；
- 300+ UI、Office、浏览器、数据、系统类原子能力；
- 执行引擎；
- 断点、继续与单步调试；
- 直接执行、计划任务、调度、API、MCP 等触发方式；
- Agent 与 RPA 双向调用；
- 插件架构与第三方扩展；
- 凭据管理；
- 企业侧终端、机器人、协作与流程管理能力。

### 2.2 Astron Agent：最重要的官方配套

仓库：

- https://github.com/iflytek/astron-agent

Astron Agent 是 AstronRPA README 明确声明的原生 Agent 平台。两者形成：

```text
Astron Agent
→ 理解 / 推理 / Workflow / MCP / Tool
→ 调用 RPA Workflow

AstronRPA
→ 确定性桌面 / Web 操作
→ 必要时反向调用 Agent Workflow
```

这是一条值得 OpenDesk 借鉴的产品边界：

```text
Brain / Orchestration
≠
Desktop Execution / Deterministic Automation
```

OpenDesk 没有必要复制完整 Agent 平台、知识库、多模型管理和聊天产品；更合理的方向是让 OpenDesk 成为外部 Agent 可以稳定调用的“手”，同时允许 Recipe 在明确的动态判断点调用 Agent。

### 2.3 浏览器插件 / Web 元素拾取

AstronRPA FAQ 明确区分：

- 网页内容：浏览器插件模式；
- 浏览器自身 UI：桌面元素模式。

其 FAQ 还暴露了传统 selector 模型常见的真实问题：

- 浏览器插件缺失会导致拾取失败；
- 显示缩放会影响自动化；
- ID / XPath 会随页面结构变化而失效；
- iframe、虚拟列表 / 懒加载需要专项处理；
- 必要时仍要回退到键盘模拟、滚动、图像识别或 OCR。

这对 OpenDesk 的价值不仅是“也做浏览器插件”，更重要的是提醒目标定位必须是**多来源、多候选和可诊断回退**，不能把单一 XPath、单一 AX/UIA 节点或永久坐标当作最终目标身份。

### 2.4 服务端与运行配套

AstronRPA 不是只有桌面客户端。其公开 Docker 部署包含：

```text
AI Service
OpenAPI Service
Resource Service
Robot Service
MySQL
Redis
MinIO
```

OpenAPI Service 中还存在 MCP Server 实现。

这说明它的产品结构已经从“桌面录制器”扩展为：

```text
Authoring Client
+ Local Executor
+ Server Control Plane
+ API / MCP Integration
+ Resource / Robot Management
```

OpenDesk 当前不应因此立即复制完整控制平面，但需要从现在开始让 Execution、Recipe、Artifact、Credential、Permission 的数据边界可被未来调度或远程运行复用。

## 3. 与 OpenDesk 当前方向的对比

| 维度 | AstronRPA | OpenDesk 当前方向 | 判断 |
|---|---|---|---|
| 核心定位 | 企业 RPA 产品 / Designer / Robot 平台 | Cross-App Desktop Execution + Agent-to-Recipe | 高重叠，但产品层级不同 |
| Authoring | 可视化 Designer + Recorder | Agent-first / Human-to-Recipe + 普通 JS | OpenDesk 不必复制重型 Designer |
| 录制输出 | Workflow / 原子组件图 | Raw Trace → 有效路径 → Recipe；专项 Recorder 可有 Flow IR | OpenDesk 更适合源码可审查和 AI 提炼 |
| 元素定位 | Web / Windows / Java Picker + selector | AX/UIA、OCR、图像、文字、布局、相对几何正在收敛 | 这是最值得优先借鉴和超越的区域 |
| 目标模型 | 元素 / XPath / 拾取配置 | App / Window / State / Region / Target / Locator / Evidence | OpenDesk 可以做更强多信号身份模型 |
| 执行 | RPA Executor | Go + goja JS Runtime / execution | OpenDesk 更轻、更适合代码与 Agent 调用 |
| 调试 | 断点 / 单步 / Debug Log | 已有 execution event / artifact；交互式步骤调试仍可加强 | 值得补齐 |
| Agent | Astron Agent 双向集成 | MCP / HTTP / Agent-first Recorder | 产品方向高度相邻 |
| MCP / API | Workflow 可作为 MCP / API 能力 | Desktop automation MCP / HTTP | 应继续统一 Tool / Execution Contract |
| 组件生态 | 300+ 原子组件 + 插件 | Runtime JS API + Recipe / Skill | 不追数量，先追高频语义与稳定合同 |
| 调度 / Robot | 已形成企业 Control Plane | 非当前核心 | 后置，先保证执行可靠性 |
| 凭据 | 产品化 Credential 管理 | Secret / Config 需要保持引用和脱敏边界 | 值得建立统一 SecretRef 语义 |
| 平台 | Windows 10/11 为主 | OpenDesk 需要保留 macOS + Windows 跨平台抽象 | OpenDesk 的潜在差异化 |

## 4. 最值得 OpenDesk 借鉴的能力

### P0-1｜把 Recorder、Picker、AX/UIA、OCR、图像真正收敛到 Locator Bundle

这是本轮最重要结论。

OpenDesk 当前已经明确不能只记录永久坐标，并且 Recorder 架构正在建设 Target、Locator、Evidence。但通用能力仍不应停留在：

```text
一次点击
→ 一个 window-relative point
```

建议正式目标变为：

```text
TargetIdentity
  application
  window / surface
  page / state
  region
  semanticName

LocatorBundle
  candidates[]
    accessibility / UIA / AX
    DOM / app-native selector（存在时）
    text / OCR
    image / visual feature
    anchor + relative geometry
    bounded coordinate fallback

ResolverDecision
  selectedCandidate
  supportingSignals
  rejectedCandidates
  confidence / ambiguity
  fallbackUsed
  evidenceRefs
```

关键原则：

- Recorder 采集一次，尽量保留多种可重新定位证据；
- 不要求用户预先选择“AX 模式”“OCR 模式”“图像模式”；
- 回放时根据当前应用状态重新解析；
- 发生歧义时 fail closed，而不是自动点最像的一个；
- 每次定位都可以解释“为什么命中、用了哪个 fallback”。

AstronRPA 的 Picker 值得借鉴，但 OpenDesk 应把它升级为**多信号 Target Resolver**，而不是复制一个单 selector 编辑器。

### P0-2｜Recorder 记录“动作 + 被操作对象 + 前后证据”，而不是只记录输入事件

AstronRPA 已经明确提供“录制操作并生成 Workflow”的产品入口。OpenDesk 应继续沿当前 Agent-first / Human-to-Recipe 方向深化：

```text
raw mouse / keyboard event
+ actual application/window
+ target candidates
+ nearby text / crop
+ AX/UIA/DOM evidence
+ before state
+ action
+ after state
+ postcondition
→ semantic step
→ ordinary OpenDesk JS Recipe
```

对人工 Recorder 也使用同一 Target / Evidence 合同，不另造一套坐标宏格式。

### P0-3｜增加步骤级调试，但复用现有 Execution 基础设施

AstronRPA 已有断点和单步执行。这一点非常适合解决长流程中“某一步错了却需要从头重跑”的问题。

OpenDesk 不需要另建调试 Runtime，建议在现有 execution / event / cancellation 基础上逐步增加：

```text
stepId
pauseBefore / breakpoint
continue
stepOnce
stop / cancel
currentStep
step input snapshot
step output / error
locator decision
before / after evidence
```

优先服务生成 Recipe、Recorder replay 和真实业务调试。

### P0-4｜把 Agent ↔ Recipe 的责任边界做成正式合同

Astron Agent + AstronRPA 已经验证了一种清晰包装：Agent 是脑，RPA 是手。

OpenDesk 应继续坚持：

```text
确定、重复、可验证步骤
→ 普通 OpenDesk JavaScript

内容理解、动态分类、非确定性决策
→ Agent

高风险授权
→ Human / Policy Gate
```

需要补的是明确的跨边界输入输出，而不是把全部流程都变成 Agent：

```text
Agent input
→ structured decision
→ validated parameters
→ deterministic Recipe step
→ evidence-backed result
```

外部 Agent 可以通过 MCP / HTTP 调用 Recipe；Recipe 若需要 AI，只在显式动态节点调用外部 Agent / model 服务。

### P0-5｜把 RPA 的真实脆弱点纳入跨版本回归测试

AstronRPA FAQ 中出现的 DPI、XPath、iframe、虚拟列表、浏览器插件与 selector 变化非常有参考价值。

OpenDesk 应建立一组不是“API 能调用”而是“定位仍然正确”的回归案例：

```text
window moved
window resized
DPI / scale changed
same text appears twice
theme changed
minor layout changed
list scrolled / virtualized
popup / modal inserted
AX/UIA node changed but text stays
text changed but visual/icon stays
OCR unavailable
image unavailable
```

测试结果至少输出：

```text
resolved target identity
selected locator strategy
candidate count
ambiguity decision
action result
postcondition result
evidence refs
```

## 5. P1 值得借鉴，但不要抢 P0

### 5.1 Secret / Credential 引用

借鉴 AstronRPA 的凭据管理，OpenDesk 可以统一：

```text
Config value
SecretRef
runtime injection
masked log
artifact privacy scan
```

Recipe 保存 SecretRef，不保存明文。

### 5.2 Recipe / Skill 扩展包

AstronRPA 已建设插件架构和组件扩展。OpenDesk 后续可以让可复用自动化资产具备最小 Manifest：

```text
name / version
entry script
inputs / outputs
required runtime capabilities
supported platform / app versions
permissions
secret refs
tests
```

但这不是当前 Agent-to-Recipe 工作流的前置条件，也不需要马上建设大型 Registry / Marketplace。

### 5.3 Trigger / Scheduler / Remote Runner

AstronRPA 的直接、计划、调度、API、MCP 多入口说明稳定 Recipe 最终会需要非交互运行。

OpenDesk 可以先保证：

```text
same Recipe
→ CLI
→ HTTP
→ MCP
```

使用同一 Execution Contract。计划任务、队列、机器人 Fleet 和企业 Control Plane 后置。

## 6. 当前不建议复制的部分

- **不优先复制重型拖拽 Designer。** Agent-first + 可审查 JS 已经是 OpenDesk 更自然的 authoring 路线。
- **不追求 300+ 原子组件数量。** 优先补齐高频、可组合、稳定、文档和测试闭环的公共 JS API。
- **不建设完整 Astron Agent 替代品。** 外部 Agent / Codex / MCP 客户端可以成为 OpenDesk 上游。
- **不因为竞品有 Workflow 就强制普通 Recipe 进入复杂 IR / Compiler。** Recorder 专项需要 IR 时使用专项合同；普通 JS 保持轻量。
- **不先建设企业级 Robot Fleet / Marketplace / 多租户控制台。** 当前价值低于 Locator、Recorder、Debug、Verification 与可复用 Recipe。
- **不复制单一 XPath / Picker 依赖。** 竞品 FAQ 已证明这种路径仍容易受版本、DPI、页面结构和虚拟列表影响。

## 7. 对当前 OpenDesk Roadmap 的建议调整

```text
P0
1. Unified Target / Locator Bundle
2. Recorder capture enrichment: AX/UIA + OCR/text + crop/image + relative geometry
3. Resolver decision trace + ambiguity / fail-closed
4. postcondition + evidence contract
5. step-level debug / pause / continue / stop
6. Locator regression fixtures

P1
7. Agent ↔ Recipe structured boundary
8. Recipe / MCP / HTTP execution parity
9. SecretRef / credential masking contract
10. minimal reusable Recipe package manifest

P2
11. scheduler / trigger abstraction
12. remote runner / queue / fleet
13. marketplace / visual designer / enterprise control plane
```

这不是要求一次完成全部项目。当前最值得立即推进的是 P0 的 1—6，它直接提高 Recorder → Recipe 的稳定性和可测试性。

## 8. 建议与现有工作流的整合位置

不新增第二条 Agent-to-Recipe 工作流，直接补强现有环节：

```text
S2 应用认识
→ 输出 Target candidates / Region / State / multi-source evidence

S3-S5 操作与验证微循环
→ 每次 Action 绑定真实目标、Locator decision、before/after evidence

S7-S10 提炼 / 业务步骤 / 定位依据
→ 形成可执行 Locator Bundle，而不是永久坐标

S11 代码生成 / 改进
→ 优先消费普通公共 API 和 Locator contract

S12 验证
→ 加入移动窗口、缩放、重复文字、fallback、ambiguity 回归
```

人工 Recorder 与 Agent-first Recorder 均复用同一套 Target / Locator / Evidence 数据合同；区别只是原始动作来源不同。

## 9. 竞争定位

AstronRPA 更像：

```text
Enterprise RPA Product
= Designer + Components + Robot + Scheduler + Agent Integration
```

OpenDesk 更适合成为：

```text
Agent-native Desktop Execution Infrastructure
= Cross-platform Runtime
+ Semantic Target / Locator
+ Evidence / Verification
+ Recorder → Recipe
+ MCP / HTTP / JavaScript
```

真正值得竞争的不是“有没有 300 个组件”，而是：

> 同一个真实桌面任务，换窗口位置、轻微换版本、出现重名控件或局部布局变化后，是否仍能找到正确业务对象、解释定位依据、验证结果，并在不确定时安全停止。

如果 OpenDesk 在这条链路上做深，它可以与传统 RPA 形成明显区别，同时又能被 Agent、浏览器自动化和业务系统作为底层执行能力组合使用。

## 10. 主要公开来源

- AstronRPA repository: https://github.com/iflytek/astron-rpa
- AstronRPA README: https://github.com/iflytek/astron-rpa/blob/main/README.md
- AstronRPA FAQ: https://github.com/iflytek/astron-rpa/blob/main/FAQ.zh.md
- AstronRPA releases: https://github.com/iflytek/astron-rpa/releases
- Astron Agent repository: https://github.com/iflytek/astron-agent
- Astron Agent Chinese README: https://github.com/iflytek/astron-agent/blob/main/docs/zh/README.md
