'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'fresh-witness.js'), 'utf8');

async function observe(values) {
  let clock = 0;
  let index = 0;
  const logs = [];
  const win = {id: 'synthetic-window', pid: 1, handle: 1, title: 'Calculator',
    x: 0, y: 0, width: 232, height: 321, isForeground: true};
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const context = vm.createContext({
    Date: Clock,
    console: {log: value => logs.push(value)},
    window: {get: async () => win, current: async () => win},
    Accessibility: {snapshot: async () => ({complete: true, truncated: false,
      requestId: 'synthetic-' + index,
      root: {children: [{role: 'staticText', name: '主显示器', value: values[index]}]}})},
    page: {screenshot: async () => ({synthetic: true}), waitForTimeout: async () => {
      clock += 500;
      index = Math.min(index + 1, values.length - 1);
    }},
    Execution: {artifactDir: 'synthetic-no-write'},
  });
  await new vm.Script(`(async () => {\n${source}\n})()`).runInContext(context, {timeout: 1000});
  assert.ok(logs.includes('FRESH_WITNESS_READY'));
  return JSON.parse(logs.find(value => value.startsWith('{') && JSON.parse(value).kind === 'witness-complete'));
}

test('witness records a nonzero starting display without treating it as current firstResult', async () => {
  const report = await observe(['previous-value', '0', '2', '25', 'first-observed', '0', '6', 'final-observed']);
  assert.equal(report.initialObservedValue, 'previous-value');
  assert.equal(report.initialClearObserved, true);
  assert.equal(report.firstResult, 'to-be-correlated-after-Candidate-run');
  assert.equal(report.lastObservedValue, 'final-observed');
});

test('witness still accepts an independently clean initial display', async () => {
  const report = await observe(['0', '2', 'first-observed', '0', '6', 'final-observed']);
  assert.equal(report.initialObservedValue, '0');
  assert.equal(report.lastObservedValue, 'final-observed');
});

test('initial nonzero followed by one clear is not a new complete business run', async () => {
  await assert.rejects(observe(['previous-value', '0', 'final-observed']), /did not observe/);
});

test('no initial clean state cannot qualify', async () => {
  await assert.rejects(observe(['previous-value', 'first-observed', 'final-observed']), /did not observe/);
});
