// Current UI state owner executed in Node; this is not native-window evidence.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
let loaded;
export function loadState(){
  return loaded??=(async()=>{
    const r=await build({entryPoints:[new URL('../src/state.tsx',import.meta.url).pathname],
      bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
    return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
  })();
}
export async function checkHumanProtection(observation,result,text){
  const app=await loadState();
  const deliver=(s,m)=>app.reducer(s,{type:'NATIVE_MESSAGE',message:m});
  const start=(s,id)=>app.reducer(s,{type:'NATIVE_AI_QUERY',request:{type:'support.aiQuery',requestId:id,binding:observation.binding}});
  let s=deliver(app.createInitialState(true),observation);
  s=deliver(start(s,result.requestId),result);
  assert.equal(s.ai?.status,result.status,'UI must accept the current result');
  const key=app.activeReplyKey(s);
  s=app.reducer(s,{type:'REPLY_TEXT',key,text});
  const assertHuman=()=>assert.equal(app.activeReplyText(s),text);
  assertHuman();
  s=start(s,'trial-requery');assertHuman();
  s=deliver(s,{...result,requestId:'trial-requery'});assertHuman();
  assert.equal(app.activeReplyKey(s),key);
  // Edit during another pending response; cancellation prevents its application.
  s=start(s,'trial-late');
  s=app.reducer(s,{type:'REPLY_EDIT',key});
  s=app.reducer(s,{type:'REPLY_TEXT',key,text});
  const edited=s;
  s=deliver(s,{...result,requestId:'trial-late'});
  assert.equal(s,edited);assertHuman();
  assert.equal(app.currentThread(s).draft,'','nothing filled or sent');
  assert.deepEqual(app.currentThread(s).sent,[]);
  return {status:'PASS',scope:'production reducer, Node only',
    assertions:['requery pending retains human text','new result is opt-in','edit cancels late result','no draft fill or send']};
}
