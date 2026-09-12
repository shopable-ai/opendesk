# Scheduler fixtures

This domain contains safe JavaScript fixtures for the embedded Scheduler. They
exercise the existing JavaScript Execution Runtime without mouse, keyboard,
window, network, or external-process actions.

- `fixtures/write-result.js` is parameterized by `pkg/scheduler` integration
  tests and writes into a test-owned temporary directory.
- `fixtures/live-smoke.js` is used by local binary smoke tests and writes its
  marker to `.runtime/tests/scheduler/live/script-executed.txt`.
- `scheduler-api-smoke.js` is a user-observable JavaScript acceptance client for
  the local Scheduler HTTP API. It verifies create/list/source redaction,
  pause/resume, run-now while paused, terminal run history, Execution ID, and
  cleanup. It also schedules `examples/scheduler/write-evidence.js` as a file
  task and matches that script's evidence to the Scheduler run. Build the
  current source as `dist/opendesk`, then start an isolated Scheduler from the
  repository root:

  ```bash
  ./dist/opendesk -http -port 60944 -scheduler-db ./.runtime/tests/scheduler-js/scheduler.db -console-mode script
  ```

  Then, from a second terminal in the repository root, run:

  ```bash
  OPENDESK_SCHEDULER_API_URL=http://127.0.0.1:60944/api/scheduler ./dist/opendesk -script tests/scheduler/scheduler-api-smoke.js -console-mode script
  ```

  Success prints `SCHEDULER_JS_ACCEPTANCE_PASS`; structured evidence is written
  to `.runtime/tests/scheduler/js-api-smoke/result.json`. This verifies the
  public HTTP lifecycle and real inline/file JavaScript Executions. Multi-Runtime
  `flock`/`LockFileEx`, single-active ownership, and process-kill takeover remain
  the responsibility of `go run ./tests/scheduler/tools/multiruntime` because
  those are host-process invariants, not a JavaScript global API contract.

SQLite files, HTTP responses, screenshots, logs, binaries, and other run output
belong under `.runtime/tests/scheduler/` and must not be committed as fixtures.
