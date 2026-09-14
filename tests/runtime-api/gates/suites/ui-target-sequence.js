// Exact-window lifecycle + UI.tapTargets contract, deterministic behavior and exact-ID coverage.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, runJS, verifyZeroCleanup, noResidual } = context;
const cleanup = (...args) => context.invoke('cleanup', ...args);

async function uiTargetSequence() {
  let failure = null;
  try {
    await runJS('contract', File.join(ROOT_DIR, 'tests/runtime-api/ui-target-sequence-contract.js'), 5, 180);
    await verifyZeroCleanup('contract');
    await runJS('unit', File.join(ROOT_DIR, 'tests/runtime-api/ui-target-sequence-unit.js'), 15, 240);
    await verifyZeroCleanup('unit');
    await runJS('coverage', File.join(ROOT_DIR, 'tests/runtime-api/ui-target-sequence-coverage.js'), 10, 240);
    await verifyZeroCleanup('coverage');
  } catch (error) {
    failure = error;
  }
  try {
    await cleanup();
    await noResidual();
  } catch (error) {
    failure = failure || error;
  }
  if (failure) throw failure;
}

return Object.freeze({ uiTargetSequence });
})
