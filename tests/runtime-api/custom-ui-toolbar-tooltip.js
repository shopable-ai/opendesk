// From repository root, with a paired native UI host and UI authorization:
// ./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script tests/runtime-api/custom-ui-toolbar-tooltip.js -console-mode script -log-dir .runtime/tests/floating-tooltip/contract-run
// Own OpenDesk windows only. This checks contracts/readback, not hover geometry.
const root = File.join(File.cwd(), '.runtime/tests/custom-ui-toolbar-tooltip');
await File.ensureDir(root);
function check(value, message) { if (!value) throw new Error(message); }
async function expectError(invoke, code, operation, capability) {
  let caught;
  try { await invoke(); } catch (error) { caught = error; }
  check(caught && caught.code === code, operation + ': expected ' + code);
  check(caught.operation === operation, operation + ': wrong operation');
  if (capability) check(caught.capability === capability, operation + ': wrong capability');
}
const platform = ui.getCapabilities().platform;
check(platform === 'darwin' || platform === 'windows', 'Requires macOS or Windows native host');
const invalid = ['', 'diagonal', 'AUTO', ' right', 'bottom ', null, undefined,
  false, true, 0, 1, [], ['right'], {}, { side: 'right' }, new String('right')];
for (const tooltipPosition of invalid) {
  await expectError(() => new FloatingWindow({ tooltipPosition }),
    'INVALID_SPEC', 'FloatingWindow.constructor', 'tooltipPosition');
}
// Accessors are consumed once, so the exported option cannot differ from
// the primitive preference that was validated (including the Windows gate).
let getterReads = 0;
const accessor = { get tooltipPosition() { getterReads++; return getterReads === 1 ? 'right' : null; } };
if (platform === 'windows') {
  await expectError(() => new FloatingWindow(accessor), 'UNSUPPORTED_CAPABILITY', 'FloatingWindow.constructor', 'tooltipPosition');
} else {
  const snapshotted = new FloatingWindow(accessor);
  snapshotted.addButton('snapshot', 'Single accessor read', { text: '继续' });
  try { check((await snapshotted.show()).visible, 'Snapshotted option failed'); }
  finally { await snapshotted.close(); }
}
check(getterReads === 1, 'Tooltip accessor was read more than once');
const deletedDuringRead = {
  get title() { delete this.tooltipPosition; return 'Deletion during snapshot'; },
  tooltipPosition: 'right'
};
await expectError(() => new FloatingWindow(deletedDuringRead),
  'INVALID_SPEC', 'FloatingWindow.constructor', 'tooltipPosition');
const positions = ['auto', 'right', 'left', 'top', 'bottom'];
if (platform === 'windows') {
  for (const tooltipPosition of positions) {
    await expectError(() => new FloatingWindow({ tooltipPosition }),
      'UNSUPPORTED_CAPABILITY', 'FloatingWindow.constructor', 'tooltipPosition');
  }
}
const evidence = { platform, getterReads, deletionDuringSnapshotRejected: true, invalidDeclarations: invalid.length,
  unsupportedDeclarations: platform === 'windows' ? positions.length : 0, cases: [] };
for (const orientation of ['horizontal', 'vertical']) {
  // Omission must remain valid on both platforms. macOS accepts all five
  // preferences, including explicit auto, in either orientation.
  for (const preference of platform === 'darwin' ? [undefined, ...positions] : [undefined]) {
    const options = { orientation, position: { mode: 'absolute', x: 300, y: 180 } };
    if (preference !== undefined) options.tooltipPosition = preference;
    const toolbar = new FloatingWindow(options);
    const context = orientation + '/' + (preference === undefined ? 'omitted' : preference);
    function semantic(state, label, text) {
      check(state.label === label && state.tooltip === label && state.accessibilityName === label,
        context + ': label/tooltip/Accessibility diverged');
      check(state.renderedText === text, context + ': visible text changed');
      if (text) check(state.icon.text === text && state.iconPresentation.kind === 'text', context + ': text source changed');
      else check(state.icon === 'timer' && state.iconPresentation.kind === 'builtIn', context + ': icon compatibility');
    }
    toolbar.addButton('text', 'Independent text semantics', { text: '继续' });
    toolbar.addButton('icon', 'Independent icon semantics', 'timer');
    try {
      const shown = await toolbar.show();
      const window = await toolbar.getState();
      check(shown.visible && window.visible && shown.id === toolbar.id && window.id === shown.id,
        context + ': show/getState failed');
      check(shown.nativeWindowId > 0 && window.nativeWindowId === shown.nativeWindowId,
        context + ': native identity missing or changed');
      semantic(await toolbar.getButtonState('text'), 'Independent text semantics', '继续');
      semantic(await toolbar.getButtonState('icon'), 'Independent icon semantics', '');
      for (const [id, text] of [['text', '继续'], ['icon', '']]) {
        const before = await toolbar.getButtonState(id);
        const label = 'Updated ' + context + '/' + id;
        const updated = await toolbar.updateButton(id, { label });
        const readback = await toolbar.getButtonState(id);
        semantic(updated, label, text);
        semantic(readback, label, text);
        check(updated.revision > before.revision && readback.revision === updated.revision,
          context + ': label revision not applied');
        // This is a window option, never a mutable button patch.
        await expectError(() => toolbar.updateButton(id, { tooltipPosition: 'left' }),
          'INVALID_SPEC', 'FloatingWindow.updateButton');
        const unchanged = await toolbar.getButtonState(id);
        semantic(unchanged, label, text);
        check(unchanged.revision === updated.revision, context + ': invalid patch changed revision');
      }
      // Changing the presentation retains independent label semantics.
      const label = 'Updated ' + context + '/text';
      semantic(await toolbar.updateButton('text', { icon: 'timer' }), label, '');
      semantic(await toolbar.getButtonState('text'), label, '');
      semantic(await toolbar.updateButton('text', { icon: { text: '继续' } }), label, '继续');
      semantic(await toolbar.getButtonState('text'), label, '继续');
      evidence.cases.push({ orientation, tooltipPosition: preference === undefined ? 'omitted' : preference,
        nativeWindowId: window.nativeWindowId, labelUpdates: true, textIconCompatible: true });
    } finally {
      await toolbar.close();
    }
  }
}
await File.writeJSON(File.join(root, 'evidence.json'), evidence);
console.log('FLOATING_TOOLTIP_CONTRACT_PASS=' + JSON.stringify(evidence));
