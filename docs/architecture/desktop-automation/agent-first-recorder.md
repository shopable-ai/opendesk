# Agent-first Recorder 架构决策与核心模型

## 状态

- 架构方向：`Accepted for MVP`
- 当前实现成熟度：`Experimental / bounded vertical slice`
- 首个平台：macOS
- 产品入口：`apps/recorder/`
- 可复用内核：`pkg/recorder/`
- 运行工件：`.runtime/recordings/`
- 本文件同时标记 `Current` 与 `Target`；没有标记为 Current 的目标能力，不得表述为已经实现。
- 当前 Calculator 垂直闭环通过只证明一个受控场景，不证明通用 Recorder 正确。

本文中的三个词必须严格区分：

```text
Current     当前源码已经存在的行为
Validated   有当前、可复核 Runtime Evidence 的受限能力
Target      目标架构或后续实现方向
```

## 一、要解决的问题

传统 Recorder 直接记录鼠标坐标、按键和固定等待，容易生成只能在原窗口位置、原尺寸和原文案下运行的脆弱宏。

OpenDesk 第一阶段不先建设完整的人工全局输入录制器，而是优先处理已经经过 OpenDesk 执行的 Agent 行为：

```text
Agent 目标与结构化意图
→ OpenDesk Tool / Runtime API 调用
→ 动作前观察
→ 动作执行
→ 动作后观察与验证
→ 原始 Trace
→ 有效路径提炼
→ Flow IR
→ 可重复运行脚本
```

正式定位：

> Recorder 是 Agent 操作轨迹采集、有效路径蒸馏、脚本编译、无 AI 回放与失败修复系统，而不只是鼠标键盘宏录制器。

## 二、当前仓库事实与接入点

当前代码已经具备以下可复用基础：

- `pkg/execution/` 已有 execution ID、结构化事件、NDJSON 落盘、摘要、订阅和运行工件管理；
- CLI 与 HTTP JavaScript 执行已经能够经过 `pkg/execution.RunWithEmitter`；
- `automation.InitJSWithOptions` 已接受 `EventSink`，当前已确认可用于结构化 console 事件；
- `pkg/mcpserver/recorder.go` 已将一批 MCP 动作接入显式 Recorder Session；
- `automation/` 已提供 Mouse、Keyboard、Window、Screenshot、OCR、Detect UI 与 Layout 等基础能力；
- `pkg/recorder/` 已有 Session、Raw Trace、存储、脱敏、基础 Distiller、Compiler 和 Replay contract；
- `apps/recorder/` 当前只是本地工件查看器，不是完整 Recorder 产品 UI；
- `schemas/recorder/` 当前为 `0.1.0`，只覆盖最小 Manifest、Trace Event 和 Flow；
- 当前 MCP `standard` 观察可保存活动窗口信息和动作前后截图；`enriched` 尚未形成独立的 AX/OCR/Vision 语义采集链。

因此不得另建一套与 `pkg/execution` 平行的通用日志系统。Recorder 应复用 execution identity、artifact 和 event 基础设施，并增加动作级 Observer、录制 Session 与 Flow 工件。

### 2.1 当前实现正确性审计

当前实现可以支撑受控 HTML 与 Calculator 垂直验证，但以下事实意味着它还不能作为
通用 Recorder 的正确性证明：

| 领域 | Current | 正确性风险 | Target |
| --- | --- | --- | --- |
| Verification | `tm_recorder_verify` 可以写入 Agent 提交的 verdict | Agent 声明可能与独立真值混淆 | verifier identity、oracle type、trust level 和独立 Evidence 成为强制字段 |
| Distillation | `fail` 动作会删除；`unknown`、`warn` 仍可进入 Flow | 未验证动作可能被编译 | 未通过强 Oracle 的关键动作不得晋级 deterministic Flow |
| Postcondition | 生成器只实现少量 `displayEquals` 与 `dom.*` | 未知 postcondition 当前可能被忽略并 false pass | 编译期拒绝未知 verifier；运行期未知 verifier 必须 F6/F8 停止 |
| Observation | `minimal` 与截图型 `standard` 已存在 | `enriched` 尚未真正生成 AX/OCR/Vision 语义 | 多模态 Evidence Bundle + 坐标/时间对齐 |
| Target | 主要来自 Agent hint、动作参数和窗口相对点 | 语义目标可能只是描述，不是观测事实 | App/Profile/State/Region/Element candidate set 与多信号 provenance |
| Locator | 当前通常只有一个 window-relative candidate | `confidence=1` 缺少可校准依据，fallback 未形成 | 多候选、分信号置信度、歧义阈值和 resolver decision trace |
| Replay | DOM stable id 与 Calculator 专用 fresh-state click | 还不是通用 App Adapter / Skill / Workflow runtime | 复用 Automation Framework 的 Discovery 到 Evidence 闭环 |
| Safety count | `wrongTargetClicks` 当前只是报告字段 | 不能靠初始化为 0 证明没有误点 | 独立 action ledger、target identity 对账和 false-pass audit |
| Privacy count | 参数会脱敏，但 Manager 丢弃脱敏计数 | `secretPlaintextLeakCount=0` 不能单独证明零泄露 | 计数、扫描、遮罩和 artifact privacy audit 一致 |
| Portability | replay config 可包含一次性绝对路径 | 旧脚本不能作为可移植资产直接重跑 | portable variables/config + run-local path injection |

当前正式结论必须因此保持为：

```text
bounded scenario validated
!= generic Recorder correctness proven
```

## 三、核心决策

### D1. Agent-first，人工 Recorder 后置

MVP 只记录通过 OpenDesk JS、HTTP 或 MCP 执行的行为，不先监听用户在整个系统中的全部鼠标键盘事件。
Current 控制面是 MCP-first；完整 JavaScript / HTTP Recorder session routing 仍是 Target。

收益：

- 不需要先解决全局 Event Tap、输入法、组合键、隐私输入和大量低级事件归并；
- Agent 可以提供 Goal、Intent、Target、Expected Postcondition 等结构化语义；
- 可以直接关联 Tool 调用、返回结果、窗口、截图和验证证据；
- 更适合先在少量软件中完成闭环。

### D2. Raw Trace 不可变，Flow IR 才是脚本权威源

```text
raw/events.ndjson
→ distilled/flow.json
→ generated/flow.js
```

- Raw Trace 保存真实发生过的行为，不因后续优化而改写；
- Flow IR 保存经过裁剪、合并、参数化和验证的正式步骤；
- JavaScript 是可重新生成的派生产物，不是唯一 Source of Truth；
- 定位器、验证条件、恢复策略不能只存在于生成代码中。

### D3. Evidence 高于 Agent 描述

可信度默认顺序：

```text
真实状态与动作前后 Evidence
> Tool 请求、返回和运行错误
> Agent 结构化 Action Hint
> Agent 自然语言说明
```

Agent 可以说“准备点击提交按钮”，但只有动作结果和后置状态能证明点击是否发生、业务是否成功。

Recorder 不保存或依赖模型的私有思维链。只允许保存与自动化有关的结构化摘要：

```text
goal
subgoal
intent
targetDescription
expectedPostconditions
risk
variableHints
recoveryReason
```

### D4. 正常回放必须可以不使用 AI

Target 中同一份 Flow IR 支持三种执行模式：

```text
deterministic
→ 只使用结构化定位、Accessibility、文字、Anchor、布局、图像和坐标回退

hybrid
→ 正常步骤确定性执行，仅在定位或状态恢复失败时请求 AI 建议

agent
→ Agent 可以根据当前状态重新规划，但仍受 Gate、Evidence 和安全策略约束
```

录制阶段可以使用 Agent，生成脚本后的常规批量执行不能强制要求模型或网络。
Current Compiler 只支持 `deterministic`；`hybrid` 和 `agent` 是后续架构模式，不是当前能力。

### D5. 不允许使用隐式进程级“当前录制会话”

Recorder Session 必须显式关联。Current 已实现 MCP 显式 Session；JS / HTTP 绑定仍是
Target：

- JS / HTTP：会话绑定到单个 Goja runtime / execution；
- MCP：`recorder.start` 返回 `recordingSessionId`，可变更动作显式携带该 ID；
- 同一进程未来可以存在多个 Session；
- 不使用无隔离的 package-global active session，避免并发任务串线。

### D6. 统一动作语义，不要求一次重构全部底层驱动

Target 建立共享 Action Observer / Gateway Contract：

```go
type ActionObserver interface {
    Before(ActionContext, ActionRequest) (ActionSpan, error)
    After(ActionSpan, ActionResult, error)
}
```

Current 只有一批 MCP tool adapter 接入该语义。Target 中 JS Binding、HTTP execution
和 MCP tool adapter 都调用同一套 Recorder 语义与存储逻辑。底层 `automation.Mouse`、
`Keyboard`、`WindowManager` 可以先保持兼容，后续再逐步收敛。

MVP 优先覆盖：

```text
focusWindow
click
doubleClick
type
pressKey
hotkey
scroll
drag（可以后置到第二批）
```

Observation 类调用也可以进入 Raw Trace，但默认不编译成业务动作：

```text
screenshot
getActiveWindow
listWindows
OCR
detectUI
analyzeLayout
```

### D7. Recorder 自己产生的观测不能递归录制

动作前后截图、AX 查询、OCR 或 Layout 分析由 Recorder 内部触发时必须带：

```text
origin=recorder
internal=true
parentActionId=<action-id>
```

内部观测进入 Evidence，但不能再次触发 before/after capture，也不能成为生成脚本中的独立业务步骤。

### D8. 录制期允许多模态与在线模型，回放期默认禁止

录制阶段的目标是提高对真实界面的理解质量，可以按需组合：

```text
活动窗口截图 / 动作前后关键帧
+ Accessibility / DOM
+ OCR / Layout / Detect UI / Template
+ 点击点附近 crop 与上下文区域
+ 可选在线视觉大模型
```

在线模型只允许输出结构化的语义候选、候选关系、描述和置信度，不得直接把自己的
判断写成已验证事实。模型输出必须保留：

```text
provider / model
promptVersion
inputEvidenceRefs
candidate set
supportingSignals / counterSignals
confidence
outputHash
latencyMs
```

不保存私有思维链。涉及敏感画面时，必须先执行截图遮罩、crop 最小化、用户策略和
provider policy；不允许为了提高成功率无条件上传整个桌面。

确定性回放默认不调用在线模型。Hybrid Repair 必须是显式模式，并产生 repair
proposal、差异、Evidence 和人工/策略 Gate，不能静默修改后继续执行。

### D9. 语义描述与事实来源必须同时保存

面向人工阅读的 `desc` / `intent` 很重要，但语义字段不能脱离观测来源。一个正式
Step 至少同时保存：

```text
desc                    人能读懂的步骤说明
intent                  业务目的
target.semanticName     目标的语义名称
target.candidates       实际候选集合
locatorBundle           可执行定位策略
sourceActionIds         Raw Trace 来源
evidenceRefs            AX/DOM/OCR/图像/窗口证据
expectedPostconditions  独立成功判据
```

`desc="点击保存"` 本身不是目标定位证据；`OCR` 识别出“保存”也不能单独证明它就是
正确按钮。语义必须经过 App State、Region、候选消歧与动作后验证。

### D10. 生成代码是产品交付物，不是 Trace 转储

生成代码必须同时满足：

- 可读：Goal、变量、业务步骤、desc 和预期状态在文件前部清晰可见；
- 可运行：只依赖正式 OpenDesk Runtime/API 与显式配置；
- 可移植：不把一次运行的 PID、绝对 Evidence 路径或绝对坐标当作长期真值；
- 可验证：每个关键动作显式包含 precondition 和 postcondition；
- 可追溯：通过 sidecar/source map 关联 Flow step 与 Raw Action，而不是把全部 Trace 塞进业务代码；
- 可测试：Workflow、Skill、Locator 与 Oracle 可以分别做 contract 和 live test；
- 可失败：未知动作、未知 verifier、候选歧义和不可观察状态必须 fail closed；
- 默认无 AI：常规 replay 不依赖 Codex、LLM 或自然语言规划。

生成器不能只把整个 Flow JSON 内嵌后交给一个不透明循环。高质量目标是基于通用
Framework 生成 App Profile、Skill、Workflow 和 Verified Action 的清晰组合。

## 四、目标系统结构

Recorder 必须复用 Automation Framework 的主闭环，而不是建立“截图后直接问模型点哪里”的
旁路：

```text
Discover
→ Observe
→ Understand
→ Locate
→ Resolve Geometry
→ Act
→ Observe Again
→ Verify
→ Diagnose / bounded Recover
→ Evidence
```

录制流水线：

```text
Agent / Script / User Intent
├── JavaScript Runtime
├── HTTP Script Execution
└── MCP Tools
        ↓
Explicit Recorder Session + Source Adapter
        ↓
Action Gateway
├── App / Window / Page State Discovery
├── Before Evidence Acquisition
├── AX / DOM / OCR / Vision Candidate Extraction
├── Optional Online Model Semantic Proposal
├── Target Resolver + Guard
├── Action Executor
├── After Evidence Acquisition
├── Independent Postcondition Verification
└── Append-only Trace Store
        ↓
Immutable Raw Trace + Evidence Bundle
        ↓
Trajectory Alignment
→ Semantic Enrichment
→ Workflow / Skill Discovery
→ Rule + AI Distillation Proposal
→ Provenance / Verification Gate
        ↓
Workflow IR + Skills + Locator Bundles + Variables + Source Map
        ↓
Framework-aware Compiler
        ↓
Human-readable OpenDesk JavaScript
```

回放流水线：

```text
Generated Workflow
→ App Profile / State Discovery
→ Deterministic Locator Resolver
→ Verified Action
→ Independent Oracle
→ Step Evidence
→ Workflow Verdict
```

Hybrid 或 Agent Repair 只能从失败出口进入，不能嵌在 deterministic 正常路径：

```text
deterministic failure
→ diagnosis bundle
→ repair proposal
→ policy / human gate
→ new Flow version
→ regression replay
```

建议代码边界：

```text
apps/recorder/
├── main.go
└── internal/
    ├── sessionview/
    ├── traceview/
    └── runview/

pkg/recorder/
├── model/
├── session/
├── trace/
├── observe/
├── distill/
├── compiler/
├── replay/
├── verify/
├── repair/
├── privacy/
└── store/
```

`apps/recorder` 只负责产品入口和薄 UI；模型、存储、编译、回放与测试能力必须放在
`pkg/recorder`，以便 CLI、HTTP 和 MCP 复用。上面的目录是目标模块边界；当前源码仍是
`pkg/recorder/*.go` 的扁平实验实现，不得把目标目录图描述成已完成重构。

## 五、Raw Trace 与语义 Trace 模型

### 5.1 Current v0.1 最小 Action

当前每个 Action 至少包含：

```json
{
  "schemaVersion": "0.1.0",
  "sessionId": "rec-...",
  "actionId": "act-...",
  "executionId": "exec-...",
  "source": "mcp|js|http",
  "classification": "observe|act|verify|recover|meta",
  "goal": "...",
  "hint": {
    "intent": "...",
    "targetDescription": "...",
    "expectedPostconditions": [],
    "risk": "low|medium|high"
  },
  "request": {
    "name": "click",
    "arguments": {}
  },
  "before": {
    "windowRef": "...",
    "screenshotRef": "...",
    "targetSnapshotRef": "..."
  },
  "result": {
    "ok": true,
    "durationMs": 0,
    "error": ""
  },
  "after": {
    "windowRef": "...",
    "screenshotRef": "...",
    "stateDiffRef": "..."
  },
  "verification": {
    "status": "pass|warn|fail|unknown",
    "evidenceRefs": []
  }
}
```

必须具有：

- `sessionId + actionId + sequence`；
- 动作来源和真实参数；
- 执行耗时与错误；
- 关键可变动作的 before / after；
- Evidence 引用而不是在 NDJSON 中重复写入大块图像；
- schema version；
- 敏感数据处理状态。

### 5.2 Target v0.2 多模态语义扩展

后续 Schema 不能只增加一个自由文本 `desc`。目标结构需要把人类可读语义、机器可执行
定位和事实来源分开：

```json
{
  "description": "点击计算器数字 1",
  "intent": "enter_first_operand_digit",
  "appContext": {
    "appProfileId": "macos-calculator",
    "windowIdentity": "...",
    "pageState": "basic-calculator-ready"
  },
  "perception": {
    "frameRefs": ["..."],
    "targetCropRef": "...",
    "accessibilityRef": "...",
    "ocrRef": "...",
    "layoutRef": "...",
    "modelInferenceRef": "..."
  },
  "target": {
    "semanticName": "digit-1 button",
    "regionId": "keypad",
    "candidates": [],
    "selectedCandidateId": "candidate-1",
    "selectionEvidenceRefs": []
  },
  "verification": {
    "status": "pass",
    "verifierId": "calculator-ax-display-observer",
    "oracleType": "accessibility",
    "trustLevel": "independent",
    "observed": {"display": "1"},
    "evidenceRefs": []
  },
  "provenance": {
    "sourceActionIds": ["act-000003"],
    "derivedBy": "rule|model|human",
    "transformVersion": "..."
  }
}
```

约束：

- `description` / `intent` 可以由 Agent 或模型提出，但必须带 provenance；
- `selectedCandidateId` 必须存在于同一 Evidence Bundle 的 candidates；
- 模型输出不得覆盖原始 OCR、AX、DOM 或 frame；
- `verification.status=pass` 只有 `trustLevel=independent` 或显式人工 Gate 才能晋级正式 Flow；
- Trace Event 与二进制 Evidence 必须有 hash/index，损坏尾行恢复也必须在报告中暴露，不能静默丢失后继续给出完整性 PASS。

## 六、Observation Policy

为控制性能和数据量，Recorder 使用三级策略：

### minimal

```text
Tool 请求与结果
时间戳
当前应用与窗口
执行错误
```

### standard（MVP 默认）

```text
minimal
+ 可变动作前后活动窗口截图
+ 动作时刻关键帧与点击点 crop
+ 窗口 bounds / display / scale
+ 动作后稳定等待与基础状态差异
```

默认优先事件驱动关键帧，不持续录制整个桌面。每个 frame 必须携带 capture timestamp、
surface/window identity、bounds、scale 与 coordinate transform，保证点击事件可以对齐到
正确画面，而不是事后凭文件名猜测。

### enriched

```text
standard
+ 点击点 AXUIElement 快照
+ 父级链与邻近元素
+ OCR / Detect UI / Layout 候选
+ 目标裁剪图与视觉指纹
+ 可选动作前后短时 frame segment
+ 可选在线视觉模型的结构化语义候选
```

`enriched` 默认只在以下情况启用：

- 目标定位需要强健化；
- 出现失败或候选歧义；
- 正在生成 Golden fixture；
- 用户显式选择高证据模式。

`enriched` 的多模态管线属于 Target。当前 MCP capture 仍主要保存窗口快照和截图；在
Accessibility、OCR、Vision、模型输出真正写入独立 artifact 并关联到 action 前，不得把
`observationPolicy=enriched` 本身当作 enriched Evidence 已完成的证明。

## 七、macOS 目标信息

Agent-first MVP 不需要 Input Monitoring，因为它不监听人工全局输入。首轮权限为：

```text
Accessibility：动作控制和 AX 元素查询
Screen Recording：截图与视觉 Evidence
Automation：只有需要 AppleEvents 控制目标应用时才要求
Input Monitoring：人工 Recorder / 全局热键阶段再要求
```

macOS enriched observation 默认采用：

```text
AXIsProcessTrustedWithOptions
→ AXUIElementCreateSystemWide
→ AXUIElementCopyElementAtPosition
→ 读取 role / subrole / title / description / identifier / value / enabled / focused / position / size
→ 读取受限的 parent / sibling 上下文
```

密码、令牌和疑似敏感字段不读取明文 value。

首轮继续复用 OpenDesk 当前截图实现，不为了 Recorder MVP 强制迁移 ScreenCaptureKit。ScreenCaptureKit 可以在后续需要高频窗口流、低延迟视频或内容选择器时单独评估。

未来人工 Recorder 才评估 `CGEventTapCreate` 的 passive listen-only Event Tap，并单独处理 Input Monitoring、输入法、密码输入和隐私告知。

## 八、录制期多模态理解流程

用户提出的“录屏/截图 + OCR + 在线大模型”不应成为一个直接返回点击坐标的黑盒，必须
沿用 Framework 的 Discover、Observe、Understand、Locate、Act、Verify 分层。

### 8.1 Evidence Acquisition

每个动作窗口至少形成一个 `EvidenceBundle`：

```text
surface snapshot
before frame
click-time frame / point
after-stable frame
window / display / scale / timestamp
optional AX / DOM snapshot
optional target crop / short frame segment
```

采集控制器负责时间与坐标对齐，不做业务语义判断。

### 8.2 Local Perception First

优先执行低成本、可重复的结构化感知：

```text
DOM / Accessibility
→ Region / Layout
→ localized OCR
→ Template / visual fingerprint
→ online vision model when needed
```

OCR 应限制在目标窗口、Region 或点击 crop 内，并保留文本 bbox、confidence、语言和
provider。禁止把整屏 OCR 文本直接拼成唯一 locator。

### 8.3 Semantic Proposal

在线模型接收最小必要 Evidence 与当前 Goal，输出受 Schema 约束的 proposal：

```json
{
  "pageState": "basic-calculator-ready",
  "actionDescription": "点击数字 1 按钮",
  "intent": "enter_first_operand_digit",
  "targetCandidates": [
    {
      "candidateId": "candidate-1",
      "semanticName": "digit-1 button",
      "supportingSignals": ["ax-role+name", "ocr-text", "click-crop"],
      "counterSignals": [],
      "confidence": 0.98
    }
  ],
  "expectedPostconditions": [
    {"kind": "displayEquals", "value": "1"}
  ]
}
```

模型只提出 candidate 与语义，不执行动作、不覆盖 Raw Evidence、不直接写入独立
verification verdict。

### 8.4 Candidate Fusion 与 Action Guard

Target Resolver 对结构化信号和模型 proposal 做融合：

```text
App identity
→ Window identity
→ Page / State
→ Region
→ Candidate set
→ signal agreement / conflict
→ unique target or ambiguity
→ geometry projection
```

至少两个弱信号不能因为都来自同一张图就被当成两个独立证据。候选来源、相关性和冲突
必须保留。低置信度、候选不唯一、frame 过期或坐标不可解释时必须停止。

### 8.5 Action 后独立验证

动作后模型可以帮助描述差异或提出 verifier，但正式成功必须由应用可观察 Oracle、
多源 verifier 或人工 Gate 给出。执行器自己的返回值、模型的“看起来成功”和前后图像
相似度都不能单独构成 PASS。

### 8.6 怎样证明 OCR / 在线模型确实提高准确率

不能用几次最终任务成功主观判断模型有效。需要在同一批带人工/机器真值的 Evidence
Bundle 上做消融对比：

```text
A：AX / DOM only
B：A + region-aware OCR / layout
C：B + online vision model proposal
D：C + candidate fusion / abstention policy
```

至少测量：

```text
target_candidate_recall       正确目标是否进入候选集
target_selection_precision    已选择目标中有多少确实正确
semantic_description_accuracy desc / intent / role 是否与人工标注一致
postcondition_precision       建议的成功判据是否真的能证明状态
ambiguity_detection_recall    多候选时是否正确拒绝执行
false_action_rate             错误目标动作率
false_pass_rate               执行器成功但独立 Oracle 失败的比例
abstention_quality             不确定时停止是否正确
latency / model cost           准确率收益对应的延迟和成本
```

复杂 UI 优先优化 precision、ambiguity detection 和 abstention，而不是只追求“多点几次后
最终成功”。只有 C/D 相比 A/B 在固定 benchmark 与扰动集上提高目标精度，并保持
`false_action_rate=0`、`false_pass_rate=0`，才能宣称在线模型提高了当前范围准确率。

## 九、轨迹蒸馏与 Workflow 发现

Distillation 不能只是“删除 observation、合并 type”。目标流程分为五步：

```text
1. Timeline Alignment
   对齐 action、frame、window、AX/DOM、OCR、model proposal 和 verification

2. Semantic Enrichment
   为动作补充 desc、intent、App State、Region、Target candidates 与 provenance

3. Effective Path Selection
   区分探索、失败、补偿、重复、必要初始化和真实成功路径

4. Skill / Workflow Discovery
   识别可复用 Skill、变量、等待、条件、状态转移和 cleanup

5. Validation and Promotion
   Schema、规则、人工可读审查、独立 Oracle、deterministic replay 和扰动 Gate
```

AI 可以参与步骤 2 到 4，但输出始终是 `DistillationProposal`。规则引擎必须检查来源
完整性；关键动作必须通过 verifier trust gate；最终生成一个新 Flow version，不能覆盖
Raw Trace。

Workflow 发现优先遵循应用开发框架：

```text
Business Goal
→ App Profile
→ Page / State transitions
→ Region / Element
→ Verified Action
→ reusable Skill
→ Workflow
```

不能仅依据时间相邻把动作合成 Skill，也不能仅依据 Agent 自然语言推断隐藏分支。循环、
条件和恢复路径必须有重复 Trace、显式规则、fixture 或人工确认支撑。

### 保留

- 产生有效状态变化且结果通过验证的动作；
- 为成功动作提供必要定位或等待信号的观察；
- 形成稳定 fallback 所需的失败候选信息；
- 必要的窗口切换、前置条件和结果断言。

### 从主路径删除但保留在 Raw Trace

- 错误点击后已经回退的探索路径；
- 重复截图和无效 OCR；
- 没有提供新信息的轮询；
- 被后续输入完全覆盖的临时输入；
- 没有发生状态变化的重复动作。

### 转换

```text
连续字符输入
→ fill / type step

大量滚轮事件
→ scroll 或 scrollUntil

固定 sleep
→ waitFor state，保留 timeout 上限

失败后换定位方式成功
→ 主 locator + fallback locator

具体业务值
→ literal / variable / secret 参数
```

AI 可以提出蒸馏候选，但正式 Flow 必须经过 schema、规则校验、回放和 Evidence Gate。不得因 AI 声称“已经优化”而直接覆盖 Raw Trace 或静默发布脚本。

## 十、Workflow IR 与目标模型

Current v0.1 只有 `Flow.steps[]`。Target IR 应与 Framework 的 App、Skill、Workflow
分层一致：

```text
Workflow
├── goal / description
├── appProfiles[]
├── variables / secrets
├── initialStatePolicy
├── skills[]
├── steps[]
├── finalPostconditions[]
├── cleanupPolicy
└── sourceMap

Skill
├── id / description / intent
├── input / output
├── preconditions
├── steps[]
└── postconditions

Step
├── id / desc / intent
├── sourceActionIds
├── app / window / pageState
├── target / candidateSet
├── locatorBundle
├── preconditions
├── action
├── expectedPostconditions
├── verifierPolicy
├── failure / recovery policy
└── risk / evidenceRefs
```

`desc` 面向人工阅读；`intent` 面向业务组合；`target` 面向语义身份；`locatorBundle`
面向执行；`sourceActionIds` 和 `evidenceRefs` 面向审计。四者不得合并成一个模糊字符串。

坐标仅是某次执行的 geometry projection。Locator 默认优先级：

```text
稳定原生 identifier / automation id
→ role + accessible name
→ parent / region / anchor 关系
→ OCR / visual semantic candidate
→ target image
→ window-relative geometry
→ absolute coordinate
```

低置信度或多个近似候选必须 `warn`、stop 或请求人工/Agent 消歧，不能盲点最高分候选。

一个 deterministic Flow 进入编译前必须满足：

```text
所有 Step 有 provenance
所有 act Step 有 target 与 locator policy
所有关键 Step 有已支持的 verifier
unknown / model-only verification 为 0
未知 action / postcondition 为 0
高风险 Gate 完整
portable variable/config 已提取
```

## 十一、高质量 JavaScript 生成目标

生成代码应采用“业务脚本在前、Framework 能力在后”的风格。下面是目标风格示意，
不是当前已发布 Runtime API：

```js
const task = {
  id: "calculator-123-times-456",
  description: "使用 macOS Calculator 计算 123 × 456",
  expectedResult: "56088",
};

const steps = [
  pressButton({ desc: "清除当前输入", name: ["AC", "C", "清除"], expectDisplay: "0" }),
  pressButton({ desc: "清除待处理运算", name: ["AC", "全部清除"], expectDisplay: "0" }),
  pressButton({ desc: "输入数字 1", name: "1", expectDisplay: "1" }),
  pressButton({ desc: "输入数字 2", name: "2", expectDisplay: "12" }),
  pressButton({ desc: "输入数字 3", name: "3", expectDisplay: "123" }),
  pressButton({ desc: "选择乘法", name: ["×", "Multiply"] }),
  pressButton({ desc: "输入数字 4", name: "4", expectDisplay: "4" }),
  pressButton({ desc: "输入数字 5", name: "5", expectDisplay: "45" }),
  pressButton({ desc: "输入数字 6", name: "6", expectDisplay: "456" }),
  pressButton({ desc: "计算结果", name: ["=", "Equals"], expectDisplay: task.expectedResult }),
];

async function main() {
  const app = await calculator.discover({ bundleId: "com.apple.calculator" });
  await runWorkflow({ task, app, steps, mode: "deterministic" });
  await calculator.expectDisplay(task.expectedResult);
}

await main();
```

编译器应从稳定的 Framework primitives 或经过版本控制的 App Adapter 生成上述调用，
而不是为每次录制复制一份 Calculator 专用 watcher 解析器。底层 locator、Evidence、
failure mapping 和 source map 可以放在导入的 runtime helper 或 sidecar 中，但业务步骤
必须清晰可见。

生成质量 Gate：

```text
Readability      业务顺序、desc、输入和期望结果可直接审查
Framework Fit    使用 Discovery / State / Locator / Verified Action / Workflow
Portability      无固定 PID、一次性绝对路径和裸绝对坐标依赖
Traceability     每步能回到 Flow 与 Raw Trace
Determinism      同一 normalized Flow 产生相同业务代码
Verifiability    未支持 verifier 在编译期失败
Safety           无隐式 retry、补偿点击或 AI repair
Testability      可做 syntax、contract、fixture、live 与 perturbation 测试
```

当前 `pkg/recorder/compiler.go` 仍将完整 Flow JSON 和场景特定 helper 内嵌到单文件；它是
垂直闭环实现，不是本节高质量目标已经完成的证明。

## 十二、运行工件和版本库边界

一次录制默认写入：

```text
.runtime/recordings/<session-id>/
├── manifest.json
├── raw/
│   └── events.ndjson
├── observations/
│   ├── windows/
│   ├── screenshots/
│   ├── frames/
│   ├── crops/
│   ├── accessibility/
│   ├── ocr/
│   ├── layout/
│   └── vision-model/
├── evidence/
│   ├── index.json
│   └── hashes.json
├── distilled/
│   ├── workflow.json
│   ├── flow.json
│   ├── variables.json
│   ├── source-map.json
│   └── report.json
├── generated/
│   ├── flow.js
│   └── replay-config.example.json
├── repairs/
│   └── history.ndjson
└── runs/
    └── <run-id>/
```

以下内容才进入版本控制：

```text
pkg/recorder 源码
apps/recorder 源码
schemas
正式文档
稳定的 tests/recorder/fixtures
经过审查的 examples
```

运行截图、临时脚本、录制历史和 smoke 输出不得提交到源码目录。

上面包含 Current 与 Target 的并集。当前 v0.1 不保证已经生成 `frames/`、`ocr/`、
`vision-model/`、`evidence/index.json`、`workflow.json` 或 `source-map.json`；消费者必须以
Manifest capability/version 声明判断，不得仅根据目录名推断能力存在。

## 十三、隐私与安全

输入值分类：

```text
literal：可直接写入脚本
variable：提取到 variables.json
secret：只保存变量名、来源类型和掩码，不保存明文
redacted：完全不用于脚本生成
```

强制规则：

- 密码框和疑似令牌默认 `secret`；
- 截图和短时 frame segment 必须支持遮罩、crop 最小化和 retention policy；
- 在线模型调用必须显式记录 provider、model、输入 Evidence 引用、privacy decision 和输出 hash；
- 未通过 privacy policy 的画面不得上传外部 provider；
- Agent Hint 不得包含不必要的个人数据；
- send、submit、delete、purchase、payment 等动作保持独立高风险 Gate；
- 自愈只能生成候选 Diff，不能在高风险步骤中静默修改并执行。

## 十四、正确性 Gate 与 Verdict

Recorder 每个阶段映射 Framework G0-G7：

| Recorder 阶段 | Gate | 必须证明 |
| --- | --- | --- |
| Session / environment | G0 | 权限、目标应用、输出目录、版本与策略可用 |
| Frame / AX / DOM acquisition | G1 | Evidence 属于当前窗口、当前时间和当前坐标系 |
| OCR / Layout / Vision | G2 | 感知输出完整，confidence 与漂移可解释 |
| Semantic proposal / target candidates | G3 | 语义有 supporting evidence，歧义不会被吞掉 |
| Flow promotion | G4 | target、precondition、postcondition、failure strategy、provenance 完整 |
| Replay step | G5 | 独立 Oracle 证明动作后状态 |
| High-risk action | G6 | 授权、身份、状态、风险和人工 Gate 完整 |
| Final report / repair | G7 | Claim 可追溯，失败可分类，Evidence 完整 |

正式报告必须拆开：

```text
RECORDER_FIDELITY
PERCEPTION_ACCURACY
SEMANTIC_TARGET_PRECISION
DISTILLATION_PRECISION
GENERATED_CODE_QUALITY
DETERMINISTIC_REPLAY
REPLAY_ROBUSTNESS
SAFETY
```

以下任何一项成立时不得给出完整 PASS：

```text
unknown verifier 被静默忽略
model-only verdict 被当成独立真值
unsupported action / postcondition 被跳过
候选歧义后仍执行点击
wrongTargetClicks 仅由执行器自报
Evidence 与 action/window/timestamp 无法对齐
生成代码依赖一次性 PID、绝对路径或裸坐标
关键应用状态不可观察
```

## 十五、当前实现修正优先级

### P0：先消除 false pass

1. 为 Verification 增加 `verifierId`、`oracleType`、`trustLevel`、`observedAt` 和 provenance；
2. Distiller 默认拒绝关键 `unknown/warn/model-only` verification；
3. Compiler 对未知 action、locator kind 和 postcondition 编译失败；
4. Replay 遇到未知 verifier 必须停止，禁止无操作跳过；
5. 用独立 action ledger 计算 wrong-target / false-pass，不再信任固定为 0 的字段；
6. 修正 secret redaction counter，并增加 artifact privacy scan；
7. Trace tail recovery、artifact 缺失和 hash 不一致必须进入 F7 Evidence。

### P1：建立真正的 enriched recording

1. Action 前后 keyframe、点击 crop、窗口/显示器/坐标系和时间对齐；
2. AX/DOM snapshot 与点击点 element hit-test；
3. Region-aware OCR、Layout、Template 与 candidate provenance；
4. 可选在线模型 Semantic Proposal，包含 schema、prompt version 和 privacy gate；
5. 多信号 fusion、置信度拆分、歧义和 counter-signal 处理。

### P2：从 Flow 生成 Framework 风格代码

1. 将 App Profile、State、Target、Verified Action、Skill、Workflow 纳入 IR；
2. 引入 `description/desc`、source map 和 portable variables；
3. 把通用 replay helper 从每个生成文件中抽离；
4. 为同一 normalized Flow 建立 byte-stable compiler golden test；
5. 对生成代码分别执行 readability review、syntax、contract、fixture、live、perturbation 和 failure-injection Gate。

P0 完成前不应继续扩大到复杂应用；P1/P2 完成前不能把当前 Calculator 专用链路称为
通用 Workflow Recorder。

## 十六、MVP 明确不做

- 人工全局鼠标键盘录制；
- 完整输入法与密码事件捕获；
- 复杂拖拽时间线编辑器；
- 自动推导任意循环、分支和跨应用业务逻辑；
- 微信发送、支付、删除等高风险真实流程；
- 每一步都调用大模型；
- 静默自愈和无 Evidence 的成功声明；
- 为 Recorder 重写当前全部 Mouse / Keyboard / Window API。

## 十七、后续阶段

```text
Phase 0：P0 false-pass hardening 与 verifier trust boundary
Phase 1：多模态 Evidence Bundle 与 enriched observation
Phase 2：Semantic Proposal、candidate fusion 与 App State
Phase 3：Workflow / Skill IR 与高质量 Framework-aware Compiler
Phase 4：无 AI deterministic replay 的跨应用 benchmark
Phase 5：显式 Hybrid Repair proposal 与 regression gate
Phase 6：人工 Recorder + CGEventTap
Phase 7：复杂应用、多窗口和跨应用工作流
```

## 十八、相关文档

- [自动化总体框架](../../frameworks/automation-framework.md)
- [应用自动化开发框架](../../frameworks/app-development-framework.md)
- [能力开发与成熟度路径](../../frameworks/capability-development.md)
- [Desktop App Adapter Contract](./app-adapter-contract.md)
- [Action Target Model](./action-target-model.md)
- [Gates and Evidence](../../quality/gates-and-evidence.md)
- [Global Failure Taxonomy](../../quality/failure-taxonomy.md)
- [macOS 自动化授权配置](../../implementation/macos/automation-config.md)
- [Recorder 文档驱动开发与准确性验证](../../implementation/desktop-automation/agent-first-recorder-development-and-verification.md)
- [Agent-first Recorder macOS MVP 执行计划](../../plans/desktop-automation/agent-first-recorder-macos-mvp.md)

## 十九、Apple 官方依据

- [CGEventTapCreate](https://developer.apple.com/documentation/coregraphics/cgevent/tapcreate%28tap%3Aplace%3Aoptions%3Aeventsofinterest%3Acallback%3Auserinfo%3A%29)
- [AXIsProcessTrustedWithOptions](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions)
- [AXUIElement](https://developer.apple.com/documentation/applicationservices/axuielement_h)
- [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- [Accessibility Inspector](https://developer.apple.com/documentation/accessibility/accessibility-inspector)
- [XCTest](https://developer.apple.com/documentation/xctest)
- [Resetting access to protected resources in macOS](https://developer.apple.com/documentation/xcode/resetting-access-to-protected-resources-in-macos)
