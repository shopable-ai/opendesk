'use strict';
// Execute the maintained production bytes, not a second Calculator implementation.
// These are host-side data-flow/control-flow tests. There is no Runtime, Calculator,
// real observation, model, or desktop Fresh Run here. Synthetic UI values deliberately
// need not satisfy arithmetic: they reveal cached/expected/local-computation substitutions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const REPO = path.resolve(__dirname, '../..');
const SOURCE = 'examples/agent-to-recipe/calculator.js';
const source = fs.readFileSync(path.join(REPO, SOURCE), 'utf8');
const spec = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/workflows/calculator/spec.json'), 'utf8'));
const firstButtons = ['2', '5', '×', '4', '+', '1', '0', '='];

async function exercise({ first = ['0040', '0040'], final = '777', failInput = 0,
  staleAfterFirst = false, ambiguousButton = false, readError = false, code = source } = {}) {
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
    // The async wrapper supplies only top-level-await support, never business steps.
    // vm is a test context, not an OS security sandbox for untrusted candidates.
    await new vm.Script('(async function(){\n' + code + '\n})()', { filename: SOURCE })
      .runInNewContext({ window, Accessibility, UI, console: { log: value => logs.push(value) } }, { timeout: 1000 });
  } catch (caught) { error = caught; }
  return { error, value: logs.length ? JSON.parse(logs.at(-1)) : undefined, logs, actions, reads, receipts, clearCount, inputs };
}

function assertDataflow(run, first, final) {
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(run.logs.length, 1);
  assert.deepEqual(run.actions, [['全部清除'], firstButtons, ['全部清除'], ['6', '×', ...first, '=']]);
  assert.equal(run.value.firstResult, first);
  assert.equal(run.value.finalResult, final);
  assert.deepEqual(run.value.firstInput, run.receipts[0]);
  assert.deepEqual(run.value.secondInput, run.receipts[1]);
  assert.deepEqual(run.reads.filter(item => item.phase === 'first').map(item => item.value), [first, first]);
}

test('maintained production source still matches the fixed r003 spec; no rewritten test recipe', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'), spec.scriptHash);
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
