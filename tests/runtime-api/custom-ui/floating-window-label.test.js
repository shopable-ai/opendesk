(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  test({
    name: 'FloatingWindow native labels provide fixed-geometry visible status text and Accessibility readback',
    tier: 'custom-ui',
    covers: [
      'FloatingWindow.addLabel', 'FloatingWindow.removeLabel', 'FloatingWindow.updateLabel',
      'FloatingWindow.getLabelState', 'FloatingWindow.addButton', 'FloatingWindow.addSeparator',
      'FloatingWindow.getState', 'FloatingWindow.show', 'FloatingWindow.close', 'Screen.screenshot',
    ],
  }, async () => {
    const status = new FloatingWindow({ x: 180, y: 220, alwaysOnTop: true });
    status.addLabel('status', 'Ready 00:00', { width: 120, alignment: 'center', tone: 'success' });

    const declared = await status.getState();
    equal(declared.bounds.width, 140, 'label-only declared width changed');
    equal(declared.bounds.height, 81, 'label-only declared height changed');

    const shown = await status.show();
    let label = await status.getLabelState('status');
    equal(label.text, 'Ready 00:00');
    equal(label.renderedText, 'Ready 00:00');
    equal(label.width, 120);
    equal(label.alignment, 'center');
    equal(label.verticalAlignment, 'center', 'default vertical alignment was not center');
    equal(label.tone, 'success');
    equal(label.accessibilityName, 'Ready 00:00');
    equal(label.accessibilityRole, 'staticText');
    equal(label.accessibilityValue, 'Ready 00:00');
    equal(label.localBounds.width, 120);
    equal(label.localBounds.height, 40);
    equal(label.screenBounds.width, 120);
    equal(label.screenBounds.height, 40);
    equal(label.truncated, false);
    assert(label.renderedTextBounds.width > 0 && label.renderedTextBounds.height > 0,
      'native rendered text bounds were not reported');
    assert(Math.abs(
      (label.renderedTextBounds.x + label.renderedTextBounds.width / 2) -
      (label.localBounds.x + label.localBounds.width / 2)
    ) <= 1, 'native horizontal center did not center the rendered text bounds');
    assert(Math.abs(
      (label.renderedTextBounds.y + label.renderedTextBounds.height / 2) -
      (label.localBounds.y + label.localBounds.height / 2)
    ) <= 1, 'default native vertical center did not center the rendered text bounds');
    const centeredLabel = label;
    const centeredVisual = await helper.screenshot('label-centered', shown.bounds);

    const beforeUpdateBounds = (await status.getState()).bounds;
    const topAligned = await status.updateLabel('status', {
      text: 'Top aligned', alignment: 'leading', verticalAlignment: 'top', tone: 'secondary',
    });
    equal(topAligned.alignment, 'leading');
    equal(topAligned.verticalAlignment, 'top');
    assert(Math.abs(topAligned.renderedTextBounds.y - (topAligned.localBounds.y + 4)) <= 1,
      'top alignment did not preserve the native 4pt text inset');
    label = await status.updateLabel('status', {
      text: 'Recording a deliberately long task name 00:12',
      alignment: 'trailing', verticalAlignment: 'bottom', tone: 'warning',
    });
    equal(label.text, 'Recording a deliberately long task name 00:12');
    equal(label.renderedText, label.text);
    equal(label.alignment, 'trailing');
    equal(label.verticalAlignment, 'bottom');
    equal(label.tone, 'warning');
    equal(label.accessibilityName, label.text);
    equal(label.accessibilityRole, 'staticText');
    equal(label.accessibilityValue, label.text);
    equal(label.truncated, true, 'fixed-width native label did not report tail truncation');
    assert(Math.abs(
      (label.renderedTextBounds.y + label.renderedTextBounds.height) -
      (label.localBounds.y + label.localBounds.height - 4)
    ) <= 1, 'bottom alignment did not preserve the native 4pt text inset');
    assert(Math.abs(label.renderedTextBounds.y - topAligned.renderedTextBounds.y) > 2,
      'runtime vertical alignment update did not move the native text peer');
    const afterUpdateBounds = (await status.getState()).bounds;
    equal(afterUpdateBounds.width, beforeUpdateBounds.width, 'label update resized the window');
    equal(afterUpdateBounds.height, beforeUpdateBounds.height, 'label update changed window height');
    const labelOnlyVisual = await helper.screenshot('label-only-updated', shown.bounds);

    const wrongKind = await helper.expectUIError(
      () => status.getButtonState('status'), 'NOT_FOUND', 'FloatingWindow.getButtonState');
    equal(wrongKind.capability, 'button', 'label leaked into button state');
    const postShowRemove = await helper.expectUIError(
      () => status.removeLabel('status'), 'INVALID_STATE', 'FloatingWindow.removeLabel');
    equal(postShowRemove.capability, 'structure');
    await status.close();

    const mixed = new FloatingWindow({ x: 180, y: 340 });
    mixed.addButton('run', '运行', 'automation.run', () => {});
    mixed.addSeparator('status-divider');
    mixed.addLabel('summary', '3 tasks ready', { width: 120, tone: 'secondary' });
    const mixedShown = await mixed.show();
    const run = await helper.state(mixed, 'run');
    const summary = await mixed.getLabelState('summary');
    equal(summary.localBounds.x - (run.localBounds.x + run.localBounds.width), 17,
      'button-label separator geometry changed');
    const mixedVisual = await helper.screenshot('button-separator-label', mixedShown.bounds);
    await mixed.close();

    const removable = new FloatingWindow();
    removable.addButton('first', 'First', 'timer');
    removable.addSeparator('divider');
    removable.addLabel('temporary', 'Temporary');
    removable.removeLabel('temporary');
    equal((await removable.getState()).bounds.width, 60, 'pre-show label removal left a separator');

    for (const [name, invoke] of [
      ['empty text', () => new FloatingWindow().addLabel('status', ' ')],
      ['bad id', () => new FloatingWindow().addLabel('bad id', 'Ready')],
      ['narrow width', () => new FloatingWindow().addLabel('status', 'Ready', { width: 47 })],
      ['wide width', () => new FloatingWindow().addLabel('status', 'Ready', { width: 241 })],
      ['alignment', () => new FloatingWindow().addLabel('status', 'Ready', { alignment: 'justify' })],
      ['vertical alignment', () => new FloatingWindow().addLabel('status', 'Ready', { verticalAlignment: 'baseline' })],
      ['tone', () => new FloatingWindow().addLabel('status', 'Ready', { tone: 'brand' })],
      ['unknown option', () => new FloatingWindow().addLabel('status', 'Ready', { flexible: true })],
    ]) {
      const error = await helper.expectUIError(invoke, 'INVALID_SPEC', 'FloatingWindow.addLabel');
      equal(error.capability, 'label', name + ' used the wrong capability');
    }

    const invalidPatch = new FloatingWindow();
    invalidPatch.addLabel('status', 'Ready');
    await helper.expectUIError(() => invalidPatch.updateLabel('status', {}), 'INVALID_SPEC', 'FloatingWindow.updateLabel');
    await helper.expectUIError(() => invalidPatch.updateLabel('status', { width: 200 }), 'INVALID_SPEC', 'FloatingWindow.updateLabel');
    await helper.expectUIError(() => invalidPatch.updateLabel('status', { verticalAlignment: 'baseline' }), 'INVALID_SPEC', 'FloatingWindow.updateLabel');

    const verticalMaximum = new FloatingWindow({ orientation: 'vertical' });
    for (let index = 0; index < 5; index += 1) verticalMaximum.addLabel('label' + index, 'Label ' + index);
    const overflow = await helper.expectUIError(
      () => verticalMaximum.addLabel('label5', 'Label 5'), 'INVALID_SPEC', 'FloatingWindow.addLabel');
    equal(overflow.capability, 'label');

    helper.evidence.labels = {
      declared, shown, centered: centeredLabel, topAligned, updated: label,
      screenshots: { centered: centeredVisual, labelOnly: labelOnlyVisual, mixed: mixedVisual },
      mixed: { shown: mixedShown, button: run, label: summary },
      fixedGeometry: beforeUpdateBounds.width === afterUpdateBounds.width && beforeUpdateBounds.height === afterUpdateBounds.height,
      nativeHorizontalCenter: true, nativeVerticalAlignment: true,
      labelOnly: true, accessibility: {
        role: label.accessibilityRole, name: label.accessibilityName, value: label.accessibilityValue,
      }, verticalContentLimit: 5,
    };
    helper.persist();
  });
})();
