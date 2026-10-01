'use strict';
// Execute the maintained production bytes, not a second Calculator implementation.
// These are host-side data-flow/control-flow tests. There is no Runtime, Calculator,
// real observation, model, or desktop Fresh Run here. Synthetic UI values deliberately
// need not satisfy arithmetic: they reveal cached/expected/local-computation substitutions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const REPO = path.resolve(__dirname, '../..');
const SOURCE = 'examples/agent-to-recipe/calculator.js';
const source = fs.readFileSync(path.join(REPO, SOURCE), 'utf8');
const spec = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/workflows/calculator/spec.json'), 'utf8'));
const currentSource = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/workflows/calculator/current-source-l1.json'), 'utf8'));
const firstButtons = ['2', '5', '×', '4', '+', '1', '0', '='];
const { fixture } = require('./tools/artifact-fixture.js');

const { exerciseProduction, verifyFrozenConsumer } = require('./tools/calculator-consumer-dataflow.cjs');
const exercise = options => exerciseProduction({ code: source, filename: SOURCE, ...options });
const maintainedManifestPath = path.join(REPO, '.runtime/tests/agent-to-recipe/revision-20260929/repeat-candidate/candidate.json');
const maintainedTaskRoot = path.join(REPO, '.runtime/tests/agent-to-recipe/fresh-20260929');
const maintainedHash = 'b06efeb299e227efb59e822dfc9df1e52cc6408924d8de5264d62e8ce8a6a7db';
const digest = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

function maintainedDescriptor() {
  const candidate = JSON.parse(fs.readFileSync(maintainedManifestPath, 'utf8'));
  return { schemaVersion: 'calculator-consumer-l1/v1', harness: 'calculator-runtime-v1',
    runtimeModel: 'calculator-clear-state-v1', evaluator: 'maintenance-consumer-evaluator',
    evaluatorSha256: digest(path.join(__dirname, 'tools/calculator-consumer-dataflow.cjs')),
    candidateRef: { kind: 'CandidateManifest', rootId: 'repo',
      path: path.relative(REPO, maintainedManifestPath), sha256: digest(maintainedManifestPath), schemaVersion: candidate.schemaVersion },
    scriptRef: candidate.scriptRef, dependencies: candidate.dependencies,
    script: { path: path.join(maintainedTaskRoot, candidate.scriptRef.path), sha256: candidate.scriptRef.sha256 },
    roots: [['repo', REPO], ['task', maintainedTaskRoot]] };
}

// Test-owned metadata only: no historical dependency rebinding or qualification reuse.
// Keep source bytes exact; the evaluator supplies controlled substitutes, not a Runtime.
function maintainedL1Descriptor(t, bytes) {
  const base = path.join(REPO, '.runtime/tests/workflows');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'maintained-source-l1-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scriptPath = path.join(root, 'candidate.js');
  fs.writeFileSync(scriptPath, bytes, { flag: 'wx' });
  assert.deepEqual(fs.readFileSync(scriptPath), Buffer.from(bytes));
  const scriptRef = { kind: 'CandidateSource', rootId: 'synthetic', path: 'candidate.js',
    sha256: digest(scriptPath), schemaVersion: 'text/v1' };
  const candidate = { schemaVersion: 'agent-to-recipe/v1',
    candidateId: 'synthetic-maintained-source-l1-only', producer: 'host-side-test-fixture',
    synthetic: true, evidenceLayer: 'L1-controlled-substitutes',
    historicalQualificationTransferred: false, liveQualificationGranted: false,
    scriptRef, scriptHash: scriptRef.sha256, dependencies: [],
    limitations: ['Test-owned metadata; no historical or live Candidate qualification',
      'Controlled substitutes only; no native Runtime, desktop, AppProfile or OperationRules execution'] };
  const candidatePath = path.join(root, 'candidate.json');
  fs.writeFileSync(candidatePath, JSON.stringify(candidate, null, 2) + '\n', { flag: 'wx' });
  return { schemaVersion: 'calculator-consumer-l1/v1', harness: 'calculator-runtime-v1',
    runtimeModel: 'calculator-clear-state-v1',
    evaluatorSha256: digest(path.join(__dirname, 'tools/calculator-consumer-dataflow.cjs')),
    candidateRef: { kind: 'CandidateManifest', rootId: 'synthetic', path: 'candidate.json',
      sha256: digest(candidatePath), schemaVersion: candidate.schemaVersion },
    scriptRef, dependencies: candidate.dependencies,
    script: { path: scriptPath, sha256: scriptRef.sha256 },
    roots: [['synthetic', root]], outputDir: path.join(root, 'observations') };
}

function maintainedBytes() {
  const descriptor = maintainedDescriptor();
  assert.equal(descriptor.script.sha256, maintainedHash);
  assert.equal(digest(descriptor.script.path), maintainedHash);
  return fs.readFileSync(descriptor.script.path);
}

test('historical maintained Candidate rejects current dependency drift before execution', () => {
  const descriptor = maintainedDescriptor();
  assert.equal(descriptor.script.sha256, maintainedHash);
  assert.equal(digest(descriptor.script.path), maintainedHash);
  const runtime = descriptor.dependencies.find(dependency => dependency.kind === 'RuntimeBinary');
  assert.ok(runtime, 'Historical RuntimeBinary ref required');
  assert.equal(runtime.sha256, 'ce97c66e4dd942bf22aa06f9a036250b9bd35d4c44933f477079b730eff03b30');
  assert.notEqual(digest(path.join(REPO, runtime.path)), runtime.sha256, 'Current Runtime must have drifted');
  const report = verifyFrozenConsumer(descriptor);
  assert.equal(report.verdict, 'blocked', JSON.stringify(report));
  assert.equal(report.code, 'VERIFICATION_BLOCKED');
  assert.ok(report.message.includes('Bound ref drift: ' + runtime.path), report.message);
  assert.deepEqual(report.scenarios, []);
  assert.deepEqual(report.subjectRefs, []);
  assert.deepEqual(report.verification.evidenceRefs, []);
  assert.deepEqual(report.dependencyVerification, { mode: 'hash-only-metadata', executed: false });
  assert.deepEqual(report.businessDataflow, { verdict: 'unknown', releaseBlocked: true });
  assert.equal(report.desktopActions, false);
  assert.equal(report.liveQualificationGranted, false);
  assert.equal(report.businessHardFailGranted, false);
});

test('synthetic L1-only maintained exact bytes: clear semantics, memory artifacts and fail-stop observations', t => {
    const bytes = maintainedBytes();
    const descriptor = maintainedL1Descriptor(t, bytes);
    assert.equal(descriptor.script.sha256, maintainedHash);
    assert.notEqual(descriptor.candidateRef.sha256, digest(maintainedManifestPath));
    assert.deepEqual(fs.readFileSync(descriptor.script.path), bytes);
    const metadata = JSON.parse(fs.readFileSync(path.join(descriptor.roots[0][1], descriptor.candidateRef.path), 'utf8'));
    assert.equal(metadata.synthetic, true);
    assert.equal(metadata.evidenceLayer, 'L1-controlled-substitutes');
    assert.equal(metadata.historicalQualificationTransferred, false);
    assert.equal(metadata.liveQualificationGranted, false);
    assert.deepEqual(metadata.dependencies, []);
    const report = verifyFrozenConsumer(descriptor);
    assert.equal(report.verdict, 'pass', JSON.stringify(report));
    assert.deepEqual(report.subjectRefs, [descriptor.candidateRef, descriptor.scriptRef, ...descriptor.dependencies]);
    assert.deepEqual(report.dependencyVerification, { mode: 'hash-only-metadata', executed: false });
    assert.equal(report.scenarios.length, 8);
    assert.ok(report.scenarios.every(scenario => scenario.verdict === 'pass'));
    assert.equal(report.liveQualificationGranted, false);
    assert.equal(report.desktopActions, false);
    assert.equal(report.businessHardFailGranted, false);
    assert.equal(report.applicability.reviewedSourceSha256, maintainedHash);
    assert.equal(report.applicability.kind, 'reviewed-frozen-candidate-adapter');
    for (const scenario of report.scenarios.filter(scenario => !scenario.fault)) {
      assert.equal(scenario.files['result.json'].firstResult, scenario.first);
      assert.deepEqual(scenario.files['result.json'].consumedCharacters, [...scenario.first]);
      assert.ok(scenario.screenshots.every(shot => shot.synthetic === true));
      const entryClear = scenario.transitions.find(transition => transition.input === '清除');
      assert.equal(entryClear.after.expressionDirty, true);
      assert.equal(entryClear.after.display, '0');
      assert.ok(scenario.transitions.filter(transition => transition.input === '全部清除')
        .every(transition => transition.after.expressionDirty === false));
    }
    for (const scenario of report.scenarios.filter(scenario => scenario.fault)) {
      assert.ok(scenario.stoppedError);
      assert.equal(scenario.files['result.json'], undefined);
      assert.equal(scenario.files['final-result.json'], undefined);
    }
  });

for (const [name, transform] of [
  ['slice', code => code.replace('Array.from(firstResult)', 'Array.from(firstResult.slice(0, 1))')],
  ['Set', code => code.replace('Array.from(firstResult)', 'Array.from(new Set(firstResult))')],
  ['replace', code => code.replace('Array.from(firstResult)', "Array.from(firstResult.replace(/0/g, '9'))")],
  ['overwrite', code => code.replace('const firstResult =', 'let firstResult =')
    .replace('const characters =', "firstResult = '110';\nconst characters =")],
  ['dead dynamic call', code => code.replace("await press('second-expression', buttons(['6', '×', ...characters, '=']), {",
    "await press('fixed-expression', buttons(['6', '×', '1', '1', '0', '=']));\nif (false) await press('second-expression', buttons(['6', '×', ...characters, '=']), {")],
  ['C without AC', code => code.replace("await press(id + '-expression-AC', [{ role: 'button', name, identifier: '_NS:407' }]);", '')],
  ['read failure replaced by cached value', code => code.replace('const firstResult = await readDisplay(\'first-result\');',
    "const firstResult = await readDisplay('first-result').catch(() => '0040');")],
  ['unknown input swallowed', code => code.replace('throw error; // No retry, backend switch, or prefix replay.', 'return;')],
]) {
  test('clear-state oracle rejects controlled maintained-source defect: ' + name, t => {
      const original = maintainedBytes().toString('utf8');
      const mutant = transform(original);
      assert.notEqual(mutant, original);
      const report = verifyFrozenConsumer(maintainedL1Descriptor(t, mutant));
      assert.equal(report.verdict, 'fail', JSON.stringify(report));
      assert.equal(report.businessDataflow.releaseBlocked, true);
      if (name === 'read failure replaced by cached value') {
        assert.equal(report.scenarios.find(scenario => scenario.fault === 'read-failure').verdict, 'fail');
      }
      if (name === 'unknown input swallowed') {
        assert.equal(report.scenarios.find(scenario => scenario.fault === 'unknown-first').verdict, 'fail');
        assert.equal(report.scenarios.find(scenario => scenario.fault === 'unknown-second').verdict, 'fail');
      }
    });
}

for (const [name, transform] of [
  ['different batching', code => code.replace(
    'await UI.tapTargets(targets, { within: win, timeout: 5000 })',
    '(await Promise.all(targets.map(target => UI.tapTargets([target], { within: win, timeout: 5000 }))))[0]')],
  ['extra diagnostic read', code => code.replace("await capture('first-result');",
    "await UI.readText({ within: win });\nawait capture('first-result');")],
  ['different artifact name', code => code.replace("'/runtime-data-first.json'", "'/saved-first.json'")],
  ['equivalent but not reviewed source bytes', code => code + '\n// evaluator-owned equivalent diagnostic variant\n'],
]) {
  test('clear-state adapter reports unsupported, not business failure: ' + name, t => {
      const original = maintainedBytes().toString('utf8');
      const variant = transform(original);
      assert.notEqual(variant, original);
      const report = verifyFrozenConsumer(maintainedL1Descriptor(t, variant));
      assert.equal(report.verdict, 'blocked', JSON.stringify(report));
      assert.equal(report.businessDataflow.verdict, 'unknown');
      assert.equal(report.businessHardFailGranted, false);
      assert.equal(report.applicability.sourceMatchesReviewed, false);
      assert.ok(report.code === 'SOURCE_ADAPTATION_REQUIRED'
        || report.scenarios.some(scenario => scenario.code === 'HARNESS_UNSUPPORTED'));
    });
}

test('metadata hash drift and executable dependency roles cannot be treated as L1 pass', () => {
    for (const mutation of ['hash', 'role']) {
      const descriptor = maintainedDescriptor();
      if (mutation === 'hash') descriptor.dependencies[0].sha256 = '0'.repeat(64);
      else descriptor.dependencies[0].kind = 'JavaScriptModule';
      const report = verifyFrozenConsumer(descriptor);
      assert.equal(report.verdict, 'blocked');
      assert.deepEqual(report.scenarios, []);
    }
  });

for (const [name, valid, transform] of [
  ['frozen original', true, code => code],
  ['Array.from', true, code => code.replace('...firstResult', '...Array.from(firstResult)')],
  ['concat split', true, code => code.replace("['6', '×', ...firstResult, '=']", "['6', '×'].concat(firstResult.split(''), ['='])")],
  ['slice', false, code => code.replace('...firstResult', '...firstResult.slice(0, 1)')],
  ['Set', false, code => code.replace('...firstResult', '...new Set([...firstResult])')],
  ['replace', false, code => code.replace('...firstResult', "...firstResult.replace(/0/g, '9')")],
  ['overwrite', false, code => code.replace('const firstResult', 'let firstResult')
    .replace("  await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);", "  firstResult = '110';\n  await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);")],
  ['unreachable dynamic call', false, code => code.replace(
    "  await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);",
    "  if (false) await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);\n  await clickCalculatorButtons(win, ['6', '×', '1', '1', '0', '=']);")],
]) {
  test('reusable frozen-byte L1 production harness: ' + name, t => {
    const transformed = transform(source);
    if (name !== 'frozen original') assert.notEqual(transformed, source, 'Mutation must reach current production bytes');
    const f = fixture(t, state => { state.candidateSource = transformed; });
    const candidate = JSON.parse(fs.readFileSync(f.file('candidate.json'), 'utf8'));
    const report = verifyFrozenConsumer({ schemaVersion: 'calculator-consumer-l1/v1',
      harness: 'calculator-runtime-v1', dependencies: [],
      candidateRef: f.ref('candidate.json', 'CandidateManifest'), scriptRef: candidate.scriptRef,
      roots: [['fixture', f.root], ['repo', REPO]],
      script: { path: f.file('candidate.js'), sha256: f.ref('candidate.js', 'script').sha256 },
      evaluatorSha256: createHash('sha256').update(fs.readFileSync(
        path.join(__dirname, 'tools/calculator-consumer-dataflow.cjs'))).digest('hex') });
    assert.equal(report.verdict, valid ? 'pass' : 'fail', JSON.stringify(report));
    assert.equal(report.scenarios.length, 3);
    assert.equal(report.liveQualificationGranted, false);
    assert.equal(report.desktopActions, false);
    assert.equal(report.businessDataflow.releaseBlocked, !valid);
    if (!valid) assert.equal(report.scenarios[0].verdict, 'fail');
  });
}
function assertDataflow(run, first, final) {
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(run.logs.length, 1);
  assert.deepEqual(run.actions, [['全部清除'], firstButtons, ['全部清除'], ['6', '×', ...first, '=']]);
  assert.equal(run.logs[0], final);
  assert.equal(run.value, Number(final));
  assert.deepEqual(run.reads.filter(item => item.phase === 'first').map(item => item.value), [first, first]);
}

test('current production source matches its reviewed L1 snapshot; historical r003 qualification stays separate', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'), currentSource.scriptHash);
  assert.equal(currentSource.evidenceLayer, 'L1');
  assert.equal(currentSource.historicalQualificationTransferred, false);
  assert.equal(spec.scriptHash, 'a62c72aa2b00f256755aac2524d14e4655a88194c012bf6765f0d314a62774cc');
});

for (const [first, final] of [['110', '660'], ['0040', '777'], ['9', '888']]) {
  test('exact production bytes propagate synthetic fresh read ' + first + ' and terminal read ' + final, { timeout: 3000 }, async () => {
    assertDataflow(await exercise({ first: [first, first], final }), first, final);
  });
}

test('separate JS invocations reacquire values; this is not a desktop Fresh Run', { timeout: 3000 }, async () => {
  assertDataflow(await exercise({ first: ['110', '110'], final: '660' }), '110', '660');
  assertDataflow(await exercise({ first: ['0040', '0040'], final: '777' }), '0040', '777');
});

for (const first of [['', ''], ['40', '41'], ['not-a-number', 'not-a-number'], ['1234567890123', '1234567890123']]) {
  test('invalid or unstable first read stops before dependent clear/input: ' + JSON.stringify(first), { timeout: 3000 }, async () => {
    const run = await exercise({ first });
    assert.match(run.error?.message || '', /unstable|unsigned integer/);
    assert.equal(run.clearCount, 1); assert.equal(run.inputs, 1); assert.equal(run.logs.length, 0);
    assert.deepEqual(run.actions, [['全部清除'], firstButtons]);
  });
}

test('read failure is not replaced with expected or historical firstResult', { timeout: 3000 }, async () => {
  const run = await exercise({ readError: true });
  assert.equal(run.error.message, 'SYNTHETIC_READ_FAILURE');
  assert.equal(run.clearCount, 1); assert.equal(run.inputs, 1); assert.equal(run.logs.length, 0);
});

for (const failInput of [1, 2]) {
  test('unknown input result stops without retry: sequence ' + failInput, { timeout: 3000 }, async () => {
    const run = await exercise({ failInput });
    assert.equal(run.error.message, 'SYNTHETIC_INPUT_UNKNOWN');
    assert.equal(run.error.actionState, 'unknown');
    assert.equal(run.inputs, failInput); assert.equal(run.clearCount, failInput); assert.equal(run.logs.length, 0);
  });
}

test('focus loss after the first input prevents later state preparation', { timeout: 3000 }, async () => {
  const run = await exercise({ staleAfterFirst: true });
  assert.match(run.error?.message || '', /identity, focus or Basic layout/);
  assert.equal(run.clearCount, 1); assert.equal(run.inputs, 1); assert.equal(run.logs.length, 0);
});

test('ambiguous required button stops before any input', { timeout: 3000 }, async () => {
  const run = await exercise({ ambiguousButton: true });
  assert.match(run.error?.message || '', /button missing, disabled or ambiguous/);
  assert.equal(run.actions.length, 0); assert.equal(run.logs.length, 0);
});

for (const [name, before, after] of [
  ['cached consumer', '...firstResult', "...'110'"],
  ['truncated consumer', '...firstResult', '...firstResult.slice(0, 1)'],
  ['deduplicated consumer', '...firstResult', '...new Set([...firstResult])'],
  ['rewritten consumer', '...firstResult', "...firstResult.replace(/0/g, '9')"],
  ['substituted first read', 'const firstResult = await readCalculatorResult(win);', "const firstResult = '110';"],
  ['substituted final read', 'const finalResult = await readCalculatorResult(win);', "const finalResult = '660';"],
]) {
  test('the data-flow oracle detects the controlled ' + name + ' defect', { timeout: 3000 }, async () => {
    assert.ok(source.includes(before));
    // This in-memory mutant is only a negative test, never a published Candidate.
    const run = await exercise({ code: source.replace(before, after) });
    assert.throws(() => assertDataflow(run, '0040', '777'));
  });
}

for (const [name, transform] of [
  ['Array.from', code => code.replace('...firstResult', '...Array.from(firstResult)')],
  ['concat split', code => code.replace("['6', '×', ...firstResult, '=']", "['6', '×'].concat(firstResult.split(''), ['='])")],
]) {
  test('equivalent production consumer in controlled host variant: ' + name, { timeout: 3000 }, async () => {
    const code = transform(source);
    assert.notEqual(code, source);
    for (const first of ['0040', '9900', '7']) {
      assertDataflow(await exercise({ code, first: [first, first] }), first, '777');
    }
  });
}

for (const [name, transform] of [
  ['overwrite after clear', code => code.replace('const firstResult', 'let firstResult')
    .replace("  await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);", "  firstResult = '110';\n  await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);")],
  ['dead dynamic call masking a constant', code => code.replace(
    "  await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);",
    "  if (false) await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);\n  await clickCalculatorButtons(win, ['6', '×', '1', '1', '0', '=']);")],
]) {
  test('production host oracle detects controlled ' + name, { timeout: 3000 }, async () => {
    const code = transform(source);
    assert.notEqual(code, source);
    const run = await exercise({ code });
    assert.equal(run.error, undefined);
    assert.throws(() => assertDataflow(run, '0040', '777'), assert.AssertionError);
  });
}
