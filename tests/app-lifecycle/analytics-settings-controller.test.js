'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourceFile = path.resolve(__dirname, '..', '..', 'apps', 'opendesk', 'app-controller.js');
vm.runInThisContext(fs.readFileSync(sourceFile, 'utf8'), {filename: sourceFile});

test('analytics.open routes to the first-party Analytics Settings surface', async () => {
  const calls = [];
  const controller = globalThis.OpenDeskProductAppController.create({
    appRuntime: {onAction() {}},
    runner: {async open() {}},
    assistant: {async open() {}},
    schedulerCenter: {async open() {}, async openCreate() {}},
    runtimeLog: {async open() {}},
    permissionsCenter: {async open() {}},
    analyticsSettings: {async open(source) { calls.push(source); }},
    about: {async open() {}},
  });
  assert.equal(await controller.dispatch({id: 'analytics.open', source: 'tray-menu'}), true);
  assert.deepEqual(calls, ['tray-menu']);
});
