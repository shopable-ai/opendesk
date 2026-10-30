import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:[new URL('../src/domain/workspace.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const w=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const b=await build({entryPoints:[new URL('../src/domain/business.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const domain=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const text=domain.exportBusinessBackup(domain.createBusinessState());
test('workspace plan requires exact CAS and complete business contract',()=>{
  assert.throws(()=>w.planWorkspaceSave([],text,'stale'),/版本/);
  assert.throws(()=>w.planWorkspaceSave([],'{}',w.workspaceToken([])));
  assert.throws(()=>w.planWorkspaceSave([],JSON.stringify({...JSON.parse(text),permission:true}),w.workspaceToken([])));
});
test('three slots rotate oldest and preserve latest valid when newest corrupt',()=>{
  let slots=[];
  for(let i=0;i<8;i++){
    const next=w.planWorkspaceSave(slots,text,w.workspaceToken(slots));
    slots=[...slots.filter(s=>s.slot!==next.slot),next];
    assert.ok(slots.length<=3);assert.equal(Math.max(...slots.map(s=>s.generation)),i+1);
  }
  const last=slots.sort((a,b)=>b.generation-a.generation)[0];
  const broken=slots.map(s=>s===last?{...s,text:'{"schemaVersion":999}'}:s);
  const index=w.inspectWorkspace(broken);
  assert.equal(index.versions.filter(v=>v.valid).length,2);
  const pinned=index.versions.find(v=>v.valid);
  const next=w.planWorkspaceSave(broken,text,index.token);
  assert.notEqual(next.slot,pinned.id);
  assert.equal(w.workspaceToken(broken)===w.workspaceToken(slots),false);
});
test('malformed storage does not restore or poison generations',()=>{
  const invalid=[{slot:0,generation:NaN,text}, {slot:1,generation:2,text:'broken'}];
  assert.equal(w.inspectWorkspace(invalid).versions.every(v=>!v.valid),true);
  assert.throws(()=>w.planWorkspaceSave(invalid,text,w.workspaceToken(invalid)),/版本损坏/);
});
test('saved payload has only business fields and source cursors',()=>{
 const plan=w.planWorkspaceSave([],text,w.workspaceToken([]));
 assert.deepEqual(Object.keys(JSON.parse(plan.text)).sort(),['schemaVersion','format','revision','stores','records','overrides','cursors'].sort());
 assert.ok(domain.parseBusinessBackup(plan.text).cursors);
});
