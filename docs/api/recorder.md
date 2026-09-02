---
title: Agent-first Recorder MCP API
description: 显式录制会话、动作关联、证据验证、确定性提炼与 JavaScript 编译。
order: 16
---

# Agent-first Recorder

Recorder 当前以 MCP 为主要入口。每个会话都必须显式创建，不存在包级全局活动 Recorder。
会话产物写入 `.runtime/recordings/<session-id>/`，不得提交到版本控制。

## Recorder：生命周期工具

| 工具 | 必填参数 | 可选参数 | 成功返回 |
| --- | --- | --- | --- |
| `tm_recorder_start` | `goal` | `executionId`、`recordingSessionId`、`observationPolicy` | `recordingSessionId`、`executionId`、`state`、`paths` |
| `tm_recorder_annotate` | `recordingSessionId`、`hint` | `executionId`、`fields` | `eventId`、`sequence` |
| `tm_recorder_status` | `recordingSessionId` | — | `manifest` |
| `tm_recorder_verify` | `recordingSessionId`、`actionId`、`verification` | `executionId` | `eventId`、`sequence` |
| `tm_recorder_stop` | `recordingSessionId` | — | `recordingSessionId`、`state`、`manifest` |
| `tm_recorder_distill` | `recordingSessionId` | — | `flow`、`report` |
| `tm_recorder_compile` | `recordingSessionId` | `replayConfigPath` | `mode: "deterministic"`、`usesAI: false`、生成文件信息 |

`tm_recorder_start` 的 `observationPolicy` 只能为 `minimal`、`standard` 或 `enriched`，省略时使用 `standard`。会话 id 必须来自 start 的返回值，并传给后续每个 Recorder 工具。

可录制的动作工具接受 `recordingSessionId`、`executionId` 和 `recorderHint`。
`recorderHint` 可包含 `goal`、`subgoal`、`intent`、`targetDescription`、
`expectedPostconditions`、`risk`、`variableHints` 与 `recoveryReason`。

`tm_recorder_annotate` 的 `hint` 与可录制动作的 `recorderHint` 使用相同语义。`fields` 只能携带附加的结构化元数据，不能替代 `hint` 中的目标、意图和后置条件。

`tm_recorder_verify` 的 `verification` 必须有 `status`，其值为 `pass`、`warn`、`fail` 或 `unknown`；可附加 `postconditions`、`actual`、`evidenceRefs`、`failureClass` 与 `message`。只有与具体 `actionId` 关联的可验证事实才能作为通过依据。

## Recorder：最小 MCP 调用顺序

以下是工具调用顺序，不是需要手工执行的 shell 命令：

```text
tm_recorder_start({ goal })
→ 调用一个可录制动作工具，并传入 recordingSessionId
→ tm_recorder_verify({ recordingSessionId, actionId, verification: { status: "pass", ... } })
→ tm_recorder_stop({ recordingSessionId })
→ tm_recorder_distill({ recordingSessionId })
→ tm_recorder_compile({ recordingSessionId })
```

例如，start 的最小输入为：

```json
{
  "goal": "在目标应用完成并验证一个可重复的操作",
  "observationPolicy": "standard"
}
```

停止前不可 distill 或 compile；停止后不能再写入业务动作或 annotation。`tm_recorder_compile` 只编译已提炼的 Flow IR，不调用 Agent 或 LLM 进行定位、补救或规划。

`tm_click` 可通过 `processId` 把 macOS AXPress 限定到指定 PID；`tm_type` 可通过
`processId` 把 macOS 文本控件输入限定到指定 PID。传入 `expectedWindowTitle` 时，两者仍会
执行严格的活动窗口守卫。

## Recorder：确定性回放契约

生成的 JavaScript 在执行原生桌面点击前要求获得新鲜的外部桌面状态，并验证权限、应用
bundle / 路径、唯一窗口、前台身份、AX role / action / label 与 postcondition。状态缺失或
过期、目标不唯一、验证失败都会停止执行；不会使用 AI 自动修复 locator，也不会降级为
全局坐标点击。
