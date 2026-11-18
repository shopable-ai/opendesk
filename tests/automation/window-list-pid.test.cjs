'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const facadeSource = fs.readFileSync('polyfills/003-window.js', 'utf8');
const recipeSource = fs.readFileSync('examples/ai-cli/macos-calculator-recipe.js', 'utf8');
const darwinSource = fs.readFileSync('automation/window_manager_darwin.go', 'utf8');
const row = (pid, handle = 10) => ({pid, id: `darwin:${pid}:native:${handle}`, handle,
  title: 'Calculator', x: 0, y: 0, width: 230, height: 408});
function facade(list) {
  const window = {list, getCapabilities: () => ({platform: 'fixture'})};
  const host = {window, App: {get: () => ({pids: [1, 2]})}};
  new Function('globalThis', 'window', facadeSource)(host, window);
  return window;
}
test('facade passes only PID to native and keeps other filters and all matching rows', async () => {
  const calls = [];
  const win = facade(function(...args) { calls.push(args); return [row(1), row(1, 11), row(2)]; });
  assert.equal(win.list({pid: 1, title: 'Calculator'}).length, 2);
  assert.deepEqual(calls.pop(), [{pid: 1}]);
  await assert.rejects(win.get({pid: 1}), {code: 'AMBIGUOUS_TARGET'});
  assert.deepEqual(calls.pop(), [{pid: 1}]);
  for (const selector of [undefined, {title: 'Calculator'}, {app: 'Calculator'}]) {
    win.list(selector); assert.deepEqual(calls.pop(), []);
  }
  for (const pid of [0, -1, 1.5, '1', NaN, Infinity, 4294967296]) {
    assert.throws(() => win.list({pid}), {code: 'INVALID_ARGUMENT'});
  }
  assert.equal(calls.length, 0);
});
test('scoped facade errors retain cause and never retry desktop list', () => {
  const cause = Object.assign(new Error('denied'), {code: 'PERMISSION_DENIED'});
  const calls = [];
  const win = facade((...args) => {calls.push(args); throw cause;});
  assert.throws(() => win.list({pid: 42}), error => error.cause === cause && error.code === cause.code);
  assert.deepEqual(calls, [[{pid: 42}]]);
});
function recipe(list, pids = [41, 42]) {
  const start = recipeSource.indexOf('async function resolveCalculatorWindow()');
  const end = recipeSource.indexOf('async function getCalculatorBounds()', start);
  const context = vm.createContext({window: {list}, App: {launch: async () => ({bundleId: 'com.apple.calculator', pids})},
    CALCULATOR_BUNDLE_ID: 'com.apple.calculator', calculatorError: (code, op, message) => Object.assign(new Error(message), {code})});
  vm.runInContext('let calculatorRun;\n' + recipeSource.slice(start, end) +
    '\nthis.resolve = async () => (calculatorRun = await resolveCalculatorWindow()); this.refresh = getCalculatorWindow;', context);
  return context;
}
test('recipe queries every distinct PID and retains group ambiguity and lifecycle identity', async () => {
  const calls = [];
  let rows = [row(42)];
  const f = recipe(selector => {assert.ok(selector); calls.push(selector.pid); return rows.filter(r => r.pid === selector.pid);}, [41, 42, 42]);
  assert.equal((await f.resolve()).window.pid, 42);
  assert.deepEqual(calls.splice(0), [41, 42]);
  await f.refresh(); assert.deepEqual(calls.splice(0), [41, 42]);
  rows = [row(42), row(41)];
  await assert.rejects(f.refresh(), {code: 'STALE_TARGET'});
  await assert.rejects(f.resolve(), {code: 'AMBIGUOUS_TARGET'});
  rows = [row(42, 99)];
  await assert.rejects(f.refresh(), {code: 'STALE_TARGET'});
});
test('recipe propagates an error from any PID without a broader retry', async () => {
  const cause = new Error('second PID failed'), calls = [];
  const f = recipe(selector => {assert.ok(selector); calls.push(selector.pid); if (selector.pid === 42) throw cause; return [row(41)];});
  await assert.rejects(f.resolve(), error => error === cause);
  assert.deepEqual(calls, [41, 42]);
});
function jxa({pid, failProcess = false, failWindows = false, failPID = false, failPosition = false, failSize = false, position = [10, 20], size = [230, 408]} = {}) {
  const start = darwinSource.indexOf('func listMacWindows(');
  const script = darwinSource.slice(start).match(/script := `([\s\S]*?)`/)[1];
  const queries = [], windowPids = [];
  const process = id => ({unixId: () => {if (failPID) throw new Error('pid denied'); return id;}, name: () => 'Calculator', windows: () => {
    windowPids.push(id); if (failWindows) throw new Error('windows denied');
    return [{name: () => '', position: () => {if (failPosition) throw new Error('position denied'); return position;}, size: () => {if (failSize) throw new Error('size denied'); return size;}}];
  }});
  const context = vm.createContext({Application: () => ({applicationProcesses: {whose: query => () => {
    queries.push(query); if (query.frontmost) return [];
    if (failProcess) throw new Error('process denied');
    return query.unixId ? (query.unixId === 42 ? [process(42)] : []) : [process(41), process(42)];
  }}})});
  vm.runInContext(script, context);
  const run = () => JSON.parse(context.run(pid ? [String(pid)] : []));
  return {run, queries, windowPids};
}
test('JXA limits process query before requesting windows, preserves fields and absent PID', () => {
  const scoped = jxa({pid: 42});
  const rows = scoped.run();
  assert.deepEqual(scoped.windowPids, [42]);
  assert.equal(scoped.queries.at(-1).unixId, 42);
  assert.equal(scoped.queries.at(-1).visible, true);
  assert.equal(rows[0].pid, 42); assert.equal(rows[0].title, '');
  assert.equal(rows[0].index, 0); assert.equal(rows[0].width, 230);
  const absent = jxa({pid: 99}); assert.deepEqual(absent.run(), []); assert.deepEqual(absent.windowPids, []);
  const all = jxa(); assert.equal(all.run().length, 2); assert.deepEqual(all.windowPids, [41, 42]);
});
test('scoped JXA propagates process/window enumeration errors; default behavior stays compatible', () => {
  for (const failure of [{failProcess: true}, {failWindows: true}]) {
    assert.throws(jxa({pid: 42, ...failure}).run, /denied/);
    assert.deepEqual(jxa(failure).run(), []);
  }
});

// Run the shared public facade regressions under Node with no native UI access.
new Function('RuntimeAPITest', 'File', 'window', fs.readFileSync('tests/runtime-api/unit/window-target.test.js', 'utf8'))({
  test: (options, fn) => test('shared: ' + options.name, fn),
  assert: (value, message) => assert.ok(value, message), equal: (a, b, message) => assert.equal(a, b, message),
}, {read: file => fs.readFileSync(file, 'utf8'), join: require('node:path').join, cwd: () => process.cwd()},
{list() {}, get() {}, wait() {}, current() {}, activate() {}});

test('scoped JXA never hides a PID or per-window bounds read failure', () => {
  for (const failure of [{failPID: true}, {failPosition: true}, {failSize: true}]) {
    assert.throws(jxa({pid: 42, ...failure}).run, /denied/);
    assert.doesNotThrow(jxa(failure).run);
  }
  for (const failure of [{size: [0, 408]}, {size: [-1, 408]}, {size: [NaN, 408]},
    {position: []}, {position: [Infinity, 20]}]) {
    assert.throws(jxa({pid: 42, ...failure}).run, /bounds/);
    assert.doesNotThrow(jxa(failure).run);
  }
});
