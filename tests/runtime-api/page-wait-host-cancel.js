// The POSIX host-cancel seam sends SIGINT only after this predicate is in
// flight. The independent Page deadline is deliberately much longer than the
// seam deadline so a timeout cannot masquerade as host cancellation.

'use strict';

// Deliberately forget to await one long wait. Its Promise is observed so this
// is not an unhandled rejection probe; the host cancellation below must make
// the execution owner discard its native timer during teardown.
let forgottenSettled = false;
page.waitForTimeout(60000).then(
  () => { forgottenSettled = true; },
  () => { forgottenSettled = true; },
);

let predicateCalls = 0;
const never = new Promise(() => {});
const pending = page.waitForFunction(() => {
  predicateCalls += 1;
  if (predicateCalls === 1) {
    if (forgottenSettled) throw new Error('unawaited wait settled before host cancellation');
    console.log(`PAGE_WAIT_HOST_CANCEL_READY=${JSON.stringify({
      predicateCalls,
      forgottenWaitStarted: true,
      forgottenSettled,
    })}`);
  }
  return never;
}, { timeout: 60000, polling: 5 });

await pending;
console.log('PAGE_WAIT_HOST_CANCEL_UNEXPECTED_RETURN=1');
throw new Error('page.waitForFunction returned without host cancellation');
