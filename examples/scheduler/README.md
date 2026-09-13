# Scheduler JavaScript examples

[`schedule-two-notifications.js`](schedule-two-notifications.js) is the complete
Scheduler demonstration. It is a client of the long-running local Scheduler:
it creates two future one-time jobs, proves neither has history before it is
due, waits for both automatic runs, and verifies two different Execution IDs,
payload stdout, and notification evidence. It never calls **Run now** and does
not use a script timer as the scheduling mechanism.

[`notify-and-log.js`](notify-and-log.js) is the scheduled payload. Each run
writes deterministic start/complete console markers, calls `ui.notify()`, and
writes `notify-result.json` inside that Execution's artifact directory.

All commands below run from the repository root.

## Run the real two-job Scheduler demonstration

Terminal A owns the persistent Scheduler service. Start it with Custom UI
enabled and leave it running:

```bash
./dist/opendesk -http -ui -port 60944 -scheduler-db ./.runtime/examples/scheduler/scheduler.db -console-mode script
```

The local Web management page is <http://127.0.0.1:60944/scheduler>.

In terminal B, create and observe the two future jobs:

```bash
OPENDESK_SCHEDULER_API_URL=http://127.0.0.1:60944/api/scheduler ./dist/opendesk -script examples/scheduler/schedule-two-notifications.js -console-mode script
```

The client prints exactly two setup markers: `setup=start` before creation and
`setup=created` after both jobs exist. The jobs are due about three and six
seconds after setup. Scheduler—not the client—creates their JobRuns and standard
Executions when they become due. The client's `sleep()` only polls run history.

Each scheduled Execution shows its own Toast and writes these markers to its
own `stdout.log`:

```text
[SCHEDULER_NOTIFY] stage=start mode=scheduler executionId=...
[SCHEDULER_NOTIFY] stage=complete mode=scheduler executionId=...
```

The client verifies the markers, both `notify-result.json` files, due/start
times, successful statuses, and distinct Execution IDs. Its structured result
is:

```text
.runtime/examples/scheduler/schedule-two-notifications-result.json
```

The two completed jobs and histories remain in the database by default. Refresh
the Web page to inspect both plans and their run records. To delete only the two
jobs created by a new demonstration run, set
`OPENDESK_SCHEDULER_EXAMPLE_CLEANUP=1` on the terminal B command.

To inspect the same retained database in the native product **计划中心**, first
stop terminal A so there is only one Scheduler owner, then run:

```bash
OPENDESK_SCRIPT_RUNNER_DIR="$PWD" ./dist/opendesk -app apps/opendesk -scheduler-db ./.runtime/examples/scheduler/scheduler.db -console-mode script
```

The Web management page and the native **计划中心** are different clients. The
first command proves the headless HTTP owner; the product command above reopens
the same database after that owner stops.

## Direct payload smoke is not scheduling

This command checks only that the payload can run and display one Toast:

```bash
./dist/opendesk -ui -script examples/scheduler/notify-and-log.js -console-mode script
```

It is a direct Execution. Its markers say `mode=direct`, it creates no Job or
JobRun, and it must not be presented as Scheduler evidence.

## Portable non-UI payload and API acceptance

[`write-evidence.js`](write-evidence.js) is a non-UI Scheduler payload. Its
direct smoke command is:

```bash
./dist/opendesk -script examples/scheduler/write-evidence.js -console-mode script
```

Success prints `SCHEDULER_EXAMPLE_PASS mode=direct` and writes
`.runtime/examples/scheduler/last-run.json` with `scheduled: false`.

The broader Scheduler API acceptance client uses an isolated database. Keep
this owner running in terminal A:

```bash
./dist/opendesk -http -port 60945 -scheduler-db ./.runtime/tests/scheduler-js/scheduler.db -console-mode script
```

Then run this command in terminal B:

```bash
OPENDESK_SCHEDULER_API_URL=http://127.0.0.1:60945/api/scheduler ./dist/opendesk -script tests/scheduler/scheduler-api-smoke.js -console-mode script
```

It covers HTTP create/list/source redaction, pause/resume, Run now while paused,
and a real future `at` trigger for `write-evidence.js`. Its temporary jobs are
deleted in cleanup; structured evidence is written to
`.runtime/tests/scheduler/js-api-smoke/result.json`.

Scheduler process ownership is a host invariant. Verify single-active/standby,
migration concurrency, process-kill takeover, and restart persistence with:

```bash
go run ./tests/scheduler/tools/multiruntime
go run -race ./tests/scheduler/tools/multiruntime
```

On Windows, use `dist\opendesk.exe` and PowerShell `$env:NAME=...` syntax.
Linux and Windows builds still require their separate platform validation;
macOS live evidence is not target-system evidence for those platforms.
