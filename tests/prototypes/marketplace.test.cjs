'use strict';
// Run from the repository root: node --test tests/prototypes/marketplace.test.cjs
// Exercises only the embedded demo model, never the OpenDesk Runtime.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../../apps/opendesk/prototypes/marketplace/index.html'), 'utf8');
const script = html.match(/<script id="marketplace-model">([\s\S]*?)<\/script>/);
assert.ok(script, 'embedded model must be present');
const context = vm.createContext({});
vm.runInContext(script[1], context, {timeout: 1000});
const {create, KEY} = context.MarketplaceDemo;
const ID = 'demo-file-organizer';
const PAID = 'demo-daily-report';
function storage() { const map = new Map(); return {map, getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k)}; }
function fresh() { const store = storage(); return {m: create(store), store}; }
function pending(m, id = ID, env = {}) { const {token} = m.request(id, env); m.accept(token); return token; }
function verified(m, id = ID, env = {}) { const t = pending(m,id,env); m.begin(t,true); assert.equal(m.verified(t),true); return t; }
function installed(m, id = ID) { const t = verified(m,id); m.commit(t); m.cancel(); }
const json = x => JSON.stringify(x);

test('catalog and combined filters return only matching fixture entries',()=>{const {m}=fresh();assert.equal(m.catalog.length,6);assert.equal(m.filtered('日报','办公效率','Windows','paid').length,1);assert.equal(m.filtered('不存在').length,0);assert.equal(m.filtered('','桌面工具','Windows').length,1);});
test('search is literal, trimmed, and cannot become markup',()=>{const {m}=fresh();assert.equal(m.filtered('  文件自动整理  ').length,1);assert.equal(m.filtered('<img src=x onerror=alert(1)>').length,0);assert.match(html,/value="'\+esc\(state.q\)/);});
test('verified publisher does not create local trust',()=>{const {m}=fresh();assert.equal(m.find(ID).verified,true);const t=pending(m);assert.equal(Object.keys(m.state.trust).length,0);m.begin(t,true);m.verified(t);assert.equal(Object.keys(m.state.trust).length,0);});
test('only identifier values appear in the illustrative intent',()=>{const {m}=fresh();const a=m.request(ID);const url=new URL(m.intent(a.token));assert.equal(url.protocol,'opendesk:');assert.deepEqual([...url.searchParams.keys()],['release','intent']);assert.equal(url.hash,'');assert.doesNotMatch(url.href,/token=|path=|artifactUrl=/);});
test('unknown Flow and a second concurrent request are rejected',()=>{const {m}=fresh();assert.throws(()=>m.request('unknown'));m.request(ID);assert.throws(()=>m.request(PAID),/当前安装/);});
test('purchase is not installation and cancel does not revoke a separate entitlement',()=>{const {m}=fresh();const t=pending(m,PAID);m.grant(t);assert.equal(m.entitled(PAID),true);assert.equal(Object.keys(m.state.catalog).length,0);assert.equal(m.state.runs,0);m.cancel();assert.equal(m.entitled(PAID),true);});
test('a paid release cannot begin verification without entitlement',()=>{const {m}=fresh();const t=pending(m,PAID);assert.throws(()=>m.begin(t,true),/有效使用授权/);assert.equal(m.active.phase,'confirm');});
test('permission review is an explicit gate',()=>{const {m}=fresh();const t=pending(m);assert.throws(()=>m.begin(t,false),/权限/);assert.equal(m.active.phase,'confirm');});
test('incompatible platform blocks installation',()=>{const {m}=fresh();const t=pending(m,'demo-calculator',{platform:'Windows'});assert.equal(m.compatible(t),false);assert.throws(()=>m.begin(t,true),/不支持/);});
test('missing app requires a separate simulated client installation',()=>{const {m}=fresh();const {token}=m.request(ID,{scenario:'noapp'});assert.throws(()=>m.accept(token),/客户端/);m.clientReady(token);m.accept(token);assert.equal(m.active.phase,'confirm');});
test('a revoked release fails before verification or installation',()=>{const {m}=fresh();const t=pending(m,ID,{scenario:'revoked'});assert.equal(m.active.phase,'error');assert.throws(()=>m.begin(t,true));assert.equal(Object.keys(m.state.catalog).length,0);});
for(const scenario of ['network','integrity'])test(`${scenario} stops without catalog or trust writes`,()=>{const {m}=fresh();const t=pending(m,ID,{scenario});m.begin(t,true);assert.equal(m.verified(t),false);assert.throws(()=>m.commit(t));assert.equal(Object.keys(m.state.catalog).length,0);assert.equal(Object.keys(m.state.trust).length,0);assert.equal(m.state.runs,0);});
test('default approval is Flow-scoped, not publisher-scoped',()=>{const {m}=fresh();const t=verified(m);m.commit(t);assert.equal(m.state.trust[m.flowKey(m.find(ID))],true);assert.equal(m.state.trust[m.publisherKey(m.find(ID))],undefined);});
test('publisher-wide trust requires additional consent',()=>{const {m}=fresh();const t=verified(m);assert.throws(()=>m.commit(t,'publisher',false),/额外确认/);assert.equal(Object.keys(m.state.catalog).length,0);m.commit(t,'publisher',true);assert.equal(m.state.trust[m.publisherKey(m.find(ID))],true);});
test('invalid trust scope is rejected',()=>{const {m}=fresh();const t=verified(m);assert.throws(()=>m.commit(t,'all',true),/无效/);});
test('installation does not execute and execution requires another action',()=>{const {m}=fresh();const t=verified(m);m.commit(t);assert.equal(m.state.runs,0);assert.throws(()=>m.run(ID),/关闭安装/);m.cancel();m.run(ID);assert.equal(m.state.runs,1);});
test('a commit cannot be applied twice',()=>{const {m}=fresh();const t=verified(m);m.commit(t);const before=json(m.state);assert.throws(()=>m.commit(t));assert.equal(json(m.state),before);});
test('cancel invalidates asynchronous completion and writes nothing',()=>{const {m}=fresh();const t=pending(m);m.begin(t,true);m.cancel();assert.throws(()=>m.verified(t));assert.throws(()=>m.commit(t));assert.equal(Object.keys(m.state.catalog).length,0);});
test('stale operation cannot mutate a replacement operation',()=>{const {m}=fresh();const old=pending(m);m.cancel();const next=pending(m);assert.throws(()=>m.begin(old,true));assert.equal(m.active.token,next);});
test('transaction failure preserves a prior installed version and trust',()=>{const {m}=fresh();installed(m);m.seedUpdate();const before=json(m.state);const t=verified(m,ID,{scenario:'writefail'});assert.equal(m.commit(t),false);assert.equal(json(m.state),before);});
test('update is explicit and never triggers a run',()=>{const {m}=fresh();m.seedUpdate();const t=pending(m);assert.equal(m.active.update,true);assert.equal(m.state.catalog[ID].version,'1.1.0');assert.throws(()=>m.begin(t,false));m.begin(t,true);m.verified(t);m.commit(t);assert.equal(m.state.catalog[ID].version,'1.2.0');assert.equal(m.state.runs,0);});
test('storage reload restores records, not execution',()=>{const {m,store}=fresh();installed(m);m.run(ID);const copy=create(store);assert.equal(copy.state.catalog[ID].version,'1.2.0');assert.equal(copy.state.runs,1);assert.equal(copy.active,null);});
test('malformed or unavailable storage does not crash the model',()=>{const store=storage();store.setItem(KEY,'{bad-json');const m=create(store);assert.equal(m.storageOK,false);assert.equal(Object.keys(m.state.catalog).length,0);const blocked=create({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});installed(blocked);assert.equal(blocked.state.catalog[ID].version,'1.2.0');assert.equal(blocked.storageOK,false);});
test('unrecognized stored records and markup are discarded',()=>{const store=storage();store.setItem(KEY,JSON.stringify({catalog:{evil:{version:'1',publisher:'<script>'},[ID]:{version:'1.2.0',publisher:'wrong'}},runs:999,trust:{evil:true}}));const m=create(store);assert.equal(Object.keys(m.state.catalog).length,0);assert.equal(Object.keys(m.state.trust).length,0);assert.equal(m.state.runs,0);});
test('reset clears only the dedicated prototype storage key',()=>{const {m,store}=fresh();store.setItem('unrelated','keep');installed(m);m.reset();assert.equal(store.getItem(KEY),null);assert.equal(store.getItem('unrelated'),'keep');assert.equal(m.state.runs,0);});
test('callers cannot mutate active operation or catalog state snapshots',()=>{const {m}=fresh();const a=m.request(ID);a.id=PAID;assert.equal(m.active.id,ID);const snap=m.state;snap.catalog.fake={};assert.equal(Object.keys(m.state.catalog).length,0);});
test('static artifact has no external scripts, native launch, or network client',()=>{assert.doesNotMatch(html,/<script[^>]+src=/);assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|WebSocket|window\.open\s*\(|location\.href\s*=/);assert.match(html,/connect-src 'none'/);assert.match(html,/不会真实安装、扣费或运行/);});


test('desktop sidebar guide is docked, flat, and mobile-safe',()=>{
  assert.match(html,/\.sidebar\{[^}]*display:flex;flex-direction:column;min-height:0/);
  assert.match(html,/\.side-guide\{[^}]*border:0;border-top:1px solid var\(--line\);border-radius:0;background:transparent;[^}]*margin:auto 0 0/);
  assert.match(html,/<div class="side-guide-title"><span class="guide-icon" id="guide-icon"><\/span><h3>第一次使用？<\/h3><\/div>/);
  assert.match(html,/在 OpenDesk 中确认安装。<br>是否运行，由你决定。/);
  assert.match(html,/>查看安装指南 →<\/button>/);
  assert.doesNotMatch(html,/\.side-guide\{border:1px solid var\(--line\);border-radius:12px;background:#fff/);
  assert.match(html,/@media\(max-width:740px\)[\s\S]*?\.side-guide\{display:flex;align-items:center;gap:10px;margin:10px 0 0;padding:10px 0 0;border-top:1px solid var\(--line\)/);
  assert.doesNotMatch(html,/@media\(max-width:740px\)[\s\S]*?\.side-guide\{[^}]*position:fixed/);
});
