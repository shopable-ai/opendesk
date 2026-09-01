# OpenDesk 自动化平台能力补全计划

## 文档状态

- 类型：`Plan`
- 状态：`Active planning baseline`
- 保存日期：2026-08-31
- 保存时审计基线：`master@0f66ffb252202aeb1a5c19859130cf5ef6b7d1e3`
- 适用范围：OpenDesk 桌面自动化平台的跨模块能力补全、优先级、依赖关系和验收边界

保存时 HEAD 只用于说明本次判断基于哪个代码快照，后续执行不得把该 SHA 当成最新事实。每一阶段开始前仍需重新读取当前 `master`、源码、测试和运行 Evidence。

本文件记录待完成事项，不代表其中能力已经实现、已经通过测试或已经达到生产可用。

## 一、为什么保存到 Plan，而不是 Research

这批内容已经不只是开放问题或候选方案比较，而是包含：

```text
当前缺口
→ 优先级
→ 依赖关系
→ 实施顺序
→ 验收条件
```

因此正式位置应为：

```text
docs/plans/desktop-automation/
```

不同文档类型的边界：

```text
Research
用于尚未收敛的市场、竞品、技术路线、方案比较和外部资料研究

Plan
用于已经确认值得推进的能力缺口、阶段、任务、优先级和验收条件

Architecture / ADR
用于已经接受并需要长期维持的系统边界、模型和契约

Implementation
用于当前真实实现机制、代码路径、平台细节和排障方法

Quality
用于测试矩阵、失败分类、Gate、Benchmark 和运行 Evidence
```

本文件中的某个设计经过实现与验证后，应上收到相应 Architecture / Framework / Quality 文档；已经完成或失效的计划项应关闭、更新或归档，不能永远保留为“待做”。

## 二、与现有文档的关系

本文件是跨模块的总补全计划，不替代以下专项文档：

- [`../../frameworks/automation-framework.md`](../../frameworks/automation-framework.md)：自动化总体闭环与系统分层。
- [`../../frameworks/capability-development.md`](../../frameworks/capability-development.md)：L0—L12 从简单到复杂的成熟度路径。
- [`../../frameworks/app-development-framework.md`](../../frameworks/app-development-framework.md)：具体应用的分析、Adapter、Skill、Workflow 与测试方法。
- [`../../frameworks/runtime-api-extension-framework.md`](../../frameworks/runtime-api-extension-framework.md)：JavaScript、HTTP/MCP、Native/Go 与商业定制的扩展边界。
- [`../../architecture/desktop-automation/action-target-model.md`](../../architecture/desktop-automation/action-target-model.md)：动作目标、候选、前置条件、后置条件和回退原则。
- [`../../architecture/desktop-automation/app-adapter-contract.md`](../../architecture/desktop-automation/app-adapter-contract.md)：Surface、Layout、Semantic Adapter、Action 和 Verification 契约。
- [`../../architecture/desktop-automation/agent-first-recorder.md`](../../architecture/desktop-automation/agent-first-recorder.md)：Recorder 的长期架构边界。
- [`../../research/desktop-automation/2026-08-31-clawdesk-vs-peekaboo.md`](../../research/desktop-automation/2026-08-31-clawdesk-vs-peekaboo.md)：macOS Native Driver 重叠审计、Peekaboo Integrate-first 决策输入。
- [`agent-first-recorder-macos-mvp.md`](agent-first-recorder-macos-mvp.md)：Recorder 首个 macOS 有界实施计划。
- [`app-target-priority-matrix.md`](app-target-priority-matrix.md)：真实应用候选及其 Evidence 条件。
- [`../runtime/runtime-extension-roadmap.md`](../runtime/runtime-extension-roadmap.md)：Runtime 扩展、资源加载和第三方 Extension 的候选演进路线。
- [`../../quality/gates-and-evidence.md`](../../quality/gates-and-evidence.md)：G0—G7 质量 Gate 与 Evidence 规则。

处理原则：

```text
本文件决定“先补什么、怎样分阶段”
专项架构决定“该模块长期怎样设计”
专项实施计划决定“本轮具体怎样落地”
源码、测试和运行 Evidence 决定“实际上是否完成”
```

## 三、当前总体判断

OpenDesk 已经建立较完整的顶层方法：

```text
Observe
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

也已经定义：

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

当前主要问题不是继续增加更大的概念框架，而是：

> 顶层原则与当前真实 Runtime 之间仍缺少一组可复用、可验证、可持久运行的中间执行层。

保存时能够确认的基础包括：

- JavaScript / CLI、HTTP execution 与 MCP 三种主要入口；
- 鼠标、键盘、窗口、截图、剪贴板、OCR、Detect UI、Layout 等基础能力；
- `pkg/execution/` 的 execution ID、结构化事件、摘要和 artifact；
- MCP 的 `inspect → find → act` 基础链路，以及部分 stale、ambiguity、window/target guard；
- `pkg/semanticexec/` 的 Scenario、失败分类、Route、Verification 和 Recovery Budget 数据模型；
- G0—G7 Gate、Failure Taxonomy 和 Evidence 规则。

但以下能力尚不能仅凭文档宣称完整：

- 所有入口共用的 Observation Snapshot；
- 正式 Locator Engine 与可校准的多信号候选融合；
- 所有动作统一经过动作后观察和 Postcondition 验证；
- `semanticexec` 接入真实桌面 Runtime，而不是主要由 Mock Outcome 驱动；
- 真正可取消、暂停、恢复、持久化和重放的长期 Execution；
- App Package / App Registry；
- 正式 Skill / Workflow / Supervisor Runtime；
- Recorder 从 Trace 到 Flow IR、生成脚本和无 AI Replay 的实现闭环；
- 贯穿所有入口的风险、权限、隐私和 Human Gate；
- L0—L12 与可重复测试、指标和 Evidence 的完整映射。

### 3.1 2026-08-31 Peekaboo 审计后的执行校准

`2026-08-31-clawdesk-vs-peekaboo.md` 对当前 macOS primitive 做源码级重叠审计后，确认：

```text
继续补完整 macOS Native Driver
!= 当前最优开发顺序
```

当前执行原则调整为：

```text
macOS 15+ 主路径
→ 优先验证 PeekabooProvider

OpenDesk Native macOS
→ compatibility / fallback / benchmark / special case

OpenDesk 核心研发
→ Observation Normalization
→ Locator / Target
→ Verified Action
→ Verification / Evidence
→ Recorder
→ App Adapter
→ Workflow / Recovery
```

因此需要把 **Desktop Execution Provider 边界**从后续平台化工作前移到 P0，在 P0-02 Observation、P0-03 Locator 和 P0-04 Verified Action 大规模实现之前完成最小 Provider spike。

约束：

- 这不是直接删除 `automation/`；
- 这不是把 Peekaboo tool 名称暴露成 OpenDesk 公共 API；
- 这不是用竞品 Research 直接改写 Architecture；
- Provider benchmark 之前，不把 NativeProvider 或 PeekabooProvider 任一方宣称为稳定默认；
- `P1-14 Provider Registry` 仍保留，但其职责升级为跨类型 Provider 的注册、健康、质量、成本和 fallback 治理，不再承担首次引入 DesktopProvider abstraction 的任务。

## 四、当前最缺的四条闭环

### 4.1 可验证动作闭环

```text
动作前观察
→ 前置条件检查
→ 目标解析
→ 风险判断
→ 执行动作
→ 动作后观察
→ Postcondition 验证
→ succeeded / failed / inconclusive
→ 恢复、停止或人工接管
→ Evidence
```

当前必须避免：

```text
Runtime API 返回 nil
→ 直接认定业务成功
```

### 4.2 Recorder 生成与回放闭环

```text
动作与上下文采集
→ Raw Trace
→ 目标语义化
→ 无效路径裁剪
→ 变量与敏感值提取
→ 断言生成
→ Flow IR
→ JavaScript 编译
→ Dry Run
→ 无 AI Replay
→ 漂移检测
→ 修复建议
```

当前必须避免：

```text
记录 x/y
→ 固定 sleep
→ 拼接 click/type 脚本
```

Recorder 的正式架构和首个 MVP 已分别由 `agent-first-recorder.md` 与 `agent-first-recorder-macos-mvp.md` 管理，本计划只保留其在整个能力路线中的位置和依赖。

### 4.3 App 资产生命周期闭环

```text
App Profile
→ Window / Page / State
→ Region Model
→ Locator
→ Verified Action
→ Skill
→ Workflow
→ Policy
→ Fixture
→ Test
→ Evidence
→ Version / Compatibility / Deprecation
```

一个应用不应只表现为散落脚本、固定坐标或单次测试文件。

### 4.4 长任务执行闭环

```text
创建任务
→ 排队
→ 桌面资源租约
→ 执行
→ Checkpoint
→ 暂停 / 恢复
→ 取消
→ 有界重试
→ Replay
→ 释放资源
→ 历史查询与清理
```

Execution 不能只停留在“启动一次 JavaScript 并在内存中保存状态”。

## 五、P0：必须先完成的核心能力

### P0-00 DesktopProvider Boundary + PeekabooProvider Spike

目标：在继续扩张 macOS primitive 之前，先证明桌面底层能力可以通过 Provider contract 替换，而 JavaScript、HTTP、MCP、Recorder 和 Workflow 不绑定具体 Provider。

最小 contract：

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

首个 Provider：

```text
PeekabooProvider
NativeProvider
```

后续候选：

```text
CuaProvider
```

第一阶段 Peekaboo transport 优先使用：

```text
CLI --json
```

在性能、snapshot locality 或长会话证明需要后，再评估 persistent stdio MCP；当前不依赖 Peekaboo 尚未实现的 HTTP/SSE server transport。

完成标志：

- 同一 OpenDesk action contract 可以在 PeekabooProvider 与 NativeProvider 间切换；
- Provider-specific receipt / element ID 可以保留 extension，同时能投影为统一 Action / Evidence 结果；
- public JS/HTTP/MCP 不出现 `peekaboo_*` 作为主要稳定 API；
- capability 缺失在 dispatch 前返回 structured blocker；
- 至少用 HTML Benchmark、一个系统 App 和一个真实动态 App 比较成功率、假成功率、background、stale refusal、latency 与 Evidence；
- Benchmark 前不删除现有 native fallback。

### P0-01 能力事实注册表

目标：建立项目能力的机器可读事实层，区分：

```text
not-started
planned
partial
mock-only
contract-tested
externally-blocked
live-smoke-verified
stable
deprecated
```

每项能力至少记录：

```text
capabilityId
owner package
public entrypoints
platforms
permissions
maturity
implementation paths
test levels
latest Evidence refs
known limitations
last verified environment
```

完成标志：

- README、用户 API、MCP Tool、HTTP Route 和 Runtime Capability 能追到同一能力记录；
- 不再依据旧报告、文件名或接口存在就宣布功能完成；
- Stable Claim 必须有关联的当前 Evidence。

### P0-02 统一 UI Observation Snapshot

目标：为 Locator、Verified Action、Recorder、Semantic Executor 和 Replay 提供同一种观察事实。

最小模型应覆盖：

```text
application
process
window identity
page / state hints
regions
elements / candidates
accessibility snapshot refs
OCR / layout / vision refs
screenshot refs
coordinate spaces
display / scale
capturedAt
freshness
provider provenance
warnings / blockers
```

完成标志：

- CLI、HTTP、MCP、Recorder 不再各自发明不兼容的桌面快照；
- 屏幕、窗口、截图、区域和元素坐标能够显式转换；
- 每个语义判断可回溯到本次 Observation 和 Provider；
- 对 PeekabooProvider，OpenDesk Snapshot 引用 provider-native snapshot/receipt，不重新复制一套 macOS producer authority。

### P0-03 正式 Locator Engine

目标：把“我要操作哪个对象”稳定地转换成候选集合和经过验证的 Action Target。

首版至少支持：

```text
structured selector / accessibility
text / role / identifier
region scope
anchor relationship
OCR / Detect UI
layout region
template / image
window-relative geometry
absolute coordinate as final fallback
```

必须具备：

- Candidate Set，而不是只返回第一个结果；
- 多信号评分与 provenance；
- 分数阈值和 margin；
- ambiguity 与 not-found 分离；
- freshness / stale 检测；
- revalidation；
- Locator Bundle 与 fallback；
- selector drift 诊断；
- 高风险动作禁止单一低置信度 OCR 点直接升级为最终目标；
- macOS structured selector / Accessibility 优先消费 Provider-native candidate，不以“重造一套 AX tree”作为 Locator V1 前提。

完成标志：

- 同一个 Locator 在窗口移动、Resize 和轻微内容变化下仍能重新解析；
- 歧义时能够停止或请求消歧；
- 每次目标选择都有可解释评分和 Evidence。

### P0-04 Verified Action Engine

目标：将通用动作统一提升为带 Guard、验证、失败分类和 Evidence 的动作执行服务。

核心输入：

```text
intent
target / locator
payload
risk level
preconditions
expected postconditions
timeout
recovery policy
human gate policy
```

核心输出：

```text
actionId
status
executed
method
target evidence
before observation
after observation
verification checks
failure class
recovery decision
artifacts
```

完成标志：

- JavaScript、HTTP、MCP 与 Semantic Executor 复用同一核心动作结果；
- `executed=true` 与 `verified=true` 明确分离；
- `inconclusive` 不能被静默转成成功；
- 中高风险动作强制执行 Postcondition；
- Provider 的 native effect verification 可以作为证据输入，但不能自动替代 OpenDesk business Postcondition。

### P0-05 Verification 与 Evidence Engine

目标：把动作后验证从脚本约定提升为可复用服务。

首版 Verifier：

```text
window identity
page / state
text presence / absence
accessibility property
pixel / color
image / template
layout / region
clipboard
file existence / content
process state
custom business observable
```

统一状态：

```text
pass
fail
warn
inconclusive
blocked
```

完成标志：

- Verification Result 是正式结构，不只存在于日志文本；
- 支持 before/after、差异结果和 Evidence 引用；
- 缺少必要 Evidence 时 Gate 不得为 pass；
- Evidence 具有 retention、隐私和大小策略。

### P0-06 真实 Semantic Executor

目标：让现有 Scenario / Step / Route / Verification / Recovery 模型驱动真实运行。

执行 Adapter 至少分成：

```text
Mock Adapter
HTML Benchmark Adapter
Desktop Runtime Adapter
```

真实 Step 执行链：

```text
resolve state
→ choose route
→ locate target
→ verified action
→ verification
→ classify failure
→ consume recovery budget
→ checkpoint / stop
```

完成标志：

- 同一 Scenario 可在 Mock、确定性 Benchmark 和真实桌面环境运行；
- Mock Outcome 不再是正式 Runtime 的事实来源；
- Recovery Budget 被真实消费并具有停止上限；
- false success 能被检测并影响最终 Verdict。

### P0-07 完整 Execution Lifecycle

目标：从一次性执行升级为可管理、可恢复的任务生命周期。

必须补充：

```text
millisecond-level timeout
context cancellation
cancel endpoint / tool
pause / resume
checkpoint
retry policy
replay
persistent execution metadata
process restart recovery
resource lease
single-desktop mutual exclusion
artifact retention / cleanup
idempotency key
```

完成标志：

- cancel 会真正阻止后续动作，不只是修改状态；
- 服务重启后可以查询历史任务和恢复允许恢复的任务；
- 同一桌面不会被多个高风险 Workflow 无序争抢；
- timeout、canceled、blocked、failed、inconclusive 语义明确分离。

### P0-08 App Package / App Registry

目标：为 Finder、TextEdit、WeChat、千牛等应用建立标准可安装资产边界。

候选包内容：

```text
manifest
app profiles
supported versions / themes / locales
window discovery
page / state model
regions
locators
actions
skills
workflows
policies
fixtures
tests
compatibility history
```

完成标志：

- App Adapter 可独立加载、启停、测试、升级和淘汰；
- 应用专有语义不会泄漏进通用 Driver / Layout；
- App 版本变化能够标记受影响 Locator 与 Workflow；
- 没有 Manifest、Fixture 和 Evidence 的散落脚本不能标记为 Stable App Support。

### P0-09 Recorder + Replay V1

目标：完成 Agent-first Trace 到无 AI Replay 的第一个完整闭环。

正式实施依据：

- [`../../architecture/desktop-automation/agent-first-recorder.md`](../../architecture/desktop-automation/agent-first-recorder.md)
- [`agent-first-recorder-macos-mvp.md`](agent-first-recorder-macos-mvp.md)

本计划只锁定跨平台依赖：

```text
Observation Snapshot
Locator Engine
Verified Action
Verification / Evidence
Execution identity
App / Scenario contract
```

完成标志：

- Raw Trace、Flow IR 和 Generated JavaScript 分层；
- 生成脚本不以绝对坐标作为唯一 Locator；
- 至少一条任务可以关闭 AI 后回放并验证；
- 窗口移动、Resize、轻微位移和异步延迟测试达到有界门槛；
- 敏感值不会进入 Trace 和生成脚本明文。

### P0-10 风险、安全与 Human Gate

目标：将风险控制放入 Runtime，而不是依赖 Agent 自觉。

至少覆盖：

```text
risk classification
authorization scope
allowlist / denylist
preview / dry run
fresh target requirement
human confirmation
secret handling
privacy redaction
filesystem / network / process boundaries
audit trail
high-risk postcondition
```

高风险动作包括但不限于：

```text
send
submit
delete
move destructive files
purchase
payment
permission change
credential input
external publication
```

完成标志：

- 缺少授权、目标身份、新鲜 Observation 或 Postcondition 时强制阻断；
- Human Gate 结果成为正式 Evidence；
- 任何入口都不能绕过同一风险策略；
- 日志、Trace、截图和错误不泄露敏感信息。

## 六、P1：形成可复用自动化平台

### P1-11 Skill Framework

Skill 必须具有：

```text
skillId / version
typed input / output
preconditions
idempotency
risk
postconditions
failure contract
evidence contract
compatibility
```

### P1-12 Workflow Engine

首版支持：

```text
sequence
condition
branch
loop with bound
wait / event
subworkflow
timeout
checkpoint
compensation
human step
safe stop
```

### P1-13 Supervisor / Event Engine

支持：

```text
window and process events
file events
schedule
polling with backoff
deduplication
lease / heartbeat
circuit breaker
failure ceiling
resume policy
```

### P1-14 Provider Registry

P0-00 已先建立 Desktop Execution Provider 最小边界；本项负责把 Provider 治理扩展为统一 Registry。

统一管理：

```text
Desktop execution: Peekaboo / Cua / Native
Accessibility
DOM / DevTools
OCR
Detect UI
Layout
Vision
Template
Model service
```

每个 Provider 需要声明平台、语言、权限、健康状态、超时、成本、fallback、版本/capability 和质量指标。

### P1-15 Capability Benchmark

把 L0—L12 映射为：

```text
scenario
fixture
environment
metric
threshold
failure taxonomy
gate
evidence bundle
```

一次 Smoke 成功不能自动升级为更高级别的通用 Claim。

### P1-16 故障注入与漂移测试

覆盖：

```text
window move / resize
DPI / scale / multi-display
theme / locale / font
text change
occlusion
dialog / focus shift
scroll / virtual list
async load
network / provider failure
permission loss
process restart
stale target
```

### P1-17 Runtime Builder 与入口一致性

CLI、HTTP、MCP、测试和未来 Scheduler 应共享：

```text
Capability Registry
Runtime Builder
Provider Registry
Action Engine
Error Model
Evidence Model
```

### P1-18 API 契约自动生成

从统一 Capability / API Manifest 派生：

```text
JavaScript facade
TypeScript declarations
runtime-api.ai.json
HTTP schema
MCP tool schema
user documentation index
```

### P1-19 调试器与 Timeline

至少显示：

```text
step
before / after
candidate set
score explanation
selected target
action
verification
failure
recovery
artifacts
```

### P1-20 结构化 UI 数据提取

将列表、表格、卡片和文本转换为带 Schema、provenance、置信度和验证结果的 JSON / CSV，而不是只返回 OCR 大文本。

## 七、P2：产品化和规模化能力

- P2-21 App / Skill / Workflow 安装、版本、依赖、签名、启停、升级和回滚。
- P2-22 脚本与插件沙箱：文件、网络、剪贴板、进程、窗口、凭据和模型权限 Scope。
- P2-23 自动化资产库：Recorder 产物、Locator、Skill、Workflow、Fixture 的审查和复用。
- P2-24 跨平台 Driver Contract：macOS、Windows、Linux 的坐标、权限、Accessibility 和输入差异。
- P2-25 远程运行与控制面：任务查看、日志、暂停、恢复、人工审批和运行节点管理。
- P2-26 企业治理：认证、RBAC、审计、Evidence 加密、数据保留和 Secrets 管理。
- P2-27 长期质量统计：成功率、假成功率、目标准确率、恢复率、人工接管率、耗时和 Provider 成本。
- P2-28 应用兼容性维护：应用版本、主题、语言或布局变化后的影响分析、失效标记和修复验证。

P2 不应在 P0 可靠性闭环尚未建立时大规模提前建设。

## 八、Recorder 与 apps 目录边界

Recorder 建议保持两层：

```text
pkg/recorder/
负责 Session、Trace、Observation、Distill、Compiler、Replay、Verify、Privacy 和 Store

apps/recorder/
负责产品入口、录制状态、Timeline、步骤编辑、Dry Run、回放报告和导出
```

`apps/recorder/` 不能成为第二套 Recorder Runtime，也不能把核心逻辑埋在 UI 中。

未来应用包候选结构：

```text
apps/
├── recorder/
│   ├── README.md
│   ├── manifest.json
│   ├── ui/
│   ├── workflows/
│   ├── fixtures/
│   └── tests/
│
├── finder/
│   ├── README.md
│   ├── manifest.json
│   ├── profiles/
│   ├── states/
│   ├── regions/
│   ├── locators/
│   ├── skills/
│   ├── workflows/
│   ├── policies/
│   ├── fixtures/
│   └── tests/
│
└── wechat/
    └── 同类结构
```

但不要为了匹配目录图提前创建大量空目录。应在首个真实 App Package 实施时，以最小可运行结构建立并通过测试后再扩展。

代码职责边界：

```text
automation/
底层桌面 Driver 与原生能力；在 Provider 化后主要承担 NativeProvider / compatibility，不再默认等同 macOS 主后端

pkg/
跨应用可复用执行内核

apps/
产品入口和具体应用 Adapter / Skill / Workflow

tests/
跨应用 Benchmark、Fixture 与回归测试

docs/
框架、架构、实现、质量和计划事实
```

## 九、正式开发顺序与依赖

推荐顺序：

```text
1. 能力事实注册表
2. DesktopProvider Boundary + PeekabooProvider / NativeProvider Spike
3. Observation Snapshot
4. Coordinate Space 与 Locator Engine
5. Verification / Evidence Engine
6. Verified Action Engine
7. Semantic Executor 接入真实 Runtime
8. Cancel / Checkpoint / Replay / Persistence
9. App Package / Registry 最小实现
10. Recorder Trace / Flow / Compiler / Replay
11. Skill Framework
12. Workflow / Supervisor
13. Benchmark、漂移测试与长期指标
14. 普通真实应用
15. 复杂应用
16. 自主桌面 Agent
```

关键依赖：

```text
DesktopProvider
→ Observation
→ Locator
→ Verified Action
→ Semantic Executor / Recorder Replay

Execution Lifecycle
→ 长任务 Workflow / Supervisor

App Package
→ 可维护真实应用能力

Safety / Evidence
→ 横向贯穿所有阶段
```

允许并行的工作：

- P0-00 Provider Spike、P0-01 能力事实注册表与 P0-02 Observation 契约；
- P0-07 Execution Lifecycle 的存储/取消设计与 P0-03 Locator；
- Recorder 数据模型测试与 Verified Action 契约；
- HTML Benchmark 与核心 Runtime 实现。

不允许的跳跃：

- 未完成 Provider Benchmark 就大规模扩展 macOS-only primitive parity；
- 未建立 Postcondition 就进入高风险自动发送；
- 未有真实 Semantic Executor 就直接宣称自主 Agent 可用；
- 未有 Fixture 和 Evidence 就批量开发多个 App Adapter；
- 未解决持久任务生命周期就依赖 HTTP/MCP 做长期无人值守运行；
- 未完成基础定位漂移测试就把 AI Healing 当成可靠性替代品。

## 十、第一条端到端 Golden Path

建议测试顺序：

```text
确定性动态 HTML Benchmark
→ Calculator / TextEdit 等简单系统应用
→ Finder read-only / navigation
→ 普通桌面应用只读和低风险编辑
→ WeChat read-only
→ WeChat draft
→ 独立 Human Gate 后的受控 send
```

每一级都重复：

```text
Observe
→ Locate
→ Act
→ Verify
→ Classify Failure
→ Recover / Stop
→ Evidence
```

HTML Benchmark 用于快速制造：

```text
动态位置
重复文本
遮挡
滚动
异步状态
弹窗
颜色反馈
列表更新
机器可验证结果
```

真实应用用于证明能力不是只在测试页面中成立。

## 十一、P0 最低验收标准

P0 阶段结束前必须同时满足：

1. 同一核心动作通过 JavaScript、HTTP 和 MCP 执行时，能够映射到一致的 Action / Verification / Evidence 契约。
2. 中高风险动作具有 before、target provenance、precondition、after、postcondition 和 Evidence。
3. `ambiguous`、`stale`、`blocked`、`inconclusive` 不能被转成假成功。
4. cancel 会真正终止后续 Runtime 和桌面动作。
5. Recorder 生成脚本不使用绝对坐标作为唯一 Locator。
6. Recorder Replay 至少通过窗口移动、窗口 Resize、目标轻微位移和异步延迟的有界测试。
7. 首个 App Package 具有 Manifest、状态模型、Locator、Policy、Fixture 和测试。
8. Mock、Contract、Integration、HTML Benchmark 和真机 Smoke 分别标记，不能互相冒充。
9. Stable Claim 能定位到当前代码、测试版本、运行环境和 Evidence。
10. 高风险动作缺少授权、目标身份或 Postcondition 时必须停止或进入 Human Gate。
11. Provider 缺失、权限缺失和环境漂移返回结构化 blocker，不进行无限重试。
12. 所有运行工件遵守隐私、Secrets、retention 和清理策略。
13. macOS 同一 Golden Path 至少通过 PeekabooProvider 与 NativeProvider 的对照测试，并明确默认路由、fallback 条件、false-success 差异和 Evidence 完整度。

## 十二、核心质量指标

后续 Benchmark 至少统计：

```text
target resolution accuracy
ambiguity detection recall
false success rate
verification coverage
verified action success rate
recovery success rate
replay success rate
manual intervention rate
stale target block rate
high-risk policy bypass count
p50 / p95 step latency
recorder observation overhead
artifact completeness
provider cost and failure rate
```

优先级最高的指标不是“API 调用成功率”，而是：

```text
假成功率
目标误操作率
Postcondition 覆盖率
失败可诊断率
回放成功率
```

## 十三、文档完善策略

当前不要一次性创建大量新 Framework 文件。

优先原则：

- Recorder 长期决策继续维护在 `architecture/desktop-automation/agent-first-recorder.md`；
- Recorder 当前实施继续维护在 `plans/desktop-automation/agent-first-recorder-macos-mvp.md`；
- Runtime Extension 继续维护在 `plans/runtime/runtime-extension-roadmap.md`；
- Action / Target 与 App Adapter 优先扩展现有 Architecture 契约；
- 安全 Gate 优先扩展 `quality/gates-and-evidence.md`；
- 只有 Verified Action、Skill / Workflow / Supervisor 等方法已经稳定并跨多个场景验证后，才评估是否新增长期 Framework 文件。

候选未来 Architecture 文档：

```text
docs/architecture/desktop-automation/ui-observation-model.md
docs/architecture/desktop-automation/locator-engine.md
docs/architecture/desktop-automation/app-package-manifest.md
docs/architecture/execution/verified-action-engine.md
docs/architecture/execution/durable-execution-lifecycle.md
docs/architecture/execution/checkpoint-and-replay.md
```

这些文件应在对应设计真正收敛时创建，不应仅因为本计划列出名字就提前生成空壳。

## 十四、计划维护规则

每个 P0/P1/P2 项必须维护：

```text
status
owner
scope
source paths
dependencies
tests
evidence
blocking risks
next gate
completion decision
```

状态建议：

```text
proposed
ready
in-progress
blocked
verified
partially-verified
deprecated
closed
```

升级为 `verified` 必须附当前 Evidence；只有接口、Mock、文档或历史报告时不得升级。

当某项完成后：

1. 更新源码和测试；
2. 保存运行 Evidence；
3. 更新 Architecture / Implementation / Quality Source of Truth；
4. 将本计划项标记为 verified 或 partial；
5. 删除已经被正式文档吸收的重复说明；
6. 记录剩余限制和下一 Gate。

## 十五、最终目标

本计划完成后，OpenDesk 应从：

```text
拥有较多桌面自动化接口和执行入口的 Runtime
```

升级为：

```text
能够统一观察桌面
→ 可靠定位目标
→ 执行可验证动作
→ 诊断和恢复失败
→ 录制并生成可维护自动化资产
→ 持久运行 Skill / Workflow
→ 在明确安全边界内供 Agent 调度
```

最终判断必须以当前源码、可重复测试和真实运行 Evidence 为准，而不是以本计划的完整程度为准。
