import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { SOURCE } from '../../lab/browser-automation-core/config.mjs';
const context = {module: {exports: {}}}; vm.runInNewContext(fs.readFileSync(`${SOURCE}/extension/locator.js`, 'utf8'), context);
const api = context.module.exports;
const el = ({tag = 'button', text = '', attrs = {}, labels = [], children = []} = {}) => ({tagName: tag.toUpperCase(), textContent: text, labels: labels.map(textContent => ({textContent})), children,
  getAttribute: key => attrs[key] ?? null, ownerDocument: {getElementById: () => null}});
test('semantic matching distinguishes accessible name from incidental text and matches native labels', () => {
  const button = el({text: 'incidental', attrs: {'aria-label': 'Confirm'}});
  assert.equal(api.matches(button, {kind: 'role', role: 'button', name: 'Confirm'}), true);
  assert.equal(api.matches(button, {kind: 'role', role: 'button', name: 'incidental'}), false);
  assert.equal(api.matches(el({tag: 'input', labels: ['Confirmation Amount']}), {kind: 'label', value: 'Confirmation Amount'}), true);
});
test('locators reject code, arbitrary selectors and nested relation engines', () => {
  for (const query of [{kind: 'css', value: '*'}, {kind: 'eval', value: 'code'}, {kind: 'attribute', attribute: 'onclick', value: 'code'},
    {kind: 'relation', axis: 'parent', within: {kind: 'testId', value: 'a'}, target: {kind: 'text', value: 'b'}}]) {
    assert.throws(() => api.validate(query), {code: 'INVALID_QUERY'});
  }
});
test('extra selector constraints and whitespace-only identities fail closed', () => {
  const valid = {kind: 'role', role: 'button', name: 'Save'};
  assert.equal(api.validate(valid), valid);
  for (const query of [
    {...valid, testId: 'danger'},
    {kind: 'role', role: 'button', name: '  '},
    {kind: 'text', value: '\t  '},
    {kind: 'attribute', attribute: 'id', value: 'Save', index: 0},
    {kind: 'relation', axis: 'descendant', within: {kind: 'testId', value: 'parent', css: '*'}, target: valid},
  ]) assert.throws(() => api.validate(query), {code: 'INVALID_QUERY'});
});
test('zero and multiple matches fail closed; no first-match shortcut', () => {
  assert.throws(() => api.unique([]), {code: 'TARGET_NOT_FOUND'});
  assert.throws(() => api.unique([el(), el()]), {code: 'AMBIGUOUS_TARGET', candidateCount: 2});
  const one = el(); assert.equal(api.unique([one]), one);
});
