'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const settingsFile = path.join(__dirname, '..', '..', 'apps', 'opendesk', 'settings.js');

test('Privacy & Data settings exposes only consent controls to ordinary users', async () => {
  delete globalThis.OpenDeskSettings;
  const calls = [];
  const controls = new Map();
  const specs = [];
  const window = {
    control(id) {
      if (!controls.has(id)) controls.set(id, {updates: [], handlers: {}});
      const record = controls.get(id);
      return {
        update(patch) { record.updates.push(patch); return Promise.resolve(); },
        on(event, handler) { record.handlers[event] = handler; },
      };
    },
    on() {},
    show() { calls.push(['show']); return Promise.resolve(); },
    close() { calls.push(['close']); return Promise.resolve(); },
  };
  const ui = {
    async createWindow(spec) {
      specs.push(spec);
      return window;
    },
  };
  globalThis.ui = ui;
  vm.runInThisContext(fs.readFileSync(settingsFile, 'utf8'), {filename: settingsFile});

  let enabled = false;
  const client = {
    status: async () => ({consent: enabled ? 'granted' : 'denied'}),
    setEnabled: async value => {
      enabled = !!value;
      calls.push(['setEnabled', enabled]);
      return {consent: enabled ? 'granted' : 'denied'};
    },
  };

  const settings = globalThis.OpenDeskSettings.create({client, ui});
  await settings.open('tray-menu');

  assert.equal(specs.length, 1);
  assert.equal(specs[0].title, '设置');
  const visible = specs[0].content.html;
  assert.match(visible, /隐私与数据/);
  assert.match(visible, /帮助改进 OpenDesk/);
  assert.match(visible, /查看隐私说明/);

  for (const forbidden of [
    'Product Analytics', 'PostHog', 'Dashboard', 'app_started', 'ui_action',
    'analytics_settings', 'analytics.open', 'droppedEvents', 'lastErrorCode',
  ]) {
    assert.equal(visible.includes(forbidden), false, `ordinary settings leaked internal term: ${forbidden}`);
  }

  const toggle = controls.get('improveToggle').handlers.click;
  assert.equal(typeof toggle, 'function');
  await toggle();
  assert.ok(calls.some(call => call[0] === 'setEnabled' && call[1] === true));
  assert.equal(settings.state().consent, 'granted');
});
