# Peekaboo 借鉴后的 testMonkey MCP / Runtime 技术设计草案

> 目标：在不推翻现有视觉工件链的前提下，把 testMonkey-go 从“截图 + OCR + 坐标输入 runtime”升级为“带语义快照、动作解析、执行证据与发送安全门的桌面 Agent runtime”。

## 0. 一眼看懂的推荐路径

```text
现状
├─ 感知层：screenshot / ocr / detect_ui / analyze_layout 已有
├─ 执行层：click / type / press_key / scroll / focus_window 已有
├─ 证据层：semantic_model / actionability_report / send_safety_report 已有文档与部分实现
└─ 缺口：缺 live snapshot、target resolution、action-first、execution metadata

推荐 V1
├─ 先补语义工具面
│  ├─ tm_snapshot_ui
│  ├─ tm_get_snapshot
│  ├─ tm_resolve_target
│  ├─ tm_focus_app
│  ├─ tm_set_value
│  ├─ tm_perform_action
│  └─ tm_send_safe
├─ 再补统一执行结果模型
│  ├─ execution_path
│  ├─ resolved_target
│  ├─ fallback_reason
│  ├─ window_identity
│  └─ evidence_paths
└─ 最后把 click/type/send 接入 action-first 策略

不推荐路径
├─ 继续把所有高层动作都降级成 x/y 坐标
├─ 先做大型自然语言 agent，再补 runtime contract
└─ 把 Peekaboo 全量 Swift 服务结构照搬到 Go 工程
```

## 1. 背景与问题定义

当前 testMonkey-go 已经具备三类重要基础：

1. MCP 基础工具面
   - `tm_status`
   - `tm_permissions`
   - `tm_request_permissions`
   - `tm_list_windows`
   - `tm_get_active_window`
   - `tm_focus_window`
   - `tm_list_displays`
   - `tm_screenshot`
   - `tm_ocr`
   - `tm_detect_ui`
   - `tm_click_text`
   - `tm_analyze_layout`
   - `tm_annotate_regions`
   - `tm_click`
   - `tm_type`
   - `tm_press_key`
   - `tm_scroll`

2. Runtime 现有能力
   - window manager：列窗口、取前台窗口、聚焦窗口
   - page/screenshot：屏幕截图
   - vision：OCR / UI detect / layout analyze / annotate
   - mouse / keyboard：坐标点击、输入、按键、滚轮

3. 工件驱动的安全设计已经开始成型
   - `infer/semantic_model.json`
   - `verify/actionability_report.json`
   - `verify/send_safety_report.json`
   - `pkg/visionrun/send_safety.go` 已实现 fail-close 风格的发送前审查

但当前仍然存在一个关键断层：

文档和工件层已经在向“语义动作 + 安全门”演进，运行时工具面却仍然主要停留在“视觉定位 + 坐标动作”。

这会导致：
- agent 无法稳定持有元素身份
- 执行动作时缺少 live target resolution
- 很多失败只能看到“点错了”，看不到“为什么点错了”
- 高风险动作（尤其发送）难以闭环验证

## 2. 参考 Peekaboo 后的核心判断

Peekaboo 最值得借鉴的不是具体语言或工程结构，而是 4 个运行时原则：

### 2.1 工具面按对象与动作分层

Peekaboo 将能力清楚拆为：
- see / snapshot
- click / type / scroll / hotkey / drag
- app / window / menu / dialog / dock / space
- set-value / perform-action
- agent / mcp

对于 testMonkey-go，这意味着：
- 不应只提供“感知工具”和“裸输入工具”
- 需要提供对象级操作工具
- 需要提供语义动作工具

### 2.2 保留 target intent，不要过早降级为坐标

Peekaboo 的关键思想是：
- 先保留元素、窗口、动作意图
- 尝试 action-first
- 必要时才 fallback 到 synth / coordinates

对于 testMonkey-go，这意味着：
- `tm_click_text` 这类工具虽有价值，但不能成为主执行模型
- 上层应该能传入 candidate / target / snapshot context
- runtime 应负责最后一跳解析，而不是 LLM 自己算坐标

### 2.3 snapshot / element identity 是一等公民

Peekaboo 的 snapshot 思路能显著提升：
- 可解释性
- 可重放性
- 调试效率
- 高风险动作 gating

对于 testMonkey-go，这意味着：
- 需要在 runtime 中引入 snapshot store
- 需要在 MCP surface 中暴露 snapshot id 与 target id
- 需要统一 target resolution 的结果对象

### 2.4 action-first + synth fallback

Peekaboo 并不否认坐标输入，而是把它降为 fallback。

对于 testMonkey-go，这意味着：
- 发送、聚焦输入框、设置文本等动作不应永远依赖 keyboard/mouse synth
- 能直接 set value / perform action 的地方，应优先走语义路径
- 只有语义路径不可用时，才回退到坐标点击 + 键盘输入

## 3. 当前代码基线

## 3.1 MCP server 现状

`pkg/mcpserver/server.go` 当前已经支持：
- window introspection：`tm_list_windows` / `tm_get_active_window` / `tm_focus_window`
- screenshot + vision：`tm_screenshot` / `tm_ocr` / `tm_detect_ui` / `tm_analyze_layout` / `tm_annotate_regions`
- low-level input：`tm_click` / `tm_type` / `tm_press_key` / `tm_scroll`
- convenience tool：`tm_click_text`

其中 `tm_click_text` 的实现路径是：
- 先 `DetectUI`
- 取第一个 match
- 读取 `clickPoint`
- 再转为 `tm_click`

这说明当前模型仍是：
“语义/视觉发现 -> 坐标执行”

## 3.2 AutomationRuntime 现状

`pkg/mcpserver/runtime.go` 当前的执行层接口主要是：
- `ListWindows`
- `GetActiveWindow`
- `FocusWindow`
- `GetDisplays`
- `Screenshot`
- `OCR`
- `DetectUI`
- `AnalyzeLayout`
- `AnnotateRegions`
- `Click`
- `Type`
- `PressKey`
- `Scroll`

关键特点：
- `Click` 只接受 `x/y`
- `Type` 只接受 `text` 与可选 Enter
- `FocusWindow` 只按 title
- 没有 snapshot store
- 没有 target resolver
- 没有执行路径元数据

## 3.3 安全门基础已经存在

`pkg/visionrun/send_safety.go` 已经能基于以下证据做 fail-close：
- app classification
- zones
- action_targets
- ocr_map
- actionability_report
- runtime preflight
- chat_candidates
- pre_send_baseline
- capture template audit

这说明发送安全模型并不需要从零开始；真正缺的是把 runtime 动作层与这套 verify layer 接起来。

## 4. 设计目标

### 4.1 V1 目标

在不大改现有 vision pipeline 的前提下，实现：

1. MCP 中新增语义快照与目标解析工具
2. Runtime 中新增统一 target resolution 层
3. click / type / send 的执行结果带上可审计元数据
4. 为后续 `actionFirst` 策略预留接口
5. `tm_send_safe` 把现有 `send_safety_report` 接入真实执行闭环

### 4.2 非目标

本设计不追求：
- 一次性做完 Peekaboo 全量 OS 工具面
- 立即重构成大型 agent framework
- 立即引入复杂 UI accessibility tree 的全平台统一抽象
- 直接删除坐标动作路径

## 5. 总体架构

```text
LLM / MCP client
  -> tm_snapshot_ui / tm_resolve_target / tm_send_safe / tm_set_value / tm_perform_action
  -> mcpserver.Server
  -> AutomationRuntime
  -> SnapshotStore
  -> TargetResolver
  -> InputExecutor
     ├─ ActionExecutor     (future-first / partial V1)
     └─ SynthExecutor      (existing click/type/press/scroll)
  -> ExecutionResult
  -> artifact / verify / audit writeback
```

### 5.1 新增核心模块

建议新增：
- `pkg/mcpserver/snapshots.go`
- `pkg/mcpserver/targets.go`
- `pkg/mcpserver/execution_result.go`
- `pkg/mcpserver/send_safe.go`
- `pkg/runtimeui/` 或 `pkg/semanticui/` 子包
  - `snapshot_store.go`
  - `target_resolver.go`
  - `input_policy.go`
  - `execution_types.go`

如果想减少新包数量，也可以先放在 `pkg/mcpserver/` 下做 V1。

## 6. 新的数据模型

## 6.1 Snapshot 模型

```go
type UISnapshot struct {
    ID           string                 `json:"id"`
    CreatedAt    string                 `json:"createdAt"`
    Source       map[string]any         `json:"source"`
    Window       map[string]any         `json:"window,omitempty"`
    Screenshot   map[string]any         `json:"screenshot,omitempty"`
    OCR          map[string]any         `json:"ocr,omitempty"`
    Layout       map[string]any         `json:"layout,omitempty"`
    Semantic     map[string]any         `json:"semantic,omitempty"`
    Candidates   []map[string]any       `json:"candidates,omitempty"`
    EvidencePaths map[string]string     `json:"evidencePaths,omitempty"`
}
```

说明：
- V1 不要求 snapshot 一定来自 accessibility tree
- 可以先由 screenshot + OCR + layout + semantic candidate 拼出 runtime snapshot
- 重点是让快照有 id，并能在后续动作中被引用

## 6.2 Target 请求模型

```go
type ResolveTargetRequest struct {
    SnapshotID      string            `json:"snapshotId,omitempty"`
    Intent          string            `json:"intent,omitempty"`
    TargetText      string            `json:"targetText,omitempty"`
    TargetRole      string            `json:"targetRole,omitempty"`
    CandidateID     string            `json:"candidateId,omitempty"`
    WindowTitle     string            `json:"windowTitle,omitempty"`
    ExpectedHeader  string            `json:"expectedHeader,omitempty"`
    ExpectedContext map[string]any    `json:"expectedContext,omitempty"`
    MatchMode       string            `json:"matchMode,omitempty"`
}
```

### 6.3 解析结果模型

```go
type ResolvedTarget struct {
    OK               bool              `json:"ok"`
    TargetID         string            `json:"targetId,omitempty"`
    SnapshotID       string            `json:"snapshotId,omitempty"`
    Intent           string            `json:"intent,omitempty"`
    ResolutionMethod string            `json:"resolutionMethod,omitempty"`
    Confidence       float64           `json:"confidence,omitempty"`
    WindowIdentity   map[string]any    `json:"windowIdentity,omitempty"`
    Bounds           map[string]any    `json:"bounds,omitempty"`
    ClickPoint       map[string]any    `json:"clickPoint,omitempty"`
    Evidence         map[string]any    `json:"evidence,omitempty"`
    BlockingReasons  []string          `json:"blockingReasons,omitempty"`
}
```

### 6.4 执行结果模型

```go
type UIExecutionResult struct {
    OK              bool              `json:"ok"`
    Action          string            `json:"action"`
    ExecutionPath   string            `json:"executionPath"`
    ResolvedTarget  map[string]any    `json:"resolvedTarget,omitempty"`
    FallbackReason  string            `json:"fallbackReason,omitempty"`
    WindowIdentity  map[string]any    `json:"windowIdentity,omitempty"`
    Preconditions   map[string]any    `json:"preconditions,omitempty"`
    Postconditions  map[string]any    `json:"postconditions,omitempty"`
    EvidencePaths   map[string]string `json:"evidencePaths,omitempty"`
    Warnings        []string          `json:"warnings,omitempty"`
}
```

这类结果对象将成为后续：
- replay
- audit
- send gate
- failure taxonomy
的统一输入。

## 7. MCP 新工具设计

## 7.1 `tm_snapshot_ui`

### 目标
生成可复用的 runtime snapshot，而不是每个动作都重新裸调用 screenshot + OCR。

### 输入
```json
{
  "windowTitle": "微信",
  "target": "window",
  "includeOCR": true,
  "includeLayout": true,
  "includeSemantic": true,
  "saveArtifacts": true,
  "artifactRoot": ".runtime/runs/<run-id>"
}
```

### 输出
```json
{
  "ok": true,
  "snapshot": {
    "id": "snap_xxx",
    "createdAt": "...",
    "window": {...},
    "candidates": [...],
    "evidencePaths": {...}
  }
}
```

### V1 实现建议
- 调用现有 `tm_screenshot`
- 视配置串联 `OCR` / `AnalyzeLayout`
- 按当前 semantic contract 组装 candidate 列表
- 存入内存 snapshot store

## 7.2 `tm_get_snapshot`

### 目标
按 id 取回 snapshot 内容，供上层 agent 做二次判断。

### 输入
```json
{ "snapshotId": "snap_xxx" }
```

## 7.3 `tm_resolve_target`

### 目标
将高层意图解析成 live target，而不是上层自己做 OCR 结果拼装。

### 输入
```json
{
  "snapshotId": "snap_xxx",
  "intent": "open_chat",
  "targetText": "张三",
  "targetRole": "chat_row",
  "expectedHeader": "张三"
}
```

### 输出
返回 `ResolvedTarget`。

### 设计原则
- 不保证一定执行
- 只负责解析与阻断原因解释
- 如果有多候选，明确返回 ambiguity

## 7.4 `tm_focus_app`

### 目标
补齐 app 级聚焦，避免所有 focus 都只能按 window title。

### 输入
```json
{ "app": "WeChat" }
```

### V1 实现
可先基于现有 window manager / process 层做最小能力。

## 7.5 `tm_set_value`

### 目标
为输入框、可编辑字段提供“直接赋值”路径。

### 输入
```json
{
  "snapshotId": "snap_xxx",
  "targetId": "input_main",
  "value": "你好"
}
```

### 说明
V1 即使先返回“not supported on this platform/path”，也应该把工具 schema 与执行结果模型先立住。

## 7.6 `tm_perform_action`

### 目标
显式表达“对一个目标执行语义动作”。

### 输入
```json
{
  "snapshotId": "snap_xxx",
  "targetId": "send_button",
  "action": "press"
}
```

### 价值
- 为 action-first 预留入口
- 可兼容后续 accessibility / AX / 原生 UI hook

## 7.7 `tm_send_safe`

### 目标
把 `pkg/visionrun/send_safety.go` 产出的 gate 与真实发送动作衔接起来。

### 输入
```json
{
  "runId": "gs-...",
  "snapshotId": "snap_xxx",
  "draftText": "你好",
  "targetChatName": "张三",
  "sendMode": "press_enter_or_click",
  "postVerify": true
}
```

### 输出
```json
{
  "ok": false,
  "allowed": false,
  "reportPath": ".../verify/send_safety_report.json",
  "blockingRisks": [...],
  "mustStop": true
}
```

### 关键规则
- gate 不过，禁止 send
- 不允许 blind retry
- 必须输出 precondition / postcondition 证据

## 8. 输入执行策略设计

## 8.1 策略枚举

建议尽快引入：

```go
type UIInputStrategy string

const (
    UIInputActionFirst UIInputStrategy = "actionFirst"
    UIInputSynthFirst  UIInputStrategy = "synthFirst"
    UIInputActionOnly  UIInputStrategy = "actionOnly"
    UIInputSynthOnly   UIInputStrategy = "synthOnly"
)
```

## 8.2 V1 策略现实落地

V1 不要求真的完成 full action executor，但要把接口设计好。

建议：
- `tm_click` / `tm_type` 继续默认 `synthOnly`
- `tm_set_value` / `tm_perform_action` 先作为独立新入口
- `tm_send_safe` 内部可以是 `actionFirst` 语义，但目前 fallback 到 synth

即：
先把策略模型立住，再逐步替换默认路径。

## 8.3 执行器分层

```text
InputExecutor
├─ Resolve target/context
├─ Choose strategy
├─ Try ActionExecutor if enabled
├─ Fallback to SynthExecutor
└─ Return UIExecutionResult
```

## 9. 与现有 vision / artifact 链的对接方式

## 9.1 不替换现有工件链

保留：
- `capture/source.png`
- `detect/layout_model.json`
- `infer/semantic_model.json`
- `verify/actionability_report.json`
- `verify/send_safety_report.json`

原因：
这些是当前系统最宝贵的可审计基础。

## 9.2 新增 runtime snapshot 作为“活态桥接层”

新的关系应是：

```text
artifact chain
  -> semantic candidates
  -> runtime snapshot
  -> target resolution
  -> execution result
  -> verify / replay / audit writeback
```

也就是说：
- 视觉工件负责“离线可诊断证据”
- runtime snapshot 负责“在线动作上下文”
- execution result 负责“动作发生后的事实记录”

## 9.3 `tm_send_safe` 的桥接方案

建议路径：
1. 从已有 run bundle 读取 verify 与 infer 工件
2. 补拍当前 live snapshot
3. 校验 header / input / candidate / send target
4. 若 gate 通过，执行 send
5. 执行 post-send verification
6. 写入 execution result 和 verify 增量证据

## 10. 分阶段实施计划

## 10.1 Phase 1：补语义快照与解析层

### 目标
让 runtime 首次具备“记住上下文并解析目标”的能力。

### 产出
- `tm_snapshot_ui`
- `tm_get_snapshot`
- `tm_resolve_target`
- snapshot store
- resolved target model

### 修改点
- `pkg/mcpserver/server.go`
- `pkg/mcpserver/runtime.go`
- 新增 snapshot / target resolver 文件
- MCP tests 补齐

### 验收
- 可先 snapshot，再 resolve，同一 snapshot 内拿到稳定 candidate
- ambiguity 能显式返回
- response 中包含 window identity / evidence

## 10.2 Phase 2：补执行结果模型与对象级动作入口

### 目标
让动作不再只返回 `ack(action,args)`，而是返回带路径与证据的结果对象。

### 产出
- `UIExecutionResult`
- `tm_focus_app`
- `tm_set_value`
- `tm_perform_action`

### 说明
即便底层有些动作先 stub，也要先统一 contract。

## 10.3 Phase 3：接入发送安全闭环

### 目标
把 `send_safety.go` 变成真实 runtime send gate 的一部分。

### 产出
- `tm_send_safe`
- send preflight -> execute -> post verify pipeline
- 失败 taxonomy 接口

### 验收
- gate fail 时明确阻断
- gate pass 时返回执行与 postcondition 证据
- 不允许 blind retry

## 10.4 Phase 4：逐步切换到 action-first

### 目标
在不破坏现有功能的前提下，逐步提高语义动作比例。

### 实施顺序建议
1. focus input
2. set value
3. perform action press
4. send
5. click generic target

## 11. 推荐文件改动清单

### 11.1 必改文件
- `pkg/mcpserver/server.go`
- `pkg/mcpserver/runtime.go`
- `pkg/mcpserver/server_test.go`

### 11.2 建议新增文件
- `pkg/mcpserver/snapshot_store.go`
- `pkg/mcpserver/snapshot_models.go`
- `pkg/mcpserver/target_resolver.go`
- `pkg/mcpserver/execution_result.go`
- `pkg/mcpserver/send_safe.go`

### 11.3 可能复用 / 补强的现有文件
- `pkg/visionrun/send_safety.go`
- `automation/window_manager_core.go`
- `automation/keyboard.go`
- `automation/script_engine.go`
- `automation/page` 相关 screenshot/permission 能力

## 12. 测试与验证建议

## 12.1 单元测试

优先补：
- snapshot store lifecycle
- target resolver ambiguity cases
- execution result serialization
- send_safe gate decision matrix

## 12.2 MCP server tests

在 `pkg/mcpserver/server_test.go` 增加：
- 新工具出现在 `tools/list`
- 新工具参数校验
- 新工具调用 runtime 正确
- 返回结果结构稳定

## 12.3 集成测试

建议至少覆盖三条链路：

### 链路 A：snapshot -> resolve
- 截图
- 生成 snapshot
- 解析 chat row
- 返回 candidate / clickPoint / ambiguity

### 链路 B：focus -> type -> execution metadata
- focus 窗口
- 输入文本
- 返回 execution result

### 链路 C：send_safe blocked
- 伪造 target mismatch / draft missing
- `tm_send_safe` 返回 blocked
- 校验 `mustStop = true`

## 13. 风险与取舍

## 13.1 最大风险

### 风险 A：过早追求完整 accessibility 动作层

问题：
- 当前代码基础仍偏 vision + input
- 若一次性追 accessibility-first，大概率会延误主线

对策：
- V1 先立 contract
- action executor 可以逐步增强
- synth path 继续保留

### 风险 B：snapshot 设计过重

问题：
- 如果 snapshot 一开始就要求完整 accessibility tree，工程量会爆炸

对策：
- V1 snapshot 允许是 vision-driven semantic snapshot
- 先保证 id、candidate、evidence、window context 四件事

### 风险 C：send_safe 与 live runtime 脱节

问题：
- 现在 verify layer 偏工件批处理，runtime send 是即时动作

对策：
- `tm_send_safe` 作为桥接工具
- 明确 preflight/live snapshot/postcondition 三段式

## 14. 最推荐的 V1 落地顺序

如果只做最有价值的最小集，我推荐：

### V1-A
- `tm_snapshot_ui`
- `tm_get_snapshot`
- `tm_resolve_target`

### V1-B
- execution result model
- 让 `tm_click_text` 升级为返回 resolved target + execution metadata

### V1-C
- `tm_send_safe`
- 把 `send_safety_report` 接进 runtime 动作前门

这三步完成后，系统就会从：
- 视觉脚本 runtime

进化到：
- 有语义上下文、有目标解析、有安全门的 Agent runtime

## 15. 明确结论

结论不是“把 Peekaboo clone 成 testMonkey”。

结论是：

1. 保留 testMonkey 现有视觉工件链，这是你的核心资产
2. 借鉴 Peekaboo 的 snapshot / target intent / action-first 思路
3. 先升级 MCP contract，再升级底层执行器
4. 发送动作必须通过统一的 `tm_send_safe` fail-close 门
5. V1 先让 runtime 变成“语义动作系统”，而不是继续加更多裸坐标工具

---

## 16. 下一步建议

我建议下一步直接进入实现前设计拆分，新增一份 implementation 计划，内容包括：
- Phase 1 需要改哪些 Go 文件
- 每个新工具的 schema 与示例 JSON
- `pkg/mcpserver/server_test.go` 需要新增哪些测试
- 如何让 `tm_click_text` 平滑迁移到 `tm_resolve_target + tm_click`

如果继续，我下一步可以直接把这份草案再展开成“可开发的任务清单 + 文件级实施计划”。
