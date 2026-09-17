// flow-installation: B1 native installer/catalog/trust/recovery coverage.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, runJS, verifyZeroCleanup, noResidual } = context;

async function flowInstallation() {
  await runJS('flow-installation', File.join(ROOT_DIR, 'tests', 'runtime-api', 'flow-installation.js'), 4, 180);
  await verifyZeroCleanup('flow-installation');
  await noResidual();
}

return Object.freeze({ flowInstallation });
})
