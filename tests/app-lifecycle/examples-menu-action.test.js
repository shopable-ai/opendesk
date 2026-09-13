'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'opendesk.app.json'), 'utf8'));
const controllerFile = path.join(repo, 'apps', 'opendesk', 'app-controller.js');
vm.runInThisContext(fs.readFileSync(controllerFile, 'utf8'), {filename: controllerFile});
const ProductAppController = globalThis.OpenDeskProductAppController;

test('official tray exposes Examples as a resource action after the operations group', () => {
  const menu = manifest.tray.menu;
  const index = menu.findIndex(item => item && item.action === 'opendesk.examples');
  assert.ok(index > 0, 'opendesk.examples must be present in the official tray menu');
  assert.equal(menu[index].label, '示例代码…');
  assert.equal(menu[index - 1].type, 'separator', 'Examples must stay separate from execution and operations actions');
});

test('opendesk.examples is delegated to the existing Official Shell action router', async () => {
  const activations = [];
  const controller = ProductAppController.create({
    appRuntime: {onAction() {}},
    runner: {async open() {}},
    schedulerCenter: {async open() {}, async openCreate() {}},
    officialShell: {async activate(id) { activations.push(id); }},
    logger: {error() {}},
  });

  assert.equal(await controller.dispatch({id: 'opendesk.examples', source: 'tray-menu'}), true);
  assert.deepEqual(activations, ['opendesk.examples']);
});
