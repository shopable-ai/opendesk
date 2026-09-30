'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {assessLive}=require('./tools/qualify-calculator-partial.cjs');
const source=fs.readFileSync(path.join(__dirname,'calculator-partial-witness.js'),'utf8');

async function observe({completionAt=10000,status=0,mutation=null,missingCompletion=false,initial='9'}={}){
  let now=0;const logs=[];
  const win={id:'test-calculator',pid:1,handle:2,title:'Calculator',width:232,height:321,
    x:0,y:0,isForeground:true,hasFocus:true};
  // Deliberate five-second pause at an intermediate second-expression input.
  const display=()=>mutation&&now>=12000?mutation:
    now>=9000?'660':now>=4000?'6':now>=3000?'0':now>=2000?'110':now>=1000?'0':initial;
  const context={Date:class extends Date{constructor(){super(now);}static now(){return now;}},
    Execution:{id:'controlled-witness',artifactDir:'/test-witness'},
    window:{get:async()=>({...win}),current:async()=>({...win})},
    File:{exists:()=>!missingCompletion&&now>=completionAt,
      readJSON:async()=>({kind:'candidate-process-complete',status,finishedAt:completionAt})},
    Accessibility:{snapshot:async()=>({complete:true,truncated:false,requestId:'r-'+now,
      root:{children:[{role:'staticText',name:'主显示器',value:display()}]}})},
    page:{screenshot:async()=>({path:'/test-witness/display.png'}),
      waitForTimeout:async()=>{now+=1000;}},console:{log:value=>logs.push(value)}};
  let error;
  try{await new vm.Script('(async()=>{\n'+source+'\n})()').runInNewContext(context,{timeout:1000});}
  catch(e){error=e.message;}
  return {now,error,stdout:logs.join('\n'),complete:logs.flatMap(line=>{
    try{return [JSON.parse(line)];}catch{return [];}
  }).find(o=>o.kind==='witness-complete')};
}
test('intermediate pause cannot finish witness; full stable interval follows candidate exit',async()=>{
  const actual=await observe({completionAt:9000});assert.equal(actual.error,undefined);
  assert.ok(actual.now>=13000);assert.equal(actual.complete.lastObservedValue,'660');
  assert.equal(actual.complete.stableTerminalObserved,true);
  assert.ok(actual.complete.stableTerminalMs>=4000);
});
test('post-completion zero or nonzero input fails instead of restarting stability',async()=>{
  for(const mutation of ['0','8'])assert.match((await observe({mutation})).error,/changed after candidate completion/);
});
test('failed or absent candidate completion cannot qualify',async()=>{
  assert.match((await observe({status:1})).error,/failed candidate completion/);
  const absent=await observe({missingCompletion:true});
  assert.equal(absent.complete,undefined);assert.match(absent.error,/Witness did not observe/);
});
test('a stable unrelated final value cannot pass on an earlier matching display',async()=>{
  const completed=['6','×','1','1','0','='].map(name=>({actionState:'acknowledged',backend:'macos-ax',
    requestId:'receipt',target:{source:'accessibility',locator:{name}}}));
  const candidate={stdout:JSON.stringify({firstResult:'110',finalResult:'660',secondInput:{completed}})};
  const witness=await observe();assert.doesNotThrow(()=>assessLive(candidate,witness));
  const altered={stdout:witness.stdout.replace('"lastObservedValue":"660"','"lastObservedValue":"8"')};
  assert.throws(()=>assessLive(candidate,altered),/Stable terminal/);
  // The previous run may leave the same first result on screen; only values after this run zero count.
  const previousRunValue=await observe({initial:'110'});
  assert.doesNotThrow(()=>assessLive(candidate,previousRunValue));
});
