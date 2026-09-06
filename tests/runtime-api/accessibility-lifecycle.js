// Public Promise/lifecycle checks that are safe without an Accessibility
// fixture. The formal catalog suite also inspects all five native resource
// counters in each execution cleanup event.
'use strict';

const accessibilityLifecycleStandalone = typeof globalThis.RuntimeAPITest === 'undefined';
if (accessibilityLifecycleStandalone) {
  (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
  RuntimeAPITest.load('tests/runtime-api/manifest.js');
}

(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const forgedRef = { kind: 'AccessibilityElementRef', id: 'axref-not-owned', role: 'button', nativeRole: 'AXButton' };

  function observedRejection(label, promise, observations) {
    assert(promise && typeof promise.then === 'function', `${label} must return a Promise`);
    observations[label] = { settlements: 0, error: null };
    return promise.then(
      () => {
        observations[label].settlements += 1;
        throw new Error(`${label} unexpectedly resolved`);
      },
      (error) => {
        observations[label].settlements += 1;
        observations[label].error = error;
        return error;
      },
    );
  }

  test({
    name: 'Accessibility validation Promises settle exactly once with unique execution-scoped request identities',
    tier: 'unit',
    covers: [
      'Accessibility.snapshot', 'Accessibility.find', 'Accessibility.read',
      'Accessibility.perform', 'Accessibility.release',
      'UI.getMenuItems', 'UI.findMenuItem', 'UI.tapMenuItem',
    ],
  }, async () => {
    const observations = Object.create(null);
    const pending = [
      observedRejection('snapshot', Accessibility.snapshot(), observations),
      observedRejection('find', Accessibility.find({}, {}), observations),
      observedRejection('read', Accessibility.read(forgedRef), observations),
      observedRejection('perform', Accessibility.perform(forgedRef, { action: 'invoke' }), observations),
      observedRejection('release', Accessibility.release(forgedRef), observations),
      observedRejection('getMenuItems', UI.getMenuItems(), observations),
      observedRejection('findMenuItem', UI.findMenuItem([], {}), observations),
      observedRejection('tapMenuItem', UI.tapMenuItem([], {}), observations),
    ];
    const errors = await Promise.all(pending);
    const requestIds = new Set();
    for (const [label, observation] of Object.entries(observations)) {
      equal(observation.settlements, 1, `${label} settlement count`);
      const error = observation.error;
      assert(error && error.code === 'INVALID_ARGUMENT', `${label} error code`);
      assert(/^axreq-[A-Za-z0-9]+-[1-9][0-9]*$/.test(error.requestId), `${label} requestId`);
      requestIds.add(error.requestId);
    }
    equal(errors.length, pending.length, 'observed rejection count');
    equal(requestIds.size, pending.length, 'request IDs must be unique within the execution');
  });

  test({
    name: 'An observed but unawaited validation rejection runs on the owning EventLoop before script completion',
    tier: 'unit',
    covers: ['Accessibility.snapshot'],
  }, async () => {
    let settlements = 0;
    let code = null;
    Accessibility.snapshot().then(
      () => { settlements += 1; },
      (error) => {
        settlements += 1;
        code = error && error.code;
      },
    );
    await Promise.resolve();
    await Promise.resolve();
    equal(settlements, 1, 'unawaited rejection settlement count');
    equal(code, 'INVALID_ARGUMENT', 'unawaited rejection code');
  });

  test({
    name: 'Repeated capability reads remain synchronous and do not claim hard native cancellation',
    tier: 'unit',
    covers: ['Accessibility.getCapabilities'],
  }, async () => {
    const first = Accessibility.getCapabilities();
    for (let index = 0; index < 64; index += 1) {
      const current = Accessibility.getCapabilities();
      equal(current.backend, first.backend, 'capability backend changed');
      equal(current.platform, first.platform, 'capability platform changed');
      equal(current.hostAuthorization.enabled, first.hostAuthorization.enabled, 'authorization changed');
      equal(current.implementation.available, first.implementation.available, 'implementation availability changed');
      equal(current.cancellation.hardCancel, false, 'hardCancel changed');
    }
    assert(first.hostAuthorization.enabled === true, 'trusted local lifecycle test must be authorized');
  });
})();

if (accessibilityLifecycleStandalone) {
  const keepAlive = setInterval(() => {}, 60000);
  RuntimeAPITest.run('RUNTIME-API-ACCESSIBILITY-LIFECYCLE').then(
    () => {
      clearInterval(keepAlive);
      console.log('ACCESSIBILITY_LIFECYCLE_PASS=1');
    },
    (error) => {
      clearInterval(keepAlive);
      throw error;
    },
  );
}
