// Repository root (formal staging gate, never the public command):
// node tests/custom-ui/tools/support-app/run-workspace-native.mjs prepare|observe|public|run [new-attempt-directory]
// `run` is for the final UI/bridge after the owner announces readiness.
// `observe` permits only settings navigation, preflight and screenshots.
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, relative, sep, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { stageApp } from '../../../../examples/ai-customer-support/scripts/stage-app.mjs';

const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const mode=process.argv[2]||'prepare';
if (!['prepare','observe','public','probe','run'].includes(mode)||process.argv.length>4) throw Error('Usage: run-workspace-native.mjs prepare|observe|public|probe|run [new-attempt-directory]');
const root=resolve(repo,'.runtime/tests/ai-customer-support/workspace-20261030');
const evidence=resolve(repo,process.argv[3]||join(root,`${mode}-${Date.now()}`));
const inside=relative(root,evidence);
if (!inside||inside==='..'||inside.startsWith('..'+sep)) throw Error('Attempt must be new and inside '+root);
// Reject aliased output ancestors, not only the final directory.
for(let p=dirname(evidence);;p=dirname(p)) {
  try { if(lstatSync(p).isSymbolicLink()) throw Error('Aliased evidence ancestor: '+p); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  if(p===dirname(p)) break;
}
mkdirSync(dirname(evidence),{recursive:true}); mkdirSync(evidence);
const out=(name,data)=>writeFileSync(join(evidence,name+'.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sourceRoot=join(repo,'examples/ai-customer-support');
const gate=join(repo,'tests/custom-ui/ai-customer-support-workspace-native.js');
const binary=join(repo,'dist/opendesk'), bundle=join(repo,'dist/OpenDesk.app');
const helper=join(bundle,'Contents/Helpers/opendesk-ui-host');
const runRead=(command,args)=>{
  const r=spawnSync(command,args,{cwd:repo,encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024});
  if(r.error||r.status!==0) throw Error(`${command} failed: ${r.error?.message||r.stderr}`);
  return {stdout:r.stdout,stderr:r.stderr};
};
const actualHelper=join(repo,'dist/opendesk-ui-host');
const files={binary,helper,actualHelper,gate,html:join(sourceRoot,'preview/index.html'),host:join(sourceRoot,'desktop/app-host.js'),
  bridge:join(sourceRoot,'desktop/business-files.js'),validator:join(sourceRoot,'desktop/business-validator.generated.js')};
try {
  const signing=runRead('/usr/bin/codesign',['-dv','--verbose=4',bundle]);
  if(!signing.stderr.includes('Authority=OpenDesk Local Development')) throw Error('Unexpected development signing identity');
  runRead('/usr/bin/codesign',['--verify','--deep','--strict',bundle]);
  runRead('/usr/bin/codesign',['--verify','--strict',actualHelper]);
  if(sha(actualHelper)!==sha(helper))throw Error('Dist helper differs from refreshed signed bundle helper');
  const integrity=JSON.parse(readFileSync(join(sourceRoot,'desktop/app-integrity.json'),'utf8'));
  if(integrity.previewSha256!==sha(files.html)) throw Error('Current HTML integrity mismatch');
  const provenance={at:new Date().toISOString(),mode,scope:'instrumented staging; source preview/host/bridge copied byte-for-byte; stable signed dist; not installed/public acceptance',
    head:runRead('git',['rev-parse','HEAD']).stdout.trim(),dirty:runRead('git',['status','--short']).stdout,
    signing,goBuild:runRead('/Users/shopme/.local/opt/go1.25.13-amd64/bin/go',['version','-m',binary]).stdout,
    buildLogPath:join(root,'native-build-private.log'),
    buildLogSha256:sha(join(root,'native-build-private.log')),
    files:Object.fromEntries(Object.entries(files).map(([key,path])=>[key,{path,realPath:realpathSync(path),sha256:sha(path),mtime:statSync(path).mtime.toISOString()}]))};
  out('provenance',provenance);
  if(mode==='prepare') {
    out('result',{status:'PREPARED',native:'NOT_RUN',visual:'NOT_REVIEWED',stages:['seed','reopen','damaged'],
      stop:'No replay after unknown input; do not run full gate until final readiness notification'});
    console.log('PREPARED '+evidence);
  } else if(mode==='public') {
    // Exact README command, from repo root, with its unchanged source entry.
    const args=['-app','examples/ai-customer-support','-console-mode','script','-log-dir','.runtime/tests/ai-customer-support/workspace-20261030/public-app'];
    const child=spawn('./dist/opendesk',args,{cwd:repo,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',exited=false,timedOut=false;
    child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
    const ended=new Promise(resolve=>{child.once('exit',(code,signal)=>{exited=true;resolve({code,signal});});child.once('error',error=>{exited=true;resolve({error:String(error)});});});
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},90000);
    try {
      let startup;
      const deadline=Date.now()+20000;
      while(Date.now()<deadline&&!exited&&!startup) {
        for(const line of stdout.split('\n')) {
          const index=line.indexOf('SUPPORT_APP ');
          if(index<0)continue;
          try { const item=JSON.parse(line.slice(index+12));if(item.type==='startup')startup=item; } catch {}
        }
        if(!startup)await new Promise(resolve=>setTimeout(resolve,150));
      }
      if(!startup||realpathSync(startup.root)!==realpathSync(sourceRoot)||startup.sha256!==provenance.files.html.sha256) throw Error('Public source loading not proven');
      out('public-startup',startup);
      const w=startup.window;
      const target={id:'darwin:'+w.hostPid+':native:'+w.nativeWindowId,pid:w.hostPid,handle:w.nativeWindowId,title:'OpenDesk · AI 客服助手（未连接）',...w.bounds};
      const config={target,evidence:join(evidence,'external'),phase:'observe',fileRoot:join(repo,'.runtime/business-sync'),closeObserve:true,expectedHost:actualHelper};
      mkdirSync(config.evidence);out('external-config',config);
      const code=`await (0,eval)(File.read(${JSON.stringify(gate)}))(await File.readJSON(${JSON.stringify(join(evidence,'external-config.json'))}))`;
      const observed=await new Promise(resolve=>{
        const controller=spawn(binary,['-ui','-script-text',code,'-console-mode','script','-log-dir',join(evidence,'controller')],{cwd:repo,stdio:['ignore','pipe','pipe']});
        let output='',errors='';controller.stdout.on('data',b=>{output+=b;});controller.stderr.on('data',b=>{errors+=b;});
        const limit=setTimeout(()=>controller.kill('SIGTERM'),60000);
        controller.once('error',error=>{clearTimeout(limit);resolve({error:String(error),output,errors});});
        controller.once('exit',(code,signal)=>{clearTimeout(limit);resolve({code,signal,output,errors});});
      });
      out('external-controller',observed);
      if(observed.code!==0)throw Error('Public external observation failed; inspect controller evidence');
      const outcome=await ended;
      const result=JSON.parse(readFileSync(join(config.evidence,'result.json'),'utf8'));
      if(timedOut||outcome.code!==0||result.status!=='OBSERVED')throw Error('Public lifecycle/observation failed');
      out('result',{status:'PUBLIC_LOADED_OBSERVED',command:'./dist/opendesk '+args.join(' '),cwd:repo,entryUnmodified:true,startup,outcome,result,visual:'NOT_REVIEWED',functional:'NOT_RUN'});
      console.log('PUBLIC observed '+evidence);
    } finally {
      clearTimeout(timer);
      if(!exited)child.kill('SIGTERM'); // Only this command's owned child.
      writeFileSync(join(evidence,'public.stdout.log'),stdout);writeFileSync(join(evidence,'public.stderr.log'),stderr);
    }
  } else {
    const packageRoot=stageApp({sourceRoot,destination:join(evidence,'package')});
    const entry=join(packageRoot,'main.js'), originalEntry=readFileSync(entry,'utf8');
    const fileRoot=join(packageRoot,'.runtime/business-sync'); mkdirSync(fileRoot,{recursive:true});
    // Opaque 96x64 blue/gold checker PNG; visible in native preview screenshots.
    // The gate also checks exact exported bytes and product/source ownership.
    const image='iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAYAAADlNHIOAAAAvElEQVR4nO3RQQ3DQBAEwUNjBsYYMCFiPCaQgLjHadX12HfvqNb7vX87d32erav31+kH6n0AANp9AADafQAA2n0AANp9AADafQAA2n0AANr9NX3A9D4AAO0+AADtPgAA7T4AAO0+AADtPgAA7T4AAO0+gNMA0wdM7wMA0O4DANDuAwDQ7gMA0O4DANDuAwDQ7gMA0O4DOA0wfcD0PgAA7T4AAO0+AADtPgAA7T4AAO0+AADtPgAA7T6Aw/0/SyU/sk2WJkkAAAAASUVORK5CYII=';
    const imageDataUrl='data:image/png;base64,'+image;
    writeFileSync(join(fileRoot,'support-image.png'),Buffer.from(image,'base64'),{flag:'wx'});
    writeFileSync(join(fileRoot,'p3-input.json'),JSON.stringify({schemaVersion:1,storeId:'store-demo',sourceId:'p3-fixture',previousCursor:null,cursor:'p3-v1',records:[]}),{flag:'wx'});
    const stages=[];
    const slots=()=>readdirSync(fileRoot).filter(n=>/^workspace-slot-[012]\.json$/.test(n)).map(name=>({name,...JSON.parse(readFileSync(join(fileRoot,name),'utf8'))})).sort((a,b)=>b.generation-a.generation);
    async function launch(phase,prior={}) {
      const phaseDir=join(evidence,phase);mkdirSync(phaseDir);
      // Only the entry suffix instruments startup/observation; no postMessage,
      // DOM eval, reducer dispatch or business-state write is added.
      const config={phase,prior:{imageDataUrl,...prior},evidence:phaseDir,fileRoot,expectedHost:actualHelper};
      writeFileSync(entry,originalEntry+`\ntry {
        const w=await supportApp.panel.getState();
        const target={id:'darwin:'+w.hostPid+':native:'+w.nativeWindowId,pid:w.hostPid,handle:w.nativeWindowId,title:'OpenDesk · AI 客服助手（未连接）',...w.bounds};
        await File.writeJSON(${JSON.stringify(join(phaseDir,'startup-window.json'))},w);
        await (0,eval)(File.read(${JSON.stringify(gate)}))({...${JSON.stringify(config)},target});
        ${['observe','probe'].includes(phase)?'await automation.app.quit();':''}
      } catch(error) {
        await File.writeJSON(${JSON.stringify(join(phaseDir,'caught-error.json'))},{error:String(error),code:error.code??null,actionState:error.actionState??null});
        await automation.app.quit();
      }\n`);
      const args=['-app',packageRoot,'-console-mode','script','-log-dir',join(phaseDir,'app')];
      const child=spawn(binary,args,{cwd:repo,stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='',timedOut=false;
      child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
      const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},360000);
      // Capture actual process ownership and loaded helper path while it exists.
      const sample=setInterval(()=>{
        const p=spawnSync('/bin/ps',['-axo','pid,ppid,command'],{encoding:'utf8'});
        writeFileSync(join(phaseDir,'processes.log'),(p.stdout||'').split('\n').filter(line=>line.includes(String(child.pid))||line.includes(helper)).join('\n')+'\n');
      },2000);
      const outcome=await new Promise(resolve=>{child.once('error',error=>resolve({error:String(error)}));child.once('exit',(code,signal)=>resolve({code,signal}));});
      clearTimeout(timer);clearInterval(sample);
      writeFileSync(join(phaseDir,'stdout.log'),stdout);writeFileSync(join(phaseDir,'stderr.log'),stderr);
      let result;
      try { result=JSON.parse(readFileSync(join(phaseDir,'result.json'),'utf8')); }
      catch { result={status:'FAIL',error:'No native result: inspect startup/single-instance/timeout; input must not be replayed'}; }
      const expected=phase==='observe'?'OBSERVED':'PASS';
      const stage={phase,args,childPid:child.pid,...outcome,timedOut,result,entrySha256:sha(entry)};
      stages.push(stage);out(phase+'-process',stage);
      if(timedOut||outcome.code!==0||result.status!==expected) throw Error('Native '+phase+' failed: '+(result.error||JSON.stringify(outcome)));
      // Provenance drift is checked between launches, before any further input.
      for(const [key,file] of Object.entries(files)) if(sha(file)!==provenance.files[key].sha256) throw Error('Source/binary drift after '+phase+': '+key);
    }
    if(mode==='probe') {
      await launch('probe');
      out('result',{status:'FIELD_PROBE_PASS',stages,visual:'NOT_REVIEWED'});
    } else if(mode==='observe') {
      await launch('observe');
      out('result',{status:'OBSERVED',stages,nativeWorkflow:'NOT_RUN',visual:'NOT_REVIEWED'});
    } else {
      await launch('seed');
      let versions=slots();
      if(versions.length!==2) throw Error('Expected two complete versions after seed');
      const seed=versions.map(v=>({name:v.name,generation:v.generation,sha256:sha(join(fileRoot,v.name)),text:v.text}));
      out('saved-versions',seed);
      await launch('reopen',{generation:versions[0].generation,productName:'p3 latest workspace'});
      versions=slots();
      if(versions.length!==3) throw Error('Expected three versions before controlled corruption');
      const newest=versions[0],oldest=versions.at(-1),damagedPath=join(fileRoot,newest.name);
      // Authorized host fault injection only inside this new isolated package.
      // Preserve the latest envelope, then make only its payload invalid.
      out('corruption-before',{name:newest.name,generation:newest.generation,sha256:sha(damagedPath),envelope:newest});
      writeFileSync(damagedPath,JSON.stringify({schemaVersion:1,generation:newest.generation,text:'{invalid backup'}));
      out('corruption-after',{name:newest.name,sha256:sha(damagedPath),recoverGeneration:oldest.generation});
      await launch('damaged',{generation:oldest.generation,productName:'p3 native product'});
      out('result',{status:'FUNCTIONAL_PASS_VISUAL_PENDING',stages,visual:'NOT_REVIEWED',publicCommand:'NOT_RUN',installedPackage:'NOT_RUN',
        limits:['Screenshots require actual visual inspection for SVG/title clipping, input alignment, window size and whitespace.','Staging evidence does not qualify the public command or an installed app.']});
    }
    console.log(mode.toUpperCase()+' finished; inspect '+evidence);
  }
} catch(error) {
  out('failure',{status:'FAIL',error:String(error),native:'See per-stage result; never infer unrun stages passed',visual:'NOT_REVIEWED'});
  console.error(String(error)+'\nEvidence: '+evidence);process.exitCode=1;
}
