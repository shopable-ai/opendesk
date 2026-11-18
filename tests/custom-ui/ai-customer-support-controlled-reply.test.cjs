// Pure controller tests; no desktop/runtime or knowledge-backend evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname,
  '../../examples/ai-customer-support/desktop/controlled-reply.js'), 'utf8');
const scope = {pid: 42, window: 'w1', customer: 'c1', account: 'host-fixture-1', knowledge: 'k1'};
const clone = v => JSON.parse(JSON.stringify(v));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function harness(overrides = {}) {
  let time = 0, next = 0;
  const timers = new Map(), proposals = [], sends = [], observations = [];
  const current = {scope: clone(scope), complete: true, contextId: 'conversation-1', draft: '', watermark: 1,
    messages: [{id: 'history', sequence: 1, role: 'customer', text: 'historical'}]};
  const clock = {now: () => time,
    setTimeout: (fn, ms) => { const id = ++next; timers.set(id, {fn, at: time + ms}); return id; },
    clearTimeout: id => timers.delete(id)};
  const options = {clock,
    observe: async args => { observations.push(args.purpose); return clone(current); },
    propose: async request => { proposals.push(request); return {text: 'approved reply', approved: true,
      approvalId: 'business-approval', coverage: 'full', knowledgeScope: 'k1', expiresAt: time + 5000}; },
    validateFresh: async () => ({trigger: true, context: true, emptyDraft: true, authorized: true, knowledgeApproved: true}),
    send: async args => {
      sends.push(args); const id = 'sent-' + sends.length;
      current.messages.push({id, sequence: ++current.watermark, role: 'agent', text: args.evidence.text});
      return {status: 'sent', messageId: id};
    },
  };
  Object.assign(options, overrides);
  const ctx = vm.createContext({}); vm.runInContext(source, ctx);
  const controller = ctx.OpenDeskSupportControlledReply.create(options);
  async function advance(ms) {
    const end = time + ms;
    while (true) {
      const entry = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      time = entry[1].at; timers.delete(entry[0]); entry[1].fn(); await settle();
    }
    time = end; await settle();
  }
  function message(role = 'customer', text = 'same text') {
    const sequence = ++current.watermark;
    current.messages.push({id: 'native-' + sequence, sequence, role, text});
    return controller.ingest(clone(current));
  }
  return {controller, current, options, proposals, sends, observations, advance, message};
}

test('disabled by default; baseline excludes history and delayed historical backfill', async () => {
  const h = harness(); assert.equal(h.controller.status().mode, 'disabled');
  h.message(); await h.advance(2000); assert.equal(h.proposals.length, 0);
  h.current.watermark = 10;
  await h.controller.enable(scope);
  h.current.messages.push({id: 'late-history', sequence: 9, role: 'customer', text: 'old'});
  assert.equal(h.controller.ingest(h.current), true);
  await h.advance(2000); assert.equal(h.proposals.length, 0);
});

test('stable IDs coalesce equal text, ignore repeated observation and never trigger on agent messages', async () => {
  const h = harness(); await h.controller.enable(scope);
  h.message('agent'); await h.advance(1000); assert.equal(h.proposals.length, 0);
  h.message(); await h.advance(400); h.controller.ingest(h.current); h.message();
  await h.advance(599); assert.equal(h.proposals.length, 0);
  await h.advance(1);
  assert.equal(h.proposals.length, 1); assert.equal(h.proposals[0].triggers.length, 2);
  assert.equal(h.sends.length, 1); assert.equal(h.controller.status().lastOutcome, 'confirmed');
  assert.deepEqual(h.observations, ['baseline', 'before-send', 'confirm-send']);
});

for (const action of ['pause', 'revoke', 'takeover']) {
  test(`${action} invalidates pending generation; resume/enable takes a new baseline`, async () => {
    const pending = deferred(), h = harness({propose: () => pending.promise});
    await h.controller.enable(scope); h.message(); await h.advance(600);
    h.controller[action](); h.message();
    pending.resolve({text: 'stale', approved: true}); await settle();
    assert.equal(h.sends.length, 0);
    await (action === 'revoke' ? h.controller.enable(scope) : h.controller.resume());
    await h.advance(2000); assert.equal(h.sends.length, 0);
    assert.equal(h.controller.status().requests, 1);
  });
}

test('hard two second debounce bound and eight-message immediate batch', async () => {
  const h = harness(); await h.controller.enable(scope);
  for (let i = 0; i < 5; i++) { h.message(); await h.advance(400); }
  assert.equal(h.proposals.length, 1); assert.equal(h.proposals[0].triggers.length, 5);
  const other = harness(); await other.controller.enable(scope);
  for (let i = 0; i < 8; i++) other.message();
  await other.advance(0); assert.equal(other.proposals[0].triggers.length, 8);
});

test('queue overflow pauses without invoking a callback', async () => {
  const h = harness(); await h.controller.enable(scope);
  for (let i = 0; i < 9; i++) h.message();
  await h.advance(2000); assert.equal(h.proposals.length, 0);
  assert.equal(h.controller.status().mode, 'paused');
});

test('one actual pending request even after timeout and re-enable', async () => {
  const pending = deferred(); let calls = 0;
  const h = harness({propose: () => { calls++; return pending.promise; }});
  await h.controller.enable(scope); h.message(); await h.advance(10600);
  assert.equal(h.controller.status().mode, 'paused'); assert.equal(h.controller.status().busy, true);
  await h.controller.enable(scope); h.message(); await h.advance(3000);
  assert.equal(calls, 1); assert.equal(h.sends.length, 0);
  pending.resolve(null); await settle();
  assert.equal(h.sends.length, 0);
});

for (const field of ['pid', 'window', 'customer', 'account', 'knowledge']) {
  test(`scope drift (${field}) prevents sending`, async () => {
    const h = harness(); await h.controller.enable(scope); h.message();
    h.current.scope[field] = field === 'pid' ? 43 : 'other';
    await h.advance(600); assert.equal(h.sends.length, 0);
  });
}

for (const mutation of [s => { s.draft = 'human typing'; }, s => { s.complete = false; },
  s => { s.contextId = 'different'; }, s => { s.messages[1].text = 'edited'; },
  s => { s.messages = s.messages.slice(0, 1); }]) {
  test('fresh incomplete/changed context or nonempty draft refuses send', async () => {
    const h = harness(); await h.controller.enable(scope); h.message(); mutation(h.current);
    await h.advance(600); assert.equal(h.sends.length, 0); assert.equal(h.controller.status().mode, 'paused');
  });
}

for (const field of ['trigger', 'context', 'emptyDraft', 'authorized', 'knowledgeApproved']) {
  test(`fresh business check ${field} must explicitly approve`, async () => {
    const h = harness({validateFresh: async () => ({trigger: true, context: true, emptyDraft: true,
      authorized: true, knowledgeApproved: true, [field]: 'unknown'})});
    await h.controller.enable(scope); h.message(); await h.advance(600); assert.equal(h.sends.length, 0);
  });
}

for (const patch of [{requiresHumanReview: true}, {approved: false}, {approvalId: ''}, {coverage: 'unknown'}, {coverage: 'conflict'},
  {expiresAt: 1}, {knowledgeScope: 'other'}, {approved: undefined, answerHash: 'a'.repeat(64)}]) {
  test(`unapproved or expired knowledge evidence refuses send: ${JSON.stringify(patch)}`, async () => {
    const h = harness({propose: async () => ({text: 'reply', approved: true, approvalId: 'a', coverage: 'full',
      knowledgeScope: 'k1', expiresAt: 5000, ...patch})});
    await h.controller.enable(scope); h.message(); await h.advance(600); assert.equal(h.sends.length, 0);
  });
}

test('new event while fresh authorization is pending cancels old context', async () => {
  const pending = deferred(), h = harness({validateFresh: () => pending.promise});
  await h.controller.enable(scope); h.message(); await h.advance(600); h.message();
  pending.resolve({trigger: true, context: true, emptyDraft: true, authorized: true, knowledgeApproved: true});
  await settle(); assert.equal(h.sends.length, 0);
});

for (const receipt of [{status: 'failed'}, {status: 'unknown'}, {status: 'sent', messageId: 'missing'}]) {
  test(`no retry after ${receipt.status}; draft clearing alone is not success`, async () => {
    let attempts = 0;
    const h = harness({send: async () => { attempts++; h.current.draft = ''; return receipt; }});
    await h.controller.enable(scope); h.message(); await h.advance(600); h.message(); await h.advance(30000);
    assert.equal(attempts, 1);
    assert.equal(h.controller.status().mode, receipt.status === 'failed' ? 'paused' : 'locked');
    if (receipt.status !== 'failed') { assert.equal(await h.controller.enable(scope), false); assert.equal(await h.controller.resume(), false); }
  });
}

test('send exception or timeout locks even if paused while send was pending', async () => {
  const pending = deferred(); let sends = 0;
  const h = harness({send: () => { sends++; return pending.promise; }});
  await h.controller.enable(scope); h.message(); await h.advance(600);
  h.controller.pause(); pending.resolve({status: 'unknown'}); await settle();
  assert.equal(h.controller.status().mode, 'locked'); assert.equal(sends, 1);
  const timeout = harness({send: () => new Promise(() => {})});
  await timeout.controller.enable(scope); timeout.message(); await timeout.advance(10600);
  assert.equal(timeout.controller.status().mode, 'locked');
});

test('agent confirmation needs a new ID, exact reply, role and sequence', async () => {
  for (const bad of [{id: 'history'}, {role: 'customer'}, {text: 'different'}, {sequence: 1}]) {
    const h = harness({send: async () => {
      h.current.messages.push({id: 'reply', role: 'agent', text: 'approved reply', sequence: ++h.current.watermark, ...bad});
      return {status: 'sent', messageId: bad.id || 'reply'};
    }});
    await h.controller.enable(scope); h.message(); await h.advance(600);
    assert.equal(h.controller.status().mode, 'locked');
  }
});

test('ID edits, reused sequence, stale observations and oversized snapshots fail closed', async () => {
  for (const mutate of [s => { s.messages[0].text = 'edited'; },
    s => { s.messages = [{id: 'different-id', sequence: 1, role: 'customer', text: 'x'}]; },
    s => { s.watermark = 0; s.messages = []; },
    s => { s.messages = Array(257).fill(s.messages[0]); }]) {
    const h = harness(); await h.controller.enable(scope); mutate(h.current);
    assert.equal(h.controller.ingest(h.current), false); assert.equal(h.controller.status().mode, 'paused');
  }
});

test('six requests per minute and twenty per controller lifetime', async () => {
  const h = harness(); await h.controller.enable(scope);
  for (let i = 0; i < 7; i++) { h.message(); await h.advance(600); }
  assert.equal(h.proposals.length, 6); assert.equal(h.controller.status().reason, 'request-limit');
  const total = harness(); await total.controller.enable(scope);
  for (let i = 0; i < 21; i++) {
    total.message(); await total.advance(60000);
  }
  assert.equal(total.proposals.length, 20); assert.equal(total.controller.status().reason, 'request-limit');
});


test('paused in-flight send still times out and cannot later overwrite unknown', async () => {
  const pending = deferred(), h = harness({send: () => pending.promise});
  await h.controller.enable(scope); h.message(); await h.advance(600);
  h.controller.pause(); await h.advance(10000);
  assert.equal(h.controller.status().mode, 'locked');
  pending.resolve({status: 'failed'}); await settle();
  assert.equal(h.controller.status().lastOutcome, 'unknown');
  assert.equal(await h.controller.enable(scope), false);
});

test('revocation during final business validation prevents input', async () => {
  const pending = deferred(), h = harness({validateFresh: () => pending.promise});
  await h.controller.enable(scope); h.message(); await h.advance(600);
  h.controller.revoke();
  pending.resolve({trigger: true, context: true, emptyDraft: true, authorized: true, knowledgeApproved: true});
  await settle(); assert.equal(h.sends.length, 0);
});

test('knowledge expiring during final validation prevents input', async () => {
  const pending = deferred(), h = harness({validateFresh: () => pending.promise});
  await h.controller.enable(scope); h.message(); await h.advance(600); await h.advance(5000);
  pending.resolve({trigger: true, context: true, emptyDraft: true, authorized: true, knowledgeApproved: true});
  await settle(); assert.equal(h.sends.length, 0);
});

test('new independent customer event after resume can send, old generation cannot', async () => {
  const pending = deferred(); let count = 0;
  const h = harness({propose: async () => {
    count++;
    if (count === 1) return pending.promise;
    return {text: 'new reply', approved: true, approvalId: 'new', coverage: 'full', knowledgeScope: 'k1', expiresAt: 10000};
  }});
  await h.controller.enable(scope); h.message(); await h.advance(600);
  h.controller.pause(); h.message(); await h.controller.resume();
  pending.resolve(null); await settle(); await h.advance(600);
  assert.equal(count, 1);
  h.message(); await h.advance(600);
  assert.equal(h.sends.length, 1); assert.equal(h.sends[0].request.triggers.length, 1);
  assert.equal(h.sends[0].request.triggers[0].id, 'native-4');
});

test('send callback exception and independent confirmation failure both lock', async () => {
  for (const failure of ['send', 'confirm']) {
    const h = harness({
      observe: async args => {
        if (failure === 'confirm' && args.purpose === 'confirm-send') throw Error('unavailable');
        return clone(h.current);
      },
      send: async () => {
        if (failure === 'send') throw Error('transport');
        return {status: 'sent', messageId: 'not-observable'};
      },
    });
    await h.controller.enable(scope); h.message(); await h.advance(600);
    assert.equal(h.controller.status().mode, 'locked');
  }
});
