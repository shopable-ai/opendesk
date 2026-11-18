'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {EvidenceRecorder} = require('../mcp/tools/macos-smoke/main.js');
const root = path.resolve(__dirname, '../..');
const host = process.env.OPENDESK_FLOATING_LIFECYCLE_HOST_BINARY;
test('production Runner fences FloatingWindow create/show against close', {
  skip: !host && 'set OPENDESK_FLOATING_LIFECYCLE_HOST_BINARY to the controlled Runner host', timeout: 90000,
}, async t => {
  const base = path.join(root, '.runtime/tests/mcp-depth/floating-lifecycle'); fs.mkdirSync(base, {recursive: true});
  const run = fs.mkdtempSync(path.join(base, 'run-')); t.diagnostic('evidence: ' + run);
  const recorder = new EvidenceRecorder(run, 'floating-lifecycle');
  const binary = fs.realpathSync(host), script = path.join(__dirname, 'floating-window-close.js');
  const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const sources = [script, __filename, path.join(__dirname, 'tools/floating-lifecycle/main.go'),
    path.join(root, 'automation/floating_window.go'), path.join(root, 'automation/custom_ui.go'),
    path.join(root, 'pkg/execution/runner.go'), path.join(root, 'pkg/customui/session.go')];
  recorder.writeJSON('provenance.json', {binary, binarySha256: hash(binary),
    sources: Object.fromEntries(sources.map(p => [p, hash(p)])), driver: 'gated MemoryDriver', productionRunner: true, realGUI: false});
  const rows = [];
  for (const scenario of ['create-late', 'create-cancel', 'show-late', 'immediate', 'normal', 'create-failure-retry', 'late-close-retry', 'close-all',
    'cleanup-create-timeout', 'cleanup-show-error-timeout', 'cleanup-show-timeout', 'cleanup-state-timeout', 'cleanup-state-retry', 'cleanup-state-teardown']) {
    await t.test(scenario, () => {
      const directory = path.join(run, scenario); fs.mkdirSync(directory);
      const child = spawnSync(binary, [directory, script, scenario], {
        cwd: root, env: {HOME: directory, TMPDIR: directory}, encoding: 'utf8', timeout: 12000, maxBuffer: 4 * 1024 * 1024,
      });
      fs.writeFileSync(path.join(directory, 'process.json'), JSON.stringify({status: child.status, signal: child.signal,
        stdout: child.stdout, stderr: child.stderr, error: child.error && child.error.message}, null, 2));
      const resultPath = path.join(directory, 'artifacts/result.json');
      assert(fs.existsSync(resultPath), 'Runner did not finish: ' + JSON.stringify({status: child.status, error: child.error && child.error.message,
        oracle: JSON.parse(fs.readFileSync(path.join(directory, 'oracle.json')))}));
      const result = JSON.parse(fs.readFileSync(resultPath));
      rows.push(result);
      assert.equal(result.passed, true, result.failure);
      assert.equal(child.status, 0, child.stderr);
      // This snapshot was captured before Runner teardown, so teardown cannot
      // disguise the early-close leak. Calls are recorded by the driver itself.
      const calls = result.oracle.calls;
      const returned = calls.indexOf('js:close-returned');
      assert(returned >= 0);
      assert.equal(calls.slice(returned + 1).includes('show:entered'), false);
      assert.equal(result.oracle.resources.Sinks, scenario === 'cleanup-state-teardown' ? 1 : 0);
      const teardown = JSON.parse(fs.readFileSync(path.join(directory, 'oracle.json')));
      assert(teardown.calls.includes('session:closed') && teardown.calls.includes('driver:closed') && teardown.calls.includes('runner:returned'),
        'production Runner teardown did not reach driver.Close and return');
      assert.equal(teardown.resources.Sinks, 0);
      if (scenario.startsWith('cleanup-')) {
        assert(result.cleanupMillis < 5000);
        assert.equal(calls.filter(call => call === 'close:timeout').length, 1);
        assert.equal(calls.includes('close:unbounded'), false);
        assert((scenario === 'cleanup-state-teardown' ? teardown.calls : calls).includes('close:returned'));
        assert.equal(result.showOutcome.ok, false, 'cleanup failure must not turn canceled show into success');
        assert.match(result.showOutcome.message, /cleanup failed/);
        assert.match(result.showOutcome.message, /deadline exceeded/);
        if (scenario === 'cleanup-create-timeout') {
          assert(calls.includes('close:failed'), 'explicit close failure/retry was not exercised');
          assert.equal(calls.includes('show:entered'), false);
        }
      }
      if (scenario === 'create-late' || scenario === 'late-close-retry') {
        assert(calls.includes('create:delivered'));
        assert(calls.includes('close:returned'));
        assert.equal(calls.includes('show:entered'), false);
      }
    });
  }
  recorder.writeJSON('summary.json', {scenarios: rows.length, passed: rows.filter(row => row.passed).length,
    productionRunner: true, realGUI: false});
});
