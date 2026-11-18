// Formal Runtime JS. The MCP harness checks disk independently between executions.
function check(value, message) {
  if (!value) throw new Error('mcp-persistence: ' + message);
}
const errors = [];
async function rejects(action, name, code, operation, state) {
  let error;
  try { await action(); } catch (caught) { error = caught; }
  check(error && error.name === name && error.code === code && error.operation === operation,
    operation + ' expected ' + name + '/' + code + ', got ' + (error && error.name) + '/' + (error && error.code));
  check(typeof error.message === 'string', operation + ' error message');
  if (name === 'SQLiteError') {
    check(['not_started', 'rolled_back', 'committed', 'unknown', 'not_applicable'].includes(error.writeState),
      operation + ' structured write state');
    const expected = ['not_started', 'rolled_back'].includes(error.writeState) ? false :
      error.writeState === 'committed' ? true : null;
    check(error.committed === expected, operation + ' compatible committed field');
  }
  if (state !== undefined) {
    check(error.writeState === state && error.committed === false, operation + ' write outcome');
  }
  errors.push({name: error.name, code: error.code, operation: error.operation,
    writeState: error.writeState, committed: error.committed});
  return error;
}
async function main() {
  const {root, phase, token} = Execution.input;
  check(typeof root === 'string' && File.isDir(root), 'existing isolated root');
  if (phase === 'disabled') {
    check(typeof SQLite === 'undefined', 'SQLite remains absent in ordinary host session');
  } else {
    const at = name => File.join(root, name);
    const json = at('state.json');
    const database = at('state.sqlite');
    check(typeof token === 'string', 'fixture token');
    if (phase === 'seed') {
      check(await File.readJSON(at('absent.json'), {defaultValue: false}) === false, 'falsy default');
      check(!File.exists(at('absent.json')), 'default does not create');
      await File.writeJSON(json, {token, revision: 1, text: '持久化', values: [null, false, 0]});
      const db = await SQLite.open({path: database, mode: 'rwc'});
      try {
        await db.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, title TEXT NOT NULL UNIQUE, payload BLOB, exact INTEGER)');
        const batch = await db.batch([
          {sql: 'INSERT INTO records VALUES (?, ?, ?, ?)', params: [1, token, new Uint8Array([0, 128, 255]), BigInt('9007199254740993')]},
          {sql: 'INSERT INTO records (id, title) VALUES (:id, :title)', params: {id: 2, title: '持久化'}},
        ]);
        check(JSON.stringify(batch) === '{"results":[{"changes":1},{"changes":1}]}', 'batch ordered results');
      } finally { await db.close(); }
    } else if (phase === 'exercise') {
      const original = await File.readJSON(json);
      check(original.token === token && original.revision === 1, 'JSON from earlier execution');
      const before = Array.from(new Uint8Array(File.readBytes(json)));
      const cycle = {}; cycle.self = cycle;
      for (const value of [cycle, undefined, BigInt(1)]) {
        const error = await rejects(() => File.writeJSON(json, value), 'FileJSONError', 'JSON_SERIALIZATION_FAILED', 'File.writeJSON');
        check(error.committed === false, 'serialization did not commit');
      }
      const aborted = new AbortController(); aborted.abort('fixture pre-abort');
      for (const [value, options, code] of [
        [{tooLarge: 'x'.repeat(100)}, {maxBytes: 8}, 'FILE_TOO_LARGE'],
        [{replacement: true}, {signal: aborted.signal}, 'CANCELED'],
      ]) {
        const error = await rejects(() => File.writeJSON(json, value, options), 'FileJSONError', code, 'File.writeJSON');
        check(error.committed === false, 'failed JSON write did not commit');
      }
      check(JSON.stringify(Array.from(new Uint8Array(File.readBytes(json)))) === JSON.stringify(before), 'failed writes preserve original bytes');
      await rejects(() => File.readJSON(at('malformed.json'), {defaultValue: original}), 'FileJSONError', 'JSON_PARSE_FAILED', 'File.readJSON');
      await rejects(() => File.readJSON(json, {signal: aborted.signal}), 'FileJSONError', 'CANCELED', 'File.readJSON');
      const db = await SQLite.open({path: database});
      try {
        const rows = await db.query('SELECT id, title, payload, exact FROM records ORDER BY id');
        check(rows.length === 2 && rows[0].title === token && rows[1].title === '持久化', 'database from earlier execution');
        check(rows[0].exact === '9007199254740993' && rows[0].payload instanceof Uint8Array &&
          JSON.stringify(Array.from(rows[0].payload)) === '[0,128,255]', 'exact integer and blob persistence');
        await rejects(() => db.batch([
          {sql: 'INSERT INTO records (id, title) VALUES (?, ?)', params: [3, 'must-roll-back']},
          {sql: 'INSERT INTO records (id, title) VALUES (?, ?)', params: [4, token]},
        ]), 'SQLiteError', 'SQL_ERROR', 'SQLiteDatabase.batch', 'rolled_back');
        check((await db.query('SELECT id FROM records WHERE id >= 3')).length === 0, 'constraint rolls back prior statement');
        await rejects(() => db.exec('INSERT INTO records (id, title) VALUES (5, ?)', ['pre-abort'], {signal: aborted.signal}),
          'SQLiteError', 'CANCELED', 'SQLiteDatabase.exec', 'not_started');
        await rejects(() => db.batch([{sql: 'DELETE FROM records'}], {signal: aborted.signal}),
          'SQLiteError', 'CANCELED', 'SQLiteDatabase.batch', 'not_started');
        await rejects(() => db.query('SELECT id FROM records', [], {signal: aborted.signal}),
          'SQLiteError', 'CANCELED', 'SQLiteDatabase.query', 'not_started');
        await rejects(() => db.query('WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT sum(x) AS total FROM n', [], {timeoutMs: 1}),
          'SQLiteError', 'TIMEOUT', 'SQLiteDatabase.query');
        check((await db.query('SELECT count(*) AS n FROM records'))[0].n === 2, 'handle usable after timeout and pre-abort');
        check((await db.exec('UPDATE records SET title = ? WHERE id = 2', ['已更新'])).changes === 1, 'write still usable');
      } finally {
        check(await db.close() === undefined, 'close after timeout');
        check(await db.close() === undefined, 'idempotent close');
      }
      await rejects(() => db.query('SELECT 1'), 'SQLiteError', 'CLOSED', 'SQLiteDatabase.query');
      const ro = await SQLite.open({path: database, mode: 'ro'});
      try {
        await rejects(() => ro.exec('INSERT INTO records (id, title) VALUES (6, ?)', ['readonly']),
          'SQLiteError', 'READ_ONLY', 'SQLiteDatabase.exec');
        await rejects(() => ro.batch([{sql: 'DELETE FROM records'}]),
          'SQLiteError', 'READ_ONLY', 'SQLiteDatabase.batch', 'rolled_back');
        check((await ro.query('SELECT count(*) AS n FROM records'))[0].n === 2, 'ro survives refused writes');
      } finally { await ro.close(); }
      // Keep state.json unchanged for an independent byte-for-byte host check.
      await File.writeJSON(at('next.json'), {...original, revision: 2});
    } else if (phase === 'verify') {
      check((await File.readJSON(json)).revision === 1, 'original JSON persists after failures');
      check((await File.readJSON(at('next.json'))).revision === 2, 'new JSON persists across executions');
      const db = await SQLite.open({path: database, mode: 'ro'});
      try {
        const rows = await db.query('SELECT id, title FROM records ORDER BY id');
        check(JSON.stringify(rows) === JSON.stringify([{id: 1, title: token}, {id: 2, title: '已更新'}]), 'final persisted rows exclude failed writes');
      } finally { await db.close(); }
    } else { throw new Error('unknown phase: ' + phase); }
  }
  console.log(JSON.stringify({test: 'mcp-persistence', ok: true, phase, executionId: Execution.executionId, errors}));
}
await main();
