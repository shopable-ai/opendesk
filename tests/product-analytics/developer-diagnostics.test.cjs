'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourceFile = path.resolve(__dirname, '..', '..', 'apps', 'opendesk', 'developer-tools.js');
vm.runInThisContext(fs.readFileSync(sourceFile, 'utf8'), {filename: sourceFile});

function createHarness(debugValue) {
  const patches = [];
  const appRuntime = {
    async updateMenuItem(id, patch) { patches.push([id, patch]); },
    getCapabilities() { return {}; },
  };
  const developerTools = globalThis.OpenDeskDeveloperTools.create({
    appRuntime,
    runtimeLog: {
      state() { return {detailMode: 'normal', runRoot: '/tmp/logs'}; },
      async setDetailMode() {},
      async openDirectory() {},
    },
    runner: {state() { return {}; }},
    schedulerClient: {getCapabilities() { return {}; }},
    inspectorLauncher: {getCapabilities() { return {available: false, url: ''}; }},
    system: {getEnv(name) { return name === 'OPENDESK_ANALYTICS_DEBUG' ? debugValue : ''; }},
    ui: {async createWindow() { throw new Error('window should not be created in gating test'); }},
    logger: {warn() {}},
  });
  return {developerTools, patches};
}

test('analytics diagnostics stays hidden unless explicit developer diagnostics mode is enabled', async () => {
  const normal = createHarness('');
  await normal.developerTools.initialize();
  const normalPatch = normal.patches.find(([id]) => id === 'opendesk.analytics.diagnostics');
  assert.deepEqual(normalPatch, ['opendesk.analytics.diagnostics', {visible: false}]);
  assert.equal(normal.developerTools.state().analyticsDiagnosticsEnabled, false);
  await assert.rejects(
    () => normal.developerTools.activate('opendesk.analytics.diagnostics', 'developer-menu'),
    /diagnostics are disabled/,
  );

  const debug = createHarness('1');
  await debug.developerTools.initialize();
  const debugPatch = debug.patches.find(([id]) => id === 'opendesk.analytics.diagnostics');
  assert.deepEqual(debugPatch, ['opendesk.analytics.diagnostics', {visible: true}]);
  assert.equal(debug.developerTools.state().analyticsDiagnosticsEnabled, true);
});
