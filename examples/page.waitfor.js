'use strict';

// Run from the repository root:
// ./dist/opendesk -script examples/page.waitfor.js -console-mode script
const checks = [];

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

async function check(name, run) {
  await run();
  checks.push(name);
  console.log('[PAGE-WAIT-QUICKSTART PASS] ' + name);
}

for (const method of ['waitFor', 'waitForTimeout', 'waitForFunction', 'waitForAll']) {
  assert(page && typeof page[method] === 'function', 'missing page.' + method);
}

await check('fixed wait is asynchronous', async () => {
  let synchronous = true;
  let observed = null;
  const wait = page.waitFor(0).then(() => { observed = synchronous; });
  synchronous = false;
  await wait;
  assert(observed === false, 'page.waitFor(0) completed synchronously');
});

await check('condition wait retries false values', async () => {
  let attempts = 0;
  const value = await page.waitFor(() => {
    attempts += 1;
    return attempts === 3 ? 'ready' : false;
  }, { timeout: 1000, polling: 5 });
  assert(value === 'ready' && attempts === 3, 'condition result or attempt count changed');
});

await check('async condition preserves one in-flight call', async () => {
  let calls = 0;
  let inFlight = 0;
  let maximum = 0;
  const value = await page.waitForFunction(() => {
    calls += 1;
    inFlight += 1;
    maximum = Math.max(maximum, inFlight);
    return page.waitForTimeout(5).then(() => {
      inFlight -= 1;
      return calls === 2 ? { ready: true } : false;
    });
  }, { timeout: 1000, polling: 5 });
  assert(value && value.ready === true, 'async condition value was not preserved');
  assert(maximum === 1, 'async condition calls overlapped');
});

await check('AbortSignal cancels only this wait', async () => {
  const controller = new AbortController();
  const wait = page.waitForTimeout(30000, { signal: controller.signal });
  controller.abort('quickstart cancellation');
  let error = null;
  try {
    await wait;
  } catch (caught) {
    error = caught;
  }
  assert(error && error.name === 'AbortError' && error.code === 'CANCELED', 'unexpected cancellation error');
});

await check('waitForAll preserves values and order', async () => {
  const marker = { id: 'marker' };
  const result = await page.waitForAll([
    page.waitForTimeout(2).then(() => 'first'),
    'second',
    marker,
  ], { timeout: 1000 });
  assert(result[0] === 'first' && result[1] === 'second' && result[2] === marker, 'waitForAll changed order or identity');
});

console.log('[PAGE-WAIT-QUICKSTART RESULT] ' + JSON.stringify({
  runId: Execution.id,
  required: checks.length,
  executed: checks.length,
  passed: checks.length,
  failed: 0,
  skipped: 0,
  checks,
}));
