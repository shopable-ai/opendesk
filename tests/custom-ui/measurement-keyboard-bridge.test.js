'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function bridgeHarness({toolbar: includeToolbar = false} = {}) {
  const messages = [];
  const listeners = new Map();
  const elementListeners = new Map();
  const addElementListener = (id, type, callback) => elementListeners.set(`${id}:${type}`, callback);
  const preview = {
    id: 'preview', tagName: 'IMG', style: {}, dataset: {}, classList: [], offsetWidth: 400, offsetHeight: 300, complete: true,
    naturalWidth: 400, naturalHeight: 300, src: 'snapshot.png', currentSrc: 'snapshot.png',
    getAttribute(name) { return name === 'src' ? this.src : null; },
	setAttribute() {}, getBoundingClientRect() { return {x: 0, y: 0, left: 0, top: 0, width: 400, height: 300}; },
	getClientRects() { return [{}]; },
    addEventListener(type, callback) { addElementListener(this.id, type, callback); },
    setPointerCapture() {}, closest() { return null; },
  };
  const copyMenuPanel = {};
  const toolbarHandle = {
    id: 'measurementToolbarDragHandle', style: {}, dataset: {},
    addEventListener(type, callback) { addElementListener(this.id, type, callback); },
    setPointerCapture() {},
  };
  const toolbar = {
    id: 'measurementToolbar', tagName: 'SECTION', style: {}, dataset: {}, classList: [], offsetWidth: 300, offsetHeight: 42,
    getAttribute() { return null; }, setAttribute() {}, getClientRects() { return [{}]; }, closest() { return null; },
    getBoundingClientRect() {
      const x = Number.parseFloat(this.style.left) || 16;
      const y = Number.parseFloat(this.style.top) || 16;
      return {x, y, left: x, top: y, width: 300, height: 42, right: x + 300, bottom: y + 42};
    },
    querySelector(selector) {
      if (selector === '[data-opendesk-measurement-toolbar-drag]') return toolbarHandle;
      if (selector === '#copyMenuPanel') return copyMenuPanel;
      return null;
    },
  };
  const document = {
    head: {appendChild() {}}, documentElement: {appendChild() {}}, body: {append() {}},
    createElement() { return {style: {}, append() {}, setAttribute() {}}; },
    getElementById(id) {
      if (id === 'preview') return preview;
      if (includeToolbar && id === 'measurementToolbar') return toolbar;
      return null;
    },
    querySelector(selector) { return includeToolbar && selector === '[data-opendesk-measurement-toolbar]' ? toolbar : null; }, querySelectorAll() { return []; },
    addEventListener(type, callback) { listeners.set(type, callback); },
  };
  const window = {
    chrome: {webview: {postMessage(message) { messages.push(message); }}},
    screenX: 0, screenY: 0, innerWidth: 800, innerHeight: 600,
    addEventListener(type, callback) { listeners.set('window:' + type, callback); },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../pkg/customui/winhost/bridge.js'), 'utf8')
    .replace('__CONFIG__', JSON.stringify({ids: includeToolbar ? ['preview', 'measurementToolbar'] : ['preview'], types: {preview: 'img', measurementToolbar: 'container'}, css: '', draggable: false, measurementTarget: 'preview'}));
  vm.runInNewContext(source, {window, document, Object, Set, Array, Number, String, Error, Math, JSON, requestAnimationFrame(callback) { callback(); }}, {filename: 'bridge.js'});
  return {messages, listeners, elementListeners, toolbar};
}

function keyboardEvent(key, modifiers = {}) {
  return {
    key, isComposing: false, defaultPrevented: false, target: null,
    shiftKey: !!modifiers.shift, altKey: !!modifiers.alt, ctrlKey: !!modifiers.ctrl, metaKey: !!modifiers.meta,
    preventDefault() { this.prevented = true; },
  };
}

test('measurement host bridge forwards the complete session keyboard contract', () => {
  const {messages, listeners} = bridgeHarness();
  const keydown = listeners.get('keydown');
  const keyup = listeners.get('keyup');
  assert.ok(keydown);
  assert.ok(keyup);
  const cases = [
    ['1'], ['2'], ['3'], ['4'], ['Tab'], ['Tab', {shift: true}], ['Alt'],
    ['ArrowLeft'], ['ArrowRight', {shift: true}], ['R'], ['I'], ['Escape'],
    ['c', {meta: true}], ['c', {meta: true, shift: true}], ['c', {meta: true, alt: true}],
  ];
  for (const [key, modifiers] of cases) {
    const event = keyboardEvent(key, modifiers);
    keydown(event);
    assert.equal(event.prevented, true, `${key} was not retained by Measurement`);
  }
  const altUp = keyboardEvent('Alt');
  keyup(altUp);
  const forwarded = messages.filter(message => message.type === 'measurement.key').map(message => message.fields);
  assert.deepEqual(forwarded.map(fields => fields.key), ['1', '2', '3', '4', 'Tab', 'Tab', 'Alt', 'ArrowLeft', 'ArrowRight', 'R', 'I', 'Escape', 'c', 'c', 'c', 'Alt']);
  assert.equal(forwarded.at(-1).phase, 'up');
  assert.equal(forwarded.at(-4).shift, false);
  assert.equal(forwarded.at(-3).shift, true);
  assert.equal(forwarded.at(-2).alt, true);
});

test('Measurement bridge leaves Inspector editing keys to Inspector controls', () => {
  const {listeners} = bridgeHarness();
  const event = keyboardEvent('Tab');
  event.target = {closest(selector) { return selector === 'select,input,textarea' ? this : null; }};
  listeners.get('keydown')(event);
  assert.equal(event.prevented, undefined);
});

test('Measurement toolbar drag moves only the toolbar and keeps it on-screen', () => {
  const {elementListeners, toolbar} = bridgeHarness({toolbar: true});
  const down = elementListeners.get('measurementToolbarDragHandle:pointerdown');
  const move = elementListeners.get('measurementToolbarDragHandle:pointermove');
  const up = elementListeners.get('measurementToolbarDragHandle:pointerup');
  assert.ok(down);
  assert.ok(move);
  assert.ok(up);
  const pointer = (clientX, clientY) => ({
    button: 0, pointerId: 7, clientX, clientY,
    preventDefault() {}, stopPropagation() {},
  });
  down(pointer(24, 24));
  move(pointer(176, 112));
  assert.equal(toolbar.style.left, '168px');
  assert.equal(toolbar.style.top, '104px');
  assert.equal(toolbar.style.bottom, 'auto');
  assert.equal(toolbar.dataset.opendeskToolbarMenuPlacement, 'below');
  move(pointer(2000, 2000));
  assert.equal(toolbar.style.left, '488px');
  assert.equal(toolbar.style.top, '546px');
  assert.equal(toolbar.dataset.opendeskToolbarMenuPlacement, 'above');
  up(pointer(2000, 2000));
  move(pointer(30, 30));
  assert.equal(toolbar.style.left, '488px');
  assert.equal(toolbar.style.top, '546px');
});

test('macOS host relays the Measurement key contract while its nonactivating panel is visible', () => {
  const macHost = fs.readFileSync(path.join(__dirname, '../../pkg/customui/machost/native_darwin.m'), 'utf8');
  for (const key of ["key==='1'", "key==='2'", "key==='3'", "key==='4'", "key==='Tab'", "key==='Alt'", "key.startsWith('Arrow')", "key.toLowerCase()==='r'", "key.toLowerCase()==='i'", "key==='Escape'"]) {
    assert.match(macHost, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(macHost, /type:'measurement\.key'/);
  assert.match(macHost, /phase:'up'/);
	assert.match(macHost, /CDMeasurementKeyForEvent/);
	assert.match(macHost, /addGlobalMonitorForEventsMatchingMask/);
	assert.match(macHost, /startMeasurementKeyboardMonitor/);
	assert.match(macHost, /stopMeasurementKeyboardMonitor/);
	assert.match(macHost, /removeMonitor:self\.measurementKeyboardMonitor/);
  assert.match(macHost, /source:el\.tagName === 'IMG'/);
  assert.match(macHost, /Object\.prototype\.hasOwnProperty\.call\(patch,'source'\)/);
  assert.match(macHost, /data-opendesk-measurement-toolbar-drag/);
  assert.match(macHost, /toolbar\.style\.bottom='auto'/);
});
