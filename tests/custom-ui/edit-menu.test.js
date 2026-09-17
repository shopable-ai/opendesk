'use strict';

// Source-contract and fixture-harness checks only. AppKit, clipboard and IME
// behavior must additionally pass the native matrix in text-editing.md.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const native = read('pkg/customui/machost/edit_menu_darwin.m');
const host = read('pkg/customui/machost/host_darwin.go');
const header = read('pkg/customui/machost/edit_menu_darwin.h');
const fixture = read('tests/runtime-api/ui-editing-shortcuts.js');

for (const [action, key, shifted] of [
  ['cut', 'x', false], ['copy', 'c', false], ['paste', 'v', false],
  ['selectAll', 'a', false], ['undo', 'z', false], ['redo', 'z', true],
]) {
  test(`native menu declares ${action} with the standard Command key equivalent`, () => {
    const lines = native.split('\n').filter(line => line.includes('CDAddEditCommand(editMenu,') && line.includes(`@selector(${action}:)`));
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes(`@"${key}", NSEventModifierFlagCommand`));
    assert.equal(lines[0].includes('NSEventModifierFlagShift'), shifted);
    assert.doesNotMatch(lines[0], /NSEventModifierFlagControl|NSEventModifierFlagOption/);
  });
}

test('host installs editing on the checked main thread before accepting commands', () => {
  assert.match(host, /#include "edit_menu_darwin\.h"/);
  assert.match(header, /void OpenDeskUIInstallEditMenu\(void\);/);
  const install = host.indexOf('C.OpenDeskUIInstallEditMenu()');
  assert.ok(install > host.indexOf('C.OpenDeskUIIsMainThread() != 1'));
  assert.ok(install < host.indexOf('go func()'));
  assert.ok(install < host.indexOf('C.OpenDeskUIRun()'));
  assert.match(native, /NSCAssert\(NSThread\.isMainThread/);
});

test('native commands preserve focus routing, validation and native editing ownership', () => {
  assert.match(native, /item\.target = nil;/);
  assert.match(native, /item\.keyEquivalentModifierMask = modifiers;/);
  assert.match(native, /editMenu\.autoenablesItems = YES;/);
  assert.doesNotMatch(native, /NSPasteboard|evaluateJavaScript|CGEvent|addGlobalMonitor|addLocalMonitor|method_exchangeImplementations/);
  assert.doesNotMatch(native, /makeFirstResponder:|activateIgnoringOtherApps:|@selector\(terminate:\)/);
});

test('installation preserves existing menus and does not duplicate edit actions', () => {
  assert.match(native, /NSMenu \*mainMenu = application\.mainMenu;/);
  assert.match(native, /if \(!mainMenu\)/);
  assert.match(native, /mainMenu\.numberOfItems == 0/);
  assert.match(native, /item\.tag == CDEditMenuTag/);
  assert.match(native, /if \(CDMenuHasAction\(menu, action\)\) return;/);
  assert.doesNotMatch(native, /removeAllItems|dispatch_once/);
});

async function launchFixture(available = true) {
  const listeners = new Map();
  const patches = [];
  const logs = [];
  const states = {
    composer: {value: '原始草稿'}, titleInput: {value: '原始标题'},
    sample: {text: 'COPY 中文 😀\nsecond line'}, status: {text: ''},
  };
  let spec;
  let shown = false;
  let finish;
  const closed = new Promise(resolve => { finish = resolve; });
  const panel = {
    control(id) {
      return {
        on(type, callback) {
          const key = id + ':' + type;
          listeners.set(key, callback);
          return () => listeners.delete(key);
        },
        async getState() { return {...states[id]}; },
        async update(patch) { patches.push({id, patch}); return Object.assign(states[id], patch); },
      };
    },
    async show() { shown = true; },
    async close() { finish({status: 'closed'}); },
    waitUntilClosed() { return closed; },
  };
  const completion = vm.runInNewContext(fixture, {
    ui: {
      getCapabilities() { return {enabled: true, available, platform: 'darwin'}; },
      async createWindow(value) { spec = value; return panel; },
    },
    console: {log: value => logs.push(value), error: value => logs.push(value)},
  });
  // Attach a rejection handler before yielding, including unavailable-host tests.
  completion.catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  return {spec, shown, states, patches, logs, listeners, completion, close: () => panel.close()};
}

test('fixture uses a normal native window and leaves editing/IME keys untouched', async () => {
  const run = await launchFixture();
  try {
    assert.equal(run.shown, true);
    assert.equal(run.spec.kind, 'normal');
    assert.equal(run.spec.keyEvents, undefined);
    assert.doesNotMatch(run.spec.content.html, /<h[1-6]\b/i, 'fixture must stay within the Custom UI v1 HTML allowlist');
    assert.match(run.spec.content.html, /<p id="sample"/);
    assert.match(run.spec.content.html, /<textarea id="composer"/);
    assert.doesNotMatch(run.spec.content.html, /contenteditable|<script|onkeydown=/i);
    await run.listeners.get('composer:input')({value: 'new text'});
    assert.equal(run.patches.length, 0, 'input must not rewrite .value or erase native undo');
  } finally { await run.close(); await run.completion; }
  assert.equal(run.listeners.size, 0);
});

test('fixture reports observations without falsely certifying shortcuts or logging text', async () => {
  const run = await launchFixture();
  try {
    run.states.composer.value = 'private text must not be logged';
    await run.listeners.get('composer:input')({});
    await run.listeners.get('inspect:click')({});
    let result = JSON.parse(run.logs.find(line => line.startsWith('UI_EDITING_OBSERVATION=')).split('=')[1]);
    assert.equal(result.composerMatchesSample, false);
    assert.equal(result.sendCount, 0);
    assert.equal(result.inputEvents.composer, 1);
    assert.equal(result.nativeShortcutsVerdict, 'manual-review-required');
    assert.ok(run.logs.every(line => !line.includes('private text must not be logged')));
    run.states.composer.value = run.states.sample.text;
    await run.listeners.get('inspect:click')({});
    result = JSON.parse(run.logs.filter(line => line.startsWith('UI_EDITING_OBSERVATION=')).pop().split('=')[1]);
    assert.equal(result.composerMatchesSample, true);
    assert.equal(result.readonlyUnchanged, true);
    assert.equal(result.titleUnchanged, true);
    await run.listeners.get('send:click')({});
    assert.match(run.states.status.text, /发送按钮计数：1/);
  } finally { await run.close(); await run.completion; }
});

test('fixture fails explicitly when native UI is unavailable', async () => {
  const run = await launchFixture(false);
  await assert.rejects(run.completion, /requires an authorized native UI host/);
  assert.equal(run.spec, undefined);
  assert.equal(run.shown, false);
});
