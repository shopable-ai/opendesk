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
const DYNAMICS_MODEL = 'calculator-button-dynamics-v1';

function modelUnsupported(message, code = 'HARNESS_UNSUPPORTED') {
  throw Object.assign(new Error(message), { code, modelUnsupported: true });
}

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

// Evaluator-owned L1 model, independent of Candidate names/hashes/artifact names.
// Two fixed expressions only. This observes source execution and ordered inputs;
// it does not emulate arithmetic, native I/O, external JS, or a desktop Runtime.
function exerciseButtonDynamics({ code, filename, first, final, fault, initialClear = '清除' }) {
  const win = { id: 'synthetic-window', pid: 1, handle: 1, title: 'Calculator',
    app: { bundleId: 'com.apple.calculator' }, exeName: 'Calculator',
    exePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
    x: 0, y: 0, width: 232, height: 321,
    isForeground: true, hasFocus: true };
  const artifactDir = '/synthetic/artifacts';
  const run = { actions: [], buttons: [], reads: [], snapshots: [], windows: [], transitions: [],
    files: Object.create(null), writes: [], screenshots: [], logs: [], events: [], expressions: [] };
  let display = '987', phase = 'initial', clearName = initialClear;
  let dirty = initialClear === '清除', tokens = [], entry = '', equals = 0, calls = 0, capturedBytes = 0;
  let faultSeen = false, completed = false, modelError;
  const state = () => ({ phase, display, clearName, expressionDirty: dirty });
  const scope = options => {
    if (!options?.within || options.within.id !== win.id) modelUnsupported('Current synthetic window scope required');
    for (const key of ['pid', 'handle']) {
      if (options.within[key] !== undefined && options.within[key] !== win[key]) {
        boundedFailure('WINDOW_IDENTITY_MISMATCH', 'Window ' + key + ' differs from the current identity');
      }
    }
  };
  const scopedPath = name => {
    if (typeof name !== 'string' || !name.startsWith(artifactDir + '/')) modelUnsupported('In-memory artifact path required');
    const parts = name.slice(artifactDir.length + 1).split('/');
    if (!parts.every(part => part && part !== '.' && part !== '..' && !/[\\:\x00-\x1f]/.test(part))) {
      modelUnsupported('Portable in-memory artifact path required');
    }
    return parts.join('/');
  };
  const capture = value => {
    const bytes = JSON.stringify(value);
    capturedBytes += Buffer.byteLength(bytes);
    if (capturedBytes > 64 * 1024) modelUnsupported('Observation capture limit exceeded');
    return JSON.parse(bytes);
  };
  const faultEvent = kind => {
    faultSeen = true;
    run.faultObserved = { kind, phase, display };
    run.events.push({ operation: kind, phase });
  };
  const dispatch = (operation, args) => {
    if (++calls > 512) modelUnsupported('Bounded model call budget exceeded');
    if (operation.startsWith('window.')) {
      const target = args[0];
      if (operation === 'window.get') {
        if (target?.app?.bundleId !== win.app.bundleId) modelUnsupported('Only the Calculator bundle is modeled');
      } else scope({ within: target });
      run.windows.push({ operation, identity: { ...win } });
      return win;
    }
    if (operation === 'Accessibility.snapshot') {
      scope(args[0]);
      const value = fault === 'ax-mismatch' && phase === 'first' ? 'mismatched' : display;
      if (value !== display) faultEvent('ax-mismatch');
      run.snapshots.push({ phase, value, display, windowId: win.id });
      const children = [...'0123456789', '×', '+', '='].map(name => ({
        role: 'button', name, enabled: true, actions: ['invoke'], children: [],
      }));
      children.push({ role: 'button', name: clearName, identifier: '_NS:407',
        enabled: true, actions: ['invoke'], children: [] });
      children.push({ role: 'staticText', name: '主显示器', identifier: '_NS:16', value, children: [] });
      return { complete: true, truncated: false, root: { children } };
    }
    if (operation === 'UI.readText') {
      scope(args[0]);
      if (fault === 'read-failure' && phase === 'first') {
        faultEvent('read-failure');
        throw Object.assign(new Error('SYNTHETIC_READ_FAILURE'), { code: 'SYNTHETIC_READ_FAILURE' });
      }
      run.reads.push({ phase, value: display, windowId: win.id });
      run.events.push({ operation: 'read', phase, value: display });
      return display;
    }
    if (operation === 'UI.tapTargets') {
      scope(args[1]);
      const targets = args[0];
      if (!Array.isArray(targets) || !targets.length || targets.length > 64) modelUnsupported('Finite nonempty button batch required');
      run.actions.push(targets.map(target => target?.name));
      run.events.push({ operation: 'input-call', afterFault: faultSeen, names: run.actions.at(-1) });
      if (faultSeen) boundedFailure('FAIL_STOP_VIOLATION', 'Input attempted after an unknown action, failed read or AX contradiction');
      const completedTargets = [];
      for (const target of targets) {
        if (target?.role !== 'button' || ![...'0123456789', '×', '+', '=', clearName].includes(target.name)) {
          modelUnsupported('Only currently visible Basic Calculator role=button targets are modeled');
        }
        if (target.identifier !== undefined && (target.identifier !== '_NS:407' || target.name !== clearName)) {
          modelUnsupported('Unknown button identity');
        }
        const before = state(), name = target.name;
        const button = { role: 'button', name, before, actionState: 'acknowledged' };
        run.buttons.push(button);
        if (name === clearName) {
          if (tokens.length) modelUnsupported('Clearing a partial expression is outside this slice');
          if (name === '全部清除') dirty = false;
          display = '0'; entry = ''; clearName = '全部清除'; phase = 'clear';
          run.transitions.push({ input: name, before, after: state() });
        } else {
          if (!tokens.length && dirty) boundedFailure('MODEL_STATE_VIOLATION', 'C alone preserves the pending expression; AC is required');
          if (equals >= 2) modelUnsupported('More than two expressions are outside this slice');
          tokens.push(name); dirty = true; clearName = '清除';
          phase = equals === 0 ? 'first-entry' : 'second-entry';
          if (/^[0-9]$/.test(name)) { entry += name; display = entry; }
          else if (name !== '=') entry = '';
          if (name === '=') {
            run.expressions.push(tokens); tokens = []; equals += 1;
            display = equals === 1 ? first : final;
            phase = equals === 1 ? 'first' : 'final';
            if (fault === (equals === 1 ? 'unknown-first' : 'unknown-second')) {
              button.actionState = 'unknown'; button.after = state();
              faultEvent('input-unknown');
              throw Object.assign(new Error('SYNTHETIC_INPUT_UNKNOWN'), { actionState: 'unknown', code: 'SYNTHETIC_INPUT_UNKNOWN' });
            }
          }
        }
        button.after = state();
        completedTargets.push({ target: { locator: { role: 'button', name } }, actionState: 'acknowledged' });
      }
      return { ok: true, action: 'tapTargets', completed: completedTargets };
    }
    if (operation === 'File.writeJSON') {
      const name = scopedPath(args[0]), value = capture(args[1]);
      run.files[name] = value;
      run.writes.push({ name, value, phase, afterFault: faultSeen });
      run.events.push({ operation, name, phase, afterFault: faultSeen });
      return undefined;
    }
    if (operation === 'page.screenshot') {
      const options = args[0];
      if (options?.target !== 'activeWindow' || options.returnType !== 'path') modelUnsupported('Only activeWindow path screenshots are modeled');
      const name = scopedPath(options.path);
      run.screenshots.push({ name, synthetic: true, phase, display, windowId: win.id, afterFault: faultSeen });
      return options.path;
    }
    if (operation === 'console.log') {
      run.logs.push({ values: capture(args), phase, afterFault: faultSeen });
      return undefined;
    }
    if (operation === 'completion') {
      completed = true;
      run.returned = args.length ? { defined: true, value: capture(args[0]) } : { defined: false };
      return undefined;
    }
    if (operation === 'rejection') {
      completed = true; run.error = args[0]; return undefined;
    }
    modelUnsupported('Unknown observation operation');
  };
  // The bridge returns JSON only. Candidate-visible functions/Promises/errors
  // belong to the context, so async continuations share the vm time budget.
  const context = vm.createContext({ __bridge: (operation, encoded) => {
    try { return JSON.stringify({ ok: true, value: dispatch(operation, JSON.parse(encoded)) }); }
    catch (error) {
      if (error.modelUnsupported || error.boundedObservationFailure) modelError ||= error;
      return JSON.stringify({ ok: false, error: { message: error.message, code: error.code,
        actionState: error.actionState, modelUnsupported: error.modelUnsupported,
        boundedObservationFailure: error.boundedObservationFailure } });
    }
  } }, { microtaskMode: 'afterEvaluate', codeGeneration: { strings: false, wasm: false } });
  // This is a liveness ceiling, not a business oracle. A 250ms VM deadline
  // rejected finite key-by-key sources under parallel workflow-suite load.
  const limits = { timeout: 1000 };
  try {
    const observeCompletion = new vm.Script(`(() => {
      const bridge = __bridge; delete globalThis.__bridge;
      const invoke = (op, args) => {
        const result = JSON.parse(bridge(op, JSON.stringify(args)));
        if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
        return result.value;
      };
      const api = (name, methods) => Object.fromEntries(methods.map(method =>
        [method, async (...args) => invoke(name + '.' + method, args)]));
      globalThis.window = api('window', ['get', 'activate', 'current']);
      globalThis.Accessibility = api('Accessibility', ['snapshot']);
      globalThis.UI = api('UI', ['readText', 'tapTargets']);
      globalThis.File = api('File', ['writeJSON']);
      globalThis.page = api('page', ['screenshot']);
      globalThis.console = { log: (...args) => invoke('console.log', args) };
      globalThis.Execution = ${JSON.stringify({ artifactDir, scriptPath: filename, scriptDir: path.dirname(filename) })};
      return value => Promise.resolve(value).then(
        result => invoke('completion', result === undefined ? [] : [result]),
        error => invoke('rejection', [{ message: String(error?.message || error), name: error?.name,
          code: error?.code, actionState: error?.actionState,
          modelUnsupported: error?.modelUnsupported, boundedObservationFailure: error?.boundedObservationFailure }]));
    })()`).runInContext(context, limits);
    let script;
    try { script = new vm.Script(code, { filename }); run.entryForm = 'script-completion'; }
    catch (error) {
      if (error.name !== 'SyntaxError') throw error;
      // Runtime function-body scripts may contain top-level await/return. No
      // source statement, function name or log convention is rewritten.
      script = new vm.Script('(async function(){\n' + code + '\n})()', { filename });
      run.entryForm = 'async-body';
    }
    const actualCompletion = script.runInContext(context, limits);
    // The observer is private while source executes. It cannot be called to
    // manufacture a resolved return from a diagnostic or fabricated value.
    Object.defineProperty(context, '__observeCompletion', { value: observeCompletion, configurable: true });
    Object.defineProperty(context, '__candidateCompletion', { value: actualCompletion, configurable: true });
    new vm.Script('__observeCompletion(__candidateCompletion)').runInContext(context, limits);
    if (!completed) modelUnsupported('Pending completion needs unmodeled scheduling', 'ASYNC_COMPLETION_UNSUPPORTED');
  } catch (error) { run.error = error; }
  if (modelError) run.error = modelError;
  return run;
}

function assertButtonDynamics(run, scenario) {
  if (run.error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') modelUnsupported('VM execution exceeded its time budget', 'RUNTIME_MODEL_TIMEOUT');
  if (run.error?.modelUnsupported) throw run.error;
  if (run.error?.boundedObservationFailure) throw run.error;
  if (run.error && ['ReferenceError', 'TypeError', 'SyntaxError', 'EvalError'].includes(run.error.name)) {
    modelUnsupported('Source requires unsupported JavaScript or Runtime facilities: ' + run.error.message);
  }
  const fail = message => boundedFailure('CONSUMER_DATAFLOW_MISMATCH', message);
  // Inspect observations, not diagnostic labels or the final console line.
  const inspect = (value, callback) => {
    callback(value);
    if (typeof value === 'string') {
      let parsed;
      try { parsed = JSON.parse(value); } catch { /* diagnostic text */ }
      if (typeof parsed === 'object' && parsed !== null) inspect(parsed, callback);
    } else if (value && typeof value === 'object') for (const child of Object.values(value)) inspect(child, callback);
  };
  const outputs = [...run.logs.map(log => log.values), ...run.writes.map(write => write.value),
    ...(run.returned?.defined ? [run.returned.value] : [])];
  if (scenario.fault) {
    if (!run.faultObserved) boundedFailure('FAULT_NOT_EXERCISED', 'Source never observed the selected fault');
    if (run.events.some(event => event.afterFault && event.operation === 'input-call')) {
      boundedFailure('FAIL_STOP_VIOLATION', 'Input attempted after the selected fault');
    }
    const expected = scenario.fault === 'unknown-second' ? [firstButtons, ['6', '×', ...scenario.first, '=']] : [firstButtons];
    if (JSON.stringify(run.expressions) !== JSON.stringify(expected)) fail('Fault-path ordered input differs from scope');
    if (scenario.fault === 'ax-mismatch' || scenario.fault === 'read-failure') {
      if (run.buttons.at(-1)?.name !== '=') boundedFailure('FAIL_STOP_VIOLATION', 'Dependent preparation followed a read/AX failure');
    }
    if (run.screenshots.some(shot => shot.afterFault)) boundedFailure('FAIL_STOP_VIOLATION', 'Screenshot attempted after failure');
    for (const value of outputs) inspect(value, item => {
      if (item === scenario.final || (item && typeof item === 'object' && Object.hasOwn(item, 'finalResult'))) {
        boundedFailure('FAIL_STOP_VIOLATION', 'Terminal result published after failure');
      }
    });
    return;
  }
  if (run.error) boundedFailure('CANDIDATE_EXECUTION_FAILED', run.error.message);
  if (JSON.stringify(run.expressions) !== JSON.stringify([firstButtons, ['6', '×', ...scenario.first, '=']])) {
    fail('Actual ordered buttons must consume every raw producer character, including repeats and leading zeros');
  }
  for (const [phase, value] of [['first', scenario.first], ['final', scenario.final]]) {
    if (!run.reads.some(read => read.phase === phase && read.value === value)) fail('Missing actual ' + phase + ' UI read');
  }
  const firstRead = run.events.findIndex(event => event.operation === 'read' && event.phase === 'first');
  const nextInput = run.events.findIndex((event, index) => index > firstRead && event.operation === 'input-call');
  if (firstRead < 0 || nextInput <= firstRead) fail('Fresh producer read must precede dependent input');
  let terminalObserved = false;
  for (const value of outputs) inspect(value, item => {
    if (item === scenario.final) terminalObserved = true;
    if (!item || typeof item !== 'object') return;
    for (const [key, expected] of [['firstResult', scenario.first], ['finalResult', scenario.final]]) {
      if (Object.hasOwn(item, key) && item[key] !== expected) fail('Published ' + key + ' differs from the fresh UI string');
    }
  });
  if (!terminalObserved) modelUnsupported('No supported string-valued terminal observation in return, console or JSON capture');
}

function observeButtonDynamics(payload) {
  const scenarios = CLEAR_SCENARIOS.map(scenario => {
    const run = exerciseButtonDynamics({ ...payload, ...scenario });
    let verdict = 'pass', error;
    try { assertButtonDynamics(run, scenario); } catch (caught) {
      error = caught; verdict = error.modelUnsupported ? 'blocked' : 'fail';
    }
    const { error: executionError, ...observations } = run;
    return { ...scenario, verdict, ...observations,
      ...(error ? { code: error.code || 'CONSUMER_OBSERVATION_FAILED', message: error.message } : {}),
      stoppedError: executionError && { message: executionError.message, actionState: executionError.actionState },
    };
  });
  return { verdict: scenarios.some(scenario => scenario.verdict === 'fail') ? 'fail'
    : scenarios.some(scenario => scenario.verdict === 'blocked') ? 'blocked' : 'pass', scenarios };
}

async function observe(payload) {
  if (payload.runtimeModel === DYNAMICS_MODEL) return observeButtonDynamics(payload);
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
      // The production example logs the final result directly; older frozen
      // fixture bytes log both values. The observed button sequence above is
      // the independent proof that the first read reached the second input.
      if (typeof run.value === 'number') {
        assert.equal(run.logs.at(-1), scenario.final);
        assert.equal(run.value, Number(scenario.final));
      }
      else {
        assert.equal(run.value.firstResult, scenario.first);
        assert.equal(run.value.finalResult, scenario.final);
      }
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
  const dynamics = descriptor?.runtimeModel === DYNAMICS_MODEL;
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
    } : dynamics ? { kind: 'bounded-original-byte-button-observer', generalCalculatorContract: false,
      sourceHashAllowlist: false, producerGuidance: false,
      assumptions: ['two fixed Basic Calculator expressions separated by AC',
        'ordered role=button calls, per-key or equivalent batches', 'context-local bounded Promise scheduling',
        'fresh first/final UI reads and string-valued observed terminal output'],
      unsupportedDisposition: 'blocked; outside this synthetic model, not a business Hard Fail' }
      : { kind: 'bounded-synthetic-consumer-fixture', generalCalculatorContract: false },
    dependencyVerification: { mode: dynamics ? 'content-bound-only' : 'hash-only-metadata', executed: false },
    scope: 'Fixed synthetic Calculator read values, observed ordered button sequences and selected fail-stop scenarios only; not live execution or a general JavaScript proof.',
    modeledSemantics: descriptor?.runtimeModel === 'calculator-clear-state-v1'
      ? 'C changes the entry to zero but preserves pending expression state; AC resets it. AX and UI share display state except the explicit mismatch scenario. JSON and screenshots are in-memory observations, not native I/O.'
      : dynamics ? 'Per-button state and equals boundaries inject fixed non-arithmetic first/final strings. C preserves pending expression state; AC resets it. AX and UI share current display except the explicit mismatch. Window identity is synthetic; JSON/screenshot effects are captured in memory.'
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
    assert.ok(['legacy-v1', 'calculator-clear-state-v1', DYNAMICS_MODEL].includes(report.runtimeModel), 'Unsupported runtime model');
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
    if (dynamics) assert.equal(candidate.schemaVersion, descriptor.candidateRef.schemaVersion, 'Candidate schema differs');
    for (const dependency of descriptor.dependencies) {
      if (dynamics && dependency.kind === 'RuntimeSupportFile') {
        // Descriptor-local role: Runtime-loaded support bytes are frozen only.
        // No require/import/eval, installation, or added callable surface.
        assert.ok(/\.(?:js|mjs|cjs)$/i.test(dependency.path), 'Runtime support file must name JavaScript bytes');
        resolveBoundRef(roots, dependency);
        continue;
      }
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
      encoding: 'utf8', timeout: dynamics ? 20000 : 5000, maxBuffer: (dynamics ? 4 : 1) * 1024 * 1024,
    });
    if (worker.error || worker.status !== 0) {
      return { ...report, code: 'EXECUTION_INCOMPLETE', message: worker.error?.message || worker.stderr || 'Worker did not complete' };
    }
    const observations = JSON.parse(worker.stdout);
    assert.ok(['pass', 'fail', 'blocked'].includes(observations.verdict), 'Invalid worker verdict');
    assert.equal(observations.scenarios.length, dynamics || report.runtimeModel === 'calculator-clear-state-v1'
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
