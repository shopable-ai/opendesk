// Formal Runtime assertions, driven by agent-cwd.test.js and its synthetic
// execution.Runner host. Every CLI and writable path belongs to that fixture.
'use strict';

const rows = [];
const outputPath = File.join(Execution.artifactDir, 'agent-cwd-results.json');
const invocationRoot = File.join(Execution.artifactDir, 'agent');
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const fixture of Execution.input.cases) {
  const row = {name: fixture.name, backend: fixture.backend, passed: false};
  let result;
  let error;
  try {
    const caps = Agent.getCapabilities({profile: fixture.name});
    assert(caps.checked === false && caps.available === null, 'capability query probed a CLI');
    assert(!File.exists(fixture.trace), 'capability query launched a CLI');
    const options = {profile: fixture.name, prompt: 'CASE:text-ok'};
    if (fixture.cwd !== undefined) options.cwd = fixture.cwd;
    if (fixture.preAbort) {
      const controller = new AbortController();
      controller.abort();
      options.signal = controller.signal;
    }
    try {
      result = await Agent.run(options);
    } catch (caught) {
      error = caught;
    }
    row.code = error ? error.code : null;
    row.data = result ? result.data : null;
    row.started = File.exists(fixture.trace);
    row.actualCwd = row.started ? File.read(fixture.trace).trim() : null;
    row.invocationChildren = File.exists(invocationRoot) ? File.listDir(invocationRoot) : [];
    if (fixture.expectedCode) {
      assert(error && error.code === fixture.expectedCode,
        'expected ' + fixture.expectedCode + ', received ' + String(error && error.code));
      assert(!row.started, 'rejected cwd started a CLI');
    } else {
      if (error) throw error;
      assert(result.data === (fixture.backend === 'codex' ? 'codex-text' : 'claude-text'), 'wrong fixture result');
      assert(result.meta.backend === fixture.backend, 'wrong backend');
      row.callId = result.meta.callId;
      row.invocation = File.join(File.realPath(invocationRoot), result.meta.callId);
      assert(row.started, 'successful fixture did not start');
      const expected = fixture.defaultCwd ? row.invocation : fixture.realCwd;
      assert(row.actualCwd === expected, 'physical CLI cwd differs from independent realpath oracle');
      assert(!File.exists(row.invocation), 'invocation directory survived successful cleanup');
    }
    assert(row.invocationChildren.length === 0, 'invocation resources survived cleanup');
    row.passed = true;
  } catch (caught) {
    row.failure = String(caught && caught.stack || caught);
  }
  rows.push(row);
  File.write(outputPath, JSON.stringify(rows, null, 2));
}

const failed = rows.filter(row => !row.passed);
if (failed.length) throw new Error('Agent cwd contract failures: ' + failed.map(row => row.name).join(', '));
console.log('[AGENT-CWD PASS] ' + rows.length + ' controlled cases');
