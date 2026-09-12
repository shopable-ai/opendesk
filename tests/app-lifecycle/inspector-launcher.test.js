'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceFile = path.resolve(__dirname, '..', '..', 'apps', 'opendesk', 'inspector-launcher.js');
vm.runInThisContext(fs.readFileSync(sourceFile, 'utf8'), {filename: sourceFile});
const InspectorLauncher = globalThis.OpenDeskInspectorLauncher;

function harness(url, os = 'darwin') {
  const commands = [];
  const notifications = [];
  const errors = [];
  const launcher = InspectorLauncher.create({
    system: {
      getEnv(name) { return name === 'OPENDESK_APP_INSPECTOR_URL' ? url : ''; },
      getPlatformInfo() { return {os}; },
    },
    command: {
      async run(command, args, options) {
        commands.push({command, args, options});
        return {code: 0};
      },
    },
    execution: {workdir: '/tmp/opendesk-app'},
    ui: {async toast(input) { notifications.push(input); }},
    logger: {error(message) { errors.push(String(message)); }},
  });
  return {launcher, commands, notifications, errors};
}

test('opens only the runtime-published loopback Inspector URL', async () => {
  const f = harness('http://127.0.0.1:53127/accessibility-workbench/');
  assert.deepEqual(f.launcher.getCapabilities(), {
    enabled: true,
    available: true,
    transport: 'app-loopback-browser',
    url: 'http://127.0.0.1:53127/accessibility-workbench/',
  });
  const result = await f.launcher.open('tray-menu');
  assert.equal(result.status, 'opened');
  assert.deepEqual(f.commands, [{
    command: '/usr/bin/open',
    args: ['http://127.0.0.1:53127/accessibility-workbench/'],
    options: {cwd: '/tmp/opendesk-app', timeout: 10000, maxOutputBytes: 256 * 1024},
  }]);
  assert.deepEqual(f.notifications, []);
});

test('rejects missing or non-loopback Inspector URLs without starting another server', async () => {
  for (const url of ['', 'http://localhost:53127/accessibility-workbench/', 'https://example.com/accessibility-workbench/']) {
    const f = harness(url);
    const result = await f.launcher.open('tray-menu');
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(f.commands, []);
    assert.equal(f.notifications.length, 1);
    assert.match(String(f.notifications[0].message), /Inspector/);
    assert.equal(f.notifications[0].timeoutMs, 5000);
  }
});
