#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const SCHEMA = 'calculator-consumer-l1/v1';
const SCENARIOS = Object.freeze([
  { first: '0040', final: '777' },
  { first: '9900', final: '888' },
  { first: '7', final: '555' },
]);
const CLEAR_SCENARIOS = Object.freeze([
  ...SCENARIOS,
  { first: '0011', final: '321', initialClear: '全部清除' },
  ...['read-failure', 'unknown-first', 'unknown-second', 'ax-mismatch'].map(fault => ({ first: '0040', final: '777', fault })),
]);
const firstButtons = ['2', '5', '×', '4', '+', '1', '0', '='];
const REPO = path.resolve(__dirname, '../../..');
const REVIEWED_CLEAR_SOURCE = 'b06efeb299e227efb59e822dfc9df1e52cc6408924d8de5264d62e8ce8a6a7db';

function boundedFailure(code, message) {
  throw Object.assign(new Error(message), { code, boundedObservationFailure: true });
}

function resolveBoundRef(roots, ref) {
  assert.ok(ref && typeof ref.kind === 'string' && ref.kind && typeof ref.schemaVersion === 'string'
    && ref.schemaVersion && /^[a-f0-9]{64}$/.test(ref.sha256), 'Complete content-bound ref required');
  assert.ok(typeof ref.path === 'string' && ref.path.split('/').every(part => part && part !== '.' && part !== '..')
    && !/[\\:\x00-\x1f]/.test(ref.path) && !path.isAbsolute(ref.path), 'Portable relative ref path required');
  const root = roots.get(ref.rootId);
  assert.ok(root, 'Unapproved ref root');
  let filename = root;
  for (const part of ref.path.split('/')) {
    filename = path.join(filename, part);
    assert.ok(!fs.lstatSync(filename).isSymbolicLink(), 'Symlink refs are unsupported');
  }
  assert.ok(fs.statSync(filename).isFile(), 'Ref must name a file');
  assert.equal(sha256(fs.readFileSync(filename)), ref.sha256, 'Bound ref drift: ' + ref.path);
  return filename;
}

async function exerciseProduction({ first = ['0040', '0040'], final = '777', failInput = 0,
  staleAfterFirst = false, ambiguousButton = false, readError = false, code, filename = 'frozen-candidate.js' } = {}) {
  const win = { id: 'synthetic-window', pid: 1, handle: 1, title: 'Calculator', x: 0, y: 0,
    width: 232, height: 321, isForeground: true, hasFocus: true };
  const actions = [], reads = [], receipts = [], logs = [];
  let phase = 'initial', clearCount = 0, inputs = 0, firstReads = 0, pending = false;
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const scope = options => assert.equal(options.within.id, win.id);
  const window = {
    get: async query => { assert.equal(query.app.bundleId, 'com.apple.calculator'); await tick(); return { ...win }; },
    activate: async target => { assert.equal(target.id, win.id); await tick(); return { ...win }; },
    current: async target => { assert.equal(target.id, win.id); await tick();
      return { ...win, hasFocus: !(staleAfterFirst && inputs > 0) }; },
  };
  const Accessibility = { snapshot: async options => {
    scope(options); await tick();
    const children = [...'0123456789', '×', '+', '=', '全部清除'].map(name => ({
      role: 'button', name, enabled: true, actions: ['invoke'], children: [],
    }));
    if (ambiguousButton) children.push({ ...children[0] });
    children.push({ role: 'staticText', name: '主显示器', value: 'synthetic-display-channel', children: [] });
    return { complete: true, truncated: false, root: { children } };
  } };
  const UI = {
    readText: async options => {
      scope(options); assert.equal(pending, false, 'read must await the previous input completion');
      await tick();
      if (readError && phase === 'first') throw new Error('SYNTHETIC_READ_FAILURE');
      const value = phase === 'initial' ? '987' : phase === 'first'
        ? first[Math.min(firstReads++, first.length - 1)] : phase === 'final' ? final : '0';
      reads.push({ phase, value }); return value;
    },
    tapTargets: async (targets, options) => {
      scope(options); assert.equal(pending, false, 'no overlapping input sequence');
      const names = Array.from(targets, target => { assert.equal(target.role, 'button'); return target.name; });
      actions.push(names); pending = true;
      await tick(); pending = false;
      if (names.length === 1 && names[0] === '全部清除') { clearCount += 1; phase = 'clear'; }
      else {
        inputs += 1;
        if (inputs === failInput) throw Object.assign(new Error('SYNTHETIC_INPUT_UNKNOWN'), { actionState: 'unknown' });
        phase = inputs === 1 ? 'first' : 'final';
      }
      const receipt = { ok: true, action: 'tapTargets', syntheticReceipt: actions.length,
        completed: names.map(name => ({ target: { locator: { role: 'button', name } }, actionState: 'acknowledged' })) };
      if (names.length > 1) receipts.push(receipt);
      return receipt;
    },
  };
  let error;
  try {
    await new vm.Script('(async function(){\n' + code + '\n})()', { filename })
      .runInNewContext({ window, Accessibility, UI, console: { log: value => logs.push(value) } }, { timeout: 1000 });
  } catch (caught) { error = caught; }
  return { error, value: logs.length ? JSON.parse(logs.at(-1)) : undefined, logs, actions, reads, receipts, clearCount, inputs };
}

async function exerciseFixture({ code, filename, first, final }) {
  const actions = [], reads = [];
  let readCount = 0;
  const value = await new vm.Script(code + '\nmain({});', { filename }).runInNewContext({
    clearCalculator: async () => { actions.push(['全部清除']); },
    clickCalculatorButtons: async (win, buttons) => { actions.push(Array.from(buttons)); },
    readCalculatorResult: async () => {
      const value = ++readCount === 1 ? first : final;
      reads.push({ phase: readCount === 1 ? 'first' : 'final', value });
      return value;
    },
  }, { timeout: 1000 });
  return { actions, reads, value };
}

async function exerciseClearState({ code, filename, first, final, fault, initialClear = '清除' }) {
  const win = { id: 'synthetic-window', pid: 1, handle: 1, width: 232, height: 321, isForeground: true, hasFocus: true };
  const artifactDir = '/synthetic/artifacts';
  const actions = [], reads = [], transitions = [], screenshots = [], logs = [], events = [];
  const files = Object.create(null);
  let display = '987', clearName = initialClear, phase = 'initial', expressionDirty = initialClear === '清除';
  let inputs = 0, injected = false, error;
  const scope = options => assert.equal(options.within.id, win.id);
  const scopedPath = filename => {
    assert.ok(typeof filename === 'string' && filename.startsWith(artifactDir + '/'));
    const name = filename.slice(artifactDir.length + 1);
    assert.ok(name && !name.includes('/') && name !== '..');
    return name;
  };
  const File = { writeJSON: async (filename, value) => {
    const name = scopedPath(filename);
    const bytes = JSON.stringify(value);
    assert.ok(bytes.length <= 1024 * 1024, 'Synthetic JSON capture exceeds bounds');
    files[name] = JSON.parse(bytes);
    events.push({ operation: 'File.writeJSON', name });
  } };
  const window = {
    get: async query => { assert.equal(query.app.bundleId, 'com.apple.calculator'); return { ...win }; },
    activate: async target => { assert.equal(target.id, win.id); return { ...win }; },
    current: async target => { assert.equal(target.id, win.id); return { ...win }; },
  };
  const Accessibility = { snapshot: async options => {
    scope(options);
    const children = [...'0123456789', '×', '+', '='].map(name => ({ role: 'button', name,
      enabled: true, actions: ['invoke'], children: [] }));
    children.push({ role: 'button', name: clearName, identifier: '_NS:407', enabled: true, actions: ['invoke'], children: [] });
    children.push({ role: 'staticText', name: '主显示器', identifier: '_NS:16',
      value: fault === 'ax-mismatch' && phase === 'first' ? 'mismatched' : display, children: [] });
    return { complete: true, truncated: false, root: { children } };
  } };
  const UI = {
    readText: async options => {
      scope(options);
      if (fault === 'read-failure' && phase === 'first') {
        injected = true;
        events.push({ operation: 'read-failure' });
        throw new Error('SYNTHETIC_READ_FAILURE');
      }
      reads.push({ phase, value: display });
      events.push({ operation: 'read', phase, value: display });
      return display;
    },
    tapTargets: async (targets, options) => {
      scope(options);
      const names = Array.from(targets, target => {
        assert.equal(target.role, 'button');
        if (target.identifier !== undefined) {
          assert.equal(target.identifier, '_NS:407');
          assert.equal(target.name, clearName);
        }
        assert.ok([...'0123456789', '×', '+', '=', clearName].includes(target.name));
        return target.name;
      });
      actions.push(names);
      events.push({ operation: 'input', names, afterFault: injected });
      assert.equal(injected, false, 'No action may follow an injected failure');
      if (names.length === 1 && names[0] === clearName) {
        const before = { display, clearName, expressionDirty };
        if (clearName === '全部清除') expressionDirty = false;
        display = '0'; clearName = '全部清除'; phase = 'clear';
        transitions.push({ input: names[0], before, after: { display, clearName, expressionDirty } });
      } else {
        const recognizedBatch = inputs === 0 ? JSON.stringify(names) === JSON.stringify(firstButtons)
          : names[0] === '6' && names[1] === '×' && names.at(-1) === '=';
        assert.ok(recognizedBatch, 'Unsupported input batching; this adapter expects the reviewed source batches');
        if (expressionDirty) boundedFailure('MODEL_STATE_VIOLATION', 'C alone does not clear a pending expression');
        inputs += 1;
        expressionDirty = true;
        if (fault === (inputs === 1 ? 'unknown-first' : 'unknown-second')) {
          injected = true;
          events.push({ operation: 'input-unknown', input: inputs });
          throw Object.assign(new Error('SYNTHETIC_INPUT_UNKNOWN'), { actionState: 'unknown' });
        }
        phase = inputs === 1 ? 'first' : 'final';
        display = inputs === 1 ? first : final;
        clearName = '清除';
      }
      return { ok: true, action: 'tapTargets', completed: names.map(name => ({ target: { locator: { role: 'button', name } }, actionState: 'acknowledged' })) };
    },
  };
  const page = { screenshot: async options => {
    assert.equal(options.target, 'activeWindow'); assert.equal(options.returnType, 'path');
    const name = scopedPath(options.path);
    screenshots.push({ name, synthetic: true, phase, display });
    return options.path;
  } };
  try {
    await new vm.Script('(async function(){\n' + code + '\n})()', { filename }).runInNewContext({
      window, Accessibility, UI, File, Execution: { artifactDir }, page,
      console: { log: value => logs.push(value) },
    }, { timeout: 1000 });
  } catch (caught) { error = caught; }
  return { error, actions, reads, transitions, screenshots, files, events, logs,
    value: logs.length ? JSON.parse(logs.at(-1)) : undefined };
}

function assertClearState(run, scenario) {
  const preparation = scenario.initialClear === '全部清除' ? [['全部清除']] : [['清除'], ['全部清除']];
  const firstInput = [...preparation, firstButtons];
  const secondPreparation = [...firstInput, ['清除'], ['全部清除']];
  const complete = [...secondPreparation, ['6', '×', ...scenario.first, '=']];
  if (run.error?.boundedObservationFailure) throw run.error;
  if (scenario.fault) {
    if (run.events.some(event => event.afterFault) || run.files['result.json'] || run.files['final-result.json']) {
      boundedFailure('FAIL_STOP_VIOLATION', 'Observed a dependent action or terminal result after the injected fault');
    }
    const unknown = scenario.fault.startsWith('unknown-');
    assert.match(run.error?.message || '', unknown ? /SYNTHETIC_INPUT_UNKNOWN/
      : scenario.fault === 'read-failure' ? /SYNTHETIC_READ_FAILURE/ : /inconsistent/);
    if (unknown) assert.equal(run.error.actionState, 'unknown');
    assert.deepEqual(run.actions, scenario.fault === 'unknown-second' ? complete : firstInput);
    assert.equal(run.logs.length, 0);
    assert.equal(run.files['result.json'], undefined);
    assert.equal(run.files['final-result.json'], undefined);
    assert.ok(!run.events.some(event => event.afterFault));
    return;
  }
  assert.equal(run.error, undefined, run.error?.message);
  assert.deepEqual(run.actions.slice(0, -1), secondPreparation);
  const consumer = run.actions.at(-1);
  assert.ok(consumer?.[0] === '6' && consumer[1] === '×' && consumer.at(-1) === '=', 'Unrecognized consumer batching');
  if (JSON.stringify(consumer.slice(2, -1)) !== JSON.stringify([...scenario.first])) {
    boundedFailure('CONSUMER_DATAFLOW_MISMATCH', 'Observed operand differs from the synthetic raw producer characters');
  }
  assert.deepEqual(run.actions, complete);
  assert.equal(run.logs.length, 1);
  assert.equal(run.value.firstResult, scenario.first);
  assert.equal(run.value.finalResult, scenario.final);
  assert.deepEqual(run.files['result.json'], { firstResult: scenario.first, finalResult: scenario.final,
    consumedCharacters: [...scenario.first] });
  assert.equal(run.files['runtime-data-first.json'].firstResult, scenario.first);
  const persistence = run.events.findIndex(event => event.name === 'runtime-data-first.json');
  const secondClear = run.events.findIndex((event, index) => index > persistence && event.operation === 'input');
  assert.ok(persistence >= 0 && secondClear > persistence);
  assert.deepEqual(run.reads, [{ phase: 'clear', value: '0' }, { phase: 'first', value: scenario.first },
    { phase: 'clear', value: '0' }, { phase: 'final', value: scenario.final }]);
  assert.deepEqual(run.screenshots.map(shot => shot.display), [scenario.first, scenario.final]);
}

async function observe(payload) {
  const scenarios = [];
  const clearState = payload.runtimeModel === 'calculator-clear-state-v1';
  for (const scenario of clearState ? CLEAR_SCENARIOS : SCENARIOS) {
    let run;
    try {
      if (clearState) {
        run = await exerciseClearState({ ...payload, ...scenario });
        assertClearState(run, scenario);
        scenarios.push({ ...scenario, verdict: 'pass', actions: run.actions, reads: run.reads,
          transitions: run.transitions, screenshots: run.screenshots, files: run.files,
          stoppedError: run.error && { message: run.error.message, actionState: run.error.actionState } });
        continue;
      }
      run = payload.harness === 'calculator-runtime-v1'
        ? await exerciseProduction({ code: payload.code, filename: payload.filename,
          first: [scenario.first, scenario.first], final: scenario.final })
        : await exerciseFixture({ ...payload, ...scenario });
      assert.equal(run.error, undefined, run.error?.message);
      assert.deepEqual(run.actions, [['全部清除'], firstButtons,
        ['全部清除'], ['6', '×', ...scenario.first, '=']]);
      assert.equal(run.value.firstResult, scenario.first);
      assert.equal(run.value.finalResult, scenario.final);
      assert.ok(run.reads.some(read => read.phase === 'first' && read.value === scenario.first));
      assert.ok(run.reads.some(read => read.phase === 'final' && read.value === scenario.final));
      scenarios.push({ ...scenario, verdict: 'pass', actions: run.actions, reads: run.reads, output: run.value });
    } catch (error) {
      const unsupported = clearState && !error.boundedObservationFailure;
      scenarios.push({ ...scenario, verdict: unsupported ? 'blocked' : 'fail',
        code: unsupported ? 'HARNESS_UNSUPPORTED' : error.code || 'CONSUMER_OBSERVATION_FAILED',
        message: error.message, actions: run?.actions, reads: run?.reads, output: run?.value });
    }
  }
  return { verdict: scenarios.some(scenario => scenario.verdict === 'fail') ? 'fail'
    : scenarios.some(scenario => scenario.verdict === 'blocked') ? 'blocked' : 'pass', scenarios };
}

function verifyFrozenConsumer(descriptor) {
  const evaluatorSha256 = sha256(fs.readFileSync(__filename));
  const report = { schemaVersion: SCHEMA, verdict: 'blocked', evidenceLayer: 'L1-controlled-substitutes',
    desktopActions: false, liveQualificationGranted: false, generalJavaScriptProof: false,
    evaluatorSha256, harness: descriptor?.harness, script: descriptor?.script, dependencies: descriptor?.dependencies,
    runtimeModel: descriptor?.runtimeModel || 'legacy-v1',
    businessHardFailGranted: false,
    applicability: descriptor?.runtimeModel === 'calculator-clear-state-v1' ? {
      kind: 'reviewed-frozen-candidate-adapter', reviewedSourceSha256: REVIEWED_CLEAR_SOURCE,
      sourceMatchesReviewed: descriptor?.script?.sha256 === REVIEWED_CLEAR_SOURCE,
      assumptions: ['reviewed grouped expression input calls', 'four normal-path display reads',
        'result.json and runtime-data-first.json observations', 'first/final screenshot calls'],
      unsupportedDisposition: 'blocked; different batching, diagnostics or artifact conventions need independent review and adapter validation, not a business Hard Fail',
      producerGuidance: false,
    } : { kind: 'bounded-synthetic-consumer-fixture', generalCalculatorContract: false },
    dependencyVerification: { mode: 'hash-only-metadata', executed: false },
    scope: 'Fixed synthetic Calculator read values, observed ordered button sequences and selected fail-stop scenarios only; not live execution or a general JavaScript proof.',
    modeledSemantics: descriptor?.runtimeModel === 'calculator-clear-state-v1'
      ? 'C changes the entry to zero but preserves pending expression state; AC resets it. AX and UI share display state except the explicit mismatch scenario. JSON and screenshots are in-memory observations, not native I/O.'
      : 'Legacy synthetic consumer boundary; no native execution.',
    executionBoundary: 'Bounded child process; vm is not an OS security sandbox. Only evaluator-approved source may be executed.',
    candidateRef: descriptor?.candidateRef, scriptRef: descriptor?.scriptRef,
    subjectRefs: [], businessDataflow: { verdict: 'unknown', releaseBlocked: true },
    verification: { mode: 'controlled-exact-byte', evaluator: { path: __filename, sha256: evaluatorSha256 }, evidenceRefs: [] },
    notEvaluated: ['live Runtime or desktop behavior', 'general JavaScript data-flow proof',
      'values outside the fixed scenario set', 'execution semantics of external or undeclared dependencies',
      'native RuntimeBinary execution, AppProfile and OperationRules on-site validity',
      'real screenshot pixels and filesystem writes (captured only in memory)',
      'independent evaluator identity and authorization (owned by the qualification entry)'],
    scenarios: [] };
  try {
    assert.equal(descriptor?.schemaVersion, SCHEMA, 'Unsupported descriptor schema');
    assert.equal(descriptor.evaluatorSha256, evaluatorSha256, 'Evaluator version drift');
    assert.ok(['calculator-runtime-v1', 'calculator-helper-fixture-v1'].includes(descriptor.harness), 'Unsupported harness');
    assert.ok(['legacy-v1', 'calculator-clear-state-v1'].includes(report.runtimeModel), 'Unsupported runtime model');
    assert.ok(report.runtimeModel === 'legacy-v1' || descriptor.harness === 'calculator-runtime-v1', 'State model requires runtime harness');
    assert.ok(Array.isArray(descriptor.dependencies), 'Explicit dependency inventory required');
    assert.ok(Array.isArray(descriptor.roots) && descriptor.roots.length, 'Approved roots required');
    const roots = new Map();
    for (const [rootId, directory] of descriptor.roots) {
      assert.ok(typeof rootId === 'string' && rootId && !roots.has(rootId), 'Unique root IDs required');
      assert.ok(path.isAbsolute(directory) && fs.statSync(directory).isDirectory(), 'Absolute directory root required');
      roots.set(rootId, fs.realpathSync(directory));
    }
    assert.equal(descriptor.candidateRef?.kind, 'CandidateManifest', 'CandidateManifest ref required');
    const candidatePath = resolveBoundRef(roots, descriptor.candidateRef);
    const sourcePath = resolveBoundRef(roots, descriptor.scriptRef);
    const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    assert.deepEqual(candidate.scriptRef, descriptor.scriptRef, 'Candidate binds another source ref');
    assert.deepEqual(candidate.dependencies, descriptor.dependencies, 'Candidate dependency inventory differs');
    for (const dependency of descriptor.dependencies) {
      assert.ok(['RuntimeBinary', 'AppProfile', 'OperationRules'].includes(dependency.kind), 'Executable or unknown external dependency is unsupported');
      assert.ok(!/\.(?:js|mjs|cjs)$/i.test(dependency.path), 'External JavaScript dependency is unsupported');
      const filename = resolveBoundRef(roots, dependency);
      if (dependency.kind !== 'RuntimeBinary') {
        assert.equal(path.extname(filename), '.json', 'Metadata must be JSON');
        const metadata = JSON.parse(fs.readFileSync(filename, 'utf8'));
        assert.ok(metadata && typeof metadata === 'object' && !Array.isArray(metadata), 'Metadata object required');
        assert.equal(metadata.schemaVersion, dependency.schemaVersion, 'Metadata schema differs');
      }
    }
    report.subjectRefs = [descriptor.candidateRef, descriptor.scriptRef, ...descriptor.dependencies];
    assert.ok(descriptor.script && path.isAbsolute(descriptor.script.path), 'Resolved absolute source path required');
    assert.equal(fs.realpathSync(descriptor.script.path), sourcePath, 'Execution path differs from bound source');
    assert.equal(descriptor.script.sha256, descriptor.scriptRef.sha256, 'Execution hash differs from source ref');
    const outputDir = path.resolve(descriptor.outputDir || path.join(REPO, '.runtime/tests/workflows/consumer-dataflow'));
    const runtimeRoot = path.join(REPO, '.runtime');
    assert.ok(outputDir.startsWith(runtimeRoot + path.sep), 'Observations must be under repository .runtime');
    const outputRoot = [...roots].sort((left, right) => right[1].length - left[1].length)
      .find(([, directory]) => outputDir.startsWith(directory + path.sep));
    assert.ok(outputRoot, 'Observation directory must be inside approved roots');
    let ancestor = outputDir;
    while (ancestor !== REPO) {
      if (fs.existsSync(ancestor)) assert.ok(!fs.lstatSync(ancestor).isSymbolicLink(), 'Observation directory cannot traverse symlinks');
      ancestor = path.dirname(ancestor);
    }
    fs.mkdirSync(outputDir, { recursive: true });
    assert.equal(fs.realpathSync(outputDir), outputDir, 'Observation directory cannot traverse symlinks');
    assert.match(descriptor.script.sha256, /^[a-f0-9]{64}$/, 'Frozen source hash required');
    const bytes = fs.readFileSync(descriptor.script.path);
    assert.ok(bytes.length > 0 && bytes.length <= 1024 * 1024, 'Source size outside supported bounds');
    assert.equal(sha256(bytes), descriptor.script.sha256, 'Frozen source drift');
    const code = bytes.toString('utf8');
    assert.ok(Buffer.from(code).equals(bytes), 'Source must round-trip as UTF-8');
    const worker = spawnSync(process.execPath, [__filename, '--worker'], {
      input: JSON.stringify({ code, filename: descriptor.script.path, harness: descriptor.harness, runtimeModel: report.runtimeModel }),
      encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
    });
    if (worker.error || worker.status !== 0) {
      return { ...report, code: 'EXECUTION_INCOMPLETE', message: worker.error?.message || worker.stderr || 'Worker did not complete' };
    }
    const observations = JSON.parse(worker.stdout);
    assert.ok(['pass', 'fail', 'blocked'].includes(observations.verdict), 'Invalid worker verdict');
    assert.equal(observations.scenarios.length, report.runtimeModel === 'calculator-clear-state-v1'
      ? CLEAR_SCENARIOS.length : SCENARIOS.length, 'Incomplete scenario coverage');
    assert.equal(sha256(fs.readFileSync(descriptor.script.path)), descriptor.script.sha256, 'Source changed during verification');
    assert.equal(sha256(fs.readFileSync(__filename)), evaluatorSha256, 'Evaluator changed during verification');
    for (const ref of report.subjectRefs) resolveBoundRef(roots, ref);
    if (report.runtimeModel === 'calculator-clear-state-v1' && observations.verdict === 'pass'
      && !report.applicability.sourceMatchesReviewed) {
      observations.verdict = 'blocked';
      observations.code = 'SOURCE_ADAPTATION_REQUIRED';
      observations.message = 'Observed compatibility does not extend this frozen-source adapter to an unreviewed source.';
    }
    const completed = { ...report, ...observations,
      businessDataflow: { verdict: observations.verdict === 'blocked' ? 'unknown' : observations.verdict,
        releaseBlocked: observations.verdict !== 'pass' } };
    const evidencePath = path.join(fs.mkdtempSync(path.join(outputDir, 'attempt-')), 'observations.json');
    fs.writeFileSync(evidencePath, JSON.stringify(completed, null, 2) + '\n', { flag: 'wx' });
    completed.verification.evidenceRefs = [{ kind: 'ControlledObservation', rootId: outputRoot[0],
      path: path.relative(outputRoot[1], evidencePath).split(path.sep).join('/'),
      sha256: sha256(fs.readFileSync(evidencePath)), schemaVersion: SCHEMA }];
    return completed;
  } catch (error) {
    return { ...report, code: 'VERIFICATION_BLOCKED', message: error.message };
  }
}

if (require.main === module) {
  if (process.argv.length === 3 && process.argv[2] === '--worker') {
    observe(JSON.parse(fs.readFileSync(0, 'utf8'))).then(result => {
      process.stdout.write(JSON.stringify(result));
    }).catch(error => { process.stderr.write(error.message); process.exitCode = 1; });
  } else if (process.argv.length === 3) {
    try {
      const report = verifyFrozenConsumer(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      process.exitCode = report.verdict === 'pass' ? 0 : 1;
    } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 2; }
  } else {
    process.stderr.write('Usage: node tests/workflows/tools/calculator-consumer-dataflow.cjs <descriptor.json>\n');
    process.exitCode = 2;
  }
}

module.exports = { verifyFrozenConsumer, exerciseProduction, exerciseClearState };
