'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const examplePath = path.join(repoRoot, 'examples', 'custom-ui', 'ui-components.js');
const htmlPath = path.join(repoRoot, 'examples', 'custom-ui', 'ui-components', 'panel.html');
const cssPath = path.join(repoRoot, 'examples', 'custom-ui', 'ui-components', 'panel.css');
const catalogPath = path.join(repoRoot, 'examples', 'catalog.json');

const source = fs.readFileSync(examplePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const publicExamples = fs.readFileSync(path.join(repoRoot, 'docs', 'api', 'examples', 'single-tests.md'), 'utf8');

test('ui-components demo keeps structure, state ownership, and resource boundaries explicit', () => {
  assert.match(source, /theme:\s*'dark'/);
  assert.match(source, /content:\s*\{[\s\S]*file:[\s\S]*cssFile:/);
  assert.match(source, /control\('mode'\)\.on\('change'/);
  assert.match(source, /control\('query'\)\.on\('input'/);
  assert.match(source, /control\('saveButton'\)\.on\('click'/);
  assert.match(source, /busy:\s*true/);
  assert.match(source, /error:\s*'The sample request failed\.'/);
  assert.match(source, /waitUntilClosed\(\)/);
  assert.doesNotMatch(source, /mouse\.|keyboard\.|page\./);

  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /\bon(?:click|input|change)\s*=/i);
  assert.doesNotMatch(html, /\bautofocus\b/i);
  assert.doesNotMatch(html, /\bmultiple\b/i);
  for (const id of [
    'mode', 'modeDefault', 'modeHover', 'modeFocus', 'modeDisabled', 'modeInvalid',
    'query', 'queryEmpty', 'queryHover', 'queryFocus', 'queryDisabled', 'queryInvalid',
    'saveButton', 'buttonDefault', 'buttonHover', 'buttonFocus', 'buttonActive',
    'buttonDisabled', 'buttonLoading', 'buttonSuccess', 'buttonError',
    'simulateError', 'toggleSelect', 'reset', 'close',
  ]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must have one stable id`);
  }
  assert.match(html, /<header id="dragbar" data-clawdesk-drag>/);
  assert.match(html, /<select id="mode"/);
  assert.match(html, /<input id="query"[^>]*type="text"/);
  assert.match(html, /<button id="saveButton"[^>]*type="button"/);
  assert.match(html, /id="modeInvalid"[^>]*aria-invalid="true"/);
  assert.match(html, /id="queryInvalid"[^>]*aria-invalid="true"/);
  assert.match(html, /id="buttonActive"[^>]*aria-pressed="true"/);
  assert.match(html, /id="buttonLoading"[^>]*aria-busy="true"/);
  assert.match(html, /class="cd-button cd-button-success"/);
  assert.match(html, /class="cd-button cd-button-error"/);

  assert.match(css, /:root\s*\{[\s\S]*--ui-bg:/);
  assert.match(css, /button:focus-visible, input:focus-visible, select:focus-visible/);
  assert.match(css, /\.cd-input\.is-invalid/);
  assert.match(css, /\.cd-button\[aria-busy="true"\]/);
  assert.match(css, /\.cd-button-error/);
  assert.match(css, /\.cd-button-success/);
  assert.match(css, /\.is-focus-sample/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.cd-select\s*\{/);
  assert.doesNotMatch(css, /@import|url\s*\(|image-set\s*\(/i);

  const entry = catalog.entries['custom-ui/ui-components.js'];
  assert.ok(entry, 'component demo must be registered');
  assert.equal(entry.runPolicy, 'manual');
  assert.equal(entry.docs, 'docs/custom-ui/theme-guide.md');
  assert.deepEqual(entry.tags, ['ui', 'components', 'theme', 'css', 'select', 'input', 'button']);
  assert.match(publicExamples, /可复用组件状态画廊.*\.\/opendesk -ui -script examples\/custom-ui\/ui-components\.js/);
});

test('theme guide documents both surfaces and the select/input/button matrix', () => {
  const guide = fs.readFileSync(path.join(repoRoot, 'docs', 'custom-ui', 'theme-guide.md'), 'utf8');
  assert.match(guide, /ui\.createWindow\(\)/);
  assert.match(guide, /FloatingWindow/);
  assert.match(guide, /CSS 层叠顺序是 HTML/);
  assert.match(guide, /select、input、button 状态矩阵/);
  assert.match(guide, /HTML 与原生控件差异/);
  assert.match(guide, /视觉验收清单/);
  assert.match(guide, /ui-components\.js/);
});
