// SQLite behavior is shared with tests/runtime-api/sqlite-smoke.js. Keep
// the formal unit gate on those exact cases rather than maintaining a second
// set of database assertions.

(() => {
  const { assert, test } = RuntimeAPITest;
  RuntimeAPITest.load('tests/runtime-api/support/sqlite-smoke-cases.js');
  const cases = globalThis.SQLiteSmokeCases;
  // The shared support module registers a global when loaded by either entry.
  // Retain its object in this test closure but do not leave a test helper on
  // the Runtime surface that catalog validation inspects.
  delete globalThis.SQLiteSmokeCases;

  function rootFor(name) {
    const root = File.join(Execution.artifactDir, 'sqlite-unit', name + '-' + Date.now() + '-' + Math.floor(Math.random() * 1_000_000));
    File.ensureDir(root);
    return root;
  }

  function sharedCase(name, covers, run) {
    test({ name, tier: 'unit', covers }, async () => {
      const root = rootFor(name.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
      try {
        await run({ root });
      } finally {
        if (File.exists(root)) await File.removeDir(root);
      }
    });
  }

  sharedCase(
    'SQLite.open honors documented path and create rules',
    ['SQLite.open', 'SQLiteDatabase.exec', 'SQLiteDatabase.close'],
    cases.runOpenAndPathCases,
  );
  test({
    name: 'SQLite keeps database operations on the returned handle',
    tier: 'unit',
    covers: ['SQLite.open', 'SQLiteDatabase.query', 'SQLiteDatabase.exec', 'SQLiteDatabase.batch', 'SQLiteDatabase.close'],
  }, async () => {
    for (const method of ['query', 'exec', 'batch', 'close']) {
      assert(typeof SQLite[method] === 'undefined', 'SQLite.' + method + ' must not be a global API');
    }
    const db = await cases.promise(SQLite.open({ path: ':memory:', mode: 'rwc' }), 'SQLite.open handle ownership');
    try {
      for (const method of ['query', 'exec', 'batch', 'close']) {
        assert(typeof db[method] === 'function', 'SQLiteDatabase.' + method + ' is required on the returned handle');
      }
    } finally {
      await cases.promise(db.close(), 'SQLiteDatabase.close handle ownership');
    }
  });
  test({
    name: 'SQLite.open rejects the default Scheduler database before native I/O',
    tier: 'unit',
    covers: ['SQLite.open'],
  }, async () => {
    const userInfo = await System.getUserInfo();
    const homePath = userInfo && typeof userInfo.homePath === 'string' ? userInfo.homePath : '';
    const userProfile = userInfo && typeof userInfo.userProfile === 'string' ? userInfo.userProfile : '';
    const schedulerHome = homePath || userProfile;
    assert(schedulerHome.length > 0, 'System user home is required for the protected Scheduler path check');
    const schedulerPath = File.join(schedulerHome, '.opendesk', 'opendesk', 'scheduler.db');
    const pending = SQLite.open({
      path: schedulerPath,
      mode: 'ro',
    });
    cases.promise(pending, 'SQLite.open protected Scheduler path');
    let error = null;
    try {
      await pending;
    } catch (caught) {
      error = caught;
    }
    assert(error, 'SQLite.open must reject the default Scheduler path before native I/O: ' + schedulerPath);
    cases.equal(error.name, 'SQLiteError', 'protected Scheduler path error name');
    cases.equal(error.code, 'PROTECTED_PATH', 'SQLite.open must reject Scheduler storage before opening it');
    cases.equal(error.operation, 'SQLite.open', 'protected Scheduler path operation');
  });
  sharedCase(
    'SQLite uses native binding and preserves documented values',
    ['SQLiteDatabase.exec', 'SQLiteDatabase.query', 'SQLiteDatabase.close'],
    cases.runDataAndBindingCases,
  );
  test({
    name: 'SQLite query preserves case-distinct SQLite column labels',
    tier: 'unit',
    covers: ['SQLite.open', 'SQLiteDatabase.query', 'SQLiteDatabase.close'],
  }, async () => {
    const db = await cases.promise(SQLite.open({ path: ':memory:', mode: 'rwc' }), 'SQLite.open column labels');
    try {
      const rows = await cases.promise(db.query('SELECT 1 AS X, 2 AS x'), 'SQLiteDatabase.query case-distinct labels');
      assert(Array.isArray(rows) && rows.length === 1, 'case-distinct label query must return one row');
      const row = rows[0];
      assert(Object.prototype.hasOwnProperty.call(row, 'X'), 'SQLite query must preserve column label X');
      assert(Object.prototype.hasOwnProperty.call(row, 'x'), 'SQLite query must preserve column label x');
      assert(!Object.prototype.hasOwnProperty.call(row, 'x:1'), 'SQLite query must not expose an internal wrapper-renamed label');
      cases.equal(row.X, 1, 'case-distinct label X value');
      cases.equal(row.x, 2, 'case-distinct label x value');
    } finally {
      await cases.promise(db.close(), 'SQLiteDatabase.close column labels');
    }
  });
  sharedCase(
    'SQLite rejects multi-statement input and rolls batch back atomically',
    ['SQLiteDatabase.query', 'SQLiteDatabase.exec', 'SQLiteDatabase.batch', 'SQLiteDatabase.close'],
    cases.runStatementAndBatchCases,
  );
  sharedCase(
    'SQLite enforces connection-level read-only mode and idempotent close',
    ['SQLite.open', 'SQLiteDatabase.query', 'SQLiteDatabase.exec', 'SQLiteDatabase.close'],
    cases.runReadOnlyAndCloseCases,
  );
  sharedCase(
    'SQLite AbortSignal and timeout interrupt native query work',
    ['SQLiteDatabase.query', 'SQLiteDatabase.close'],
    cases.runCancellationCases,
  );
  test({
    name: 'SQLite timeout interrupts a direct VALUES result after its first row',
    tier: 'unit',
    covers: ['SQLiteDatabase.query', 'SQLiteDatabase.close'],
  }, async () => {
    const db = await cases.promise(SQLite.open({ path: ':memory:', mode: 'rwc' }), 'SQLite.open VALUES timeout');
    try {
      // VALUES deliberately uses the non-SELECT result path. The first row is
      // cheap, while the scalar subquery behind the second row is expensive;
      // a timeout must continue to cover Rows.Next(), not merely QueryContext.
      const started = Date.now();
      const error = await cases.expectSQLiteError('SQLiteDatabase.query VALUES streaming timeout', () => db.query(
        'VALUES (1), ((WITH RECURSIVE c(x) AS (SELECT 0 UNION ALL SELECT x + 1 FROM c WHERE x < 10000000) SELECT max(x) FROM c))',
        [],
        { timeoutMs: 25 },
      ));
      cases.equal(error.code, 'TIMEOUT', 'direct VALUES result timeout code');
      assert(Date.now() - started < 5000, 'direct VALUES result timeout must interrupt Rows.Next() promptly');
      cases.equal(error.writeState, 'not_applicable', 'read-only VALUES timeout write state');
      cases.equal(error.committed, null, 'read-only VALUES timeout committed state');

      const afterTimeout = await cases.promise(db.query('SELECT 1 AS value'), 'SQLiteDatabase.query after VALUES timeout');
      assert(Array.isArray(afterTimeout) && afterTimeout.length === 1 && afterTimeout[0].value === 1,
        'SQLite handle must remain usable after a direct VALUES timeout');
    } finally {
      await cases.promise(db.close(), 'SQLiteDatabase.close VALUES timeout');
    }
  });
  sharedCase(
    'SQLite close fences later work while waiting for accepted FIFO work',
    ['SQLiteDatabase.query', 'SQLiteDatabase.close'],
    cases.runCloseFenceCases,
  );
  sharedCase(
    'SQLite lock wait honors operation timeout across two handles',
    ['SQLite.open', 'SQLiteDatabase.exec', 'SQLiteDatabase.query', 'SQLiteDatabase.close'],
    cases.runLockWaitCancellationCases,
  );
  sharedCase(
    'SQLite batch cancellation rolls every accepted statement back',
    ['SQLiteDatabase.batch', 'SQLiteDatabase.query', 'SQLiteDatabase.close'],
    cases.runBatchCancellationCases,
  );
  sharedCase(
    'SQLite preserves literal POSIX backslashes in a database filename',
    ['SQLite.open', 'SQLiteDatabase.exec', 'SQLiteDatabase.close'],
    cases.runPosixLiteralBackslashPathCases,
  );
  sharedCase(
    'SQLite :memory: databases remain isolated per handle',
    ['SQLite.open', 'SQLiteDatabase.query', 'SQLiteDatabase.exec', 'SQLiteDatabase.close'],
    cases.runMemoryCases,
  );

  test({
    name: 'SQLite execution teardown closes a forgotten database handle',
    tier: 'unit',
    covers: ['SQLiteDatabase.close'],
  }, async () => {
    const db = await SQLite.open({ path: ':memory:', mode: 'rwc' });
    assert(db && typeof db.exec === 'function', 'SQLite.open must return a usable handle');
    await db.exec('CREATE TABLE teardown_probe (value INTEGER NOT NULL)');
    // Deliberately do not call close(). The SQLite-specific runner verifies
    // the execution cleanup event after this process exits.
  });
})();
