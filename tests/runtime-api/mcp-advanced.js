// Formal Runtime contract exercised inline by tests/mcp/advanced-runtime.test.js.
// No desktop observations, network or model calls. Only command-env runs a
// controlled short /bin/sh child to inspect one synthetic environment key.
function check(value, message) {
  if (!value) throw new Error(`mcp-advanced: ${message}`);
}

function report(value) {
  console.log(JSON.stringify({ test: 'mcp-advanced', ...value }));
}

function sameJSON(actual, expected) {
  if (actual === expected) return true;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false;
  if (Array.isArray(actual) !== Array.isArray(expected)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(actual, key) && sameJSON(actual[key], expected[key]));
}

async function main() {
  if (Execution.input === null) {
    report({ scenario: 'null', input: Execution.input });
    return;
  }
  const input = Execution.input;
  check(input && typeof input === 'object', 'object input');
  const scenario = input.scenario;
  if (['finalize-error', 'agent-finalize-script-error', 'legacy-finalize-script-error'].includes(scenario)) {
    const summaryFile = scenario === 'legacy-finalize-script-error' ? 'summary.json' : 'agent_summary.json';
    await File.writeJSON(path.resolve(Execution.artifactDir, summaryFile, 'block.json'), { test: true });
    report({ scenario, executionId: Execution.executionId, ready: true });
    if (scenario !== 'finalize-error') throw new Error('mcp-advanced-primary-script-error');
    return;
  }
  if (scenario === 'command-env') {
    check(Object.keys(Execution.env).length === 0, 'command execution environment snapshot is empty');
    check(Command.getCapabilities().enabled === true, 'Command authorized by host');
    // Intentionally omit options: the default inherit policy must use the
    // empty Execution.env snapshot, never the MCP host process environment.
    const result = await Command.run('/bin/sh', ['-c', 'printf "%s" "${OPENDESK_MCP_TEST_SENTINEL-unset}"']);
    check(result.exitCode === 0 && result.stderr === '', 'controlled command completed cleanly');
    check(result.stdout === 'unset', 'default command environment excludes host sentinel');
    report({ scenario, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    return;
  }
  if (scenario === 'large-output') {
    console.log('x'.repeat(400000));
    return;
  }
  if (scenario === 'sqlite-disabled') {
    check(typeof SQLite === 'undefined', 'SQLite not injected without host authorization');
    report({ scenario, sqliteEnabled: false });
    return;
  }
  if (scenario === 'rejection') await Promise.reject(new Error('mcp-advanced-rejection'));
  if (scenario === 'timeout') {
    while (true) {} // Deliberately requires host deadline interruption.
  }
  if (scenario === 'cancel' || scenario === 'eof') {
    // Deliberately leave an execution-owned handle open for teardown to close.
    const db = await SQLite.open({ path: ':memory:' });
    await db.exec('CREATE TABLE cleanup_fixture (value TEXT)');
    await File.writeJSON(path.resolve(Execution.artifactDir, 'ready.json'), {
      executionId: Execution.executionId, scenario,
    });
    report({ scenario, ready: true });
    while (true) {} // Cancellation must interrupt CPU work, not just timers.
  }

  check(scenario === 'runtime', 'known scenario');
  check(sameJSON(input.payload, {
    nested: { text: '中文 fixture', number: 42, flag: false, nil: null },
    array: [0, '', true, null, { value: '001' }],
  }), 'nested JSON types and values');
  check(Object.keys(Execution.env).length === 0, 'empty environment snapshot');
  check(Object.isFrozen(Execution) && Object.isFrozen(Execution.env), 'frozen context');
  check(Execution.scriptPath === null && Execution.scriptDir === null, 'inline source identity');
  check(path.resolve() === Execution.workdir, 'resolve uses execution workdir');
  const resolved = path.resolve('first', '..', 'mcp-advanced');
  check(resolved === path.resolve(Execution.workdir, 'mcp-advanced'), 'path normalization');
  const center = Geometry.center({
    x: -20, y: 10, width: 100, height: 40, coordinateSpace: 'screen',
  });
  check(center.x === 30 && center.y === 30 && center.coordinateSpace === 'screen', 'geometry center');

  const fixture = path.resolve(Execution.artifactDir, 'fixture.json');
  await File.writeJSON(fixture, input.payload);
  const roundTrip = await File.readJSON(fixture);
  check(sameJSON(roundTrip, input.payload), 'JSON round trip');

  const command = Command.getCapabilities();
  const accessibility = Accessibility.getCapabilities();
  check(command.enabled === false, 'Command disabled by host');
  check(accessibility.hostAuthorization.enabled === false, 'Accessibility disabled by host');
  check(typeof SQLite !== 'undefined', 'host sqlite authorization');
  const db = await SQLite.open({ path: ':memory:' });
  let rows;
  try {
    await db.exec('CREATE TABLE fixture (id INTEGER PRIMARY KEY, value TEXT, enabled INTEGER, nil TEXT)');
    const inserted = await db.exec('INSERT INTO fixture (id, value, enabled, nil) VALUES (?, ?, ?, ?)',
      [7, "中文 '); DROP TABLE fixture; --", false, null]);
    check(inserted.changes === 1, 'insert changes');
    rows = await db.query('SELECT id, value, enabled, nil FROM fixture WHERE id = :id', { id: 7 });
    check(rows.length === 1 && rows[0].id === 7 && rows[0].enabled === 0 &&
      rows[0].nil === null && rows[0].value === "中文 '); DROP TABLE fixture; --", 'native parameter binding');
  } finally {
    await db.close();
  }
  await db.close(); // Public close is idempotent.
  let closed = false;
  try { await db.query('SELECT 1'); } catch (error) { closed = error.code === 'CLOSED'; }
  check(closed, 'closed handle rejects new operations');
  report({ scenario, ok: true, executionId: Execution.executionId, fixture,
    artifactDir: Execution.artifactDir, input: input.payload, center, rows,
    commandEnabled: command.enabled, accessibilityEnabled: accessibility.hostAuthorization.enabled });
}

// Throw directly during script evaluation, independently of Promise rejection.
if (Execution.input && Execution.input.scenario === 'sync-error') {
  throw new Error('mcp-advanced-sync-error');
}
await main();
