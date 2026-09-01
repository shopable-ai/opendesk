---
title: OpenDesk Agent-first Recorder MCP API
description: Explicit session control, action association, distillation, and deterministic compilation.
---

# OpenDesk Agent-first Recorder

Recorder is currently MCP-first. Every session is explicit; there is no
package-global active recorder. Session artifacts are stored under
`.runtime/recordings/<session-id>/` and must not be committed.

## Lifecycle tools

| Tool | Purpose |
| --- | --- |
| `tm_recorder_start` | Start a session and return `recordingSessionId` |
| `tm_recorder_annotate` | Attach structured goal/subgoal/intent metadata |
| `tm_recorder_status` | Return the current manifest and artifact paths |
| `tm_recorder_verify` | Attach evidence-backed verification to an `actionId` |
| `tm_recorder_stop` | Stop the session; later business writes are rejected |
| `tm_recorder_distill` | Convert immutable Raw Trace events to deterministic Flow IR |
| `tm_recorder_compile` | Generate `generated/flow.js` with no Agent/LLM planning |

Recordable action tools accept `recordingSessionId`, `executionId`, and a
`recorderHint` containing `goal`, `subgoal`, `intent`, `targetDescription`,
`expectedPostconditions`, `risk`, `variableHints`, and `recoveryReason`.

`tm_click` accepts `processId` for PID-scoped macOS AXPress. `tm_type` accepts
`processId` for PID-scoped macOS text-control insertion. Both retain the exact
active-window guard when `expectedWindowTitle` is provided.

## Deterministic replay contract

Generated JavaScript requires fresh external desktop state for native desktop
clicks. It verifies permission, application bundle/path, unique window,
foreground identity, AX role/action/label, and postconditions. Missing or stale
state, ambiguity, and verification failures stop execution; no AI locator
repair or global-click fallback is performed.
