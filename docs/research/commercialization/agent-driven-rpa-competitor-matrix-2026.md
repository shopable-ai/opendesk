# Agent-driven RPA 全球竞品能力矩阵（2026-09）

更新时间：2026-09-16  
OpenDesk 基准提交：`dc6ef311c879186aeb9c813e398d4b512c52cb85`

> 文档性质：Research / Competitive Evidence。
>
> 本文用于回答“OpenDesk 真正和谁竞争、哪些能力稀缺、哪些 Top 3 / Top 1 小山头值得公开验证”。它不是全球排名证明。`✅` 表示本轮从当前公开官方资料或当前 OpenDesk 仓库取得明确证据；`◐` 表示相邻/部分成立或不是主产品路径；`?` 表示本轮没有取得足够证据，不能写成“没有”；`—` 表示明确不在该产品当前主要支持范围。

## 1. 结论先行

本轮重新核验以后，不能再用下面的叙事建立差异：

```text
别人只有 CLI
别人没有 UI
别人没有 Recorder
别人只会让 Agent 点电脑
```

这些说法已经不准确：

- Cua 当前有跨平台 Driver、CLI/MCP/SDK、Agent trajectory recorder；仓库也保留 Gradio UI / demonstration 数据采集能力；
- Peekaboo 当前是 macOS CLI + menu-bar App + Agent + MCP，并有权限引导、可视反馈和 Sessions；
- ADH 已经把 Agent 探索明确接到 readable Robot Framework、validate、run、evidence、reuse；
- OpenAdapt 已把“人工演示 → 编译确定性 workflow → 独立结果验证 → governed repair”作为核心产品方向；
- Codex 已有 macOS Record & Replay，可把一次人工演示变成 reusable skill，同时 Computer Use 已覆盖 macOS / Windows；
- UiPath Delegate Public Preview 已支持自然语言、语音、屏幕录制、desktop computer use 与 reusable Routines；
- Microsoft Copilot Studio Computer Use 已提供 Windows desktop/web agent execution、机器运行环境和 session replay/audit；
- Automation Anywhere 已经把 AI Agents、RPA、orchestration、UI Agents、governance 与 enterprise delivery 合并进 Agentic Process Automation 平台。

因此 OpenDesk 真正值得证明的不是“有没有某个按钮”，而是：

> **Agent-first 和 Human-first 是否能以较低首次制作成本，最终汇合到可读、可验证、低成本复跑、可维修、可交付的桌面自动化资产。**

## 2. 当前全球直接竞争集合

| 产品 | 主要定位 | 官方主要平台/环境 | 主要受众 |
| --- | --- | --- | --- |
| OpenDesk | Agent-driven desktop RPA / local automation runtime | macOS + Windows；部分接口另有资格边界 | Coding Agent、自动化开发者、后续普通用户/交付者 |
| Cua | Give AI agents computers they can use；Driver / Fleets / Bench | macOS + Windows + Linux | AI Agent 开发者、Computer Use 团队 |
| Peekaboo | macOS native UI automation / CLI / App / MCP | macOS 15+ | macOS Agent / automation developers |
| ADH | Windows computer use + reusable RPA for AI agents | Windows | Coding Agent、Windows RPA developers |
| OpenAdapt | demonstrated GUI workflow → governed deterministic automation | browser / native desktop / RDP / Citrix 路线；当前 signed native distribution 仍有发布边界 | 重复 GUI 工作、受治理自动化 |
| Codex | Coding Agent + Computer Use + Record & Replay | Computer Use: macOS + Windows；Record & Replay 当前公开为 macOS eligible Business | Coding Agent / teams |
| Claude Cowork / Claude Code | Agent + Computer Use | macOS + Windows Desktop | knowledge workers / developers |
| UiPath Delegate | general-purpose desktop AI agent + reusable Routines | UiPath 企业环境；本轮不把平台细节外推成全平台结论 | 企业用户 / RPA teams |
| Microsoft Copilot Studio Computer Use | Windows computer-use tool for agents | Windows machine / hosted browser / Cloud PC / BYOM | Microsoft / Power Platform 企业用户 |
| Automation Anywhere APA | enterprise Agentic Process Automation | Cloud / on-prem enterprise platform，UI Agent + RPA + orchestration | enterprise automation teams |

## 3. 统一能力矩阵

### 3.1 Authoring / Computer Use

| 能力 | OpenDesk | Cua | Peekaboo | ADH | OpenAdapt | Codex | Claude | UiPath Delegate | MS Computer Use | Automation Anywhere |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Agent-first desktop computer use | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 普通用户可见 App / UI | ✅ | ◐ | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Human demonstration / recorder | ✅ | ◐ | ? | ? | ✅ | ✅ Record & Replay | ? | ✅ screen recording | ? | ? |
| Agent trajectory / execution evidence capture | ✅ | ✅ | ✅/◐ | ✅ | ✅ | ◐ | ◐ | ✅/◐ | ✅ | ✅ |
| Accessibility / semantic UI tree | ✅ Experimental | ✅ | ✅ | ✅ | ◐ OCR/geometry + target logic | product-internal | product-internal | product-internal | 主要视觉 Computer Use | product-internal |
| Cross-platform native desktop focus | ✅ macOS+Windows | ✅ macOS+Windows+Linux | — 官方 macOS | — Windows | ◐ 多 surface，当前发布资格分开看 | ✅ macOS+Windows CU | ✅ macOS+Windows CU | ? | — Windows machine | ✅ enterprise cross-platform execution claims |

### 3.2 从一次成功到可复用资产

| 能力 | OpenDesk | Cua | Peekaboo | ADH | OpenAdapt | Codex | Claude | UiPath Delegate | MS Computer Use | Automation Anywhere |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Readable / reviewable automation asset | ✅ JavaScript Workflow | ◐ recipes / code 可自行组合，Driver 主轴不是 compiler | ◐ CLI/scriptable | ✅ `.robot` | ✅ compiled script/workflow | ✅ reusable skill | ? | ✅ Routine | ◐ agent configuration / flow | ✅ automation / workflow |
| Agent exploration → reusable RPA | 目标链已明确，完整 qualification 未闭环 | ◐ 可由 Agent+代码实现，非 Driver 核心合同 | ◐ 可脚本化，未取得 compiler 合同 | ✅ 明确主链 | ◐ demonstration-first | ◐ Agent + Skill/R&R 相邻 | ? | ✅/◐ Delegate 可保存 Routine | ◐ | ✅/◐ enterprise authoring |
| Human demonstration → reusable automation | ✅ Recorder→actions→JS candidate，仍需完整业务 qualification | ◐ demonstration/trajectory 存在，但当前主轴偏数据/轨迹 | ? | ? | ✅ 核心 | ✅ Record & Replay→Skill | ? | ✅ screen recording→Routine | ? | ? |
| 固定输入/参数化复跑 | ✅ Execution.input / JS | SDK/代码层可实现 | CLI/script 层可实现 | ✅ JSON inputs / Robot | ✅ | skill 参数化语义需按具体技能验证 | ? | ✅ Routine | ◐ | ✅ |
| 默认 healthy path 可避免每次 LLM 重规划 | ✅ 普通 JS recipe | ◐ 取决于调用层 | ◐ 取决于脚本/agent 使用方式 | ✅ Robot | ✅ 明确 deterministic healthy path | ? Skill 可复用但执行工具可含 CU | ? | ◐ Routine 内部实现需按实际验证 | ❌/◐ Computer Use 本身为 AI tool | ✅ RPA 路径 |

### 3.3 Verification / Repair / Delivery

| 能力 | OpenDesk | Cua | Peekaboo | ADH | OpenAdapt | Codex | Claude | UiPath Delegate | MS Computer Use | Automation Anywhere |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Structured run artifacts / evidence | ✅ | ✅ trajectory before/after | ✅ structured output/snapshots | ✅ canonical events/artifacts | ✅ evidence contract | ◐ product logs | ◐ product logs | ✅ audit controls | ✅ session screenshots/actions/log export | ✅ enterprise audit/governance |
| 独立业务结果 verification contract | ◐ 有验证模式/案例，通用商业 contract 仍需闭环 | ◐ Bench/evaluator 与独立验证可做，Driver 非通用业务 contract | ? | ✅ assertions + evidence，但业务 system-of-record 视任务 | ✅ 核心：independent system-of-record read | ? | ? | ◐ audit 不等于独立业务 oracle | ? | ◐ enterprise outcome/governance，具体独立 oracle 需按方案 |
| Fail-closed / false-success 明确设计 | ✅ 多 API 有 ambiguity/stale/safety 边界；整体业务层仍需 benchmark | ✅ 部分工具严格 snapshot/target 边界 | ✅ fresh snapshot / scoped actions | ✅ validate/evidence | ✅ 核心 | product safety controls，业务层需验证 | product safety controls，业务层需验证 | ✅ approval/governance；业务 false-success 需测 | ✅ security/supervision；官方仍公布 desktop success limitation | ✅ governance/self-healing；需同任务验证 |
| Repair / diagnosis | ◐ Evidence + Measurement + Locator/Repair 建设中 | ◐ agent 可重新观察；固定 workflow repair 非主轴 | ◐ diagnostics 强，workflow repair 未取得证据 | ✅ evidence-driven diagnose/refine | ✅ governed repair | ◐ Agent 可重做/改 Skill，成本需测 | ◐ | ◐ agent/routine adaptation 需测 | ◐ AI adaptation / logs | ✅ self-healing claim，需实测 |
| Client delivery / packaging | ✅ `.js` + `.odpkg` + signature/license/device-bound chain | ◐ Driver/Fleet distribution，不等于客户 workflow package | ◐ 工具安装，不等于业务 asset packaging | ◐ runtime + Robot source | ◐ launcher/desktop，当前 signed native release 有边界 | ✅ workspace/plugin/skill sharing，但不是独立本地 workflow licensing | ◐ workspace/product delivery | ✅ enterprise sharing/governance | ✅ enterprise publishing/machine config | ✅ enterprise deployment/governance |
| 独立开发者商业 License / protected workflow | ✅ 已有受保护包与 License 链；Windows live qualification 仍有限 | ? | ? | ? | ? | ? | ? | enterprise platform license | enterprise platform license | enterprise platform license |

## 4. 最重要的竞争判断

### 4.1 不应再把 Cua / Peekaboo 当成“只有程序员 CLI”

Cua：

- 当前 Driver 明确支持 CLI、MCP、typed SDK；
- macOS / Windows / Linux；
- trajectory recorder 保存每个动作的 before/after state、screenshots、arguments，并可渲染 demo；
- 仓库仍有 Gradio UI / demonstration 数据采集代码。

Peekaboo：

- 当前是 CLI + menu-bar App；
- App 提供 permission onboarding、visual feedback、Agent Sessions；
- MCP 可连接 Codex、Claude Code、Cursor 等；
- 它在 macOS native action、background delivery、snapshot freshness 等方面是强直接对手。

OpenDesk 只能通过“Recorder UI 最后形成什么资产、复跑成本如何、验证/维修/交付是否更完整”拉开差异。

### 4.2 ADH 是 Agent → reusable RPA 山头的强直接对手

ADH 已公开定义：

```text
Explore
→ Author readable Robot Framework
→ Validate
→ Run bounded task
→ Diagnose from canonical evidence
→ Refine and reuse with new JSON inputs
```

因此 OpenDesk 不能只用“Agent 生成脚本”作为领先点。真正可比较的是：

- macOS + Windows 覆盖；
- Human Recorder 与 Agent authoring 是否汇合；
- JavaScript vs Robot authoring成本；
- business verification；
- repair；
- package/license/client delivery。

### 4.3 OpenAdapt 是 Demonstration → verified automation 山头的强直接对手

OpenAdapt Flow 当前主张非常接近 OpenDesk 想争的位置：

```text
Record demonstration
→ compile workflow
→ deterministic healthy path
→ independent result verification
→ uncertainty halt / reconciliation
→ governed repair
```

因此“录一次，以后重复”本身已经不是稀缺主张。OpenDesk 要赢，需要证明：

- Agent-first 与 Human-first 双入口；
- 跨平台作者/Runtime 体验；
- 更低 authoring/replay/repair 成本；
- client delivery / licensing；
- 更适合 Coding Agent / JavaScript developer 生态。

### 4.4 UiPath Delegate 使“自然语言 + 录屏 + reusable routine”不再是空白

2026-08-25 Public Preview 已公开：

- natural language / voice / screen-recording task input；
- native computer use across desktop apps, browsers, files, terminals；
- Routines 可保存、分享、按需/触发器/计划运行。

所以 OpenDesk 不应把“Agent + Recorder + reusable workflow”写成无人竞争。更可行的小山头是：

> **面向 Coding Agent / independent automation developer 的轻量、可审阅、可本地交付的 Agent-driven RPA。**

### 4.5 Microsoft 的公开限制说明“Computer Use → reliable RPA”确实存在市场问题

Microsoft Copilot Studio 当前 FAQ 明确写出 Computer Use 成功率随任务变化：web-based tasks 约 80%，desktop apps 约 35%，并说明同任务表现可能不一致、复杂控件和 loops/stuck states 仍是限制。

这不是 OpenDesk 的领先证明，但它是一个强市场信号：

> **单纯让模型每次实时操作桌面，距离长期、稳定、可验证的生产自动化仍有明显距离。**

## 5. 五个小山头：重新评分

这组分数是内部“机会决策分”，不是市场排名。新增 `证明准备度`，防止把“机会很大”误写成“已经领先”。

评分维度仍按：当前能力 25、相对稀缺 20、需求信号 20、可证明性 15、营销表达 10、商业延展 10。

| 位置 | 机会分 | 证明准备度 | 竞争结论 |
| --- | ---: | ---: | --- |
| **Agent-authored Desktop Automation Commercial Delivery Runtime** | **86/100** | 58/100 | **最值得争 Top 1 的更窄山头**；需要先定义为 independent developer/client delivery，而非 enterprise RPA 总市场 |
| **Human + Agent → Same Maintainable Workflow / Recipe** | **84/100** | 45/100 | **Top 3 候选**；UiPath Delegate / Codex R&R / OpenAdapt 都构成压力，关键在“双入口汇合到同一种可维护资产” |
| **Agent → Verified Reusable Desktop RPA** | **82/100** | 52/100 | **主品牌山头 / Top 3 候选**；ADH、OpenAdapt、UiPath Delegate 已是直接强对手 |
| Cross-platform Agent Desktop Runtime + Low-token CLI + Recorder UX | 76/100 | 68/100 | 当前能力较实，但 Cua / Peekaboo 强，不适合用“CLI 第一”做主定位 |
| Evidence / Measurement / Repair-driven RPA Authoring | 72/100 | 43/100 | 技术护城河候选，市场表达较弱，需先形成真实 repair 数据 |

### 为什么品牌山头不是机会分最高的 Delivery Runtime？

因为品牌定位必须足够大，能够覆盖开发者流量、普通用户 Recorder、未来行业工作流和长期平台扩张。

因此：

```text
品牌主山头
= Agent → Verified Reusable Desktop RPA

更窄的 Top 1 候选
= Agent-authored automation commercial delivery runtime

核心 Top 3 产品体验
= Human + Agent → same maintainable workflow
```

三者不是冲突关系，而是一条产品链的不同竞争切面。

## 6. 当前不能宣传什么

在没有完成同任务 Benchmark 以前，不能宣传：

- OpenDesk 已是全球 Agent-driven RPA Top 3；
- OpenDesk 是全球第一 Agent RPA；
- OpenDesk Recorder 比 Cua / UiPath / OpenAdapt 更强；
- OpenDesk replay 比 Codex Record & Replay 成本更低；
- OpenDesk repair 已优于 enterprise self-healing RPA；
- OpenDesk 的 Windows 与 macOS 在所有链路等价 production-ready。

可以宣传的是：

- OpenDesk 当前明确选择 `Agent-driven RPA`；
- 目标是把一次 Agent/Human 成功沉淀成 verifiable/reusable workflow；
- 已有 AI CLI、Recorder、JavaScript Workflow、Execution artifacts、受保护包/License 等可测试组件；
- 已公开定义将通过 First-run / Replay / Repair / Delivery Benchmark 证明竞争位置。

## 7. 下一步必须用 Benchmark 替代功能表格

矩阵只能决定“值得测谁、测什么”，不能证明排名。

下一步正式质量合同：

[`Agent-driven RPA Competitive Benchmark`](../../quality/agent-driven-rpa-competitive-benchmark.md)

需要至少比较：

```text
OpenDesk
Cua
ADH
OpenAdapt
Codex Record & Replay / Computer Use
UiPath Delegate（可公平取得环境时）
Peekaboo（macOS track）
Microsoft Computer Use（Windows enterprise track，可取得环境时）
```

无法取得合法、可重复环境的竞品统一标记 `UNTESTED`，不能自动判输。

## 8. 本轮主要公开来源

访问日期：2026-09-16。

- Cua README: https://github.com/trycua/cua
- Cua trajectory recording: https://cua.ai/docs/how-to-guides/driver/record-and-render-a-trajectory
- Peekaboo README: https://github.com/openclaw/Peekaboo
- ADH README: https://github.com/xuyw1997/agent-desktop-harness
- OpenAdapt Flow: https://github.com/OpenAdaptAI/openadapt-flow
- OpenAdapt Desktop: https://github.com/OpenAdaptAI/openadapt-desktop
- Codex Business release notes / Record & Replay / Computer Use: https://help.openai.com/en/articles/11391654-chatgpt-team-release-notes
- Claude computer use: https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork
- UiPath Delegate Aug 2026: https://docs.uipath.com/delegate/standalone/latest/release-notes/august-2026
- Microsoft Copilot Studio Computer Use: https://learn.microsoft.com/en-us/microsoft-copilot-studio/faqs-computer-use
- Microsoft Computer Use monitoring: https://learn.microsoft.com/en-us/microsoft-copilot-studio/monitor-computer-use
- Automation Anywhere APA: https://www.automationanywhere.com/products/agentic-process-automation-system
- Automation Anywhere PRE: https://docs.automationanywhere.com/r/automation-generative-ai-overview/pre-and-genai

OpenDesk 当前事实来源：

- `docs/api/ai-cli.md`
- `docs/api/recorder-runtime.md`
- `docs/api/accessibility.md`
- `docs/api/protected-packages.md`
- `docs/plans/commercialization/agent-driven-rpa-positioning.md`

## 9. Meta Muse 增补（2026-09-26）

Meta Muse 应加入竞争地图，但它与 Cua / ADH / OpenAdapt 的关系不同：Muse 更像**上层个人 Agent + 分发入口 + Connector 平台**，而不是单纯 Desktop Driver 或 RPA compiler。

官方已核验能力包括：personal AI agent；长期目标 → action plan；后台持续工作；persistent Secure VM + browser；connected apps / Connectors；Mac desktop app；经许可访问 Mac 上应用；Connector Platform / Directory。

| 产品 | 与 OpenDesk 的主要重叠 | 对 OpenDesk 的主要威胁 | 更合理关系 |
| --- | --- | --- | --- |
| Meta Muse | Personal Agent、Browser/Computer Use、跨应用执行、Connector 生态 | 通用个人 Agent、Mac Computer Use、通用 Connector、用户入口 | **竞合**：OpenDesk 不重做上层 Agent，争取成为可调用 Execution / Recipe / Verification 层 |

Muse 使以下差异化进一步失效：`我也有个人 AI 助手`、`我也能操作 Mac`、`我也能跨 App`、`我也有 Connector`。

OpenDesk 仍应重点证明：一次 Agent 成功 → reviewable / parameterized Recipe → independent verification → deterministic / low-cost replay → repair / compatibility → client delivery。

当前没有证据表明 Muse 已公开提供与上述完整链路等价的 Recipe qualification / protected workflow delivery 合同；同样也没有证据支持 OpenDesk 已可直接作为 Muse Connector。协议细节未公开前，这些项统一保持未知，不做正向或负向推断。

专项研究：`docs/research/commercialization/meta-muse-competitive-impact-2026.md`。
