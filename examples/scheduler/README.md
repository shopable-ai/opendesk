# Scheduler JavaScript example

[`write-evidence.js`](write-evidence.js) is a safe task payload for OpenDesk
Scheduler. It does not create the schedule itself: run it directly to verify
the JavaScript first, then select the same file in the Scheduler page or let the
automated JavaScript acceptance client schedule it.

All commands below run from the repository root.

## 1. Verify the task script directly

```bash
./dist/opendesk -script examples/scheduler/write-evidence.js -console-mode script
```

Success prints `SCHEDULER_EXAMPLE_PASS mode=direct`. Inspect the stable result:

```bash
cat .runtime/examples/scheduler/last-run.json
```

The result has `status: "passed"`, a non-empty `executionId`, and
`scheduled: false` for this direct run.

## 2. Run it through Scheduler

Start an isolated local Scheduler in terminal A:

```bash
./dist/opendesk -http -port 60944 -scheduler-db ./.runtime/tests/scheduler-js/scheduler.db -console-mode script
```

Open <http://127.0.0.1:60944/scheduler>, create a **script file** task with
`examples/scheduler/write-evidence.js`, and click **Run now**. A successful
Scheduler execution rewrites `last-run.json` with `scheduled: true` and a
`source` beginning with `scheduler:file:`. The page's run history must show the
same `executionId`.

## 3. Automated JavaScript acceptance

Keep terminal A running. In terminal B, run:

```bash
OPENDESK_SCHEDULER_API_URL=http://127.0.0.1:60944/api/scheduler ./dist/opendesk -script tests/scheduler/scheduler-api-smoke.js -console-mode script
```

Success prints `SCHEDULER_JS_ACCEPTANCE_PASS` and writes structured assertions
to `.runtime/tests/scheduler/js-api-smoke/result.json`. The test covers the HTTP
lifecycle, inline-source redaction, pause/resume, run-now while paused, one
terminal occurrence, and execution of this public file example. It deletes the
temporary jobs in cleanup.

Scheduler process ownership is not a JavaScript global contract. Verify
single-active/standby, migration concurrency, process-kill takeover, and restart
persistence with the host-process harness:

```bash
go run ./tests/scheduler/tools/multiruntime
go run -race ./tests/scheduler/tools/multiruntime
```

On Windows, use `dist\opendesk.exe` and PowerShell's
`$env:OPENDESK_SCHEDULER_API_URL=...` syntax. Windows `LockFileEx` and helper
process kill/takeover still require the hosted Windows gate; a macOS run is not
Windows live evidence.
