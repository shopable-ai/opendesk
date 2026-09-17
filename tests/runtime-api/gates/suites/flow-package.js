// flow-package: production .odflow CLI coverage loaded by catalog-runner.js.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, runJS, verifyZeroCleanup, noResidual } = context;

async function flowPackage() {
  await runJS('flow-package', File.join(ROOT_DIR, 'tests', 'runtime-api', 'flow-package.js'), 3, 120);
  await verifyZeroCleanup('flow-package');
  await noResidual();
}

return Object.freeze({ flowPackage });
})
