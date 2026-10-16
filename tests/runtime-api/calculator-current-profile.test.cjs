'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {exercise, assess, objects} = require('../human-to-recipe/tools/qualify-calculator-partial.cjs');

// Execute the current candidate bytes with controlled observations, never GUI input.
const source = path.resolve(__dirname, '../../examples/agent-to-recipe/calculator-current.js');
const code = fs.readFileSync(source, 'utf8');
const firstExpression = ['2', '5', '乘', '4', '加', '1', '0', '等于'];
const secondExpression = ['6', '乘', '0', '0', '4', '0', '等于'];
const firstActions = [['清除'], ['全部清除'], firstExpression];
const allActions = [...firstActions, ['清除'], ['全部清除'], secondExpression];

async function exerciseModern({fault, faultPhase = 'initial', windowPatch = {}, boundsPatch = {}} = {}) {
  const win = {
    id: 'controlled-modern-calculator', pid: 41, handle: 17,
    title: '计算器', width: 230, height: 408, x: 317, y: 109,
    exePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
    isForeground: true, hasFocus: true, ...windowPatch,
  };
  const bounds = {
    x: win.x + 12, y: win.y + 46, width: 206, height: 64,
    coordinateSpace: 'macos-global-display-points-top-left', ...boundsPatch,
  };
  const region = {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height};
  const actions = [], reads = [], logs = [], events = [];
  let phase = 'initial', display = '987', clear = '清除', inputCount = 0;
  const scoped = options => assert.deepEqual({...options.within}, win);
  const window = {
    get: async query => {
      assert.equal(query.app.bundleId, 'com.apple.calculator');
      return {...win};
    },
    activate: async selected => { assert.deepEqual({...selected}, win); return {...win}; },
    current: async selected => { assert.deepEqual({...selected}, win); return {...win}; },
  };
  const Accessibility = {
    snapshot: async options => {
      scoped(options);
      for (const property of ['identifier', 'value', 'nativeBounds']) {
        assert.ok(options.properties.includes(property), 'Observation must request ' + property);
      }
      events.push({kind: 'snapshot', phase});
      const mode = {role: 'group', identifier: 'Mode: basic; unitConversion: false', children: []};
      const value = {role: 'staticText', value: '\u200e' + display, children: []};
      const input = {role: 'group', identifier: 'StandardInputView', nativeBounds: {...bounds}, children: [value]};
      const buttons = [...'0123456789', '乘', '加', '等于', clear].map(name => ({
        role: 'button', name, enabled: true, actions: ['invoke'], children: [],
      }));
      // An unrelated staticText must never become the calculator display.
      const children = [mode, input, {role: 'staticText', name: '帮助', value: '999', children: []}, ...buttons];
      if (phase === faultPhase) {
        if (fault === 'missing-display') input.children = [];
        if (fault === 'duplicate-display') input.children.push({...value});
        if (fault === 'missing-container') input.identifier = 'OtherInputView';
        if (fault === 'duplicate-container') children.push({...input});
        if (fault === 'non-basic') mode.identifier = 'Mode: scientific; unitConversion: false';
        if (fault === 'unit-conversion') mode.identifier = 'Mode: basic; unitConversion: true';
        if (fault === 'duplicate-basic') children.push({...mode});
        if (fault === 'missing-bounds') delete input.nativeBounds;
        if (fault === 'symbol-buttons') {
          for (const button of buttons) button.name = ({乘: '×', 加: '+', 等于: '='})[button.name] || button.name;
        }
      }
      return {complete: true, truncated: false, root: {role: 'window', children}};
    },
  };
  const UI = {
    readText: async options => {
      scoped(options);
      assert.deepEqual({...options.region}, region, 'Read region must equal the observed global display bounds');
      const value = '\u200e' + display;
      reads.push({phase, value, region: {...options.region}});
      events.push({kind: 'read', phase, value});
      return value;
    },
    tapTargets: async (targets, options) => {
      scoped(options);
      const names = Array.from(targets, target => {
        assert.equal(target.role, 'button');
        return target.name;
      });
      actions.push(names);
      events.push({kind: 'input', names});
      if (names.length === 1 && ['清除', '全部清除'].includes(names[0])) {
        display = '0'; clear = '全部清除'; phase = 'clear';
      } else {
        inputCount += 1;
        phase = inputCount === 1 ? 'first' : 'final';
        // Deliberately scripted observations, with no expression evaluator or expected arithmetic.
        display = inputCount === 1 ? '0040' : '777';
        clear = '清除';
      }
      const receipt = {
        ok: true, action: 'tapTargets', completed: names.map(name => ({
          backend: 'macos-ax', requestId: 'controlled-' + actions.length, actionState: 'acknowledged',
          target: {source: 'accessibility', locator: {role: 'button', name}},
        })),
      };
      const unknown = fault === 'unknown-receipt' && phase === faultPhase;
      if (unknown) receipt.completed[0].actionState = 'unknown';
      events.push({kind: 'receipt', phase, unknown});
      return receipt;
    },
  };
  let error;
  try {
    await new vm.Script('(async () => {\n' + code + '\n})()', {filename: source})
      .runInNewContext({window, Accessibility, UI, console: {log: value => logs.push(value)}}, {timeout: 1000});
  } catch (caught) {
    error = caught;
  }
  return {actions, reads, logs, events, error, region};
}

function assertStopped(run, expectedActions, message) {
  assert.ok(run.error, 'Unsupported or uncertain state must abort');
  assert.match(run.error.message, message);
  assert.deepEqual(run.actions, expectedActions, 'No reset or input after the failing boundary');
  assert.equal(objects(run.logs.join('\n')).some(value => value.firstResult && value.finalResult), false);
}

test('legacy Calculator profile retains the actual-read consumer through the existing exercise helper', async () => {
  const run = await exercise(code, {first: '0040', final: '777'});
  assess(run, {first: '0040', final: '777'});
  assert.deepEqual(run.actions.filter(names => names.length > 1), [
    ['2', '5', '×', '4', '+', '1', '0', '='],
    ['6', '×', '0', '0', '4', '0', '='],
  ]);
});

test('modern Basic profile uses Chinese semantic targets and every digit of the actual LRM-prefixed read', async () => {
  const run = await exerciseModern();
  assert.equal(run.error, undefined, run.error?.stack);
  assert.deepEqual(run.actions, allActions);
  const result = objects(run.logs.join('\n')).findLast(value => value.firstResult && value.finalResult);
  assert.ok(result, 'Candidate must report both actual observations');
  assert.equal(result.firstResult, '0040');
  assert.equal(result.finalResult, '777');
  assert.deepEqual(result.firstInput.completed.map(item => item.target.locator.name), firstExpression);
  assert.deepEqual(result.secondInput.completed.map(item => item.target.locator.name), secondExpression);
  assert.deepEqual(run.reads.filter(read => read.phase === 'first').map(read => read.value), ['\u200e0040', '\u200e0040']);
  assert.deepEqual(run.reads.filter(read => read.phase === 'final').map(read => read.value), ['\u200e777', '\u200e777']);
  const firstRead = run.events.findIndex(event => event.kind === 'read' && event.phase === 'first');
  const secondInput = run.events.findIndex(event => event.kind === 'input' && event.names[0] === '6');
  assert.ok(firstRead >= 0 && secondInput > firstRead);
  assert.deepEqual(run.events.slice(firstRead + 1, secondInput).filter(event => event.kind === 'input')
    .map(event => event.names), [['清除'], ['全部清除']]);
});

test('modern display reads use native global geometry at translated window positions', async t => {
  for (const origin of [{x: 317, y: 109}, {x: -510, y: 231}]) {
    await t.test(JSON.stringify(origin), async () => {
      const run = await exerciseModern({windowPatch: origin, boundsPatch: {width: 193, height: 57}});
      assert.equal(run.error, undefined, run.error?.stack);
      assert.equal(run.reads.length, 10, 'Initial, both all-clears and both results are each read twice');
      for (const read of run.reads) {
        assert.deepEqual(read.region, {x: origin.x + 12, y: origin.y + 46, width: 193, height: 57});
      }
    });
  }
});

for (const [fault, message] of [
  ['missing-display', /Calculator display missing or ambiguous/],
  ['duplicate-display', /Calculator display missing or ambiguous/],
  ['missing-container', /Calculator input display missing or ambiguous/],
  ['duplicate-container', /Calculator input display missing or ambiguous/],
  ['non-basic', /observed Basic mode/],
  ['unit-conversion', /observed Basic mode/],
  ['duplicate-basic', /observed Basic mode/],
]) {
  test('modern ' + fault + ' aborts before input and when first-result observation changes', async t => {
    for (const faultPhase of ['initial', 'first']) {
      await t.test(faultPhase, async () => {
        const run = await exerciseModern({fault, faultPhase});
        assertStopped(run, faultPhase === 'initial' ? [] : firstActions, message);
        assert.equal(run.reads.some(read => read.phase === faultPhase), false);
        assert.equal(run.reads.some(read => read.phase === 'final'), false);
      });
    }
  });
}

test('symbol-only buttons cannot satisfy the modern semantic button profile', async () => {
  const run = await exerciseModern({fault: 'symbol-buttons'});
  assertStopped(run, [], /Calculator button missing, disabled or ambiguous/);
});

test('a modern profile with a foreign executable or unsupported dimensions cannot submit input', async t => {
  for (const windowPatch of [{exePath: '/Applications/Calculator.app/Contents/MacOS/Calculator'}, {width: 231}, {height: 409}]) {
    await t.test(JSON.stringify(windowPatch), async () => {
      const run = await exerciseModern({windowPatch});
      assertStopped(run, [], /supported Calculator Basic layout/);
      assert.equal(run.reads.length, 0);
    });
  }
});

test('missing, invalid or out-of-window display geometry aborts before reads and input', async t => {
  const cases = [
    {fault: 'missing-bounds'},
    ...[
      {coordinateSpace: 'window'}, {coordinateSpace: undefined}, {width: 0}, {height: -1},
      {x: 316}, {y: 108}, {width: 219}, {height: 363},
    ].map(boundsPatch => ({boundsPatch})),
  ];
  for (const scenario of cases) {
    await t.test(JSON.stringify(scenario), async () => {
      const run = await exerciseModern(scenario);
      assertStopped(run, [], /display region is not proven inside the bound window/);
      assert.equal(run.reads.length, 0);
    });
  }
});

test('unknown native receipts stop immediately without reads, resets or replay', async t => {
  for (const [faultPhase, expectedActions] of [
    ['clear', [['清除']]], ['first', firstActions], ['final', allActions],
  ]) {
    await t.test(faultPhase, async () => {
      const run = await exerciseModern({fault: 'unknown-receipt', faultPhase});
      assertStopped(run, expectedActions, /outcome may be unknown/);
      assert.deepEqual(run.events.at(-1), {kind: 'receipt', phase: faultPhase, unknown: true});
      assert.equal(run.reads.some(read => read.phase === faultPhase), false);
    });
  }
});
