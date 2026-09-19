'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, REPO } = require('./tools/artifact-fixture.js');
const { evaluateAdjacent } = require('./tools/adjacent-producer-eval.js');

function setup(t, mutate = () => {}) {
  const f = fixture(t, mutate, state => {
    // Application/API evidence is upstream input; no standard output is put in a packet.
    const procedure = JSON.parse(fs.readFileSync(state.file('procedure.json'), 'utf8'));
    const refs = [];
    const visit = value => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') {
        if (value.rootId && value.kind !== 'DistilledSteps') refs.push(value);
        else Object.values(value).forEach(visit);
      }
    };
    visit(procedure.capabilityDecisions);
    state.write('profile.json', { schemaVersion: 'agent-to-recipe/v1', evidenceRefs: refs });
    const dossier = JSON.parse(fs.readFileSync(state.file('dossier.json'), 'utf8'));
    dossier.appProfileRefs = [state.ref('profile.json', 'AppProfile')];
    state.write('dossier.json', dossier);
  });
  const read = name => JSON.parse(fs.readFileSync(f.file(name), 'utf8'));
  const request = { dossier: f.options.dossier, actions: f.options.actions, roots: f.options.roots,
    sourceSet: 'development', timeoutMs: 5000 };
  const evidenceRoot = path.join(REPO, '.runtime/tests/agent-to-recipe/producer-eval');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const out = path.join(fs.mkdtempSync(path.join(evidenceRoot, 'attempt-')), 'evaluation');
  // These are deliberate test doubles owned by the evaluator. They do NOT
  // establish that a model can produce these artifacts or pass a blind test.
  const adapter = { mode: 'deterministic-test-double', hostId: 'node:test', modelId: 'none',
    produce: async packet => {
      if (packet.stage === 'trace-distill') {
        const output = read('distilled.json');
        output.dossierRef = packet.inputs.dossier;
        const dossier = JSON.parse(packet.files.find(item => item.ref.kind === 'Dossier').content);
        output.evidenceRefs = dossier.runtimeValues[0].evidenceRefs;
        return output;
      }
      const output = read('procedure.json');
      output.distilledStepsRef = packet.inputs.distilled;
      return output;
    } };
  return { f, request, out, adapter, read };
}

test('prepare-only creates only allowed S7 inputs and honestly reports not-run', async t => {
  const s = setup(t);
  const result = await evaluateAdjacent(s.request, s.out);
  assert.ok(!result.setupFailure, JSON.stringify(result));
  assert.deepEqual(result.stages, { 'trace-distill': 'not-run', 'procedure-synthesize': 'not-run' });
  assert.equal(result.attempts.length, 0);
  assert.equal(result.modelBehaviorVerified, false);
  const packet = JSON.parse(fs.readFileSync(path.join(s.out, 'trace-distill/input.json')));
  assert.ok(!packet.files.some(item => ['DistilledSteps', 'SemanticProcedure', 'CandidateManifest', 'QualificationRecord'].includes(item.ref.kind)));
  assert.ok(!packet.files.some(item => /source\.json|expected\.json|distilled\.json|procedure\.json/.test(item.ref.path)));
  assert.ok(!fs.existsSync(path.join(s.out, 'procedure-synthesize/input.json')));
});

test('deterministic adjacent integration consumes the actual S7 output, never a supplied standard', async t => {
  const s = setup(t);
  const original = s.adapter.produce;
  s.adapter.produce = async packet => {
    const output = await original(packet);
    if (packet.stage === 'trace-distill') output.steps[0].purpose = 'actual adapter output marker';
    else {
      const input = packet.files.find(item => item.ref.kind === 'DistilledSteps');
      assert.ok(input.content.includes('actual adapter output marker'));
      assert.ok(!packet.files.some(item => ['Dossier', 'RawTrace', 'SemanticProcedure'].includes(item.ref.kind)));
    }
    return output;
  };
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  assert.deepEqual(result.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' }, JSON.stringify(result));
  assert.equal(result.attempts.length, 2);
  assert.equal(result.executionMode, 'deterministic-test-double');
  assert.equal(result.modelBehaviorVerified, false);
  assert.equal(result.contextIsolation, 'not-verified');
  assert.equal(result.attempts[0].outputSha256,
    JSON.parse(fs.readFileSync(path.join(s.out, 'procedure-synthesize/input.json'))).inputs.distilled.sha256);
});

for (const failure of ['bad-json', 'missing-read', 'unsupplied-ref', 'throw']) test('preserves ' + failure + ' attempt and never invokes downstream Producer', async t => {
  const s = setup(t); let calls = 0;
  const original = s.adapter.produce;
  s.adapter.produce = async packet => {
    calls++;
    if (failure === 'throw') throw new Error('host failed');
    if (failure === 'bad-json') return '{ broken';
    const output = await original(packet);
    if (failure === 'missing-read') output.steps[2].sourceActionRefs = ['A006'];
    if (failure === 'unsupplied-ref') output.evidenceRefs = [s.f.ref('evidence/distillation.txt', 'evidence', 'text/plain')];
    return output;
  };
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  assert.equal(result.stages['trace-distill'], 'fail', JSON.stringify(result));
  assert.equal(result.stages['procedure-synthesize'], 'not-run');
  assert.equal(calls, 1);
  assert.equal(result.attempts[0].attempt, 1);
  if (failure !== 'throw') assert.ok(fs.statSync(path.join(s.out, 'trace-distill/output.raw')).size > 0);
  await assert.rejects(evaluateAdjacent(s.request, s.out, s.adapter), /exist/i);
});

test('bounded timeout records one failed attempt rather than retrying forever', async t => {
  const s = setup(t);
  s.request.timeoutMs = 10;
  s.adapter.produce = () => new Promise(() => {});
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  assert.equal(result.attempts.length, 1);
  assert.match(result.attempts[0].error.message, /TIMEOUT/);
  assert.equal(result.stages['procedure-synthesize'], 'not-run');
});

test('tampered frozen input is refused even after a successful Producer response', async t => {
  const s = setup(t); const original = s.adapter.produce;
  s.adapter.produce = async packet => {
    const result = await original(packet);
    fs.writeFileSync(path.join(s.out, 'inputs/fixture/plan.json'), '{}');
    return result;
  };
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  assert.equal(result.attempts[0].error.code, 'EVAL_INPUT_CHANGED');
  assert.equal(result.stages['procedure-synthesize'], 'not-run');
});

// Regression cases exercise evaluator mechanics, never model competence.
const { hash, JSON_LIMIT } = require('../../workflows/agent-to-recipe/scripts/artifact-validation.js');

test('an authorized but unused root does not make valid adjacent inputs fail', async t => {
  const s = setup(t);
  const unused = path.join(s.f.root, 'unused'); fs.mkdirSync(unused);
  s.request.roots.push(['unused', unused]);
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  assert.deepEqual(result.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' }, JSON.stringify(result));
});

test('each attempt binds the exact saved input packet bytes and checker implementation', async t => {
  const s = setup(t);
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  for (const attempt of result.attempts) {
    const bytes = fs.readFileSync(path.join(s.out, attempt.stage, 'input.json'));
    assert.equal(attempt.inputSha256, hash(bytes));
    assert.equal(attempt.outputTruncated, false);
    const output = fs.readFileSync(path.join(s.out, attempt.storedOutput.path));
    assert.equal(attempt.storedOutput.sha256, hash(output));
    assert.equal(attempt.outputSha256, hash(output));
  }
  const checker = 'workflows/agent-to-recipe/scripts/check-artifact-chain.js';
  assert.equal(result.checkerVersions[checker], hash(fs.readFileSync(path.join(REPO, checker))));
});

test('oversized multibyte output is retained within a byte budget with an explicit stored digest', async t => {
  const s = setup(t);
  const raw = JSON.stringify({ note: '测'.repeat(JSON_LIMIT / 2) });
  s.adapter.produce = async () => raw;
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  const attempt = result.attempts[0];
  const bytes = fs.readFileSync(path.join(s.out, 'trace-distill/output.raw'));
  assert.equal(attempt.error.code, 'EVAL_OUTPUT_LIMIT');
  assert.ok(bytes.length <= JSON_LIMIT);
  assert.equal(attempt.outputBytes, Buffer.byteLength(raw));
  assert.equal(attempt.outputSha256, hash(Buffer.from(raw)));
  assert.equal(attempt.outputTruncated, true);
  assert.deepEqual(attempt.storedOutput, { path: 'trace-distill/output.raw', bytes: bytes.length, sha256: hash(bytes) });
  assert.equal(result.stages['procedure-synthesize'], 'not-run');
});

for (const failure of [null, undefined, 'host refused']) test('a non-Error throw is retained as one failed Producer attempt: ' + String(failure), async t => {
  const s = setup(t); let calls = 0;
  s.adapter.produce = async () => { calls++; throw failure; };
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  assert.equal(calls, 1);
  assert.equal(result.setupFailure, undefined);
  assert.equal(result.stages['trace-distill'], 'fail');
  assert.equal(result.stages['procedure-synthesize'], 'not-run');
  assert.equal(result.attempts[0].result, 'fail');
  assert.ok(result.attempts[0].error.message.includes(String(failure)));
});

test('S9 cannot implicitly acquire Raw Trace through an AppProfile reference', async t => {
  const s = setup(t);
  const profile = s.read('profile.json');
  profile.evidenceRefs.push(s.f.ref('actions.json', 'RawTrace'));
  s.f.write('profile.json', profile);
  const dossier = s.read('dossier.json');
  dossier.appProfileRefs = [s.f.ref('profile.json', 'AppProfile')];
  s.f.write('dossier.json', dossier);
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  assert.equal(result.stages['trace-distill'], 'pass', JSON.stringify(result));
  assert.equal(result.stages['procedure-synthesize'], 'not-run');
  assert.equal(result.attempts.length, 1);
  assert.equal(result.setupFailure.code, 'EVAL_INPUT_ROLE');
  assert.equal(result.setupFailure.stage, 'procedure-synthesize');
  assert.ok(!fs.existsSync(path.join(s.out, 'procedure-synthesize/input.json')));
});


test('a second legal synthetic data set traverses the same adjacent evaluator without becoming live evidence', async t => {
  const s = setup(t, source => {
    const first = [...'12×3+4='], second = [...'6×40='];
    source.actions.find(a => a.actionId === 'A004').data.names = first;
    source.actions.find(a => a.actionId === 'A009').data.names = second;
    Object.assign(source.actions.find(a => a.actionId === 'A005').data, { first: '40', second: '40' });
    Object.assign(source.actions.find(a => a.actionId === 'A010').data, { first: '240', second: '240' });
    source.dossier.actualInputs = { first, second };
    source.dossier.runtimeValues[0].observedValue = '40';
    source.dossier.runtimeValues[1].observedValue = '240';
    source.dossier.sideEffects.finalActual = '240';
    source.procedure.parameters.firstExpression.value = '12×3+4';
    source.evidence['first-read.txt'] = 'Synthetic UI-read record: 40; not live evidence.';
    source.evidence['final-read.txt'] = 'Synthetic UI-read record: 240; not live evidence.';
  });
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  assert.deepEqual(result.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' }, JSON.stringify(result));
  const report = JSON.parse(fs.readFileSync(path.join(s.out, 'procedure-synthesize/check.json')));
  assert.equal(report.valueLineage[0].observedClaim, '40');
  assert.equal(result.modelBehaviorVerified, false);
  assert.equal(result.liveQualificationGranted, false);
});

test('a failed S9 artifact is retained without erasing the accepted S7 prefix', async t => {
  const s = setup(t), original = s.adapter.produce;
  s.adapter.produce = async packet => {
    const output = await original(packet);
    if (packet.stage === 'procedure-synthesize') output.runtimeValues[0].source = 'B020 not the read producer';
    return output;
  };
  const result = await evaluateAdjacent(s.request, s.out, s.adapter);
  assert.deepEqual(result.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'fail' });
  assert.equal(result.attempts.length, 2);
  assert.ok(fs.existsSync(path.join(s.out, 'procedure-synthesize/output.raw')));
  assert.equal(result.attempts[0].outputSha256,
    JSON.parse(fs.readFileSync(path.join(s.out, 'procedure-synthesize/input.json'))).inputs.distilled.sha256);
});
