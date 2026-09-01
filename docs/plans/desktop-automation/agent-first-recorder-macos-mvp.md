# Agent-first Recorder macOS MVP 执行计划

## 状态与范围

- 状态：`Ready for bounded implementation`
- 首个平台：macOS
- 产品入口：`apps/recorder/`
- 核心内核：`pkg/recorder/`
- 正式架构依据：[`agent-first-recorder.md`](../../architecture/desktop-automation/agent-first-recorder.md)
- 本计划只覆盖第一个可验证闭环，不代表人工全局 Recorder、跨平台 Recorder 或复杂应用自动化已经完成。

## 一、MVP Goal

在 macOS 上实现一个面向 OpenDesk Agent 的操作轨迹记录与脚本蒸馏闭环：

```text
Agent 通过 JavaScript / HTTP / MCP 执行少量受控任务
→ Recorder 记录动作、目标提示、窗口、截图、结果与验证证据
→ 将 Raw Trace 蒸馏为 Flow IR
→ 生成 OpenDesk JavaScript
→ 在不调用 AI 的情况下重复回放
→ 输出可追溯 Evidence 和失败分类
```

MVP 的完成标准不是“界面上出现录制按钮”，而是至少有一条真实 Agent 任务能够：

```text
记录
→ 蒸馏
→ 生成
→ 无 AI 回放
→ 验证
```

## 二、执行前仍需确认的事实

当前方向和系统边界已经足够进入实现，不需要再进行一轮纯概念讨论。执行开始时必须把以下环境事实落到 `.runtime/tests/recorder/preflight/`，不能依赖猜测：

```text
当前 master HEAD
macOS 产品版本与 build 号
CPU 架构
Go 版本
当前 locale / 输入法
显示器数量、主显示器、分辨率、scale 与虚拟桌面 bounds
OpenDesk.app bundle id、签名和实际启动路径
Accessibility、Screen Recording、Automation 权限状态
Calculator、TextEdit、Safari/Chrome 等目标应用是否存在
当前应用语言以及关键控件 Accessibility 暴露情况
```

建议采集命令与结果包括：

```bash
git rev-parse HEAD
sw_vers
uname -m
go version
locale
system_profiler SPDisplaysDataType
plutil -p dist/OpenDesk.app/Contents/Info.plist
codesign -dv --verbose=4 dist/OpenDesk.app
```

权限和运行主体必须按 [`automation-config.md`](../../implementation/macos/automation-config.md) 验证。桌面 T3 测试优先由固定的 `dist/OpenDesk.app` 身份发起，避免权限只绑定到 Terminal、Codex 或其他 shell host。

## 三、已经锁定的决策

本轮不得在实现中重新漂移以下决策：

1. MVP 为 Agent-first，不实现人工全局鼠标键盘监听。
2. Raw Trace 不可变；Flow IR 是脚本生成权威源；JavaScript 是派生产物。
3. 复用 `pkg/execution` 的 execution ID、Emitter、artifact 与事件基础，不建设平行通用日志系统。
4. 增加共享 Recorder Action Observer / Gateway，避免 JS、HTTP、MCP 各自实现录制逻辑。
5. JS / HTTP Recorder Session 绑定到单次 execution/runtime；MCP 使用显式 `recordingSessionId`。
6. Recorder 内部截图、AX、OCR 等观测带 `internal=true`，不得递归形成业务步骤。
7. `standard` observation 是默认策略；`enriched` 只在歧义、失败、强健化或 Golden 采样时启用。
8. 正常生成脚本至少支持 deterministic 无 AI 回放；AI 仅作为可选蒸馏或失败修复层。
9. 所有运行工件写入 `.runtime/recordings/` 或 `.runtime/tests/recorder/`。
10. 首轮只做低风险任务，不执行真实发送、删除、购买、支付和不可逆文件修改。

## 四、MVP 功能范围

### 4.1 必须完成

- Recorder Session：start、annotate、stop、status；
- 显式关联 execution ID、session ID、action ID 和 sequence；
- 记录 JavaScript / HTTP 执行路径中的可变动作；
- 记录 MCP click、type、press key、scroll、focus window；
- 动作前后活动窗口快照；
- 动作前后截图或明确记录无法截图的失败；
- Tool 请求、返回、耗时和错误；
- 可选 Agent Action Hint：goal、subgoal、intent、target、expected、risk、variable hints；
- 密码和敏感输入掩码；
- Raw Trace NDJSON；
- 基础轨迹裁剪与事件合并；
- Flow IR 和 schema；
- 最小 JavaScript compiler；
- deterministic replay；
- replay postcondition；
- Evidence manifest 和 F0-F10 失败映射；
- `apps/recorder/` 薄入口，用于查看 Session、Trace、生成状态和回放结果。

### 4.2 可以分批完成

- macOS AXUIElement enriched target snapshot；
- Locator Bundle 和窗口相对坐标回退；
- OCR / Detect UI / Layout 作为 enriched evidence；
- AI 蒸馏建议；
- AI repair proposal；
- drag 的完整语义化；
- Finder read-only 场景。

### 4.3 本轮明确不做

- CGEventTap 人工全局录制；
- Input Monitoring 作为 MVP 硬依赖；
- 输入法原始事件重建；
- 完整时间线拖拽编辑器；
- Windows / Linux 实现；
- 自动推导任意循环和业务分支；
- 微信真实消息发送；
- 静默 AI 自愈；
- 重写全部 `automation/` API。

## 五、目标目录与交付物

```text
apps/
└── recorder/
    ├── README.md
    ├── main.go
    └── internal/
        ├── sessionview/
        ├── traceview/
        └── runview/

pkg/
└── recorder/
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

schemas/
├── recorder-trace-v1.schema.json
├── recorder-flow-v1.schema.json
└── recorder-manifest-v1.schema.json

types/
└── recorder.d.ts

tests/
└── recorder/
    ├── fixtures/
    ├── model/
    ├── trace/
    ├── distill/
    ├── compiler/
    ├── replay/
    └── macos/

scripts/
└── test_recorder.sh
```

测试脚本生成的全部结果默认进入：

```text
.runtime/tests/recorder/<run-id>/
```

录制产品生成的全部结果默认进入：

```text
.runtime/recordings/<session-id>/
```

## 六、分阶段执行

### Phase 0：事实审计与基线

目标：先确认接入点，不急着创建大量代码。

任务：

- 重新读取执行时最新 `master` HEAD；
- 检查并保护并行修改；
- 审计 `pkg/execution`、`automation.InitJSWithOptions`、JS bindings、HTTP handler 与 `pkg/mcpserver`；
- 列出所有可变动作的真实入口；
- 确认哪些路径已有 EventSink，哪些路径绕过；
- 保存 macOS 环境和权限 preflight；
- 建立本轮 Claim / Evidence 边界。

Gate P0：

- 没有完整入口清单，不进入 Action Observer 集成；
- 没有固定 App 身份和权限证据，不运行 T3 桌面动作；
- 发现已有同主题实现时，优先扩展而不是重复创建。

### Phase 1：模型、Schema 与存储

目标：先固定可测试的数据契约。

任务：

- 定义 Session、ActionHint、ActionRequest、Observation、ActionResult、Verification、TraceEvent、Flow、Step、LocatorBundle、Variable；
- 定义 `observe / act / verify / recover / meta` 分类；
- 定义 schema version 和兼容策略；
- 建立 NDJSON append store、manifest 和原子化 finalization；
- 加入路径逃逸、重复 ID、损坏尾行和并发 append 测试；
- 加入 secret / redacted 规则。

Gate P1：

- Schema 校验通过；
- Raw Trace 可以在进程异常后保留已写入事件；
- 不允许图像大块直接内嵌 NDJSON；
- secret 不得出现在 Raw Trace、Flow 或生成 JavaScript 明文中。

### Phase 2：Session 与共享 Action Observer

目标：形成唯一动作观测入口。

任务：

- 实现 per-execution Recorder Session；
- 实现显式 MCP `recordingSessionId`；
- 实现 Action Observer Before / After；
- 将 recorder 内部观测标记为 internal，加入递归保护；
- 与 `pkg/execution.Emitter` 关联，但保持 TraceEvent 和普通 console RunEvent 的职责边界；
- 允许录制关闭时零或低开销旁路。

Gate P2：

- 两个并发 Session 不串线；
- stop 后不再接受动作；
- 同一动作恰好有一对 before/after 或明确的 incomplete 状态；
- Recorder 内部截图不能形成无限递归。

### Phase 3：接入 JS / HTTP / MCP

目标：覆盖 Agent 当前主要执行面。

任务：

- JavaScript 增加 runtime-local Recorder facade；
- HTTP ScriptRequest 可以携带 recorder options 或绑定 recorder session；
- MCP 增加 recorder.start / annotate / stop / status；
- MCP 可变动作接收可选 `recordingSessionId` 与 Action Hint；
- 统一记录 focus、click、type、press、hotkey、scroll；
- 不破坏未启用 Recorder 的旧脚本和 MCP 请求。

Gate P3：

- T1 证明三种 source 均生成统一 Trace contract；
- T2 证明 HTTP 与 MCP routing 正确；
- 不开启 Recorder 时旧行为和响应契约保持兼容；
- 相同语义动作不能因 source 不同生成三套不兼容模型。

### Phase 4：macOS Observation 与 Evidence

目标：为可变动作提供足以回溯的上下文。

任务：

- 记录活动应用、窗口、bounds、display 和 scale；
- 对可变动作执行 before / after 活动窗口截图；
- 加入 UI 稳定等待的有限实现；
- enriched 模式通过 AXUIElement 查询点击点元素；
- 读取允许的 role、subrole、title、description、identifier、value、enabled、focused、position、size 和受限上下文；
- 对密码和敏感控件隐藏 value；
- OCR / Vision 只作为可选增强，不作为每步硬依赖。

Gate P4：

- 权限缺失映射 F0，而不是 panic；
- 截图失败映射 F1 并保留动作结果；
- AX 不可用时回退到 standard evidence；
- 屏幕坐标、窗口坐标和截图坐标能够解释和复核。

### Phase 5：轨迹蒸馏、Flow 与 Compiler

目标：从执行历史生成可维护脚本。

第一批确定性规则：

```text
连续输入 → 一个 type/fill step
重复观察 → 从业务主路径删除
失败后成功回退 → 主 locator + fallback candidate
无状态变化重复动作 → 删除或标 warn
固定 sleep → waitFor 候选 + timeout 上限
具体输入值 → literal / variable / secret
错误路径回退 → Raw Trace 保留，Flow 主路径删除
```

输出：

```text
distilled/flow.json
distilled/variables.json
generated/flow.js
distilled/report.json
```

Gate P5：

- 每个 Flow Step 可追溯到一个或多个 Raw Action ID；
- 编译前必须通过 schema；
- 不能把观察调用直接编译成无意义业务步骤；
- AI 建议不能绕过确定性校验和 replay。

### Phase 6：Deterministic Replay 与验证

目标：证明 Agent 轨迹可以脱离 AI 重复运行。

任务：

- 实现逐步 replay；
- 支持 precondition、action、postcondition、timeout、safe stop；
- 第一版 locator 支持已录坐标、窗口相对坐标、AX role/name/identifier 和受控 fallback；
- 输出 replay trace、步骤结果、before/after 和 summary；
- 将失败映射到 F0-F10。

Gate P6：

- 至少一条 Agent 录制任务在关闭 AI 后完整回放成功；
- 强制找不到目标时必须安全停止；
- 不能仅凭动作 API 返回 nil 判断业务成功；
- 不允许错误候选点击后仍返回 pass。

### Phase 7：薄 Recorder App

目标：建立 `apps/recorder/` 产品入口，而不是先建设复杂编辑器。

首版界面只需要：

```text
当前 Session
来源与 Goal
动作数量
成功 / 失败 / incomplete 数量
Trace 路径
Distill 状态
生成脚本路径
Replay 结果
失败 Evidence 入口
```

Gate P7：

- UI 不包含第二套录制逻辑；
- 关闭 UI 不影响 Recorder 核心测试；
- 核心包可被 CLI、HTTP 和 MCP 独立调用。

### Phase 8：文档、API 与最终校准

任务：

- 根据真实实现更新 `docs/api/`；
- 更新 `types/recorder.d.ts`；
- 增加 apps README、运行与权限说明；
- 更新质量报告和 bounded Claim；
- 检查文档、源码、测试和 Evidence 一致性；
- 删除无价值临时 Prompt、日志和重复草稿。

Gate P8：

- 用户 API 只能以真实 runtime 行为为准；
- 没有 T3 Evidence 不声称 macOS 桌面闭环已通过；
- 一次应用成功不扩写为跨应用或 production-ready。

## 七、macOS 测试架构

### 7.1 测试层级

```text
T1：纯模型、存储、蒸馏、编译和 replay 单元测试
T2：JS / HTTP / MCP Adapter 与 Session routing 集成测试
T3：当前 macOS 主机上的受控真实桌面 smoke
T4：扰动、重复运行和失败注入回归
```

T1 / T2 尽量不依赖真实桌面，以便稳定运行。T3 / T4 必须记录当前机器、权限、显示器、应用和语言环境。

### 7.2 权限测试

MVP 前置：

```text
Accessibility
Screen Recording
```

条件性权限：

```text
Automation：仅 AppleEvents 场景
```

不作为 MVP 前置：

```text
Input Monitoring
```

至少测试：

1. 权限全部满足；
2. Screen Recording 被拒绝；
3. Accessibility 被拒绝；
4. 由 Terminal 与固定 `OpenDesk.app` 启动时主体差异；
5. 权限恢复后重新运行。

权限异常必须返回可诊断的 F0，不得出现无限等待或假 pass。

### 7.3 首批测试应用

#### A. 本地 HTML Recorder Benchmark

用途：提供可控真值和可重复扰动，是第一主场景。

单页至少包含：

```text
多个同类按钮
文本输入框
复选框
下拉框
可滚动列表
延迟出现元素
模态框
状态输出区
颜色 / 文本 / DOM 属性反馈
重排按钮
按钮改名
窗口尺寸变化
```

基础任务：

```text
输入唯一 token
选择一个选项
点击语义目标按钮
等待延迟结果
验证状态输出
```

扰动：

```text
改变窗口位置和尺寸
改变按钮顺序
轻微修改文案
增加同名或近似按钮
改变延迟
将绝对坐标整体偏移
```

即使页面运行在浏览器里，首轮可以先把它当作桌面窗口执行；后续再增加 DOM-aware adapter，并对比两者。

#### B. macOS Calculator

基础任务：

```text
计算 123 × 456
验证结果为 56088
```

测试变化：

```text
移动窗口
调整窗口尺寸（系统允许时）
重启应用
重复运行
改变初始显示内容
```

验证优先读取 Accessibility value；无法读取时才使用 OCR / screenshot evidence。

#### C. TextEdit

第一轮不保存正式文件，只做可撤销编辑：

```text
打开一个新的空白文档
输入唯一 token 和两行文本
全选
替换为另一段 token
从 Accessibility value 或等效证据验证
关闭时选择“不存储”
```

第二轮才增加保存到 `.runtime/tests/recorder/fixtures-output/` 并校验文件内容。

#### D. Finder read-only（可选晋级）

只允许：

```text
打开受控测试目录
切换视图
选择预先创建的 fixture 文件
读取选中项或窗口标题
```

首轮禁止删除、移动、覆盖和批量重命名。

### 7.4 Source 覆盖

同一基础任务至少覆盖：

```text
JavaScript-recorded → deterministic replay
MCP-recorded → deterministic replay
```

HTTP 与 JavaScript 共用 runner 时，可以用 T2 证明 routing；有条件再增加独立 T3。

### 7.5 失败注入

必须人为制造：

```text
目标不存在
候选不唯一
窗口不是前台
窗口尺寸变化
截图权限被拒绝
Accessibility 权限被拒绝
动作后状态没有变化
Raw Trace 尾行损坏
Session 已 stop 后继续写入
两个并发 Session
```

重点不是“自动修好所有错误”，而是：

```text
正确分类
安全停止
Evidence 完整
不误点
不假 pass
```

## 八、MVP 验收门槛

### 数据完整性

- 100% 可变动作具有 session、action、sequence、request 和 result；
- 可执行动作具有 before / after，或明确说明 observation failure；
- Flow 每一步可追溯 Raw Action；
- secret 明文泄露为 0；
- Recorder 自身观测递归事件为 0。

### 功能闭环

- HTML 基础任务 deterministic replay：10/10；
- HTML 扰动用例：至少 8/9 成功，错误目标点击为 0；
- Calculator：5/5；
- TextEdit：5/5；
- 强制失败用例：3/3 安全停止并输出正确 Failure Class；
- 至少一个 JavaScript-recorded 和一个 MCP-recorded 脚本在关闭 AI 后回放成功。

### 兼容性

- Recorder 关闭时原有 JS、HTTP、MCP 基础行为不回归；
- 已有 runtime-api 测试继续通过；
- 新 API 文档、类型定义和真实返回一致。

### 质量声明

允许：

```text
Agent-first Recorder MVP 的 T1 / T2 已通过
在当前 macOS 环境中，指定 HTML / Calculator / TextEdit 场景的 bounded T3/T4 已通过
```

不允许：

```text
通用 Recorder 已完成
所有 macOS 应用可稳定录制
脚本已经完全自愈
跨平台已支持
production ready
```

## 九、停止条件与降级策略

出现以下情况时停止扩大范围，先修复底层：

- Session 串线或 Action ID 不稳定；
- Evidence 无法与动作一一关联；
- Recorder 内部观测递归；
- 坐标体系无法解释；
- 权限主体漂移；
- 生成脚本误点目标；
- postcondition 大量假阳性；
- 没有 AI 时无法运行任何脚本；
- 为支持 UI 而复制核心逻辑；
- 需要大规模重构 `automation/` 才能完成最小闭环。

降级顺序：

```text
先保 Raw Trace
→ 再保 deterministic Flow
→ 再保基础坐标 + 窗口相对坐标 replay
→ enriched AX / Vision 后置
→ AI repair 最后增加
```

## 十、提交和交付策略

建议按可回滚的小批次提交：

```text
1. model + schema + store
2. session + action observer
3. JS / HTTP adapter
4. MCP adapter
5. macOS observation
6. distill + compiler
7. replay + verify
8. apps/recorder thin UI
9. tests + docs + evidence calibration
```

每批提交前：

- 重新读取当前 HEAD；
- 不覆盖用户或并行 Agent 修改；
- 运行该批最小测试；
- 记录真实 Evidence 路径；
- 不把 `.runtime/` 产物提交到版本库。

## 十一、执行入口

正式可复用执行提示词位于：

```text
prompts/automation/agent-first-recorder-macos-mvp-goal.md
```
