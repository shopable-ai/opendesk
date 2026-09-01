# OpenDesk Agent-first Recorder: macOS Calculator vertical slice

Date: 2026-09-01 (Asia/Shanghai)

## Verdict

```text
MCP_READY_FOR_RECORDER=true
RECORDER_VERTICAL_SLICE=PASS
DETERMINISTIC_REPLAY=PASS
WRONG_TARGET_CLICK_COUNT=0
```

Independent quality verdicts:

- Recorder Fidelity: **PASS**
- Distillation Precision: **PASS**
- Replay Robustness: **PASS**

This verdict is based on current-run evidence under
`.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/` and current
Recorder sessions under `.runtime/recordings/`. Prior MCP or Calculator runs
were not substituted for this evidence.

## Current environment and MCP gate

- Repository: `/Users/mac/Documents/workspace/clawdesk`
- Branch: `master`; no branch was created or switched.
- HEAD: `51e6000b615b4dc67eef49655a2951e9b38d12df`
- `origin/master`: `e7606aa784eae4c59d847e1cdb053853e1ba6ecd`
- Ahead/behind (`origin/master...HEAD`): `0 1`
- Current binary: `dist/opendesk-mcp`
- Binary SHA-256: `ceacdbdd14c129d78e4b3ea3da831b65126a37427df8537421faee1b76910772`
- Current-binary stdio smoke: 3/3 passed, 3/3 clean exits, 32 stable
  tools, zero timeout, panic, non-JSON stdout, protocol violation, or
  unexpected stdout.
- Codex Host live gate: status ok; Screen Recording and Accessibility true;
  Calculator PID 47026 was the unique foreground Calculator window at
  `(1200,150,232,321)` on one `1920x1080` display.

Evidence:

- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/mcp-current-binary-final/stdio-smoke-summary.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/mcp-live-final/summary.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/calculator-final-v2/codex-host-final.png`

## Controlled HTML benchmark

The live Agent Run used Safari and current OpenDesk MCP desktop actions against
the controlled local page. The final state was token
`recorder-56088`, route `beta`, checked confirmation, `scrollTop=240`, and
delayed status `complete:recorder-56088:beta`.

- Session: `rec-20260831T194223.239175000Z-d05e96aa`
- Raw Trace: 18 events; 5 completed actions; 6 internal observations;
  internal recursion 0.
- Flow IR: 5 steps and 5 source action references; no failed action removed.
- Generated JS: no Agent, Codex, LLM, or AI locator-repair call.
- Independent fresh Safari module replay: passed with the complete expected
  DOM state, including the delayed postcondition.

Evidence:

- `.runtime/recordings/rec-20260831T194223.239175000Z-d05e96aa/raw/events.ndjson`
- `.runtime/recordings/rec-20260831T194223.239175000Z-d05e96aa/distilled/flow.json`
- `.runtime/recordings/rec-20260831T194223.239175000Z-d05e96aa/generated/flow.js`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/html-deterministic-replay/replay-result.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/html-deterministic-replay/final.png`

## Calculator Agent Run and Recorder Fidelity

The final Agent Run started from a previously contaminated Calculator state and
performed two intentional reset actions followed by the real button sequence
`1`, `2`, `3`, `×`, `4`, `5`, `6`, `=`. Each click used fresh window-derived
coordinates and PID-scoped AXPress. No global coordinate fallback was used.

- Session: `rec-20260831T202346.031873000Z-438b6ac8`
- Raw Trace: 52 strict-sequence events.
- Business actions: 10; evidence-backed verification passes: 10.
- Internal observations: 20; all have `parentActionId`; recursion count 0.
- Before/after screenshots: 20; before/after window snapshots: 20.
- Secret plaintext leaks: 0.
- Final normalized display: `56088`.
- Raw Trace SHA-256:
  `f23f08c0040410e82ea29a29eea39027655d42d98e19aa9edb3d19a63e2f6d27`.

This is Recorder Fidelity **PASS**: goal/subgoal/intent, actual tool request and
result, before/after observations, target locator evidence, duration,
postcondition, and evidence references are associated by explicit
`recordingSessionId`, `executionId`, `actionId`, and sequence.

Evidence:

- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/calculator-agent-attempt3/agent-run-summary.json`
- `.runtime/recordings/rec-20260831T202346.031873000Z-438b6ac8/manifest.json`
- `.runtime/recordings/rec-20260831T202346.031873000Z-438b6ac8/raw/events.ndjson`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/calculator-final-v2/final.png`

## Distillation Precision

The final Calculator distillation produced 10 steps from 10 completed actions,
removed 20 internal observations, removed zero failed or no-state-change
actions, and emitted no warnings. Every step has non-empty `sourceActionIds`;
every Calculator step has an explicit `displayEquals` postcondition. Recorded
absolute points remain evidence, while deterministic execution resolves the
current AX target from fresh state.

Flow SHA-256:
`9e53984c5b9ffd7504aba7c4ae8802101891777a5278faa603ab68136339a853`.

This is Distillation Precision **PASS**. The earlier single-Clear flow was not
accepted: a current replay exposed retained Calculator operation context and
produced `25576128`. The final session records two distinct reset intents, so
the correction is present in Raw Trace and Flow IR instead of being an
unrecorded replay repair.

Evidence:

- `.runtime/recordings/rec-20260831T202346.031873000Z-438b6ac8/distilled/report.json`
- `.runtime/recordings/rec-20260831T202346.031873000Z-438b6ac8/distilled/flow.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/calculator-final-regression/`

## Deterministic replay and robustness

The generated script SHA-256 is
`b3e45205b0c1ade330a8c18adf7e56d2bb10fd696376c1b196c4b81dd41b8f0a`.
It ran through `dist/opendesk` with Agent planning disabled and no Codex, LLM,
natural-language planning, or AI locator repair.

- Original environment: 3/3 passed, 10/10 steps per run.
- Window relocation: passed after moving Calculator to `(1500,100)`; all hit
  points were recomputed from the fresh window.
- Application restart: passed after PID changed from 20808 to 47026.
- Initial-state drift: passed from the retained/pending-operation state that
  caused the obsolete one-Clear flow to fail.
- Final clean regression: passed with display `56088`.

Nine failure injections all stopped safely and produced the expected primary
classes: three F0, one F1, four F4, and one F6. They cover Calculator missing,
wrong foreground window, target unavailable, manually wrong locator, ambiguous
target, missing state, Screen Recording missing, Accessibility missing, and a
postcondition failure. The F6 case executed one correct Clear and stopped
before step 2. Total wrong-target clicks remained 0.

This is Replay Robustness **PASS**.

Evidence:

- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/calculator-replay-v2-original/summary.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/calculator-replay-v2-moved/replay-report.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/calculator-replay-v2-restarted/replay-report.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/calculator-replay-v2-pending-drift/replay-report.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/calculator-failure-injection-v2/summary.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/calculator-final-v2/replay-report.json`

## TextEdit smoke

After the Calculator Gate passed, an isolated new TextEdit PID with one blank
untitled document was recorded. PID-scoped text insertion wrote a unique token
and two lines, `cmd+a` selected all content, replacement text was verified by
exact AXTextArea readback, and the save sheet was closed with discard. No user
file was opened or saved.

- Session: `rec-20260831T204803.219996000Z-7dfa68bf`
- Raw Trace: 39 events; 9 actions; 18 internal observations; recursion 0.
- Distillation: 5 steps; four adjacent semantic type actions merged; replacement
  verification retained.
- Wrong-target clicks: 0.

Evidence:

- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/textedit-smoke-attempt6/summary.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/textedit-smoke-attempt6/after-replacement.json`
- `.runtime/tests/recorder/20260831T190450Z-agent-first-recorder/textedit-smoke-attempt6/after-close.json`
- `.runtime/recordings/rec-20260831T204803.219996000Z-7dfa68bf/raw/events.ndjson`

## Regression and known boundaries

Passed:

- `go test ./pkg/recorder ./pkg/mcpserver ./automation ./apps/recorder ./tests/recorder/tools/...`
- `scripts/test_recorder.sh`
- current-binary stdio smoke 3/3
- schemas parse and model-required-field contract test
- real HTML, Calculator, failure-injection, and TextEdit runs described above

`go test ./...` passed all packages except four pre-existing/unrelated
`pkg/visionrun` tests that require absent `.runtime/temp` WeChat reports,
capture contracts, or `.runtime/preflight/current/latest.json`. Recorder,
automation, MCP, execution, HTTP, runtime, and all other packages passed. The
unrelated worktree was not altered to synthesize those missing artifacts.

This MVP is MCP-first. It is not a complete manual-input Recorder, CGEventTap
recorder, cross-platform workflow designer, or silent AI recovery system.
General production JS/HTTP Recorder control planes remain future expansion;
the controlled HTML harness exercised HTTP-to-core recording, while the
accepted desktop chain and lifecycle use current OpenDesk MCP.

No commit, branch, push, history rewrite, bulk staging, or worktree cleanup was
performed. Final HEAD remains
`51e6000b615b4dc67eef49655a2951e9b38d12df`.
