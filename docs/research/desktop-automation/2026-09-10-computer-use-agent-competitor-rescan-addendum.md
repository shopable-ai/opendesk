# Computer Use / Desktop Agent / Recorder 竞品重扫补充：AstronRPA

日期：2026-09-10

> 本文是 `2026-08-31-computer-use-agent-competitor-rescan.md` 的日期化补充。保留 2026-08-31 文档作为当时快照，不回写历史判断。AstronRPA 专项分析见 `2026-09-10-astron-rpa-competitor-analysis.md`。

## 1. Tier 调整

将以下对象加入后续持续跟踪的 **Tier 0**：

| 对象 | 为什么进入 Tier 0 | OpenDesk 应学习 / 防守 |
|---|---|---|
| `iflytek/astron-rpa` | 已形成 Designer / Recorder、元素拾取、300+ 原子能力、执行器、调试、计划/调度/API/MCP、Agent 双向集成与企业运行面的完整 RPA 产品；覆盖 OpenDesk Recorder → Recipe 上下游多个关键层 | 多信号 Locator、Recorder→Workflow/Recipe、步骤级调试、Agent↔RPA 边界、MCP/API 执行入口、Secret/Plugin；避免复制重型 Designer 和组件数量竞赛 |
| `iflytek/astron-agent`（配套跟踪） | AstronRPA README 明确将 Astron Agent 作为原生 Agent 平台，并支持 Agent 调 RPA、RPA 调 Agent | 研究 Brain / Orchestration 与 deterministic Desktop Execution 的产品边界；OpenDesk 优先成为可被多种 Agent 调用的执行层，而非复制完整 Agent 平台 |

## 2. 分类调整

在原文 `F. Enterprise Agentic RPA / Computer-Use Platform` 中，后续分析应包含：

```text
UiPath Delegate / Agents / ScreenPlay
Microsoft Power Automate / Copilot Studio Computer Use
Automation Anywhere Agentic Process Automation
AstronRPA + Astron Agent
```

AstronRPA 同时横跨：

```text
C. AI Recorder / Demonstration-to-Skill
D. Agent-authored RPA / Workflow-as-Code
F. Enterprise Agentic RPA / Computer-Use Platform
```

因此不能只把它归为传统 RPA。

## 3. 新增对 OpenDesk 的直接判断

### 3.1 最优先借鉴：Locator / Picker，而不是 Designer

AstronRPA 的元素拾取覆盖 Web / Windows / Java，并允许通过 selector / XPath 等方式建立可重复定位。

但其公开 FAQ 同时暴露传统定位模型的脆弱点：浏览器插件、DPI、页面结构、ID / XPath、iframe、虚拟列表都会造成失败，最终仍需要键盘、滚动、图像和 OCR fallback。

因此 OpenDesk 应推进：

```text
AX / UIA / accessibility
+ DOM / native selector where available
+ OCR / text
+ image / visual feature
+ anchor / relative geometry
+ bounded coordinate fallback
→ one LocatorBundle
→ Target Resolver
→ ResolverDecision + Evidence
```

而不是增加多个互不关联的 `clickByXxx()` 或让用户永久选择单一定位模式。

### 3.2 Recorder 应输出语义步骤和可重定位目标

人工 Recorder 和 Agent-first Recorder 都应保留：

```text
raw input
+ actual app/window/state
+ operated target candidate set
+ nearby crop/text
+ AX/UIA/DOM/OCR/image evidence
+ before/after state
+ postcondition
```

再生成可审查普通 JavaScript Recipe。不要退回 `x/y + sleep` 宏。

### 3.3 增加步骤级调试能力

AstronRPA 已提供断点和单步调试。OpenDesk 应复用现有 `pkg/execution`、事件、artifact 和 cancellation 基础设施，逐步补：

```text
breakpoint / pause-before
continue
stepOnce
stop / cancel
currentStep
step input/output/error
locator decision
before/after evidence
```

目的不是建设第二个 Runtime，而是让长 Recipe / Recorder replay 可以在出错点检查和继续。

### 3.4 Agent 原生不等于所有步骤都交给模型

AstronRPA + Astron Agent 的双向调用说明 Agent 与 RPA 可以分层。

OpenDesk 当前更合适的边界仍是：

```text
确定、可验证、重复步骤 → OpenDesk JS
动态理解 / 分类 / 判断 → Agent
高风险授权 → Human / Policy Gate
```

MCP / HTTP 是 Agent 调用执行能力的入口，不应把模型层揉进所有 Runtime API。

## 4. 暂不提升优先级的竞品能力

以下能力进入研究池，但不因 AstronRPA 已实现就变成 OpenDesk 当前 P0：

- 重型可视化拖拽 Designer；
- 300+ 原子组件数量扩张；
- 完整企业级 Robot Fleet；
- Marketplace / 多租户控制台；
- 大型 Scheduler / Control Plane；
- 自建完整 Agent 平台、知识库、模型管理和聊天 UI。

这些能力的当前优先级低于：

```text
Target / Locator reliability
Recorder semantic capture
Verification / Evidence
step-level debug
cross-platform execution
reusable Recipe
```

## 5. 后续专项比较

在原 2026-08-31 文档的后续研究列表上增加：

1. OpenDesk Target / Locator vs AstronRPA Picker：元素身份、selector、fallback、DPI / 版本适应、ambiguity；
2. OpenDesk Recorder vs AstronRPA Recorder：raw event → semantic step → reusable asset；
3. OpenDesk execution vs AstronRPA executor/debug：pause、step、stop、error、artifact、resume 边界；
4. OpenDesk MCP / HTTP vs AstronRPA MCP / OpenAPI + Astron Agent：Brain → Hand 的调用合同；
5. OpenDesk Recipe package vs AstronRPA components/plugins：可复用资产最小 Manifest、权限、Secret 与兼容性。

## 6. 来源

- https://github.com/iflytek/astron-rpa
- https://github.com/iflytek/astron-rpa/blob/main/README.md
- https://github.com/iflytek/astron-rpa/blob/main/FAQ.zh.md
- https://github.com/iflytek/astron-rpa/releases
- https://github.com/iflytek/astron-agent
- https://github.com/iflytek/astron-agent/blob/main/docs/zh/README.md
