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
    identity: {processId:42, launchKind:'app-bundle'},
    permissions: [
      {id:'accessibility',displayName:'Accessibility',requirement:'required',status:'granted',canRequest:true,canOpenSettings:true},
      {id:'screen-capture',displayName:'Screen Recording',requirement:'required',status:'unknown',canRequest:true,canOpenSettings:true},
      {id:'input-monitoring',displayName:'Input Monitoring',requirement:'optional',status:'denied',canRequest:true,canOpenSettings:true},
      {id:'automation',displayName:'Automation',requirement:'on-demand',status:'unknown',canRequest:false,canOpenSettings:true},
    ],
  };
}

function fixture(initialReport = report(), options = {}) {
  const calls = {status:0, request:[], settings:[], menu:[], create:0, info:[]};
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
  const logger = {info(...args) { calls.info.push(args); }, warn(){}, error(){}};
  const center = PermissionsCenter.create({ui, app, logger});
  return {center, calls, windows, setReport(value) { currentReport = value; }};
}

test('system permissions menu label is fixed and preflight is silent', async () => {
  const f = fixture(report('BLOCKED'));
  const state = await f.center.preflight('startup');
  assert.equal(state.open, false);
  assert.equal(f.calls.create, 0);
  assert.equal(f.calls.status, 1);
  assert.deepEqual(f.calls.request, []);
  assert.deepEqual(f.calls.settings, []);
  assert.deepEqual(f.calls.menu, []);
  assert.equal(PermissionsCenter.menuLabel('READY'), '系统权限…');
  assert.equal(PermissionsCenter.menuLabel('LIMITED'), '系统权限…');
  assert.equal(PermissionsCenter.menuLabel('BLOCKED'), '系统权限…');
});

test('preflight and refresh log only current owner identity, checkedAt and native permission statuses', async () => {
  const owner = {...report('LIMITED'), checkedAt:'2026-10-29T08:00:00Z',
    target:'private target must not be logged', input:'private input must not be logged'};
  owner.permissions[1] = {...owner.permissions[1], target:'private permission target', input:'private permission input'};
  const original = structuredClone(owner);
  const f = fixture(owner);
  await f.center.preflight('startup');
  const updated = {...report('BLOCKED'), checkedAt:'2026-10-29T08:01:00Z',
    identity:{processId:84, launchKind:'app-bundle'}};
  updated.permissions[0].status = 'unknown';
  updated.permissions[1].status = 'denied';
  f.setReport(updated);
  await f.center.refresh('diagnostics');

  assert.equal(f.calls.info.length, 2);
  for (const [index, value] of [owner, updated].entries()) {
    const args = f.calls.info[index];
    assert.equal(args.length, 1);
    assert.match(args[0], /^OPENDESK_SYSTEM_PERMISSIONS=/);
    const diagnostic = JSON.parse(args[0].slice('OPENDESK_SYSTEM_PERMISSIONS='.length));
    assert.deepEqual(diagnostic, {
      identity:value.identity, checkedAt:value.checkedAt,
      permissions:value.permissions.map(({id, status}) => ({id, status})),
    });
    assert.doesNotMatch(args[0], /private|"target"|"input"/);
  }
  assert.deepEqual(owner, original);
  assert.equal(f.calls.status, 2);
  assert.equal(f.calls.create, 0);
  assert.deepEqual(f.calls.request, []);
  assert.deepEqual(f.calls.settings, []);
  assert.deepEqual(f.calls.menu, []);
});

test('unknown remains unknown and signing mismatch guidance stays a possible diagnosis without automatic actions', async () => {
  const owner = {...report('LIMITED'), checkedAt:'2026-10-29T08:02:00Z'};
  const original = structuredClone(owner);
  const f = fixture(owner);
  await f.center.open('unknown-status');
  const win = f.windows[0];
  await win.trigger('refresh');

  for (const id of ['screen-capture']) {
    assert.equal(win.updates.get(`status-${id}`).text, '? 需要确认');
    const description = win.updates.get(`description-${id}`).text;
    assert.match(description, /系统接口无法可靠确认状态/);
    assert.match(description, /若系统设置已允许/);
    assert.match(description, /签名身份变化也可能导致旧授权失配/);
    assert.match(description, /反复请求无法修复/);
    assert.match(description, /确认正在运行的版本并重启/);
    assert.doesNotMatch(description, /当前未授权|已经失配|确定.*失配/);
  }
  assert.equal(win.updates.get('status-automation').text, '? 需要确认');
  const automationDescription = win.updates.get('description-automation').text;
  assert.match(automationDescription, /请在需要控制目标应用时检查对应授权/);
  assert.doesNotMatch(automationDescription, /签名|重启|重新授权/);
  assert.equal(PermissionsCenter.statusLabel('unknown'), '? 需要确认');
  assert.equal(f.calls.info.length, 2);
  for (const [line] of f.calls.info) {
    const diagnostic = JSON.parse(line.slice('OPENDESK_SYSTEM_PERMISSIONS='.length));
    for (const id of ['screen-capture', 'automation']) {
      assert.equal(diagnostic.permissions.find(item => item.id === id).status, 'unknown');
    }
  }
  assert.deepEqual(owner, original);
  assert.deepEqual(f.calls.request, []);
  assert.deepEqual(f.calls.settings, []);
});

test('system permissions window is scoped to system authorization and has no aggregate readiness', () => {
  const html = PermissionsCenter.buildHTML(report('LIMITED'));
  assert.match(html, /系统权限/);
  assert.match(html, />重新检查</);
  assert.match(html, /这里只检查系统授权。具体能否开始录制，请以录制器的检查结果为准。/);
  assert.doesNotMatch(html, /整体状态/);
  assert.doesNotMatch(html, /权限管理（部分功能受限）/);
  assert.match(html, /status-automation/);
});

test('Permissions Center derives supported rows from the Runtime report', () => {
  const html = PermissionsCenter.buildHTML({permissions:[{id:'future-permission',displayName:'Future Permission'}]});
  assert.match(html, /Future Permission/);
  assert.match(html, /status-future-permission/);
  assert.doesNotMatch(html, /status-accessibility/);
});

test('Permissions Center single-flights concurrent opens, reuses, and recreates after close', async () => {
  const f = fixture(report('READY'), {createDelay:5});
  await Promise.all(Array.from({length:100}, (_, index) => f.center.open(`open-${index}`)));
  assert.equal(f.calls.create, 1);
  assert.equal(f.windows[0].showCount, 1);
  assert.equal(f.windows[0].options.title, '系统权限');
  assert.equal(f.calls.request.length, 0);

  for (let i = 0; i < 20; i++) await f.center.open(`focus-${i}`);
  assert.equal(f.calls.create, 1);
  assert.equal(f.windows[0].showCount, 21);
  assert.equal(f.calls.request.length, 0);

  f.windows[0].close();
  await f.center.open('recreate');
  assert.equal(f.calls.create, 2);
  assert.equal(f.windows[1].showCount, 1);
});

test('open, focus and manual recheck only read state and never request authorization', async () => {
  const f = fixture(report('LIMITED'));
  await f.center.open('test');
  const win = f.windows[0];
  assert.deepEqual(f.calls.request, []);
  assert.deepEqual(f.calls.settings, []);
  assert.deepEqual(f.calls.menu, []);

  await f.center.open('focus');
  await win.trigger('refresh');
  assert.deepEqual(f.calls.request, []);
  assert.deepEqual(f.calls.settings, []);
  assert.deepEqual(f.calls.menu, []);
});

test('granted/no-extra-system-authorization rows hide meaningless actions', async () => {
  const windowsReport = report('READY');
  windowsReport.platform = 'win32';
  windowsReport.permissions[0] = {...windowsReport.permissions[0], status:'not_required'};
  const f = fixture(windowsReport);
  await f.center.open('layout');
  const win = f.windows[0];
  assert.equal(win.updates.get('status-accessibility').text, '✓ 无需额外系统授权');
  assert.equal(win.updates.get('request-accessibility').visible, false);
  assert.equal(win.updates.get('settings-accessibility').visible, false);
  assert.equal(win.updates.get('request-screen-capture').visible, true);
  assert.equal(win.updates.get('settings-screen-capture').visible, true);
});

test('only an explicit request action invokes requestPermission and retry is deduplicated per window lifecycle', async () => {
  const f = fixture(report('LIMITED'));
  await f.center.open('first');
  const win = f.windows[0];
  assert.equal(f.calls.request.length, 0);

  await win.trigger('request-screen-capture');
  assert.deepEqual(f.calls.request, [['screen-capture', {force:false}]]);
  assert.equal(win.updates.get('request-screen-capture').text, '重新尝试');

  await win.trigger('request-screen-capture');
  assert.deepEqual(f.calls.request, [
    ['screen-capture', {force:false}],
    ['screen-capture', {force:true}],
  ]);

  f.windows[0].close();
  await f.center.open('second');
  assert.equal(f.windows[1].updates.get('request-screen-capture').text, '请求授权');
});

test('settings fallback gives manual navigation guidance', async () => {
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
});

test('product App Mode keeps existing permission route and fixed tray entry', () => {
  const main = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'main.js'), 'utf8');
  const appController = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'app-controller.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'opendesk.app.json'), 'utf8'));
  const release = fs.readFileSync(path.join(repo, 'apps', 'opendesk', '.release', 'app-mode-runtime-files.txt'), 'utf8');
  assert.match(main, /OpenDeskPermissionsCenter\.create\(\)/);
  assert.match(main, /permissionsCenter,/);
  assert.match(appController, /case 'permissions\.open':/);
  assert.match(main, /permissionsCenter\.preflight\('startup'\)/);
  const menu = manifest.tray.menu.find(item => item.id === 'open-permissions');
  assert.deepEqual(menu, {
    id: 'open-permissions',
    labelKey: 'menu.permissions',
    label: '系统权限',
    action: 'permissions.open',
  });
  assert.match(release, /^permissions-center\.js$/m);
  assert.match(release, /^runtime-log\.js$/m);
});
