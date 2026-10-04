# OpenDesk：做通 Browser Integration Golden Demo，让 Codex 首次完成网页任务并生成可独立运行的 Recipe

## 目标需求

本轮建立在已经通过验证的 Browser Automation Core Demo 之上。

真正目标不是继续扩展 Browser Core，也不是增加更多 DOM API。

本轮需要证明：

> 已经验证过的 Browser Core 能够正式成为 OpenDesk 的 Browser execution surface，使真实 Codex 通过现有 OpenDesk MCP 完成一次网页任务，并把这次真实执行形成权威 Browser Agent Trace，继续进入现有 Agent-to-Recipe，最终生成普通 OpenDesk JavaScript Recipe；冻结候选以后，在没有 Agent 逐步控制的情况下使用新业务参数完成 Fresh Run 和 Qualification。

最终链路必须真实成立：

```text
用户提出 Browser 自动化任务
        ↓
真实 Codex
        ↓
现有 OpenDesk MCP
        ↓
Browser Capability Adapter
        ↓
已经通过 Demo 1 的 Browser Core
        ↓
Browser Extension
        ↓
真实 Tab / Frame / Document / DOM
        ↓
Observe / Locate / Read / Act / Verify
        ↓
Authoritative Browser Agent Trace
        ↓
现有 Agent-to-Recipe
        ↓
Distill / Procedure / Data Dependency / Locator Plan
        ↓
普通 OpenDesk JavaScript Recipe
        ↓
Candidate Freeze
        ↓
Fresh Run
        ↓
Qualification
```

最终必须证明：

```text
第一次：
Agent / Codex 负责理解未知任务并完成真实网页操作

之后：
普通 JavaScript Recipe
→ 直接调用 Browser capability
→ 使用新的业务参数
→ 不再让 Agent 逐步观察和决策
```

---

## 一、前置条件

首先检查 Demo 1 的真实结果。

应读取当前：

```text
docs/plans/browser-automation/demo-validation-plan.md
docs/architecture/browser-automation/extension-runtime-bridge.md
docs/architecture/browser-automation/capabilities.md
```

以及 Demo 1 实际产生的：

```text
Browser Core implementation
deterministic tests
integration tests
Live Browser Evidence
Golden fixture Evidence
failure / recovery Evidence
```

Demo 1 至少必须真实证明：

```text
Real Extension communication          PASS
Real DOM observe / locate / read      PASS
Real DOM act / verify                 PASS
Runtime value read → fill             PASS
Independent verifier                  PASS
Stale target rejection                PASS
Wrong/ambiguous tab rejection         PASS
Lost ACK no duplicate submit          PASS
Reconnect no unsafe replay            PASS
```

如果缺少这些真实 Evidence：

```text
Demo 2 = BLOCKED
```

不要通过重新实现另一套 Browser Core 绕过问题。

如果只是 Demo 1 某个局部失效：

```text
回到对应 Core boundary
→ 最小修复
→ 重验受影响 Gate
```

不要重新设计整个 Browser Automation。

---

# 二、本轮只做 Integration，不重做 Browser Core

本轮 Browser Core 应被视为已经验证的 execution subsystem。

不要重新实现：

```text
Extension transport
Native Host transport
DOM selector engine
Tab identity
Document identity
request correlation
reconnect
stale target detection
side-effect outcome model
```

除非集成过程发现有明确 Core defect。

如果发现 Core defect：

```text
记录 First Invalid Boundary
→ 定向修复 Core
→ 重验受影响 Demo 1 Gate
→ 再返回 Demo 2
```

不要在 MCP / Recipe 层偷偷补 workaround。

---

# 三、第一部分：让现有 OpenDesk MCP 调用 Browser Core

优先复用现有：

```text
cmd/opendesk-mcp
pkg/mcpserver
```

不要默认创建：

```text
opendesk-browser-mcp
```

Browser MCP 应只是现有 MCP 的一个 capability adapter。

目标结构：

```text
                    Browser Core
                         ▲
                         │
              Browser Capability Adapter
                         ▲
                         │
                  existing opendesk-mcp
                         ▲
                         │
                       Codex
```

MCP 层不得复制 Browser Core 已有的：

```text
target resolution
tab/document validation
actionability
timeouts
reconnect
retry policy
side-effect safety
trace ownership
```

MCP 负责的应主要是：

```text
tool schema
parameter normalization
execution identity
context association
Browser Core call
result/error mapping
```

---

# 四、Browser MCP 能力保持少量、正交

根据现有 MCP 命名和注册机制确定最终名称。

语义至少覆盖：

```text
browser status
browser tabs
browser observe
browser locate
browser read
browser act
browser wait
browser verify
```

不要为了方便 Codex 直接复制整个 Playwright API。

不要默认提供：

```text
arbitrary evaluate
arbitrary page JavaScript
unbounded DOM dump
```

Browser MCP 必须保持 Browser Core 已经验证过的：

```text
TARGET_NOT_FOUND
AMBIGUOUS_TARGET
STALE_TARGET
TIMEOUT
PERMISSION_DENIED
OUTCOME_UNKNOWN
```

或当前代码中等价的结构化语义。

不能在 MCP 层把它们压成一个普通：

```text
error
```

---

# 五、第二部分：真实 Codex Browser Agent Golden Sample

继续复用 Demo 1 的受控订单 fixture。

任务保持：

```text
输入订单号
→ Query
→ 页面产生运行时 Amount
→ 从 DOM 读取 Amount
→ 将读取到的实际 Amount 填入 Confirmation Amount
→ Confirm
→ Status = Completed
```

但这一次调用者必须是：

```text
真实 Codex
```

通过：

```text
existing OpenDesk MCP
```

完成。

---

## 禁止的伪验收

以下不能代替真实 Codex MCP：

```text
直接 browser-lab 调用
直接调用 Browser Core Go API
MCP unit test
tools/list 能看到 browser tools
手工发送 JSON-RPC
外部 Playwright/CDP
Node/Python 脚本直接控制浏览器
```

至少一次必须真实形成：

```text
Codex
→ OpenDesk MCP
→ Browser Core
→ Extension
→ DOM
```

---

# 六、必须保存 Authoritative Browser Agent Trace

本轮最重要的架构规则之一：

```text
Browser MCP/API execution trace
=
Browser Agent Action 的权威事实来源
```

Agent 调用：

```text
observe
locate
read
act
verify
```

时，Browser execution owner 已经知道：

```text
Agent request
resolved tab
resolved frame
resolved document
target request
actual resolved target
before observation
actual operation
operation result
after observation
verification
evidence
```

因此：

```text
不要再让 Browser Human Capture
或者 Desktop Recorder
重录同一次 Agent action
```

Extension 内部发生的低层 DOM event 可以成为：

```text
execution evidence
```

但不得再形成第二条 canonical action。

---

# 七、Agent Trace 至少必须能够表达

每个 Browser action 至少保存或引用：

```text
executionId
actionId / requestId
source = agent
surface = browser

browser session
connection epoch
tab
frame
document
origin / URL where appropriate

operation

target request
resolved target
target semantics

before observation

runtime input
runtime output

actual action result

after observation

verification

status
error class
timestamps
evidence references
```

注意：

```text
不要求把整个网页 DOM 全量保存
```

Evidence 应最小化并避免敏感数据。

---

# 八、Agent Golden Sample 必须证明真实数据依赖

第一次真实 Agent 执行，例如：

```text
orderId = A001

DOM read:
amount = 137.42

Agent action:
fill confirmation = 137.42
```

Agent Trace 必须清楚表达：

```text
137.42
```

来自：

```text
本次页面 DOM read
```

而不是：

```text
提示词里的预期答案
fixture backend
orderId 计算
硬编码
```

Independent verifier 最后确认：

```text
DOM amount
=
filled confirmation
=
server recorded amount

submissionCount = 1
```

---

# 九、第三部分：把 Browser Agent Trace 接入现有 Agent-to-Recipe

本轮不重新设计 Agent-to-Recipe S1～S12。

必须复用现有：

```text
workflows/agent-to-recipe/
```

以及现有：

```text
Artifact
Validator
Gate
Evidence
qualification
```

责任结构。

需要 Browser-specific 输入时：

```text
通过最小 source / adapter / schema extension 接入
```

不要创建：

```text
browser-agent-to-recipe/
第二套 S1-S12
第二套 workflow checker
第二套 qualification
```

---

# 十、最关键的数据依赖提炼

Agent 第一次运行：

```text
orderId=A001
DOM amount=137.42
confirmation=137.42
```

经过制作链后必须形成：

```text
orderId
= business parameter

amount
= runtime Browser DOM read

confirmationAmount
= bind(amount)
```

而不是：

```text
confirmationAmount = 137.42
```

也不能变成：

```text
confirmationAmount = calculateFromOrderId(orderId)
```

如果任务要求的真实数据来源是 DOM。

---

# 十一、必须形成 Browser Locator / Operation 规则

Recipe 不能仅保存：

```text
点击屏幕坐标 x=500,y=300
```

普通网页元素默认使用 Browser semantic target。

例如：

```text
role + accessible name
label
text
test-id
stable attribute
DOM relation
```

实际 locator contract 必须来自已经通过 Demo 1 的 Browser Core。

Agent-to-Recipe 不重新发明另一套 Browser selector semantics。

---

# 十二、必须展示完整 lineage

至少选择一个关键步骤，例如：

```text
读取 Amount
```

展示完整追溯：

```text
Browser Agent Trace
↓
raw Browser observation/action
↓
Distilled Action
↓
business step
↓
runtime variable amount
↓
Browser locator / read rule
↓
Procedure
↓
generated JavaScript
↓
Fresh Run verification
```

维护者必须能够回答：

```text
这行 JS 为什么存在？
来自第一次运行的哪个事实？
它读取什么？
读出的值被谁消费？
怎样证明下一步使用的是实际读取值？
```

---

# 十三、生成普通 OpenDesk JavaScript Recipe

最终产物必须是：

```text
普通 OpenDesk JavaScript
```

不是：

```text
Codex prompt
Agent plan
MCP replay log
Browser macro JSON
Playwright script
```

Recipe 应通过正式 Browser capability 调用：

```text
OpenDesk JavaScript
→ Browser Core
→ Extension
→ DOM
```

MCP 与 Recipe 必须共用同一个 Browser Core。

不能形成：

```text
MCP browser implementation
+
Recipe browser implementation
```

两套逻辑。

---

# 十四、Candidate Freeze

生成 RecipeCandidate 后必须冻结：

```text
candidate path
candidate content hash
generation execution id
supported assumptions
required permissions
target website / origin scope
```

进入 Fresh Run 以后：

```text
不允许重新生成 candidate
不允许修改 candidate
不允许让 Agent 临场重写 locator
不允许 Agent 根据失败继续操作网页补救
```

如果必须修改：

```text
原 Fresh Run 判失败
→ 回到对应制作阶段
→ 产生新的 candidate hash
→ 重新 Qualification
```

---

# 十五、Fresh Run 必须真正脱离 Agent

至少选择三个新的业务输入：

```text
Order B
Order C
Order D
```

每次 Amount 必须和第一次不同。

例如：

```text
B → 281.19
C → 56.80
D → 714.03
```

具体值由 fixture 在运行时产生。

全部使用：

```text
完全相同 candidate hash
```

执行：

```text
普通 OpenDesk JavaScript
→ Browser Core
→ Extension
→ DOM
```

运行过程中：

```text
不启动 Agent 来决定下一步
不调用 Codex 解决 locator
不根据网页结果重新生成 JS
```

---

# 十六、Fresh Run 独立验证

每次由 independent verifier 核对：

```text
orderId
DOM amount
submitted amount
submission count
final status
```

要求：

```text
DOM runtime amount
=
confirmation amount
=
actual submitted amount
```

且：

```text
submissionCount = 1
```

---

# 十七、失败注入

必须主动生成错误候选或错误情况，证明资格链能够发现问题。

至少包括：

### F1｜硬编码第一次金额

例如：

```text
confirmation = 137.42
```

用新订单执行。

必须 FAIL。

---

### F2｜错误 Tab

Candidate 被定向到另一个同名 Tab。

必须：

```text
reject / FAIL
```

不能误操作。

---

### F3｜Stale Document

locate 后刷新页面再执行旧 target。

必须被 Browser Core 拒绝。

---

### F4｜重复 Confirm

人为构造 candidate：

```text
Confirm
Confirm
```

Qualification 必须发现：

```text
submissionCount != 1
```

---

### F5｜缺少最终验证

Candidate 完成输入和点击，但不验证：

```text
Status = Completed
```

不能获得完整 Qualification PASS。

---

# 十八、需要核对现有 Recorder，但不要错误接入

本轮可以读取当前：

```text
pkg/recorder/
pkg/mcpserver/recorder.go
```

理解现有：

```text
session
trace
distill
compile
```

责任。

但 Browser Agent 的 canonical trace 已经来自 Browser Execution。

因此不要为了复用 Recorder API 强行：

```text
Browser Agent action
→ Browser Recorder 重录
```

如果现有 Recorder/制作链中有可复用的：

```text
storage
session identity
evidence reference
distill structure
```

可以通过 adapter 复用。

但不得产生第二份 Browser action truth。

---

# 十九、本轮不做 Browser Human Demonstration

明确不做：

```text
Human Browser Capture
Human DOM event recorder
Human-to-Recipe Browser source
Desktop Recorder browser integration
```

这些属于 Demo 3。

不要因为 Extension 已经能够监听 DOM event 就顺手做大型 Recorder。

---

# 二十、本轮不做 Browser + Desktop Cross-Surface

明确不做：

```text
Browser Upload
→ Native File Picker
→ Desktop Automation
```

这属于 Demo 4。

本轮只做纯 Browser Golden Task。

---

# 二十一、必须维护 Demo Stage Review

最终输出：

```text
Demo:
Demo 2 — OpenDesk Browser Integration Golden Demo

Precondition:
Demo 1 = PASS / FAIL / BLOCKED

A. Real Codex → MCP → Browser
PASS / FAIL / BLOCKED / NOT_RUN

B. Authoritative Browser Agent Trace
PASS / FAIL / BLOCKED / NOT_RUN

C. Agent-to-Recipe transformation
PASS / FAIL / BLOCKED / NOT_RUN

D. Ordinary JS Recipe
PASS / FAIL / BLOCKED / NOT_RUN

E. Candidate Freeze
PASS / FAIL / BLOCKED / NOT_RUN

F. Fresh Run without Agent
PASS / FAIL / BLOCKED / NOT_RUN

G. Qualification
PASS / FAIL / BLOCKED / NOT_RUN
```

同时必须输出：

```text
Last Confirmed Boundary:

First Invalid / Unknown Boundary:

Failure Owner:
CONFIRMED / SUSPECTED / UNKNOWN

Candidate Path:
Candidate Hash:

Fresh Run Count:
Same Hash Used:
yes / no

Agent Used During Fresh Run:
yes / no

Evidence:

Preserve:

Invalidate:

Next Minimum Action:
```

---

# 二十二、Demo 2 Hard Gate

只有同时满足以下条件才可以：

```text
Demo 2 = PASS
```

条件：

```text
真实 Codex 调用现有 OpenDesk MCP

MCP 调用 Demo 1 已验证的同一个 Browser Core

真实 Browser Extension / DOM 执行

真实运行时 DOM value read → fill

Browser Agent Trace 是唯一 canonical Agent action truth

Agent Trace 成功进入现有 Agent-to-Recipe

生成普通 OpenDesk JavaScript

candidate hash 冻结

至少三个新业务输入 Fresh Run

Fresh Run 不依赖 Agent 逐步决策

同一 candidate hash

independent verifier 全部通过

错误候选能够被 Qualification 拒绝
```

任意核心项缺少真实 Evidence：

```text
FAIL / BLOCKED / NOT_RUN
```

不能使用：

```text
基本完成
理论可行
95%完成
大致通过
```

---

# 二十三、完成后停止

Demo 2 PASS 后，不自动实施 Browser Human Recorder。

下一阶段固定为：

```text
Demo 3
Browser Human Demonstration Golden Demo
```

它负责验证：

```text
Human
→ Extension Capture
→ Browser Human Trace
→ existing Human-to-Recipe
→ Recipe
→ Fresh Run
```

这不属于本轮。