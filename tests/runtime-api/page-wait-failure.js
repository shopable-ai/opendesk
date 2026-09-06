// Intentional behavioral counterexample. A real OpenDesk script must reach the
// public wait API and then exit non-zero because this assertion is false.

'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let completed = false;
const zeroWait = page.waitForTimeout(0).then(() => {
  completed = true;
  return 'wait-completed';
});
assert(!completed, '0ms wait unexpectedly completed synchronously');
const value = await zeroWait;
assert(completed, '0ms wait completion was not observable');
assert(value === 'wait-completed', '0ms wait did not reach the assertion probe');

console.log('PAGE_WAIT_ASSERTION_FAILURE_READY=1');
assert(false, 'intentional page wait assertion failure');
