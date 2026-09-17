'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');

function source(relative) {
  return fs.readFileSync(path.join(repo, relative), 'utf8');
}

function createSpec(relative, marker) {
  const text = source(relative);
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `${relative} is missing its ${marker} window declaration`);
  const end = text.indexOf('\n        });', start);
  return text.slice(start, end === -1 ? start + 1800 : end);
}

test('all OpenDesk full-page windows use normal, non-topmost specifications', () => {
  const pages = [
    ['apps/opendesk/flow-runner/controller.js', 'id: `flowRunnerList', 'Flow Runner List'],
    ['apps/opendesk/recorder/recording-history.js', 'const window = await ui.createWindow({', 'Recorder History'],
    ['apps/opendesk/scheduler-center.js', 'id: `schedulerHistory', 'Scheduler History'],
    ['apps/opendesk/scheduler-center.js', 'id: `schedulerCenter', 'Scheduler Center'],
    ['apps/opendesk/assistant/controller.js', 'id: `opendeskAssistant', 'AI Assistant'],
    ['apps/opendesk/developer-tools.js', 'id: `openDeskStatus', 'Developer Status'],
    ['apps/opendesk/permissions-center.js', 'id: `permissionsCenter', 'Permissions Center'],
    ['apps/opendesk/runtime-log.js', 'id: `runtimeLog', 'Runtime Log'],
  ];

  for (const [relative, marker, label] of pages) {
    const spec = createSpec(relative, marker);
    assert.match(spec, /kind:\s*'normal'/, `${label} must be a normal window`);
    assert.match(spec, /alwaysOnTop:\s*false/, `${label} must not request permanent topmost`);
    assert.doesNotMatch(spec, /kind:\s*'floating'|alwaysOnTop:\s*true/, `${label} must not acquire panel/topmost semantics`);
  }
});

test('only compact native control bars retain intentional floating topmost behavior', () => {
  const flowRunner = source('apps/opendesk/flow-runner/controller.js');
  const recorder = source('apps/opendesk/recorder/controller-core.js');

  for (const [label, text] of [['Flow Runner control bar', flowRunner], ['Recorder control bar', recorder]]) {
    assert.match(text, /new Floating(?:WindowAPI)?\s*\([\s\S]{0,700}?alwaysOnTop:\s*true/, `${label} must remain an intentional floating control`);
  }
});

test('native hosts preserve normal page activation without tool, panel, or topmost promotion', () => {
  const mac = source('pkg/customui/machost/native_darwin.m');
  const windows = source('pkg/customui/winhost/Host.cs');
  const web = source('pkg/customui/winhost/WebSurface.cs');

  assert.match(mac, /if \(\[kind isEqualToString:@"floating"\]\)[\s\S]*?NSPanel[\s\S]*?else \{[\s\S]*?NSWindow\.class/, 'macOS must reserve NSPanel for explicit floating surfaces');
  assert.match(mac, /controller\.alwaysOnTop \? NSFloatingWindowLevel : NSNormalWindowLevel/, 'macOS normal windows must use NSNormalWindowLevel');
  assert.match(mac, /if \(controller\.window\.isMiniaturized\) \[controller\.window deminiaturize:nil\];/, 'macOS normal-window show must restore a minimized page');
  assert.doesNotMatch(mac, /addChildWindow:|parentWindow/, 'macOS Custom UI host must not create Z-order ownership between product pages');

  assert.match(windows, /ShowInTaskbar=!floating/, 'Windows normal pages must not inherit tool-window visibility');
  assert.match(windows, /Form\.NonActivating=floating/, 'Windows nonactivation must be limited to explicit floating surfaces');
  assert.match(windows, /Form\.WindowState==FormWindowState\.Minimized\)Form\.WindowState=FormWindowState\.Normal/, 'Windows normal-window show must restore a minimized page');
  assert.match(web, /J\.S\(spec,"kind"\)=="floating"\?FormBorderStyle\.SizableToolWindow:FormBorderStyle\.Sizable/, 'Windows tool-window chrome must be limited to explicit floating surfaces');
});
