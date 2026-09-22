'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { checkHandoff, checkHandoffConsumption } = require('../../workflows/agent-to-recipe/scripts/check-handoff.js');
const REPO = path.resolve(__dirname, '../..');
const TOOL = path.join(REPO, 'workflows/agent-to-recipe/scripts/check-handoff.js');
const BASE = path.join(REPO, '.runtime/tests/workflows');
const SCHEMA = 'agent-to-recipe/v1';
fs.mkdirSync(BASE, { recursive: true });

function fixture(t) {
  const root = fs.mkdtempSync(path.join(BASE, 'handoff-'));
  // Only remove this test's exclusive fixture; never clean shared .runtime roots.
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = name => path.join(root, name);
  const write = (name, value) => {
    fs.mkdirSync(path.dirname(file(name)), { recursive: true });
    fs.writeFileSync(file(name), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const ref = (name, kind = 'fixture') => ({ kind, rootId: 'task', path: name,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file(name))).digest('hex'), schemaVersion: 'fixture/v1' });
  write('input.json', { input: 25 });
  write('candidate.js', "throw new Error('NEVER_EXECUTE_THE_CANDIDATE');\n");
  write('evidence.txt', 'synthetic offline evidence, not a desktop run');
  const request = { schemaVersion: SCHEMA, taskId: 'test-task', workPackageId: 'W010', attemptId: 'a001',
    skill: 'application-engineer', mode: 'harden', planRevision: 'r001', contractRef: null,
    inputRefs: [ref('input.json')], requiredOutputs: ['candidate'], authority: { mode: 'read-only' },
    capabilities: [], budgets: { maxAttempts: 1 }, environmentRef: null, evidenceRoots: [] };
  let handoff;
  const saveRequest = () => {
    write('request.json', request);
    if (handoff) handoff.requestRef = { ...ref('request.json'), schemaVersion: SCHEMA };
  };
  saveRequest();
  handoff = { schemaVersion: SCHEMA, taskId: 'test-task', workPackageId: 'W010', attemptId: 'a001',
    skill: 'application-engineer', producerVersion: 'fixture-only',
    requestRef: { ...ref('request.json'), schemaVersion: SCHEMA }, inputRefs: [ref('input.json')],
    executionStatus: 'completed', artifacts: [ref('candidate.js', 'candidate')],
    gate: { verdict: 'pass', scope: 'synthetic static fixture only', criterionRefs: ['fixture-integrity'],
      evidenceRefs: [ref('evidence.txt')] }, facts: [], assumptions: [], unresolved: [], sideEffects: [],
    failures: [], planDelta: null, nextRequest: null };
  const options = { request: file('request.json'), handoff: file('handoff.json'), roots: [['task', root]] };
  const check = () => { write('handoff.json', handoff); return checkHandoff(options); };
  return { root, file, write, ref, request, handoff, options, saveRequest, check };
}
const fails = (report, code) => {
  assert.equal(report.integrity, 'fail');
  assert.ok(report.errors.some(error => error.code === code), JSON.stringify(report.errors));
  assert.equal(report.desktopActionsAuthorized, false);
};

test('valid envelope verifies bytes without running candidate or mutating the task', t => {
  const f = fixture(t);
  const report = f.check();
  assert.equal(report.integrity, 'pass');
  assert.equal(report.desktopActionsAuthorized, false);
  assert.ok(report.checkedFiles >= 4);
  assert.ok(report.notEvaluated.includes('business-correctness'));
  const before = fs.readdirSync(f.root).map(name => [name, fs.readFileSync(f.file(name)).toString('base64')]);
  assert.deepEqual(checkHandoff(f.options), report);
  assert.deepEqual(fs.readdirSync(f.root).map(name => [name, fs.readFileSync(f.file(name)).toString('base64')]), before);
});

function downstream(f, overrides = {}) {
  const request = { ...f.request, workPackageId: 'W020', attemptId: 'a002', skill: 'recipe-build', mode: 'normal',
    inputRefs: [f.ref('candidate.js', 'candidate')], requiredOutputs: ['candidate-review'], ...overrides };
  f.write('consumer-request.json', request);
  return { ...f.options, consumerRequest: f.file('consumer-request.json') };
}

test('formal downstream request consumes an exact artifact published by the handoff', t => {
  const f = fixture(t); f.check();
  const report = checkHandoffConsumption(downstream(f));
  assert.equal(report.integrity, 'pass', JSON.stringify(report));
  assert.equal(report.producerIntegrity, 'pass');
  assert.equal(report.consumedArtifacts.length, 1);
  assert.equal(report.consumedArtifacts[0].sha256, f.handoff.artifacts[0].sha256);
  assert.equal(report.desktopActionsAuthorized, false);
});

test('formal downstream request rejects an un-published or stale artifact version', t => {
  const f = fixture(t); f.check();
  f.write('old-candidate.js', fs.readFileSync(f.file('candidate.js'), 'utf8'));
  const report = checkHandoffConsumption(downstream(f, { inputRefs: [f.ref('old-candidate.js', 'candidate')] }));
  fails(report, 'CONSUMER_INPUT_NOT_PUBLISHED');
});

test('failed producer handoff cannot be promoted through the normal consumption proof', t => {
  const f = fixture(t); f.handoff.gate.verdict = 'fail'; f.handoff.executionStatus = 'failed'; f.check();
  const report = checkHandoffConsumption(downstream(f));
  fails(report, 'PRODUCER_GATE');
});

test('formal downstream request cannot cross task identity', t => {
  const f = fixture(t); f.check();
  const report = checkHandoffConsumption(downstream(f, { taskId: 'another-task' }));
  fails(report, 'TASK_MISMATCH');
});
for (const field of ['taskId', 'workPackageId', 'attemptId', 'skill']) {
  test('rejects a handoff from another ' + field, t => {
    const f = fixture(t); f.handoff[field] = 'different'; fails(f.check(), 'IDENTITY_MISMATCH');
  });
}
for (const field of ['schemaVersion', 'sideEffects', 'unresolved', 'producerVersion', 'planDelta']) {
  test('rejects missing required handoff field ' + field, t => {
    const f = fixture(t); delete f.handoff[field]; fails(f.check(), 'MISSING_FIELD');
  });
}
test('rejects unknown envelope schema instead of adapting Human plans', t => {
  const f = fixture(t); f.handoff.schemaVersion = 'human-to-recipe/v999'; fails(f.check(), 'SCHEMA_VERSION');
});
test('rejects blocked as an executionStatus', t => {
  const f = fixture(t); f.handoff.executionStatus = 'blocked'; fails(f.check(), 'EXECUTION_STATUS');
});
test('preserves failed Gate as a claim even when integrity passes', t => {
  const f = fixture(t); f.handoff.gate.verdict = 'fail'; f.handoff.executionStatus = 'interrupted';
  f.handoff.sideEffects = [{ outcome: 'unknown' }];
  const report = f.check();
  assert.equal(report.integrity, 'pass');
  assert.equal(report.declared.gateVerdict, 'fail');
  assert.equal(report.desktopActionsAuthorized, false);
  assert.ok(report.notEvaluated.includes('side-effect-outcome'));
});
test('rejects missing Gate scope', t => {
  const f = fixture(t); delete f.handoff.gate.scope; fails(f.check(), 'GATE_SCOPE');
});
test('rejects malformed reference arrays', t => {
  const f = fixture(t); f.handoff.artifacts = 'candidate.js'; fails(f.check(), 'REF_ARRAY');
});
test('rejects a missing evidence file', t => {
  const f = fixture(t); fs.unlinkSync(f.file('evidence.txt')); fails(f.check(), 'FILE_UNREADABLE');
});
test('rejects modified candidate bytes', t => {
  const f = fixture(t); f.write('candidate.js', 'different candidate'); fails(f.check(), 'HASH_MISMATCH');
});
test('rejects old handoff after request revision changes', t => {
  const f = fixture(t); f.request.planRevision = 'r002'; f.write('request.json', f.request);
  fails(f.check(), 'HASH_MISMATCH');
});
test('rejects binding another request with equal bytes', t => {
  const f = fixture(t); f.write('another-request.json', fs.readFileSync(f.file('request.json'), 'utf8'));
  f.handoff.requestRef = { ...f.ref('another-request.json'), schemaVersion: SCHEMA };
  fails(f.check(), 'REQUEST_BINDING');
});
test('rejects consumed inputs absent from the request', t => {
  const f = fixture(t); f.handoff.inputRefs.push(f.ref('evidence.txt')); fails(f.check(), 'UNDECLARED_INPUT');
});
test('rejects placeholder and malformed hashes', t => {
  const f = fixture(t); f.handoff.artifacts[0].sha256 = '<sha256>'; fails(f.check(), 'INVALID_REF');
});
for (const unsafe of ['../candidate.js', '/candidate.js', 'C:\\candidate.js', '\\\\host\\candidate.js',
  'file:secret', './candidate.js', 'a//candidate.js', 'a/../candidate.js', 'candidate.js\u0000']) {
  test('rejects unsafe ref path ' + JSON.stringify(unsafe), t => {
    const f = fixture(t); f.handoff.artifacts[0].path = unsafe; fails(f.check(), 'UNSAFE_PATH');
  });
}
test('does not trust roots proposed by request.evidenceRoots', t => {
  const f = fixture(t); f.request.evidenceRoots = [{ rootId: 'secret', directory: f.root }];
  f.saveRequest(); f.handoff.artifacts[0].rootId = 'secret'; fails(f.check(), 'UNAUTHORIZED_ROOT');
});
test('rejects entry files outside explicit roots', t => {
  const f = fixture(t); f.options.request = path.join(BASE, 'not-allowed.json'); fails(f.check(), 'UNAUTHORIZED_ROOT');
});
test('rejects duplicate root IDs', t => {
  const f = fixture(t); f.options.roots.push(['task', f.root]); fails(f.check(), 'DUPLICATE_ROOT');
});
test('rejects a symlink reference', t => {
  const f = fixture(t);
  try { fs.symlinkSync(f.file('candidate.js'), f.file('linked.js')); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) return t.skip('Host does not permit symlinks.'); throw error; }
  f.handoff.artifacts[0].path = 'linked.js'; fails(f.check(), 'SYMLINK');
});
test('rejects a symlinked parent directory', t => {
  const f = fixture(t); fs.mkdirSync(f.file('real')); f.write('real/input.json', '{}');
  try { fs.symlinkSync(f.file('real'), f.file('linked'), 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) return t.skip('Host does not permit directory symlinks.'); throw error; }
  f.handoff.artifacts[0] = f.ref('real/input.json'); f.handoff.artifacts[0].path = 'linked/input.json';
  fails(f.check(), 'SYMLINK');
});
test('rejects a directory used as an artifact', t => {
  const f = fixture(t); fs.mkdirSync(f.file('directory')); f.handoff.artifacts[0].path = 'directory';
  fails(f.check(), 'NOT_FILE');
});
test('checks canonical continuation references too', t => {
  const f = fixture(t); f.handoff.continuation = { sourceAssetRefs: [f.ref('evidence.txt')] };
  f.write('evidence.txt', 'changed'); fails(f.check(), 'HASH_MISMATCH');
});
test('rejects half-written JSON and does not echo its sensitive contents', t => {
  const f = fixture(t); f.check(); f.write('handoff.json', '{"secret":"DO_NOT_ECHO",');
  const report = checkHandoff(f.options); fails(report, 'INVALID_JSON');
  assert.ok(!JSON.stringify(report).includes('DO_NOT_ECHO'));
});
test('rejects invalid UTF-8 JSON', t => {
  const f = fixture(t); f.check(); fs.writeFileSync(f.file('handoff.json'), Buffer.from([0xff]));
  fails(checkHandoff(f.options), 'INVALID_JSON');
});
test('bounds document size', t => {
  const f = fixture(t); f.check(); fs.writeFileSync(f.file('handoff.json'), ' '.repeat(4 * 1024 * 1024 + 1));
  fails(checkHandoff(f.options), 'SIZE_LIMIT');
});
test('bounds nested JSON structure', t => {
  const f = fixture(t); let nested = f.handoff.assumptions = {};
  for (let i = 0; i < 40; i++) nested = nested.child = {};
  fails(f.check(), 'STRUCTURE_LIMIT');
});
test('CLI returns parseable integrity report and status codes', t => {
  const f = fixture(t); f.check();
  const args = ['--request', f.options.request, '--handoff', f.options.handoff, '--root', 'task=' + f.root];
  let result = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', cwd: REPO });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).integrity, 'pass');
  f.write('candidate.js', 'stale');
  result = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', cwd: REPO });
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).integrity, 'fail');
  for (const invalid of [[], ['--unknown', 'x'], ['--root'], [...args, '--request', 'x']]) {
    result = spawnSync(process.execPath, [TOOL, ...invalid], { encoding: 'utf8', cwd: REPO });
    assert.equal(result.status, 2); assert.equal(result.stdout, '');
  }
  result = spawnSync(process.execPath, [TOOL, '--help'], { encoding: 'utf8', cwd: REPO });
  assert.equal(result.status, 0); assert.match(result.stdout, /Read-only/);
});

// Root registrations are metadata, not files to read and not new permissions.
test('does not misinterpret an evidence root registration as a hashed file ref', t => {
  const f = fixture(t); f.request.evidenceRoots = [{ rootId: 'task', path: f.root, executionId: 'fixture' }];
  f.saveRequest(); assert.equal(f.check().integrity, 'pass');
});
test('rejects incomplete canonical evidence refs', t => {
  const f = fixture(t); delete f.handoff.gate.evidenceRefs[0].sha256; fails(f.check(), 'INVALID_REF');
});
test('rejects evidence refs missing their root ID', t => {
  const f = fixture(t); delete f.handoff.gate.evidenceRefs[0].rootId; fails(f.check(), 'INVALID_REF');
});
