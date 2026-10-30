// Host-only VM regressions: no model, network or desktop calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, 'examples/ai-customer-support', name), 'utf8');
const host = read('native-demo.js');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};
function snapshot(customer = 't1', message = 1) {
  const id = `${customer}-m${message}`;
  return {complete: true, truncated: false, backend: 'mock', requestId: 'mock-only', root: {children: [
    {identifier: 'support.session', value: `${customer} · ${customer === 't1' ? '林女士' : '陈先生'}`},
    {identifier: `support.draft.${customer}`, value: ''},
    {identifier: `support.message.${id}.customer`, value: `客户 · ${id}\n退款进度？`},
  ]}};
}
function harness() {
  const calls = [], results = [], events = new Map();
  const target = {pid: 42, exePath: '/mock/support-chat'};
  const win = {...target, handle: 80, isForeground: true};
  let live = win, tree = snapshot(), snapshots = 0;
  const h = {calls, results, win, readHook: null, windowHook: null, freshHook: null, httpHook: null,
    findHook:null,valueHook:null,writeHook:null,actionHook:null,valueReads:0,actions:[],observations:[]};
  const ctx = vm.createContext({target,evidence:'/mock/evidence', log() {},
    panel: {on: (name, handler) => {events.set(name, handler); return () => {};},
      postMessage: async result => results.push(result)},
    freshTarget: async () => h.freshHook ? h.freshHook() : live,
    sameWindow: w => w.pid === win.pid && w.exePath === win.exePath && w.handle === win.handle,
    window: {getAppWindow: async () => h.windowHook ? h.windowHook() : live},
    exactSnapshot: async () => {
      const captured = tree;
      snapshots++;
      if (h.readHook) await h.readHook(snapshots);
      return captured;
    },
    http: {post: async (url, payload, options) => {
      calls.push({url, payload, options});
      if (h.httpHook) await h.httpHook();
      return {status: 200, data: {code: 0, message: 'ok', data: {
        request_id: payload.request_id, product_slug: payload.product_slug,
        delivery_mode_applied: 'draft', delivery_status: 'draft_only', direct_reply_allowed: false,
        selected_answer_strategy: 'context_http', review_answer: '请人工核实退款进度。',
        coverage_status: 'full', coverage: {status: 'full', locked_hits: [
          {knowledge_id: 'synthetic-faq', answer_hash: 'a'.repeat(64)}]},
        model_call_counts: {total_provider_requests: 1}, model_provider: 'openai-compatible',
      }}};
    }},
    Accessibility:{
      find:async()=>{if(h.findHook)await h.findHook();return {id:'draft'};},
      read:async()=>{h.valueReads++;if(h.valueHook)await h.valueHook();return {properties:{identifier:'support.draft.t1',value:tree.root.children.find(n=>n.identifier==='support.draft.t1').value}};},
      perform:async(ref,action)=>{h.actions.push(action);return h.actionHook?h.actionHook(action):{actionState:'unknown'};},
      release:async()=>{},
    },
    File:{join:(...parts)=>parts.join('/'),writeJSON:async()=>{if(h.writeHook)await h.writeHook();}},
    publish: async value => h.observations.push(value), observe: async () => {},
  });
  vm.runInContext(read('desktop/native-adapter.js'), ctx);
  vm.runInContext(read('desktop/query-api-adapter.js'), ctx);
  ctx.adapter = ctx.OpenDeskSupportNative.create(target);
  ctx.adapter.accept(win, tree);
  ctx.queryConfig = ctx.OpenDeskSupportQueryAPI.config({port: 12345, projectId: 'support', modelProvider: 'http'});
  ctx.invalidate = async reason => ctx.adapter.invalidate(reason);
  vm.runInContext(host.slice(host.indexOf('let bound='), host.indexOf('\nconst log=')), ctx);
  vm.runInContext(host.slice(host.indexOf('async function observe('),host.indexOf('async function receipt(')),ctx);
  ctx.realObserve=ctx.observe;ctx.observe=async()=>{};
  vm.runInContext(host.slice(host.indexOf('async function receipt('), host.indexOf('// AI requests read')),ctx);
  vm.runInContext(host.slice(host.indexOf('async function askAI('), host.indexOf('\nconst subscription=')), ctx);
  h.ctx = ctx;
  h.request = {type: 'support.aiQuery', requestId: 'query-1', binding: {...ctx.adapter.current.binding}};
  h.ask = (request = h.request) => ctx.askAI(request);
  h.settings = value => events.get('message')({value: {type: 'support.settings', ...value}});
  h.cancel = () => events.get('message')({value:{type:'support.aiCancel'}});
  h.fill = () => events.get('message')({value:{type:'support.fillDraft',requestId:'fill-1',binding:h.request.binding,text:'人工审核稿',expectedDraft:''}});
  h.observe = () => ctx.realObserve('test');
  h.draft = text => {tree.root.children.find(n=>n.identifier==='support.draft.t1').value=text;};
  h.snapshotCount = () => snapshots;
  h.close = () => events.get('close')();
  h.set = code => vm.runInContext(code, ctx);
  h.live = value => {live = value;};
  h.currentWindow = () => live;
  h.change = (customer, message = 1, accept = true) => {
    tree = snapshot(customer, message);
    if (accept) ctx.adapter.accept(win, tree);
  };
  h.idle = () => vm.runInContext('queue', ctx);
  return h;
}

for(const stage of ['queued','fresh','find','read'])test(`fill ${stage}: cancellation starts no further protected operation`,async()=>{
 const h=harness(),entered=deferred(),release=deferred();
 if(stage==='queued'){h.ctx.blocked=release.promise;h.set('queue=blocked');}
 if(stage==='fresh')h.freshHook=async()=>{entered.resolve();await release.promise;return h.win;};
 if(stage==='find')h.findHook=async()=>{entered.resolve();await release.promise;};
 if(stage==='read')h.valueHook=async()=>{entered.resolve();await release.promise;};
 h.fill();if(stage!=='queued')await entered.promise;
 const count=h.snapshotCount();h.cancel();release.resolve();await h.idle();
 assert.equal(h.snapshotCount(),count);assert.equal(h.actions.length,0);
});

test('manual chat draft entered during the last window lookup is preserved',async()=>{
 const h=harness();h.windowHook=async()=>{h.draft('人工刚输入的草稿');return h.win;};
 h.fill();await h.idle();assert.equal(h.actions.length,0);
});
for(const front of [null,{isForeground:false},{handle:81}])test(`fill rejects invalid final foreground before another protected read: ${JSON.stringify(front)}`,async()=>{
 const h=harness();h.windowHook=async()=>front&&({...h.win,...front});
 h.fill();await h.idle();
 assert.equal(h.snapshotCount(),1);assert.equal(h.valueReads,1);assert.equal(h.actions.length,0);
});
test('fill refuses an initially background window without reading its tree',async()=>{
 const h=harness();h.live({...h.win,isForeground:false});h.fill();await h.idle();
 assert.equal(h.snapshotCount(),0);assert.equal(h.valueReads,0);assert.equal(h.actions.length,0);
});
for(const reason of ['manual edit','paused'])test(`fill write pending: ${reason} cannot publish observing or verified`,async()=>{
 const h=harness(),entered=deferred(),release=deferred();
 h.actionHook=async action=>{h.draft(action.value);return {actionState:'acknowledged'};};
 h.writeHook=async()=>{entered.resolve();await release.promise;};
 h.fill();await entered.promise;
 if(reason==='manual edit')h.cancel();else h.settings({paused:true});
 release.resolve();await h.idle();
 assert.equal(h.observations.filter(x=>x.observing).length,0);
 assert.equal(h.results.filter(x=>x.status==='verified').length,0);
 assert.equal(h.actions.length,1,'the completed action must never be replayed');
});
for(const stage of ['window','write'])test(`observe ${stage}: invalidation prevents publishing old observing authority`,async()=>{
 const h=harness(),entered=deferred(),release=deferred();
 h.set('follow=false;ready=true;visible=true');h.change('t1',2,false);
 const hook=async()=>{entered.resolve();await release.promise;return h.win;};
 if(stage==='window')h.windowHook=hook;else h.writeHook=hook;
 const work=h.observe();await entered.promise;
 h.set('authorizationGeneration++');h.ctx.adapter.revoke();release.resolve();await work;
 assert.equal(h.observations.filter(x=>x.observing).length,0);
});
const changes = {
  'manual edit': h => h.cancel(),
  closed: h => h.close(),
  revoked: h => h.settings({permission: false}),
  paused: h => h.settings({paused: true}),
  'pause-resume before queued invalidation': h => {h.settings({paused: true}); h.settings({paused: false});},
  'binding invalidated': h => h.ctx.adapter.invalidate('mock disconnect'),
  'customer changed': h => h.change('t2'),
  'new message': h => h.change('t1', 2),
  'foreground lost': h => h.live({...h.win, isForeground: false}),
  'window replaced': h => h.live({...h.win, handle: 81}),
  'process replaced': h => h.live({...h.win, pid: 43}),
  'executable replaced': h => h.live({...h.win, exePath: '/mock/other'}),
  disconnected: h => h.live(null),
};
for (const [name, change] of Object.entries(changes)) {
  test(`AX pending: ${name} prevents customer text dispatch`, async () => {
    const h = harness(), entered = deferred(), release = deferred();
    h.readHook = async n => {if (n === 1) {entered.resolve(); await release.promise;}};
    const work = h.ask();
    await entered.promise;
    change(h);
    release.resolve();
    await work;
    assert.equal(h.calls.length, 0, 'customer text must not reach HTTP');
    assert.equal(h.results.length, 0);
  });
  test(`HTTP pending: ${name} prevents stale result publication`, async () => {
    const h = harness(), entered = deferred(), release = deferred();
    h.httpHook = async () => {entered.resolve(); await release.promise;};
    const work = h.ask();
    await entered.promise;
    change(h);
    release.resolve();
    await work;
    assert.equal(h.calls.length, 1);
    assert.equal(h.results.length, 0);
    assert.equal(h.set('aiInflight.size'), 0);
  });
}
for (const flag of ['closed', 'revoked', 'paused']) {
  test(`result AX pending: ${flag} is rechecked after asynchronous reads`, async () => {
    const h = harness(), entered = deferred(), release = deferred();
    h.readHook = async n => {if (n === 2) {entered.resolve(); await release.promise;}};
    const work = h.ask();
    await entered.promise;
    // Exercise the flag check independently of adapter generation invalidation.
    h.set(`${flag}=true`);
    release.resolve();
    await work;
    assert.equal(h.calls.length, 1);
    assert.equal(h.results.length, 0);
  });
}
for (const [name, change] of Object.entries(changes)) {
  test(`dispatch window lookup pending: ${name} prevents HTTP`, async () => {
    const h = harness(), entered = deferred(), release = deferred();
    let lookups = 0;
    h.windowHook = async () => {
      if (++lookups === 2) {entered.resolve(); await release.promise;}
      return h.currentWindow();
    };
    const work = h.ask();
    await entered.promise;
    change(h);
    // Window changes are returned by the pending independent lookup.
    h.windowHook = null;
    release.resolve();
    await work;
    assert.equal(h.calls.length, 0);
    assert.equal(h.results.length, 0);
  });
}
for (const [customer, message] of [['t2', 1], ['t1', 2]]) {
  test(`HTTP pending: fresh AX detects ${customer}/${message} before adapter observation catches up`, async () => {
    const h = harness(), entered = deferred(), release = deferred();
    h.httpHook = async () => {entered.resolve(); await release.promise;};
    const work = h.ask();
    await entered.promise;
    h.change(customer, message, false);
    release.resolve();
    await work;
    assert.equal(h.calls.length, 1);
    assert.equal(h.results.length, 0);
  });
}
test('permission changes during the final window lookup prevent dispatch', async () => {
  const h = harness();
  h.windowHook = async () => {h.settings({paused: true}); h.settings({paused: false}); return h.win;};
  await h.ask();
  assert.equal(h.calls.length, 0);
});
test('duplicate requests during and after HTTP cannot dispatch twice', async () => {
  const h = harness(), entered = deferred(), release = deferred();
  h.httpHook = async () => {entered.resolve(); await release.promise;};
  const work = h.ask();
  await entered.promise;
  await h.ask();
  release.resolve();
  await work;
  await h.ask();
  assert.equal(h.calls.length, 1);
  assert.equal(h.results.length, 1);
  assert.equal(h.results[0].requestId, h.request.requestId);
  assert.equal(h.results[0].status, 'ready');
  assert.equal(h.calls[0].payload.query, '退款进度？');
  assert.equal(h.set('aiInflight.size'), 0);
});
test('HTTP disconnect produces a current bound error without retry', async () => {
  const h = harness();
  h.httpHook = async () => {throw Error('mock connection closed');};
  await h.ask();
  assert.equal(h.calls.length, 1);
  assert.equal(h.results.length, 1);
  assert.equal(h.results[0].errorCode, 'QUERY_UNAVAILABLE');
  assert.equal(h.set('aiInflight.size'), 0);
});

test('manual cancel after HTTP starts no further protected AX read and cannot revive', async () => {
 const h=harness(),entered=deferred(),release=deferred();
 h.httpHook=async()=>{entered.resolve();await release.promise;};
 const work=h.ask();await entered.promise;const count=h.snapshotCount();
 h.cancel();release.resolve();await work;
 assert.equal(h.snapshotCount(),count);assert.equal(h.results.length,0);
 await h.ask();assert.equal(h.calls.length,1);
});

test('manual cancel before queued AI work prevents the first protected read', async () => {
 const h=harness(),release=deferred();
 h.ctx.blocked=release.promise;h.set('queue=blocked');
 const work=h.ask();h.cancel();release.resolve();await work;
 assert.equal(h.snapshotCount(),0);assert.equal(h.calls.length,0);
});
for(const phase of [1,2])for(const reason of ['manual edit','revoked','paused','pause-resume before queued invalidation']){
 test(`fresh target lookup ${phase}: ${reason} prevents the next protected read`,async()=>{
  const h=harness(),entered=deferred(),release=deferred();let lookups=0;
  h.freshHook=async()=>{if(++lookups===phase){entered.resolve();await release.promise;}return h.currentWindow();};
  const work=h.ask();await entered.promise;const count=h.snapshotCount();
  changes[reason](h);release.resolve();await work;
  assert.equal(h.snapshotCount(),count);assert.equal(h.calls.length,phase-1);assert.equal(h.results.length,0);
 });
}
