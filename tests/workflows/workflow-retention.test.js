'use strict';

// Real coordinator file/CLI behavior. No Producer model, native API or desktop
// run is simulated as passing. Retained files remain under .runtime for review.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixture } = require('./tools/stage-review-fixture.js');
const REPO = path.resolve(__dirname, '../..');
const RUNNER = path.join(REPO, 'workflows/agent-to-recipe/scripts/workflow-runner.js');
const BASE = path.join(REPO, '.runtime/tests/agent-to-recipe/workflow-retention');
fs.mkdirSync(BASE, { recursive: true });
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const cmd = (...args) => spawnSync(process.execPath, [RUNNER, ...args], { cwd: REPO, encoding: 'utf8', timeout: 15000 });
const checks = root => fs.readdirSync(path.join(root, 'checks')).sort().map(name => path.join(root, 'checks', name));

function task(id = 't') {
  const root = fs.mkdtempSync(path.join(BASE, 'task-'));
  const init = cmd('init', '--task-root', root, '--task-id', id);
  assert.equal(init.status, 0, init.stderr);
  return root;
}

function request(root, attemptId) {
  const file = path.join(root, 'prepared-request.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 'agent-to-recipe/v1', taskId: 't', attemptId,
    workPackageId: 'W1', skill: 'automation-plan', mode: 'plan/create', planRevision: 'r1',
    contractRef: null, inputRefs: [], requiredOutputs: ['TaskContract', 'WorkPlan'],
    authority: { desktopActions: false }, capabilities: {}, budgets: { modelCalls: 0 },
    environmentRef: null, evidenceRoots: [] }));
  return file;
}

test('request acquisition failure leaves an inspectable attempt before Producer starts', () => {
  const root = task();
  const result = cmd('begin', '--task-root', root, '--stage', 'S1', '--attempt-id', 'failed-request',
    '--request', path.join(root, 'missing-request.json'), '--root', 'task=' + root);
  assert.equal(result.status, 2);
  const attempt = path.join(root, 'attempts/failed-request');
  assert.ok(fs.existsSync(path.join(attempt, 'attempt.md')));
  assert.equal(read(path.join(attempt, 'preparation-error.json')).producerStarted, false);
  assert.equal(read(path.join(attempt, 'started.json')).checkerVerdict, 'not-run');
  assert.ok(fs.existsSync(path.join(checks(root).at(-1), 'entry-error.md')));
  assert.match(fs.readFileSync(path.join(root, 'last-check.md'), 'utf8'), /failed-request\/attempt.md/);
  assert.equal(read(path.join(root, 'progress.json')).status, 'ready');
});

test('malformed/partial Producer output and errors retain exact bytes without overwriting a prior capture', () => {
  const root = task();
  const args = ['--task-root', root, '--stage', 'S1', '--attempt-id', 'a1',
    '--request', request(root, 'a1'), '--root', 'task=' + root];
  assert.equal(cmd('begin', ...args).status, 0);
  const raw = path.join(root, 'raw.txt');
  const error = path.join(root, 'transport.txt');
  fs.writeFileSync(raw, '{"partial":');
  fs.writeFileSync(error, 'Timed out with partial output; actionState unknown.');
  const captureArgs = ['--task-root', root, '--attempt-id', 'a1', '--output', raw,
    '--error-file', error, '--root', 'task=' + root];
  assert.equal(cmd('capture', ...captureArgs).status, 0);
  fs.writeFileSync(raw, '{"next":"different bytes"}');
  assert.equal(cmd('capture', ...captureArgs).status, 0);
  const folder = path.join(root, 'attempts/a1/captures');
  const captures = fs.readdirSync(folder).map(name => path.join(folder, name));
  assert.equal(captures.length, 2);
  assert.deepEqual(captures.map(dir => fs.readFileSync(path.join(dir, 'producer-output.txt'), 'utf8')).sort(),
    ['{"partial":', '{"next":"different bytes"}'].sort());
  assert.ok(captures.every(dir => read(path.join(dir, 'capture.json')).checkerVerdict === 'not-run'));
  assert.equal(cmd('begin', ...args).status, 2, 'Same attempt cannot restart/overwrite');
  assert.equal(read(path.join(root, 'progress.json')).status, 'running');
});

test('stage failure keeps report, exact input/output snapshots and owner after a later successful check', t => {
  const root = task();
  const f = fixture(t);
  f.reviews[6].hardFails = ['Necessary runtime first-result read omitted'];
  f.run('S7', 'S8');
  const args = ['resume', '--task-root', root, '--record', path.join(f.dir, 'review.json'),
    '--root', 'run=' + f.dir, '--from', 'S7', '--to', 'S8'];
  assert.equal(cmd(...args).status, 2);
  const failed = checks(root).at(-1);
  const report = read(path.join(failed, 'checker-result.json'));
  assert.equal(report.firstInvalidBoundary, 'S7');
  assert.deepEqual(report.failureOwner, { stage: 'S7', skill: 'trace-distill' });
  assert.deepEqual(report.preservedUpstream, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
  const index = read(path.join(failed, 'snapshot-index.json'));
  assert.ok(index.some(item => item.stage === 'S7' && item.ref.path === 'S7-output.json'));
  assert.ok(index.every(item => item.status === 'retained' && fs.existsSync(path.join(failed, item.snapshot))));
  assert.equal(read(path.join(root, 'progress.json')).currentStage, 'S7');
  const frozenReport = fs.readFileSync(path.join(failed, 'checker-result.json'));
  f.reviews[6].hardFails = [];
  f.run('S7', 'S8');
  assert.equal(cmd(...args).status, 0);
  assert.deepEqual(fs.readFileSync(path.join(failed, 'checker-result.json')), frozenReport);
  assert.equal(read(path.join(root, 'progress.json')).currentStage, 'S8');
  assert.ok(read(path.join(root, 'progress.json')).reviewRef.startsWith('checks/'));
});

test('missing file and invalid options leave entry diagnostics without inventing a business owner', () => {
  const root = task();
  const result = cmd('resume', '--task-root', root, '--record', path.join(root, 'absent.json'),
    '--root', 'task=' + root);
  assert.equal(result.status, 2);
  const before = checks(root).at(-1);
  const failure = read(path.join(before, 'entry-error.json'));
  assert.equal(failure.checkerExecuted, false);
  assert.equal(failure.failureOwner, null);
  assert.ok(fs.existsSync(path.join(before, 'checker-options.json')));
  const invalid = cmd('resume', '--task-root', root, '--invented', 'value');
  assert.equal(invalid.status, 2);
  assert.ok(fs.existsSync(path.join(checks(root).at(-1), 'entry-error.json')));
  assert.ok(fs.existsSync(path.join(before, 'entry-error.json')));
});

test('malformed record stays blocked without assigning unknown content to an upstream owner', () => {
  const root = task();
  const record = path.join(root, 'broken.json');
  fs.writeFileSync(record, '{"stages":');
  const result = cmd('resume', '--task-root', root, '--record', record, '--root', 'task=' + root);
  assert.equal(result.status, 2);
  const checked = checks(root).at(-1);
  assert.equal(fs.readFileSync(path.join(checked, 'record.json'), 'utf8'), '{"stages":');
  assert.ok(read(path.join(checked, 'checker-result.json')).errors.some(item => item.code === 'INVALID_JSON'));
  assert.equal(read(path.join(checked, 'checker-result.json')).firstInvalidBoundary, null);
  assert.equal(read(path.join(checked, 'checker-result.json')).failureOwner, null);
  assert.notEqual(read(path.join(root, 'progress.json')).status, 'qualified');
  assert.equal(read(path.join(root, 'progress.json')).status, 'blocked');
});

test('final scope is the checker final call and status inspection does not mutate retained files', t => {
  const root = task();
  const f = fixture(t);
  f.run('S12', 'S12', true);
  const final = cmd('resume', '--task-root', root, '--record', path.join(f.dir, 'review.json'),
    '--root', 'run=' + f.dir, '--final');
  assert.equal(final.status, 0, final.stderr);
  const report = read(path.join(checks(root).at(-1), 'checker-result.json'));
  assert.equal(report.from, 'S12');
  assert.equal(report.to, 'S12');
  assert.ok(report.final);
  const before = checks(root).length;
  assert.equal(cmd('status', '--task-root', root).status, 0);
  assert.equal(checks(root).length, before);
  assert.equal(read(path.join(root, 'progress.json')).status, 'qualified');
});
