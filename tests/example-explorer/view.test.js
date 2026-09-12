'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const viewPath = path.join(repoRoot, 'apps', 'example-explorer', 'view.js');
const cssPath = path.join(repoRoot, 'apps', 'example-explorer', 'styles.css');
const context = {globalThis: {}};
vm.runInNewContext(fs.readFileSync(viewPath, 'utf8'), context, {filename: viewPath});
const View = context.globalThis.OpenDeskExampleView;
const css = fs.readFileSync(cssPath, 'utf8');

function model(overrides = {}) {
  return {
    allEntries: [
      {title: 'Console Output', relativePath: 'runtime/console.js', category: 'Getting Started', level: 'beginner', runnable: true, runPolicy: 'safe', platformSupported: true, platforms: ['darwin', 'linux', 'windows'], launch: {kind: 'script', ui: false}, description: 'Print output.', docs: '', prerequisites: [], expected: 'Done'},
      {title: 'Command', relativePath: 'runtime/command.js', category: 'Runtime', level: 'intermediate', runnable: false, runPolicy: 'manual', platformSupported: true, platforms: ['darwin', 'linux', 'windows'], launch: {kind: 'script', ui: false}, description: 'Run a command.', docs: '', prerequisites: [], expected: 'Done'},
    ],
    filtered: [],
    pageEntries: [],
    page: 0,
    pageCount: 1,
    selected: null,
    query: '',
    category: 'All',
    status: 'Ready',
    missing: [],
    unregistered: [],
    ...overrides,
  };
}

test('Explorer view keeps the category select native while adding an accessible themed shell', () => {
  const entry = model().allEntries[0];
  const html = View.buildHTML(model({
    filtered: [entry],
    pageEntries: [entry],
    selected: entry,
    category: 'Getting Started',
  }));

  assert.match(html, /<div class="select-wrap"><select id="category" aria-label="Filter by category">/);
  assert.match(html, /<option value="Getting Started" selected>Getting Started<\/option>/);
  assert.match(html, /<input id="search"[^>]*aria-label="Search examples"/);
  assert.match(html, /class="brand-mark" aria-hidden="true"/);
  assert.equal((html.match(/id="category"/g) || []).length, 1);
  assert.equal((html.match(/id="search"/g) || []).length, 1);
});

test('Explorer skin defines a dark theme and removes the platform select gradient', () => {
  assert.match(css, /:root\{color-scheme:dark;/);
  assert.match(css, /--accent:#8ea7ff/);
  assert.match(css, /\.filters select\{[^}]*appearance:none;-webkit-appearance:none;/);
  assert.match(css, /\.select-wrap::after\{[^}]*pointer-events:none/);
  assert.match(css, /button:focus-visible,input:focus-visible,select:focus-visible/);
  assert.doesNotMatch(css, /url\s*\(|image-set\s*\(|@import/);
});

test('Explorer window remains on the supported dark Custom UI theme', () => {
  const controller = fs.readFileSync(path.join(repoRoot, 'apps', 'example-explorer', 'controller.js'), 'utf8');
  assert.match(controller, /theme:\s*'dark'/);
  assert.match(controller, /content:\s*\{html:\s*viewApi\.buildHTML\(initial\),\s*css\}/);
});

test('Explorer keeps Run state visible and explains direct, manual, and unsupported entries', () => {
  const entries = model().allEntries;
  const direct = {...entries[0], runAvailability: 'direct', runAvailabilityLabel: 'Direct run available', runAvailabilityReason: 'Safe policy and platform support allow one-click execution.'};
  const manual = {...entries[1], runAvailability: 'manual', runAvailabilityLabel: 'Manual run required', runAvailabilityReason: 'This example needs manual review before running; use Copy Run Command to launch it yourself.'};
  const unsupported = {...entries[1], platformSupported: false, platforms: ['darwin'], runAvailability: 'unsupported', runAvailabilityLabel: 'Unsupported on this platform', runAvailabilityReason: 'Supports darwin; the current platform is windows. Copy Run Command remains available.'};

  const directHTML = View.buildHTML(model({filtered: [direct], pageEntries: [direct], selected: direct}));
  assert.match(directHTML, /<button id="run" class="primary">Run<\/button>/);
  assert.match(directHTML, /id="runAvailability" class="run-availability direct"/);
  assert.match(directHTML, /Direct run available/);
  assert.match(directHTML, /id="copyRunCommand"[^>]*>Copy Run Command/);

  const manualHTML = View.buildHTML(model({filtered: [manual], pageEntries: [manual], selected: manual}));
  assert.match(manualHTML, /<button id="run" class="primary" disabled>Run<\/button>/);
  assert.match(manualHTML, /id="runAvailability" class="run-availability manual"/);
  assert.match(manualHTML, /Manual run required/);
  assert.match(manualHTML, /manual review before running/);
  assert.match(manualHTML, /<span id="exampleBadge0" class="badge manual">manual<\/span>/);
  assert.match(manualHTML, /id="copyRunCommand"[^>]*>Copy Run Command/);

  const unsupportedHTML = View.buildHTML(model({filtered: [unsupported], pageEntries: [unsupported], selected: unsupported}));
  assert.match(unsupportedHTML, /<button id="run" class="primary" disabled>Run<\/button>/);
  assert.match(unsupportedHTML, /id="runAvailability" class="run-availability unsupported"/);
  assert.match(unsupportedHTML, /Unsupported on this platform/);
  assert.match(unsupportedHTML, /current platform is windows/);
  assert.match(unsupportedHTML, /id="copyRunCommand"[^>]*>Copy Run Command/);

  const controller = fs.readFileSync(path.join(repoRoot, 'apps', 'example-explorer', 'controller.js'), 'utf8');
  assert.match(controller, /safeUpdate\('runAvailability',/);
  assert.match(controller, /safeUpdate\('runAvailabilityLabel',/);
  assert.match(controller, /safeUpdate\('runAvailabilityReason',/);
  assert.match(controller, /safeUpdate\('run', \{disabled:/);
  assert.match(controller, /safeUpdate\('copyRunCommand', \{disabled: !entry\}/);
});
