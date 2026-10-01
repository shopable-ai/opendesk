# Browser Automation Demo Validation Plan

状态：Validation plan / Planned，2026-10-02。

本文不是 Browser Automation 架构正文，也不是 capability Evidence。架构职责以
`docs/architecture/browser-automation/extension-runtime-bridge.md` 为准；当前真实能力以
`docs/architecture/browser-automation/capabilities.md` 为准；实现 backlog 以
`docs/plans/browser-automation/roadmap.md` 为准。

本文只冻结一件事：

> 用最少、可独立验收的 Demo 逐步消除 Browser Automation 的主要技术与产品不确定性，避免一轮同时修改 Extension、MCP、Recorder、Recipe、Human-to-Recipe 和 Desktop 后无法定位第一处失败。

## 1. 总体推进顺序

```text
Demo 1 — Browser Automation Core Demo
独立证明 Extension + Local Broker + DOM Automation 核心路线
        │ PASS
        ▼
Demo 2 — OpenDesk Browser Integration Golden Demo
Codex/MCP → Browser → Agent Trace → Recipe → Fresh Run
        │ PASS
        ▼
Demo 3 — Browser Human Demonstration Golden Demo
Human → Extension Capture → Human-to-Recipe → Recipe → Fresh Run
        │ PASS
        ▼
Demo 4 — Browser + Desktop Cross-Surface Golden Demo
Browser → native/system UI → Desktop → Browser → Verify
```

规则：

- 任一 Demo 为 `FAIL` 或 `BLOCKED` 时，不直接推进下游。
- 下游 Demo 复用已经通过的上游，不重新实现 Browser core。
- `PASS` 必须有对应真实 Evidence；设计、mock、unit test 不能替代 Live Browser qualification。
- 不使用“基本完成”“95%完成”“理论可行”作为 Gate 状态。

统一状态：

```text
PASS
FAIL
BLOCKED
NOT_RUN
NOT_IMPLEMENTED
```

## 2. Demo 1 — Browser Automation Core Demo

### 唯一问题

> Browser Extension + 本地 Browser execution core + DOM execution 这条核心技术路线是否真实可行、可靠并足以继续投资？

本 Demo 应尽量独立于 OpenDesk 上层框架运行，不要求先接入 MCP、Agent-to-Recipe、Recorder、Flow 或 Scheduler。

目标链：

```text
Local Automation Client
→ Browser Broker / execution core
→ Native Host / selected transport
→ Browser Extension
→ Content Script
→ real Tab / Frame / Document / DOM
→ Observe / Locate / Read / Fill / Click / Wait / Verify
→ Structured Execution Trace
```

### 必须证明

1. 真实 Extension 与本地 core 双向通信。
2. 真实 DOM observe / locate / read / act / verify。
3. 运行时数据依赖：
   `DOM read amount → runtime variable → fill confirmation → submit`。
4. Target identity 至少能防止 stale document / wrong tab / DOM replacement 误操作。
5. lost ACK 后不能盲目重放副作用动作。
6. reconnect 后旧 session/document/target assumption 不被直接复用。
7. local caller / extension identity / message size / sensitive trace 有最小安全边界。

### Golden fixture

受控页面：

```text
输入订单号
→ Query
→ 异步出现 Amount
→ 从 DOM 读取 Amount
→ 把真实 Amount 填入 Confirmation Amount
→ Confirm
→ Status = Completed
```

自动化执行器不能通过 fixture backend、测试 oracle、硬编码或自行计算得到 Amount。

Independent verifier 只在执行后检查：

```text
order
submitted amount
submission count
final state
```

### Hard Gate

只有以下全部成立才可 `PASS`：

```text
real extension live
real DOM operation
runtime value read → fill
postcondition verification
independent verifier
stale target rejected
ambiguous/wrong tab not guessed
lost ACK does not duplicate submit
reconnect does not replay unknown side effect
```

### 明确不做

```text
MCP integration
Agent-to-Recipe
Human-to-Recipe
Browser Human capture
Desktop Recorder integration
Flow / Scheduler / Marketplace
Playwright provider
Browser + Desktop cross-surface
```

Demo 1 通过，只证明 Browser core 技术路线可行，不证明 OpenDesk 产品闭环已成立。

---

## 3. Demo 2 — OpenDesk Browser Integration Golden Demo

### 前置

`Demo 1 = PASS`。

### 唯一问题

> 已经通过验证的 Browser core 能否成为 OpenDesk 的真实 execution surface，并形成“Codex 首次完成任务 → Agent Trace → 普通 JavaScript Recipe → Fresh Run”的核心产品闭环？

目标链：

```text
User goal
→ Codex
→ existing OpenDesk MCP
→ Browser capability adapter
→ same Browser execution core
→ Extension
→ DOM
→ authoritative Browser Agent Trace
→ existing Agent-to-Recipe
→ ordinary OpenDesk JavaScript Recipe
→ candidate freeze
→ Fresh Run without Agent
→ Qualification
```

### 必须证明的四件事

#### A. 真实 Codex / MCP

至少一次必须是：

```text
real Codex session
→ existing opendesk-mcp
→ Browser tools
→ Browser core
→ real Extension / DOM
```

CLI、unit test、手写 JSON-RPC 或 tools/list 不能替代该 Live Evidence。

#### B. MCP 与 Recipe 共用 Browser core

必须是：

```text
                  Browser execution core
                     ▲             ▲
                     │             │
                   MCP         OpenDesk JS
                     │             │
                   Codex        Fresh Run
```

不得形成两套 DOM/target/lifecycle/retry 实现。

#### C. Agent Trace 是权威来源

Browser Agent 动作的事实来源：

```text
Browser MCP/API execution trace
```

Extension 产生的底层 DOM event 可以作为执行证据，但不得再生成第二条 Human/Recorder action truth。

#### D. Agent-to-Recipe 保留真实数据依赖

首次运行示例：

```text
orderId=A001
DOM amount=137.42
fill confirmation=137.42
```

必须提炼为：

```text
orderId = parameter
amount = runtime DOM read
confirmation = bind(amount)
```

不得把 `137.42` 写死，也不得通过 orderId 计算替代 DOM read。

### Fresh Run Hard Gate

生成候选后冻结：

```text
candidate path
candidate hash
supported assumptions
```

再用至少 3 个新订单执行同一 hash：

```text
ordinary OpenDesk JS
→ same Browser core
→ Extension
→ DOM
```

Fresh Run 中：

- 不让 Agent 临场决策；
- 不重新生成候选；
- 不修改候选 hash；
- independent verifier 必须验证业务结果。

### Demo 2 PASS 的含义

它证明 OpenDesk 最核心产品假设成立：

> Agent 第一次理解并完成真实 Browser 任务后，可以把成功过程转化为普通确定性 Recipe，之后同类任务不再依赖 Agent 逐步控制。

做到 Demo 2 PASS 后，可以作为第一阶段产品验证的主要里程碑。

---

## 4. Demo 3 — Browser Human Demonstration Golden Demo

### 前置

至少 `Demo 1 = PASS`；推荐 `Demo 2 = PASS` 后再实施。

### 唯一问题

> 真人网页演示能否由 Browser Extension 直接采集准确的 Browser-specific demonstration source，并复用现有 Human-to-Recipe 后半段生成可 Fresh Run 的 Recipe？

目标链：

```text
Human
→ Browser Extension Capture
→ Browser Human Trace
→ existing Human-to-Recipe / shared production chain
→ ordinary Recipe
→ Fresh Run
```

### 关键事实边界

```text
Browser Agent
→ Browser execution trace

Browser Human
→ Extension capture

Desktop Human
→ current Desktop Recorder
```

Browser Human Capture 不通过 Desktop x/y 反推 DOM。

Browser Human Capture 也不得重录 Agent MCP action。

### 必须证明

- Human raw DOM event 与 Human action、semantic annotation、business intent 分层。
- 保留 tab/frame/document/origin/target semantics provenance。
- Agent 派生 DOM event 不被重复计为 Human action。
- source 无法确认时标 unknown，不猜测。
- Browser Human Trace 作为新的 demonstration source 接入现有 Human-to-Recipe，而不是复制第二套 Recorder/Workflow。
- 生成的 Recipe 必须换新输入独立 Fresh Run。

### Live Gate

必须至少一次真人实际完成受控网页任务。

如果环境无法真人操作：

```text
Human Live = NOT_RUN
```

不得用合成事件冒充 Human Demonstration。

---

## 5. Demo 4 — Browser + Desktop Cross-Surface Golden Demo

### 前置

Browser core 已稳定；Desktop Automation 当前能力可用。

### 唯一问题

> Browser 与 Desktop 能否作为同一个 OpenDesk execution 中的两个 surface 显式切换，而不是两套孤立自动化或两个 Recorder 相互监听？

Golden scenario：

```text
Browser page
→ click Upload
→ native file picker appears
→ switch surface to Desktop
→ select controlled file
→ native dialog closes
→ switch back to Browser
→ DOM verify upload succeeded
```

### 必须证明

- Browser target 继续使用 Browser semantics。
- Desktop target 继续使用 AX/UIA/Vision/Input semantics。
- surface handoff 有明确原因和 execution lineage。
- Desktop 完成后能够回到同一个 Browser task。
- 最终业务成功由 Browser DOM postcondition 验证。
- 整个过程属于一个 Recipe / Flow / execution lineage。

### 明确不做

- Browser Extension 直接控制 OS native dialog。
- Desktop 自动化从屏幕坐标反推网页 DOM。
- 两个 Recorder 同时监听后猜测 surface transition。
- 为此建立第二个 Flow Engine。

---

## 6. Demo 与现有架构文档的关系

```text
extension-runtime-bridge.md
→ 最终目标架构、职责与 ownership

roadmap.md
→ 实现 backlog（B10-B19）

本文件
→ 用什么 Demo 顺序证明方案可行，什么时候允许推进
```

三者不能互相替代。

Demo 成功后再根据实际 Evidence 更新 capability matrix 和 roadmap 状态；不得因为本文写了 `PASS` 条件就提前改变 capability claim。

## 7. 统一 Stage Review

每个 Demo 最终至少输出：

```text
Demo:
Goal:

Precondition:
Expected:
Actual:

Gate:
PASS / FAIL / BLOCKED / NOT_RUN / NOT_IMPLEMENTED

Last Confirmed Boundary:
First Invalid / Unknown Boundary:

Failure Owner:
CONFIRMED / SUSPECTED / UNKNOWN

Evidence:
- source / build
- deterministic tests
- integration tests
- live evidence
- independent verifier

Preserve:
哪些上游结果仍然有效

Invalidate:
哪些下游结论不能继续相信

Next Minimum Action:
```

失败后先修当前第一处 invalid/unknown boundary，不自动从 Demo 1 全量重跑。

## 8. 当前计划状态

截至本文创建时：

| Demo | 状态 | 说明 |
| --- | --- | --- |
| Demo 1 — Browser Automation Core | NOT_RUN | 需要真实 Browser Extension + DOM + reliability qualification |
| Demo 2 — OpenDesk Integration | NOT_RUN | 依赖 Demo 1 PASS |
| Demo 3 — Browser Human Demonstration | NOT_RUN | 推荐 Demo 2 后实施 |
| Demo 4 — Browser + Desktop Cross-Surface | NOT_RUN | 依赖 Browser core 与 Desktop surface 可用 |

## 9. 下一执行目标

当前应先完成 Demo 1。

当 Demo 1 有真实 `PASS` Evidence 后，下一个执行目标固定为：

> **Demo 2 — OpenDesk Browser Integration Golden Demo：真实 Codex 通过现有 OpenDesk MCP 调用同一个 Browser core 完成黄金任务，保存 authoritative Browser Agent Trace，并由现有 Agent-to-Recipe 生成普通 JavaScript Recipe；冻结候选后使用新业务参数做无 Agent Fresh Run 和 Qualification。**

Demo 2 不重新设计 Browser transport、DOM target model 或 Browser core；发现 Core 问题时回退到 Demo 1 对应边界定向修复。
