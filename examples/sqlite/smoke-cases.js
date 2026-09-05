// Shared SQLite Runtime API behavior checks.
//
// This file intentionally does not execute on load. Public smoke.test.js and
// tests/runtime-api/unit/sqlite.test.js load the same assertions so the example
// and the formal Runtime API gate cannot silently drift apart.

globalThis.SQLiteSmokeCases = (() => {
  function assert(condition, message) {
    if (!condition) throw new Error(message || 'assertion failed');
  }

  function equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error((message || 'values differ') + ': expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
    }
  }

  function promise(value, label) {
    assert(value && typeof value.then === 'function', label + ' must return a Promise');
    return value;
  }

  async function expectSQLiteError(label, fn) {
    let pending;
    try {
      pending = fn();
    } catch (error) {
      throw new Error(label + ' must return a rejected Promise, not throw synchronously: ' + String(error && error.message ? error.message : error));
    }
    promise(pending, label);
    let caught = null;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }
    assert(caught, label + ' must reject');
    equal(caught.name, 'SQLiteError', label + ' must reject SQLiteError');
    assert(typeof caught.code === 'string' && caught.code.length > 0, label + ' SQLiteError.code is required');
    assert(typeof caught.operation === 'string' && caught.operation.length > 0, label + ' SQLiteError.operation is required');
    return caught;
  }

  function databaseArtifacts(path) {
    return [path, path + '-journal', path + '-wal', path + '-shm'];
  }

  function removeDatabaseArtifacts(path) {
    for (const candidate of databaseArtifacts(path)) {
      if (File.exists(candidate)) File.remove(candidate);
    }
  }

  function makeRoot(label) {
    const executionID = globalThis.Execution && Execution.executionId ? String(Execution.executionId) : 'direct';
    const random = Math.floor(Math.random() * 1_000_000_000);
    const root = File.join('.runtime', 'tests', 'sqlite', 'smoke', `${label}-${executionID}-${Date.now()}-${random}`);
    File.ensureDir(root);
    return root;
  }

  async function openFixture(root, name) {
    const directory = File.join(root, name + ' 空格 中文');
    File.ensureDir(directory);
    const path = File.join(directory, 'fixture.sqlite');
    removeDatabaseArtifacts(path);
    const db = await promise(SQLite.open({ path, mode: 'rwc' }), 'SQLite.open');
    assert(db && typeof db === 'object', 'SQLite.open must resolve a database handle');
    for (const method of ['query', 'exec', 'batch', 'close']) {
      equal(typeof db[method], 'function', 'SQLiteDatabase.' + method + ' is required');
    }
    return { db, path, directory };
  }

  async function closeQuietly(db) {
    if (!db) return;
    await promise(db.close(), 'SQLiteDatabase.close');
  }

  function assertRows(rows, label) {
    assert(Array.isArray(rows), label + ' must return an array of row objects');
    for (const row of rows) {
      assert(row && typeof row === 'object' && !Array.isArray(row), label + ' must contain row objects');
    }
  }

  function assertBytes(actual, expected, label) {
    assert(actual instanceof Uint8Array, label + ' must be Uint8Array');
    equal(actual.length, expected.length, label + ' byte length');
    for (let index = 0; index < expected.length; index += 1) {
      equal(actual[index], expected[index], label + ' byte ' + index);
    }
  }

  async function runOpenAndPathCases({ root }) {
    assert(typeof root === 'string' && root.length > 0, 'runOpenAndPathCases requires a root');
    File.ensureDir(root);

    assert(globalThis.SQLite && typeof SQLite === 'object', 'SQLite global is required');
    equal(typeof SQLite.open, 'function', 'SQLite.open is required');

    const missing = File.join(root, 'does-not-exist.sqlite');
    removeDatabaseArtifacts(missing);
    await expectSQLiteError('SQLite.open default rw missing database', () => SQLite.open({ path: missing }));
    assert(!File.exists(missing), 'SQLite.open default rw must not create a database');

    const preAbortedPath = File.join(root, 'pre-aborted-open.sqlite');
    removeDatabaseArtifacts(preAbortedPath);
    const preAborted = new AbortController();
    preAborted.abort();
    await expectSQLiteError('SQLite.open pre-aborted signal', () => SQLite.open({
      path: preAbortedPath,
      mode: 'rwc',
      signal: preAborted.signal,
    }));
    assert(!File.exists(preAbortedPath), 'pre-aborted SQLite.open must not create a database');

    const absentParent = File.join(root, 'caller-must-create-parent', 'database.sqlite');
    await expectSQLiteError('SQLite.open rwc missing parent', () => SQLite.open({ path: absentParent, mode: 'rwc' }));
    assert(!File.exists(absentParent), 'SQLite.open must not create missing parent directories');

    const fixture = await openFixture(root, 'path');
    try {
      assert(File.exists(fixture.path), 'SQLite.open rwc must create the requested relative-path database');
      const result = await promise(fixture.db.exec('CREATE TABLE path_check (id INTEGER PRIMARY KEY, value TEXT NOT NULL)'), 'SQLiteDatabase.exec');
      equal(result.changes, 0, 'DDL changes');
    } finally {
      await closeQuietly(fixture.db);
    }
  }

  async function runDataAndBindingCases({ root }) {
    const fixture = await openFixture(root, 'binding');
    const { db } = fixture;
    try {
      await promise(db.exec(
        'CREATE TABLE bound_values (id INTEGER PRIMARY KEY, label TEXT NOT NULL, whole INTEGER, decimal REAL, nullable TEXT, enabled INTEGER, payload BLOB)',
      ), 'SQLiteDatabase.exec');

      const bytes = new Uint8Array([0, 1, 127, 255]);
      const insert = promise(db.exec(
        'INSERT INTO bound_values (label, whole, decimal, nullable, enabled, payload) VALUES (?, ?, ?, ?, ?, ?)',
        ['first', 42, 1.5, null, true, bytes],
      ), 'SQLiteDatabase.exec');
      // The worker must receive a parameter snapshot, not a reference to a
      // mutable TypedArray that JavaScript can change after enqueueing.
      bytes[0] = 99;
      const insertResult = await insert;
      equal(insertResult.changes, 1, 'parameterized INSERT changes');

      const rows = await promise(db.query(
        'SELECT label, whole, decimal, nullable, enabled, payload FROM bound_values ORDER BY id',
      ), 'SQLiteDatabase.query');
      assertRows(rows, 'SQLiteDatabase.query');
      equal(rows.length, 1, 'parameterized query row count');
      equal(rows[0].label, 'first', 'TEXT row value');
      equal(rows[0].whole, 42, 'safe INTEGER row value');
      equal(rows[0].decimal, 1.5, 'REAL row value');
      equal(rows[0].nullable, null, 'NULL row value');
      equal(rows[0].enabled, 1, 'boolean parameter must round-trip as SQLite INTEGER 1');
      assertBytes(rows[0].payload, [0, 1, 127, 255], 'BLOB row value');

      const namedInsert = await promise(db.exec(
        'INSERT INTO bound_values (label, whole, decimal, nullable, enabled, payload) VALUES (:label, :whole, :decimal, :nullable, :enabled, :payload)',
        { label: 'named', whole: 7, decimal: 2.5, nullable: null, enabled: false, payload: new Uint8Array([9]) },
      ), 'SQLiteDatabase.exec named parameters');
      equal(namedInsert.changes, 1, 'named parameter INSERT changes');
      const namedRows = await promise(db.query(
        'SELECT label, whole FROM bound_values WHERE label = :label',
        { label: 'named' },
      ), 'SQLiteDatabase.query named parameters');
      assertRows(namedRows, 'named parameter query');
      equal(namedRows.length, 1, 'named parameter row count');
      equal(namedRows[0].whole, 7, 'named parameter row value');

      const unicodeNamedInsert = await promise(db.exec(
        'INSERT INTO bound_values (label, whole, decimal, nullable, enabled, payload) VALUES (:名字, :whole, :decimal, :nullable, :enabled, :payload)',
        { 名字: 'unicode-named', whole: 8, decimal: 3.5, nullable: null, enabled: true, payload: new Uint8Array([8]) },
      ), 'SQLiteDatabase.exec Unicode named parameters');
      equal(unicodeNamedInsert.changes, 1, 'Unicode named parameter INSERT changes');
      const unicodeNamedRows = await promise(db.query(
        'SELECT label, whole FROM bound_values WHERE label = :名字',
        { 名字: 'unicode-named' },
      ), 'SQLiteDatabase.query Unicode named parameters');
      assertRows(unicodeNamedRows, 'Unicode named parameter query');
      equal(unicodeNamedRows.length, 1, 'Unicode named parameter row count');
      equal(unicodeNamedRows[0].whole, 8, 'Unicode named parameter row value');

      await expectSQLiteError('named parameter missing key', () => db.query(
        'SELECT :label AS value',
        {},
      ));
      await expectSQLiteError('named parameter extra key', () => db.query(
        'SELECT :label AS value',
        { label: 'expected', extra: 'not-allowed' },
      ));
      const leadingUnderscore = await expectSQLiteError('named parameter leading underscore', () => db.query(
        'SELECT :_value AS value',
        { _value: 1 },
      ));
      equal(leadingUnderscore.code, 'INVALID_ARGUMENT', 'leading underscore named parameter error code');

      await promise(db.exec(
        'CREATE TABLE exact_integers (value INTEGER NOT NULL)',
      ), 'SQLiteDatabase.exec');
      await promise(db.exec(
        'INSERT INTO exact_integers (value) VALUES (CAST(? AS INTEGER))',
        ['9223372036854775807'],
      ), 'SQLiteDatabase.exec');
      const exactRows = await promise(db.query('SELECT value FROM exact_integers'), 'SQLiteDatabase.query');
      assertRows(exactRows, 'exact INTEGER query');
      equal(exactRows.length, 1, 'exact INTEGER row count');
      equal(exactRows[0].value, '9223372036854775807', 'unsafe SQLite INTEGER must remain an exact decimal string');

      await promise(db.exec(
        'INSERT INTO exact_integers (value) VALUES (?)',
        [9007199254740992n],
      ), 'SQLiteDatabase.exec BigInt parameter');
      const bigIntRows = await promise(db.query(
        'SELECT value FROM exact_integers WHERE value = ?',
        [9007199254740992n],
      ), 'SQLiteDatabase.query BigInt parameter');
      assertRows(bigIntRows, 'BigInt INTEGER query');
      equal(bigIntRows.length, 1, 'BigInt INTEGER row count');
      equal(bigIntRows[0].value, '9007199254740992', 'BigInt INTEGER must return exact decimal string outside Number safety');

      await expectSQLiteError('unsafe integer number parameter', () => db.exec(
        'INSERT INTO exact_integers (value) VALUES (?)',
        [Number.MAX_SAFE_INTEGER + 1],
      ));
      await expectSQLiteError('parameter count mismatch', () => db.exec(
        'INSERT INTO bound_values (label) VALUES (?)',
        [],
      ));
      await expectSQLiteError('unsupported parameter type', () => db.exec(
        'INSERT INTO bound_values (label) VALUES (?)',
        [{}],
      ));

      const empty = await promise(db.query('SELECT label FROM bound_values WHERE id < 0'), 'SQLiteDatabase.query');
      assertRows(empty, 'empty SQLiteDatabase.query');
      equal(empty.length, 0, 'query without rows must resolve []');

      const labelRows = await promise(db.query('SELECT 1 AS "space label", 2 AS "__proto__"'), 'SQLiteDatabase.query column labels');
      assertRows(labelRows, 'column label query');
      equal(labelRows.length, 1, 'column label row count');
      equal(labelRows[0]['space label'], 1, 'materialized SELECT must preserve quoted column labels');
      equal(labelRows[0].__proto__, 2, 'materialized SELECT must preserve __proto__ as a data property');
      assert(Object.prototype.hasOwnProperty.call(labelRows[0], '__proto__'), '__proto__ result column must be an own property');
    } finally {
      await closeQuietly(db);
    }
  }

  async function runStatementAndBatchCases({ root }) {
    const fixture = await openFixture(root, 'statements');
    const { db } = fixture;
    try {
      await promise(db.exec('CREATE TABLE batch_values (value TEXT PRIMARY KEY)'), 'SQLiteDatabase.exec');

      const semicolonLiteral = await promise(db.query("SELECT 'semicolon; inside a string' AS value /* ; inside a comment */"), 'SQLiteDatabase.query');
      assertRows(semicolonLiteral, 'semicolon literal query');
      equal(semicolonLiteral[0].value, 'semicolon; inside a string', 'SQL parser must not split a semicolon in a string or comment');

      await expectSQLiteError('query rejects two top-level statements', () => db.query('SELECT 1 AS first; SELECT 2 AS second'));
      await expectSQLiteError('exec rejects two top-level statements before writing', () => db.exec(
        'INSERT INTO batch_values (value) VALUES (?); INSERT INTO batch_values (value) VALUES (?)',
        ['must-not-write', 'must-not-write-either'],
      ));
      const afterMulti = await promise(db.query('SELECT value FROM batch_values'), 'SQLiteDatabase.query');
      equal(afterMulti.length, 0, 'rejected multi-statement exec must not partially write');

      await expectSQLiteError('exec rejects raw transaction control', () => db.exec('BEGIN'));
      await expectSQLiteError('batch rejects raw transaction control', () => db.batch([{ sql: 'COMMIT' }]));

      const batch = await promise(db.batch([
        { sql: 'INSERT INTO batch_values (value) VALUES (?)', params: ['batch-a'] },
        { sql: 'INSERT INTO batch_values (value) VALUES (?)', params: ['batch-b'] },
      ]), 'SQLiteDatabase.batch');
      assert(batch && Array.isArray(batch.results), 'batch must return results');
      equal(batch.results.length, 2, 'batch result count');
      equal(batch.results[0].changes, 1, 'first batch changes');
      equal(batch.results[1].changes, 1, 'second batch changes');

      await expectSQLiteError('batch rolls back every statement on failure', () => db.batch([
        { sql: 'INSERT INTO batch_values (value) VALUES (?)', params: ['rollback-a'] },
        { sql: 'INSERT INTO batch_values (value) VALUES (?)', params: ['batch-a'] },
      ]));
      const afterRollback = await promise(db.query('SELECT value FROM batch_values ORDER BY value'), 'SQLiteDatabase.query');
      assertRows(afterRollback, 'batch rollback query');
      equal(afterRollback.length, 2, 'failed batch must not commit its preceding statement');
      equal(afterRollback[0].value, 'batch-a', 'committed batch first row');
      equal(afterRollback[1].value, 'batch-b', 'committed batch second row');

      // query() means "return rows", not "read-only SQL": a DML RETURNING
      // statement can write before a row-result limit is observed. The public
      // error must deliberately preserve an unknown write outcome here.
      const returningLimit = await expectSQLiteError('DML RETURNING query result limit', () => db.query(
        'INSERT INTO batch_values (value) VALUES (?), (?) RETURNING value',
        ['returning-limit-a', 'returning-limit-b'],
        { maxRows: 1 },
      ));
      equal(returningLimit.code, 'RESULT_LIMIT', 'DML RETURNING limit error code');
      equal(returningLimit.writeState, 'unknown', 'DML RETURNING limit write state');
      equal(returningLimit.committed, null, 'DML RETURNING limit committed state');

      const pragmaRows = await promise(db.query('PRAGMA table_info(batch_values)'), 'SQLiteDatabase.query PRAGMA');
      assertRows(pragmaRows, 'PRAGMA query');
      assert(pragmaRows.some((row) => row.name === 'value'), 'PRAGMA table_info must return the value column');

      const explainRows = await promise(db.query('EXPLAIN SELECT 1 AS value'), 'SQLiteDatabase.query EXPLAIN');
      assertRows(explainRows, 'EXPLAIN query');
      assert(explainRows.length > 0, 'EXPLAIN must return VM rows');
      assert(Object.prototype.hasOwnProperty.call(explainRows[0], 'opcode'), 'EXPLAIN rows must include opcode');

      const valuesRows = await promise(db.query('VALUES (1, "one"), (2, "two")'), 'SQLiteDatabase.query VALUES');
      assertRows(valuesRows, 'VALUES query');
      equal(valuesRows.length, 2, 'VALUES row count');
      equal(valuesRows[0].column1, 1, 'VALUES first column');
      equal(valuesRows[1].column2, 'two', 'VALUES second row text');

      await expectSQLiteError('query maxRows limit', () => db.query(
        'SELECT value FROM batch_values ORDER BY value',
        [],
        { maxRows: 1 },
      ));
      await expectSQLiteError('query maxBytes limit', () => db.query(
        'SELECT value FROM batch_values ORDER BY value',
        [],
        { maxBytes: 1 },
      ));
    } finally {
      await closeQuietly(db);
    }
  }

  async function runReadOnlyAndCloseCases({ root }) {
    const fixture = await openFixture(root, 'read-only');
    const { db, path } = fixture;
    try {
      await promise(db.exec('CREATE TABLE persisted_values (value TEXT NOT NULL)'), 'SQLiteDatabase.exec');
      await promise(db.exec('INSERT INTO persisted_values (value) VALUES (?)', ['writer-value']), 'SQLiteDatabase.exec');
    } finally {
      await closeQuietly(db);
    }

    const readOnly = await promise(SQLite.open({ path, mode: 'ro' }), 'SQLite.open ro');
    try {
      const rows = await promise(readOnly.query('SELECT value FROM persisted_values'), 'SQLiteDatabase.query ro');
      assertRows(rows, 'read-only query');
      equal(rows.length, 1, 'read-only row count');
      equal(rows[0].value, 'writer-value', 'read-only query value');
      await expectSQLiteError('read-only exec rejects writes', () => readOnly.exec(
        'INSERT INTO persisted_values (value) VALUES (?)',
        ['must-not-write'],
      ));
    } finally {
      await closeQuietly(readOnly);
    }

    await promise(readOnly.close(), 'repeated SQLiteDatabase.close');
    await expectSQLiteError('closed handle query', () => readOnly.query('SELECT value FROM persisted_values'));
  }

  async function runCancellationCases({ root }) {
    const fixture = await openFixture(root, 'cancellation');
    const { db } = fixture;
    try {
      const alreadyCanceled = new AbortController();
      alreadyCanceled.abort();
      const canceledError = await expectSQLiteError('SQLiteDatabase.query pre-aborted signal', () => db.query(
        'SELECT 1 AS value',
        [],
        { signal: alreadyCanceled.signal },
      ));
      equal(canceledError.code, 'CANCELED', 'pre-aborted SQLite query error code');

      // A deliberately expensive scalar recursive CTE makes timeout apply to
      // real SQLite work, not merely a Promise.race. The native worker must
      // observe its context and interrupt the connection before this settles.
      const scalarTimeoutStarted = Date.now();
      const timeoutError = await expectSQLiteError('SQLiteDatabase.query timeout', () => db.query(
        'WITH RECURSIVE counter(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 1000000000) SELECT count(*) AS total FROM counter',
        [],
        { timeoutMs: 1 },
      ));
      equal(timeoutError.code, 'TIMEOUT', 'SQLite query timeout error code');
      assert(Date.now() - scalarTimeoutStarted < 5000, 'SQLite scalar timeout must interrupt native work promptly');
      const afterScalarTimeout = await promise(db.query('SELECT 1 AS value'), 'SQLiteDatabase.query after scalar timeout');
      assertRows(afterScalarTimeout, 'SQLite query after scalar timeout');
      equal(afterScalarTimeout.length, 1, 'SQLite query after scalar timeout row count');
      equal(afterScalarTimeout[0].value, 1, 'SQLite query after scalar timeout remains usable');

      // With direct Rows.Next(), this SQL yields its first row immediately and
      // can spend seconds producing the second. The Runtime materializes pure
      // SELECT results under the operation context, so this timeout must stop
      // that native result-production work rather than merely reject a raced
      // JavaScript Promise.
      const streamingTimeoutStarted = Date.now();
      const streamingTimeout = await expectSQLiteError('SQLiteDatabase.query streaming second row timeout', () => db.query(
        'WITH RECURSIVE counter(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 1000000000) SELECT 1 AS value UNION ALL SELECT count(*) AS value FROM counter',
        [],
        { timeoutMs: 25 },
      ));
      equal(streamingTimeout.code, 'TIMEOUT', 'streaming SQLite query timeout error code');
      assert(Date.now() - streamingTimeoutStarted < 5000, 'SQLite streaming timeout must interrupt native work promptly');
      const afterStreamingTimeout = await promise(db.query('SELECT 1 AS value'), 'SQLiteDatabase.query after streaming timeout');
      assertRows(afterStreamingTimeout, 'SQLite query after streaming timeout');
      equal(afterStreamingTimeout.length, 1, 'SQLite query after streaming timeout row count');
      equal(afterStreamingTimeout[0].value, 1, 'SQLite query after streaming timeout remains usable');
    } finally {
      await closeQuietly(db);
    }
  }

  async function runCloseFenceCases({ root }) {
    const fixture = await openFixture(root, 'close-fence');
    const { db } = fixture;
    try {
      // Queue real native work, then immediately put the close sentinel after
      // it. close() must fence every later API call while allowing this
      // already-accepted query to finish before the physical connection closes.
      const acceptedQuery = promise(db.query(
        'WITH RECURSIVE counter(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 2000000) SELECT count(*) AS total FROM counter',
      ), 'SQLiteDatabase.query accepted before close');
      const closing = promise(db.close(), 'SQLiteDatabase.close after accepted query');
      const lateQuery = await expectSQLiteError('SQLiteDatabase.query after close fence', () => db.query('SELECT 1 AS value'));
      equal(lateQuery.code, 'CLOSED', 'close fence must reject later SQLiteDatabase.query calls');

      const rows = await acceptedQuery;
      assertRows(rows, 'SQLite query accepted before close');
      equal(rows.length, 1, 'close fence accepted query row count');
      equal(rows[0].total, 2000000, 'close fence accepted query result');
      await closing;
    } finally {
      await closeQuietly(db);
    }
  }

  async function runLockWaitCancellationCases({ root }) {
    const fixture = await openFixture(root, 'lock-wait-cancellation');
    const { db: dbA, path } = fixture;
    let dbB = null;
    let writerController = null;
    let writer = null;
    try {
      await promise(dbA.exec('CREATE TABLE lock_values (value INTEGER PRIMARY KEY)'), 'SQLiteDatabase.exec lock-wait setup');
      dbB = await promise(SQLite.open({ path, mode: 'rw' }), 'SQLite.open lock-wait contender');

      // Keep dbA inside a real write statement long enough for dbB to contend
      // for SQLite's writer lock. A later AbortSignal releases the owner rather
      // than leaving dbB waiting behind a JavaScript-only Promise race.
      writerController = new AbortController();
      writer = promise(dbA.exec(
        'WITH RECURSIVE counter(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 1000000000) INSERT INTO lock_values (value) SELECT value FROM counter',
        [],
        { signal: writerController.signal },
      ), 'SQLiteDatabase.exec lock owner');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const contenderStarted = Date.now();
      const contenderError = await expectSQLiteError('SQLite lock wait timeout', () => dbB.exec(
        'INSERT INTO lock_values (value) VALUES (?)',
        [-1],
        { timeoutMs: 50 },
      ));
      equal(contenderError.code, 'TIMEOUT', 'SQLite lock contender error code');
      assert(Date.now() - contenderStarted < 5000, 'SQLite lock wait timeout must interrupt native lock waiting promptly');

      writerController.abort();
      const writerError = await expectSQLiteError('SQLite lock owner abort', () => writer);
      assert(
        writerError.code === 'CANCELED' || writerError.code === 'TIMEOUT',
        'aborted SQLite lock owner must report CANCELED or TIMEOUT, got ' + writerError.code,
      );

      const contenderRows = await promise(dbB.query(
        'SELECT value FROM lock_values WHERE value = ?',
        [-1],
      ), 'SQLiteDatabase.query lock contender result');
      assertRows(contenderRows, 'SQLite lock contender result');
      equal(contenderRows.length, 0, 'timed-out SQLite lock contender must not persist its row');
    } finally {
      if (writerController) writerController.abort();
      if (writer) {
        try {
          await writer;
        } catch (_) {
          // The writer is deliberately aborted above; its structured error was
          // asserted on the normal path and must not mask cleanup failures.
        }
      }
      await closeQuietly(dbB);
      await closeQuietly(dbA);
    }
  }

  async function runBatchCancellationCases({ root }) {
    const fixture = await openFixture(root, 'batch-cancellation');
    const { db } = fixture;
    try {
      await promise(db.exec('CREATE TABLE canceled_batch_values (value INTEGER NOT NULL)'), 'SQLiteDatabase.exec batch cancellation setup');

      // The first statement is deliberately quick. The second one keeps real
      // SQLite work in flight until the EventLoop aborts it, proving that a
      // batch owns one transaction and rolls that first write back too.
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 25);
      let canceledError;
      try {
        canceledError = await expectSQLiteError('SQLiteDatabase.batch abort rolls back', () => db.batch([
          { sql: 'INSERT INTO canceled_batch_values (value) VALUES (?)', params: [1] },
          {
            sql: 'WITH RECURSIVE counter(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 1000000000) INSERT INTO canceled_batch_values (value) SELECT value FROM counter',
          },
        ], { signal: controller.signal }));
      } finally {
        clearTimeout(abortTimer);
      }
      equal(canceledError.code, 'CANCELED', 'aborted SQLite batch error code');
      equal(canceledError.writeState, 'rolled_back', 'aborted SQLite batch must confirm rollback');
      equal(canceledError.committed, false, 'aborted SQLite batch must report no commit');

      const rows = await promise(db.query('SELECT value FROM canceled_batch_values'), 'SQLiteDatabase.query batch cancellation result');
      assertRows(rows, 'batch cancellation query');
      equal(rows.length, 0, 'canceled SQLite batch must leave no persisted rows');
    } finally {
      await closeQuietly(db);
    }
  }

  async function runPosixLiteralBackslashPathCases({ root }) {
    const platform = System.getPlatformInfo();
    if (platform && platform.os === 'windows') {
      return { skipped: true, reason: 'backslash is a Windows path separator' };
    }

    const directory = File.join(root, 'posix-literal-backslash');
    const literalName = 'literal\\backslash.sqlite';
    const databasePath = File.join(directory, literalName);
    const mistakenNestedPath = File.join(directory, 'literal', 'backslash.sqlite');
    let db = null;
    File.ensureDir(directory);
    try {
      removeDatabaseArtifacts(databasePath);
      db = await promise(SQLite.open({ path: databasePath, mode: 'rwc' }), 'SQLite.open POSIX literal-backslash path');
      await promise(db.exec('CREATE TABLE literal_backslash_path (value INTEGER NOT NULL)'), 'SQLiteDatabase.exec POSIX literal-backslash path');
      await closeQuietly(db);
      db = null;

      const names = File.listDir(directory);
      assert(names.indexOf(literalName) !== -1, 'POSIX SQLite path must create the exact literal-backslash filename');
      assert(!File.exists(mistakenNestedPath), 'POSIX SQLite path must not reinterpret backslash as a nested slash');
    } finally {
      await closeQuietly(db);
      if (File.exists(directory)) File.removeDir(directory);
    }
  }

  async function runMemoryCases() {
    await expectSQLiteError('SQLite.open :memory: ro', () => SQLite.open({ path: ':memory:', mode: 'ro' }));
    const defaultMode = await promise(SQLite.open({ path: ':memory:' }), 'SQLite.open :memory: default rw');
    try {
      await promise(defaultMode.exec('CREATE TABLE default_memory_values (value TEXT NOT NULL)'), 'SQLiteDatabase.exec default :memory:');
      const rows = await promise(defaultMode.query('SELECT value FROM default_memory_values'), 'SQLiteDatabase.query default :memory:');
      equal(rows.length, 0, 'default rw :memory: must be usable and isolated');
    } finally {
      await closeQuietly(defaultMode);
    }
    const first = await promise(SQLite.open({ path: ':memory:', mode: 'rwc' }), 'SQLite.open :memory:');
    let second = null;
    try {
      await promise(first.exec('CREATE TABLE memory_values (value TEXT NOT NULL)'), 'SQLiteDatabase.exec memory');
      await promise(first.exec('INSERT INTO memory_values (value) VALUES (?)', ['first-handle']), 'SQLiteDatabase.exec memory');

      second = await promise(SQLite.open({ path: ':memory:', mode: 'rwc' }), 'second SQLite.open :memory:');
      await expectSQLiteError('independent :memory: handles', () => second.query('SELECT value FROM memory_values'));
    } finally {
      await closeQuietly(second);
      await closeQuietly(first);
    }
  }

  async function runBehaviorSuite(options) {
    const label = options && options.label ? String(options.label) : 'sqlite-behavior';
    const root = options && options.root ? String(options.root) : makeRoot(label);
    File.ensureDir(root);
    const cases = [
      { name: 'SQLite.open validates rw/rwc paths and exposes only the handle API', run: runOpenAndPathCases },
      { name: 'SQLite parameter binding, result values, BLOB snapshot, and exact INTEGER conversion', run: runDataAndBindingCases },
      { name: 'SQLite single-statement guard, query limits, and all-or-nothing batch', run: runStatementAndBatchCases },
      { name: 'SQLite ro mode and idempotent close', run: runReadOnlyAndCloseCases },
      { name: 'SQLite AbortSignal and timeout cancel native query work', run: runCancellationCases },
      { name: 'SQLite close fences later work while accepting FIFO work already queued', run: runCloseFenceCases },
      { name: 'SQLite lock wait observes timeout and releases two-handle contention', run: runLockWaitCancellationCases },
      { name: 'SQLite batch abort rolls back every statement with a confirmed write state', run: runBatchCancellationCases },
      { name: 'SQLite keeps POSIX literal-backslash filenames literal', run: runPosixLiteralBackslashPathCases },
      { name: 'SQLite :memory: databases are independent per handle', run: runMemoryCases },
    ];
    const result = {
      schemaVersion: 1,
      label,
      root,
      total: cases.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      cases: [],
      startedAt: new Date().toISOString(),
    };

    for (const item of cases) {
      const started = Date.now();
      try {
        const outcome = await item.run({ root, label });
        if (outcome && outcome.skipped) {
          result.skipped += 1;
          result.cases.push({
            name: item.name,
            status: 'skipped',
            durationMs: Date.now() - started,
            reason: outcome.reason || 'not applicable on this platform',
          });
        } else {
          result.passed += 1;
          result.cases.push({ name: item.name, status: 'passed', durationMs: Date.now() - started });
        }
      } catch (error) {
        result.failed += 1;
        result.cases.push({
          name: item.name,
          status: 'failed',
          durationMs: Date.now() - started,
          error: String(error && error.stack ? error.stack : error),
        });
      }
    }
    result.finishedAt = new Date().toISOString();
    result.status = result.failed === 0 ? 'passed' : 'failed';
    return result;
  }

  return {
    assert,
    equal,
    promise,
    expectSQLiteError,
    makeRoot,
    removeDatabaseArtifacts,
    runOpenAndPathCases,
    runDataAndBindingCases,
    runStatementAndBatchCases,
    runReadOnlyAndCloseCases,
    runCancellationCases,
    runCloseFenceCases,
    runLockWaitCancellationCases,
    runBatchCancellationCases,
    runPosixLiteralBackslashPathCases,
    runMemoryCases,
    runBehaviorSuite,
  };
})();
