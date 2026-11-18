const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../examples/ai-customer-support/native-demo.js'),'utf8');
const owner=source.slice(source.indexOf('function enqueue('),source.indexOf('async function controlledState('));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(observe){
  const pauses=[];
  const context=vm.createContext({observe,log(){},invalidate:async()=>{},automation:{pause:()=>pauses.push(true)}});
  vm.runInContext('let queue=Promise.resolve(),closed=false,queueDepth=0,dirty=false,observationPending=null,lastError="";',context);
  vm.runInContext(owner,context);
  return {context,pauses};
}
test('a burst of native window hints shares one pending observation; a later tick observes again',async()=>{
  const gate=deferred();let reads=0;
  const {context}=setup(async()=>{reads++;await gate.promise;});
  const waits=Array.from({length:1000},()=>context.scheduleObservation('hint'));
  await Promise.resolve();assert.equal(reads,1);
  gate.resolve();await Promise.all(waits);
  await context.scheduleObservation('periodic');assert.equal(reads,2);
});
test('the finite native operation queue rejects overflow before doing work and pauses automation',async()=>{
  const gate=deferred();const {context,pauses}=setup(async()=>{});let actions=0;
  const waits=Array.from({length:16},()=>context.enqueue(async()=>{await gate.promise;actions++;}));
  await assert.rejects(context.enqueue(async()=>{actions+=1000;}),/queue limit/);
  assert.equal(actions,0);assert.equal(pauses.length,1);
  gate.resolve();await Promise.all(waits);assert.equal(actions,16);
  await context.enqueue(async()=>{actions++;});assert.equal(actions,17);
});
