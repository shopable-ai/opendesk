// Scoped Accessibility public-contract, menu, Promise, and cleanup evidence.
// Native target fixtures remain a separate explicit opt-in acceptance layer.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, RUN_DIR, runJS, verifyZeroCleanup, noResidual, writeJSON } = context;
const cleanup = (...args) => context.invoke('cleanup', ...args);

async function accessibility() {
  const stages = [
    ['api', 'accessibility-api', 'accessibility.js'],
    ['menu', 'accessibility-menu', 'accessibility-menu.js'],
    ['lifecycle', 'accessibility-lifecycle', 'accessibility-lifecycle.js'],
  ];
  const result = {
    schemaVersion: 1,
    status: 'running',
    nativeFixture: 'not-run',
    stages: [],
  };
  let failure = null;

  for (const [name, gate, source] of stages) {
    if (failure) {
      result.stages.push({ name, status: 'not-run' });
      continue;
    }
    try {
      await runJS(gate, File.join(ROOT_DIR, 'tests', 'runtime-api', source), 8, 120);
      await verifyZeroCleanup(gate);
      result.stages.push({ name, status: 'passed' });
    } catch (error) {
      failure = error;
      result.stages.push({ name, status: 'failed', error: String(error && error.stack || error) });
    }
  }

  try {
    await cleanup();
    await noResidual();
  } catch (error) {
    failure = failure || error;
    result.stages.push({ name: 'cleanup', status: 'failed', error: String(error && error.stack || error) });
  }
  if (!result.stages.some((stage) => stage.name === 'cleanup')) {
    result.stages.push({ name: 'cleanup', status: 'passed' });
  }

  result.status = failure ? 'failed' : 'passed';
  await writeJSON(File.join(RUN_DIR, 'results', 'accessibility.json'), result);
  console.log('[RUNTIME-API-ACCESSIBILITY RESULT] ' + JSON.stringify(result));
  if (failure) throw failure;
}

return Object.freeze({ accessibility });
})
