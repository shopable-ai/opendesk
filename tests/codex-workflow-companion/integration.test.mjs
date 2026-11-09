import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const app=path.join(root,'examples/codex-workflow-companion');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function spawnService(t,review='manual'){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'od-cwf-live-'));
  const env={...process.env,OD_CWF_STATE_DIR:dir,OD_CWF_MODE:'simulate',OD_CWF_REVIEW:review};
  const child=spawn(process.execPath,[path.join(app,'server.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill('SIGTERM');await delay(50);fs.rmSync(dir,{recursive:true,force:true});});
  const ready=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('SERVER_START_TIMEOUT')),5000);
    const rl=readline.createInterface({input:child.stdout});
    rl.on('line',line=>{if(line.startsWith('CWF_READY ')){clearTimeout(timer);rl.close();resolve(JSON.parse(line.slice(10)));}});
    child.once('exit',code=>reject(Error('SERVER_EXIT_'+code)));
  });
  const endpoint=JSON.parse(fs.readFileSync(path.join(dir,'endpoint.json'),'utf8'));
  const request=async(route,body,auth=true)=>{
    const r=await fetch(ready.url+route,{method:'POST',headers:{'Content-Type':'application/json', ...(auth?endpoint.headers:{})},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  };
  return {dir,env,child,ready,endpoint,request};
}
async function mcpConnect(t,env){
  const child=spawn(process.execPath,[path.join(app,'mcp/server.mjs')],{cwd:root,env,stdio:['pipe','pipe','pipe']});
  t.after(()=>child.kill('SIGTERM'));
  const queue=[];const pending=new Map();let number=0;
  const lines=readline.createInterface({input:child.stdout});
  lines.on('line',line=>{const data=JSON.parse(line);if(pending.has(data.id)){pending.get(data.id)(data);pending.delete(data.id)}else queue.push(data);});
  const rpc=async(method,params={})=>{
    const id=++number;
    const promise=new Promise((resolve,reject)=>{pending.set(id,resolve);setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('MCP_TIMEOUT_'+method))}},3000)});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');return promise;
  };
  return {child,rpc,notify:(method)=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',method})+'\n')};
}

test('real loopback service: unauthenticated write rejected, simulation A/B/C with honest evidence',async t=>{
  const s=await spawnService(t,'exact-demo');
  const reject=await s.request('/api/operator',{action:'start'},false);assert.equal(reject.status,403);
  let r=await s.request('/api/operator',{action:'start'});assert.equal(r.body.state.active.taskId,'A');
  for(const id of ['A','B','C']){
    r=await s.request('/api/operator',{action:'simulate'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.result.simulated,true);
    if(id!=='C')assert.equal(r.body.state.active.taskId, id==='A'?'B':'C');
  }
  assert.deepEqual(r.body.state.tasks.map(x=>x.status),['accepted','accepted','accepted']);
  assert.equal(r.body.state.active,null);
  assert.equal(s.endpoint.protocol,'od.codex-workflow.v1');
});

test('real MCP JSON-RPC stdio: initialize, tool discovery, workflow read, invalid claim rejected',async t=>{
  const s=await spawnService(t);
  const m=await mcpConnect(t,s.env);
  const init=await m.rpc('initialize',{protocolVersion:'2025-06-18',clientInfo:{name:'test',version:'0'}});
  assert.equal(init.result.serverInfo.name,'opendesk-codex-workflow-companion');
  m.notify('notifications/initialized');
  const listing=await m.rpc('tools/list');
  assert.deepEqual(listing.result.tools.map(x=>x.name),['workflow_status','task_claim','task_progress','task_submit','task_error']);
  const status=await m.rpc('tools/call',{name:'workflow_status',arguments:{}});
  assert.equal(status.result.isError,false);
  const state=JSON.parse(status.result.content[0].text);
  assert.equal(state.paused,true);assert.equal(state.pending,null);
  const reject=await m.rpc('tools/call',{name:'task_claim',arguments:{workflowId:'other',taskId:'B'}});
  assert.equal(reject.result.isError,true);
});

test('actual Codex hook sender reuses demo sender transport and records prompt and stop',async t=>{
  const s=await spawnService(t);
  const started=await s.request('/api/operator',{action:'start'});
  const prompt=started.body.state.pending.prompt;
  const cwd=root,session_id='session-genuine',turn_id='turn-genuine';
  const send=async data=>{
    const p=spawn('python3',[path.join(app,'hooks/sender.py')],{cwd:root,env:{...s.env},stdio:['pipe','pipe','pipe']});
    p.stdin.end(JSON.stringify(data));
    const output=[];const error=[];p.stderr.on('data',x=>error.push(x.toString()));for await(const chunk of p.stdout)output.push(chunk.toString());
    if(error.length)console.error('HOOK_STDERR',error.join(''));
    return output.join('');
  };
  assert.match(await send({hook_event_name:'UserPromptSubmit',session_id,turn_id,cwd,prompt}),/"continue":true/);
  let state=JSON.parse(fs.readFileSync(path.join(s.dir,'state.json'),'utf8'));
  assert.equal(state.active.sessionId,session_id);
  assert.match(await send({hook_event_name:'Stop',stop_hook_active:false,session_id,turn_id,cwd,last_assistant_message:'anything'}),/"continue":true/);
  state=JSON.parse(fs.readFileSync(path.join(s.dir,'state.json'),'utf8'));
  assert.equal(state.active.stopObserved,true);assert.equal(state.tasks[0].status,'running');
});
