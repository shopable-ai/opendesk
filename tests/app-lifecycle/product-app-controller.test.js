'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceFile = path.resolve(__dirname, '..', '..', 'apps', 'opendesk', 'app-controller.js');
vm.runInThisContext(fs.readFileSync(sourceFile, 'utf8'), {filename: sourceFile});
const ProductAppController = globalThis.OpenDeskProductAppController;

function harness(options = {}) {
  let listener = null;
  let subscriptions = 0;
  let unsubscriptions = 0;
  const runnerCalls = [];
  const schedulerOpenCalls = [];
  const schedulerNewCalls = [];
  const permissionCalls = [];
  const errors = [];
  const appRuntime = {
    onAction(callback) {
      subscriptions++;
      listener = callback;
      return () => { unsubscriptions++; listener = null; };
    },
  };
  const runner = {
    async open(source) {
      runnerCalls.push(source);
      if (options.rejectRunnerSource === source) throw new Error('runner action rejected');
    },
  };
  const schedulerCenter = {
    async open(source) { schedulerOpenCalls.push(source); },
    async openCreate(source) { schedulerNewCalls.push(source); },
  };
  const permissionsCenter = {
    async open(source) { permissionCalls.push(source); },
  };
  const controller = ProductAppController.create({
    appRuntime,
    runner,
    schedulerCenter,
    permissionsCenter,
    logger: {error(message) { errors.push(String(message)); }},
  });
  return {
    controller,
    dispatch(event) {
      assert.equal(typeof listener, 'function', 'App action listener must remain registered');
      listener(event);
    },
    runnerCalls,
    schedulerOpenCalls,
    schedulerNewCalls,
    permissionCalls,
    errors,
    get subscriptions() { return subscriptions; },
    get unsubscriptions() { return unsubscriptions; },
  };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('routes Scheduler Center and Permissions Center actions through one durable controller', async () => {
  const f = harness();
  f.controller.start();
  f.dispatch({id: 'scheduler.open', source: 'tray-menu'});
  f.dispatch({id: 'scheduler.new', source: 'tray-menu'});
  f.dispatch({id: 'permissions.open', source: 'tray-menu'});
  await settle();
  assert.deepEqual(f.schedulerOpenCalls, ['tray-menu']);
  assert.deepEqual(f.schedulerNewCalls, ['tray-menu']);
  assert.deepEqual(f.permissionCalls, ['tray-menu']);
  assert.equal(f.subscriptions, 1);
  assert.equal(f.unsubscriptions, 0);
});

test('Runner hide or close does not unsubscribe the product action dispatcher', async () => {
  const f = harness();
  f.controller.start();
  f.controller.start();

  const runnerWindow = {hidden: false, closed: false};
  runnerWindow.hidden = true;
  f.dispatch({id: 'scheduler.open', source: 'runner-hidden'});
  runnerWindow.closed = true;
  f.dispatch({id: 'scheduler.open', source: 'runner-closed'});
  await settle();

  assert.deepEqual(f.schedulerOpenCalls, ['runner-hidden', 'runner-closed']);
  assert.equal(f.subscriptions, 1, 'start is idempotent');
  assert.equal(f.unsubscriptions, 0, 'only unified Runtime teardown owns listener cleanup');
});

test('one rejected action is logged and the next action still runs', async () => {
  const f = harness({rejectRunnerSource: 'reject-me'});
  f.controller.start();
  f.dispatch({id: 'runner.open', source: 'reject-me'});
  await settle();
  f.dispatch({id: 'scheduler.open', source: 'after-rejection'});
  await settle();

  assert.deepEqual(f.runnerCalls, ['reject-me']);
  assert.deepEqual(f.schedulerOpenCalls, ['after-rejection']);
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0], /\[APP_ACTION\] action=runner\.open stage=dispatch/);
  assert.match(f.errors[0], /runner action rejected/);
  assert.deepEqual(f.controller.state(), {started: true, handledActions: 1, failedActions: 1});
});
