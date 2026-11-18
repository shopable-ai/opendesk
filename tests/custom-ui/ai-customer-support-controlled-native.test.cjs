// Gate configuration/fail-closed tests only; no native or visual evidence.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'ai-customer-support-controlled-native.js'),'utf8');

async function attempt(value){
  const saved=[],reads=[];
  let nativeReads=0;
  const gate=vm.runInNewContext(source,{
    System:{getEnv:(key,fallback)=>{reads.push(key);return value===undefined?fallback:value;}},
    File:{join:path.join,writeJSON:async(file,data)=>saved.push({file,data:JSON.parse(JSON.stringify(data))})},
    window:{get:async()=>{nativeReads++;throw Error('offline native boundary');}},
  });
  let error;
  try{await gate({target:{pid:42},evidence:'/evidence',getAutomation:()=>({mode:'disabled'})});}
  catch(cause){error=cause;}
  assert.ok(error);assert.equal(saved.length,1);
  assert.equal(saved[0].file,'/evidence/controlled-native-results.json');
  assert.deepEqual(reads,['OPENDESK_SUPPORT_CONTROLLED_UNKNOWN_MODE']);
  assert.equal(saved[0].data.status,'FAIL','offline refusal never claims a native pass');
  assert.equal(saved[0].data.results.at(-1).status,'FAIL');
  return {error,nativeReads,result:saved[0].data};
}

for(const value of [undefined,'unknown-delivered','unknown-not-delivered']){
  test('gate records selected fresh-run unknown variant: '+String(value),async()=>{
    const {error,nativeReads,result}=await attempt(value);
    const mode=value??'unknown-delivered';
    assert.match(String(error),/offline native boundary/);assert.equal(nativeReads,1);
    assert.equal(result.unknownMode,mode);assert.equal(result.coverage,'success-protection-burst-failure-and-'+mode);
    assert.deepEqual(result.deferred,[mode==='unknown-delivered'?'unknown-not-delivered-locks':'unknown-delivered-locks']);
  });
}

for(const value of ['', 'success', 'unknown', 'unknown-not-delivered ']){
  test('invalid unknown variant refuses before any native access: '+JSON.stringify(value),async()=>{
    const {error,nativeReads}=await attempt(value);
    assert.match(String(error),/Invalid controlled unknown mode/);assert.equal(nativeReads,0);
  });
}
