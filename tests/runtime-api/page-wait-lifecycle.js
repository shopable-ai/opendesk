// Native Runtime lifecycle coverage for the Page wait helpers. The catalog
// gate runs this file in its own execution and verifies the matching cleanup
// event after the process exits.

'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCanceled(error, label) {
  assert(error && error.name === 'AbortError', `${label} must reject with AbortError`);
  assert(error.code === 'CANCELED', `${label} must expose CANCELED`);
}

async function captureRejection(promise, label) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error(`${label} unexpectedly resolved`);
}

// A normal, fully-awaited execution must finish through the public helpers.
let predicateCalls = 0;
const normalValue = await page.waitForFunction(() => {
  predicateCalls += 1;
  return predicateCalls >= 2 ? 'normal-finished' : false;
}, { timeout: 1000, polling: 5 });
assert(normalValue === 'normal-finished', 'normal wait did not preserve its result');
assert(predicateCalls === 2, `normal wait made ${predicateCalls} predicate calls`);

// One controller abort must settle an active wait exactly once.
const activeController = new AbortController();
let activeSettlements = 0;
const activeWait = page.waitForFunction(
  () => new Promise(() => {}),
  { timeout: 30000, polling: 5, signal: activeController.signal },
);
activeWait.then(
  () => { activeSettlements += 1; },
  () => { activeSettlements += 1; },
);
activeController.abort('single lifecycle cancellation');
const activeError = await captureRejection(activeWait, 'active signal cancellation');
assertCanceled(activeError, 'active signal cancellation');
await page.waitForTimeout(0);
assert(activeSettlements === 1, `active signal cancellation settled ${activeSettlements} times`);

// Model a caller that does not await a long wait but manually cancels it. The
// separate host-cancel execution owns the complementary case where an unawaited
// wait remains pending until native execution teardown.
const forgottenController = new AbortController();
let forgottenHandled = false;
let forgottenSettlements = 0;
const forgottenWait = page.waitForTimeout(30000, { signal: forgottenController.signal });
forgottenWait.then(
  () => { forgottenSettlements += 1; },
  (error) => {
    forgottenSettlements += 1;
    assertCanceled(error, 'forgotten wait cancellation');
    forgottenHandled = true;
  },
);
forgottenController.abort('forgotten wait cleanup');
await page.waitForTimeout(0);
assert(forgottenHandled, 'forgotten wait rejection handler did not run');
assert(forgottenSettlements === 1, `forgotten wait settled ${forgottenSettlements} times`);

console.log(`PAGE_WAIT_LIFECYCLE_PASS=${JSON.stringify({
  normal: true,
  signalCanceled: true,
  forgottenWaitCanceled: true,
  predicateCalls,
  activeSettlements,
  forgottenSettlements,
})}`);
