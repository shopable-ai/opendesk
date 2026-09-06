// Isolated pre-fix counterexample: the former Promise.race implementation did
// not clear its timeout when Promise.all completed early. The test explicitly
// clears its instrumentation before throwing so the execution itself is clean.

'use strict';

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const activeTimers = new Set();

globalThis.setTimeout = function(callback, milliseconds) {
  let id = null;
  id = originalSetTimeout(() => {
    activeTimers.delete(id);
    callback();
  }, milliseconds);
  activeTimers.add(id);
  return id;
};
globalThis.clearTimeout = function(id) {
  const result = originalClearTimeout(id);
  activeTimers.delete(id);
  return result;
};

function legacyWaitForAll(inputs, options) {
  return Promise.race([
    Promise.all(inputs),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout waiting for all promises')), options.timeout);
    }),
  ]);
}

let residualCount = 0;
try {
  const values = await legacyWaitForAll([Promise.resolve('ready')], { timeout: 30000 });
  if (values[0] !== 'ready') throw new Error('legacy control did not resolve its input');
  residualCount = activeTimers.size;
} finally {
  for (const id of Array.from(activeTimers)) originalClearTimeout(id);
  activeTimers.clear();
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}

if (residualCount > 0) console.log('PAGE_WAIT_OLD_CLEANUP_FAILURE_READY=1');
if (residualCount !== 0) {
  throw new Error('pre-fix waitForAll retained ' + residualCount + ' deadline timer after early success');
}
