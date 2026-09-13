// ai-runtime: deterministic LLM HTTP and Agent CLI fixture qualification.
(function createSuite(context) {
'use strict';
const {ROOT_DIR, runJS, verifyZeroCleanup, noResidual} = context;

async function aiRuntime() {
  await runJS('ai-runtime', File.join(ROOT_DIR, 'tests', 'runtime-api', 'ai-runtime.js'), 180, 240);
  await verifyZeroCleanup('ai-runtime');
  await runJS('ai-source-restrictions', File.join(ROOT_DIR, 'tests', 'runtime-api', 'ai-source-restrictions.js'), 120, 180);
  await verifyZeroCleanup('ai-source-restrictions');
  await noResidual();
}

return Object.freeze({aiRuntime});
})
