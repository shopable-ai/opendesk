const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('tests/wechat/tools/support-readonly-probe.js', 'utf8');
const exePath = '/Applications/WeChat.app/Contents/MacOS/WeChat';
const win = {pid: 42, handle: 101, exePath, isForeground: true, hasFocus: true, title: 'private title'};
const app = {bundleId: 'com.tencent.xinWeChat', path: '/Applications/WeChat.app', pids: [9, 42],
  instances: [{pid: 9, executablePath: '/Applications/WeChat.app/Contents/Helpers/helper'},
    {pid: 42, executablePath: exePath}]};
function grant(extra = {}) {
  return {mode: 'ax', authorization: {scope: 'entire-test-window', pid: 42, exePath,
    windowId: 101, testSessionLabel: 'synthetic test only', expiresAt: Date.now() + 50000, ...extra}};
}
async function run(config, overrides = {}) {
  const calls = []; let report;
  const forbidden = () => assert.fail('Input/global desktop access is forbidden');
  const context = {
    System: {getEnv: () => config === undefined ? undefined : 'local-config.json'},
    File: {readJSON: async () => config, writeJSON: async (path, value) => {
      assert.match(path, /^\.runtime\/tests\/ai-customer-support\/r24\/probe-\d+\.json$/);
      report = JSON.parse(JSON.stringify(value));
    }},
    App: {get: target => {assert.equal(target.bundleId, 'com.tencent.xinWeChat'); return app;}},
    Accessibility: {getCapabilities: () => ({permission: {granted: true}}),
      snapshot: async options => {calls.push(options);return {complete: true, truncated: false,
        root: {role: 'window', name: 'sensitive-name', value: 'sensitive-body', identifier: 'sensitive-id'}};},
      perform: forbidden},
    window: {getAppWindow: async target => {
      assert.equal(target.pid, 42);assert.equal(target.exePath, exePath);return win;
    }, list: forbidden, getActiveWindow: forbidden},
    console: {log: text => assert.doesNotMatch(text, /sensitive-|private title/)},
    UI: {tapText: forbidden}, keyboard: {type: forbidden}, mouse: {click: forbidden},
  };
  for (const [key, value] of Object.entries(overrides)) Object.assign(context[key], value);
  await vm.runInNewContext('(async () => {\n' + source + '\n})()', context);
  return {report, calls};
}
test('default probes metadata only, excludes helpers and redacts window title', async () => {
  const {report, calls} = await run();
  assert.equal(report.outcome, 'METADATA_ONLY');assert.equal(report.target.pid, 42);
  assert.equal(calls.length, 0);assert.equal(report.contentReadAttempted, false);
  assert.equal(report.fields.sessionIdentity.status, 'UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(report), /private title/);
});
test('no running app or foreground window does not read chat', async () => {
  for (const overrides of [{App: {get: () => null}}, {window: {getAppWindow: async () => null}}]) {
    const {report, calls} = await run(grant(), overrides);
    assert.equal(calls.length, 0);assert.equal(report.bindingAccepted, false);
  }
});
test('multiple main instances cannot silently select a process', async () => {
  const {report, calls} = await run(grant(), {App: {get: () => ({...app, pids: [42, 43],
    instances: [{pid: 42, executablePath: exePath}, {pid: 43, executablePath: exePath}]})}});
  assert.equal(report.error.code, 'AMBIGUOUS_PROCESS');assert.equal(calls.length, 0);
});
test('absent, expired, overly long, wrong PID, executable or window grants refuse before AX', async () => {
  for (const config of [{mode: 'ax'}, grant({expiresAt: Date.now() - 1}),
    grant({expiresAt: Date.now() + 120000}), grant({pid: 43}), grant({exePath: '/other'}),
    grant({windowId: 102}), grant({scope: 'all-chats'})]) {
    const {report, calls} = await run(config);
    assert.equal(report.error.code, 'TEST_WINDOW_AUTHORIZATION_REQUIRED');assert.equal(calls.length, 0);
  }
});
test('complete AX is diagnostic only; sensitive fields are redacted by default', async () => {
  const {report, calls} = await run(grant());
  assert.equal(calls.length, 1);assert.equal(calls[0].within.handle, 101);
  assert.equal(report.providerReady, false);assert.equal(report.bindingAccepted, false);
  assert.equal(report.fields.messageIdentity.status, 'UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(report), /sensitive-/);
});
test('numeric and boolean AX values are redacted, including zero and false', async () => {
  for (const value of [0, 123456789, false]) {
    const {report} = await run(grant(), {Accessibility: {snapshot: async () =>
      ({complete: true, truncated: false, root: {role: 'staticText', value}})}});
    assert.match(report.snapshot.root.value, /^redacted-\d+$/);
    assert.equal(report.contentRetained, false);
  }
});
test('near-expiry grants cannot start a read beyond their remaining budget', async () => {
  const {report, calls} = await run(grant({expiresAt: Date.now() + 1000}));
  assert.equal(report.error.code, 'TEST_WINDOW_AUTHORIZATION_EXPIRING');
  assert.equal(calls.length, 0);assert.equal(report.contentReadAttempted, false);
});
test('authorized raw test content requires explicit local retention flag', async () => {
  const {report} = await run({...grant(), retainAuthorizedTestContent: true});
  assert.equal(report.contentRetained, true);assert.equal(report.snapshot.root.value, 'sensitive-body');
});
test('window replacement and focus loss discard late AX content', async () => {
  for (const changed of [{...win, handle: 102}, {...win, isForeground: false}]) {
    let count = 0;
    const {report} = await run({...grant(), retainAuthorizedTestContent: true},
      {window: {getAppWindow: async () => ++count === 1 ? win : changed}});
    assert.equal(report.error.code, 'OBSERVATION_INVALIDATED');assert.equal(report.snapshot, undefined);
    assert.equal(report.contentRetained, false);
  }
});
test('partial trees and AX timeouts do not retain content or become empty success', async () => {
  for (const snapshot of [async () => ({complete: false, truncated: true, root: {value: 'sensitive-body'}}),
    async () => {throw Object.assign(new Error('sensitive-body'), {code: 'TIMEOUT', operation: 'Accessibility.snapshot'});}]) {
    const {report} = await run(grant(), {Accessibility: {snapshot}});
    assert.equal(report.outcome, 'ERROR');assert.equal(report.snapshot, undefined);
    assert.doesNotMatch(JSON.stringify(report), /sensitive-body/);
  }
});
