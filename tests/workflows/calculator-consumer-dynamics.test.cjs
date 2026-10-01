'use strict';
// Independent evaluator forward tests. Frozen synthetic sources below are
// authored here, never imported from a Producer, Calculator case or Candidate.
// All execution goes through verifyFrozenConsumer and its real child worker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { verifyFrozenConsumer } = require('./tools/calculator-consumer-dataflow.cjs');
const REPO = path.resolve(__dirname, '../..');
const OUTPUT = path.join(REPO, '.runtime/tests/workflows/consumer-dynamics');
const EVALUATOR = path.join(__dirname, 'tools/calculator-consumer-dataflow.cjs');
const MODEL = 'calculator-button-dynamics-v1';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const firstButtons = ['2', '5', '×', '4', '+', '1', '0', '='];

function freeze(source, dependencies = []) {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const root = fs.mkdtempSync(path.join(OUTPUT, 'fixture-'));
  const ref = (name, kind, schemaVersion = 'test/v1') => ({
    rootId: 'fixture', path: name, kind, schemaVersion, sha256: digest(fs.readFileSync(path.join(root, name))),
  });
  fs.writeFileSync(path.join(root, 'subject.js'), source, { flag: 'wx' });
  const dependencyRefs = dependencies.map(({ name, kind, bytes }) => {
    fs.writeFileSync(path.join(root, name), bytes, { flag: 'wx' });
    return ref(name, kind);
  });
  const scriptRef = ref('subject.js', 'script');
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    schemaVersion: 'test/v1', scriptRef, dependencies: dependencyRefs,
  }), { flag: 'wx' });
  return { root, descriptor: { schemaVersion: 'calculator-consumer-l1/v1',
    harness: 'calculator-runtime-v1', runtimeModel: MODEL,
    evaluatorSha256: digest(fs.readFileSync(EVALUATOR)),
    candidateRef: ref('manifest.json', 'CandidateManifest'), scriptRef, dependencies: dependencyRefs,
    script: { path: path.join(root, 'subject.js'), sha256: scriptRef.sha256 },
    roots: [['fixture', root], ['repo', REPO]], outputDir: path.join(root, 'observations'),
  } };
}

// Ordinary async JS: each expression can use one-key calls, a whole batch or
// variable chunks. The optional diagnostics read *between* actual buttons.
function source({ batching = 'key', diagnostics = true, output = 'all', body = false } = {}) {
  const send = batching === 'key' ? 'for (const name of names) await send([name]);'
    : batching === 'batch' ? 'await send(names);'
      : 'for (let i = 0; i < names.length; i += 3) await send(names.slice(i, i + 3));';
  const code = `
    const win = await window.get({ app: { bundleId: 'com.apple.calculator' } });
    await window.activate(win);
    async function observed() {
      const current = await window.current(win);
      if (current.id !== win.id || current.pid !== win.pid || current.handle !== win.handle) throw new Error('identity');
      const tree = await Accessibility.snapshot({ within: current });
      const text = await UI.readText({ within: current });
      const node = tree.root.children.find(node => node.name === '主显示器');
      if (node.value !== text) throw new Error('inconsistent display');
      return text;
    }
    async function clear() {
      for (let i = 0; i < 2; i++) {
        const tree = await Accessibility.snapshot({ within: win });
        const key = tree.root.children.find(node => node.name === '清除' || node.name === '全部清除');
        await UI.tapTargets([{ role: 'button', name: key.name, identifier: key.identifier }], { within: win });
        if (key.name === '全部清除') break;
      }
      if (await observed() !== '0') throw new Error('clear failed');
    }
    async function press(names) {
      async function send(chunk) {
        await UI.tapTargets(chunk.map(name => ({ role: 'button', name })), { within: win });
        ${diagnostics ? 'await observed();' : ''}
      }
      ${send}
    }
    await clear();
    await press(['2', '5', '×', '4', '+', '1', '0', '=']);
    const firstResult = await observed();
    ${output === 'all' ? "await File.writeJSON(Execution.artifactDir + '/nested/producer.json', { firstResult });\nawait page.screenshot({ target: 'activeWindow', returnType: 'path', path: Execution.artifactDir + '/nested/producer.png' });" : ''}
    await clear();
    const characters = Array.from(firstResult);
    await press(['6', '×', ...characters, '=']);
    const finalResult = await observed();
    const result = { firstResult, finalResult, consumedCharacters: characters };
    ${output === 'all' ? "await File.writeJSON(Execution.artifactDir + '/anything.json', result);\nawait page.screenshot({ target: 'activeWindow', returnType: 'path', path: Execution.artifactDir + '/anything.png' });\nconsole.log('arbitrary label', JSON.stringify(result));\nconsole.log('trailing diagnostic');" : ''}
    ${output === 'console' ? "console.log('different label', result);\nconsole.log('not a result');" : ''}
    return ${output === 'console' ? 'undefined' : 'result'};
  `;
  return body ? code : '(async () => {\n' + code + '\n})()';
}

function check(sourceBytes, options) {
  const frozen = freeze(sourceBytes, options?.dependencies);
  if (options?.alter) options.alter(frozen);
  return { report: verifyFrozenConsumer(frozen.descriptor), ...frozen };
}
function expectFail(report, code) {
  assert.equal(report.verdict, 'fail', JSON.stringify(report));
  assert.equal(report.businessDataflow.releaseBlocked, true);
  assert.equal(report.businessHardFailGranted, false);
  assert.ok(report.scenarios.some(scenario => scenario.verdict === 'fail' && (!code || scenario.code === code)));
}

for (const batching of ['key', 'batch', 'chunks']) {
  test('actual frozen bytes: equivalent ' + batching + ' calls preserve 0040/9900/7 and all observations', () => {
    const { report, descriptor } = check(source({ batching }));
    assert.equal(report.verdict, 'pass', JSON.stringify(report));
    assert.equal(report.scenarios.length, 8);
    assert.ok(report.scenarios.every(scenario => scenario.verdict === 'pass'));
    assert.equal(report.runtimeModel, MODEL);
    assert.equal(report.evidenceLayer, 'L1-controlled-substitutes');
    assert.equal(report.desktopActions, false);
    assert.equal(report.liveQualificationGranted, false);
    assert.equal(report.generalJavaScriptProof, false);
    assert.equal(report.businessHardFailGranted, false);
    assert.equal(report.applicability.sourceHashAllowlist, false);
    assert.deepEqual(report.subjectRefs, [descriptor.candidateRef, descriptor.scriptRef]);
    assert.deepEqual(report.dependencyVerification, { mode: 'content-bound-only', executed: false });
    for (const scenario of report.scenarios.filter(scenario => !scenario.fault)) {
      assert.deepEqual(scenario.expressions, [firstButtons, ['6', '×', ...scenario.first, '=']]);
      assert.deepEqual(scenario.buttons.filter(button => !['清除', '全部清除'].includes(button.name))
        .map(button => button.name), [...firstButtons, '6', '×', ...scenario.first, '=']);
      assert.ok(scenario.buttons.every(button => button.role === 'button' && button.actionState === 'acknowledged'));
      assert.equal(scenario.returned.value.firstResult, scenario.first);
      assert.equal(scenario.returned.value.finalResult, scenario.final);
      assert.deepEqual(scenario.files['anything.json'], scenario.returned.value);
      assert.equal(scenario.files['nested/producer.json'].firstResult, scenario.first);
      assert.deepEqual(scenario.screenshots.map(shot => shot.display), [scenario.first, scenario.final]);
      assert.ok(scenario.screenshots.every(shot => shot.synthetic && shot.windowId === 'synthetic-window'));
      assert.ok(scenario.windows.every(event => event.identity.pid === 1 && event.identity.handle === 1));
      for (const snapshot of scenario.snapshots) {
        assert.equal(snapshot.value, snapshot.display);
        if (snapshot.phase === 'initial') assert.equal(snapshot.value, '987');
        else assert.ok(scenario.reads.some(read => read.phase === snapshot.phase && read.value === snapshot.value));
      }
      if (batching === 'key') {
        assert.ok(scenario.reads.some(read => read.phase === 'second-entry' && read.value === scenario.first));
      }
    }
    for (const scenario of report.scenarios.filter(scenario => scenario.fault)) {
      assert.ok(scenario.faultObserved);
      assert.ok(scenario.stoppedError);
      assert.ok(!scenario.events.some(event => event.operation === 'input-call' && event.afterFault));
      assert.equal(scenario.files['anything.json'], undefined);
      if (scenario.fault.startsWith('unknown-')) {
        assert.equal(scenario.buttons.at(-1).actionState, 'unknown');
        assert.equal(scenario.stoppedError.actionState, 'unknown');
      }
    }
    const evidence = report.verification.evidenceRefs[0];
    const evidenceRoot = new Map(descriptor.roots).get(evidence.rootId);
    assert.ok(evidenceRoot);
    const bytes = fs.readFileSync(path.join(evidenceRoot, evidence.path));
    assert.equal(digest(bytes), evidence.sha256);
    assert.equal(JSON.parse(bytes).verdict, 'pass');
    assert.ok(!fs.existsSync('/synthetic/artifacts/anything.json'));
  });
}

for (const options of [{ output: 'return' }, { output: 'console' }, { body: true }]) {
  test('generic execution completion and observation channel: ' + JSON.stringify(options), () => {
    const { report } = check(source(options));
    assert.equal(report.verdict, 'pass', JSON.stringify(report));
    const normal = report.scenarios[0];
    assert.equal(normal.entryForm, options.body ? 'async-body' : 'script-completion');
    if (options.output === 'console') assert.deepEqual(normal.returned, { defined: false });
    else assert.equal(normal.returned.value.finalResult, normal.final);
  });
}

for (const [name, before, after] of [
  ['deduplicated operand', 'Array.from(firstResult)', 'Array.from(new Set(firstResult))'],
  ['numeric coercion drops leading zeros', 'Array.from(firstResult)', 'Array.from(String(Number(firstResult)))'],
  ['fixed producer read', 'const firstResult = await observed();', "const firstResult = '110';"],
  ['read without consuming it', 'Array.from(firstResult)', "Array.from('110')"],
  ['fixed terminal read', 'const finalResult = await observed();', "const finalResult = '660';"],
  ['dead dynamic consumer', "await press(['6', '×', ...characters, '=']);", "if (false) await press(['6', '×', ...characters, '=']);\nawait press(['6', '×', '1', '1', '0', '=']);"],
  ['entry clear without AC', "if (key.name === '全部清除') break;", 'break;'],
]) {
  test('independent oracle rejects actual frozen-source defect: ' + name, () => {
    const original = source();
    assert.ok(original.includes(before));
    const { report } = check(original.replace(before, after));
    expectFail(report);
    assert.ok(report.scenarios.filter(scenario => !scenario.fault).some(scenario => scenario.verdict === 'fail'));
  });
}

test('JSON-encoded wrong values cannot be hidden by diagnostic console labels', () => {
  const code = source({ output: 'console' }).replace("console.log('different label', result);",
    "console.log('different label', JSON.stringify({ firstResult: '110', finalResult }));");
  expectFail(check(code).report, 'CONSUMER_DATAFLOW_MISMATCH');
});

test('unknown first/second input is never released by swallowing the rejection', () => {
  const code = source().replace('async function send(chunk) {', 'async function send(chunk) { let swallowed = false;')
    .replace('{ within: win });\n        await observed();',
      "{ within: win }).catch(() => { swallowed = true; });\nif (swallowed) await UI.tapTargets([{ role: 'button', name: '9' }], { within: win });\n        await observed();");
  assert.notEqual(code, source());
  const { report } = check(code);
  expectFail(report, 'FAIL_STOP_VIOLATION');
  for (const fault of ['unknown-first', 'unknown-second']) {
    const scenario = report.scenarios.find(scenario => scenario.fault === fault);
    assert.equal(scenario.verdict, 'fail');
    assert.ok(scenario.events.some(event => event.operation === 'input-call' && event.afterFault));
    const unknown = scenario.buttons.findIndex(button => button.actionState === 'unknown');
    assert.equal(unknown, scenario.buttons.length - 1, 'No later button actually executed');
  }
});

test('unknown terminal input cannot publish success through arbitrary result fields', () => {
  const code = source({ output: 'return', diagnostics: false })
    .replace('{ within: win });\n        \n', '{ within: win }).catch(() => undefined);\n        \n')
    .replace('const result = { firstResult, finalResult, consumedCharacters: characters };',
      'const result = { arbitraryTerminalName: finalResult };');
  assert.ok(code.includes('.catch(() => undefined)'));
  const { report } = check(code);
  expectFail(report, 'FAIL_STOP_VIOLATION');
  const scenario = report.scenarios.find(scenario => scenario.fault === 'unknown-second');
  assert.equal(scenario.verdict, 'fail');
  assert.equal(scenario.returned.value.arbitraryTerminalName, '777');
  assert.ok(!scenario.events.some(event => event.operation === 'input-call' && event.afterFault));
});

test('return and console stay separate for arbitrary function, field and diagnostic names', () => {
  const body = source({ body: true }).replace('const result = { firstResult, finalResult, consumedCharacters: characters };',
    'const result = { inputFromDisplay: firstResult, terminalFromDisplay: finalResult, keys: characters };');
  const code = 'async function anIndependentEntryName() {\n' + body + '\n}\nanIndependentEntryName();';
  const { report } = check(code);
  assert.equal(report.verdict, 'pass', JSON.stringify(report));
  const normal = report.scenarios[0];
  assert.equal(normal.returned.value.terminalFromDisplay, normal.final);
  assert.equal(normal.returned.value.finalResult, undefined);
  assert.equal(normal.logs[0].values[0], 'arbitrary label');
  assert.deepEqual(JSON.parse(normal.logs[0].values[1]), normal.returned.value);
  assert.deepEqual(normal.logs[1].values, ['trailing diagnostic']);
});

test('actual resolved primitive return can differ from diagnostic console prints', () => {
  const code = source({ output: 'return' }).replace('return result;', "console.log('a diagnostic without any result fields');\nreturn finalResult;");
  const { report } = check(code);
  assert.equal(report.verdict, 'pass', JSON.stringify(report));
  assert.equal(report.scenarios[0].returned.value, '777');
  assert.deepEqual(report.scenarios[0].logs[0].values, ['a diagnostic without any result fields']);
});

test('Candidate cannot manufacture a resolved return by calling the private observer', () => {
  const code = source({ output: 'return' }).replace('return result;',
    "__observeCompletion({ finalResult });\nreturn 'fabricated actual return';");
  const { report } = check(code);
  assert.equal(report.verdict, 'blocked', JSON.stringify(report));
  assert.ok(report.scenarios.filter(scenario => !scenario.fault)
    .every(scenario => scenario.code === 'HARNESS_UNSUPPORTED' && scenario.returned === undefined));
});

test('File-only terminal output is captured without inventing a Promise return', () => {
  const code = source().replace("console.log('arbitrary label', JSON.stringify(result));", '')
    .replace("console.log('trailing diagnostic');", '').replace('return result;', 'return undefined;');
  const { report } = check(code);
  assert.equal(report.verdict, 'pass', JSON.stringify(report));
  assert.deepEqual(report.scenarios[0].returned, { defined: false });
  assert.deepEqual(report.scenarios[0].logs, []);
  assert.equal(report.scenarios[0].files['anything.json'].finalResult, '777');
});

test('equivalent C/AC control batches use the current visible button state', () => {
  const original = source();
  const start = original.indexOf('async function clear() {');
  const end = original.indexOf('async function press(names) {');
  assert.ok(start >= 0 && end > start);
  const code = original.slice(0, start) + `async function clear() {
    const tree = await Accessibility.snapshot({ within: win });
    const key = tree.root.children.find(node => node.name === '清除' || node.name === '全部清除');
    const names = key.name === '清除' ? ['清除', '全部清除'] : ['全部清除'];
    await UI.tapTargets(names.map(name => ({ role: 'button', name, identifier: key.identifier })), { within: win });
    if (await observed() !== '0') throw new Error('clear failed');
  }
  ` + original.slice(end);
  const { report } = check(code);
  assert.equal(report.verdict, 'pass', JSON.stringify(report));
  assert.deepEqual(report.scenarios[0].actions[0], ['清除', '全部清除']);
  const clear = report.scenarios[0].transitions.slice(0, 2);
  assert.equal(clear[0].after.expressionDirty, true);
  assert.equal(clear[1].after.expressionDirty, false);
});

test('caught fault resolves an actual stop record without synthesizing a return from logs', () => {
  const code = source().replace(/\}\)\(\)$/, `})().catch(error => {
    console.log('stopped by candidate', error.message);
    return { stopped: true, detail: error.message, actionState: error.actionState };
  })`);
  const { report } = check(code);
  assert.equal(report.verdict, 'pass', JSON.stringify(report));
  const stopped = report.scenarios.find(scenario => scenario.fault === 'unknown-first');
  assert.equal(stopped.stoppedError, undefined);
  assert.equal(stopped.returned.value.stopped, true);
  assert.equal(stopped.returned.value.actionState, 'unknown');
  assert.deepEqual(stopped.logs[0].values, ['stopped by candidate', 'SYNTHETIC_INPUT_UNKNOWN']);
  assert.ok(stopped.faultObserved);
  assert.ok(!stopped.events.some(event => event.operation === 'input-call' && event.afterFault));
});

test('a contradictory window identity cannot authorize even the initial input', () => {
  const code = source().replace('await window.activate(win);', 'await window.activate(win); win.pid = 2;');
  const { report } = check(code);
  expectFail(report, 'WINDOW_IDENTITY_MISMATCH');
  assert.ok(report.scenarios.every(scenario => scenario.buttons.length === 0));
});

test('36 independent Runtime support files bind every exact byte without executing JS', () => {
  const dependencies = Array.from({ length: 36 }, (_, i) => ({ name: 'support-' + i + '.js',
    kind: 'RuntimeSupportFile', bytes: 'throw new Error("support-' + i + ' must never run");\n' }));
  const { report, descriptor, root } = check(source(), { dependencies });
  assert.equal(report.verdict, 'pass', JSON.stringify(report));
  assert.equal(report.dependencies.length, 36);
  assert.equal(report.subjectRefs.length, 38);
  assert.equal(report.dependencyVerification.executed, false);
  fs.appendFileSync(path.join(root, 'support-35.js'), '// drift');
  const changed = verifyFrozenConsumer(descriptor);
  assert.equal(changed.verdict, 'blocked');
  assert.deepEqual(changed.scenarios, []);
});

test('failed read cannot fall back to cached data and proceed', () => {
  const code = source().replace('await UI.readText({ within: current });', "await UI.readText({ within: current }).catch(() => '0040');");
  const { report } = check(code);
  expectFail(report, 'FAIL_STOP_VIOLATION');
  assert.equal(report.scenarios.find(scenario => scenario.fault === 'read-failure').verdict, 'fail');
});

test('ignoring the current AX/UI contradiction fails before dependent input', () => {
  const code = source().replace("if (node.value !== text) throw new Error('inconsistent display');", '');
  const { report } = check(code);
  expectFail(report, 'FAIL_STOP_VIOLATION');
  const scenario = report.scenarios.find(scenario => scenario.fault === 'ax-mismatch');
  assert.equal(scenario.verdict, 'fail');
  assert.equal(scenario.snapshots.at(-1).value, 'mismatched');
  assert.ok(scenario.reads.some(read => read.phase === 'first' && read.value === '0040'));
});

for (const [name, code] of [
  ['synchronous loop', 'while (true) {}'],
  ['Promise continuation loop', '(async () => { await Promise.resolve(); while (true) {} })()'],
  ['endless microtasks', '(async () => { while (true) await Promise.resolve(); })()'],
  ['never settled Promise', 'new Promise(() => {})'],
]) {
  test('bounded execution: ' + name, { timeout: 7000 }, () => {
    const { report } = check(code);
    assert.equal(report.verdict, 'blocked', JSON.stringify(report));
    assert.equal(report.businessDataflow.verdict, 'unknown');
    assert.equal(report.businessDataflow.releaseBlocked, true);
    assert.equal(report.scenarios.length, 8);
    assert.ok(report.scenarios.every(scenario => scenario.code === (name === 'never settled Promise'
      ? 'ASYNC_COMPLETION_UNSUPPORTED' : 'RUNTIME_MODEL_TIMEOUT')));
  });
}

test('Candidate, evaluator and dependency byte drift block before any worker observation', () => {
  for (const mutation of ['candidate', 'script', 'evaluator', 'inventory', 'dependency']) {
    const frozen = freeze(source(), [{ name: 'profile.json', kind: 'AppProfile', bytes: '{"schemaVersion":"test/v1"}' }]);
    if (mutation === 'candidate') frozen.descriptor.candidateRef.sha256 = '0'.repeat(64);
    if (mutation === 'script') fs.appendFileSync(path.join(frozen.root, 'subject.js'), '\n// drift\n');
    if (mutation === 'evaluator') frozen.descriptor.evaluatorSha256 = '0'.repeat(64);
    if (mutation === 'inventory') frozen.descriptor.dependencies = [];
    if (mutation === 'dependency') fs.appendFileSync(path.join(frozen.root, 'profile.json'), ' ');
    const report = verifyFrozenConsumer(frozen.descriptor);
    assert.equal(report.verdict, 'blocked', mutation + ': ' + JSON.stringify(report));
    assert.deepEqual(report.scenarios, []);
    assert.equal(report.verification.evidenceRefs.length, 0);
  }
});

test('Runtime support bytes are content-bound only and never executed', () => {
  const dependencies = [{ name: 'support.js', kind: 'RuntimeSupportFile', bytes: "throw new Error('MUST_NOT_EXECUTE_SUPPORT');" }];
  const { report, descriptor, root } = check(source(), { dependencies });
  assert.equal(report.verdict, 'pass', JSON.stringify(report));
  assert.deepEqual(report.subjectRefs, [descriptor.candidateRef, descriptor.scriptRef, ...descriptor.dependencies]);
  assert.equal(report.dependencyVerification.executed, false);
  fs.appendFileSync(path.join(root, 'support.js'), '\n// changed');
  const drift = verifyFrozenConsumer(descriptor);
  assert.equal(drift.verdict, 'blocked');
  assert.deepEqual(drift.scenarios, []);
  const external = check(source(), { dependencies: [{ ...dependencies[0], kind: 'JavaScriptModule' }] }).report;
  assert.equal(external.verdict, 'blocked');
  assert.deepEqual(external.scenarios, []);
  const legacy = { ...descriptor, runtimeModel: 'legacy-v1' };
  assert.equal(verifyFrozenConsumer(legacy).verdict, 'blocked');
});

for (const code of ["require('./support.js')", "import('./support.js')", "eval('1')", 'UI.unmodeledOperation()', 'setTimeout(() => {}, 1)']) {
  test('external JS or unmodeled facilities remain unsupported: ' + code, () => {
    const { report } = check(code);
    assert.equal(report.verdict, 'blocked', JSON.stringify(report));
    assert.equal(report.businessDataflow.verdict, 'unknown');
  });
}

test('new model requires explicit selection and the Runtime harness', () => {
  const frozen = freeze(source());
  const legacy = verifyFrozenConsumer({ ...frozen.descriptor, runtimeModel: undefined });
  assert.equal(legacy.runtimeModel, 'legacy-v1');
  assert.notEqual(legacy.verdict, 'pass');
  const wrongHarness = verifyFrozenConsumer({ ...frozen.descriptor, harness: 'calculator-helper-fixture-v1' });
  assert.equal(wrongHarness.verdict, 'blocked');
  assert.deepEqual(wrongHarness.scenarios, []);
});

test('legacy helper fixture still observes exactly three original scenarios', () => {
  const code = `async function main(win) {
    await clearCalculator(win);
    await clickCalculatorButtons(win, ['2', '5', '×', '4', '+', '1', '0', '=']);
    const firstResult = await readCalculatorResult(win);
    await clearCalculator(win);
    await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);
    const finalResult = await readCalculatorResult(win);
    return { firstResult, finalResult };
  }`;
  const { descriptor } = freeze(code);
  const report = verifyFrozenConsumer({ ...descriptor, harness: 'calculator-helper-fixture-v1', runtimeModel: 'legacy-v1' });
  assert.equal(report.verdict, 'pass', JSON.stringify(report));
  assert.equal(report.scenarios.length, 3);
  assert.deepEqual(report.dependencyVerification, { mode: 'hash-only-metadata', executed: false });
});

test('legacy Runtime harness retains its original grouped-call behavior', () => {
  const code = `
    const win = await window.get({ app: { bundleId: 'com.apple.calculator' } });
    const press = names => UI.tapTargets(names.map(name => ({ role: 'button', name })), { within: win });
    await press(['全部清除']);
    await press(['2', '5', '×', '4', '+', '1', '0', '=']);
    const firstResult = await UI.readText({ within: win });
    await press(['全部清除']);
    await press(['6', '×', ...firstResult, '=']);
    const finalResult = await UI.readText({ within: win });
    console.log(JSON.stringify({ firstResult, finalResult }));
  `;
  const { descriptor } = freeze(code);
  const report = verifyFrozenConsumer({ ...descriptor, runtimeModel: 'legacy-v1' });
  assert.equal(report.verdict, 'pass', JSON.stringify(report));
  assert.equal(report.scenarios.length, 3);
  assert.deepEqual(report.scenarios[0].actions, [['全部清除'], firstButtons,
    ['全部清除'], ['6', '×', ...'0040', '=']]);
});

test('old clear-state adapter remains bound to its original reviewed source', () => {
  const code = source({ body: true, batching: 'batch', diagnostics: false })
    .replace('/nested/producer.json', '/runtime-data-first.json').replace('/nested/producer.png', '/first.png')
    .replace('/anything.json', '/result.json')
    .replace("console.log('arbitrary label', JSON.stringify(result));", 'console.log(JSON.stringify(result));')
    .replace("console.log('trailing diagnostic');", '');
  const { descriptor } = freeze(code);
  assert.equal(verifyFrozenConsumer(descriptor).verdict, 'pass');
  const report = verifyFrozenConsumer({ ...descriptor, runtimeModel: 'calculator-clear-state-v1' });
  assert.equal(report.verdict, 'blocked', JSON.stringify(report));
  assert.equal(report.code, 'SOURCE_ADAPTATION_REQUIRED');
  assert.ok(report.scenarios.every(scenario => scenario.verdict === 'pass'));
  assert.equal(report.applicability.sourceMatchesReviewed, false);
  assert.equal(report.applicability.reviewedSourceSha256, 'b06efeb299e227efb59e822dfc9df1e52cc6408924d8de5264d62e8ce8a6a7db');
  assert.deepEqual(report.dependencyVerification, { mode: 'hash-only-metadata', executed: false });
});
