# Computer Use / Desktop Agent / Recorder 竞品重扫

日期：2026-08-31

> 文档性质：Research / 竞争与产品决策输入。本文基于 2026-08-31 可访问的公开仓库、官方产品文档与当前 `shopable-ai/clawdesk` 事实，对桌面自动化、Computer Use、Recorder、Agent OS、RPA 与相关商品重新分类。本文不是当前能力声明，也不因为竞品存在就自动改变 Roadmap。

## 1. 为什么需要重新扫描

2026-04 的旧 Landscape 主要按：

```text
App-specific automation
General desktop UI automation
Input simulation / visual automation
RPA
MCP / AI-native computer use
```

分类。

到 2026-08，市场已经明显继续向上演化：

```text
Desktop Driver / Computer-Use Runtime
→ MCP / CLI / SDK
→ AI Agent Harness
→ Recorder / Demonstration-to-Skill
→ Durable Workflow / RPA-as-Code
→ Agent OS / Personal AI Workspace
→ Enterprise Agentic Automation
→ Business Outcome
```

因此只比较 AutoHotkey、PyAutoGUI、传统 Recorder 或老式 RPA 已经不足以判断 Clawdesk 的竞争位置。

本次重扫重点回答：

1. `https://github.com/clawdesk/clawdesk` 与本项目到底有多少产品和技术重叠？
2. 当前真正直接竞争 Clawdesk 的项目有哪些？
3. Recorder、Computer Use、Agent OS、Enterprise RPA 是否已经出现新的商品形态？
4. 哪些竞品值得 Build / Buy / Integrate，而不是重复开发？
5. 这些变化是否影响 Clawdesk 当前能力补全优先级？

## 2. `clawdesk/clawdesk`：必须纳入一级竞品与名称冲突跟踪

### 2.1 外部项目当前公开定位

公开仓库：

```text
https://github.com/clawdesk/clawdesk
```

官网：

```text
https://clawdesk.dev/
```

本轮观察到的公开事实：

- 项目自称 `ClawDesk - Agent2OS`；
- 定位为本地优先 / 私有的个人 AI Workspace / Agent OS；
- Rust + Tauri；
- 支持桌面 App、CLI、TUI、tmux、Gateway、Daemon、Docker；
- 支持多个 LLM provider 与本地模型；
- 提供大量消息 Channel；
- 有 Skill、Plugin、Memory / RAG、MCP、Browser、Security、Audit、Gateway、Scheduler 等系统；
- 公开 `clawdesk-runtime` 明确提供 durable execution、Activity Journal、Checkpoint、Lease、Dead Letter Queue 与 Recovery；
- 浏览器侧有自己的 `clawdesk-browser`，以 CDP、Extension Relay、Headless Chrome、DOM / ARIA / AI Snapshot 为核心；
- macOS 原生 UI 自动化则明显复用了外部 `Peekaboo` Skill / CLI，而不是把 Peekaboo 全部重新实现进 Agent2OS 核心。

GitHub API 在 2026-08-31 本轮检查时显示：

```text
default branch: main
language: Rust
license: MIT
created: 2026-02-17
last observed push: 2026-03-23
latest observed commit: 4bd4b1d7763ce2b008eefd102b48275b9f22e945
```

Star / Fork 只是活跃度辅助信号，不能用来替代产品能力判断。

### 2.2 与 `shopable-ai/clawdesk` 的重叠程度

这里的百分比是**战略 / 功能重叠估计**，不是源代码相似度。

```text
名称 / 品牌重叠：100%
产品竞争重叠：约 55%—65%
当前技术功能重叠：约 45%—55%
源代码重叠：未发现共享代码事实，不做百分比推断
```

两者是不同代码路线：

```text
shopable-ai/clawdesk
→ Go + goja JavaScript Runtime
→ Desktop automation execution substrate

clawdesk/clawdesk
→ Rust + Tauri + SochDB
→ Personal Agent OS / multi-channel agent runtime
```

### 2.3 功能对比

| 维度 | `shopable-ai/clawdesk` 当前方向 | `clawdesk/clawdesk` 当前方向 | 重叠判断 |
|---|---|---|---|
| 核心定位 | Desktop / Cross-App Automation Runtime | Personal Agent2OS / AI Workspace | 中高 |
| 原生桌面执行 | Mouse / Keyboard / Window / Screenshot / OCR / Layout / Target 等是核心 | 有 Desktop/App Action，但 macOS 深度执行可经 Peekaboo Skill | 中高，但责任边界不同 |
| JavaScript Runtime | Go 向 goja 注入桌面能力，是重要使用面 | 非核心 | 低 |
| MCP | Desktop automation MCP 是主要 Agent 入口之一 | 完整 MCP client/server 子系统 | 高 |
| HTTP / Gateway | Execution / Vision HTTP | Agent Gateway / REST / WebSocket | 中 |
| 浏览器 | 当前有 legacy / upgraded / playwright compatibility facade，不能等同完整 Playwright | 自有 CDP Browser Runtime + Extension Relay + Headless | 中；外部项目当前更完整 |
| OCR / Vision / Layout | 核心差异化建设方向 | 不是 Agent2OS 的中心；可通过外部工具 / Skill 获得 | 低中 |
| Target / Locator / Verification | 正在强化 freshness、ambiguity、postcondition、Evidence | Browser 有 actionability、安全；桌面深层能力较多交给外部 driver | 中 |
| Recorder / Replay | 已有 Agent-first Recorder 架构与 macOS MVP Plan | 未见同等主产品入口；但有 workflow/procedural/durable 相关能力 | 中 |
| Durable Execution | 当前通用 execution 仍需补 checkpoint / resume / persistent lifecycle | Activity Journal / Checkpoint / Lease / DLQ / Recovery 是正式 runtime | 高度相邻，外部项目当前更成熟 |
| Skill / Plugin | 正在形成 App / Skill / Workflow / Extension 体系 | 已有正式 Skills / Plugins / ACL / registry | 中高 |
| LLM Provider | 非核心，不计划成为模型聚合器 | 多 Provider + Local Models 是核心卖点 | 低 |
| Channels | 非核心 | 25+ messaging channel 是核心 | 低 |
| Memory / RAG | 非核心 | SochDB + Memory / RAG 是核心 | 低 |
| Desktop UI 产品 | 以 Runtime / CLI / HTTP / MCP 为主，Recorder App 计划中 | Tauri Desktop + TUI + tmux 已是产品核心 | 中 |
| 商业方向 | 正研究 Creator / Package / Vertical Automation / Business Outcome | 当前公开定位为 free/open local Agent OS | 部分重叠 |

### 2.4 最重要的区别

不能因为同名就把两个项目理解为“同一个东西的两种实现”。

更准确的关系是：

```text
clawdesk/clawdesk
更像：Agent OS / AI Workspace / Orchestration Product

shopable-ai/clawdesk
更像：Desktop Computer-Use / Cross-App Execution Infrastructure
```

前者向上覆盖：

```text
models
channels
memory
skills
plugins
agent runtime
security
gateway
browser
durable execution
UI
```

本项目当前更应该向下做深：

```text
observation
accessibility / OCR / layout
locator / target identity
geometry
verified action
recovery
evidence
recorder
app adapter
reusable workflow execution
```

如果本项目也继续向完整 Agent OS、聊天、多模型聚合、消息 Channel、Memory/RAG、通用 Agent UI 扩张，二者的竞争重叠会迅速上升，并且很容易重复建设成熟能力。

### 2.5 名称冲突比功能冲突更需要尽早处理

除了 `clawdesk/clawdesk` / `clawdesk.dev`，本轮还能搜索到：

- `Neurons-AI/clawdesk`：已归档并 rebrand 为 CrawBot；
- `glassrun/clawdesk`：OpenClaw 上层多 Agent orchestration；
- `clawdesk.ai`：Human-AI Kanban / Task Management 产品；
- 其他零散 ClawDesk / Claw Desk 项目和服务。

因此存在明确的：

```text
GitHub 搜索混淆
SEO / 域名混淆
用户口碑归属混淆
文档引用混淆
未来产品发行命名混淆
```

这不是商标法律结论。是否需要改名、商标是否可注册、不同司法辖区是否存在冲突，需要另行进行 Naming / Trademark / Domain Clearance。

但从产品治理角度，**在正式公开发行、Marketplace 或商业推广前，必须加入名称风险审计 Gate。**

## 3. 2026-08 应使用的竞品 / 商品分类

### A. Computer-Use Driver / Desktop Runtime

代表：

- Cua Driver
- Peekaboo
- Agent Desktop Harness（ADH）
- agent-computer-use
- agent-ctrl
- Windows-MCP / pywinauto-mcp 等

卖点通常是：

```text
观察真实桌面
+ Accessibility / UI tree
+ Screenshot
+ Click / Type / Scroll / Window
+ MCP / CLI / SDK
+ Structured Result
+ Verification / Evidence
```

这是与 Clawdesk **技术距离最近**的一类。

### B. Computer-Use Model / Tool Contract

代表：

- Anthropic Computer Use
- OpenAI / Codex Computer Use
- 其他模型厂商 Computer Use

它们不一定自己拥有桌面 Driver，但正在定义模型消费的标准动作面、截图语义、批量工具调用和安全边界。

对 Clawdesk 的意义：

> Clawdesk 可以成为这些模型 / Agent Harness 的执行 Driver，而不是重复建设模型层。

### C. AI Recorder / Demonstration-to-Skill

代表：

- OpenAI Codex Record & Replay
- UiPath Delegate 的 demonstration / screen-recording task input + Routines
- ClawBridge Workflow Recording & Replay
- 传统 Macro Recorder / Power Automate Recorder

这一类已经从：

```text
record x/y + keystrokes
```

转向：

```text
observe demonstration
→ infer task
→ produce reusable skill / routine
→ adaptive replay
→ AI recovery
```

这是 `apps/recorder` 的最直接产品竞争区。

### D. Agent-authored RPA / Workflow-as-Code

代表：

- Agent Desktop Harness + Robot Framework
- Robot Framework / RPA Framework
- 未来 Clawdesk Flow IR / Generated JS / App Package

核心卖点不是“录一遍”，而是：

```text
Agent 探索
→ 生成可审查源码
→ schema / static validation
→ bounded execution
→ assertions
→ evidence
→ repair
```

ADH 尤其值得长期跟踪，因为它与 Clawdesk 的 Evidence-first、语义 Locator、可重复 Workflow 方向高度相似，只是目前强聚焦 Windows。

### E. Personal Agent OS / AI Workspace

代表：

- `clawdesk/clawdesk` Agent2OS
- OpenClaw
- CrawBot
- Reina 等

核心商品是：

```text
Chat / Agent UI
+ Provider
+ Channel
+ Memory
+ Skill / Plugin
+ Scheduler
+ Gateway
+ Local / Remote Runtime
```

这类并非 Clawdesk 必须复制的能力面。它们更可能成为**上游 Agent Harness / Distribution Surface**。

### F. Enterprise Agentic RPA / Computer-Use Platform

代表：

- UiPath Delegate / Agents / ScreenPlay
- Microsoft Power Automate / Copilot Studio Computer Use
- Automation Anywhere Agentic Process Automation / EnterpriseClaw

核心价值：

```text
Identity
Permissions
Governance
Audit
Human-in-the-loop
Fleet / unattended runtime
Process modeling
Business connectors
Enterprise support
```

Clawdesk 当前不应完整复制企业平台，但需要提前兼容其中真正不可缺的 execution contract：

```text
approval
policy
checkpoint
cancellation
observable effects
audit evidence
```

### G. Browser Agent / Cloud Computer Infrastructure

代表：

- Browser Use
- Cua Sandbox / Fleets
- E2B / Open Computer Use
- Playwright / CDP Agent tooling

对 Clawdesk 的意义主要是边界：

```text
网页 DOM/API 能完成
→ 优先 Browser/API

必须操作真实 Native App / 系统 UI / 跨应用
→ Clawdesk Desktop Execution
```

## 4. 一级竞品重新排序

本轮不按 GitHub Star 排序，而按“用户任务是否可替代 Clawdesk + 技术路线是否直接重叠 + 是否已经形成商品入口”排序。

### Tier 0：必须持续跟踪

| 对象 | 为什么进入 Tier 0 | Clawdesk 应学习 / 防守 |
|---|---|---|
| `clawdesk/clawdesk` | 同名、Agent OS 产品面相邻、MCP/Browser/Durable/Skill 重叠 | 避免向 Agent OS 无边界扩张；评估 Naming 风险；学习 durable runtime / plugin / gateway |
| Cua Driver | MCP / CLI / SDK + 跨平台 Desktop Driver + Accessibility + Screenshot + Background input + Verification | Driver contract、effect result、permission ownership、后台执行、多 Agent cursor |
| Peekaboo | macOS 原生 capture / AX / click / window / app / menu / MCP / Agent 已高度产品化 | macOS 目标模型、Snapshot ID、app-bound permission、CLI/MCP parity |
| Agent Desktop Harness | Windows computer-use + RPA-as-code + selector + assertion + evidence + MCP | Agent 探索→可审查 workflow→validate→run→evidence 的完整闭环 |
| OpenAI Codex Computer Use + Record & Replay | 后台 Computer Use；可演示一次生成 reusable skill | Recorder 不能只生成宏；必须做到 skill/flow、背景执行、可修复、隐私处理 |
| UiPath Delegate | “描述 / 说 / 演示”任务；Native computer use；Routine 可保存/触发/计划 | Enterprise Recorder + Agent 正在融合；人机确认、过程建模、Routine governance |

### Tier 1：强相邻 / 可成为上游或替代层

| 对象 | 关注点 |
|---|---|
| Anthropic Computer Use | 17-tool client toolset、批量 action、安全模型；Clawdesk 可实现其环境执行端 |
| agent-computer-use | Accessibility-first、0 vision-token、deterministic refs 的极简 Driver 思路 |
| agent-ctrl | 跨平台 AX/UIA/AT-SPI 统一 schema、compact agent output |
| ClawBridge | Local-first 多引擎、workflow recording/replay、confidence-tiered adaptive replay |
| Microsoft Copilot Studio / Power Automate | AI Recorder 被弃用后的路线变化：自然语言 + 普通 Recorder + Computer Use Agent |
| Automation Anywhere EnterpriseClaw | 本地 Agent Fleet、files/apps/browser/terminal、企业治理 |
| Browser Use | Browser-only agent automation 与 Clawdesk 边界 |

### Tier 2：传统参考，不再作为主要战略对手

```text
AutoHotkey
PyAutoGUI
RobotGo
pywinauto
SikuliX
Macro Recorder
Keyboard Maestro
AutoIt
Ui.Vision
```

它们仍然是实现、UX、定价和生态的重要参考，但已经不能代表 2026 下半年的直接竞争上限。

## 5. 几个值得立即吸收的产品信号

### 5.1 Recorder 正在从“宏录制”升级为“示范编程”

OpenAI Codex Record & Replay 的商品语言非常直接：

```text
show once
→ reusable skill
```

UiPath Delegate 更进一步：

```text
describe / say / demonstrate
→ desktop task
→ reusable routine
→ trigger / schedule
```

这验证了 Clawdesk Recorder 采用：

```text
Raw Trace
→ Flow IR
→ Generated Script
→ deterministic replay
→ AI repair
```

比“鼠标坐标录像”更接近未来主流。

### 5.2 但 Recorder 并不应该成为唯一入口

Microsoft 在 2026-08 已将 Power Automate 的 `Record with Copilot / AI recorder` 标记为 deprecated，并推荐：

```text
自然语言描述 Flow + 需要时使用普通 Recorder
或
Copilot Studio Computer Use Agent
```

这说明：

> AI Recorder 不是自动化平台的终点。Recorder 应是输入 / 学习 / 编译工具，而不是执行系统本身。

### 5.3 Accessibility-first 与 Vision-first 正在长期并存

当前出现两条明显路线：

```text
Accessibility-first
→ Cua Driver / Peekaboo / ADH / agent-computer-use / agent-ctrl

Vision / multimodal-first
→ OpenAI / Anthropic Computer Use 等
```

Clawdesk 不应该押注单一路线。

更合理的层次仍然是：

```text
structured interface / DOM / Accessibility
→ semantic target
→ anchor / geometry
→ OCR / layout / template
→ vision
→ AI recovery
```

### 5.4 “动作返回成功”正在被更强的 effect / assertion 模型替代

Cua Driver 明确区分：

```text
confirmed
partial
unverifiable
suspected_noop
refused
```

ADH 强调 assertion 和 failure-time evidence。

这与 Clawdesk 当前 Verified Action / Evidence 方向一致，说明 P0 不应退回：

```text
click() == nil
→ success
```

### 5.5 Durable Execution 已从高级功能变成 Agent 平台基础设施

`clawdesk/clawdesk` 已将：

```text
Activity Journal
Checkpoint
Lease
Dead Letter Queue
Recovery
```

作为正式 runtime 子系统。

企业平台则继续增加 human escalation、fleet、policy 与 audit。

因此 Clawdesk 当前 Plan 中：

```text
cancel
checkpoint
replay
persistent run state
recovery
```

应继续保持 P0 / P1 高优先级，而不是等自主 Agent 完成后再补。

## 6. 对 Clawdesk 产品边界的更新判断

### 应继续做深

```text
Desktop observation
Accessibility / OCR / Layout fusion
Target / Locator
Geometry
Verified Action
Postcondition
Recovery
Evidence
Recorder / Flow IR
App Adapter
Reusable Workflow Execution
```

### 不建议因为竞品有就立即扩张

```text
完整 Chat UI
10+ LLM Provider 聚合
25+ Messaging Channel
通用 Memory / RAG
完整 Multi-Agent OS
通用 Social / Chat Gateway
Enterprise 全套 IAM / Governance
```

这些能力可以由：

```text
OpenClaw
clawdesk/clawdesk Agent2OS
Codex / Claude / 其他 Agent Harness
企业 Agent 平台
```

通过 MCP / HTTP / Skill 作为 Clawdesk 的上层调用方。

### Clawdesk 更清晰的差异化表述

候选定位：

> **Clawdesk 是面向 AI Agent 与可重复业务自动化的 Desktop / Cross-App Execution Runtime：把真实桌面状态转换成可验证 Target，把 Agent 或 Recorder 的意图转换成可重复执行、可恢复、可审计的动作与 Workflow。**

这比：

```text
另一个 AI Desktop App
另一个 Chat Agent OS
另一个通用 RPA IDE
```

更有差异。

## 7. Build / Buy / Integrate 提示

### 值得自建

- Target / Locator / Evidence 统一模型；
- Verified Action；
- Recorder Raw Trace / Flow IR / Compiler；
- App Adapter / Skill / Workflow contract；
- 与 Clawdesk Runtime 紧耦合的 checkpoint / replay / evidence；
- HTML Benchmark 与真实 App reliability benchmark。

### 值得研究复用 / 接入

- macOS：Peekaboo 能否作为 Provider / Driver Adapter，而不是所有 AX 能力自己重复实现；
- Windows：Cua Driver / ADH / agent-ctrl 的 contract 与 backend 是否能作为参考或可选 Provider；
- Browser：完整 Playwright / CDP / Browser Use 是否优于继续扩大 compatibility facade；
- Agent layer：Codex、Claude、OpenClaw、Agent2OS 通过 MCP 调用 Clawdesk，而不是在 Clawdesk 内复制完整 Agent OS。

### 暂不建议复制

- 多模型 Chat 平台；
- 大量 messaging channel；
- 通用 Knowledge / RAG 平台；
- 完整企业流程设计套件；
- 先造 Marketplace 再找业务资产。

## 8. 后续竞品研究清单

后续不再采用“看到一个项目就加一行”的方式，而按类别维护 Benchmark。

每个 Tier 0 / Tier 1 对象至少记录：

```text
产品定位
目标用户
平台
Driver 所有权
Observation 模型
Target / Locator 模型
Action contract
Verification / effect model
Recorder / workflow generation
Replay / recovery
MCP / CLI / SDK
权限与安全
Evidence
跨平台策略
商业模式 / Packaging
真实 benchmark
对 Clawdesk：Build / Buy / Integrate / Ignore
```

建议下一轮专项比较：

1. Clawdesk vs Cua Driver vs Peekaboo vs ADH：Driver / Target / Effect / Evidence Contract；
2. Clawdesk Recorder vs Codex Record & Replay vs UiPath Delegate vs ClawBridge；
3. Clawdesk Execution vs `clawdesk/clawdesk` Durable Runtime：Journal / Checkpoint / Lease / Cancellation / Recovery；
4. Clawdesk Browser compatibility vs `clawdesk-browser` / Playwright / Browser Use；
5. Naming / Trademark / Domain / Package namespace 独立审计。

## 9. 主要来源

### 同名 ClawDesk / Agent2OS

- https://github.com/clawdesk/clawdesk
- https://clawdesk.dev/
- https://clawdesk.dev/docs/architecture/overview/
- https://github.com/clawdesk/clawdesk/blob/main/docs/browser-automation.md
- https://github.com/clawdesk/clawdesk/blob/main/crates/clawdesk-runtime/src/lib.rs
- https://github.com/clawdesk/clawdesk/blob/main/crates/clawdesk-skills/openclaw-skills/peekaboo/SKILL.md

### Desktop Driver / Open Source

- https://cua.ai/docs/how-to-guides/driver/connect-your-agent
- https://cua.ai/docs/reference/cua-driver/mcp-tools
- https://github.com/trycua/cua
- https://github.com/openclaw/Peekaboo
- https://github.com/xuyw1997/agent-desktop-harness
- https://github.com/kortix-ai/agent-computer-use
- https://agent-ctrl.dev/
- https://github.com/NickRomanek/clawbridge

### AI Recorder / Computer Use / Enterprise

- https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- https://openai.com/index/codex-for-almost-everything/
- https://docs.uipath.com/delegate/standalone/latest/release-notes/august-2026
- https://docs.uipath.com/delegate/standalone/latest/user-guide/introduction
- https://learn.microsoft.com/en-us/power-automate/desktop-flows/create-flow-using-ai-recorder
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- https://www.automationanywhere.com/company/blog/imagine-2026-dallas-ai-product-announcements
- https://cloud.browser-use.com/

## 10. 当前结论

本轮最重要的修正有四个：

1. **`clawdesk/clawdesk` 必须进入一级竞品列表。** 它与本项目不是代码同源，但在名字、Agent Runtime、MCP、Browser、Skill、Workflow、Durable Execution 和桌面自动化上存在中高产品重叠。
2. **当前最直接的技术竞争已经从传统 RPA 转向 Cua Driver / Peekaboo / ADH / accessibility-first Computer Use Runtime。**
3. **Recorder 的竞争标准已经升级为 Demonstration → Skill / Routine → Replay / Recovery，而不是坐标录制。**
4. **Clawdesk 应进一步收窄到“可靠 Desktop / Cross-App Execution Infrastructure”，并把 Agent OS、模型聚合、Channels、Memory 等更多视为上层生态，而不是全部内建。**
