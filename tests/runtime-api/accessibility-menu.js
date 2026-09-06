// Safe public-contract coverage for the native UI menu composition. No valid
// target is resolved and no menu is expanded or invoked by this test.
'use strict';

const accessibilityMenuStandalone = typeof globalThis.RuntimeAPITest === 'undefined';
if (accessibilityMenuStandalone) {
  (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
  RuntimeAPITest.load('tests/runtime-api/manifest.js');
}

(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const menuScope = { app: { pid: 1 }, root: 'menuBar' };

  async function expectMenuRejection(invoke, operation) {
    let promise;
    try {
      promise = invoke();
    } catch (error) {
      throw new Error(`${operation} threw synchronously instead of returning a rejected Promise: ${error && error.stack || error}`);
    }
    assert(promise && typeof promise.then === 'function', `${operation} must return a Promise`);
    let caught = null;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    assert(caught, `${operation} unexpectedly resolved`);
    equal(caught.code, 'INVALID_ARGUMENT', `${operation} error code`);
    equal(caught.operation, operation, `${operation} error operation`);
    assert(typeof caught.backend === 'string' && caught.backend.length > 0, `${operation} backend is required`);
    assert(typeof caught.phase === 'string' && caught.phase.length > 0, `${operation} phase is required`);
    assert(/^axreq-[A-Za-z0-9]+-[1-9][0-9]*$/.test(caught.requestId), `${operation} requestId is not opaque`);
    equal(caught.actionState, 'not_started', `${operation} validation actionState`);
    if (caught.failedLevel !== undefined) {
      assert(Number.isInteger(caught.failedLevel) && caught.failedLevel >= 0, `${operation} failedLevel`);
      assert(Number.isInteger(caught.completedLevels) && caught.completedLevels >= 0, `${operation} completedLevels`);
      assert(typeof caught.expansionOccurred === 'boolean', `${operation} expansionOccurred`);
    }
    return caught;
  }

  test({
    name: 'UI attaches three native menu methods without replacing the visual UI contract or exporting a second owner',
    tier: 'unit',
    covers: ['UI.getMenuItems', 'UI.findMenuItem', 'UI.tapMenuItem'],
  }, async () => {
    for (const method of ['getMenuItems', 'findMenuItem', 'tapMenuItem']) {
      equal(typeof UI[method], 'function', `UI.${method} must be exposed`);
    }
    for (const method of ['tapText', 'tapTexts', 'tapImage', 'findText', 'findImage']) {
      equal(typeof UI[method], 'function', `visual UI.${method} must remain exposed`);
    }
    assert(globalThis.MenuRuntime === undefined, 'menu composition must not export a parallel MenuRuntime');
  });

  test({
    name: 'UI menu observation rejects invalid scope, path, limits, and unknown fields before observing a target',
    tier: 'unit',
    covers: ['UI.getMenuItems', 'UI.findMenuItem'],
  }, async () => {
    await expectMenuRejection(() => UI.getMenuItems(), 'UI.getMenuItems');
    await expectMenuRejection(() => UI.getMenuItems({}), 'UI.getMenuItems');
    await expectMenuRejection(
      () => UI.getMenuItems({ within: { app: { pid: 1 }, root: 'application' } }),
      'UI.getMenuItems',
    );
    await expectMenuRejection(() => UI.getMenuItems({ within: menuScope, finalAction: { action: 'invoke' } }), 'UI.getMenuItems');
    await expectMenuRejection(() => UI.getMenuItems({ within: menuScope, timeout: NaN }), 'UI.getMenuItems');
    await expectMenuRejection(() => UI.getMenuItems({ within: menuScope }, 'extra'), 'UI.getMenuItems');

    for (const path of [
      null,
      [],
      [''],
      ['   '],
      [{}],
      [{ name: '' }],
      [{ identifier: 3 }],
      [{ name: 'File', extra: true }],
      ['x'.repeat(1025)],
      [{ identifier: 'x'.repeat(1025) }],
      Array.from({ length: 33 }, (_, index) => `level-${index}`),
    ]) {
      await expectMenuRejection(() => UI.findMenuItem(path, { within: menuScope }), 'UI.findMenuItem');
    }
    for (const options of [
      { within: menuScope, timeout: 0 },
      { within: menuScope, timeout: 30001 },
      { within: menuScope, timeout: 1.5 },
      { within: menuScope, timeout: NaN },
      { within: menuScope, timeout: Infinity },
      { within: menuScope, timeout: '1000' },
      { within: menuScope, maxDepth: 0 },
      { within: menuScope, maxDepth: 33 },
      { within: menuScope, maxDepth: 1.5 },
      { within: menuScope, maxNodes: 0 },
      { within: menuScope, maxNodes: 5001 },
      { within: menuScope, maxNodes: -Infinity },
      { within: menuScope, properties: ['role'] },
      { within: menuScope, unknown: true },
    ]) {
      await expectMenuRejection(() => UI.findMenuItem(['File'], options), 'UI.findMenuItem');
    }
    await expectMenuRejection(
      () => UI.findMenuItem(['File', 'Save'], { within: menuScope, maxDepth: 1 }),
      'UI.findMenuItem',
    );
    await expectMenuRejection(
      () => UI.findMenuItem(['File'], { within: menuScope }, 'extra'),
      'UI.findMenuItem',
    );
  });

  test({
    name: 'UI menu actions accept only invoke, select, and typed setChecked final actions under one bounded path',
    tier: 'unit',
    covers: ['UI.tapMenuItem'],
  }, async () => {
    await expectMenuRejection(() => UI.tapMenuItem(), 'UI.tapMenuItem');
    for (const finalAction of [
      null,
      [],
      { action: 7 },
      { action: 'expand' },
      { action: 'collapse' },
      { action: 'setValue', value: 'secret-must-not-be-submitted' },
      { action: 'setChecked' },
      { action: 'setChecked', checked: 'yes' },
      { action: 'invoke', checked: true },
      { action: 'toggle' },
      {},
    ]) {
      await expectMenuRejection(
        () => UI.tapMenuItem(['File'], { within: menuScope, finalAction }),
        'UI.tapMenuItem',
      );
    }

    // Each supported finalAction parses successfully; maxDepth then prevents
    // the request from reaching the native backend.
    for (const finalAction of [
      { action: 'invoke' },
      { action: 'select' },
      { action: 'setChecked', checked: true },
      { action: 'setChecked', checked: false },
    ]) {
      await expectMenuRejection(
        () => UI.tapMenuItem(
          [{ name: 'File', identifier: 'fixture.file' }, 'Save'],
          { within: menuScope, maxDepth: 1, finalAction },
        ),
        'UI.tapMenuItem',
      );
    }
    await expectMenuRejection(
      () => UI.tapMenuItem(['File', 'Save'], { within: menuScope, maxDepth: 1 }),
      'UI.tapMenuItem',
    );

    const secret = 'OPENDESK_ACCESSIBILITY_MENU_SECRET_4d4a';
    const privacyError = await expectMenuRejection(
      () => UI.tapMenuItem([secret], { within: menuScope, unsupportedOption: true }),
      'UI.tapMenuItem',
    );
    const rendered = String(privacyError && privacyError.message || privacyError) + JSON.stringify(privacyError);
    assert(!rendered.includes(secret), 'menu validation error leaked path content');
    await expectMenuRejection(
      () => UI.tapMenuItem(['File'], { within: menuScope }, 'extra'),
      'UI.tapMenuItem',
    );
  });
})();

if (accessibilityMenuStandalone) {
  const keepAlive = setInterval(() => {}, 60000);
  RuntimeAPITest.run('RUNTIME-API-ACCESSIBILITY-MENU').then(
    () => clearInterval(keepAlive),
    (error) => {
      clearInterval(keepAlive);
      throw error;
    },
  );
}
