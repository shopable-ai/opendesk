// assistant-task-core: persisted task/candidate host primitives in the real Runtime.
(function createSuite(context) {
'use strict';
const {ROOT_DIR, runJS, verifyZeroCleanup, noResidual} = context;

async function assistantTaskCore() {
  await runJS('assistant-task-core', File.join(ROOT_DIR, 'tests', 'runtime-api', 'assistant-task-core.js'), 16, 120);
  await verifyZeroCleanup('assistant-task-core');
  await noResidual();
}

return Object.freeze({assistantTaskCore});
})
