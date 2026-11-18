# OD-CWF · OpenDesk Codex Workflow Companion (core technology demo)

**Goal:** Keep the official Codex desktop app as the place where users inspect and fix work. This example owns only an A → B → C handoff: single-writer durable task state, authenticated loopback Hook inlet, real stdio MCP tools, review gate and guarded next-task reservation. The React page is deliberately tiny; it is **not** a general task board or a replacement Codex client.

## Architecture and ownership

```
Codex UserPromptSubmit/Stop -> hooks/sender.py ----┐
Codex MCP client ----------> mcp/server.mjs -------┤ authenticated 127.0.0.1
React (local HTTP) / OpenDesk TrustedWindow --------┤
                                                  v
                                         server.mjs (single owner)
                                                  |
                             core/engine.mjs + atomic state.json
                                                  |
                              dispatch adapter (simulate/deeplink/native/app-server)
```

The legacy `examples/workflows/codex-hook-demo/` A→B demo is unchanged. The companion imports **only** its bounded `send_event()` Python transport; it supplies its own attempt-scoped protocol and source header. The React single-file build/TrustedWindow bridge follows `examples/ai-customer-support/`, without using customer-service business code. No OpenDesk Runtime or `docs/api` contract is changed.

## Run the core demo

Prerequisites: Node.js 22+, Python 3, and npm. **From the repository root:**

```sh
npm --prefix examples/codex-workflow-companion install
npm --prefix examples/codex-workflow-companion run typecheck
npm --prefix examples/codex-workflow-companion run build
npm --prefix examples/codex-workflow-companion test
OD_CWF_REVIEW=exact-demo node examples/codex-workflow-companion/server.mjs
```

Open the **actual URL printed after `CWF_READY`**, e.g. `http://127.0.0.1:<ephemeral-port>/`. Do not use an invented fixed port. Click **Start**, then **Simulate Hook + MCP + Stop** three times. Each click creates only synthetic messages, and `exact-demo` accepts **only** the fixed strings `OK-A`/`OK-B`/`OK-C` in `simulate` mode. This proves scheduler and service wiring, not official Codex execution. Set `OD_CWF_REVIEW=manual` (the default) to require operator approval. The same compiled React HTML serves the browser and the native TrustedWindow.

State, endpoint secrets and Hook bindings live under `.runtime/tests/codex-workflow-companion/` (mode 0700 directory, 0600 files). The server chooses a random loopback port and a random bearer token. Never commit or copy `endpoint.json`. `owner.lock` enforces one writer: after a crash, independently verify the process is stopped before clearing a stale lock; never clean `.runtime` indiscriminately. If a dispatch was reserved but no receipt saved, recovery marks it **unknown** and pauses; the operator must inspect Codex and supply reconciliation evidence. Existing state is not reset by restart or by switching environment flags.

## MCP connection and Codex Hooks

Start `server.mjs` first. For the official Codex version verified on this Mac, merge this **stdio** entry into `~/.codex/config.toml` (replace both absolute paths):

```toml
[mcp_servers.opendesk-cwf]
command = "node"
args = ["/ABSOLUTE/REPO/examples/codex-workflow-companion/mcp/server.mjs"]

[mcp_servers.opendesk-cwf.env]
OD_CWF_STATE_DIR = "/ABSOLUTE/REPO/.runtime/tests/codex-workflow-companion"
```

Review the [Hook example](hooks/hooks.example.json) and **merge it**, rather than replacing existing `~/.codex/hooks.json`. Use an absolute Python script path. If using a custom state directory, prefix **both** Hook commands with `OD_CWF_STATE_DIR="/ABSOLUTE/STATE/DIR"`; owner, native window, MCP and Hooks must all use the same directory. Reload MCP in Codex and review/trust the new Hook definitions in its official UI. A configured or enabled Hook may still be **untrusted** and does not prove delivery. Do not edit trust hashes to bypass that review. See the official [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) and [Hook trust](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks) contracts.

Hook scripts are advisory; they return `{ "continue": true }`. The parser requires an attempt-specific `OD-CWF/v1` prompt marker, a nonempty absolute repository `cwd`, authenticated local delivery and real `session_id`/`turn_id`. Rejected marked events emit a bounded reason code, without printing prompts or credentials. Stop never proves success alone. MCP and the native window reread the endpoint after owner restart; an uncertain mutating call is never automatically replayed.

MCP tools: `workflow_status` (read-only, no nonce), `task_claim`, `task_progress`, `task_submit`, `task_error`. Each mutating tool checks `workflowId`, `taskId`, `taskVersion`, `attemptId`, **nonce from the assigned prompt**, and `eventId`; the server additionally requires a real bound `UserPromptSubmit` Hook before claim. Invalid or stale attempts fail closed, while identical duplicate event IDs are idempotent and conflicting reuse is rejected. MCP tools cannot approve or schedule another task. `task_submit` produces **review pending** even if Codex reports `done`; a final Stop and a separate operator review are required except for the exact-output simulation-only verifier.

This is a **local trusted demo**. The MCP tool list separates agent operations from operator actions at the protocol level; it is not an isolation boundary against a same-UID script that can read the private bearer file. That bearer also authorizes operator routes. The browser UI token is served by the local owner. Neither mechanism establishes production authentication, multiuser authorization or network isolation. Do not expose this service beyond the trusted local session.

## Dispatch modes: do not conflate evidence

| `OD_CWF_MODE` | Behavior | What is **not** proven |
| --- | --- | --- |
| `simulate` (default) | Prepare a prompt; UI can generate labeled synthetic Hook/MCP events | Any real Codex run |
| `deeplink` | Construct `codex://threads/new?prompt=...`; operator opens a **draft** | That a prompt was sent or a turn completed |
| `native` | Single-shot preflight and OpenDesk Mac desktop action via `desktop/dispatch.js`; status stays `unknown` until verified | That Mac AX selectors, permissions, window focus, tap or actual send passed |
| `app-server` | Separate `codex app-server`: initialize → thread/start → turn/start; persisted hosted thread ID | That the created thread is visible in the running official desktop window |

The App Server mode is separately **managed execution**, not a desktop control backend. A `turn/completed` event is tracked as hosted status but **does not substitute** for Hook+MCP+review of a real desktop task. No local native mode is enabled unless `profile.json` has `confirmed:true` plus verified AX selectors and macOS preflight. `desktop/profile.example.json` intentionally ships as `confirmed:false`.

The 2026-11-10 follow-up ran the existing `appServerTurn` adapter against the official embedded CLI and a real model: `thread/start` → `turn/start` → `turn/completed`, with the exact requested output `OD_CWF_HOSTED_CHECK`. This isolated one-turn probe requested a plain-text response without Companion identity and granted no additional approvals. It proves managed model execution, not a complete hosted Hook/MCP/review workflow or desktop visibility. Its child process was stopped after completion.

The native OpenDesk UI wrapper can be opened (only after React build, service start, and local host setup) from the repository root:

```sh
./dist/opendesk -ui -script examples/codex-workflow-companion/native-window.js -console-mode script
```

It loads the same `preview/index.html` inside `ui.createTrustedWindow`, and proxies status/actions through OpenDesk's trusted message bridge and authenticated local HTTP. It does not ask the browser page to obtain OpenDesk native globals. The UI receives the last 12 event headings, preserving the durable audit separately, so long progress messages cannot overflow the 64 KiB native bridge. Manual review/retry evidence starts empty for each attempt. Owner outages are shown and the same window reconnects after port/token rotation.

The 2026-11-10 run verified real browser/native windows, manual simulation review, pause/resume, error/retry and native reconnect. **Official desktop A→B→C remains BLOCKED**: the session's computer-control tool refused access to `com.openai.codex`; the new official Hooks are also still untrusted. An official embedded Codex MCP client called all five tools successfully with a synthetic Hook fixture, which does **not** prove desktop execution. See [the actual acceptance record](LOCAL_ACCEPTANCE.md).

The follow-up verified that the current official Codex chat actually loads `opendesk-cwf`: its native `workflow_status` tool successfully reads the prepared owner before and after a controlled owner port/credential rotation. The workflow/attempt and disk bytes stayed unchanged. Final companion typecheck/build and 100 tests pass; the current native wrapper was reloaded and visually checked against the preserved simulation owner. The wrapper serializes refreshes, drops old-owner responses, separates accepted actions from bridge errors, and reports a lost mutating response as **unknown / do not repeat**, with read-only refresh only. Within the active attempt, identical progress/submit events remain idempotent even after submission or restart. Current desktop control is still explicitly denied and both companion Hooks remain untrusted; no actual A/B/C was sent.

## Technical checks and operational boundaries

Tests: `node --test tests/codex-workflow-companion/*.test.mjs` from the root. They cover A/B/C review gating, real HTTP service, real MCP stdio JSON-RPC, actual Python Hook forwarding into the HTTP service, sequence/nonce/session identity isolation, duplicate-event handling, stop-before-submit, pause/resume, error recovery, reserved-dispatch recovery, and a fake App Server protocol process. This is a **component and browser-capable environment** test matrix, not a real Mac/Codex integration test.

A full task editor, multi-project permissions, durable external side-effect outbox, web deployment, visual dashboard polishing and production App Server process supervision are deliberately deferred. The current demo keeps fixed A/B/C tasks to expose the execution contract before adding UI complexity. For the Mac phase use [LOCAL_ACCEPTANCE.md](LOCAL_ACCEPTANCE.md), and never use `exact-demo` outside synthetic simulation.

Persistence is bounded to 1 MiB of UTF-8 JSON, using the same limit for read and write. Overflow is rejected before replacing the previous state; history/dedup are not discarded to make space. Any failed state write poisons the owner and stops dispatch until restart and disk reconciliation. Restart recovers an uncertain reservation as paused/unknown. Unknown dispatches cannot be resumed or approved before explicit reconciliation. `not_sent` cannot discard a bound/claimed attempt; native unknown delivery also requires a private, attempt-bound child-close receipt. A missing receipt after a crash stays blocked rather than authorizing another send. Exhausting the demo's capacity needs operator investigation; it is not an automatic history-rotation feature.

Native child-close receipts currently depend on the owner surviving until that callback. If the owner exits first, a later child exit may leave no stopped evidence and no supported independent recovery path. This is an unresolved recovery limitation: the demo fails closed, and real desktop crash/recovery acceptance remains unproven.
