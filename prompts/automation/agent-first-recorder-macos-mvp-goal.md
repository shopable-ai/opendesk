# Agent-first Recorder macOS MVP 执行 GOAL

## 使用方式

将本文件正文作为一次独立工程执行任务使用。执行者必须基于执行时最新仓库事实推进，不得把文件中的历史 SHA、假设或计划状态当成实现完成证据。

---

# OpenDesk Agent-first Recorder macOS MVP：轨迹采集、有效路径蒸馏、脚本生成与无 AI 回放执行任务

请直接继续开发 GitHub 仓库：

```text
https://github.com/shopable-ai/opendesk
```

默认分支：

```text
master
```

## 一、第一步：重新建立事实基线

不要假设本提示词生成时的 HEAD 仍然最新。

执行开始后必须：

1. 读取当前 `master` 最新 HEAD；
2. 检查当前工作树、并行修改和未提交文件；
3. 阅读根目录 `AGENTS.md`；
4. 阅读并以以下正式文档为设计与执行基线：

```text
docs/architecture/desktop-automation/agent-first-recorder.md
docs/plans/desktop-automation/agent-first-recorder-macos-mvp.md
docs/frameworks/automation-framework.md
docs/frameworks/app-development-framework.md
docs/architecture/desktop-automation/action-target-model.md
docs/quality/gates-and-evidence.md
docs/quality/failure-taxonomy.md
docs/implementation/macos/automation-config.md
```

5. 审计当前真实源码：

```text
pkg/execution/
automation/
pkg/http/
pkg/mcpserver/
cmd/opendesk/
polyfills/
types/
schemas/
tests/
scripts/
```

6. 不得覆盖用户或其他 Agent 的并行修改，不得使用破坏性 `git reset --hard`、无选择清理或重写历史。

## 二、本轮唯一 Goal

在当前 macOS 主机上完成一个受控、Evidence-first 的 Agent-first Recorder MVP：

```text
Agent 通过 JavaScript / HTTP / MCP 执行少量桌面操作
→ Recorder 采集动作、结构化意图、窗口、截图、结果和验证证据
→ Raw Trace 落盘
→ 删除探索、失败和重复行为，生成 Flow IR
→ 编译为 OpenDesk JavaScript
→ 在不调用 AI 的情况下确定性回放
→ 验证后置条件
→ 输出完整 Evidence 和 bounded verdict
```

本轮不是开发传统人工全局宏录制器。

## 三、必须保留的架构决策

### 3.1 Agent-first

MVP 只记录经过 OpenDesk JS、HTTP 或 MCP 执行的 Agent 行为，不实现系统级人工鼠标键盘全局监听。

### 3.2 三层权威工件

```text
Raw Trace：真实发生的事实，不可变
Flow IR：经过蒸馏的正式脚本权威源
Generated JavaScript：可以重新生成的派生产物
```

不得将一边录制一边拼接的 `mouse.click(x, y)` 文本当作正式 Recorder 架构。

### 3.3 Evidence 优先

默认可信度：

```text
真实状态和动作前后 Evidence
> Tool 请求、返回和错误
> Agent 结构化 Hint
> Agent 自然语言描述
```

不得把 Agent 的“我已经点击成功”当作 postcondition。

不得记录、索取或依赖模型私有思维链。只保存以下结构化业务提示：

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

### 3.4 AI-optional replay

至少实现 deterministic 无 AI 回放。AI 可以用于后续蒸馏建议和失败修复，但不能成为普通脚本执行的硬依赖。

### 3.5 复用现有执行基础

当前仓库已有 `pkg/execution` 的 execution ID、Emitter、事件 NDJSON、摘要、订阅和 artifact 管理。

必须复用并扩展这些基础，不得创建第二套平行通用日志系统。

Recorder TraceEvent 可以拥有独立 schema 和文件，但必须关联现有 execution identity 与 artifact lifecycle。

### 3.6 显式 Session 隔离

- JS / HTTP：Recorder Session 绑定单个 runtime / execution；
- MCP：`recorder.start` 返回显式 `recordingSessionId`，可变动作携带该 ID；
- 不得使用无隔离的 package-global active session；
- 必须测试并发 Session 不串线。

### 3.7 递归保护

Recorder 内部触发的 screenshot、AX、OCR、Vision 或 window observation 必须标记：

```text
origin=recorder
internal=true
parentActionId=<action-id>
```

这些数据进入 Evidence，但不能再次触发 Recorder，也不能直接编译成业务动作。

## 四、实现范围

### 4.1 新增产品入口

建立：

```text
apps/recorder/
```

首版只做薄入口或薄 UI，用于查看：

```text
Session
Goal / source
动作数量
Trace 路径
Distill 状态
生成脚本路径
Replay 结果
失败 Evidence
```

核心逻辑不得埋在 UI 中。

### 4.2 新增可复用内核

建立或根据现有结构合理调整：

```text
pkg/recorder/
├── model/
├── session/
├── trace/
├── observe/
├── distill/
├── compiler/
├── replay/
├── verify/
├── privacy/
└── store/
```

不要为了机械匹配目录而制造大量空包。可以先建立最小合并包，但必须保持职责边界清晰，并在 README 或 godoc 中说明演进路径。

### 4.3 Schema 与类型

至少提供：

```text
schemas/recorder-trace-v1.schema.json
schemas/recorder-flow-v1.schema.json
schemas/recorder-manifest-v1.schema.json
types/recorder.d.ts
```

Schema 必须覆盖：

```text
schemaVersion
sessionId
actionId
sequence
executionId
source
classification
ActionHint
request
before
result
after
verification
evidenceRefs
privacy classification
```

### 4.4 Action Observer / Gateway

定义唯一共享动作观测契约，例如：

```go
type ActionObserver interface {
    Before(ActionContext, ActionRequest) (ActionSpan, error)
    After(ActionSpan, ActionResult, error)
}
```

首轮接入动作：

```text
focusWindow
click
doubleClick
type
pressKey
hotkey
scroll
```

`drag` 可以在基础闭环通过后增加。

Observation 类调用可以进入 Raw Trace，但默认不进入 Flow 主路径：

```text
screenshot
getActiveWindow
listWindows
OCR
detectUI
analyzeLayout
```

### 4.5 JS / HTTP / MCP 接入

#### JavaScript

提供 runtime-local Recorder facade，至少包含：

```text
Recorder.start(options)
Recorder.annotate(hint)
Recorder.status()
Recorder.stop(options)
```

Agent 可以在动作前提供 Hint；即使没有 Hint，也必须记录基础事实。

#### HTTP

允许脚本执行请求通过 recorder options 启用录制，并将 recording / flow / replay 工件位置加入执行结果或摘要。

#### MCP

增加：

```text
recorder.start
recorder.annotate
recorder.status
recorder.stop
```

并让可变动作接受可选：

```text
recordingSessionId
hint
```

未启用 Recorder 时，旧 MCP 和 Runtime 行为必须保持兼容。

## 五、macOS Observation

### 5.1 权限

Agent-first MVP 的基础权限：

```text
Accessibility
Screen Recording
```

条件性权限：

```text
Automation：只有 AppleEvents 场景才要求
```

本轮不得把 Input Monitoring 设为硬依赖，因为没有实现人工全局事件录制。

所有真实桌面测试优先由固定路径的 `dist/OpenDesk.app` 身份发起，避免权限绑定到 Terminal、Codex 或其他宿主。

### 5.2 环境 preflight

将以下信息写入：

```text
.runtime/tests/recorder/preflight/
```

包括：

```text
最新 HEAD
sw_vers
uname -m
go version
locale
显示器与 scale
OpenDesk.app bundle id / codesign identity
权限状态
目标应用存在性
关键应用语言
```

### 5.3 标准 Observation

默认 `standard`：

```text
Tool 请求与结果
活动应用和窗口
窗口 bounds
显示器和 scale
可变动作前后活动窗口截图
基础稳定等待
动作耗时和错误
```

### 5.4 Enriched Observation

在点击歧义、失败或 Golden 样本中增加 macOS AXUIElement 查询：

```text
role
subrole
title
description
identifier
value（敏感字段除外）
enabled
focused
position
size
受限 parent / sibling 上下文
```

目标应尽量通过点击点反查 AX 元素。Accessibility 不可用时允许降级，但必须记录 F0/F1 与降级原因。

首轮继续复用当前 OpenDesk screenshot 实现，不为了 Recorder MVP 强制迁移 ScreenCaptureKit。

## 六、运行工件

一次录制默认写入：

```text
.runtime/recordings/<session-id>/
├── manifest.json
├── raw/events.ndjson
├── observations/
│   ├── windows/
│   ├── screenshots/
│   ├── accessibility/
│   └── vision/
├── distilled/
│   ├── flow.json
│   ├── variables.json
│   └── report.json
├── generated/flow.js
├── repairs/history.ndjson
└── runs/<run-id>/
```

运行日志、截图、临时配置、测试输出和生成脚本快照不得提交到源码目录。

只有稳定源码、Schema、正式文档和审查过的 fixture 进入版本控制。

## 七、轨迹蒸馏

先实现确定性规则，不要一开始依赖 LLM：

```text
连续字符输入 → 一个 type / fill step
重复观察 → 从业务主路径删除
无状态变化的重复动作 → 删除或 warn
错误路径后成功回退 → Raw Trace 保留，Flow 主路径删除
替代定位方式成功 → 形成 locator fallback
固定 sleep → waitFor 候选 + timeout 上限
具体输入 → literal / variable / secret
失败或 incomplete 动作 → 不得静默成为成功步骤
```

每个 Flow Step 必须保留：

```text
sourceActionIds
intent
target / locator bundle
preconditions
action
expected postconditions
verification
fallbacks
risk
```

## 八、Compiler 与 Replay

### 8.1 Compiler

由 Flow IR 生成可读、可维护的 OpenDesk JavaScript。

生成脚本不应复制复杂定位算法；应调用可复用 replay / locator runtime。

### 8.2 Deterministic Replay

第一版定位顺序：

```text
AX identifier
→ role + accessible name
→ parent / region / anchor
→ OCR / visual candidate（可选）
→ window-relative geometry
→ absolute coordinate
```

遇到低置信度或多个接近候选：

```text
warn / stop / human or agent escalation
```

不得盲目点击最高分候选。

### 8.3 Verification

动作 API 返回 nil 不等于业务成功。

每个关键步骤执行：

```text
precondition
→ resolve target
→ action
→ observe again
→ postcondition
→ verdict
```

所有失败映射到 `docs/quality/failure-taxonomy.md` 的 F0-F10。

## 九、测试要求

### 9.1 T1 单元测试

覆盖：

```text
model
schema
session lifecycle
concurrent session isolation
NDJSON append / recovery
privacy redaction
distill rules
compiler golden output
replay state machine
recursive observation guard
```

### 9.2 T2 集成测试

覆盖：

```text
JS recorder routing
HTTP recorder routing
MCP recorder routing
旧请求兼容
execution / recording artifact association
```

Runtime API 一致性测试必须遵守 `AGENTS.md`：通过 JavaScript 文件测试，不得为了测试 Runtime API 直接写 Go 调用替代真实 JS 契约。

### 9.3 T3 / T4 macOS 真实场景

#### 场景 A：本地 HTML Recorder Benchmark

单页包含：

```text
多个按钮
输入框
复选框
下拉框
滚动区
延迟元素
模态框
状态反馈区
按钮顺序和文字扰动
```

任务：

```text
输入唯一 token
选择选项
点击语义目标
等待结果
验证状态
```

#### 场景 B：Calculator

```text
计算 123 × 456
验证 56088
```

扰动窗口位置、初始状态和重复运行。

#### 场景 C：TextEdit

第一轮只做可撤销编辑：

```text
新建空白文档
输入唯一 token 与多行文本
全选并替换
验证文本值
关闭时不保存
```

第二轮才把文件保存到 `.runtime/tests/recorder/` 并校验内容。

#### 场景 D：Finder read-only（可选）

只操作预先创建在 `.runtime/tests/recorder/fixtures/` 的目录；禁止删除、移动、覆盖和批量重命名。

### 9.4 失败注入

至少覆盖：

```text
目标不存在
候选不唯一
窗口不是前台
窗口尺寸变化
Screen Recording 拒绝
Accessibility 拒绝
动作后无状态变化
损坏 NDJSON 尾行
stop 后写入
两个并发 Session
```

失败的合格表现是：

```text
正确分类
安全停止
Evidence 完整
错误目标点击为 0
不产生假 pass
```

## 十、正式验收门槛

### 数据

- 100% 可变动作具有 session / action / sequence / request / result；
- 动作具有 before / after，或明确 observation failure；
- 每个 Flow Step 可追溯 Raw Action；
- secret 明文泄露为 0；
- Recorder 内部观测递归事件为 0。

### 场景

- HTML 基础任务 deterministic replay：10/10；
- HTML 扰动：至少 8/9，错误目标点击为 0；
- Calculator：5/5；
- TextEdit：5/5；
- 强制失败：至少 3/3 安全停止并正确分类；
- 至少一个 JavaScript-recorded 和一个 MCP-recorded Flow 在关闭 AI 后回放成功。

### 兼容性

- Recorder 关闭时原有 JS / HTTP / MCP 基础行为不回归；
- 现有测试继续通过；
- `docs/api/`、`types/recorder.d.ts` 与真实 runtime 行为一致。

## 十一、实现顺序

严格按以下顺序推进，每一阶段通过最小 Gate 后再进入下一阶段：

```text
P0 事实审计与 macOS preflight
P1 model + schema + store
P2 session + action observer
P3 JS / HTTP / MCP adapters
P4 macOS observation + evidence
P5 distill + flow + compiler
P6 deterministic replay + verification
P7 apps/recorder thin UI
P8 docs / types / tests / claim calibration
```

不要先做 UI，也不要先做 AI repair。

## 十二、提交策略

按可回滚的小批次提交：

```text
1. model / schema / store
2. session / observer
3. JS / HTTP adapter
4. MCP adapter
5. macOS observation
6. distill / compiler
7. replay / verify
8. thin app
9. tests / docs / evidence calibration
```

每批提交前：

- 重新读取最新 HEAD；
- 检查并行修改；
- 运行对应测试；
- 保存 Evidence；
- 不提交 `.runtime/`；
- 不夸大 Claim。

## 十三、停止条件

以下任一问题出现时，不得继续扩展功能面：

```text
Session 串线
Action 与 Evidence 无法关联
Recorder 内部递归
坐标体系不可解释
权限主体漂移
生成脚本误点目标
postcondition 假阳性
无 AI 时完全不能运行
UI 复制核心逻辑
为了 MVP 必须大规模重写 automation/
```

先修复底层，再继续进入下一阶段。

## 十四、本轮最终交付报告

执行完成后必须报告：

```text
执行前 HEAD
执行后 HEAD
新增 / 修改文件
真实实现了哪些能力
哪些仍为 interface / mock / plan
运行过的测试命令
T1 / T2 / T3 / T4 结果
macOS 环境与权限事实
Evidence 路径
失败分类与未解决问题
允许做出的 bounded Claim
明确不能做出的 Claim
后续最小下一步
```

不得只给总结性文字而缺少源码、测试和 Evidence。不得因为单次 smoke 成功就声称通用 Recorder、完全自愈或 production-ready。
