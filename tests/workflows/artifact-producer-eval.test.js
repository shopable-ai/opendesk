'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, REPO } = require('./tools/artifact-fixture.js');
const { evaluateAdjacent } = require('./tools/adjacent-producer-eval.js');

function setup(t) {
  const f = fixture(t, () => {}, state => {
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
