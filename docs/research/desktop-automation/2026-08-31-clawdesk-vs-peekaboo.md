# Clawdesk / OpenDesk vs Peekaboo：macOS Desktop Automation 重叠审计

日期：2026-08-31

> 类型：Research / Build-vs-Integrate 决策输入。
>
> 本文针对 macOS Desktop Automation，不泛化到 RPA、Agent OS 或商业 SaaS。Research 不直接重写 Architecture；源码、测试、Runtime Evidence 仍高于本文。

## 0. 最终结论

本轮最重要的判断是：

```text
停止 macOS Native Driver 大量重复开发
+ 正式 Integrate Peekaboo
+ 保留薄 NativeProvider 作为 fallback / compatibility
+ Clawdesk/OpenDesk 上移到 Verified Business Automation
```

项目级决策：

```text
Integrate-first
Confidence: 94 / 100
```

不是停止整个项目，也不是继续与 Peekaboo 做 1:1 primitive parity。

推荐重新分工：

```text
Peekaboo
→ macOS Native Driver / Observation / AX / Window / System UI / Background Input

Clawdesk / OpenDesk
→ Observation Normalization
→ Target / Locator Bundle
→ Verified Action
→ Business Postcondition
→ Recorder Compiler
→ Flow IR / Replay
→ App Adapter
→ Recovery
→ Evidence / Verdict
→ Workflow / Business Automation
```

## 1. 当前事实基线

用户给出的仓库：

```text
https://github.com/shopable-ai/clawdesk
```

本轮执行过程中 GitHub 将同一 repository ID `1259447539` 的 canonical name 改为：

```text
https://github.com/shopable-ai/opendesk
```

因此本文继续使用“Clawdesk”描述本轮被审计的既有项目，但写回使用当前 canonical repo `shopable-ai/opendesk`。

### 1.1 最终审计 HEAD

```text
Clawdesk / OpenDesk master
4ad39fbf74c32da8ecdf36580b589b73f98637cd

Peekaboo main
8d5e638e6ac9e93fae7d8dcb2ac0a0f01f3d49ec
```

本轮中间曾读取较早的 Clawdesk HEAD，但随后 `master` 合入 126 个 commit，涉及 `automation/mouse.go`、`automation/window_manager_darwin.go`、`pkg/execution/` 等，因此本文已经重新按 `4ad39fb...` 增量审计，不使用旧 HEAD 代替当前事实。

### 1.2 Peekaboo source / release

当前 Peekaboo `main`：

```text
version.json = 4.2.3
```

本轮读取的 GitHub latest release：

```text
v4.2.2
published: 2026-08-20
```

所以本文区分：

```text
main 当前源码能力
!= 已发布用户一定获得的能力
```

涉及 4.2.3 main-only 行为时，正式集成必须做版本与 capability probe。

## 2. Source of Truth

Clawdesk / OpenDesk：

```text
源码
→ 测试
→ Runtime Evidence
→ Architecture / Framework
→ Plan
→ Research
```

Peekaboo：

```text
源码
→ 官方 Docs
→ 测试
→ Releases / Changelog
→ README
```

本轮避免两个常见误判：

```text
Clawdesk Architecture 已定义
!= Runtime 已实现

Peekaboo primitive 返回成功
!= 完整业务 Postcondition 已独立验证
```

## 3. Clawdesk / OpenDesk 当前 macOS 实现事实

### 3.1 Mouse / Keyboard 主路径仍是通用 synthetic input

当前 `automation/mouse.go` 与 `automation/keyboard.go` 的普通路径仍以 robotgo 为主：

```text
Move / MoveClick / Toggle / Scroll
TypeStr / KeyTap / KeyToggle
```

这些能力适合作为：

```text
cross-platform primitive
compatibility path
fallback
benchmark baseline
```

但不应继续扩张成 macOS 主 Driver，因为普通路径不具备：

```text
fresh snapshot authority
exact window receipt
process-start generation
background semantic delivery
business postcondition
```

### 3.2 新增 `mouse.clickForPID`：值得保留，但仍是 fallback 级能力

当前 `automation/mouse_pid_click_darwin.go` 已经不只是全局 coordinate click。

它会：

```text
校验 PID 存活
→ CGWindow 检查该 PID 在目标点拥有可见 layer-0 window
→ AX hit-test
→ 校验 element PID
→ 检查 AXPress support
→ AXUIElementPerformAction(kAXPressAction)
```

这是实际的 macOS Accessibility 定向动作进步，应保留。

但当前仍存在明显边界：

- 目标输入仍是 `PID + global point`，不是 fresh semantic element identity；
- 会 `CGWarpMouseCursorPosition`，并非真正无共享指针副作用的 background click；
- 没有 process-start generation receipt；
- 没有 exact-window capture-time bounds receipt；
- 没有 mutation admission / target drift revalidation；
- `AXPress` 成功后没有统一业务 Postcondition。

因此：

```text
ClickForPID
= NativeProvider 有价值 fallback
!= Peekaboo 等级 background exact-target execution
```

### 3.3 Window discovery 有 CGWindow 增强，但 mutation 主体仍是 JXA/System Events

当前新增 `automation/cgwindow_darwin.go` 可通过 CoreGraphics 获取 frontmost PID 对应的 on-screen layer-0 window、CGWindow ID 和 bounds。

但 `automation/window_manager_darwin.go` 的主要 window mutation 仍是：

```text
System Events / JXA
p.frontmost = true
AXRaise
window.position / size
AXMinimized
AXClose
Cmd-W fallback
```

并且 `findWindowByTitle` 仍存在：

```text
exact title
→ first contains fuzzy fallback
```

与 Peekaboo 相比，当前仍缺少：

```text
exact CGWindowID + PID + process-start generation receipt
mutation queue admission 后重验证
capture-time bounds pinning
mutation 后 exact target readback
partial / ignored / indeterminate truth model
```

所以 Window native driver 不建议继续追 parity。

### 3.4 Screenshot 是真实能力，但不值得再造完整 ScreenCaptureKit authority

当前 screenshot 路径包括：

```text
robotgo CaptureScreen
macOS screencapture CLI
active-window -l <window-id>
secondary display -D
clip + crop
```

当前仓库没有形成与 Peekaboo 同等级的：

```text
ScreenCaptureKit process ownership
Bridge host capture authority
producer-bound snapshot
exact-window ROI receipt
capture engine negotiation
atomic snapshot publication
```

这些是高维护、低差异化的 macOS-only 工作，应优先 Integrate。

### 3.5 Permission 仍是薄 wrapper

当前 macOS permission 能力已有：

```text
AXIsProcessTrusted
AXIsProcessTrustedWithOptions
CGPreflightScreenCaptureAccess
CGRequestScreenCaptureAccess
AppleEvents probe
```

但不等于 Peekaboo 的：

```text
signed shipped identity
TCC host ownership
permission onboarding
Bridge host
caller signing policy
capability negotiation
```

Clawdesk 应保留统一 permission facade，不应重新建设一套 Peekaboo Bridge/TCC architecture。

### 3.6 Accessibility 已出现真实局部实现，但尚不是完整 AX UI Driver

本轮最新代码已经存在 `AXUIElementCopyElementAtPosition`、`AXUIElementCopyActionNames`、`AXPress` 的 PID click path。

但当前仍没有形成统一的：

```text
AX hierarchy observation
opaque element ID lifecycle
fresh reusable snapshot authority
set-value engine
perform-action engine
menu/dialog/dock/space native surfaces
process-generation-bound element mutation
```

所以“Clawdesk 完全没有 AX”已经过时；更准确的结论是：

```text
局部 AX action 已落地
完整 macOS Accessibility Driver 尚未落地
```

### 3.7 MCP 有自己的价值，但不应复制 Peekaboo native catalog

当前 MCP 已经提供：

```text
status / permissions
window / display
screenshot
OCR / detect-ui / layout
inspect
find target
click text / region
tm_act_on_target
click / type / press / scroll
```

它的价值在于 host-facing orchestration 和 Clawdesk 语义入口。

但 MCP Runtime 目前仍没有统一暴露：

```text
producer-bound snapshot
native element ID
AX set-value / action
menu / dialog / dock / space
exact background mutation outcome
```

因此后续建议：

```text
保留 Clawdesk MCP public facade
底层 DesktopProvider 可切换
停止复制 Peekaboo raw primitive tool catalog
```

### 3.8 Runtime Evidence 必须降权

当前历史 macOS MCP smoke `docs/quality/mcp/2026-05-19-macos-smoke.md` 自己明确写明：

```text
历史真机验证
不代表 2026-08 当前版本已重新执行
```

当时实际证明的主要是：

```text
MCP/stdio/Hermes
permissions
window list
screenshot
inspect
layout-only candidate
preview action
低风险 focus
```

没有证明当前 HEAD 的完整：

```text
semantic target
→ real action
→ independent postcondition
→ recovery
→ final verdict
```

本轮新合入的 `mouse.clickForPID` 有参数单测，但不能把参数 validation test 当成完整真机可靠性 Evidence。

## 4. Clawdesk 真正高价值、且不应交给 Driver 的层

现有 Framework / Architecture 已经把更重要的问题定义出来：

```text
Discover
→ Observe
→ Understand
→ Locate
→ Resolve Geometry
→ Act
→ Observe Again
→ Verify
→ Diagnose
→ Recover
→ Evidence
```

以及：

```text
Driver
→ Perception
→ UI Model
→ Target / Geometry
→ Verified Action
→ Skill
→ Workflow
→ Agent / Supervisor
```

这说明把 Driver 改成 Provider 并不违背现有方向，反而更符合分层原则。

### 4.1 Target / Locator

`action-target-model.md` 已经要求：

```text
intent
target type
selector logic
confidence
fallbacks
preconditions
postconditions
risk
```

Clawdesk 应继续 Build 的不是第二套 AX tree，而是：

```text
Provider-native candidate
+ OCR
+ Detect UI
+ Layout
+ Vision
+ Anchor
+ History
→ Locator Bundle / Action Target
```

### 4.2 Verified Action / Business Postcondition

Clawdesk 应把：

```text
provider action effect
```

提升成：

```text
business outcome verdict
```

例如：

```text
AXPress("Send") succeeded
!= 消息已正确发送给正确联系人
```

真正的业务验证可能要检查：

```text
chat identity
draft state
outgoing message bubble
content / direction / timestamp
wrong-recipient guard
```

### 4.3 Recorder Compiler

当前 `agent-first-recorder.md` 的长期方向仍然具有高差异：

```text
Raw Trace
→ Distill
→ Flow IR
→ Parameterize
→ Locator Bundle
→ Generated Script
→ deterministic / hybrid / agent replay
```

当前仓库尚未形成完整 Recorder Runtime，因此这是“高价值、低当前完成度”的重点 Build 区域。

### 4.4 App Adapter

Clawdesk 的 App 资产目标：

```text
Application
→ Window
→ Page / State
→ Region
→ Semantic Element
→ Skill
→ Workflow
→ Policy
→ Fixture
→ Version Compatibility
→ Evidence
```

这与一个通用 macOS Driver 的产品职责不同。

### 4.5 Evidence / Recovery

G0—G7 已明确要求：

```text
Action completed != Task completed
No Evidence -> no pass verdict
```

这一层应该跨 Peekaboo/Cua/Native Provider 统一，而不是由单一 Driver 决定。

## 5. Peekaboo 当前源码级能力

## 5.1 Surface / Permission / signed identity / Bridge

Peekaboo 已经建立：

```text
Screen Recording
Accessibility
Event Synthesizing
signed Peekaboo.app / CLI identity
permission onboarding
UNIX socket Bridge
authenticated host/caller identity
capability negotiation
```

这已经超出“CLI 包一层 macOS API”的复杂度。

Clawdesk 自建等价层会进入高维护、低差异化区域。

## 5.2 Window / Screen

当前 Peekaboo 支持：

```text
screen list
window list
window focus
move / resize / set-bounds
minimize / restore / maximize / close
multi-display
Spaces
```

更重要的是它的可靠性策略：

```text
CG-first inventory
+ AX enrichment
+ exact CGWindowID
+ owner PID / process-start identity
+ receipt pinning
+ dispatch 前后 revalidation
+ actual frame readback
```

geometry 请求被 App 部分约束时会返回实际 frame + warning；完全被忽略时会失败，不把“调用过 API”谎报成成功。

## 5.3 App lifecycle

当前具有：

```text
launch
quit
relaunch
focus / switch
list
wait-ready
```

并与 Bridge/process identity 共享同一 authority model。

## 5.4 UI Observation / Snapshot / Element ID

`peekaboo see` 当前能够：

```text
capture
Accessibility hierarchy / flattened UI map
opaque element IDs
bounds / role / label / description / help / identifier
value / enabled / selected / value-settable
snapshot ID
annotate
Apple Vision OCR
exact-window ROI
```

Snapshot 不只是时间戳：

```text
ps1_<128-bit random>
```

并绑定唯一 live producer；后续 action 不会把任意旧 ID 当成长期 selector。

## 5.5 Interaction / AX direct actions

当前：

```text
click
type
press
scroll
drag
set-value
action
```

其中：

```text
action
→ AXPress / AXShowMenu / AXIncrement ...

set_value
→ Accessibility direct value mutation
```

MCP implementation 会要求 current snapshot、process-generation-bound mutation 和 canonical outcome。

Clawdesk 不值得再从零实现完整等价 AX action engine。

## 5.6 Background operation

这是 Peekaboo 最强的差异之一。

它严格区分：

```text
background authority
foreground consent
```

并根据具体 input surface 决定是否允许：

- targeted semantic click：background AX；
- targeted input：process/snapshot pinned background path；
- raw press：fresh exact-window snapshot receipt；
- shared pointer move/drag：explicit foreground；
- Dock / Space 等共享 UI：explicit foreground。

stale / ambiguous / incomplete target 会尽量在 dispatch 前拒绝。

## 5.7 Menu / Dialog / Dock / Space

Peekaboo 已有正式 native surface：

```text
menu / menubar
dialog
dock
space
```

其中 Dialog 已做到：

```text
prepare exact receipt
→ AXPress
→ verify retained dialog disappears
```

targeted input 可走 background AXValue；save-like file flow 可验证文件实际存在。

这些 macOS-only primitive 不值得 Clawdesk 重复造。

## 5.8 Capture / Vision

当前包括：

```text
see
capture live
action capture
video ingest
ScreenCaptureKit / classic engines
ROI
OCR
annotation
artifact hash / metadata validation
```

这些提供很强的运行证据，但：

```text
capture != Recorder Compiler
```

## 5.9 Agent

当前 `peekaboo agent` 已支持：

```text
run
resume
sessions
chat
max steps
multiple model providers
background-only default
explicit foreground ceiling
execution trace
```

trace 会区分：

```text
executed / failed / skipped-before-dispatch / missing-result
mutation dispatched / not-dispatched / possibly-dispatched
retry-safe
```

所以 Peekaboo 不能再被描述成“只会点鼠标的 primitive driver”。

## 5.10 MCP

当前正式 MCP transport 是：

```text
stdio
```

HTTP / SSE 相关 flags 虽存在，但 server transport 当前未实现。

因此 Clawdesk 第一阶段 Integrate 不应依赖 Peekaboo HTTP/SSE。

Peekaboo 还支持 tool allow/deny，并根据 input strategy 对 `set_value` / `action` 做过滤。

## 5.11 Script runner：纠正旧 Research 认知

历史上 Peekaboo 曾有：

```text
.peekaboo.json
peekaboo run
```

但当前 v4 source contract 已移除 JSON step runner，推荐：

```text
shell chaining peekaboo commands
+ peekaboo verify
```

因此：

```text
Peekaboo supports automation composition
!= Peekaboo has Recorder Compiler / Flow IR runtime
```

这是 Clawdesk Recorder 仍然值得开发的重要差异。

## 6. macOS 技术对比矩阵

| macOS 能力 | Clawdesk / OpenDesk 当前 | Peekaboo 当前 | 谁更成熟 | 重叠 | Clawdesk 决策 |
|---|---|---|---|---|---|
| Permissions | 基础 permission wrapper | signed identity + onboarding + Bridge/TCC owner | Peekaboo | 很高 | Keep Thin Wrapper / Integrate |
| Screenshot | robotgo + screencapture | SCK/CG + capture authority/receipt | Peekaboo | 很高 | Integrate；Native fallback |
| Multi-display | 有 display/capture 基础 | 完整 screen/multi/Space integration | Peekaboo | 高 | 统一抽象 |
| Window discovery | JXA + 新 CG front-window path | CG-first + AX + exact generation | Peekaboo | 很高 | Integrate |
| Window control | JXA，通常 frontmost | exact background + readback/verify | Peekaboo | 很高 | Stop parity |
| App lifecycle | 通用 process/window 为主 | 完整 app surface | Peekaboo | 高 | Integrate |
| Accessibility | 局部 PID hit-test + AXPress | 完整 AX observe/action | Peekaboo | 极高 | 不再造完整 Driver |
| Semantic UI target | OCR/DetectUI/Layout + helper | AX IDs/query + OCR | Peekaboo native 更成熟；Clawdesk fusion 有价值 | 高 | Build normalized fusion |
| Element ID | 无统一 lifecycle | producer-bound snapshot element ID | Peekaboo | 极高 | Consume / normalize |
| Snapshot | Architecture/Plan强，Runtime未统一 | producer-bound authority | Peekaboo | 极高 | Build normalized cross-provider snapshot |
| Menu | 无完整 native surface | mature | Peekaboo | 极高 | Integrate |
| Dialog | 无完整 native surface | mature + postcondition | Peekaboo | 极高 | Integrate |
| Dock | 无 | mature | Peekaboo | 极高 | Integrate |
| Space | 无 | mature | Peekaboo | 极高 | Integrate |
| Click | robotgo + PID/point AXPress | semantic/snapshot/exact background | Peekaboo | 很高 | Native fallback |
| Type | robotgo | background targeted + direct AX routes | Peekaboo | 很高 | Native fallback |
| Hotkey | robotgo | receipt-pinned or explicit foreground | Peekaboo | 很高 | Native fallback |
| Scroll | robotgo | AX/exact targeted strategy | Peekaboo | 很高 | Native fallback |
| Drag | generic pointer | explicit authority model | Peekaboo | 高 | cross-platform primitive only |
| set-value | 无统一 engine | implemented | Peekaboo | 极高 | Integrate |
| AX Action | 局部 AXPress | generic action engine | Peekaboo | 极高 | Integrate |
| Background operation | PID click仍 warp pointer | 核心能力 | Peekaboo | 极高 | Integrate |
| OCR/Vision | 项目重要能力，含 Layout/DetectUI | Apple Vision OCR + analyze/capture | 各有侧重 | 中 | Build fusion |
| MCP | 自有 host facade | raw desktop tool catalog成熟 | Peekaboo primitive更成熟 | 高 | Keep Clawdesk facade |
| CLI | JS/execution runtime | native automation CLI强 | 各有定位 | 中高 | 保留 workflow/runtime入口 |
| Script runner | JS runtime | v4 JSON runner已移除，shell composition | Clawdesk有独立价值 | 中 | Build Flow runtime |
| Agent | 非当前核心差异 | built-in agent/session成熟 | Peekaboo | 高 | 不重复做通用 macOS Agent |
| Evidence | G0-G7/Execution/fixture资产较强，统一 live action evidence仍待补 | receipts/manifest/trace强 | Peekaboo当前运行层更成熟 | 中 | Build business evidence |
| Verification | 架构/Plan强，Runtime未统一 | verify_state + native postconditions | Peekaboo当前实现更成熟 | 中 | Build business verification |
| Recorder | Architecture，未完整实现 | capture/trace不等价 | Clawdesk方向独立 | 低 | Build |
| Replay | 规划 deterministic/hybrid/agent | shell/agent可重复，但无同等级 Flow IR | Clawdesk方向独立 | 低中 | Build |

## 7. macOS 能力去留清单

```text
Window native driver        → Integrate Peekaboo
Screenshot modern backend   → Integrate Peekaboo
Accessibility hierarchy     → Integrate Peekaboo
Menu                         → Stop Building / Integrate
Dialog                       → Stop Building / Integrate
Dock                         → Stop Building / Integrate
Space                        → Stop Building / Integrate
Permission native details    → Keep Thin Wrapper + Provider
Snapshot provider authority  → Integrate
robotgo Mouse/Keyboard       → Use as Fallback
PID AXPress click            → Keep as NativeProvider fallback
JXA window                   → Compatibility / fallback
Clawdesk normalized Snapshot → Build
Locator Bundle               → Build
Verified Business Action     → Build
Verification / Evidence      → Build
Recorder / Flow IR / Replay  → Build
App Adapter                  → Build
Workflow / Recovery          → Build
```

## 8. Peekaboo 的弱点：不要制造不存在的弱点

### 8.1 Peekaboo 已经有 verified native effects

不能再说：

```text
Peekaboo = Action API nil/error
```

它已经会验证：

```text
window geometry readback
window close disappearance
dialog disappearance
save file existence
verify_state predicates
mutation dispatch/retry safety
```

真正尚可形成差异的是：

```text
跨多个 action + 多来源 observation 的业务 Postcondition
```

### 8.2 Peekaboo 已经有 Evidence，但不是 Clawdesk 的完整业务 Evidence Model

Peekaboo 已有：

```text
snapshot receipt
target identity
action outcome
mutation dispatch
capture hashes / manifest
agent execution trace
```

Clawdesk 仍可构建跨 Provider 的：

```text
before
→ target evidence
→ provider action
→ after
→ business verification
→ failure class
→ recovery chain
→ final verdict
```

### 8.3 Recorder 仍是最强差异空间

Peekaboo 的 capture / shell / agent trace 不等于：

```text
Demonstration
→ Raw Trace
→ Distill
→ Parameterize
→ infer assertions/waits
→ Locator Bundle
→ Flow IR
→ generated JS
→ deterministic replay
→ drift diagnosis
→ AI repair
```

### 8.4 App Adapter / business asset lifecycle 仍是空位

本轮没有发现 Peekaboo 建立 Clawdesk 目标中的完整：

```text
Application
→ State
→ Region
→ Semantic Element
→ Skill
→ Workflow
→ Policy
→ Fixture
→ Version Compatibility
```

### 8.5 Cross-platform 仍需要 Clawdesk Provider abstraction

Peekaboo released CLI/app 面向 macOS 15+。

Clawdesk 即使停止 macOS Driver 主线自研，仍应保留：

```text
PeekabooProvider → macOS primary
CuaProvider      → cross-platform / future
NativeProvider   → fallback / legacy / benchmark / special case
```

## 9. 推荐 Integrate 架构

```text
JS / HTTP / MCP / Recorder / Workflow
                 |
                 v
      Clawdesk Public Contract
                 |
                 v
Observation Normalization
Target / Locator Bundle
Verified Action / Policy
Verification / Evidence
                 |
                 v
DesktopProvider
├── PeekabooProvider
├── CuaProvider
└── NativeProvider
```

最小通用接口：

```text
capabilities()
observe()
listWindows()
snapshot()
findTarget()
act()
verify()
captureEvidence()
```

### 9.1 应统一的 common model

```text
application / process / window identity
coordinate spaces
observation timestamp / freshness
target candidates / locator bundle
action intent / risk
provider outcome
verification
failure class
retry safety
evidence refs
final verdict
```

### 9.2 应保留 Provider-specific 的能力

不要把 Peekaboo 降成 lowest-common-denominator。

Peekaboo extension 可保留：

```text
producer snapshot receipt
opaque element ID
AX action / set-value
foreground authority
Bridge host identity
process generation
Menu / Dialog / Dock / Space
capture engine
```

Clawdesk public API 只负责 canonical projection，不应直接暴露 `tm_peekaboo_*` 作为主接口。

## 10. PeekabooProvider 实施顺序

### Phase A：CLI JSON spike

第一阶段优先：

```text
Go
→ exec peekaboo ... --json
→ strict parse
→ normalize into Clawdesk models
```

先覆盖：

```text
capabilities
listWindows
observe / snapshot
act
verify
```

必须记录：

```text
Peekaboo version
source/release identity
provider capability
route
latency
raw outcome ref
```

### Phase B：persistent stdio MCP

当进程启动成本、snapshot locality 或长会话证明 CLI transport 不够时，再接：

```text
Clawdesk internal MCP client
→ persistent peekaboo mcp
```

注意：

```text
MCP = Provider transport
!= Clawdesk public contract
```

### Phase C：signed native helper / embedded Bridge

只有性能、TCC identity、shipping UX、long-lived snapshot ownership 证明需要时再做。

不要第一阶段复制 Peekaboo Bridge protocol。

## 11. `automation/` 应保留什么

保留：

```text
public JS compatibility surface
cross-platform primitives
coordinate/display normalization
OCR / DetectUI / Layout / Vision
NativeProvider fallback
PID AXPress special fallback
provider-neutral types
benchmark/test fake
```

降级为 compatibility/fallback：

```text
robotgo mouse/keyboard
screencapture path
JXA window control
```

不再作为 macOS roadmap 主线扩张：

```text
full AX hierarchy clone
full AX action/set-value clone
Menu/Dialog/Dock/Space clone
ScreenCaptureKit ownership broker
signed Bridge clone
Peekaboo snapshot producer clone
```

不要立即删除现有代码；先完成 Provider migration 与 benchmark，再删除不可达重复路径。

## 12. 量化判断

评分是“继续自研的战略价值”，不是当前完成度。

| 项目 | 自研价值 0—100 | 依据 |
|---|---:|---|
| Clawdesk macOS 原生 Driver | **28** | 新 PID AXPress 有价值，但 Peekaboo native breadth/depth明显领先 |
| Clawdesk MCP Desktop Tool | **35** | raw primitive重复；provider-neutral verified facade仍有价值 |
| Clawdesk Locator | **78** | 应做 cross-provider fusion，不应重造 AX |
| Clawdesk Verification | **94** | 业务 Postcondition 是核心差异 |
| Clawdesk Recorder | **96** | Peekaboo 没有同等级 demonstration→Flow IR compiler |
| Clawdesk App Adapter | **91** | 应用语义资产、版本兼容、Fixture 是长期壁垒 |
| Clawdesk Workflow | **93** | durable verified business flow 高价值 |
| Clawdesk Business Automation | **95** | 最终产品价值所在 |

### 12.1 Peekaboo overlap

定义分母：

```text
如果 Clawdesk 继续自研的 macOS native + semantic desktop driver scope
```

估计：

```text
Peekaboo overlap = 83%
合理区间：80%—88%
```

### 12.2 Clawdesk remaining macOS value

定义分母：

```text
Clawdesk 面向 macOS 自动化最终可创造的整体产品/技术价值
```

在 Integrate-first 后：

```text
Clawdesk remaining macOS value = 72%
合理区间：66%—79%
```

注意：

```text
83% overlap
+ 72% remaining value
```

不是互补数字，因为分母不同。

Driver feature 数量很多，但 Driver feature count 不等于最终业务价值权重。

## 13. 技术与经济判断

### 技术上成立？

**成立。**

现有 Framework 本来就把 Driver 与 Target / Verified Action / Workflow 分层，改成 Provider 是自然演进。

### 维护成本是否显著下降？

**是。**

可以减少重复维护：

```text
TCC/signing churn
ScreenCaptureKit ownership
AX traversal quirks
WindowServer/AX reconciliation
background keyboard/pointer routing
Menu/Dialog/Dock/Space native quirks
Bridge security/capability protocol
macOS release regression matrix
```

### 是否形成真正差异？

**只有上移后才形成。**

如果继续定位为：

```text
另一个 mouse/keyboard/window/screenshot/AX/MCP 项目
```

差异很弱。

如果定位为：

```text
provider-neutral verified automation compiler/runtime
```

则仍有明确技术与产品价值。

## 14. Q1—Q6

### Q1 是否停止大量重复实现 Peekaboo 已有 macOS primitive？

**是。**

停止 full parity；保留 fallback 与跨平台通用 primitive。

### Q2 是否把 Peekaboo 作为正式 Provider / Backend？

**是。**

建议作为 macOS 15+ 首选 Provider，并以 capability negotiation 决定可用能力。

### Q3 `automation/` 哪些保留？

保留 cross-platform/public compatibility、OCR/Layout/Vision、坐标/显示归一化、NativeProvider fallback，以及新 PID AXPress 等特殊 fallback。

### Q4 哪些 macOS 代码未来删除/降级？

robotgo/JXA/screencapture 逐步降为 compatibility/fallback；不再新增完整 AX/Menu/Dialog/Dock/Space/SCK/Bridge clone。真正删除应等待 Provider benchmark 和 public contract 解耦完成。

### Q5 Peekaboo 已存在时，Clawdesk 还有什么不可替代价值？

```text
Cross-provider Observation
Locator Bundle / Target IR
Verified Business Action
Evidence / Verdict
Recorder Compiler
Flow IR / Replay
App Adapter
Recovery
Workflow
Business Automation
```

### Q6 Clawdesk 是否值得继续开发？

```text
Integrate-first
Confidence: 94 / 100
```

如果拒绝上移、坚持复制 macOS primitive，项目价值会显著下降；如果完成 Provider 化并落实 Verification/Recorder/App Adapter/Workflow，仍值得继续。

## 15. 推荐下一阶段

```text
P0-A DesktopProvider contract
→ capabilities / observe / snapshot / act / verify / evidence

P0-B PeekabooProvider CLI JSON spike
→ 先跑 5—8 个关键能力，不追全量 tool mapping

P0-C Provider Benchmark
→ NativeProvider vs PeekabooProvider
→ HTML fixture + Calculator/System Settings + 一个真实动态 App

P0-D Verified Action
→ before / provider outcome / after / business postcondition

P0-E Recorder
→ Action Gateway 收 Raw Trace
→ Distill / Flow IR / generated JS / deterministic replay

P0-F App Adapter
→ 一个简单系统 App + 一个复杂动态 App
```

Benchmark 至少统计：

```text
success rate
false-success rate
target ambiguity
background success
stale-target refusal
postcondition coverage
recovery rate
latency
human intervention
evidence completeness
```

## 16. 执行 Gate

在 Provider benchmark 证明前：

```text
不要删除旧 automation/
不要重写 Architecture
不要把 Peekaboo tool name 泄漏成主 public API
不要依赖 Peekaboo HTTP/SSE
不要把 main 4.2.3 行为自动当作 release 4.2.2 guarantee
不要因为 Peekaboo 强就跳过 Clawdesk 自己的 business verification
```

## 17. 关键 Evidence 索引

Clawdesk / OpenDesk `4ad39fb...`：

```text
automation/mouse.go
automation/mouse_pid_click.go
automation/mouse_pid_click_darwin.go
automation/mouse_pid_click_test.go
automation/cgwindow_darwin.go
automation/keyboard.go
automation/page.go
automation/permissions_darwin.go
automation/window_manager_darwin.go
pkg/mcpserver/runtime.go
pkg/mcpserver/server.go
pkg/execution/

docs/frameworks/automation-framework.md
docs/frameworks/app-development-framework.md
docs/architecture/desktop-automation/action-target-model.md
docs/architecture/desktop-automation/app-adapter-contract.md
docs/architecture/desktop-automation/agent-first-recorder.md
docs/quality/gates-and-evidence.md
docs/quality/mcp/2026-05-19-macos-smoke.md
```

Peekaboo `8d5e638...`：

```text
README.md
version.json
docs/automation.md
docs/permissions.md
docs/bridge-host.md
docs/MCP.md
docs/v4-migration.md
docs/commands/see.md
docs/commands/window.md
docs/commands/space.md
docs/commands/menu.md
docs/commands/dialog.md
docs/commands/dock.md
docs/commands/capture.md
docs/commands/verify.md
docs/commands/agent.md
Core/PeekabooCore/Sources/PeekabooAgentRuntime/MCP/Tools/ActionTool.swift
Core/PeekabooCore/Sources/PeekabooAgentRuntime/MCP/Tools/SetValueTool.swift
Core/PeekabooCore/Sources/PeekabooAgentRuntime/Support/ToolFiltering.swift
```

## 18. 一句话结论

> Peekaboo 已经让 Clawdesk 继续自研完整 macOS Native Driver 变成低回报重复建设；但它没有消灭 Clawdesk 的项目价值，而是迫使项目把价值从“我也能操纵 Mac”上移到“我能把多个 Provider 的动作编译成可验证、可恢复、可录制、可复用的业务自动化”。
