# Agent-first Recorder 架构决策与核心模型

## 状态

- 决策状态：`Accepted for MVP`
- 首个平台：macOS
- 产品入口：`apps/recorder/`
- 可复用内核：`pkg/recorder/`
- 运行工件：`.runtime/recordings/`
- 本文件定义长期架构边界，不代表功能已经实现或通过真实桌面测试。

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

当前代码已经具备可复用基础：

- `pkg/execution/` 已有 execution ID、结构化事件、NDJSON 落盘、摘要、订阅和运行工件管理；
- CLI 与 HTTP JavaScript 执行已经能够经过 `pkg/execution.RunWithEmitter`；
- `automation.InitJSWithOptions` 已接受 `EventSink`，当前已确认可用于结构化 console 事件；
- `pkg/mcpserver/runtime.go` 中 click、type、press、scroll、focus 等动作仍直接调用 `automation`，没有经过统一 Recorder Trace；
- `automation/` 已提供 Mouse、Keyboard、Window、Screenshot、OCR、Detect UI 与 Layout 等基础能力；
- 当前根目录没有 `apps/`，Recorder 将成为该目录下首批产品级应用之一。

因此不得另建一套与 `pkg/execution` 平行的通用日志系统。Recorder 应复用 execution identity、artifact 和 event 基础设施，并增加动作级 Observer、录制 Session 与 Flow 工件。

## 三、核心决策

### D1. Agent-first，人工 Recorder 后置

MVP 只记录通过 OpenDesk JS、HTTP 或 MCP 执行的行为，不先监听用户在整个系统中的全部鼠标键盘事件。

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

同一份 Flow IR 支持三种执行模式：

```text
deterministic
→ 只使用结构化定位、Accessibility、文字、Anchor、布局、图像和坐标回退

hybrid
→ 正常步骤确定性执行，仅在定位或状态恢复失败时请求 AI 建议

agent
→ Agent 可以根据当前状态重新规划，但仍受 Gate、Evidence 和安全策略约束
```

录制阶段可以使用 Agent，生成脚本后的常规批量执行不能强制要求模型或网络。

### D5. 不允许使用隐式进程级“当前录制会话”

Recorder Session 必须显式关联：

- JS / HTTP：会话绑定到单个 Goja runtime / execution；
- MCP：`recorder.start` 返回 `recordingSessionId`，可变更动作显式携带该 ID；
- 同一进程未来可以存在多个 Session；
- 不使用无隔离的 package-global active session，避免并发任务串线。

### D6. 统一动作语义，不要求一次重构全部底层驱动

建立共享 Action Observer / Gateway Contract：

```go
type ActionObserver interface {
    Before(ActionContext, ActionRequest) (ActionSpan, error)
    After(ActionSpan, ActionResult, error)
}
```

JS Binding、HTTP execution 和 MCP tool adapter 都调用同一套 Recorder 语义与存储逻辑。底层 `automation.Mouse`、`Keyboard`、`WindowManager` 可以先保持兼容，后续再逐步收敛。

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

## 四、目标系统结构

```text
Agent / Script / User
├── JavaScript Runtime
├── HTTP Script Execution
└── MCP Tools
        ↓
Source Adapter
        ↓
Recorder Action Gateway / Observer
├── Session Context
├── Action Hint
├── Before Observation
├── Action Executor
├── After Observation
├── Postcondition Result
└── Trace Store
        ↓
Raw Trace
        ↓
Trajectory Distiller
        ↓
Flow IR + Locator Bundle + Variables
        ↓
Compiler
        ↓
OpenDesk JavaScript
        ↓
Deterministic / Hybrid / Agent Replay
        ↓
Run Evidence + Repair Proposal
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

`apps/recorder` 只负责产品入口和薄 UI；模型、存储、编译、回放与测试能力必须放在 `pkg/recorder`，以便 CLI、HTTP 和 MCP 复用。

## 五、最小 Trace 模型

每个 Action 至少包含：

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
+ 窗口 bounds / display / scale
+ 动作后稳定等待与基础状态差异
```

### enriched

```text
standard
+ 点击点 AXUIElement 快照
+ 父级链与邻近元素
+ OCR / Detect UI / Layout 候选
+ 目标裁剪图与视觉指纹
```

`enriched` 默认只在以下情况启用：

- 目标定位需要强健化；
- 出现失败或候选歧义；
- 正在生成 Golden fixture；
- 用户显式选择高证据模式。

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

## 八、轨迹蒸馏规则

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

## 九、Flow IR 与目标模型

Flow Step 应复用并扩展 `action-target-model.md` 中的原则：

```text
Intent
Target / Candidate Set
Locator Bundle
Resolved Geometry
Preconditions
Action
Expected Postconditions
Verification
Fallbacks
Risk / Safety Policy
```

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

## 十、运行工件和版本库边界

一次录制默认写入：

```text
.runtime/recordings/<session-id>/
├── manifest.json
├── raw/
│   └── events.ndjson
├── observations/
│   ├── windows/
│   ├── screenshots/
│   ├── accessibility/
│   └── vision/
├── distilled/
│   ├── flow.json
│   └── variables.json
├── generated/
│   └── flow.js
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

## 十一、隐私与安全

输入值分类：

```text
literal：可直接写入脚本
variable：提取到 variables.json
secret：只保存变量名、来源类型和掩码，不保存明文
redacted：完全不用于脚本生成
```

强制规则：

- 密码框和疑似令牌默认 `secret`；
- 截图允许配置遮罩区域；
- Agent Hint 不得包含不必要的个人数据；
- send、submit、delete、purchase、payment 等动作保持独立高风险 Gate；
- 自愈只能生成候选 Diff，不能在高风险步骤中静默修改并执行。

## 十二、MVP 明确不做

- 人工全局鼠标键盘录制；
- 完整输入法与密码事件捕获；
- 复杂拖拽时间线编辑器；
- 自动推导任意循环、分支和跨应用业务逻辑；
- 微信发送、支付、删除等高风险真实流程；
- 每一步都调用大模型；
- 静默自愈和无 Evidence 的成功声明；
- 为 Recorder 重写当前全部 Mouse / Keyboard / Window API。

## 十三、后续阶段

```text
Phase 1：Agent Action Trace
Phase 2：有效轨迹蒸馏与 Flow IR
Phase 3：无 AI 编译和回放
Phase 4：macOS AX Locator Bundle
Phase 5：Hybrid Repair
Phase 6：人工 Recorder + CGEventTap
Phase 7：复杂应用、多窗口和跨应用工作流
```

## 十四、相关文档

- [自动化总体框架](../../frameworks/automation-framework.md)
- [应用自动化开发框架](../../frameworks/app-development-framework.md)
- [Action Target Model](./action-target-model.md)
- [Gates and Evidence](../../quality/gates-and-evidence.md)
- [Global Failure Taxonomy](../../quality/failure-taxonomy.md)
- [macOS 自动化授权配置](../../implementation/macos/automation-config.md)
- [Recorder 文档驱动开发与准确性验证](../../implementation/desktop-automation/agent-first-recorder-development-and-verification.md)
- [Agent-first Recorder macOS MVP 执行计划](../../plans/desktop-automation/agent-first-recorder-macos-mvp.md)

## 十五、Apple 官方依据

- [CGEventTapCreate](https://developer.apple.com/documentation/coregraphics/cgevent/tapcreate%28tap%3Aplace%3Aoptions%3Aeventsofinterest%3Acallback%3Auserinfo%3A%29)
- [AXIsProcessTrustedWithOptions](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions)
- [AXUIElement](https://developer.apple.com/documentation/applicationservices/axuielement_h)
- [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- [Accessibility Inspector](https://developer.apple.com/documentation/accessibility/accessibility-inspector)
- [XCTest](https://developer.apple.com/documentation/xctest)
- [Resetting access to protected resources in macOS](https://developer.apple.com/documentation/xcode/resetting-access-to-protected-resources-in-macos)
