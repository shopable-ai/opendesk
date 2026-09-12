'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..');
const centerFile = path.join(repo, 'apps', 'opendesk', 'permissions-center.js');
vm.runInThisContext(fs.readFileSync(centerFile, 'utf8'), {filename: centerFile});
const PermissionsCenter = globalThis.OpenDeskPermissionsCenter;

function report(overall = 'READY') {
  return {
    platform: 'darwin',
    feature: 'desktop-automation',
    overall,
    identity: {
      processId: 42,
      executable: '/Applications/OpenDesk.app/Contents/MacOS/opendesk',
      bundlePath: '/Applications/OpenDesk.app',
      launchKind: 'app-bundle',
    },
    permissions: [
      {id:'accessibility',displayName:'Accessibility',description:'UI automation',requirement:'required',status:'granted',canRequest:true,canOpenSettings:true},
      {id:'screen-capture',displayName:'Screen Recording',description:'screenshots',requirement:'required',status:'unknown',canRequest:true,canOpenSettings:true,remediation:'Open settings'},
      {id:'input-monitoring',displayName:'Input Monitoring',description:'recorder',requirement:'optional',status:'denied',canRequest:true,canOpenSettings:true},
      {id:'automation',displayName:'Automation',description:'Apple Events',requirement:'on-demand',status:'unknown',canRequest:false,canOpenSettings:true},
    ],
  };
}

function fixture(initialReport = report(), options = {}) {
  const calls = {status:0, request:[], settings:[], menu:[], create:0};
  const windows = [];
  let currentReport = initialReport;
  const app = {
    getPermissions(feature) {
      calls.status++;
      assert.equal(feature, 'desktop-automation');
      return currentReport;
    },
    async requestPermission(id, requestOptions) { calls.request.push([id, requestOptions]); },
    async openPermissionSettings(id) {
      calls.settings.push(id);
      if (typeof options.openSettingsResult === 'function') return options.openSettingsResult(id);
      return {opened:true,id,fallback:false};
    },
    async updateMenuItem(id, patch) { calls.menu.push([id, patch]); },
  };
  const ui = {
    async createWindow(windowOptions) {
      calls.create++;
      if (options.createDelay) await new Promise(resolve => setTimeout(resolve, options.createDelay));
      const handlers = new Map();
      const updates = new Map();
      const lifecycle = new Map();
      const win = {
        options: windowOptions,
        showCount: 0,
        control(id) {
          return {
            on(event, callback) { handlers.set(`${id}:${event}`, callback); },
            async update(patch) { updates.set(id, {...(updates.get(id) || {}), ...patch}); },
          };
        },
        on(event, callback) { lifecycle.set(event, callback); },
        async show() { win.showCount++; },
        close() {
          const callback = lifecycle.get('close');
          if (callback) callback();
        },
        async trigger(id, event = 'click') {
          const callback = handlers.get(`${id}:${event}`);
          assert.ok(callback, `missing handler ${id}:${event}`);
          return callback();
        },
        updates,
      };
      windows.push(win);
      return win;
    },
  };
  const logger = {warn(){}, error(){}};
  const center = PermissionsCenter.create({ui, app, logger});
  return {center, calls, windows, setReport(value) { currentReport = value; }};
}

test('startup preflight is silent and only updates tray status', async () => {
  const f = fixture(report('UNKNOWN'));
  const state = await f.center.preflight('startup');
  assert.equal(state.open, false);
  assert.equal(f.calls.create, 0);
  assert.equal(f.calls.status, 1);
  assert.deepEqual(f.calls.request, []);
  assert.deepEqual(f.calls.settings, []);
  assert.deepEqual(f.calls.menu.at(-1), ['open-permissions', {label:'权限管理（需要处理）…'}]);
});

test('Permissions Center derives supported rows from the Runtime report', () => {
  const html = PermissionsCenter.buildHTML({
    permissions: [{id:'future-permission',displayName:'Future Permission'}],
  });
  assert.match(html, /Future Permission/);
  assert.match(html, /status-future-permission/);
  assert.doesNotMatch(html, /status-accessibility/);
});

test('Permissions Center single-flights 100 concurrent opens, reuses, and recreates after close', async () => {
  const f = fixture(report('READY'), {createDelay:5});
  await Promise.all(Array.from({length:100}, (_, index) => f.center.open(`open-${index}`)));
  assert.equal(f.calls.create, 1);
  assert.equal(f.windows[0].showCount, 1);
  assert.equal(f.calls.request.length, 0);

  for (let i = 0; i < 100; i++) await f.center.open(`focus-${i}`);
  assert.equal(f.calls.create, 1);
  assert.equal(f.windows[0].showCount, 101);
  assert.equal(f.calls.request.length, 0);

  f.windows[0].close();
  await f.center.open('recreate');
  assert.equal(f.calls.create, 2);
  assert.equal(f.windows[1].showCount, 1);
  assert.equal(f.calls.request.length, 0);
});

test('Permission Center retry state is scoped to one window lifecycle', async () => {
  const f = fixture(report('LIMITED'));
  await f.center.open('first');
  await f.windows[0].trigger('request-screen-capture');
  assert.deepEqual(f.calls.request, [['screen-capture', {force:false}]]);
  assert.equal(f.windows[0].updates.get('request-screen-capture').text, '重新尝试');

  f.windows[0].close();
  await f.center.open('second');
  assert.equal(f.windows[1].updates.get('request-screen-capture').text, '请求授权');
  await f.windows[1].trigger('request-screen-capture');
  assert.deepEqual(f.calls.request, [
    ['screen-capture', {force:false}],
    ['screen-capture', {force:false}],
  ]);
});

test('refresh stays pure and explicit repeated request becomes force retry', async () => {
  const f = fixture(report('LIMITED'));
  await f.center.open('test');
  const win = f.windows[0];
  assert.equal(win.updates.get('overall').text, '部分功能受限');
  assert.equal(win.updates.get('identity').text, 'OpenDesk 应用');
  assert.equal(win.updates.get('status-accessibility').text, '✓ 已授权');
  assert.equal(win.updates.get('status-screen-capture').text, '? 需要确认');
  assert.equal(win.updates.get('request-accessibility').disabled, true);
  assert.equal(win.updates.get('request-automation').disabled, true);
  assert.match(win.updates.get('description-screen-capture').text, /当前系统接口无法可靠区分/);
  assert.doesNotMatch(win.updates.get('description-screen-capture').text, /Open settings|CGPreflight|TCC/i);
  assert.equal(f.calls.request.length, 0);
  assert.equal(f.calls.settings.length, 0);

  await win.trigger('refresh');
  assert.equal(f.calls.request.length, 0);
  assert.equal(f.calls.settings.length, 0);

  await win.trigger('request-screen-capture');
  assert.deepEqual(f.calls.request, [['screen-capture', {force:false}]]);
  assert.equal(win.updates.get('request-screen-capture').text, '重新尝试');

  await win.trigger('request-screen-capture');
  assert.deepEqual(f.calls.request, [
    ['screen-capture', {force:false}],
    ['screen-capture', {force:true}],
  ]);
});

test('settings fallback gives manual navigation guidance instead of failing silently', async () => {
  const f = fixture(report('LIMITED'), {
    openSettingsResult(id) {
      return {opened:true,id,fallback:true,guidance:'System Settings > Privacy & Security > Screen Recording'};
    },
  });
  await f.center.open('test');
  const win = f.windows[0];
  await win.trigger('settings-screen-capture');
  assert.deepEqual(f.calls.settings, ['screen-capture']);
  assert.match(win.updates.get('notice').text, /请手动前往/);
  assert.match(win.updates.get('notice').text, /Privacy & Security/);
});

test('product App Mode wires permission action, preflight and release payload', () => {
  const main = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'main.js'), 'utf8');
  const appController = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'app-controller.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'opendesk.app.json'), 'utf8'));
  const release = fs.readFileSync(path.join(repo, 'apps', 'opendesk', '.release', 'app-mode-runtime-files.txt'), 'utf8');
  assert.match(main, /OpenDeskPermissionsCenter\.create\(\)/);
  assert.match(main, /permissionsCenter,/);
  assert.match(appController, /case 'permissions\.open':/);
  assert.match(main, /permissionsCenter\.preflight\('startup'\)/);
  const menu = manifest.tray.menu.find(item => item.id === 'open-permissions');
  assert.deepEqual(menu, {id:'open-permissions',label:'权限管理…',action:'permissions.open'});
  assert.match(release, /^permissions-center\.js$/m);
  assert.match(release, /^runtime-log\.js$/m);
});