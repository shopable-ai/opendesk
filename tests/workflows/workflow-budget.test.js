'use strict';

// Controlled coordinator fixtures only; no task/business facts, models, Runtime
// calls, desktop, networking or evaluation of referenced source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { init, reserve, settle, status } = require('../../workflows/agent-to-recipe/scripts/workflow-budget.js');
const REPO = path.resolve(__dirname, '../..');
const CLI = path.join(REPO, 'workflows/agent-to-recipe/scripts/workflow-budget.js');
const BASE = path.join(REPO, '.runtime/tests/agent-to-recipe/completion-20261001/workflow-budget-fixtures');
fs.mkdirSync(BASE, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const zero = keys => Object.fromEntries(Object.keys(keys).map(key => [key, 0]));
const rejects = (code, action) => assert.throws(action, error => error.code === code);
function fixture(activate = true) {
  const root = fs.mkdtempSync(path.join(BASE, 'scope-'));
  const limits = { scopeElapsedMs: 100000, hostToolInvocations: 12, modelRequests: 6,
    publicApiCalls: 20, nativeInputs: 10, executionAttempts: 5, qualificationRuns: 3 };
  const initialUsed = { ...zero(limits), scopeElapsedMs: 5, hostToolInvocations: 1, modelRequests: 1 };
  const units = Object.fromEntries(Object.keys(limits).map(key => [key, 'fixture unit ' + key]));
  const put = (name, value, raw = false) => {
    const bytes = Buffer.from(raw ? value : JSON.stringify(value));
    fs.writeFileSync(path.join(root, name), bytes);
    return { rootId: 'scope', path: name, sha256: sha(bytes) };
  };
  const proposalRef = put('proposal.json', { scopeId: 'controlled-current-scope', proposedCeilings: limits, units,
    balance: { chargedCurrentDiagnosticEnvelope: initialUsed }, publication: 'proposal only' });
  const config = { scopeId: 'controlled-current-scope', root, roots: [['scope', root]],
    limits, units, initialUsed, deadline: new Date(Date.now() + 90000).toISOString(), proposalRef };
  config.adoptionRef = put('adoption.json', { adopted: true, host: 'controlled-test-host',
    authoritySource: 'internal test data; no real scope authorization', adoptedAt: new Date().toISOString(),
    binding: { ...config } });
  if (activate) init(config);
  const input = put('input.json', { internal: true });
  const source = put('input.js', "throw new Error('REFERENCED SOURCE MUST NEVER RUN');", true);
  const admission = (attemptId = 'a1', scopeCounters = { modelRequests: 1 }) => {
    const requestRef = put(attemptId + '-request.json', { schemaVersion: 'agent-to-recipe/v1',
      taskId: 'internal-task', attemptId, workPackageId: 'internal-work', skill: 'internal-owner',
      inputRefs: [input], contractRef: null, budgets: { modelRequests: 1 }, authority: { desktopActions: false } });
    const ownerEvidenceRef = put(attemptId + '-owner.json', { scopeId: config.scopeId, attemptId,
      owner: 'controlled-owner', terminal: true, sideEffectState: 'known', observedAt: new Date().toISOString() });
    return { scopeId: config.scopeId, attemptId, scopeCounters, requestRef, objectRefs: [input, source],
      owner: 'controlled-owner', ownerEvidenceRef };
  };
  const settlement = (receipt, outcome = 'success', counts = {}) => {
    const scopeCounters = { ...zero(limits), ...counts };
    const evidenceRef = put(receipt.attemptId + '-settlement-' + outcome + '.json', {
      scopeId: config.scopeId, attemptId: receipt.attemptId, admissionSequence: receipt.sequence,
      owner: 'controlled-owner', outcome, scopeCounters, observedAt: new Date(Date.now()).toISOString(), terminal: outcome !== 'unknown',
      sideEffectState: outcome === 'unknown' ? 'unknown' : 'known' });
    return { scopeId: config.scopeId, attemptId: receipt.attemptId, outcome, scopeCounters, evidenceRef };
  };
  return { root, config, put, admission, settlement, limits, input };
}
function cli(command, root, data) {
  return spawnSync(process.execPath, [CLI, command, '--root', root, ...(data ? ['--data', data] : [])],
    { cwd: REPO, encoding: 'utf8', timeout: 15000 });
}

test('init requires exact host adoption, units, proposal ceilings and charged diagnostic envelope', () => {
  const f = fixture(false);
  const adoption = JSON.parse(fs.readFileSync(path.join(f.root, 'adoption.json')));
  rejects('ADOPTION', () => init({ ...f.config, deadline: new Date(Date.now() + 80000).toISOString() }));
  rejects('UNITS', () => init({ ...f.config, units: {} }));
  rejects('PROPOSAL', () => init({ ...f.config, limits: { ...f.limits, nativeInputs: 11 } }));
  rejects('INITIAL_USED', () => init({ ...f.config, initialUsed: zero(f.limits) }));
  rejects('ROOT', () => init({ ...f.config, root: REPO }));
  adoption.adopted = false;
  f.config.adoptionRef = f.put('adoption.json', adoption);
  rejects('ADOPTION', () => init(f.config));
  assert.equal(fs.existsSync(path.join(f.root, 'scope-ledger.sqlite')), false);
});

test('missing ledger refuses reserve/settle/status rather than auto-initializing', () => {
  const f = fixture(false);
  rejects('MISSING_LEDGER', () => reserve(f.root, f.admission()));
  rejects('MISSING_LEDGER', () => settle(f.root, {}));
  rejects('MISSING_LEDGER', () => status(f.root));
});

test('committed receipt binds request and object hashes; slots never refunded; source is data only', () => {
  const f = fixture();
  const a = f.admission('a1', { modelRequests: 1, executionAttempts: 1 });
  const receipt = reserve(f.root, a);
  assert.equal(receipt.kind, 'reserve');
  const db = new DatabaseSync(path.join(f.root, 'scope-ledger.sqlite'), { readOnly: true });
  const row = db.prepare('SELECT digest FROM events WHERE sequence=?').get(receipt.sequence);
  db.close();
  assert.equal(row.digest, receipt.sha256, 'receipt exists in durable ledger before any caller dispatch');
  assert.deepEqual(receipt.objectRefs, a.objectRefs);
  assert.deepEqual(status(f.root).inFlight, ['a1']);
  const result = settle(f.root, f.settlement(receipt));
  assert.equal(result.remainingAfter.modelRequests, 4);
  assert.equal(result.remainingAfter.executionAttempts, 4);
  assert.deepEqual(status(f.root).inFlight, []);
  rejects('DUPLICATE_ATTEMPT', () => reserve(f.root, a));
  rejects('SETTLED', () => settle(f.root, f.settlement(receipt)));
  assert.throws(() => init(f.config), /exist/i, 'no resetting existing scope');
});

test('insufficient balance and invalid counters roll back without receipt/debit', () => {
  const f = fixture();
  const before = status(f.root);
  rejects('BALANCE', () => reserve(f.root, f.admission('large', { modelRequests: 6 })));
  rejects('COUNTERS', () => reserve(f.root, f.admission('bad', { modelRequests: -1 })));
  rejects('COUNTERS', () => reserve(f.root, f.admission('null', { modelRequests: null })));
  rejects('COUNTERS', () => reserve(f.root, f.admission('unknown-unit', { totalToolCalls: 1 })));
  assert.equal(status(f.root).attempts.length, 0);
  assert.equal(status(f.root).lastReceipt.sequence, before.lastReceipt.sequence);
  assert.equal(status(f.root).remaining.modelRequests, before.remaining.modelRequests);
});

test('request/input/adoption drift and missing actual input binding stop admission', () => {
  for (const which of ['request', 'input', 'adoption']) {
    const f = fixture();
    const a = f.admission();
    const ref = which === 'request' ? a.requestRef : which === 'input' ? f.input : f.config.adoptionRef;
    fs.appendFileSync(path.join(f.root, ref.path), ' ');
    rejects('HASH_DRIFT', () => reserve(f.root, a));
    assert.equal(status(f.root).attempts.length, 0);
  }
  const f = fixture();
  const a = f.admission();
  rejects('REQUEST_BINDING', () => reserve(f.root, { ...a, objectRefs: [a.objectRefs[1]] }));
  rejects('REF', () => reserve(f.root, { ...a, objectRefs: [] }));
  rejects('SCOPE', () => reserve(f.root, { ...a, scopeId: 'historical-scope' }));
});

test('fresh human/machine owner and terminal evidence are mandatory, not DB exclusion', () => {
  const f = fixture();
  const a = f.admission();
  for (const patch of [{ terminal: false }, { sideEffectState: 'unknown' }, { owner: 'another-owner' },
    { observedAt: new Date(Date.now() - 61000).toISOString() }]) {
    const base = JSON.parse(fs.readFileSync(path.join(f.root, a.ownerEvidenceRef.path)));
    const ownerEvidenceRef = f.put('invalid-owner.json', { ...base, ...patch });
    rejects('OWNER', () => reserve(f.root, { ...a, ownerEvidenceRef }));
  }
});

test('deadline, waits and backwards time cannot reset counters', () => {
  const f = fixture();
  const a = f.admission();
  const realNow = Date.now;
  const start = realNow();
  try {
    Date.now = () => start + 20000;
    const used = status(f.root).scopeCounters.scopeElapsedMs;
    assert.ok(used >= 20000);
    const receipt = reserve(f.root, a);
    Date.now = () => start;
    rejects('CLOCK_ROLLBACK', () => settle(f.root, f.settlement(receipt)));
    assert.ok(status(f.root).scopeCounters.scopeElapsedMs >= used);
    Date.now = () => Date.parse(f.config.deadline) + 1;
    rejects('DEADLINE', () => reserve(f.root, f.admission('expired')));
    const result = settle(f.root, f.settlement(receipt, 'failed'));
    assert.equal(result.outcome, 'failed', 'actuals still recorded after deadline');
  } finally { Date.now = realNow; }
});

test('unknown stays in flight, reserves full balance and requires cumulative terminal reconciliation', () => {
  const f = fixture();
  const receipt = reserve(f.root, f.admission('a1', { executionAttempts: 1, publicApiCalls: 8 }));
  settle(f.root, f.settlement(receipt, 'unknown', { publicApiCalls: 2 }));
  assert.deepEqual(status(f.root).inFlight, ['a1']);
  assert.equal(status(f.root).remaining.publicApiCalls, 12);
  rejects('IN_FLIGHT', () => reserve(f.root, f.admission('a2')));
  rejects('COUNTERS', () => settle(f.root, f.settlement(receipt, 'success', { publicApiCalls: 1 })));
  const invalid = f.settlement(receipt, 'success', { publicApiCalls: 2 });
  const evidence = JSON.parse(fs.readFileSync(path.join(f.root, invalid.evidenceRef.path)));
  invalid.evidenceRef = f.put('nonterminal.json', { ...evidence, terminal: false });
  rejects('OWNER', () => settle(f.root, invalid));
  settle(f.root, f.settlement(receipt, 'failed', { publicApiCalls: 3 }));
  assert.equal(status(f.root).remaining.publicApiCalls, 12, 'failed full envelope remains charged');
  assert.deepEqual(status(f.root).inFlight, []);
  rejects('DUPLICATE_ATTEMPT', () => reserve(f.root, f.admission('a1')));
  assert.equal(reserve(f.root, f.admission('a2')).attemptId, 'a2');
});

test('settlement excess is committed, reports overrun/negative remaining and blocks new dispatch', () => {
  const f = fixture();
  const receipt = reserve(f.root, f.admission('a1', { modelRequests: 1, nativeInputs: 2 }));
  const result = settle(f.root, f.settlement(receipt, 'failed', { modelRequests: 1, nativeInputs: 11 }));
  assert.deepEqual(result.overrun, ['nativeInputs']);
  assert.equal(result.remainingAfter.nativeInputs, -1);
  assert.equal(result.exhausted, true);
  assert.equal(status(f.root).scopeCounters.nativeInputs, 11);
  rejects('OVERRUN', () => reserve(f.root, f.admission('a2')));
});

test('three legal run slots include failures: only a new attempt, no replenishment', () => {
  const f = fixture();
  for (let n = 1; n <= 3; n++) {
    const receipt = reserve(f.root, f.admission('run-' + n, { executionAttempts: 1, qualificationRuns: 1 }));
    settle(f.root, f.settlement(receipt, n === 1 ? 'failed' : 'success', { executionAttempts: 1, qualificationRuns: 1 }));
  }
  assert.equal(status(f.root).remaining.qualificationRuns, 0);
  rejects('DUPLICATE_ATTEMPT', () => reserve(f.root, f.admission('run-1')));
  rejects('BALANCE', () => reserve(f.root, f.admission('run-4', { executionAttempts: 1, qualificationRuns: 1 })));
});

test('old unknown budgets/attempts cannot be claimed as preregistration by a new ledger', () => {
  const f = fixture();
  const first = status(f.root).lastReceipt;
  assert.match(first.historicalAdmission, /Unknown/);
  rejects('ATTEMPT', () => settle(f.root, { scopeId: f.config.scopeId, attemptId: 'old-dispatched-attempt' }));
  assert.equal(status(f.root).attempts.length, 0);
  const historic = fixture(false);
  const old = historic.put('old-budget.json', { historicalBudget: { cumulativeUsed: 'Unknown', remaining: 'Unknown' } });
  rejects('PROPOSAL', () => init({ ...historic.config, proposalRef: old }));
});

test('CLI status is read-only, malformed input fails closed, CLI mutation returns receipt', () => {
  const f = fixture(false);
  f.put('init.json', f.config);
  assert.equal(cli('init', f.root, path.join(f.root, 'init.json')).status, 0);
  const a = f.admission();
  f.put('reserve.json', a);
  const result = cli('reserve', f.root, path.join(f.root, 'reserve.json'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).kind, 'reserve');
  const file = path.join(f.root, 'scope-ledger.sqlite');
  const before = fs.readFileSync(file);
  assert.equal(cli('status', f.root).status, 0);
  assert.deepEqual(fs.readFileSync(file), before);
  f.put('settle-cli.json', f.settlement(JSON.parse(result.stdout)));
  const settled = cli('settle', f.root, path.join(f.root, 'settle-cli.json'));
  assert.equal(settled.status, 0, settled.stderr);
  assert.equal(JSON.parse(settled.stdout).kind, 'settle');
  f.put('broken.json', '{', true);
  assert.equal(cli('reserve', f.root, path.join(f.root, 'broken.json')).status, 2);
});

test('concurrent single-write admissions allow at most one in-flight reservation', async () => {
  const f = fixture();
  const calls = ['a1', 'a2'].map(attempt => {
    f.put(attempt + '-cli.json', f.admission(attempt));
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI, 'reserve', '--root', f.root, '--data', path.join(f.root, attempt + '-cli.json')],
        { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', bytes => { stderr += bytes; });
      child.on('error', reject);
      child.on('close', code => resolve({ code, stderr }));
    });
  });
  const results = await Promise.all(calls);
  assert.deepEqual(results.map(result => result.code).sort(), [0, 2]);
  assert.match(results.find(result => result.code === 2).stderr, /IN_FLIGHT/);
  assert.equal(status(f.root).inFlight.length, 1);
  assert.equal(status(f.root).attempts.length, 1);
});


test('a per-reservation overrun stops dispatch even with positive scope balance', () => {
  const f = fixture();
  const receipt = reserve(f.root, f.admission('small', { hostToolInvocations: 1, nativeInputs: 1 }));
  const result = settle(f.root, f.settlement(receipt, 'success', { nativeInputs: 2 }));
  assert.equal(result.remainingAfter.nativeInputs, 8);
  assert.deepEqual(status(f.root).overruns, ['small']);
  rejects('OVERRUN', () => reserve(f.root, f.admission('next')));
});

test('settlement identity/hash/unknown units reject without losing reservation', () => {
  const f = fixture();
  const receipt = reserve(f.root, f.admission());
  const input = f.settlement(receipt);
  const data = JSON.parse(fs.readFileSync(path.join(f.root, input.evidenceRef.path)));
  input.evidenceRef = f.put('wrong-sequence.json', { ...data, admissionSequence: 999 });
  rejects('SETTLEMENT_BINDING', () => settle(f.root, input));
  const good = f.settlement(receipt);
  fs.appendFileSync(path.join(f.root, good.evidenceRef.path), ' ');
  rejects('HASH_DRIFT', () => settle(f.root, good));
  rejects('COUNTERS', () => settle(f.root, { ...good, scopeCounters: {} }));
  assert.deepEqual(status(f.root).inFlight, ['a1']);
});


test('elapsed reservation is debited from current balance and never credited at settlement', () => {
  const f = fixture();
  const now = Date.now;
  const start = now();
  try {
    Date.now = () => start + 20000;
    const before = status(f.root).remaining.scopeElapsedMs;
    const receipt = reserve(f.root, f.admission('time-slot', { modelRequests: 1, scopeElapsedMs: 10000 }));
    assert.equal(receipt.remainingAfterReservation.scopeElapsedMs, before - 10000);
    const result = settle(f.root, f.settlement(receipt, 'success'));
    assert.equal(result.remainingAfter.scopeElapsedMs, before - 10000);
    Date.now = () => start + 60000;
    assert.ok(status(f.root).remaining.scopeElapsedMs <= 40000);
  } finally { Date.now = now; }
});

test('categorized run slots require execution slots', () => {
  const f = fixture();
  rejects('COUNTERS', () => reserve(f.root, f.admission('missing-run', { modelRequests: 1, qualificationRuns: 1 })));
  rejects('COUNTERS', () => reserve(f.root, f.admission('too-many-runs', { executionAttempts: 1, qualificationRuns: 2 })));
});


test('proposal category ceilings cannot be omitted; host adoption defines missing category units', () => {
  const f = fixture(false);
  const proposal = JSON.parse(fs.readFileSync(path.join(f.root, 'proposal.json')));
  delete proposal.units.qualificationRuns;
  f.config.proposalRef = f.put('proposal.json', proposal);
  const missing = { ...f.limits };
  delete missing.qualificationRuns;
  const units = { ...f.config.units };
  delete units.qualificationRuns;
  const initialUsed = { ...f.config.initialUsed };
  delete initialUsed.qualificationRuns;
  rejects('PROPOSAL', () => init({ ...f.config, limits: missing, units, initialUsed }));
  const adoption = JSON.parse(fs.readFileSync(path.join(f.root, 'adoption.json')));
  adoption.binding.proposalRef = f.config.proposalRef;
  f.config.adoptionRef = f.put('adoption.json', adoption);
  assert.equal(init(f.config).kind, 'init');
});
