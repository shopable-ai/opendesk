'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourceFile = path.resolve(__dirname, '..', '..', 'apps', 'opendesk', 'app-controller.js');
vm.runInThisContext(fs.readFileSync(sourceFile, 'utf8'), {filename: sourceFile});

test('settings.open routes to the first-party Privacy & Data settings surface', async () => {
  const calls = [];
  const developerCalls = [];
  const controller = globalThis.OpenDeskProductAppController.create({
    appRuntime: {onAction() {}},
    runner: {async open() {}},
    assistant: {async open() {}},
    schedulerCenter: {async open() {}, async openCreate() {}},
    runtimeLog: {async open() {}},
    permissionsCenter: {async open() {}},
    settingsCenter: {async open(source) { calls.push(source); }},
    developerTools: {async activate(id) { developerCalls.push(id); }},
    about: {async open() {}},
  });

  assert.equal(await controller.dispatch({id: 'settings.open', source: 'tray-menu'}), true);
  assert.deepEqual(calls, ['tray-menu']);

  assert.equal(await controller.dispatch({id: 'analytics.open', source: 'tray-menu'}), false);
  assert.deepEqual(calls, ['tray-menu'], 'legacy analytics.open must not open a user surface');

  assert.equal(await controller.dispatch({id: 'opendesk.analytics.diagnostics', source: 'developer-menu'}), true);
  assert.deepEqual(developerCalls, ['opendesk.analytics.diagnostics']);
});
