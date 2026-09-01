---
title: OpenDesk Agent-first Recorder MCP API
description: 显式录制会话、动作关联、证据验证、确定性提炼与 JavaScript 编译。
order: 16
---

# OpenDesk Agent-first Recorder

Recorder 当前以 MCP 为主要入口。每个会话都必须显式创建，不存在包级全局活动 Recorder。
会话产物写入 `.runtime/recordings/<session-id>/`，不得提交到版本控制。

## Recorder：生命周期工具

| 工具 | 用途 |
| --- | --- |
| `tm_recorder_start` | 创建会话并返回 `recordingSessionId` |
| `tm_recorder_annotate` | 关联结构化 goal / subgoal / intent 元数据 |
| `tm_recorder_status` | 返回当前 manifest 和产物路径 |
| `tm_recorder_verify` | 为指定 `actionId` 关联有证据支持的验证结果 |
| `tm_recorder_stop` | 停止会话；此后的业务写入会被拒绝 |
| `tm_recorder_distill` | 把不可变 Raw Trace 事件提炼为确定性的 Flow IR |
| `tm_recorder_compile` | 不经过 Agent / LLM 规划，生成 `generated/flow.js` |

可录制的动作工具接受 `recordingSessionId`、`executionId` 和 `recorderHint`。
`recorderHint` 可包含 `goal`、`subgoal`、`intent`、`targetDescription`、
`expectedPostconditions`、`risk`、`variableHints` 与 `recoveryReason`。

`tm_click` 可通过 `processId` 把 macOS AXPress 限定到指定 PID；`tm_type` 可通过
`processId` 把 macOS 文本控件输入限定到指定 PID。传入 `expectedWindowTitle` 时，两者仍会
执行严格的活动窗口守卫。

## Recorder：确定性回放契约

生成的 JavaScript 在执行原生桌面点击前要求获得新鲜的外部桌面状态，并验证权限、应用
bundle / 路径、唯一窗口、前台身份、AX role / action / label 与 postcondition。状态缺失或
过期、目标不唯一、验证失败都会停止执行；不会使用 AI 自动修复 locator，也不会降级为
全局坐标点击。
