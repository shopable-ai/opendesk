import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { appServerTurn } from '../../examples/codex-workflow-companion/core/adapters.mjs';

test('App Server adapter verifies initialize, thread/start and turn/start acknowledgements independently',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'od-cwf-appserver-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const fake=path.join(dir,'fake.mjs');
  fs.writeFileSync(fake,`import readline from 'node:readline';
const rl=readline.createInterface({input:process.stdin});
rl.on('line',line=>{const msg=JSON.parse(line);const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
if(msg.method==='initialize')send({id:msg.id,result:{userAgent:'fake'}});
if(msg.method==='thread/start')send({id:msg.id,result:{thread:{id:'thread-test'}}});
if(msg.method==='turn/start'){send({id:msg.id,result:{turn:{id:'turn-test'}}});setTimeout(()=>send({method:'turn/completed',params:{turn:{status:'completed'}}}),10);}
});`);
  let terminal='';
  const result=await appServerTurn('prompt text',{spawnFn:()=>spawn(process.execPath,[fake],{stdio:['pipe','pipe','pipe']}),onTurnCompleted:status=>terminal=status});
  assert.equal(result.threadId,'thread-test');assert.equal(result.turnId,'turn-test');
  await new Promise(r=>setTimeout(r,40));assert.equal(terminal,'completed');result.process.kill();
});

test('App Server failure before handshake never claims a desktop submission',async()=>{
  await assert.rejects(()=>appServerTurn('prompt',{spawnFn:()=>spawn('/this-command-does-not-exist',['app-server'],{stdio:['pipe','pipe','pipe']}),timeoutMs:100}),err=>{
    assert.equal(err.dispatchPossiblySent,false);return true;
  });
});
