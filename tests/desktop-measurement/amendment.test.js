'use strict';
// Pure model / frozen-pixel fixtures. Not OpenDesk Runtime API or native qualification.
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../../apps/opendesk/prototypes/desktop-measurement/visual-resolver.js');
const R = require('../../apps/opendesk/prototypes/desktop-measurement/records.js');
const M = require('../../apps/opendesk/prototypes/desktop-measurement/model.js');
function fixture(width=240,height=160) {
  const data=new Uint8ClampedArray(width*height*4);
  for (let i=0;i<data.length;i+=4) data.set([230,230,230,255],i);
  return {width,height,data};
}
function fill(image,r,color) {
  for (let y=r.y;y<r.y+r.height;y++) for(let x=r.x;x<r.x+r.width;x++) image.data.set(color,(y*image.width+x)*4);
}
const box={x:80,y:55,width:70,height:35}, seed={x:100,y:70};
function source(image=fixture(),id='s1',origin={x:0,y:0}) {
  return {snapshotId:id,image,origin,referenceBounds:{...origin,width:image.width,height:image.height}};
}
function resolver(options={}, clock=()=>0, color=[60,130,190,255]) {
  const img=fixture(); fill(img,box,color);const r=V.create(options,clock);r.reset(source(img));return {r,img};
}
const token=(n=1)=>({sessionId:'session-test',generation:n,snapshotId:'s'+n});
const snapshot=(n=1)=>({snapshotId:'s'+n,token:token(n),referenceWindow:{id:'win',bounds:{x:0,y:0,width:240,height:160}},sourceImages:[{displayId:'display-1',encoding:'fixture',data:'not-native'}]});
const region=(n=1)=>({status:'confirmed',type:'region',label:'input box',token:token(n),geometry:{...box},coordinates:M.relative(box,snapshot(n).referenceWindow.bounds),candidate:{semantic:false,provider:'manual'}});

test('bounded component returns honest visual evidence',()=>{
 const {r}=resolver();const c=r.resolve(seed);assert.deepEqual(c.rect,box);assert.equal(c.semantic,false);assert.equal(c.role,null);assert.equal(c.snapshotId,'s1');assert.equal(c.evidence.colorMetric,'rgb-rms');assert.equal(c.evidence.connectivity,4);assert.ok(c.evidence.visited<=r.config.maxVisited);
});
test('100 small inside movements require no additional fill',()=>{
 const {r}=resolver();r.resolve(seed);for(let i=0;i<100;i++) assert.ok(r.resolve({x:100+i%3,y:70+i%2}));assert.equal(r.stats.floodFillRuns,1);assert.equal(r.stats.visualCacheHit,100);
});
test('different seed color inside old bounding box invalidates reuse',()=>{
 const {r,img}=resolver();fill(img,{x:100,y:70,width:5,height:5},[255,0,0,255]);r.resolve({x:90,y:65});const before=r.stats.floodFillRuns;assert.equal(r.reuse(seed,8).hit,false);r.resolve(seed);assert.equal(r.stats.floodFillRuns,before+1);
});
test('leaving candidate resolves another component',()=>{
 const {r,img}=resolver();fill(img,{x:170,y:55,width:40,height:35},[160,30,90,255]);const a=r.resolve(seed),b=r.resolve({x:185,y:65});assert.notEqual(a.id,b.id);assert.equal(r.stats.floodFillRuns,2);
});
test('RGB tolerance is not strict equality',()=>{
 assert.equal(V.similar([100,100,100,255],[105,102,100,255],8),true);assert.equal(V.similar([100,100,100,255],[130,100,100,255],8),false);
});
test('negative coordinates resolve back to logical screen',()=>{
 const {r,img}=resolver();r.reset(source(img,'negative',{x:-300,y:-180}));const c=r.resolve({x:-200,y:-110});assert.deepEqual(c.rect,{x:-220,y:-125,width:70,height:35});
});
test('Snapshot update clears candidate and negative caches',()=>{
 const {r,img}=resolver();r.resolve(seed);r.reset(source(img,'s2'));assert.equal(r.stats.reuse,undefined);assert.equal(r.reuse(seed,8).hit,false);assert.equal(r.resolve(seed).snapshotId,'s2');assert.equal(r.stats.floodFillRuns,2);
});
test('returned cache objects cannot mutate cache',()=>{
 const {r}=resolver();const a=r.resolve(seed);a.rect.width=999;assert.equal(r.resolve(seed).rect.width,70);
});
test('whole uniform background fails closed',()=>{
 const r=V.create({},()=>0);r.reset(source());assert.equal(r.resolve(seed),null);assert.ok(Object.keys(r.stats.rejections).length);
});
test('ROI-truncated component never becomes a false rectangle',()=>{
 const {r}=resolver({roiWidth:40,roiHeight:40});assert.equal(r.resolve(seed),null);assert.equal(r.stats.rejections['open-boundary'],1);
});
test('maximum visited budget includes rejected color pixels',()=>{
 const {r}=resolver({maxVisited:100});assert.equal(r.resolve(seed),null);assert.ok(r.stats.maxPixelsVisited<=100);assert.equal(r.stats.rejections['pixel-budget'],1);
});
test('candidate area budget',()=>{
 const {r}=resolver({maxArea:800});assert.equal(r.resolve(seed),null);assert.equal(r.stats.rejections['area-budget'],1);
});
test('maximum reference-area ratio',()=>{
 const {r}=resolver({maxAreaRatio:.01});assert.equal(r.resolve(seed),null);assert.equal(r.stats.rejections['area-budget'],1);
});
test('transparent seed cannot produce visual evidence',()=>{
 const {r}=resolver({},()=>0,[60,130,190,128]);assert.equal(r.resolve(seed),null);assert.equal(r.stats.rejections.transparent,1);assert.equal(r.stats.floodFillRuns,0);
});
test('small text-like component fails closed',()=>{
 const img=fixture();fill(img,{x:90,y:60,width:4,height:6},[0,0,0,255]);const r=V.create({},()=>0);r.reset(source(img));assert.equal(r.resolve({x:91,y:62}),null);assert.equal(r.stats.rejections['irregular-or-small'],1);
});
test('sparse connected shape fails density check',()=>{
 const img=fixture();fill(img,{x:60,y:60,width:80,height:2},[0,0,0,255]);fill(img,{x:60,y:60,width:2,height:55},[0,0,0,255]);const r=V.create({},()=>0);r.reset(source(img));assert.equal(r.resolve({x:61,y:61}),null);assert.equal(r.stats.rejections['irregular-or-small'],1);
});
test('deadline checked during segmentation',()=>{
 let ticks=0;const {r}=resolver({maxDurationMs:1},()=>ticks++);assert.equal(r.resolve(seed),null);assert.equal(r.stats.rejections['time-budget'],1);
});
test('cancelled work cannot return candidate or enter negative cache',()=>{
 const {r}=resolver();let calls=0;assert.equal(r.resolve(seed,8,()=>++calls<3),null);assert.equal(r.stats.rejections.cancelled,1);assert.equal(r.reuse(seed,8).hit,false);
});
test('snapshot token changed during work cancels',()=>{
 const {r,img}=resolver();let calls=0;r.resolve(seed,8,()=>{if(++calls===2)r.reset(source(img,'s2'));return true;});assert.ok(r.stats.rejections.cancelled);assert.equal(r.reuse(seed,8).hit,false);
});
test('small same-color failed seeds use bounded negative cache',()=>{
 const r=V.create({},()=>0);r.reset(source());r.resolve(seed);const n=r.stats.floodFillRuns;for(let i=0;i<100;i++)assert.equal(r.resolve({x:100+i%3,y:70+i%2}),null);assert.equal(r.stats.floodFillRuns,n);
});
test('large move beyond negative-cache radius triggers resolve',()=>{
 const r=V.create({},()=>0);r.reset(source());r.resolve(seed);const n=r.stats.floodFillRuns;r.resolve({x:150,y:100});assert.equal(r.stats.floodFillRuns,n+1);
});
test('invalid config/source fails before allocation',()=>{
 for(const options of [{roiWidth:Infinity},{maxVisited:2000000},{minFillRatio:NaN},{maxAreaRatio:Infinity},{minMove:NaN},{throttleMs:0},{minAlpha:0}])assert.throws(()=>V.create(options));const r=V.create();assert.throws(()=>r.reset(source({...fixture(),width:NaN})));assert.throws(()=>r.reset(source(fixture(),'s1',{x:NaN,y:0})));
});
test('outside source returns no pixel or rectangle',()=>{
 const {r}=resolver();assert.equal(r.resolve({x:-1,y:3}),null);assert.equal(r.resolve({x:240,y:3}),null);assert.equal(r.stats.floodFillRuns,0);
});
test('new journal is empty; no phantom snapshot',()=>{
 const r=R.create('session-test');assert.deepEqual(r.data().measurements,[]);assert.deepEqual(r.data().snapshots,[]);
});
test('preview and partial results cannot be added',()=>{
 const r=R.create('session-test');assert.throws(()=>r.add({...region(),status:'preview'},snapshot(),token()));assert.throws(()=>r.add({...region(),type:'pp',geometry:{a:{x:1,y:1}}},snapshot(),token()));assert.equal(r.count,0);
});
test('snapshot and current token must agree exactly',()=>{
 const r=R.create('session-test');assert.throws(()=>r.add(region(),snapshot(2),token()));assert.throws(()=>r.add(region(),{...snapshot(),snapshotId:'wrong'},token()));assert.throws(()=>r.add(region(),snapshot(),token(2)));assert.equal(r.count,0);
});
test('multiple records deduplicate snapshot source',()=>{
 const r=R.create('session-test');r.add(region(),snapshot(),token());r.add({...region(),label:'send button'},snapshot(),token());assert.equal(r.count,2);assert.equal(r.data().snapshots.length,1);assert.deepEqual(r.data().measurements.map(m=>m.id),['m1','m2']);
});
test('new snapshot preserves historical measurements without token rewrite',()=>{
 const r=R.create('session-test');r.add(region(),snapshot(),token());const first=r.data().measurements[0];r.add(region(2),snapshot(2),token(2));assert.deepEqual(r.data().measurements[0],first);assert.equal(r.data().snapshots.length,2);
});
test('all four result types use the existing geometry model',()=>{
 const r=R.create('session-test');r.add(region(),snapshot(),token());for(const [type,geometry] of [['point',{x:100,y:70}],['pp',{a:{x:1,y:2},b:{x:4,y:6}}],['rr',{a:box,b:{...box,x:160}}]])r.add({...region(),type,geometry},snapshot(),token());assert.equal(r.count,4);
});
test('invalid geometry cannot enter records',()=>{
 const r=R.create('session-test');for(const geometry of [{...box,width:0},{...box,x:NaN},{...box,height:-1}])assert.throws(()=>r.add({...region(),geometry},snapshot(),token()));assert.equal(r.count,0);
});
test('journal output and input objects are isolated copies',()=>{
 const r=R.create('session-test'),a=region(),s=snapshot();r.add(a,s,token());a.geometry.width=999;s.referenceWindow.id='changed';const d=r.data();d.measurements[0].geometry.width=0;assert.equal(r.data().measurements[0].geometry.width,70);assert.equal(r.data().snapshots[0].referenceWindow.id,'win');
});
test('copying JSON never marks records saved',()=>{
 const r=R.create('session-test');r.add(region(),snapshot(),token());assert.equal(JSON.parse(JSON.stringify(r.data())).measurements[0].status,'confirmed');assert.equal(r.data().measurements[0].persistence.status,'memory');
});
test('save acknowledgement addresses exact ids and advances display revision',()=>{
 const r=R.create('session-test');r.add(region(),snapshot(),token());const rev=r.revision;r.add(region(),snapshot(),token());r.markSaved(['m1'],'measurement.json');assert.equal(r.data().measurements[0].status,'saved');assert.equal(r.data().measurements[1].status,'confirmed');assert.ok(r.revision>rev+1);assert.throws(()=>r.markSaved(['unknown'],'measurement.json'));
});
test('record and snapshot budgets fail atomically without deleting history',()=>{
 const r=R.create('session-test');for(let i=0;i<R.LIMITS.maxRecords;i++)r.add(region(),snapshot(),token());assert.throws(()=>r.add(region(),snapshot(),token()));assert.equal(r.count,R.LIMITS.maxRecords);const b=R.create('session-test');for(let n=1;n<=R.LIMITS.maxSnapshots;n++)b.add(region(n),snapshot(n),token(n));assert.throws(()=>b.add(region(17),snapshot(17),token(17)));assert.equal(b.count,R.LIMITS.maxSnapshots);
});
