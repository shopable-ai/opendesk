// Full production execution.Runner, existing synthetic backend/result seams.
// No native event source or desktop action. Private controls are not public API.
const report = { kind: "result", source: "synthetic", writes: 10 };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const seen = [], immediate = [];
let release, active = 0, maxActive = 0;
let slow, fast, reused;
async function emit(count, expectedFastCount) {
  __opendeskInspectorResult(JSON.stringify({ kind: "emit", count }));
  const deadline = Date.now() + 1000;
  while (immediate.length < expectedFastCount && Date.now() < deadline) await delay(1);
  assert(immediate.length === expectedFastCount, "synthetic dispatch fence timed out");
}
try {
  slow = Events.on("display.changed", async event => {
    active++;
    maxActive = Math.max(maxActive, active);
    seen.push(event);
    if (seen.length === 1) await new Promise(resolve => { release = resolve; });
    active--;
  });
  fast = Events.on("display.changed", event => { immediate.push(event); });
  await emit(1, 1);
  await emit(2, 2);
  await emit(3, 3);
  await emit(4, 4);
  assert(seen.length === 1 && active === 1, "callback did not remain single-flight");
  release();
  const deadline = Date.now() + 1000;
  while ((seen.length < 2 || active) && Date.now() < deadline) await delay(1);
  report.slow = seen.map(e => ({ ordinal: e.data.ordinal, coalesced: e.coalesced, sequence: e.sequence }));
  report.fast = immediate.map(e => ({ ordinal: e.data.ordinal, coalesced: e.coalesced, sequence: e.sequence }));
  report.maxActive = maxActive;
  assert(seen.length === 2 && maxActive === 1 && active === 0, "deferred callback delivery/concurrency changed");
  assert(immediate.length === 4 && immediate.map(e => e.data.ordinal).join(",") === "1,3,6,10", "known event batches were not independently dispatched");
  assert(immediate.map(e => e.coalesced).join(",") === "0,1,2,3", "queue coalescing lost source events");
  assert(seen[0].data.ordinal === 1 && seen[0].coalesced === 0, "first event changed");
  assert(seen[1].data.ordinal === 10 && seen[1].coalesced === 8, "deferred coalesced undercount: expected 8, got " + seen[1].coalesced);
  assert(seen.reduce((total, event) => total + 1 + event.coalesced, 0) === 10, "slow subscriber lost known writes");
  assert(immediate.reduce((total, event) => total + 1 + event.coalesced, 0) === 10, "fast subscriber lost known writes");
  slow.unsubscribe(); slow.unsubscribe(); fast.unsubscribe();
  __opendeskInspectorResult(JSON.stringify({ kind: "checkpoint" }));
  let next;
  reused = Events.on("display.changed", event => { next = event; });
  __opendeskInspectorResult(JSON.stringify({ kind: "emit", count: 1 }));
  const reusedDeadline = Date.now() + 1000;
  while (!next && Date.now() < reusedDeadline) await delay(1);
  assert(next && next.data.ordinal === 11 && next.coalesced === 0, "new subscription inherited old deferred state");
  reused.unsubscribe();
  __opendeskInspectorResult(JSON.stringify({ kind: "checkpoint" }));
  report.reused = { ordinal: next.data.ordinal, coalesced: next.coalesced };
  const timeoutCode = promise => promise.then(() => 'resolved', error => error.code);
  const tinyTimeout = timeoutCode(Events.once('display.changed', {timeout: 0.0000001}));
  assert(await Promise.race([tinyTimeout, delay(100).then(() => 'fixture timed out')]) === 'TIMEOUT',
    "sub-nanosecond positive timeout did not expire");
  __opendeskInspectorResult(JSON.stringify({kind: "checkpoint"}));

  // Queue a synthetic event first, then keep the event loop occupied past the
  // subscription deadline. Timer callback order must not permit late success.
  const late = timeoutCode(Events.once('display.changed', {timeout: 15}));
  __opendeskInspectorResult(JSON.stringify({kind: "emit", count: 1}));
  const until = Date.now() + 30;
  while (Date.now() < until) { /* keep the loop occupied across the deadline */ }
  assert(await late === 'TIMEOUT', "queued event was accepted after its deadline");
  __opendeskInspectorResult(JSON.stringify({kind: "checkpoint"}));

  const timely = Events.once('display.changed', {timeout: 1000});
  __opendeskInspectorResult(JSON.stringify({kind: "emit", count: 1}));
  assert((await timely).data.ordinal === 13, "timely subscription failed after timeout cleanup");
  __opendeskInspectorResult(JSON.stringify({kind: "checkpoint"}));
  report.onceDeadline = {tiny: "TIMEOUT", queuedLate: "TIMEOUT", reused: true};

} finally {
  if (slow) slow.unsubscribe();
  if (fast) fast.unsubscribe();
  if (reused) reused.unsubscribe();
}
__opendeskInspectorResult(JSON.stringify(report));
