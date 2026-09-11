'use strict';

// Run from the repository root:
// ./opendesk -ui -script examples/custom-ui/native-ui-components.js -console-mode script -log-dir .runtime/examples/custom-ui/native-ui-components

// This is the Native UI track: every item below is a real AppKit/WinForms
// peer. It deliberately contains no HTML, CSS, WebView, or browser fallback.
const toolbar = new FloatingWindow({
  id: 'nativeUIComponents',
  position: { mode: 'anchor', horizontal: 'center', vertical: 'center', margin: 16, display: 'active' },
  title: 'Native UI component states',
  theme: 'dark',
  toolbar: { maxWidth: 580, maxColumns: 2, maxRows: 8 },
});

function log(type, payload) {
  console.log('NATIVE_UI_COMPONENTS_' + type + '=' + JSON.stringify(payload));
}

toolbar.addLabel('surface', 'NATIVE UI / REAL PEERS', { width: 220, tone: 'secondary' });
toolbar.addLabel('status', 'Native peers · dark theme', { width: 220, tone: 'secondary' });

toolbar.addSwitch('liveSync', 'Live sync', { value: true, width: 150 }, event => {
  log('CHANGE', { id: event.targetId, value: event.checked });
});
toolbar.addCheckbox('includeMeta', 'Include metadata', { value: false, width: 180 }, event => {
  log('CHANGE', { id: event.targetId, value: event.checked });
});

toolbar.addInput('query', 'Search', { value: 'demo', placeholder: 'Click to focus', maxLength: 64, width: 220 }, event => {
  log('INPUT', { id: event.targetId, value: event.value });
});
toolbar.addSelect('density', 'Density', {
  value: 'comfortable',
  width: 220,
  options: [
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' },
  ],
}, event => log('CHANGE', { id: event.targetId, value: event.value }));

toolbar.addSegmentedControl('scope', 'Scope', {
  value: 'page',
  width: 220,
  options: [
    { value: 'page', label: 'Page' },
    { value: 'app', label: 'App' },
  ],
}, event => log('CHANGE', { id: event.targetId, value: event.value }));
toolbar.addSlider('contrast', 'Contrast', { min: 0, max: 100, value: 75, step: 5, width: 220 }, event => {
  log('CHANGE', { id: event.targetId, value: event.value });
});
toolbar.addProgress('progress', 'Progress', { min: 0, max: 1, value: 0.68, width: 220 });

toolbar.addButton('defaultButton', 'Default button', 'checkmark', () => {
  log('ACTION', { id: 'defaultButton', state: 'default' });
});
toolbar.addButton('loadingButton', 'Loading button', 'arrow.clockwise');
toolbar.addButton('successButton', 'Success convention', 'checkmark');
toolbar.addButton('errorButton', 'Error button', 'exclamationmark.triangle', () => {
  throw new Error('Native demo callback failure');
});
toolbar.addButton('disabledButton', 'Disabled button', 'stop.fill');
toolbar.addButton('resetButton', 'Reset native states', 'arrow.counterclockwise', async () => {
  await applyDisplayStates();
  log('ACTION', { id: 'resetButton', state: 'reset' });
});

toolbar.addLabel('limits', 'Native: fixed · dark · typed', {
  width: 240,
  tone: 'warning',
});

toolbar.onError(error => console.error('NATIVE_UI_COMPONENTS_ERROR=' + JSON.stringify({
  code: error.code,
  operation: error.operation,
  targetId: error.targetId,
  capability: error.capability,
  message: error.message,
})));

async function applyDisplayStates() {
  await Promise.all([
    toolbar.updateButton('loadingButton', { busy: true, error: null }),
    toolbar.updateButton('successButton', { active: true, badge: 'OK', error: null }),
    toolbar.updateButton('errorButton', { busy: false, disabled: false, error: 'Sample error' }),
    toolbar.updateButton('disabledButton', { disabled: true, error: null }),
    toolbar.updateControl('progress', { indeterminate: true }),
    toolbar.updateLabel('status', { text: 'States: loading · success · error', tone: 'secondary' }),
  ]);
}

const shown = await toolbar.show();
await applyDisplayStates();
const stateIDs = ['liveSync', 'includeMeta', 'query', 'density', 'scope', 'contrast', 'progress'];
const states = {};
for (const id of stateIDs) states[id] = await toolbar.getControlState(id);
log('READY', {
  windowId: toolbar.id,
  bounds: shown.bounds,
  hostPid: shown.hostPid,
  nativeWindowId: shown.nativeWindowId,
  controls: states,
  buttonStates: {
    loading: await toolbar.getButtonState('loadingButton'),
    success: await toolbar.getButtonState('successButton'),
    error: await toolbar.getButtonState('errorButton'),
    disabled: await toolbar.getButtonState('disabledButton'),
  },
});

await toolbar.waitUntilClosed();
