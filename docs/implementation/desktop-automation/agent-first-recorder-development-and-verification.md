# Agent-first Recorder 文档驱动开发与准确性验证

## 状态与目的

本文是 OpenDesk Agent-first Recorder 的开发和验收契约。它不替代架构决策、
MVP 计划或某次运行的质量报告，而是定义新增应用场景时必须如何设计 benchmark、
如何区分录制与回放准确性，以及什么证据足以给出 `PASS`。

相关文档：

- [架构决策与核心模型](../../architecture/desktop-automation/agent-first-recorder.md)
- [macOS MVP 执行计划](../../plans/desktop-automation/agent-first-recorder-macos-mvp.md)
- [Recorder MCP API](../../../docs/api/recorder.md)
- [Calculator 首次垂直闭环质量报告](../../quality/recorder/2026-09-01-agent-first-recorder-calculator-vertical-slice.md)

## 一、准确性结论必须拆开

Recorder 不得用“脚本执行完成”代表准确。每次正式验收必须分别给出：

```text
Recorder Fidelity       录制是否忠实反映真实动作
Distillation Precision  Flow 是否保留必要语义且没有发明动作
Replay Robustness       无 AI 回放能否在允许的环境变化下复现结果
Safety                  错误目标点击和 false pass 是否为 0
```

只有四项均有独立 Evidence 支撑时，受测场景才可以报告 `PASS`。一个应用的
`PASS` 不能外推为所有 macOS 软件通用。

## 二、四层工件与权威关系

```text
Agent 真实动作
  ↓
immutable Raw Trace          发生过什么
  ↓
distilled Flow IR            哪些动作构成稳定业务路径
  ↓
generated/flow.js            可读、可执行的确定性派生产物
  ↓
independent Oracle/Evidence  是否点对目标并达到语义结果
```

权威顺序：

```text
外部可观察状态和动作前后 Evidence
> 实际 Tool 请求、结果与错误
> Agent 提供的结构化 intent / target / postcondition
> 自然语言说明
```

Raw Trace 是不可变事实源；Flow IR 是脚本的权威源；`generated/flow.js` 可以
重新生成。回放报告不能作为自己的唯一判定依据，必须有独立 Oracle。

一次录制的默认目录：

```text
.runtime/recordings/<session-id>/
├── manifest.json
├── raw/events.ndjson
├── observations/
├── distilled/flow.json
├── distilled/report.json
├── distilled/variables.json
└── generated/
    ├── flow.js
    └── replay-config.json
```

`.runtime/` 是运行 Evidence，不进入版本控制。可维护源码、Schema、测试工具和
本文档才进入版本控制。

## 三、Recorder Fidelity 验证契约

每个可变动作至少需要：

- 显式 `recordingSessionId`、`executionId`、`actionId` 和严格递增 sequence；
- goal、subgoal、intent、target、risk 和 expected postconditions；
- 实际调用名、参数、返回结果、错误和耗时；
- 动作前后窗口身份、PID、边界和前台状态；
- 标准策略下的前后截图及窗口快照，或明确的 observation failure；
- 基于外部状态的 verification 与 Evidence 引用。

Recorder 自己触发的截图、AX 查询等 observation 必须满足：

```text
origin=recorder
internal=true
parentActionId=<business-action-id>
```

内部 observation 可以进入 Raw Trace，但不得再次触发录制，也不得编译为业务
步骤。验收时要求：

```text
action_capture_recall = recorded_business_actions / executed_business_actions = 1
unlinked_business_actions = 0
internal_recursion_count = 0
plaintext_secret_leaks = 0
```

## 四、Distillation Precision 验证契约

每个 Flow step 必须具有非空 `sourceActionIds`，并能回查 Raw Trace。蒸馏允许：

- 删除纯 observation；
- 合并语义连续的输入或滚动；
- 将固定等待转换为有 timeout 的状态等待；
- 将已验证的定位尝试整理为 locator bundle。

蒸馏不得：

- 发明 Raw Trace 中不存在的业务动作；
- 删除初始化、清理、窗口切换或状态恢复所需动作；
- 把失败动作静默变为成功动作；
- 丢失 postcondition、risk 或动作来源；
- 把回放时的人工补偿变成未录制的隐藏修复。

验收指标：

```text
step_provenance_coverage = traced_flow_steps / all_flow_steps = 1
invented_action_count = 0
unexplained_removed_action_count = 0
critical_postcondition_coverage = 1
```

删除和合并必须记录在 `distilled/report.json`。如果回放暴露缺少必要动作，应重新
进行真实 Agent Run，并让修复出现在新的 Raw Trace 中，而不是只修改生成脚本。

## 五、Deterministic Replay 契约

确定性回放必须：

- 执行实际 `generated/flow.js`；
- 关闭 Codex、LLM、Agent planner 和自然语言 locator repair；
- 使用 fresh external state，不复用首次 Agent Run 的内存判断；
- 每步按 `precondition → resolve target → action → postcondition` 执行；
- 缺权限、状态过期、目标缺失或歧义时安全停止；
- 禁止全局坐标兜底、补偿点击和“最终看起来正确”式修复；
- 保存逐步结果、failure class、最终状态和 `wrongTargetClicks`。

桌面点击前至少验证：

```text
Accessibility 与 Screen Recording 权限
应用 bundle ID 和 bundle path
当前 PID 与唯一目标窗口
前台窗口和 executable identity
fresh state timestamp
hit-test 元素属于当前 PID
AX role、label 和 AXPress capability
```

点击后由独立 Oracle 轮询语义 postcondition；不以 action 返回的 `ok: true` 作为
状态成功。例如 Calculator 必须读取并标准化 AX display，再判断：

```text
normalize(display) == "56088"
```

## 六、Oracle 必须独立于执行器

执行器负责产生动作；Oracle 负责观察结果。两者使用相同的成功变量或让回放脚本
直接写入预期结果，会形成自证循环。

按优先级选择 Oracle：

1. 业务只读 API、服务端状态、生成文件内容或哈希；
2. DOM、URL、原生 Accessibility value/state；
3. 独立进程读取的应用状态；
4. OCR、局部图像和像素特征的组合；
5. 人工确认。

纯截图只能证明视觉外观，不能单独证明隐藏业务状态。Canvas、游戏、远程桌面、
视频和 AX 缺失应用如果没有更强 Oracle，必须报告 `PARTIAL`，不能宣称语义准确。

每个 benchmark 在实现前必须写清：

```text
Goal
Initial-state policy
Allowed mutations
Target identity
Step postconditions
Final semantic Oracle
Perturbation matrix
Negative/failure injections
Cleanup policy
Evidence paths
PASS / PARTIAL / FAIL rules
```

## 七、标准测试矩阵

### T1：模型和契约

- Schema、存储、session 隔离、stop 后拒绝写入；
- Raw Trace 尾行损坏恢复；
- secret 递归脱敏；
- internal observation 递归保护；
- distill 合并和 provenance；
- compiler 确定性与无 AI 检查；
- ambiguous target 在动作前停止。

正式入口：

```bash
./dist/opendesk -script scripts/test_recorder.js -console-mode script
```

该 OpenDesk Runtime JS gate 验证 contract 和 integration，不等于真实桌面 replay；旧
`scripts/test_recorder.sh` 已由同名 JS 入口取代。

### T2：受控真值 Benchmark

先使用本地 HTML 页面，通过 DOM 和服务端状态得到强真值。改变按钮顺序、窗口大小、
文本和延迟，确认定位器不是记住一次性绝对坐标。

### T3：真实桌面闭环

在固定低风险任务上完成：

```text
Agent Run
→ Raw Trace
→ Distill
→ Compile
→ fresh no-AI replay
→ external semantic verification
```

### T4：重复、扰动和失败注入

至少覆盖：

- 原环境重复 3 次；
- 移动窗口；
- 重启应用并改变 PID；
- 改变允许范围内的初始状态；
- 权限缺失、目标缺失、错误前台窗口；
- locator 错误、目标歧义、postcondition 失败；
- stale/missing observer state。

失败测试的目标不是自动修好，而是正确分类、保存 Evidence、动作前停止，并保持
`wrong_target_click_count = 0`。

## 八、判定与指标

正式报告至少输出：

```text
RECORDER_FIDELITY=PASS|FAIL
DISTILLATION_PRECISION=PASS|FAIL
DETERMINISTIC_REPLAY=PASS|FAIL
REPLAY_ROBUSTNESS=PASS|PARTIAL|FAIL
SEMANTIC_POSTCONDITION=PASS|FAIL
WRONG_TARGET_CLICK_COUNT=<number>
FALSE_PASS_COUNT=<number>
UNOBSERVABLE_STATE_COUNT=<number>
```

其中 false pass 指执行器报告成功，但独立 Oracle 判断目标或状态错误。正式 Gate
要求：

```text
wrong_target_click_count = 0
false_pass_count = 0
```

重复 3/3 是工程回归 Gate，不代表统计学上证明通用可靠性。报告必须列出已覆盖的
应用、环境和扰动，不得扩大结论。

## 九、文档驱动开发流程

新增应用或动作类型按以下顺序推进：

1. 先提交或评审 benchmark contract，明确 Oracle 和禁止动作；
2. 准备受控 fixture、只读 observer 和清理策略；
3. 实现或扩展 Recorder Adapter、Schema、Distiller、Compiler；
4. 运行 T1/T2，保存新的 `.runtime/tests/recorder/<run-id>/` Evidence；
5. 进行真实 Agent Run，不手工修补 Raw Trace；
6. 审计 Raw Trace 与 Flow provenance；
7. 在无 AI 环境执行生成脚本；
8. 运行重复、扰动和失败注入矩阵；
9. 分别给出 Fidelity、Distillation、Replay 和 Safety Verdict；
10. 将稳定实现、测试资产和正式质量报告纳入版本控制，运行产物留在 `.runtime/`。

如果某软件无法建立独立语义 Oracle，应在第 1 步明确降级为视觉 smoke 或人工验收，
而不是在回放之后把“没有观察到错误”解释为成功。

## 十、当前 Calculator 参考实例

当前通过的 Calculator 会话为：

```text
.runtime/recordings/rec-20260831T202346.031873000Z-438b6ac8/
```

建议按以下顺序阅读：

```text
manifest.json
raw/events.ndjson
distilled/report.json
distilled/flow.json
generated/flow.js
generated/replay-config.json
```

质量结论和当前 Evidence 位置以
[Calculator 首次垂直闭环质量报告](../../quality/recorder/2026-09-01-agent-first-recorder-calculator-vertical-slice.md)
为准。`replay-config.json` 引用的是一次运行的 live watcher 和报告路径，可能随时间
失效；直接重跑旧脚本时，fresh-state 检查应以 F1 安全停止，而不是绕过检查。
