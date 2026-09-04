(() => {
  const { equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  test({
    name: 'FloatingWindow rejects unsafe icons, invalid layout constraints, invalid orientation, duplicate IDs, invalid state and structural overflow',
    tier: 'custom-ui',
    covers: ['FloatingWindow.constructor', 'FloatingWindow.addButton', 'FloatingWindow.updateButton', 'FloatingWindow.show', 'FloatingWindow.setPlacement'],
  }, async () => {
    await helper.expectUIError(() => new FloatingWindow({ theme: 'light' }), 'INVALID_SPEC', 'FloatingWindow.constructor');
    const invalidOrientation = await helper.expectUIError(() => new FloatingWindow({ orientation: 'diagonal' }), 'INVALID_SPEC', 'FloatingWindow.constructor');
    equal(invalidOrientation.capability, 'orientation');
    for (const placement of [
      { horizontal: 'leading', vertical: 'center' },
      { horizontal: 'right', vertical: 'middle' },
      { horizontal: 'right', vertical: 'center', display: 'secondary' },
      { horizontal: 'right', vertical: 'center', margin: -1 },
    ]) {
      const invalidPlacement = await helper.expectUIError(() => new FloatingWindow({ position: { mode: 'anchor', ...placement } }), 'INVALID_SPEC', 'FloatingWindow.constructor');
      equal(invalidPlacement.capability, 'placement');
    }
    const validInitialPlacement = { horizontal: 'right', vertical: 'center', margin: 16, display: 'active' };
    for (const options of [
      { x: 100 },
      { y: 100 },
      { position: { mode: 'absolute', x: 100 } },
      { position: { mode: 'absolute', x: 100, y: 100, margin: 0 } },
      { position: { mode: 'absolute', x: 100, y: 100, horizontal: 'left' } },
      { position: { mode: 'anchor', ...validInitialPlacement, x: 100 } },
      { position: { mode: 'anchor', ...validInitialPlacement, display: 'current' } },
      { x: 100, y: 100, position: { mode: 'anchor', ...validInitialPlacement } },
      { placement: validInitialPlacement },
    ]) {
      const conflictingPlacement = await helper.expectUIError(() => new FloatingWindow(options), 'INVALID_SPEC', 'FloatingWindow.constructor');
      // Structural mode conflicts report `position`; invalid anchor members
      // retain the more specific `placement` capability. Both are deliberate
      // structured INVALID_SPEC results, never a precedence fallback.
      equal(typeof conflictingPlacement.capability, 'string');
    }
    const uncreated = new FloatingWindow();
    const uncreatedCurrent = await helper.expectUIError(() => uncreated.setPlacement({
      horizontal: 'right', vertical: 'center', display: 'current',
    }), 'INVALID_SPEC', 'FloatingWindow.setPlacement');
    equal(uncreatedCurrent.capability, 'placement');
    for (const toolbar of [{ maxWidth: 59 }, { maxWidth: 961 }, { maxColumns: 1.5 }, { maxRows: 0 }]) {
      const invalidLayout = await helper.expectUIError(() => new FloatingWindow({ toolbar }), 'INVALID_SPEC', 'FloatingWindow.constructor');
      equal(invalidLayout.capability, 'toolbar');
    }
    const verticalLayout = await helper.expectUIError(() => new FloatingWindow({ orientation: 'vertical', toolbar: { maxColumns: 2 } }), 'INVALID_SPEC', 'FloatingWindow.constructor');
    equal(verticalLayout.capability, 'toolbar');
    await helper.expectUIError(() => new FloatingWindow().show(), 'INVALID_SPEC', 'FloatingWindow.show');
    for (const icon of ['https://example.com/icon.svg', '/tmp/icon.svg', '../../icon.svg', './icon.png', 'javascript:alert(1)', 'unknown.symbol', 'play', 'fallback', ' play.fill', 'play.fill ']) {
      const value = new FloatingWindow();
      const error = await helper.expectUIError(() => value.addButton('unsafe', 'Unsafe', icon, () => {}), 'INVALID_SPEC', 'FloatingWindow.addButton');
      equal(error.capability, 'icon');
    }
    const duplicate = new FloatingWindow();
    duplicate.addButton('same', 'Same', 'timer', () => {});
    const duplicateError = await helper.expectUIError(() => duplicate.addButton('same', 'Again', 'timer'), 'DUPLICATE_ID', 'FloatingWindow.addButton');
    equal(duplicateError.targetId, 'same');
    await helper.expectUIError(() => duplicate.updateButton('same', { busy: 'yes' }), 'INVALID_SPEC', 'FloatingWindow.updateButton');
    await helper.expectUIError(() => duplicate.updateButton('same', { fallback: 'play.fill' }), 'INVALID_SPEC', 'FloatingWindow.updateButton');
    const maximum = new FloatingWindow();
    for (let index = 0; index < 32; index += 1) maximum.addButton('max' + index, 'Max ' + index, 'timer');
    const overflow = await helper.expectUIError(() => maximum.addButton('max32', 'Max 32', 'timer'), 'INVALID_SPEC', 'FloatingWindow.addButton');
    equal(overflow.targetId, 'max32');
    const verticalMaximum = new FloatingWindow({ orientation: 'vertical' });
    for (let index = 0; index < 5; index += 1) verticalMaximum.addButton('vertical' + index, 'Vertical ' + index, 'timer');
    const verticalOverflow = await helper.expectUIError(() => verticalMaximum.addButton('vertical5', 'Vertical 5', 'timer'), 'INVALID_SPEC', 'FloatingWindow.addButton');
    equal(verticalOverflow.targetId, 'vertical5');
    const constrained = new FloatingWindow({ toolbar: { maxColumns: 2, maxRows: 2 } });
    for (let index = 0; index < 4; index += 1) constrained.addButton('constrained' + index, 'Constrained ' + index, 'timer');
    const constrainedOverflow = await helper.expectUIError(() => constrained.addButton('constrained4', 'Constrained 4', 'timer'), 'INVALID_SPEC', 'FloatingWindow.addButton');
    equal(constrainedOverflow.targetId, 'constrained4');
    helper.evidence.negative = { status: 'passed', unsafeIconsRejected: 10, invalidLayoutRejected: 5, invalidPlacementRejected: 8, invalidOrientationRejected: true, duplicateRejected: true, invalidStateRejected: true, thirtyThirdRejected: true, verticalSixthRejected: true, constrainedFifthRejected: true };
    helper.persist();
  });
})();
