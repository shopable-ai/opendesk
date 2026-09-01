(() => {
  const { equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

    test({
    name: 'FloatingWindow rejects unsafe icons, invalid orientation, duplicate IDs, invalid state and structural overflow',
    tier: 'custom-ui',
    covers: ['FloatingWindow.constructor', 'FloatingWindow.addButton', 'FloatingWindow.updateButton', 'FloatingWindow.show'],
  }, async () => {
    await helper.expectUIError(() => new FloatingWindow({ theme: 'light' }), 'INVALID_SPEC', 'FloatingWindow.constructor');
    const invalidOrientation = await helper.expectUIError(() => new FloatingWindow({ orientation: 'diagonal' }), 'INVALID_SPEC', 'FloatingWindow.constructor');
    equal(invalidOrientation.capability, 'orientation');
    await helper.expectUIError(() => new FloatingWindow().show(), 'INVALID_SPEC', 'FloatingWindow.show');
    for (const icon of ['https://example.com/icon.svg', '/tmp/icon.svg', '../../icon.svg', 'javascript:alert(1)', 'unknown.symbol', 'play', 'fallback', ' play.fill', 'play.fill ']) {
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
    helper.evidence.negative = { status: 'passed', unsafeIconsRejected: 9, invalidOrientationRejected: true, duplicateRejected: true, invalidStateRejected: true, thirtyThirdRejected: true, verticalSixthRejected: true };
    helper.persist();
  });
})();
