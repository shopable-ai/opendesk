'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const settingsFile = path.join(__dirname, '..', '..', 'apps', 'opendesk', 'product-analytics', 'settings.js');

test('Analytics Settings exposes one simple persistent consent control and records view after show', async () => {
  delete globalThis.OpenDeskAnalyticsSettings;
  const calls = [];
  const controls = new Map();
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
  globalThis.ui = {createWindow: async () => window};
  vm.runInThisContext(fs.readFileSync(settingsFile, 'utf8'), {filename: settingsFile});

  let enabled = false;
  const client = {
    status: async () => ({available: true, configured: true, consent: enabled ? 'granted' : 'denied', captureEnabled: enabled}),
    setEnabled: async value => {
      enabled = !!value;
      calls.push(['setEnabled', enabled]);
      return {available: true, configured: true, consent: enabled ? 'granted' : 'denied', captureEnabled: enabled};
    },
    screenViewed: async surface => { calls.push(['screen', surface]); return {accepted: true}; },
    uiAction: async (surface, action, method) => { calls.push(['action', surface, action, method]); return {accepted: true}; },
  };
  const settings = globalThis.OpenDeskAnalyticsSettings.create({client, ui: globalThis.ui});
  await settings.open('tray-menu');
  assert.deepEqual(calls.slice(0, 3), [
    ['show'],
    ['action', 'analytics_settings', 'analytics.open', 'menu'],
    ['screen', 'analytics_settings'],
  ]);
  const handler = controls.get('toggle').handlers.click;
  assert.equal(typeof handler, 'function');
  await handler();
  assert.ok(calls.some(call => call[0] === 'setEnabled' && call[1] === true));
  assert.equal(settings.state().consent, 'granted');
});
