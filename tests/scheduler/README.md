# Scheduler fixtures

This domain contains safe JavaScript fixtures for the embedded Scheduler. They
exercise the existing JavaScript Execution Runtime without mouse, keyboard,
window, network, or external-process actions.

- `fixtures/write-result.js` is parameterized by `pkg/scheduler` integration
  tests and writes into a test-owned temporary directory.
- `fixtures/live-smoke.js` is used by local binary smoke tests and writes its
  marker to `.runtime/tests/scheduler/live/script-executed.txt`.

SQLite files, HTTP responses, screenshots, logs, binaries, and other run output
belong under `.runtime/tests/scheduler/` and must not be committed as fixtures.
