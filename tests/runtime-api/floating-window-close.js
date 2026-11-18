// Public lifecycle assertions run in the production execution.Run Runner.
// The existing private result sink only releases the driver gate / records
// checkpoints. Independent native call/state snapshots come from MemoryDriver.
'use strict';
const input = Execution.input;
function check(condition, message) { if (!condition) throw new Error(message); }
function signal(phase) { __opendeskInspectorResult(JSON.stringify({phase})); }
function oracle() { return JSON.parse(File.read(input.oracle)); }
async function waitFor(call) {
  const until = Date.now() + 1500;
  while (!oracle().calls.includes(call)) {
    if (Date.now() > until) throw new Error('driver did not reach ' + call);
    await delay(2);
  }
}
function observe(promise) {
  return promise.then(value => ({ok: true, value}), error => ({ok: false, code: error.code, message: error.message}));
}
async function bounded(promise, label) {
  let timer;
  try {
    const outcome = await Promise.race([promise, new Promise(resolve => {
      timer = setTimeout(() => resolve({timedOut: true}), 5000);
    })]);
    check(!outcome.timedOut, label + ' did not return within 5 seconds');
    return outcome;
  } finally { clearTimeout(timer); }
}
function assertClosed() {
  const native = oracle();
  check(!native.exists || native.state.status === 'closed' && native.state.visible === false && native.state.onScreen === false,
    'close returned before native window was closed');
  check(native.resources.Sinks === 0, 'close returned with a native event sink');
  const closed = native.calls.indexOf('js:close-returned');
  check(closed >= 0 && !native.calls.slice(closed + 1).includes('show:entered'), 'native Show occurred after close returned');
}

const toolbar = new FloatingWindow({id: 'probe'});
toolbar.addLabel('status', 'Ready');
let failure;
let showOutcome;
let cleanupMillis;
try {
  const caps = ui.getCapabilities();
  check(caps.enabled && caps.driver === 'memory', 'test did not bind the controlled MemoryDriver');
  if (input.scenario === 'close-all') {
    await toolbar.show();
    check(await ui.closeAll() === undefined, 'ui.closeAll must resolve undefined');
    check(await ui.closeAll() === undefined, 'repeated ui.closeAll must resolve undefined');
    signal('close-returned');
    assertClosed();
  } else if (input.scenario === 'normal' || input.scenario === 'create-failure-retry') {
    if (input.scenario === 'create-failure-retry') {
      check(!(await observe(toolbar.show())).ok, 'controlled create failure was not rejected');
    }
    check((await toolbar.show()).visible === true, 'ordinary show failed');
    check((await toolbar.hide()).visible === false, 'ordinary hide failed');
    check((await toolbar.show()).visible === true, 'ordinary re-show failed');
    const waited = toolbar.waitUntilClosed();
    const close = await toolbar.close();
    check(close.status === 'closed', 'ordinary close state');
    signal('close-returned');
    check((await waited).status === 'closed', 'waitUntilClosed did not settle');
    check((await toolbar.close()).status === 'closed', 'repeated close not idempotent');
    assertClosed();
  } else {
    const cleanupTimeout = input.scenario.startsWith('cleanup-');
    const showing = observe(toolbar.show());
    if (input.scenario !== 'immediate') {
      await waitFor(input.scenario.startsWith('cleanup-state-') ? 'state:waiting' :
        input.scenario === 'show-late' || input.scenario.startsWith('cleanup-show-') ? 'show:entered' : 'create:entered');
    }
    let settled = false;
    const closing = observe(toolbar.close()).then(result => { settled = true; return result; });
    // A second close must join the same creation, not report success early.
    const secondClose = input.scenario === 'create-late' ? observe(toolbar.close()) : null;
    signal('close-issued');
    try {
      if (input.scenario === 'create-cancel') {
        await waitFor('create:canceled');
      } else if (input.scenario !== 'immediate') {
        await delay(40);
        check(!settled, 'close resolved while native create/show was still gated');
      }
    } finally { signal('release'); }
    const cleanupStarted = Date.now();
    const closed = cleanupTimeout ? await bounded(closing, 'cleanup and explicit close') : await closing;
    if (cleanupTimeout) {
      cleanupMillis = Date.now() - cleanupStarted;
      check(oracle().calls.includes('close:deadline') && oracle().calls.includes('close:timeout'), 'cleanup did not expire its independent deadline');
      check(oracle().cleanupWaitMillis >= 2000, 'cleanup reused the already canceled creation context');
    }
    if (input.scenario === 'late-close-retry' || input.scenario === 'cleanup-create-timeout' || input.scenario === 'cleanup-state-retry' ||
        input.scenario === 'cleanup-state-teardown') {
      check(!closed.ok, 'native close failure was reported as success');
      if (cleanupTimeout) check(oracle().state.status !== 'closed' && oracle().resources.Sinks === 1, 'failed close claimed native cleanup success');
      if (input.scenario !== 'cleanup-state-teardown') {
        check((await toolbar.close()).status === 'closed', 'failed late close could not be retried');
      }
    } else { check(closed.ok, 'close rejected: ' + JSON.stringify(closed)); }
    if (secondClose) check((await secondClose).ok, 'concurrent close failed');
    signal('close-returned');
    showOutcome = cleanupTimeout ? await bounded(showing, 'canceled show') : await showing;
    if (cleanupTimeout) {
      check(/cleanup failed/.test(showOutcome.message) && /deadline exceeded/.test(showOutcome.message),
        'show rejection lost cleanup failure: ' + JSON.stringify(showOutcome));
      const cause = input.scenario === 'cleanup-show-error-timeout' ? 'controlled late Show failure' :
        input.scenario.startsWith('cleanup-state-') ? 'context canceled' : 'creation was canceled';
      check(showOutcome.message.includes(cause), 'show rejection lost original cause: ' + showOutcome.message);
      check(showOutcome.code === (input.scenario.startsWith('cleanup-state-') || input.scenario === 'cleanup-show-error-timeout' ?
        'UI_DRIVER_FAILURE' : 'UI_CANCELED'), 'show rejection changed primary error code');
    }
    if (input.scenario !== 'immediate') check(!showOutcome.ok, 'canceled in-flight show resolved successfully');
    if (input.scenario === 'create-late' || input.scenario === 'create-cancel' || input.scenario === 'late-close-retry' || input.scenario === 'cleanup-create-timeout') {
      check(!oracle().calls.includes('show:entered'), 'canceled create still reached native Show');
    }
    await delay(10);
    if (input.scenario === 'cleanup-state-teardown') {
      check(oracle().resources.Sinks === 1 && oracle().state.status !== 'closed', 'teardown fixture did not retain the resource');
    } else { assertClosed(); }
  }
  const afterClose = await observe(Promise.resolve().then(() => toolbar.show()));
  check(!afterClose.ok && afterClose.code === 'INVALID_STATE', 'terminal toolbar could be shown again');
} catch (error) {
  failure = String(error && error.stack || error);
} finally {
  signal('release');
  // Preserve the failure snapshot before teardown can hide a leaked resource.
  File.write(File.join(Execution.artifactDir, 'result.json'), JSON.stringify({scenario: input.scenario,
    passed: !failure, failure, showOutcome, cleanupMillis, oracle: oracle()}, null, 2));
}
if (failure) throw new Error(failure);
console.log('[FLOATING-LIFECYCLE PASS] ' + input.scenario);
