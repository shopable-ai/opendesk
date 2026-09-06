// Safe public-contract coverage for Accessibility. This file is both a
// standalone OpenDesk Runtime test and a loadable unit-catalog test. It never
// resolves a live target or traverses the desktop.
'use strict';

const accessibilityStandalone = typeof globalThis.RuntimeAPITest === 'undefined';
if (accessibilityStandalone) {
  (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
  RuntimeAPITest.load('tests/runtime-api/manifest.js');
}

(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const applicationScope = { app: { pid: 1 }, root: 'application' };
  const forgedRef = {
    kind: 'AccessibilityElementRef',
    id: 'axref-forged-1',
    role: 'button',
    nativeRole: 'AXButton',
  };

  function assertStructuredError(error, code, operation, options = {}) {
    assert(error && typeof error === 'object', `${operation} must reject with an error object`);
    equal(error.code, code, `${operation} error code`);
    equal(error.operation, operation, `${operation} error operation`);
    assert(typeof error.backend === 'string' && error.backend.length > 0, `${operation} backend is required`);
    assert(typeof error.phase === 'string' && error.phase.length > 0, `${operation} phase is required`);
    assert(typeof error.requestId === 'string', `${operation} requestId must be a string`);
    if (!options.allowEmptyRequestId) {
      assert(/^axreq-[A-Za-z0-9]+-[1-9][0-9]*$/.test(error.requestId), `${operation} requestId is not opaque`);
    }
    equal(error.actionState, 'not_started', `${operation} validation actionState`);
    return error;
  }

  async function expectRejection(invoke, code, operation) {
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
    return assertStructuredError(caught, code, operation);
  }

  test({
    name: 'Accessibility exposes only its six public methods and a truthful non-prompting capability summary',
    tier: 'unit',
    covers: [
      'Accessibility.getCapabilities', 'Accessibility.snapshot', 'Accessibility.find',
      'Accessibility.read', 'Accessibility.perform', 'Accessibility.release',
    ],
  }, async () => {
    const expectedMethods = ['find', 'getCapabilities', 'perform', 'read', 'release', 'snapshot'];
    equal(JSON.stringify(Object.keys(Accessibility).sort()), JSON.stringify(expectedMethods), 'Accessibility public method set');
    assert(globalThis.AccessibilityRuntime === undefined, 'internal AccessibilityRuntime must not be public');
    assert(globalThis.MenuRuntime === undefined, 'a parallel MenuRuntime must not be public');

    const capabilities = Accessibility.getCapabilities();
    equal(capabilities.schemaVersion, 1, 'capability schemaVersion');
    assert(typeof capabilities.platform === 'string' && capabilities.platform.length > 0, 'capability platform');
    assert(typeof capabilities.backend === 'string' && capabilities.backend.length > 0, 'capability backend');
    equal(capabilities.hostAuthorization.enabled, true, 'trusted local script authorization');
    assert(typeof capabilities.implementation.available === 'boolean', 'implementation availability');
    assert(typeof capabilities.implementation.status === 'string' && capabilities.implementation.status.length > 0, 'implementation status');
    assert(typeof capabilities.implementation.menus === 'boolean', 'menu implementation summary');
    assert(typeof capabilities.implementation.coordinateMapping === 'boolean', 'coordinate mapping summary');
    assert(typeof capabilities.implementation.notes === 'string', 'capability notes');
    for (const action of ['invoke', 'setValue', 'expand', 'collapse', 'select', 'setChecked']) {
      assert(typeof capabilities.implementation.actions[action] === 'boolean', `action capability ${action}`);
    }
    assert(typeof capabilities.permission.required === 'boolean', 'permission required');
    assert(typeof capabilities.permission.state === 'string' && capabilities.permission.state.length > 0, 'permission state');
    assert(typeof capabilities.permission.granted === 'boolean', 'permission granted');
    assert(typeof capabilities.permission.cached === 'boolean', 'permission cached');
    equal(
      capabilities.available,
      capabilities.hostAuthorization.enabled && capabilities.implementation.available && capabilities.permission.granted,
      'available must include authorization, implementation, and permission',
    );
    equal(capabilities.limits.defaultTimeoutMs, 3000, 'default timeout');
    equal(capabilities.limits.maxTimeoutMs, 30000, 'maximum timeout');
    equal(capabilities.limits.defaultMaxDepth, 8, 'default depth');
    equal(capabilities.limits.maxMaxDepth, 32, 'maximum depth');
    equal(capabilities.limits.defaultMaxNodes, 1000, 'default nodes');
    equal(capabilities.limits.maxMaxNodes, 5000, 'maximum nodes');
    equal(capabilities.limits.maxActiveRefs, 256, 'active ref limit');
    equal(capabilities.limits.maxQueuedRequests, 32, 'queue limit');
    equal(capabilities.cancellation.hardCancel, false, 'hard cancellation claim');

    let synchronousError = null;
    try {
      Accessibility.getCapabilities({ prompt: true });
    } catch (error) {
      synchronousError = error;
    }
    assert(synchronousError, 'getCapabilities must reject extra arguments synchronously');
    assertStructuredError(synchronousError, 'INVALID_ARGUMENT', 'Accessibility.getCapabilities', { allowEmptyRequestId: true });
  });

  test({
    name: 'Accessibility rejects invalid selectors, scopes, traversal limits, and property lists before native access',
    tier: 'unit',
    covers: ['Accessibility.snapshot', 'Accessibility.find'],
  }, async () => {
    await expectRejection(() => Accessibility.snapshot(), 'INVALID_ARGUMENT', 'Accessibility.snapshot');
    await expectRejection(() => Accessibility.snapshot(null), 'INVALID_ARGUMENT', 'Accessibility.snapshot');
    await expectRejection(
      () => Accessibility.snapshot({ within: applicationScope }, 'extra'),
      'INVALID_ARGUMENT',
      'Accessibility.snapshot',
    );
    await expectRejection(() => Accessibility.snapshot({ within: 42 }), 'INVALID_ARGUMENT', 'Accessibility.snapshot');
    await expectRejection(
      () => Accessibility.snapshot({ within: { app: { pid: 1 } } }),
      'INVALID_ARGUMENT',
      'Accessibility.snapshot',
    );
    await expectRejection(
      () => Accessibility.snapshot({ within: { app: { pid: 1 }, root: 'desktop' } }),
      'INVALID_ARGUMENT',
      'Accessibility.snapshot',
    );
    for (const options of [
      { within: applicationScope, timeout: 0 },
      { within: applicationScope, timeout: 30001 },
      { within: applicationScope, timeout: 1.5 },
      { within: applicationScope, timeout: NaN },
      { within: applicationScope, timeout: Infinity },
      { within: applicationScope, timeout: '1000' },
      { within: applicationScope, maxDepth: 0 },
      { within: applicationScope, maxDepth: 33 },
      { within: applicationScope, maxDepth: 1.5 },
      { within: applicationScope, maxNodes: 0 },
      { within: applicationScope, maxNodes: 5001 },
      { within: applicationScope, maxNodes: -Infinity },
      { within: applicationScope, properties: [] },
      { within: applicationScope, properties: 'role' },
      { within: applicationScope, properties: ['role', 'role'] },
      { within: applicationScope, properties: ['role', null] },
      { within: applicationScope, properties: ['password'] },
      { within: applicationScope, unexpected: true },
    ]) {
      await expectRejection(() => Accessibility.snapshot(options), 'INVALID_ARGUMENT', 'Accessibility.snapshot');
    }

    for (const selector of [
      null,
      {},
      { role: '' },
      { role: 'button', name: 7 },
      { role: 'native-widget' },
      { name: 'x'.repeat(1025) },
      { identifier: 'x'.repeat(1025) },
      { role: 'button', contains: 'Save' },
    ]) {
      await expectRejection(
        () => Accessibility.find(selector, { within: applicationScope }),
        'INVALID_ARGUMENT',
        'Accessibility.find',
      );
    }
    await expectRejection(
      () => Accessibility.find({ role: 'button' }),
      'INVALID_ARGUMENT',
      'Accessibility.find',
    );
    await expectRejection(
      () => Accessibility.find({ role: 'button' }, { within: applicationScope, properties: ['role'] }),
      'INVALID_ARGUMENT',
      'Accessibility.find',
    );
    await expectRejection(
      () => Accessibility.find({ role: 'button' }, { within: applicationScope, timeout: NaN }),
      'INVALID_ARGUMENT',
      'Accessibility.find',
    );
    await expectRejection(
      () => Accessibility.find({ role: 'button' }, { within: applicationScope }, 'extra'),
      'INVALID_ARGUMENT',
      'Accessibility.find',
    );

    const secret = 'OPENDESK_ACCESSIBILITY_SECRET_VALUE_9f4d';
    const privacyError = await expectRejection(
      () => Accessibility.find({ name: secret }, { within: applicationScope, unsupportedOption: true }),
      'INVALID_ARGUMENT',
      'Accessibility.find',
    );
    const rendered = String(privacyError && privacyError.message || privacyError) + JSON.stringify(privacyError);
    assert(!rendered.includes(secret), 'validation error leaked selector content');
  });

  test({
    name: 'Accessibility refuses forged references for read, action, release, and nested scope authority',
    tier: 'unit',
    covers: ['Accessibility.snapshot', 'Accessibility.read', 'Accessibility.perform', 'Accessibility.release'],
  }, async () => {
    await expectRejection(() => Accessibility.read(), 'INVALID_ARGUMENT', 'Accessibility.read');
    await expectRejection(() => Accessibility.perform(), 'INVALID_ARGUMENT', 'Accessibility.perform');
    await expectRejection(() => Accessibility.release(), 'INVALID_ARGUMENT', 'Accessibility.release');
    await expectRejection(
      () => Accessibility.snapshot({ within: forgedRef }),
      'INVALID_ARGUMENT',
      'Accessibility.snapshot',
    );
    await expectRejection(() => Accessibility.read(forgedRef), 'INVALID_ARGUMENT', 'Accessibility.read');
    await expectRejection(
      () => Accessibility.perform(forgedRef, { action: 'invoke' }),
      'INVALID_ARGUMENT',
      'Accessibility.perform',
    );
    await expectRejection(() => Accessibility.release(forgedRef), 'INVALID_ARGUMENT', 'Accessibility.release');
    await expectRejection(() => Accessibility.release(forgedRef, forgedRef), 'INVALID_ARGUMENT', 'Accessibility.release');
  });
})();

if (accessibilityStandalone) {
  const keepAlive = setInterval(() => {}, 60000);
  RuntimeAPITest.run('RUNTIME-API-ACCESSIBILITY').then(
    () => clearInterval(keepAlive),
    (error) => {
      clearInterval(keepAlive);
      throw error;
    },
  );
}
