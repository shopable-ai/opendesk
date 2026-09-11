'use strict';

// Run from the repository root:
// ./opendesk -ui -script examples/custom-ui/ui-components.js -console-mode script -log-dir .runtime/examples/custom-ui/ui-components

const capabilities = ui.getCapabilities();
if (!capabilities.enabled || !capabilities.available) {
  throw new Error('Custom UI is unavailable: ' + (capabilities.reason || 'not enabled'));
}

const componentDir = File.join(Execution.scriptDir, 'ui-components');
const panel = await ui.createWindow({
  id: 'uiComponents',
  kind: 'normal',
  title: 'Custom UI component states',
  position: {
    mode: 'anchor',
    size: { width: 760, height: 780 },
    horizontal: 'center',
    vertical: 'center',
    display: 'active',
  },
  draggable: true,
  theme: 'dark',
  content: {
    file: File.join(componentDir, 'panel.html'),
    cssFile: File.join(componentDir, 'panel.css'),
  },
});

const control = id => panel.control(id);
const baseButtonClasses = ['cd-button', 'cd-button-primary'];
let selectDisabled = false;

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function compactState(state) {
  return {
    id: state.id,
    type: state.type,
    text: state.text,
    value: state.value,
    disabled: state.disabled,
    busy: state.busy,
    error: state.error,
    classes: state.classes,
  };
}

async function snapshot(label) {
  const states = {};
  for (const id of ['mode', 'query', 'saveButton', 'buttonDisabled']) {
    states[id] = compactState(await control(id).getState());
  }
  await control('readback').update({
    text: [
      'select=' + String(states.mode.value || ''),
      'input=' + JSON.stringify(states.query.value || ''),
      'button=' + String(states.saveButton.text || ''),
      'disabled=' + String(states.buttonDisabled.disabled),
    ].join(' · '),
  });
  await control('status').update({ text: label });
  console.log('UI_COMPONENT_STATE=' + JSON.stringify({ label, states }));
  return states;
}

async function resetStates() {
  selectDisabled = false;
  await Promise.all([
    control('mode').update({ value: 'ready', disabled: false, classes: ['component-control', 'cd-select'] }),
    control('query').update({ value: '', classes: ['component-control', 'cd-input'] }),
    control('saveButton').update({
      text: 'Save changes', busy: false, disabled: false, error: '',
      classes: baseButtonClasses,
    }),
    control('toggleSelect').update({ text: 'Disable select' }),
    control('modeState').update({ text: 'ready' }),
    control('queryState').update({ text: 'empty' }),
    control('buttonState').update({ text: 'normal' }),
    control('queryHint').update({ text: 'Input events update the readback badge.' }),
    control('modeHint').update({ text: 'Choose a value to emit a change event.' }),
    control('saveHint').update({ text: 'Save shows busy, success, and error states.' }),
  ]);
  await snapshot('Reset complete');
}

control('mode').on('change', async event => {
  await control('modeState').update({ text: String(event.value || 'empty') });
  await control('modeHint').update({ text: 'change event received · value=' + String(event.value || '') });
  await snapshot('Select changed');
});

control('query').on('input', async event => {
  const value = String(event.value || '');
  const invalid = value.trim().length === 0;
  await Promise.all([
    control('query').update({ classes: invalid ? ['component-control', 'cd-input', 'is-invalid'] : ['component-control', 'cd-input'] }),
    control('queryState').update({ text: invalid ? 'invalid' : 'filled' }),
    control('queryHint').update({ text: invalid ? 'Empty input is marked invalid; type to recover.' : 'input event received · ' + value }),
  ]);
  await snapshot(invalid ? 'Input invalid' : 'Input changed');
});

control('saveButton').on('click', async () => {
  const current = await control('saveButton').getState();
  if (current.busy) return;
  await Promise.all([
    control('saveButton').update({
      text: 'Saving…', busy: true, disabled: true,
      classes: baseButtonClasses.concat('is-busy'),
    }),
    control('buttonState').update({ text: 'busy' }),
    control('saveHint').update({ text: 'Busy disables repeat clicks until the operation completes.' }),
  ]);
  await snapshot('Button busy');
  await delay(650);
  await Promise.all([
    control('saveButton').update({
      text: 'Saved', busy: false, disabled: false, error: '',
      classes: baseButtonClasses.concat('is-success'),
    }),
    control('buttonState').update({ text: 'success' }),
    control('saveHint').update({ text: 'Success keeps the same button id and geometry.' }),
  ]);
  await snapshot('Button success');
});

control('simulateError').on('click', async () => {
  await Promise.all([
    control('saveButton').update({
      text: 'Try again', busy: false, disabled: false, error: 'The sample request failed.',
      classes: baseButtonClasses.concat('is-error'),
    }),
    control('buttonState').update({ text: 'error' }),
    control('saveHint').update({ text: 'Error is announced with text and an aria-invalid state.' }),
  ]);
  await snapshot('Button error');
});

control('toggleSelect').on('click', async () => {
  selectDisabled = !selectDisabled;
  await Promise.all([
    control('mode').update({
      disabled: selectDisabled,
      classes: selectDisabled ? ['component-control', 'cd-select', 'is-disabled'] : ['component-control', 'cd-select'],
    }),
    control('toggleSelect').update({ text: selectDisabled ? 'Enable select' : 'Disable select' }),
    control('modeState').update({ text: selectDisabled ? 'disabled' : 'ready' }),
  ]);
  await snapshot(selectDisabled ? 'Select disabled' : 'Select enabled');
});

control('reset').on('click', resetStates);
control('close').on('click', () => panel.close());

await panel.show();
await snapshot('Ready');
await panel.waitUntilClosed();
