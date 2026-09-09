// Run from the repository root:
// ./dist/opendesk -ui -script tests/runtime-api/floating-window-controls.js -console-mode script
'use strict';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, message) => {
  if (actual !== expected) throw new Error(`${message}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
};
assert(typeof FloatingWindow === 'function', 'FloatingWindow is unavailable; run this scenario with -ui on macOS');

const evidenceDir = File.join(File.cwd(), '.runtime', 'tests', 'runtime-api', 'floating-window-controls');
File.ensureDir(evidenceDir);
const screenshot = async (name, bounds) => {
  await new Promise(resolve => setTimeout(resolve, 180));
  const path = File.join(evidenceDir, name + '.png');
  const result = await Screen.screenshot({ clip: bounds, path, returnType: 'object' });
  assert(result.sizeBytes > 100 && await File.exists(path), name + ' screenshot was not written');
  return { path, sizeBytes: result.sizeBytes, bounds };
};

for (const [kind, operation, add] of [
  ['switch', 'FloatingWindow.addSwitch', probe => probe.addSwitch('control', 'Control', { verticalAlignment: 'top' })],
  ['checkbox', 'FloatingWindow.addCheckbox', probe => probe.addCheckbox('control', 'Control', { verticalAlignment: 'top' })],
  ['input', 'FloatingWindow.addInput', probe => probe.addInput('control', 'Control', { verticalAlignment: 'top' })],
  ['select', 'FloatingWindow.addSelect', probe => probe.addSelect('control', 'Control', {
    options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], verticalAlignment: 'top',
  })],
  ['slider', 'FloatingWindow.addSlider', probe => probe.addSlider('control', 'Control', { verticalAlignment: 'top' })],
  ['segmentedControl', 'FloatingWindow.addSegmentedControl', probe => probe.addSegmentedControl('control', 'Control', {
    options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], verticalAlignment: 'top',
  })],
  ['progress', 'FloatingWindow.addProgress', probe => probe.addProgress('control', 'Control', { verticalAlignment: 'top' })],
]) {
  let error = null;
  try { add(new FloatingWindow()); } catch (caught) { error = caught; }
  assert(error && error.code === 'INVALID_SPEC' && error.operation === operation,
    `${kind} unexpectedly accepted Label-only verticalAlignment`);
}

const toolbar = new FloatingWindow({ x: 120, y: 120, title: 'Floating controls test', toolbar: { maxColumns: 2 } });
let shown = null;
try {
  toolbar.addSwitch('switch', 'Live sync', { value: true });
  toolbar.addCheckbox('checkbox', 'Include logs', { value: false });
  toolbar.addInput('input', 'Query', { value: 'draft', placeholder: 'Search', maxLength: 32, width: 180 });
  toolbar.addSelect('select', 'Quality', {
    value: 'best', options: [{ value: 'fast', label: 'Fast' }, { value: 'best', label: 'Best' }],
  });
  toolbar.addSlider('slider', 'Volume', { min: 0, max: 10, value: 4, step: 1 });
  toolbar.addSegmentedControl('scope', 'Scope', {
    value: 'page', options: [{ value: 'page', label: 'Page' }, { value: 'app', label: 'App' }],
  });
  toolbar.addProgress('progress', 'Work', { min: 0, max: 1, value: 0.25 });
  toolbar.addProgress('temporary', 'Temporary', { value: 0 });
  toolbar.removeControl('temporary');
  let removed = null;
  try { await toolbar.getControlState('temporary'); } catch (error) { removed = error; }
  assert(removed && removed.code === 'NOT_FOUND', 'removeControl did not remove the pre-show control');
  toolbar.addButton('action', 'Advance', 'arrow.clockwise');
  await toolbar.updateButton('action', { badge: 25 });

  const declaredInput = await toolbar.getControlState('input');
  equal(declaredInput.type, 'input', 'declared input type changed');
  equal(declaredInput.value, 'draft', 'declared input value changed');
  equal(declaredInput.focused, false, 'input was focused before show');
  equal(declaredInput.accessibilityRole, 'AXTextField', 'declared input Accessibility role changed');
  const declaredBadge = await toolbar.getButtonState('action');
  equal(declaredBadge.badge, '25', 'numeric badge was not normalized');
  equal(declaredBadge.accessibilityValue, 'inactive; badge 25', 'declared badge lost the active-state Accessibility value');
  let emptyBadge = null;
  try { await toolbar.updateButton('action', { badge: '' }); } catch (error) { emptyBadge = error; }
  assert(emptyBadge && emptyBadge.code === 'INVALID_SPEC', 'empty badge string did not require null clearing');

  shown = await toolbar.show();
  const before = (await toolbar.getState()).bounds;
  const states = {};
  const expectedRoles = {
    switch: 'AXCheckBox', checkbox: 'AXCheckBox', input: 'AXTextField', select: 'AXPopUpButton',
    slider: 'AXSlider', scope: 'AXRadioGroup', progress: 'AXProgressIndicator',
  };
  for (const id of ['switch', 'checkbox', 'input', 'select', 'slider', 'scope', 'progress']) {
    states[id] = await toolbar.getControlState(id);
    equal(states[id].localBounds.height, 40, `${id} native height changed`);
    equal(states[id].localBounds.width, states[id].width, `${id} native width differs from its declaration`);
    equal(states[id].screenBounds.width, states[id].width, `${id} screen width differs from its declaration`);
    equal(states[id].screenBounds.height, 40, `${id} screen height changed`);
    equal(states[id].disabled, false, `${id} was unexpectedly disabled by default`);
    assert(!Object.prototype.hasOwnProperty.call(states[id], 'verticalAlignment'),
      `${id} leaked Label-only verticalAlignment into control state`);
    equal(states[id].accessibilityRole, expectedRoles[id], `${id} native Accessibility role changed`);
  }
  const defaultBadge = await toolbar.getButtonState('action');
  equal(defaultBadge.badge, '25', 'shown badge changed');
  equal(defaultBadge.disabled, false, 'shown badge button was unexpectedly disabled');
  equal(defaultBadge.localBounds.width, 40, 'badge button width changed');
  equal(defaultBadge.localBounds.height, 40, 'badge button height changed');
  const defaultVisual = await screenshot('default-dark-controls', shown.bounds);
  equal(states.switch.accessibilitySubrole, 'AXSwitch', 'switch lost its native AXSwitch subrole');
  equal(states.checkbox.accessibilitySubrole, '', 'checkbox unexpectedly acquired switch semantics');
  equal(states.switch.value, true, 'switch native value changed');
  equal(states.checkbox.value, false, 'checkbox native value changed');
  equal(states.input.renderedValue, 'draft', 'input native value changed');
  equal(states.input.focused, false, 'show() focused the native input');
  equal(states.select.renderedValue, 'best', 'select native value changed');
  equal(states.slider.renderedValue, 4, 'slider native value changed');
  equal(states.scope.renderedValue, 'page', 'segmented native value changed');
  equal(states.scope.accessibilityRole, 'AXRadioGroup', 'segmented control lost native radio-group semantics');
  equal(states.progress.renderedValue, 0.25, 'progress native value changed');

  const updatedSwitch = await toolbar.updateControl('switch', { checked: false });
  const updatedCheckbox = await toolbar.updateControl('checkbox', { checked: true, disabled: true });
  const updatedInput = await toolbar.updateControl('input', { value: 'ready', placeholder: 'Filter' });
  const updatedSelect = await toolbar.updateControl('select', { value: 'fast' });
  const updatedSlider = await toolbar.updateControl('slider', { value: 7 });
  const updatedChoice = await toolbar.updateControl('scope', { value: 'app' });
  const updatedProgress = await toolbar.updateControl('progress', { indeterminate: true });
  const updatedBadge = await toolbar.updateButton('action', { badge: 'NEW!' });
  equal(updatedSwitch.renderedValue, false, 'native switch update did not apply');
  equal(updatedCheckbox.renderedValue, true, 'native checkbox update did not apply');
  equal(updatedInput.renderedValue, 'ready', 'native input update did not apply');
  equal(updatedSelect.renderedValue, 'fast', 'native select update did not apply');
  equal(updatedSlider.renderedValue, 7, 'native slider update did not apply');
  equal(updatedChoice.renderedValue, 'app', 'native segmented update did not apply');
  equal(updatedProgress.renderedValue, null, 'native progress did not become indeterminate');
  equal(updatedProgress.accessibilityValue, 'indeterminate', 'indeterminate progress Accessibility value changed');
  equal(updatedBadge.badge, 'NEW!', 'post-show badge update did not apply');
  equal(updatedCheckbox.disabled, true, 'native checkbox disabled readback did not apply');

  const disabledStates = {};
  for (const id of ['switch', 'checkbox', 'input', 'select', 'slider', 'scope']) {
    disabledStates[id] = await toolbar.updateControl(id, { disabled: true });
    equal(disabledStates[id].disabled, true, `${id} native peer did not report disabled`);
  }
  const disabledBadge = await toolbar.updateButton('action', { badge: 'NEW!', disabled: true });
  equal(disabledBadge.badge, 'NEW!', 'disabled badge text changed');
  equal(disabledBadge.disabled, true, 'badge button did not report disabled');
  const disabledProgress = await toolbar.getControlState('progress');
  equal(disabledProgress.disabled, false, 'read-only Progress unexpectedly acquired disabled state');
  let progressDisabledError = null;
  try { await toolbar.updateControl('progress', { disabled: true }); } catch (error) { progressDisabledError = error; }
  assert(progressDisabledError && progressDisabledError.code === 'INVALID_SPEC',
    'read-only Progress unexpectedly accepted disabled');
  const disabledVisual = await screenshot('disabled-dark-controls', shown.bounds);

  const interactiveStates = {};
  for (const id of ['switch', 'checkbox', 'input', 'select', 'slider', 'scope']) {
    interactiveStates[id] = await toolbar.updateControl(id, { disabled: false });
    equal(interactiveStates[id].disabled, false, `${id} native peer did not become interactive`);
  }
  const interactiveBadge = await toolbar.updateButton('action', { badge: 'NEW!', disabled: false });
  equal(interactiveBadge.disabled, false, 'badge button did not become interactive');
  const interactiveVisual = await screenshot('interactive-dark-controls', shown.bounds);
  const clearedBadge = await toolbar.updateButton('action', { badge: null });
  equal(clearedBadge.badge, '', 'null did not clear the post-show badge');
  const after = (await toolbar.getState()).bounds;
  equal(after.width, before.width, 'control update resized the native window');
  equal(after.height, before.height, 'control update changed native window height');

  let invalid = null;
  try { await toolbar.updateControl('select', { options: [] }); } catch (error) { invalid = error; }
  assert(invalid && invalid.code === 'INVALID_SPEC' && invalid.operation === 'FloatingWindow.updateControl',
    'immutable select options did not return structured INVALID_SPEC');
  for (const id of ['switch', 'checkbox', 'input', 'select', 'slider', 'scope', 'progress']) {
    let verticalAlignmentError = null;
    try { await toolbar.updateControl(id, { verticalAlignment: 'top' }); } catch (error) { verticalAlignmentError = error; }
    assert(verticalAlignmentError && verticalAlignmentError.code === 'INVALID_SPEC' &&
      verticalAlignmentError.operation === 'FloatingWindow.updateControl',
    `${id} update unexpectedly accepted Label-only verticalAlignment`);
  }

  File.write(File.join(evidenceDir, 'result.json'), JSON.stringify({
    schemaVersion: 1, shown, before, after, states, defaultBadge,
    screenshots: { default: defaultVisual, disabled: disabledVisual, interactive: interactiveVisual },
    updates: {
      switch: updatedSwitch, checkbox: updatedCheckbox, input: updatedInput, select: updatedSelect,
      slider: updatedSlider, segmentedControl: updatedChoice, progress: updatedProgress,
      badge: updatedBadge, clearedBadge,
    },
    disabled: { controls: disabledStates, badge: disabledBadge, progress: disabledProgress },
    interactive: { controls: interactiveStates, badge: interactiveBadge },
    badge: await toolbar.getButtonState('action'),
    nativeWindowOpened: true, mouseOrKeyboardInjection: false,
  }, null, 2));
  console.log('FLOATING_WINDOW_CONTROLS_PASS=' + File.join(evidenceDir, 'result.json'));
} finally {
  await toolbar.close();
}
