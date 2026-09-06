// sqlite: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, runJS, verifyZeroCleanup, noResidual } = context;
const cleanup = (...args) => context.invoke('cleanup', ...args);

async function sqlite() {
  let failure = null;
  try {
    await runJS('contract', File.join(ROOT_DIR, 'tests', 'runtime-api', 'sqlite-contract.js'), 5, 180);
    await verifyZeroCleanup('contract');
    await runJS('unit', File.join(ROOT_DIR, 'tests', 'runtime-api', 'sqlite-unit.js'), 15, 240);
    await verifyZeroCleanup('unit');
    await runJS('coverage', File.join(ROOT_DIR, 'tests', 'runtime-api', 'sqlite-coverage.js'), 10, 240);
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

return Object.freeze({ sqlite });
})
