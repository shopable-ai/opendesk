// catalog: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { noResidual } = context;
const asyncStacks = (...args) => context.invoke('asyncStacks', ...args);
const cleanup = (...args) => context.invoke('cleanup', ...args);
const contract = (...args) => context.invoke('contract', ...args);
const coverage = (...args) => context.invoke('coverage', ...args);
const customUI = (...args) => context.invoke('customUI', ...args);
const customUIConfig = (...args) => context.invoke('customUIConfig', ...args);
const failureExit = (...args) => context.invoke('failureExit', ...args);
const language = (...args) => context.invoke('language', ...args);
const negative = (...args) => context.invoke('negative', ...args);
const quality = (...args) => context.invoke('quality', ...args);
const runLiveSeam = (...args) => context.invoke('runLiveSeam', ...args);
const smokeCase = (...args) => context.invoke('smokeCase', ...args);
const unit = (...args) => context.invoke('unit', ...args);

async function liveSuite() {
  let failure = null;
  try {
    await contract();
    await language();
    await unit();
    await smokeCase();
    await failureExit();
    await negative();
    await asyncStacks();
    await runLiveSeam('live', 780);
    await customUI();
    await customUIConfig();
    await coverage();
  } catch (error) {
    failure = error;
  }
  try {
    await cleanup();
    await noResidual();
  } catch (error) {
    failure = error;
  }
  if (!failure) await quality();
  if (failure) throw failure;
}

async function smokeSuite() {
  await contract();
  await language();
  await unit();
  await smokeCase();
  await asyncStacks();
  await failureExit();
  await negative();
}

return Object.freeze({ liveSuite, smokeSuite });
})
