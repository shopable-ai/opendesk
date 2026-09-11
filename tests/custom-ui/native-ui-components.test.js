'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const examplePath = path.join(repoRoot, 'examples', 'custom-ui', 'native-ui-components.js');
const catalogPath = path.join(repoRoot, 'examples', 'catalog.json');
const guidePath = path.join(repoRoot, 'docs', 'custom-ui', 'theme-guide.md');
const source = fs.readFileSync(examplePath, 'utf8');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const guide = fs.readFileSync(guidePath, 'utf8');

test('native component gallery uses only the public FloatingWindow surface', () => {
  assert.match(source, /new FloatingWindow\(\{/);
  assert.match(source, /theme: 'dark'/);
  assert.match(source, /toolbar: \{ maxWidth: 580, maxColumns: 2, maxRows: 8 \}/);
  for (const method of [
    'addLabel', 'addSwitch', 'addCheckbox', 'addInput', 'addSelect',
    'addSegmentedControl', 'addSlider', 'addProgress', 'addButton',
    'updateButton', 'updateLabel', 'updateControl', 'getControlState', 'getButtonState',
    'waitUntilClosed',
  ]) {
    assert.match(source, new RegExp(`\\.${method}\\(`), `${method} must be demonstrated`);
  }
  assert.match(source, /busy: true/);
  assert.match(source, /active: true/);
  assert.match(source, /badge: 'OK'/);
  assert.match(source, /error: 'Sample error'/);
  assert.match(source, /disabled: true/);
  assert.match(source, /indeterminate/);
  assert.doesNotMatch(source, /ui\.createWindow|cssFile|content:\s*\{|<html\b/i);
  assert.match(source, /NATIVE_UI_COMPONENTS_/);
  assert.match(source, /hostPid/);
  assert.match(source, /nativeWindowId/);
});

test('native component gallery is catalogued and documents unsupported state semantics', () => {
  const entry = catalog.entries['custom-ui/native-ui-components.js'];
  assert.ok(entry, 'native component demo must be registered');
  assert.equal(entry.runPolicy, 'manual');
  assert.equal(entry.docs, 'docs/custom-ui/theme-guide.md');
  assert.ok(entry.tags.includes('native'));
  assert.ok(entry.tags.includes('accessibility'));
  assert.match(guide, /Native UI state gallery/);
  assert.match(guide, /没有独立的 `success` 字段/);
  assert.match(guide, /没有 `invalid`、`loading` 或 `success` 字段/);
  assert.match(guide, /native-ui-components\.js/);
  assert.match(guide, /每项 0 或 1 分/);
});
