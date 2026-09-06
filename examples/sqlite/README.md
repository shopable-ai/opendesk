# SQLite Runtime API examples

`SQLite` is a first-party OpenDesk Runtime global. It uses the SQLite driver
already embedded in OpenDesk; scripts do not install a plugin, `sqlite3` CLI,
Node.js, npm package, server, or daemon. It is deliberately separate from the
Scheduler's internal SQLite database and from `AppStorage`; protected Scheduler
database paths cannot be opened through this API.

The public handle flow is:

```js
const db = await SQLite.open({ path: 'data/app.sqlite', mode: 'rwc' });
try {
  await db.exec('CREATE TABLE IF NOT EXISTS items (name TEXT PRIMARY KEY)');
  await db.exec('DELETE FROM items');
  await db.exec('INSERT INTO items (name) VALUES (?)', ['Ada']);
  await db.batch([{ sql: 'UPDATE items SET name = ? WHERE name = ?', params: ['Grace', 'Ada'] }]);
  const rows = await db.query('SELECT name FROM items');
  console.log(rows);
} finally {
  await db.close();
}
```

See [the SQLite API reference](../../docs/api/sqlite.md) for modes, parameter
types, result limits, cancellation, errors, and transaction boundaries.

## Run from the repository root

Build the current source first so `dist/opendesk` is the binary being checked.
Then run each public command exactly as shown. The examples create only local
test artifacts under `.runtime/tests/sqlite/`; they never access a scheduler or
user database.

```bash
./dist/opendesk -script examples/sqlite/quickstart.js -console-mode script

./dist/opendesk -script tests/runtime-api/sqlite-smoke.js -console-mode script

./dist/opendesk -script examples/sqlite/persistence-write.js -console-mode script

./dist/opendesk -script examples/sqlite/persistence-read.js -console-mode script
```

Run `persistence-read.js` only after `persistence-write.js` exits with status
0. The two scripts are separate processes: the writer saves a fresh nonce after
closing its database, and the reader opens that exact database in `mode: "ro"`
and verifies the nonce without creating or writing anything.

On Windows PowerShell, run these corresponding commands from the repository
root after building `dist\opendesk.exe`:

```powershell
.\dist\opendesk.exe -script examples/sqlite/quickstart.js -console-mode script

.\dist\opendesk.exe -script tests/runtime-api/sqlite-smoke.js -console-mode script

.\dist\opendesk.exe -script examples/sqlite/persistence-write.js -console-mode script

.\dist\opendesk.exe -script examples/sqlite/persistence-read.js -console-mode script
```

## Canonical test ownership and compatibility

The standalone smoke entry is now
[`tests/runtime-api/sqlite-smoke.js`](../../tests/runtime-api/sqlite-smoke.js).
It and `tests/runtime-api/unit/sqlite.test.js` load the same
[`support/sqlite-smoke-cases.js`](../../tests/runtime-api/support/sqlite-smoke-cases.js).
The shared assertion implementation was moved without changing its contents.
The two old `examples/sqlite/smoke*` paths are thin compatibility entries, not a
second implementation. Existing commands still resolve; new commands should use
the paths above. See [migration rules](../../docs/quality/example-test-layout.md).

## What each file proves

| File | Purpose |
| --- | --- |
| `quickstart.js` | Creates a database/table, uses parameterized writes, performs one transactional `batch`, queries rows, and always closes the handle. |
| `tests/runtime-api/support/sqlite-smoke-cases.js` | Shared, dependency-free JavaScript assertions used by the public smoke script and the formal Runtime API suite. Loading it does not start tests. |
| `tests/runtime-api/sqlite-smoke.js` | Runs isolated behavior groups with real assertions, including query cancellation/timeout, FIFO close fencing, two-handle lock-wait cancellation, a canceled batch rollback, and POSIX literal-backslash paths. The literal-backslash group is explicitly skipped on Windows. Each run uses a new `.runtime/tests/sqlite/smoke/...` directory and exits nonzero on any failure. |
| `persistence-write.js` | Writes one fresh nonce to a fixed local test database, closes it, then emits metadata for the next process. |
| `persistence-read.js` | Reads the writer metadata, opens the existing database with `mode: "ro"`, and verifies the nonce. |

The smoke suite checks that the global and every handle method exist, `rw` does
not create a missing database, `rwc` requires callers to create parent
directories, bindings and BLOB snapshots work, unsafe INTEGER values return as
exact strings, multi-statement SQL is rejected before a partial write, batch
rolls back as one transaction, result limits reject rather than truncate,
read-only mode prevents writes, repeated `close()` is safe, and `:memory:`
handles are independent. It also proves native query timeouts stop work and
leave the handle usable, `close()` fences later calls while draining accepted
FIFO work, a second handle's writer-lock wait times out without writing, and a
canceled batch reports a confirmed rollback.

These examples are normal local Runtime scripts. The formal contract, behavior,
coverage, cancellation, and lifecycle checks live under
[`tests/runtime-api/`](../../tests/runtime-api/); their generated evidence is
also local under `.runtime/`.
