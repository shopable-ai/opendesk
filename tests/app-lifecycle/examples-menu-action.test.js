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

test('official tray exposes API docs immediately after Examples in the resource group', () => {
  const menu = manifest.tray.menu;
  const examplesIndex = menu.findIndex(item => item && item.action === 'opendesk.examples');
  const apiDocsIndex = menu.findIndex(item => item && item.action === 'opendesk.api-docs');
  assert.ok(examplesIndex > 0, 'opendesk.examples must be present in the official tray menu');
  assert.equal(menu[examplesIndex].labelKey, 'menu.examples');
  assert.equal(menu[examplesIndex].label, '示例代码');
  assert.equal(menu[examplesIndex - 1].type, 'separator', 'Resources must stay separate from execution and operations actions');
  assert.equal(apiDocsIndex, examplesIndex + 1, 'API docs must be immediately after Examples');
  assert.equal(menu[apiDocsIndex].labelKey, 'menu.apiDocs');
  assert.equal(menu[apiDocsIndex].label, 'API 文档');
});

test('resource actions are delegated to the existing Official Shell action router', async () => {
  const activations = [];
  const controller = ProductAppController.create({
    appRuntime: {onAction() {}},
    runner: {async open() {}},
    assistant: {async open() {}},
    schedulerCenter: {async open() {}, async openCreate() {}},
    officialShell: {async activate(id) { activations.push(id); }},
    logger: {error() {}},
  });

  assert.equal(await controller.dispatch({id: 'opendesk.examples', source: 'tray-menu'}), true);
  assert.equal(await controller.dispatch({id: 'opendesk.api-docs', source: 'tray-menu'}), true);
  assert.deepEqual(activations, ['opendesk.examples', 'opendesk.api-docs']);
});
