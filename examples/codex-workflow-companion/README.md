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

Start `server.mjs` first. Configure Codex's MCP client with **stdio** command (absolute path preferred):

```json
{
  "mcpServers": {
    "opendesk-cwf": {
      "command": "node",
      "args": ["/ABSOLUTE/REPO/examples/codex-workflow-companion/mcp/server.mjs"]
    }
  }
}
```

Configure the equivalent MCP entry in your installed Codex version; the above describes stdio command/args and is not asserted as a universal Codex config format. Review the [Hook example](hooks/hooks.example.json) and **merge it**, rather than replacing trusted existing `.codex/hooks.json`. Hook scripts are advisory; they return `{ "continue": true }`. Hook parser requires an attempt-specific `OD-CWF/v1` prompt marker, the approved repository `cwd`, authenticated local delivery and bound `session_id`/`turn_id`. Stop never proves success alone.

MCP tools: `workflow_status` (read-only, no nonce), `task_claim`, `task_progress`, `task_submit`, `task_error`. Each mutating tool checks `workflowId`, `taskId`, `taskVersion`, `attemptId`, **nonce from the assigned prompt**, and `eventId`; the server additionally requires a real bound `UserPromptSubmit` Hook before claim. Invalid or stale attempts fail closed, while identical duplicate event IDs are idempotent and conflicting reuse is rejected. MCP tools cannot approve or schedule another task. `task_submit` produces **review pending** even if Codex reports `done`; a final Stop and a separate operator review are required except for the exact-output simulation-only verifier.

## Dispatch modes: do not conflate evidence

| `OD_CWF_MODE` | Behavior | What is **not** proven |
| --- | --- | --- |
| `simulate` (default) | Prepare a prompt; UI can generate labeled synthetic Hook/MCP events | Any real Codex run |
| `deeplink` | Construct `codex://threads/new?prompt=...`; operator opens a **draft** | That a prompt was sent or a turn completed |
| `native` | Single-shot preflight and OpenDesk Mac desktop action via `desktop/dispatch.js`; status stays `unknown` until verified | That Mac AX selectors, permissions, window focus, tap or actual send passed |
| `app-server` | Separate `codex app-server`: initialize → thread/start → turn/start; persisted hosted thread ID | That the created thread is visible in the running official desktop window |

The App Server mode is separately **managed execution**, not a desktop control backend. A `turn/completed` event is tracked as hosted status but **does not substitute** for Hook+MCP+review of a real desktop task. No local native mode is enabled unless `profile.json` has `confirmed:true` plus verified AX selectors and macOS preflight. `desktop/profile.example.json` intentionally ships as `confirmed:false`.

The native OpenDesk UI wrapper can be opened (only after React build, service start, and local host setup) from the repository root:

```sh
./dist/opendesk -ui -script examples/codex-workflow-companion/native-window.js -console-mode script
```

It loads the same `preview/index.html` inside `ui.createTrustedWindow`, and proxies status/actions through OpenDesk's trusted message bridge and authenticated local HTTP. It does not ask the browser page to obtain OpenDesk native globals. Its real-window, visual and functionality gates are **not completed here**.

## Technical checks and operational boundaries

Tests: `node --test tests/codex-workflow-companion/*.test.mjs` from the root. They cover A/B/C review gating, real HTTP service, real MCP stdio JSON-RPC, actual Python Hook forwarding into the HTTP service, sequence/nonce/session identity isolation, duplicate-event handling, stop-before-submit, pause/resume, error recovery, reserved-dispatch recovery, and a fake App Server protocol process. This is a **component and browser-capable environment** test matrix, not a real Mac/Codex integration test.

A full task editor, multi-project permissions, durable external side-effect outbox, web deployment, visual dashboard polishing and production App Server process supervision are deliberately deferred. The current demo keeps fixed A/B/C tasks to expose the execution contract before adding UI complexity. For the Mac phase use [LOCAL_ACCEPTANCE.md](LOCAL_ACCEPTANCE.md), and never use `exact-demo` outside synthetic simulation.
