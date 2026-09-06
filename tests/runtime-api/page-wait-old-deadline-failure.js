// Isolated pre-fix counterexample: the former polling algorithm checked its
// timeout only before invoking the predicate. A predicate Promise that never
// settles could therefore disable the configured timeout entirely. This file
// never replaces the production Page implementation.

'use strict';

function legacyWaitForFunction(predicate, options) {
  const timeout = options.timeout;
  const polling = options.polling;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    async function check() {
      if (Date.now() - started >= timeout) {
        reject(new Error('Timeout waiting for function'));
        return;
      }
      try {
        const value = await predicate();
        if (value) resolve(value);
        else setTimeout(check, polling);
      } catch (_) {
        setTimeout(check, polling);
      }
    }
    check();
  });
}

let outcome = { kind: 'pending' };
legacyWaitForFunction(() => new Promise(() => {}), { timeout: 10, polling: 1 }).then(
  (value) => { outcome = { kind: 'resolved', value }; },
  (error) => { outcome = { kind: 'rejected', error }; },
);

// An observation timer is not the expected API timeout. It only gives the
// legacy algorithm enough time to demonstrate that its own deadline is inert,
// then expires and leaves no competing work behind.
await new Promise((resolve) => setTimeout(resolve, 40));
if (outcome.kind === 'pending') console.log('PAGE_WAIT_OLD_DEADLINE_FAILURE_READY=1');
if (outcome.kind !== 'rejected' || !String(outcome.error && outcome.error.message || outcome.error).includes('Timeout')) {
  throw new Error('pre-fix wait remained pending after its own deadline: ' + JSON.stringify(outcome));
}
