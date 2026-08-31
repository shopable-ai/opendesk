# Clawdesk 桌面自动化下一阶段正式开发计划

- 状态：Active Plan
- 审计日期：2026-08-31
- 审计基线分支：`master`
- 审计基线 HEAD：`1016dca9e4052b969143a045b500d9ac5e84a587`
- 适用范围：Clawdesk 通用桌面自动化能力、测试基座、真实应用 Adapter、Workflow 与 Agent 的后续多个 PR / Phase
- Canonical Framework：
  - `docs/frameworks/automation-framework.md`
  - `docs/frameworks/capability-development.md`
  - `docs/frameworks/app-development-framework.md`

> 本文件是实施计划，不是“当前已经完成”的能力声明。每个后续 PR 开始前都必须重新读取 `master` 最新 HEAD，并以当时源码、测试和当前运行 Evidence 重新校准。

## 1. 本轮结论

### 1.1 最高优先级

下一阶段最高优先级应当是：

```text
P0 真实 Runtime 契约校准
→ P1 Verified Desktop Step + Evidence Spine
→ P2-P5 受控 HTML Benchmark 中从固定控件发展到动态 UI
→ P6 简单系统应用
→ P7-P9 普通应用、多窗口与跨应用
→ P10 微信 / 千牛等复杂应用
→ P11-P12 Prompt Workflow、Supervisor 与 Autonomous Agent
```

其中：

- `P0` 是短周期阻断项，先修复当前 MCP、Vision、Layout、Screenshot 与 Action 之间的真实契约断层；
- `P1` 是下一阶段真正的架构主干；
- `P2-P5` 必须由受控 HTML Benchmark 提供机器 Oracle；
- 微信、千牛不能继续承担底层能力是否可靠的首要证明任务；
- Agent、Vision Model 和 Prompt 只能作为上层受约束能力或逐级兜底，不能替代未完成的底层可靠性。

### 1.2 对当前成熟度的判断

当前仓库存在较宽的 API 和源码能力面：

```text
原始输入
窗口
截图
OCR
Layout
MCP tools
execution logs
semantic result schema
```

但当前可验证成熟度明显低于 API 表面宽度：

```text
“接口已经存在”
不等于
“真实 Runtime 已连通”
不等于
“动作已经被观察”
不等于
“状态已经改变”
不等于
“业务目标已经完成”
```

因此当前项目不应按“已有 OCR、Layout、tm_find_target、tm_act_on_target，所以已经进入复杂应用阶段”判断成熟度。

更准确的结论是：

> Clawdesk 已拥有多个后期能力所需的部件和合同雏形，但统一可信执行主干仍处于 Foundation / pre-L1 阶段。

### 1.3 对原 L0-L12 的调整

原有从 L0 到 L12 的垂直路径总体方向正确，但需要做四项修正：

1. 在 L0 前增加 `P0 Contract Conformance` 与 `P1 Verified Desktop Step`；
2. HTML Benchmark 不应只是一个孤立 Level，而应成为 L1-L5 共用的长期测试基座；
3. 复杂应用需要拆成 `read-only → navigation → draft → manually-gated side effect → bounded workflow`，不能一步升级为“支持微信/千牛”；
4. 每一个 Complexity Level 必须同时满足 Evidence Grade，不能只按代码或 API 数量晋级。

## 2. 审计基线与事实优先级

本计划按以下顺序读取和判断事实：

```text
当前源码
→ 当前可运行测试
→ 当前 Runtime Evidence
→ Canonical Framework / Architecture / Quality 文档
→ Active Plan
→ Research / 历史报告 / Archive
```

本轮重点审计：

```text
automation/
pkg/execution/
pkg/semanticexec/
pkg/mcpserver/
pkg/runtime/
examples/
docs/architecture/desktop-automation/
docs/implementation/runtime/
docs/quality/
docs/plans/
docs/scenarios/
artifacts/
```

当前 GitHub 没有与审计基线 HEAD 对应的 CI 状态，也没有本轮新生成的真机 smoke。因此本文中：

- “源码已实现”只代表当前源码存在相应执行路径；
- “历史真机验证”不升级为当前 HEAD 的运行证明；
- 没有当前 Evidence 的能力不得标记为 current pass / production ready。

## 3. 当前真实能力审计

### 3.1 能力矩阵

| 能力域 | 当前源码事实 | 当前证据等级 | 可以安全声明 | 不能声明 |
| --- | --- | --- | --- | --- |
| Mouse / Keyboard / Scroll | `automation/` 中存在真实 `robotgo` 调用 | Source-backed；当前 HEAD 无新真机重放 | 原始输入命令可以被派发到底层驱动 | 点击命中目标、界面变化、业务完成 |
| Window | macOS 与 Windows 有真实平台实现；其他平台存在 stub | Source-backed；仅有旧 macOS bounded smoke | 可进行窗口枚举、匹配、聚焦等平台调用 | 聚焦后前台状态一定正确；跨平台一致可靠 |
| Screenshot | `Page.Screenshot` 有真实截图、尺寸、backend 与部分输出校验 | Source-backed；旧 smoke 曾通过截图 | 已具备较好的 Acquisition 基础 | 截图坐标一定与所有 target 坐标空间自动对齐 |
| Display Geometry | 已有 logical / pixel / scale 等显示信息 | Source-backed | 可以作为后续坐标空间模型输入 | 已存在完整 screen/window/client/screenshot 转换系统 |
| Clipboard | Copy 已包含 bounded retry 和 read-back verification | Source-backed | 剪贴板是当前少数已有“写入后读回验证”模式的 primitive | 所有输入动作都达到相同验证水平 |
| OCR | Paddle、Local Tesseract 与可配置 HTTP provider 路径存在 | Source-backed；依赖 provider / 本地环境 | OCR provider 抽象和真实调用路径存在 | 当前所有环境可用；OCR 结果就是 UI 元素身份 |
| DetectUI | 当前主要是 OCR line filtering、role guessing 与文本框中心点 | Source-backed | 可生成基于 OCR 文本的候选 | 已实现通用视觉 UI object detector |
| Layout | 存在真实图像分区、separator、region 与 annotation 实现 | Source-backed；有专项历史资料 | 可生成结构区域和布局候选 | Region 01 等结构区域已经具备业务语义 |
| MCP | server、tools schema、window guard、preview、stale / ambiguous 字段已存在 | T1 contract 为主；旧 bounded smoke | MCP 工具面和基础 transport 存在 | `tm_click` / `tm_act_on_target` 返回 ok 即真实成功 |
| `pkg/execution` | 有 run lifecycle、日志和 `.runtime/runs/<id>` 基础工件 | Source-backed | 已有脚本级运行记录器 | 已有 Step-level before/after/target/verification/recovery Evidence |
| `pkg/semanticexec` | 有状态、Failure、Route、Verification、false-success 语义和 Mock runner | T1 contract / mock | 可复用为统一结果模型基础 | 已接管真实 desktop runtime |
| Accessibility / UI Automation | 当前未找到 AXUIElement / UI Automation 等实现 | No implementation evidence | 只能作为后续 Route 规划 | 当前已经支持 Accessibility Tree 定位 |
| Candidate Fusion / Target Lease | 文档有方向，真实统一 Runtime 未实现 | Contract / concept | 可作为 P3-P5 正式建设对象 | 当前已经做多信号实体融合和租约失效检查 |
| App Adapter / Skill / Workflow / Supervisor | Canonical 文档和 WeChat 场景材料较丰富 | Document / historical input | 已有应用开发方法和经验输入 | 已有可复用生产级 App Adapter Runtime |
| WeChat / QianNiu | 有历史脚本、场景、Failure 与计划材料 | Historical / not revalidated | 可用于提炼模式、Fixture 和 Failure Case | 当前版本已经可靠支持真实业务自动化 |

### 3.2 当前最重要的真实契约断层

以下问题应进入 `P0`，不能继续由 fake Runtime 或 API 名称掩盖：

1. Vision `DetectUI` 使用 `targetText`，MCP 暴露和传入 `target_text`；
2. Vision / Layout 返回具体 Go 类型，例如 `[]map[string]interface{}`、`[]VisionLine`、`map[string]int`，MCP 多处只按 `[]any`、`map[string]any` 读取；
3. Layout 输出 `bbox / center`，部分 MCP 点击路径读取 `bounds / clickPoint`；
4. Screenshot 底层与 MCP schema 对 `activeWindow / window / desktop / screen` 的枚举语义不一致；
5. `tm_type` 等动作没有证明目标输入控件已经获得焦点；
6. stale revalidation 在某些调用形态下可能重新处理同一静态图片，而不是重新捕获当前桌面；
7. 原始动作无异常后直接返回 `ok:true`，没有区分 command receipt 与 postcondition；
8. MCP 单元测试主要使用 `fakeRuntime`，没有覆盖 MCP 与真实 `AutomationRuntime` 返回类型的组合契约。

### 3.3 当前最底层可靠性缺口

最底层缺口不是“再增加一种识别算法”，而是缺少一个统一的可信执行语义：

```text
Before Observation
→ Target Resolution
→ Preconditions / Risk Gate
→ Geometry Projection
→ Driver Dispatch
→ After Observation
→ Postcondition Verification
→ Failure Classification
→ Bounded Recovery
→ Final Verdict
→ Evidence Manifest
```

当前 `mouse.click()` 或 `tm_click` 无异常，最多可以证明：

```text
调用参数被接受
或
底层函数没有返回可见错误
```

它不能自动证明：

```text
输入后端确实发出了事件
目标窗口处于前台
坐标落在目标上
控件接收了交互
UI / State 发生了预期变化
业务目标已经完成
```

无法证明的层级必须是 `unknown`，而不是 `success`。

## 4. 下一阶段 Canonical 主干：Verified Desktop Step

### 4.1 定位

`Verified Desktop Step` 是 Driver 与 Skill 之间的统一执行层，也是 MCP、JavaScript、Workflow 和 Agent 的共同可信入口。

```text
Driver primitives
→ Verified Desktop Step
→ App-specific Verified Action
→ Skill
→ Workflow
→ Supervisor / Agent
```

它不是另一个脚本封装，也不是简单地给 `click()` 增加截图。

### 4.2 统一执行闭环

```text
1. Discover / Bind Surface
2. Observe Before
3. Understand Current State
4. Collect Target Signals
5. Normalize / Cluster / Resolve Target
6. Check Ambiguity, Freshness, Visibility, Enabled State and Risk
7. Resolve Geometry and Coordinate Transform
8. Dispatch Driver Action
9. Record Action Receipt
10. Observe After
11. Verify UI / State / Business Postconditions
12. Classify Failure or Unknown
13. Recover within Budgets when allowed
14. Produce Final Verdict and Evidence
```

### 4.3 最小数据模型

统一结果模型应优先复用并演进 `pkg/semanticexec`，不要再创建第二套平行 status / failure / verification taxonomy。

建议最小对象：

```text
StepRequest
SurfaceSnapshot
ObservationSnapshot
TargetQuery
TargetSignal
CandidateEntity
TargetLease
GeometryProjection
ActionRequest
ActionReceipt
VerificationResult
FailureRecord
RecoveryAttempt
StepVerdict
StepEvidenceManifest
```

建议职责边界：

- `automation/`：平台 Driver、Screenshot、Window、OCR、Layout 等 concrete primitive；
- `pkg/semanticexec/`：Canonical Step contract、状态派生、Verifier 语义、Failure、Budget 与 live/mock executor；
- `pkg/execution/`：Execution 生命周期、Step event 汇聚、Artifact sink、summary；
- `pkg/mcpserver/`：Transport 与 schema adapter，不自行定义另一套成功语义；
- JavaScript / HTTP / MCP：调用统一 Step runtime，原始 primitive 仍可保留为明确的 low-level API。

### 4.4 命令回执与成功必须分层

每个动作至少区分：

```text
request_validated
backend_dispatched
input_emitted
interaction_observed
state_changed
business_goal_verified
```

每一层使用：

```text
true | false | unknown
```

示例：

```json
{
  "requestValidated": true,
  "backendDispatched": true,
  "inputEmitted": "unknown",
  "interactionObserved": false,
  "stateChanged": false,
  "businessGoalVerified": false,
  "verdict": "false_success_suspected"
}
```

规则：

- Driver receipt 只能证明 Driver 层；
- required postcondition 全部通过，Step 才能是 `succeeded`；
- 明确观察到相反结果，应为 `failed` 或 `false_success_suspected`；
- 缺少可判定观察，应为 `unknown` / `degraded`，不能补写成功；
- 被权限、歧义、风险或人工 Gate 拦截，应为 `blocked`；
- 已产生部分进展但业务未闭环时可为 `partial`。

### 4.5 原始 API 的兼容策略

`mouse.click()`、`keyboard.type()`、`tm_click` 等低层 API 可以继续存在，但返回语义必须清楚：

```text
accepted / dispatched
!=
verified success
```

建议：

- 保留 low-level receipt；
- 新增或演进统一 `execute_step` / `act_on_target` 可信路径；
- 用户或 Agent 需要业务成功时，默认走 Verified Step；
- 兼容 API 不允许继续用 `ok:true` 暗示 postcondition 已通过。

## 5. Evidence Spine

### 5.1 Step Evidence

每个需要验证的桌面步骤至少能形成：

```text
request
before observation
target signals / candidates
selected candidate entity
target lease
geometry and coordinate transforms
action request
action receipt
after observation
verification results
failure classification
recovery attempts
final verdict
```

建议运行目录：

```text
.runtime/runs/<executionId>/
├── run.json
├── environment.json
├── events.ndjson
├── summary.json
├── agent_summary.json
├── script_snapshot.<ext>
├── stdout.log
├── stderr.log
├── manifest.json
└── steps/
    └── <sequence>-<stepId>/
        ├── request.json
        ├── before/
        │   ├── observation.json
        │   └── screenshot.png        # 按场景需要，不强制所有 Step
        ├── target/
        │   ├── signals.json
        │   ├── candidates.json
        │   ├── selected.json
        │   └── lease.json
        ├── geometry.json
        ├── action/
        │   ├── request.json
        │   └── receipt.json
        ├── after/
        │   ├── observation.json
        │   └── screenshot.png
        ├── verification.json
        ├── failure.json              # 仅失败/未知时
        ├── recovery.ndjson
        └── verdict.json
```

现有通用工件必须保留兼容，不因增加 Step Evidence 破坏脚本执行记录。

### 5.2 四类 Evidence

- **Step Evidence**：一个动作从请求到 Verdict 的完整事实；
- **Run Evidence**：环境、预算、Step 索引、总体结果与依赖版本；
- **Benchmark Evidence**：Fixture/Scenario 版本、Seed、Oracle 状态、重复次数与指标；
- **Regression Evidence**：版本间比较、失败分布、Golden provenance 与回放结果。

### 5.3 生命周期边界

```text
.runtime/                         当前运行期输出，可删除
artifacts/fixtures/              经过审查的稳定 Fixture / Golden candidate
artifacts/reports/               值得长期保留的有界报告
docs/quality/                    Gate、Evidence、Failure 与测试规范
docs/plans/                      未完成计划
```

禁止：

- 把全部运行截图长期提交到 Git；
- 把真实聊天内容、客户数据或敏感窗口未经脱敏写入 Artifact；
- 用一个历史报告代替当前版本 Evidence；
- 缺少 manifest / provenance 时把样本冻结为 Golden。

## 6. Failure、Recovery 与 Budget

### 6.1 领域 Failure Code

领域 code 应映射到 `docs/quality/failure-taxonomy.md` 的 F0-F10，而不是替代全局分类。

| Domain code | 主要全局类 | 默认处理 |
| --- | --- | --- |
| `WindowNotFound` | F0 / F1 | 重新发现；超出预算则 stop |
| `WindowNotFocused` | F0 / F5 | 低风险场景可 bounded refocus；动作前重新观察 |
| `TargetNotFound` | F2 / F4 | 缩小/扩大区域、滚动或增加信号；不能猜坐标 |
| `TargetAmbiguous` | F3 / F4 | 收集更多信号或 human gate；禁止选择“差不多”的第一项 |
| `TargetStale` | F1 / F4 | 重新捕获 live surface、重新定位、重新签发 lease |
| `CoordinateInvalid` | F4 | 重新计算 transform；禁止 clamp 后盲点 |
| `Occluded` | F2 / F4 / F5 | 仅在已知低风险 overlay 上解除遮挡；否则 stop |
| `InputNotFocused` | F5 / F6 | 重新聚焦并验证 focus/readback |
| `ActionNotObserved` | F5 / F6 | 判断动作幂等性；非幂等动作禁止盲重试 |
| `StateUnchanged` | F6 | 重新验证目标/焦点；安全且幂等时最多 bounded retry |
| `VerificationUnknown` | F6 / F7 | 切换 verifier 或人工确认；不得标 success |
| `SemanticMismatch` | F3 / F6 | stop；必要时恢复到安全状态 |
| `PermissionDenied` | F0 | external blocker / human remediation；禁止无限 retry |
| `RecoveryExhausted` | F8 | 最终 failed / blocked / unknown，并保存完整 trace |

### 6.2 恢复不是统一 retry

恢复动作包括：

```text
refocus window
re-observe live state
re-locate target
collect an additional signal
recompute geometry
scroll within a bounded region
wait for a declared state condition
remove a known low-risk overlay
use an approved alternate input method
use an approved alternate locator
stop and request human confirmation
```

### 6.3 四类预算

每个 Step / Workflow 至少支持：

```text
Retry Budget
Time Budget
Cost Budget
Risk Budget
```

并增加幂等性分类：

```text
read_only
idempotent
conditionally_idempotent
non_idempotent
destructive
```

规则：

- `read_only / idempotent` 才可在失败分类明确时自动重试；
- `non_idempotent` 动作发生 `VerificationUnknown` 时，必须先检查业务状态，不能再次点击；
- send / submit / purchase / delete 等高风险动作默认只允许一次执行 lease；
- 风险预算耗尽优先 stop，不以提高成功率为理由继续猜测。

## 7. UI Identity、Spatial Model 与 Coordinate Space

### 7.1 正式区分五类对象

```text
Element     语义身份和可交互对象
Region      页面/窗口中的结构范围
Anchor      可用于稳定定位其他对象的参考对象
Geometry    某对象在指定坐标空间内的形状与边界
Coordinate  Geometry 投影出的一个执行点
```

核心规则：

```text
Coordinate != Element Identity
```

一个坐标只在某个 Surface、State、Time、Transform 与 Target Lease 内有效。

### 7.2 需要显式支持的坐标空间

```text
screen_logical
screen_physical
display_local
window_frame
window_client
surface_capture
screenshot_pixel
region_local
element_local
```

每个 Geometry 必须携带：

```text
coordinateSpace
surfaceId / windowId
displayId
scale
capturedAt
transform provenance
```

禁止：

- 默认把 screenshot pixel 当作 screen physical；
- 在窗口 resize / move / scroll 后继续复用旧坐标；
- 多显示器、负坐标或不同 DPI 下只做全局比例换算；
- 找不到 target 时退化为历史坐标但仍声明成功。

### 7.3 Anchor + Relative Geometry

对聊天、列表、编辑器等动态应用，应支持：

```text
Window
├── Navigation Region
├── List Region
└── Content Region
    ├── Header Anchor
    ├── Main Content Region
    └── Composer Region
```

App Adapter 可以声明：

```text
anchor identity
relative region rule
minimum/maximum bounds
state-specific transform
validation signals
```

但通用框架只负责 Anchor / Region / Geometry 的机制，不在核心包写死“会话列表”“发送按钮”等应用语义。

## 8. Target Resolution 与多信号融合

### 8.1 路由优先顺序

默认遵循：

```text
App-native structured state / API
→ Accessibility Tree / UI Automation / DOM / Window Hierarchy
→ Stable Anchor / Relative Geometry
→ Template / Color / Shape / Layout
→ OCR
→ Screenshot Vision Model
→ Agent Semantic Reasoning
```

这不是要求每次运行全部方法，而是：

> 先使用确定性、低成本、可解释的方法；只有结果不足、冲突或歧义时才升级信号。

### 8.2 统一信号管线

```text
Collect Needed Signals
→ Normalize
→ Candidate Clustering
→ Deduplication
→ Signal Fusion
→ Semantic Score
→ Geometry / Freshness / Visibility Score
→ Risk Score
→ Ambiguity Gate
→ Target Lease
```

Normalized Target Signal 至少包含：

```text
source
sourceObjectId
surfaceId
regionId
text / role / attributes
geometry
coordinateSpace
confidence
capturedAt
visibility / enabled state
provenance
```

同一个按钮被 OCR、Accessibility、Layout 或 Template 同时发现时，应融合为一个 `CandidateEntity` 的多条 observation，而不是四个互相竞争的候选。

### 8.3 Ambiguity Gate

不能只按最高 score 自动选择。

至少考虑：

- top candidates 的分数差；
- 是否在同一 Region；
- text / role / state 是否一致；
- geometry 是否重叠或实际上是同一实体；
- 候选数量与分布；
- 动作风险；
- 是否存在能够消歧的新信号。

高风险动作发生歧义时默认 `blocked`。

### 8.4 Target Lease

Target Lease 建议包含：

```text
leaseId
surfaceId
windowId
observationId
candidateEntityId
geometry
coordinateSpace
issuedAt
expiresAt
singleUse
invalidators
```

典型 invalidator：

```text
window focus changed
window bounds changed
display / scale changed
page state changed
scroll position changed
surface hash changed
time expired
```

所谓 revalidation 必须读取当前 live state；重新处理同一静态 imagePath 不能自动刷新 lease。

## 9. Clawdesk Desktop Automation Benchmark / Playground

### 9.1 角色

HTML Benchmark 是 P2-P5 的共同测试底座，不是一个普通 example，也不代表真实桌面应用已经通过。

它解决：

- 目标和状态可控；
- 每次动作都有机器 Oracle；
- 可以稳定复现 false success、歧义、焦点、动态布局和恢复；
- 同一场景可比较不同 Locator / Driver / Verifier；
- 不需要用微信账号和真实消息承担底层调试成本。

建议目录：

```text
benchmarks/desktop-automation/
├── playground/
├── scenarios/
├── oracle/
├── runner/
└── README.md

artifacts/fixtures/desktop-automation/
└── <frozen fixtures after review>
```

### 9.2 控件矩阵

基础控件：

```text
button
input
textarea
checkbox
radio
select
slider
toggle
```

复合控件：

```text
tabs
dropdown
menu
dialog
tooltip
table
list
scroll area
drag source / drag target
```

每个控件必须产生可机器读取的状态：

```text
clickCount
selectedValue
checkedState
activeTab
inputText
sliderValue
dialogState
focusedElement
dragResult
eventLog
```

### 9.3 主动制造的不确定性

```text
dynamic position
duplicate / similar labels
partial occlusion
scroll required
disabled element
delayed appearance
async state update
animation
window resize
browser zoom / viewport change
OS DPI / scale variation
focus loss
unexpected overlay
virtualized list
stale target
```

### 9.4 Oracle 与防作弊边界

建议提供只用于测试器的：

```text
reset
seed
current state
event log
expected transition
```

例如：

```text
POST /__clawdesk__/reset
GET  /__clawdesk__/state
GET  /__clawdesk__/events
```

规则：

- Oracle 可以判断结果，但不能偷偷替代被测 Locator / Action；
- 测 OCR route 时，不允许读取 DOM bbox 作为动作目标；
- 测 DOM route 时，可以使用 DOM 结构，但动作仍必须经过相同 Verified Step、Driver receipt 与 postcondition；
- 所有随机布局必须有 Seed；
- 每个 Scenario 明确 allowed routes、forbidden shortcuts 和 expected state。

### 9.5 核心指标

```text
Business Success Rate
Wrong-Target Rate
False-Success Rate
Unknown Rate
Target Resolution Precision
Ambiguity Block Accuracy
Postcondition Verification Accuracy
Recovery Success Rate
Evidence Completeness
Mean Attempts / Latency / Cost
```

初始保守 Gate：

- PR bounded smoke：每个确定性必选场景至少重复 20 次；
- Nightly / release candidate：每个确定性场景至少 100 次；
- 确定性场景目标成功率暂定 `>= 99%`；
- 动态扰动场景目标成功率暂定 `>= 95%`；
- Wrong-Target 与未被识别的 False-Success 必须为 `0`；
- 必选 Evidence 字段完整率必须为 `100%`；
- 所有失败必须有 primary Failure Class。

以上阈值是初始 Gate，不是永久真理。只有新的 Benchmark Evidence 或 ADR 可以调整。

## 10. 双轴成熟度模型

### 10.1 Complexity Level

| Level | 复杂度 | 说明 |
| --- | --- | --- |
| L0 | Driver primitive | 原始 mouse / keyboard / screenshot / window / clipboard |
| L1 | Fixed single control | 单一已知控件、单一状态变化 |
| L2 | Multiple candidate controls | 相似控件、歧义、唯一目标选择 |
| L3 | Composite control / page state | 表单、Tabs、Dialog、Menu、焦点与多状态 |
| L4 | Dynamic controlled UI | scroll、delay、occlusion、resize、DPI、animation、stale |
| L5 | Simple system app | Calculator、Text Editor、File Manager、Settings |
| L6 | Ordinary real app | 单应用、低风险、有限页面与稳定 Fixture |
| L7 | Dynamic real UI | 虚拟列表、异步数据、复杂布局、状态漂移 |
| L8 | Multi-page / multi-window | 多窗口、弹窗、页面跳转、后台/前台切换 |
| L9 | Cross-app workflow | 两个及以上应用之间传递可验证状态 |
| L10 | Complex business app | 微信、千牛等应用的 read/draft/guarded action |
| L11 | Constrained Agent / Supervisor | 只能选择已验证 Skill / Workflow 的 Agent |
| L12 | Autonomous Desktop Agent | 长任务、自主规划、预算恢复、人工升级与持续监督 |

HTML Benchmark 横跨 L1-L4，不单独占一个 Level。

### 10.2 Evidence Grade

| Grade | 证据 | 含义 |
| --- | --- | --- |
| E0 | Source / document only | 有源码、接口或设计，但没有当前运行证明 |
| E1 | Unit / contract | 纯逻辑、schema、状态与 adapter 单元测试 |
| E2 | Runtime integration | 真实组件组合，但 OS side effect 可由边界替身控制 |
| E3 | Controlled desktop | 受控 HTML / native Fixture 上的真实桌面输入与 Oracle |
| E4 | Bounded real app | 明确环境与风险范围内的真实应用场景 |
| E5 | Repeated regression | 多版本/多环境重复、指标稳定、Evidence 可回放 |

规则：

- 不能因为源码覆盖到 L4 名称，就宣布 L4 已完成；
- 一个 Level 只有达到该阶段要求的 Evidence Grade 才能晋级；
- 历史 E3/E4 不自动成为当前 HEAD 的 E3/E4；
- 复杂应用至少需要通用核心达到 L4/E3，且相关系统应用达到 L5/E4，才允许进入 side-effect 阶段。

## 11. 分阶段开发计划

## P0：真实 Runtime 契约校准与可重复测试基线

### 目标

先证明现有部件可以按真实返回类型组合，消除 fake Runtime 掩盖的契约断层。

### 开发

- 为 MCP → AutomationRuntime → Vision/Layout/Screenshot 增加真实 adapter integration tests；
- 在 OS / external OCR 边界允许注入 deterministic provider，不在 MCP 边界整体 fake；
- 统一 snake_case transport 与 camelCase internal field 的转换；
- 统一 typed slices/maps 到 canonical struct；
- 统一 `bbox / bounds`、`center / clickPoint`；
- 统一 screenshot target 枚举；
- 明确 static fixture 与 live capture；
- 将 raw action 结果改为 command receipt 语义；
- 建立至少 Linux pure test CI；macOS / Windows 真实桌面测试单独分层。

### 测试对象

```text
fixed OCR fixture
fixed Layout fixture
fixed screenshot fixture
injected deterministic runtime boundaries
```

### Evidence

```text
contract matrix
integration test output
schema compatibility fixtures
current commit CI status
```

### 退出条件

- OCR fixture 能通过真实类型路径进入 `tm_find_target` dry-run；
- Layout fixture 能产生可执行 geometry projection；
- screenshot schema 与 runtime 无枚举歧义；
- real adapter integration 不依赖 `fakeRuntime` 才能通过；
- raw action 不再被标成 verified business success；
- 当前 HEAD 有可重复 T1/T2 结果。

### 并行项

- HTML Playground UI 可以并行搭骨架，但不得先声明动作可靠；
- macOS / Windows adapter 的契约修复可以并行；
- OCR provider 性能研究不阻塞基础 contract conformance。

## P1：Verified Desktop Step 与 Evidence Spine

### 目标

建立唯一可信步骤执行层，并把 `pkg/semanticexec` 的 contract 从 Mock-only 演进为可接真实 runtime 的模型。

### 开发

- 定义 StepRequest、Observation、Target、Lease、Receipt、Verification、Failure、Recovery、Verdict；
- 实现 live executor ports：Observer、Locator、GeometryResolver、Driver、Verifier、EvidenceSink；
- 保留 Mock executor，用于状态机和反例测试；
- 接入 `pkg/execution` 的 run lifecycle 和 artifacts；
- MCP / JS 增加统一 Verified Step 入口；
- 实现 success / failed / blocked / unknown / partial / degraded / false_success_suspected；
- 实现 budgets、idempotency 与 high-risk default block。

### 测试对象

```text
in-memory deterministic state machine
simulated driver receipt
simulated UI/state/business verifier
false-success and unknown fixtures
```

### Evidence

每个测试 Step 生成完整 manifest，并验证：

- action success + business fail → false success；
- driver dispatched + no observation → unknown；
- ambiguous → blocked；
- partial progress → partial；
- budget exhausted → RecoveryExhausted。

### 退出条件

- 所有 canonical verdict 有正例与反例；
- 缺少 postcondition 不会得到 `succeeded`；
- 每个 Step 都有可校验 manifest；
- MCP / JS / Go 使用同一结果模型；
- 没有第二套平行 failure/status taxonomy。

## P2：固定单控件与基础 HTML Playground

### 目标

在受控桌面表面证明真实 click / focus / type 的最小闭环。

### 开发

- 建立 Benchmark server、reset、state 和 event log；
- 首批控件：button、input、textarea；
- 支持固定窗口、固定 viewport、固定控件；
- 接入真实 Before/After capture 与 Oracle；
- 验证 mouse click、keyboard type、clipboard paste 三条基础路径；
- 增加 active window / focused element verifier。

### 测试应用

```text
Clawdesk HTML Playground — fixed mode
```

### 典型场景

```text
click button → clickCount 0 → 1
type text → inputText == expected
paste text → inputText == clipboard payload
focus input → focusedElement == target id
```

### Evidence

- before / after state；
- action receipt；
- focused element；
- event log；
- optional screenshot diff；
- final verdict。

### 退出条件

- PR bounded smoke 满足基础重复 Gate；
- Wrong-Target = 0；
- False-Success = 0；
- 焦点不成立时 typing 必须 blocked/failed，而不是“执行成功”；
- 单个控件失败可准确映射 Failure Class。

## P3：多候选控件、确定性 Locator 与 Spatial Model

### 目标

从“已知坐标”升级到“根据身份定位唯一目标”。

### 开发

- 实现 Element / Region / Anchor / Geometry / Coordinate；
- 实现坐标空间与 transform；
- 实现 CandidateEntity 与 Target Lease；
- HTML Benchmark 增加重复文案、相似控件和多区域；
- 实现 DOM locator 作为一条结构 Route；
- 实现 macOS Accessibility / Windows UI Automation 的最小 Route；
- Window Hierarchy 与 Anchor route 进入统一 Target Signal；
- 目标不唯一时进入 Ambiguity Gate。

### 测试应用

```text
HTML Playground — duplicate / region mode
minimal native accessibility fixture
```

### 典型场景

- 两个“确定”按钮，只允许点击指定 Dialog 中的一个；
- 同名输入框位于不同 Region；
- window move / resize 后旧 lease 失效；
- screenshot pixel 转 screen coordinate 可复核；
- Accessibility 不可用时明确 fallback，不静默猜点。

### Evidence

```text
target signals
candidate clusters
fusion-free deterministic selection trace
coordinate transforms
lease invalidation trace
ambiguity verdict
```

### 退出条件

- 正确唯一目标被选择；
- 无法唯一选择时必须 blocked；
- window / scale / resize 变化后旧 lease 不可执行；
- Accessibility / DOM route 均有 bounded integration Evidence；
- 不允许以单个 OCR 文本中心点直接升级为高风险 target。

## P4：复合控件、页面状态与可验证交互

### 目标

覆盖真实页面常见控件组合和多步状态变化。

### 开发

- 增加 checkbox、radio、select、slider、toggle；
- 增加 tabs、dropdown、menu、dialog、tooltip、table、list；
- 增加 focus、enabled、selected、checked、expanded、modal state；
- 建立 Condition Node 与显式 wait-for-state；
- 支持可验证 drag source / target；
- 引入页面 State Model，不用固定 sleep 表达状态等待。

### 测试应用

```text
HTML Playground — controls / form / state mode
```

### 典型场景

```text
fill form
→ verify each field
→ open confirmation dialog
→ select the unique confirm action
→ verify submitted state
```

Submit 仍使用本地无副作用 Oracle，不外发真实数据。

### Evidence

- Page state transition；
- control-specific state；
- wait condition trace；
- dialog identity；
- drag start/end and result；
- workflow-level summary。

### 退出条件

- 所有必选控件均有正例、负例与 unknown case；
- 禁用控件不会被错误点击；
- fixed sleep 不作为唯一状态等待机制；
- 复合流程中每一步均有独立 Verdict。

## P5：动态 UI、多信号融合与 Bounded Recovery

### 目标

在可控环境中系统加入真实世界不确定性。

### 开发

- 动态位置、scroll、occlusion、delay、async、animation；
- resize、browser zoom、DPI / scale、focus loss；
- virtual list 和 stale target；
- OCR、Template、Color、Shape、Layout 进入统一 Signal pipeline；
- Vision Model 作为昂贵 fallback，默认不运行；
- Candidate clustering、deduplication、fusion、risk score；
- Recovery policy 与四类 Budget；
- 高风险/非幂等动作的 no-blind-retry rule。

### 测试应用

```text
HTML Playground — adversarial / dynamic mode
```

### 典型场景

- 目标延迟出现；
- 目标需要在指定 scroll region 内滚动；
- overlay 部分遮挡目标；
- 同一实体被 OCR、Accessibility 与 Template 同时发现；
- 目标在 locate 后移动，旧 lease 被阻止；
- action receipt 存在但 state unchanged；
- verifier 不可用，最终 verdict 为 unknown。

### Evidence

```text
signal collection order
candidate cluster membership
fusion score components
risk and ambiguity decision
recovery attempt trace
budget consumption
final state / oracle
```

### 退出条件

- 达到动态场景初始 Gate；
- 同一实体的多路 observation 被正确融合；
- 失败分类覆盖必选扰动；
- non-idempotent 动作不存在盲重试；
- Vision / Agent fallback 的每次使用都能解释“为什么升级”。

## P6：简单系统应用梯度

### P6-A Calculator

#### 目标

第一个真实系统应用必须选择业务 Oracle 明确、状态空间小的应用。

#### 场景

```text
12 + 23
→ expected result: 35
```

#### 平台候选

```text
macOS Calculator
Windows Calculator
```

#### Gate

- 窗口身份明确；
- 输入路径可解释；
- 结果显示可通过 Accessibility / OCR / readback 至少一种可靠路径验证；
- API 无异常但结果不是 35 时必须判失败；
- 当前平台、版本、display geometry 与权限进入 Evidence。

### P6-B Text Editor

平台候选：

```text
macOS TextEdit
Windows Notepad
```

首批范围：

```text
open disposable document
focus editor
write draft
read back / verify text
close without affecting user data
```

Save 仅允许写入测试临时目录，并验证文件内容。

### P6-C File Manager

平台候选：

```text
macOS Finder
Windows Explorer
```

首批范围：

```text
open disposable fixture directory
navigate
select known file
verify selected identity
open known file
```

删除、移动真实用户文件不进入首批 Gate。

### P6-D Settings

平台候选：

```text
macOS System Settings
Windows Settings
```

首批范围优先 read-only：

```text
open page
locate section
read current state
verify navigation
```

只有存在可逆、安全、可回滚且有独立测试环境的设置项，才允许测试 toggle。

### P6 总退出条件

- Calculator 先通过，再推进 editor；
- editor 通过后再推进 file manager；
- Settings 不阻塞前述应用，但 side effect Gate 最严格；
- 每个应用必须有当前环境 E4 bounded report；
- 一次成功不能升级为跨版本稳定。

## P7：App Adapter SDK 与普通真实应用

### 目标

把通用能力映射到一个低风险普通应用，正式落实：

```text
Business Goal
→ App Profile
→ Window
→ Page / State
→ Region
→ Locator
→ Geometry
→ Verified Action
→ Skill
→ Workflow
→ Evidence
```

### 开发

- App Profile schema；
- Window / Page / State / Region model；
- app-specific locator 与 verifier；
- Skill contract；
- adapter version / compatibility / fixture metadata；
- read-only 与 draft-only risk policy；
- reusable structural app-class hints，例如 document-app / chat-app，但不把业务语义下沉到 Layout core。

### 测试应用选择

执行时根据当前环境重新评分，要求：

- 可控安装和版本；
- 可创建 disposable fixture / sandbox；
- Accessibility 或结构面可观察；
- 首轮不需要发送、删除、购买；
- 具有可验证 postcondition。

不在计划文件中预先把 Slack、Telegram 或其他应用写成已经确定的第一目标。

### 退出条件

- 至少一个 Adapter 完成 read-only 与一项可逆写入；
- 业务 Skill 不出现裸 `click → sleep → click`；
- App-specific 失败 code 映射 F0-F10；
- Adapter 不污染通用 core 的语义边界。

## P8：动态真实 UI、多页面与多窗口

### 目标

把 P5 的受控扰动扩展到真实应用。

### 开发 / 测试

- asynchronous content；
- virtualized list；
- tab / modal / popup；
- multi-window identity；
- background / foreground transition；
- page state re-discovery；
- current-window 与 target-window guard；
- bounded read-only communication sandbox 可作为候选，但不执行 send。

### 退出条件

- 窗口、页面或列表变化后不会继续使用 stale target；
- 多窗口同名时可以消歧或 block；
- dynamic failures 有可重放 Evidence；
- 没有 sandbox 的通信应用仍保持 read-only。

## P9：跨应用 Workflow 与确定性节点

### 目标

先建立可验证 Workflow，再引入开放式 Agent。

### Node 类型

```text
Action Node
Condition Node
Skill Node
Verification Node
Recovery Node
Human Confirmation Node
```

### 推荐首个跨应用场景

```text
HTML Playground 生成确定性文本
→ 复制
→ 打开 disposable Text Editor document
→ 粘贴
→ 验证 editor 内容
→ 保存到测试临时目录
→ File Manager 定位文件
→ 验证文件身份与内容
```

该场景覆盖：

```text
browser surface
clipboard
window switch
text input
file output
cross-app state handoff
```

且拥有强 Oracle，不依赖真实聊天账号。

### 退出条件

- 每个 Node 独立有 input/output/verdict/evidence；
- Workflow success 由最终业务 postcondition 决定；
- 任一 Step unknown 不会被总体汇总吞成 success；
- checkpoint 能恢复到明确状态；
- Human Confirmation Node 可以真正阻断后续执行。

## P10：微信 / 千牛等复杂业务应用

### 进入前置条件

至少满足：

- P5 动态 Benchmark 达到 E3；
- P6 系统应用至少 Calculator、Editor、File Manager 达到 E4；
- P7 App Adapter contract 已在普通应用验证；
- P8 多窗口/动态真实 UI 通过；
- P9 Workflow、Evidence 与 Human Gate 可用。

### 分级推进

```text
P10-A App / Window / Page / Region discovery
P10-B Read-only navigation and identity verification
P10-C Open target conversation / order and verify header/status
P10-D Write draft but do not send
P10-E Manually-gated send in disposable sandbox
P10-F Bounded workflow and deterministic supervisor
```

### 微信 Skill 示例

```text
findConversation
openConversation
verifyConversation
readLatestMessages
focusComposer
writeDraft
verifyDraft
sendMessage
verifySentMessage
```

### 千牛经验的使用方式

旧脚本中有价值的结构：

```text
window discovery
→ state perception
→ target location
→ atomic business action
→ skill
→ single workflow
→ long-running supervisor
```

以下只能转化为 Failure Case / Benchmark challenge，不能直接上收为通用实现：

```text
fixed coordinate
fixed width / height
fixed color
fixed sleep
guess coordinate when target missing
return true immediately after action
```

### 高风险 Gate

Send / submit 需要至少：

```text
target identity verified
current page/state verified
draft content verified
dedup / replay guard passed
authorization / human gate passed
single-use target lease
postcondition verified
```

`VerificationUnknown` 时禁止再次发送。

## P11：Prompt Workflow、Vision Model 与 Constrained Agent

### 引入时机

- Vision Model：P5 开始作为明确失败后的 bounded perception fallback；
- Prompt Node authoring：P9 后可以引入，但只能产生 typed proposal；
- Agent planner：P10 有稳定 Skill 后进入；
- Supervisor：基于状态机、Budget 和 Evidence 监督 Workflow，不直接循环猜坐标。

### Prompt Node 约束

可研究类似：

```text
# :::agent
...
# :::
```

但文本语法不是核心能力。先定义 typed schema：

```text
goal
allowedSkills
input contract
output schema
requiredEvidence
risk limit
cost/time budget
human gate policy
```

规则：

- Prompt Node 不能直接宣布业务成功；
- Agent 不能绕过 Verified Step 调用裸坐标；
- Agent 默认只能从 allowlist Skill 中选择；
- Agent 提出的 target / action 仍需 ambiguity、freshness、risk 与 postcondition Gate；
- Model 输出不符合 schema 时 blocked，不做宽松猜测执行。

### 退出条件

- 同一任务的 deterministic workflow 与 agent-assisted workflow 可对比；
- Agent 使用次数、原因、成本和决策 Evidence 可追踪；
- Agent 失败不会破坏底层状态语义；
- 高风险动作仍需要独立确认，而不是由模型信心替代。

## P12：Autonomous Desktop Agent

### 目标

支持长任务、自主规划、跨应用和长期监督，但仍运行在已验证能力之上。

### 必备能力

```text
stateful plan
skill registry
capability / permission discovery
checkpoint and resume
bounded recovery
cost/time/risk budgeting
human escalation
evidence-aware replanning
versioned app adapters
long-run observability
```

### 进入条件

- L1-L10 的关键能力有 E5 repeated regression；
- False-Success Rate 保持为零或有明确阻断；
- 高风险场景有真实 Human Gate；
- App drift 能触发 stop/degrade，不静默继续；
- 具备 current supported environment matrix 和 rollback policy。

## 12. 通用框架与 App Adapter 的边界

### 12.1 必须先完成的通用能力

```text
Driver receipt
Surface / Observation
Coordinate spaces and transforms
Element / Region / Anchor / Geometry
Target Signal / CandidateEntity / TargetLease
Ambiguity / Freshness / Visibility / Enabled gates
Verified Step
Verification protocol
Failure taxonomy mapping
Recovery and budgets
Evidence manifest
Benchmark runner
Workflow node runtime
Human confirmation machinery
```

### 12.2 应留在具体 App Adapter / Skill 的内容

```text
app executable / title matching
app version compatibility
page and business state taxonomy
business region names
app-specific locators
header / conversation / order identity verifier
draft / send / submit postcondition
app-specific risk policy
business skill
workflow and supervisor policy
```

### 12.3 可共享但不写死业务语义的中间层

可以维护结构类 Profile：

```text
chat-app
document-app
settings-app
file-manager-app
```

它们只能提供候选结构提示，不能把：

```text
nav_list == conversation_list
content_main == message_list
button text == safe send target
```

写成全局事实。

## 13. 推荐测试应用顺序

```text
HTML Playground — fixed
→ HTML Playground — multiple / composite
→ HTML Playground — dynamic / adversarial
→ Calculator
→ Text Editor
→ File Manager
→ Settings read-only
→ ordinary sandboxed app
→ dynamic real app
→ multi-window / multi-page
→ cross-app workflow
→ WeChat / QianNiu read-only
→ draft-only
→ manually-gated side effect
→ constrained Agent
→ autonomous Agent
```

### 为什么 Calculator 应先于 Finder

Calculator 更适合作为第一个真实系统应用，因为：

- 业务状态空间小；
- 输入输出关系明确；
- `12 + 23 = 35` 是强 Oracle；
- 可以直接暴露“输入动作无异常但实际结果错误”的 false success；
- 不涉及用户文件和不可逆副作用。

Finder / Explorer 仍然重要，但列表、视图模式、路径、选择状态和文件副作用更复杂，适合在 Text Editor 之后进入。

## 14. PR 拆分建议

后续不应通过一个大 PR 同时修改 Driver、MCP、Benchmark、App Adapter 和 Agent。

| PR | 建议范围 | 关键 Gate |
| --- | --- | --- |
| PR-00 | 本计划与事实审计 | docs-only；不宣称运行通过 |
| PR-01 | MCP / Vision / Layout / Screenshot contract conformance tests and fixes | 真实返回类型组合通过 |
| PR-02 | Canonical Step / Receipt / Verdict / Budget contract | Mock 正反例完整；unknown 不变 success |
| PR-03 | Step Evidence sink 与 `pkg/execution` 集成 | 每 Step manifest 可校验 |
| PR-04 | Live Observer / Driver / Verifier executor；raw API ack 语义校准 | action receipt 与 business verdict 分离 |
| PR-05 | HTML Benchmark skeleton、reset/state/events | Oracle 可重复，禁止 shortcut |
| PR-06 | Fixed button / input / textarea E3 reference | 真实 click/type postcondition |
| PR-07 | Spatial Model、Coordinate Transform、Target Lease | resize/scale/stale invalidation |
| PR-08 | DOM + Accessibility 最小 Route | 结构定位 current integration evidence |
| PR-09 | Candidate clustering、fusion、ambiguity / risk gate | duplicate target 不误点 |
| PR-10 | Composite controls and page state | 控件矩阵与 state transition |
| PR-11 | Dynamic disturbances、Recovery、Budget | 0 blind retry；failure classified |
| PR-12 | Calculator Adapter | exact result Oracle |
| PR-13 | Text Editor / File Manager / Settings bounded adapters | disposable fixtures；安全边界 |
| PR-14 | App Adapter SDK + ordinary app | no core semantic leakage |
| PR-15 | Multi-window / cross-app Workflow | checkpoint and final oracle |
| PR-16 | WeChat / QianNiu read-only and draft adapters | identity and draft verification |
| PR-17 | Manually-gated side effects | authorization + postcondition + dedup |
| PR-18 | Prompt Node / constrained Agent / Supervisor | allowlist Skill + Evidence + budgets |

每个 PR 必须包含：

```text
scope
non-goals
current fact baseline
tests run
tests not run
evidence paths
failure cases added
claim boundary
next dependency
```

## 15. 当前立即执行顺序

### 第一批：必须先做

```text
PR-01 Contract Conformance
PR-02 Canonical Verified Step Contract
PR-03 Step Evidence Spine
PR-04 Live Verified Action Runtime
PR-05 HTML Benchmark Skeleton
PR-06 Fixed Control Reference
```

### 第二批：可靠定位与动态环境

```text
PR-07 Spatial Model / Coordinate Transform / Target Lease
PR-08 DOM / Accessibility Routes
PR-09 Candidate Fusion / Ambiguity / Risk
PR-10 Composite Controls
PR-11 Dynamic UI / Recovery / Budgets
```

### 第三批：真实应用

```text
PR-12 Calculator
PR-13 Text Editor / File Manager / Settings
PR-14 Ordinary App Adapter
PR-15 Multi-window / Cross-app
```

### 第四批：复杂应用与 Agent

```text
PR-16 WeChat / QianNiu read-only and draft
PR-17 Manually-gated side effects
PR-18 Prompt Workflow / Constrained Agent / Supervisor
P12 Autonomous Agent only after repeated regression
```

## 16. Stop Conditions

出现以下情况不得升级阶段：

- raw action 无错误但没有 postcondition；
- 只有 fake Runtime test，没有真实组件组合 test；
- 只有一张成功截图，没有 before/after 与 Oracle；
- 目标歧义但仍选择第一候选；
- stale revalidation 没有重新捕获 live state；
- 失败只能标记“retry failed”，没有 Failure Class；
- 非幂等动作发生 unknown 后继续重试；
- 没有 current environment / version / permission Evidence；
- 历史微信脚本曾运行成功，被用来证明当前通用能力；
- Vision Model / Agent 被用来绕过坐标空间、焦点或验证缺陷；
- Benchmark 可以通过内部 DOM shortcut 直接完成被测动作；
- Step Evidence 缺失关键字段但最终 verdict 为 pass。

## 17. 完成定义

下一阶段不是以“新增多少工具”衡量完成度，而以以下链路是否在受控和真实环境中逐级成立衡量：

```text
Observe
→ Resolve a fresh and unambiguous target
→ Project valid geometry
→ Dispatch an action
→ Observe the consequence
→ Verify the required postcondition
→ Classify failure or unknown
→ Recover only within explicit budgets
→ Produce replayable Evidence
```

最终目标不是让 Clawdesk 更容易写出：

```text
click
sleep
click
type
return true
```

而是让它能够稳定回答：

```text
我观察到了什么？
为什么选择这个目标？
这个坐标从哪个空间转换而来？
底层动作究竟执行到了哪一层？
界面和业务状态是否真的改变？
如果无法证明，为什么是 unknown？
失败属于哪一类？
为什么允许或禁止恢复？
支持最终 Claim 的 Evidence 在哪里？
```
