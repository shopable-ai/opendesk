'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../../apps/opendesk/promotions/core.js');
const controller=require('../../apps/opendesk/promotions/controller.js');
const samples=require('../../apps/opendesk/prototypes/promotions/samples.js');
const safe=()=>({ready:true,ownerVisible:true,automationIdle:true,recorderIdle:true,measurementIdle:true,listOpen:false,fullscreen:false,presentationMode:false});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const clone=value=>JSON.parse(JSON.stringify(value));
function host(options={}) {
  const windows=[],timers=new Map();let n=0;
  const ui={async createWindow(spec){
    if(options.beforeCreate)await options.beforeCreate();
    const events={},controls={};let closed=false;
    const h={id:spec.id,spec,events,controls,closed:false,shows:0,
      on(type,fn){events[type]=fn;return ()=>delete events[type];},
      control(id){return controls[id]||(controls[id]={events:{},patches:[],on(type,fn){this.events[type]=fn;return ()=>delete this.events[type];},async update(patch){this.patches.push(patch);return patch;}});},
      async setRelativeTo(a){return {bounds:options.overlap?a:{x:a.x,y:a.y-400,width:360,height:296}};},
      async setPlacement(){return {bounds:{x:700,y:300,width:360,height:296}};},
      async show(){h.shows++;return {visible:true,onScreen:options.onScreen!==false};},
      async close(){if(options.closeError)throw new Error('host close failed');closed=true;h.closed=true;if(events.close)events.close();},
      async waitUntilClosed(){return closed;}
    };windows.push(h);return h;
  }};
  return {ui,windows,timers,setTimeout(fn,ms){timers.set(++n,{fn,ms});return n;},clearTimeout(id){timers.delete(id);}};
}
function setup(options={}) {
  const h=host(options),state=safe(),opened=[];
  const c=controller.create({ui:h.ui,getContext:()=>state,setTimeout:h.setTimeout,clearTimeout:h.clearTimeout,
    now:()=>new Date(2026,8,17,10).getTime(),activate:a=>opened.push(a),...options.controller});
  return {h,state,c,opened};
}
const placement={mode:'runner-above',anchor:{x:400,y:700,width:590,height:54}};

test('four presentation fixtures validate; image and motion stay separate from placement',()=>{
 for(const kind of ['image','animated','mixed','text'])assert.equal(core.validateCreative(samples.sample(kind)).schemaVersion,1);
 assert.equal(samples.sample('animated').media.kind,'animated-image');
 assert.equal(samples.sample('mixed').layout,'image-text');
 const minimal=samples.sample('text');delete minimal.description;assert.ok(core.render(minimal,true).html);
});
test('reject remote images, SVG, executable fields and unsupported actions',()=>{
 for(const src of ['https://ads.example/a.gif','data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)']) {
  const c=samples.sample('image');c.media.src=src;assert.throws(()=>core.validateCreative(c));
 }
 const x=samples.sample('text');x.html='<script>bad()</script>';assert.throws(()=>core.validateCreative(x));
 const y=samples.sample('text');y.action={kind:'official',id:'run-script'};assert.throws(()=>core.validateCreative(y));
 const z=samples.sample('text');z.action={kind:'preview',id:{}};assert.throws(()=>core.validateCreative(z));
});
test('animated media requires a static poster; malformed and oversized payloads rejected',()=>{
 const c=samples.sample('animated');delete c.media.poster;assert.throws(()=>core.validateCreative(c));
 assert.throws(()=>core.mediaSource('data:image/gif;base64,R0lGOD12',true));
 assert.throws(()=>core.mediaSource('data:image/png;base64,AAAA',true));
 assert.throws(()=>core.mediaSource('x'.repeat(core.LIMITS.maxMediaChars+1),false));
});
test('render escapes author text and keeps close button outside media',()=>{
 const c=samples.sample('mixed');c.title='<script>alert(1)</script>';c.advertiser='A & B';
 const html=core.render(c,true).html;
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('A &amp; B'));
 assert.ok(html.indexOf('promotionClose')<html.indexOf('promotionImage'));assert.ok(!html.includes('onclick='));
});
test('placement accounts for negative display origins, margins and overlap',()=>{
 const area={x:-1440,y:0,width:1440,height:900},a={x:-1000,y:800,width:590,height:54};
 const b=core.place('runner-above',area,a,{width:360,height:296});
 assert.equal(b.y,492);assert.ok(!core.overlaps(b,a));
 const corner=core.place('screen-bottom-right',area,null,{width:360,height:296});assert.equal(corner.x,-376);
 assert.equal(core.place('runner-above',area,{...a,y:40},{width:360,height:296}),null);
 assert.equal(core.place('screen-bottom-right',{x:0,y:0,width:300,height:600},null,{width:360,height:296}),null);
 assert.equal(core.place('screen-bottom-right',{x:0,y:0,width:1000,height:700},{x:600,y:620,width:390,height:60},{width:360,height:296}),null);
});
test('unknown or unsafe state fails closed',()=>{
 assert.equal(core.contextReason({}),'unknown');assert.equal(core.contextReason(safe()),'');
 for(const k of Object.keys(safe())) {const c=safe();delete c[k];assert.ok(core.contextReason(c),k);}
 for(const k of ['automationIdle','recorderIdle','measurementIdle','ownerVisible']) {const c=safe();c[k]=false;assert.equal(core.contextReason(c),k);}
});
test('cooldown, global daily cap, today and campaign dismissals persist',()=>{
 const now=new Date(2026,8,17,10).getTime(),c=samples.sample('image');let p=core.freshPreferences();
 assert.equal(core.eligible(c,safe(),p,now),'');p=core.recordShown(p,now);
 assert.equal(core.eligible(c,safe(),p,now+1),'cooldown');
 p=core.recordShown(p,now+core.LIMITS.cooldownMs);
 assert.equal(core.eligible(c,safe(),p,now+2*core.LIMITS.cooldownMs),'daily-cap');
 const dismissed=core.dismiss(core.freshPreferences(),c,'campaign',now),variant={...c,id:'anotherCreative'};
 assert.equal(core.eligible(variant,safe(),dismissed,now),'dismissed');
 assert.equal(core.eligible(c,safe(),core.dismiss(core.freshPreferences(),c,'today',now),now),'today');
 assert.equal(core.eligible(c,safe(),core.dismiss(core.freshPreferences(),c,'disable',now),now),'disabled');
});
test('preference parser rejects malformed state and does not mutate input',()=>{
 const p=core.freshPreferences(),copy=clone(p);core.recordShown(p,Date.now());assert.deepEqual(p,copy);
 assert.throws(()=>core.readPreferences({...p,count:-1}));assert.throws(()=>core.readPreferences({...p,dismissed:[]}));
});
test('native window uses real floating APIs, poster first, and singleton creation',async()=>{
 const {h,c}=setup();const first=c.show(samples.sample('animated'),placement),second=c.show(samples.sample('animated'),placement);
 assert.equal(first,second);assert.equal((await first).status,'visible');assert.equal(h.windows.length,1);
 assert.equal(h.windows[0].spec.kind,'floating');assert.ok(h.windows[0].spec.content.html.includes(samples.poster));
 assert.ok(!h.windows[0].spec.content.html.includes(samples.animation));assert.equal(c.state().paused,true);
 await c.dispose();assert.equal(h.windows[0].closed,true);assert.equal(h.timers.size,0);
});
test('motion control swaps to actual animation and back to poster',async()=>{
 const {h,c}=setup();await c.show(samples.sample('animated'),placement);await c.setMotion(true);
 assert.equal(h.windows[0].controls.promotionImage.patches.at(-1).source,samples.animation);
 const timer=[...h.timers.values()].find(t=>t.ms===5000);assert.ok(timer);timer.fn();await tick();
 assert.equal(h.windows[0].controls.promotionImage.patches.at(-1).source,samples.poster);await c.dispose();
});
test('native overlap suppresses before first show',async()=>{
 const {h,c}=setup({overlap:true});assert.equal((await c.show(samples.sample('image'),placement)).reason,'overlap');
 assert.equal(h.windows[0].shows,0);assert.equal(h.windows[0].closed,true);
});
test('cancel during asynchronous creation never shows a late advertisement',async()=>{
 let release;const {h,c}=setup({beforeCreate:()=>new Promise(r=>release=r)});
 const pending=c.show(samples.sample('image'),placement);await c.close('cancel');release();
 assert.equal((await pending).status,'suppressed');assert.equal(h.windows[0].shows,0);assert.equal(h.windows[0].closed,true);
});
test('unsafe transition removes visible surface before proceeding',async()=>{
 const {h,state,c}=setup();await c.show(samples.sample('image'),placement);state.automationIdle=false;await c.refreshContext();
 assert.equal(h.windows[0].closed,true);assert.equal(c.state().phase,'idle');assert.equal(h.timers.size,0);
});
test('dismiss closes immediately and remembers campaign',async()=>{
 const {h,c}=setup();await c.show(samples.sample('image'),placement);await h.windows[0].controls.promotionClose.events.click();
 assert.equal(h.windows[0].closed,true);assert.equal((await c.show(samples.sample('image'),placement)).reason,'dismissed');
});
test('only explicit CTA activates validated action and closes first',async()=>{
 const {h,c,opened}=setup();await c.show(samples.sample('image'),placement);assert.equal(opened.length,0);
 await h.windows[0].controls.promotionOpen.events.click();assert.equal(h.windows[0].closed,true);assert.equal(opened[0].kind,'preview');
});
test('close failure blocks later display and activation',async()=>{
 const {h,c,opened}=setup({closeError:true});await c.show(samples.sample('image'),placement);
 await h.windows[0].controls.promotionOpen.events.click();assert.equal(opened.length,0);
 assert.equal((await c.show(samples.sample('image'),placement)).reason,'failed');
});
test('on-screen failure cannot count a display',async()=>{
 const {c}=setup({onScreen:false});await assert.rejects(c.show(samples.sample('image'),placement));assert.equal(c.state().preferences.count,0);
});
test('timeout exists before persistence completes; preference writes are serialized',async()=>{
 const writes=[];let release;
 const {h,c}=setup({controller:{savePreferences:p=>{writes.push(p);return writes.length===1?new Promise(r=>release=r):Promise.resolve();}}});
 const pending=c.show(samples.sample('image'),placement);await tick();assert.ok([...h.timers.values()].some(t=>t.ms===15000));
 const dismiss=c.dismiss('disable');await tick();assert.equal(h.windows[0].closed,true);assert.equal(writes.length,1);
 release();await pending;await dismiss;assert.equal(writes.length,2);assert.equal(writes[1].enabled,false);
});
