import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../examples/codex-workflow-companion/core/store.mjs';
import { Workflow, deepLink } from '../../examples/codex-workflow-companion/core/engine.mjs';
import { validateDeepLink } from '../../examples/codex-workflow-companion/core/adapters.mjs';

function setup(t, options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'od-cwf-unit-'));
  const store=new Store(dir), workflow=new Workflow(store, options);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {store,workflow,dir};
}
function ctx(w){const p=w.pending(); return {...p,nonce:w.s.active.nonce};}
function bind(w, p, tag='one'){
  const hook={protocol:'od.codex-workflow.v1',kind:'prompt',workflowId:p.workflowId,taskId:p.taskId,attemptId:p.attemptId,nonce:p.nonce,sessionId:'sess-'+tag,turnId:'turn-'+tag};
  w.hook(hook, 'prompt-'+tag);
  return hook;
}
function claim(w,p,tag='one'){return w.claim({workflowId:p.workflowId,taskId:p.taskId,taskVersion:p.taskVersion,attemptId:p.attemptId,nonce:p.nonce,eventId:'claim-'+tag});}
function submit(w,p,tag='one',result){return w.submit({workflowId:p.workflowId,taskId:p.taskId,taskVersion:p.taskVersion,attemptId:p.attemptId,nonce:p.nonce,eventId:'submit-'+tag,result,evidence:'test fixture'});}
function stop(w,hook,tag='one'){return w.hook({protocol:'od.codex-workflow.v1',kind:'stop',workflowId:hook.workflowId,taskId:hook.taskId,attemptId:hook.attemptId,sessionId:hook.sessionId,turnId:hook.turnId,stopHookActive:false},'stop-'+tag);}

test('A -> B -> C requires MCP submission, Hook Stop and human review',t=>{
  const {workflow:w}=setup(t);let p=w.start();assert.equal(p.taskId,'A');w.dispatchResult({attemptId:p.attemptId,status:'prepared'});
  for(const [index,id] of ['A','B','C'].entries()){
    p=ctx(w);assert.equal(p.taskId,id);
    const h=bind(w,p,id);claim(w,p,id);submit(w,p,id,'OK-'+id);
    assert.equal(w.s.tasks[index].status,'review');
    assert.equal(w.s.tasks[index+1]?.status??'none',index<2?'queued':'none');
    assert.throws(()=>w.approve(p.attemptId,'verified'),/REVIEW_NOT_READY/);
    stop(w,h,id);
    const next=w.approve(p.attemptId,'verified by operator');
    if(index<2){assert.equal(next.taskId,['B','C'][index]);w.dispatchResult({attemptId:next.attemptId,status:'prepared'});}
  }
  assert.deepEqual(w.s.tasks.map(x=>x.status),['accepted','accepted','accepted']);
  assert.equal(w.s.active,null);
});

test('manual stop alone cannot advance; false stop rejected',t=>{
  const {workflow:w}=setup(t);const p=w.start();w.dispatchResult({attemptId:p.attemptId,status:'prepared'});
  const h=bind(w,ctx(w),'s');
  assert.throws(()=>w.hook({...h,kind:'stop',stopHookActive:true},'invalid-stop'),/STOP_NOT_FINAL/);
  stop(w,h,'s');assert.throws(()=>w.approve(p.attemptId,'reviewed'),/REVIEW_NOT_READY/);
});

test('wrong attempt/task/nonce cannot claim, submit or bind another Codex session',t=>{
  const {workflow:w}=setup(t);const p=w.start();w.dispatchResult({attemptId:p.attemptId,status:'prepared'});
  const c=ctx(w),h=bind(w,c,'x');
  assert.throws(()=>claim(w,{...c,taskId:'B'},'wrong'),/IDENTITY_MISMATCH/);
  assert.throws(()=>claim(w,{...c,nonce:'forged'},'wrongnonce'),/IDENTITY_MISMATCH/);
  assert.throws(()=>w.hook({...h,sessionId:'other'},'again'),/HOOK_REBIND_DENIED/);
  assert.throws(()=>submit(w,c,'beforeclaim','OK-A'),/NOT_CLAIMED_OR_ALREADY_SUBMITTED/);
});

test('duplicate events idempotent, conflicting reuse rejected, no double send',t=>{
  const {workflow:w}=setup(t);const p=w.start();w.dispatchResult({attemptId:p.attemptId,status:'prepared'});
  const c=ctx(w),h=bind(w,c,'d');assert.deepEqual(bind(w,c,'d'),h);
  assert.equal(claim(w,c,'d').accepted,true);assert.equal(claim(w,c,'d').duplicate,true);
  const {workflowId,taskId,taskVersion,attemptId,nonce}=c;const event={workflowId,taskId,taskVersion,attemptId,nonce,eventId:'progress-d',percent:15,message:'x'};
  assert.equal(w.progress(event).accepted,true);assert.equal(w.progress(event).duplicate,true);
  assert.throws(()=>w.progress({...event,percent:20}),/EVENT_ID_CONFLICT/);
  assert.equal(w.s.tasks[1].attempts,0);
});

test('restart with reserved external action fails closed as unknown; explicit evidence recovers',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'od-cwf-restart-'));
  let store=new Store(dir);let w=new Workflow(store,{mode:'deeplink'});let p=w.start();store.close();
  store=new Store(dir);w=new Workflow(store);assert.equal(w.s.paused,true);assert.equal(w.s.active.dispatch,'unknown');
  assert.throws(()=>w.start(),/ALREADY_STARTED_OR_FINISHED/);
  assert.throws(()=>w.reconcile(p.attemptId,'not_sent','short'),/RECONCILE_EVIDENCE_REQUIRED/);
  w.reconcile(p.attemptId,'not_sent','Operator verified no prompt was sent');
  assert.equal(w.s.active,null);assert.equal(w.s.tasks[0].status,'queued');
  assert.equal(w.resume().taskId,'A');assert.notEqual(w.pending().attemptId,p.attemptId);
  store.close();fs.rmSync(dir,{recursive:true,force:true});
});

test('pause prevents B launch even when A accepted, then resume reserves B',t=>{
  const {workflow:w}=setup(t);const p=w.start();w.dispatchResult({attemptId:p.attemptId,status:'prepared'});
  const c=ctx(w),h=bind(w,c,'pause');claim(w,c,'pause');submit(w,c,'pause','OK-A');stop(w,h,'pause');w.pause();
  assert.equal(w.approve(p.attemptId,'checked manually'),null);assert.equal(w.s.tasks[1].status,'queued');
  assert.equal(w.resume().taskId,'B');
});

test('demo exact-only automatic acceptance never enables on real mode',t=>{
  assert.throws(()=>setup(t,{mode:'deeplink',reviewPolicy:'exact-demo'}).workflow.s,/DEMO_REVIEW_ONLY/);
});

test('simulation exact verifier advances but mismatch stays in review',t=>{
  const {workflow:w}=setup(t,{mode:'simulate',reviewPolicy:'exact-demo'});
  const p=w.start();w.dispatchResult({attemptId:p.attemptId,status:'prepared'});
  const c=ctx(w),h=bind(w,c,'auto');claim(w,c,'auto');submit(w,c,'auto','BAD');stop(w,h,'auto');
  assert.equal(w.s.tasks[0].status,'review');
  w.approve(p.attemptId,'manual override reviewed');assert.equal(w.pending().taskId,'B');
});

test('deep link cannot be mistaken for a send; URL is scheme/route constrained',()=>{
  const link=deepLink('你好\nOD-CWF');assert.equal(validateDeepLink(link),link);
  assert.equal(new URL(link).searchParams.get('prompt'),'你好\nOD-CWF');
  assert.throws(()=>validateDeepLink('javascript:alert(1)'),/INVALID_CODEX_LINK/);
  assert.throws(()=>validateDeepLink('codex://settings'),/INVALID_CODEX_LINK/);
});

test('single writer lock refuses second owner, protects state from concurrent overwrites',t=>{
  const {dir}=setup(t);assert.throws(()=>new Store(dir),/EEXIST/);
});

test('reported error pauses; retry requires observed stop and human evidence',t=>{
  const {workflow:w}=setup(t);const p=w.start();w.dispatchResult({attemptId:p.attemptId,status:'prepared'});
  const c=ctx(w),h=bind(w,c,'error');claim(w,c,'error');
  w.error({workflowId:c.workflowId,taskId:c.taskId,taskVersion:c.taskVersion,attemptId:c.attemptId,nonce:c.nonce,eventId:'err1',code:'SIMULATED_FAILURE'});
  assert.equal(w.s.paused,true);assert.throws(()=>w.retryFailed(c.attemptId,'human inspected code'),/RETRY_NOT_SAFE/);
  stop(w,h,'error');w.retryFailed(c.attemptId,'Confirmed Codex has stopped; safe to retry task');
  assert.equal(w.s.active,null);assert.equal(w.resume().taskId,'A');assert.notEqual(w.pending().attemptId,p.attemptId);
});

test('Hook Stop before MCP submit stays unapproved until both exist',t=>{
  const {workflow:w}=setup(t);const p=w.start();w.dispatchResult({attemptId:p.attemptId,status:'prepared'});
  const c=ctx(w),h=bind(w,c,'order');claim(w,c,'order');stop(w,h,'order');
  assert.throws(()=>w.approve(c.attemptId,'reviewed'),/REVIEW_NOT_READY/);
  submit(w,c,'order','OK-A');assert.equal(w.s.tasks[1].status,'queued');
  assert.equal(w.approve(c.attemptId,'reviewed by human').taskId,'B');
});

test('MCP status omits attempt claim capability, even while active',t=>{
  const {workflow:w}=setup(t);w.start();
  const status=w.mcpState();assert.equal(status.active.nonce,undefined);
  assert.equal(status.pending.prompt,undefined);assert.equal(status.pending.deepLink,undefined);
});


test('restart does not mistake a previous App Server hosted receipt for a live child process',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'od-cwf-hosted-restart-'));
  let store=new Store(dir);
  let w=new Workflow(store,{mode:'app-server'});
  const p=w.start();w.dispatchResult({attemptId:p.attemptId,status:'hosted',threadId:'hosted-thread'});
  store.close();
  store=new Store(dir);w=new Workflow(store);
  assert.equal(w.s.active.attemptId,p.attemptId);
  assert.equal(w.s.active.dispatch,'unknown');assert.equal(w.s.paused,true);
  assert.ok(w.s.history.some(e=>e.type==='RECOVERED_ORPHANED_HOSTED_RUN'));
  assert.equal(w.s.tasks[1].status,'queued');
  store.close();fs.rmSync(dir,{recursive:true,force:true});
});
