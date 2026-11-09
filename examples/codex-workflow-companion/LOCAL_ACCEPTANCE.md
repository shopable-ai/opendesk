# Codex Workflow Companion — phase 2 Mac/Codex acceptance (NOT YET EXECUTED)

This checklist is for a trusted operator using the **actual official Codex desktop app** on macOS. It is not evidence that any of the steps below have passed. Do not remove or overwrite existing Hooks, `owner.lock` or `.runtime` state.

## Prerequisites and setup

1. From repository root inspect `git status`, current `master`, the latest pushed commit, `AGENTS.md` and concurrent changes. Run phase-1 Node test/typecheck/build commands in README.
2. Install/verify official Codex app, active workspace and its current Hook/MCP configuration. Merge `hooks/hooks.example.json` into the existing trusted Hook config, after reviewing Python command and project path. Configure the MCP stdio server with the actual absolute file path and confirm `tools/list` in Codex.
3. Start `node examples/codex-workflow-companion/server.mjs` with `OD_CWF_MODE=deeplink`, `OD_CWF_REVIEW=manual` for initial non-sending tests. Confirm local endpoint file is owner-only. Open printed browser URL. Do not start a second owner.
4. For native mode **separately** verify Accessibility/Screen Recording permissions, stable installed OpenDesk executable/provenance and the Codex app's exact AX selectors. Copy `desktop/profile.example.json` to `.runtime/tests/codex-workflow-companion/profile.json`, replace each `REPLACE_` selector based on live evidence and only then set `confirmed:true`. Check that the fresh-thread indicator is actually absent in the existing session and uniquely present after creating a fresh thread. No button labels or Cmd+N action may be assumed without measured evidence.

## Evidence gates (each independent)

- **Phase A — React + HTTP:** Browser page is actually loaded from this run's Node owner; create A; pause; resume; inspect task/revision, bound details and recent history. Record actual browser capture and action readback. `simulate` events must be visibly labeled synthetic.
- **Phase B — Hook:** In official Codex open the A deep link, inspect the draft, and **manually submit** it. Verify the `UserPromptSubmit` Hook returns a same-attempt/session/turn receipt. Confirm duplicate deliveries don't create another attempt. Verify `Stop` cannot authorize B by itself.
- **Phase C — MCP:** From Codex invoke `task_claim` with attempt-specific prompt identity, report progress and submit result with real evidence. Verify mismatched workflow/task/version/attempt/nonce is rejected and no other task is modified.
- **Phase D — Review:** After Stop + MCP result, inspect actual output/edits, then approve A. Confirm B is reserved **once**; its deep link is draft-only. Repeat for B then C. Capture a real result and operator acceptance for each.
- **Phase E — Error & crash:** Pause before B and verify no further dispatch; inject a duplicate Hook delivery; restart the Node owner with a reserved dispatch and verify `unknown` + pause, no automatic re-send. Provide explicit on-screen reconciliation evidence; test error after claim with observed Stop before retry.
- **Phase F — Native adapter (separate and destructive-input gate):** With test-only prompts and confirmed selectors, launch `OD_CWF_MODE=native` **in a fresh, isolated state directory** and verify physical Codex window, AX/foreground/empty composer, new-thread indicator, exact injected prompt, click response, independently observed Hook and screenshots. If a click could have happened and readback is unknown, STOP; do not blindly rerun. Only after Mac evidence supports it may the native adapter be used for automatic continuation.
- **Phase G — App Server (separate managed run):** Verify `codex app-server` presence/version/schema, handshake, `thread/start`, `turn/start`, hosted notifications, thread ID reconciliation and error handling. Explicitly verify the hosted thread's relationship (if any) to the official desktop UI rather than assuming they synchronize.

## Handoff evidence

Store timestamps, actual host/runtime binary SHA/provenance, action payload IDs (redact nonce/token), durable revisions, success/failure receipts, screenshots and trace under `.runtime/tests/codex-workflow-companion/mac-acceptance/`. Report each gate as **PASS / FAIL / NOT_TESTED / BLOCKED** with links to concrete evidence. Do not elevate HTTP 200, `stop`, `turn/start` acknowledgment or synthetic simulation to an end-to-end success. Fix any failure, rerun its focused gate and the regression suite, and then commit only relevant maintainable sources. Mac integration has no pass score until this evidence exists.
