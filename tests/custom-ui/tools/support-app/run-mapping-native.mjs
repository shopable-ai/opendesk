// Repository root: node tests/custom-ui/tools/support-app/run-mapping-native.mjs
// Runs the guide's exact public command, then controls only its reported window.
import { mkdirSync, readFileSync, writeFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const source = join(repo, 'examples/ai-customer-support');
const evidence = join(repo, '.runtime/tests/ai-customer-support/mapping-20261030', 'native-' + Date.now());
mkdirSync(evidence, { recursive:true });
const out = (name, value) => writeFileSync(join(evidence, name + '.json'), JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const binary = join(repo, 'dist/opendesk');
const bundle = join(repo, 'dist/OpenDesk.app');
const helper = join(repo, 'dist/opendesk-ui-host');
const gate = join(repo, 'tests/custom-ui/ai-customer-support-workspace-native.js');
const scenario = join(repo, 'tests/custom-ui/ai-customer-support-mapping-native.js');
const files = { binary, helper, gate, scenario, entry:join(source,'main.js'), html:join(source,'preview/index.html'),
  host:join(source,'desktop/app-host.js'), bridge:join(source,'desktop/business-files.js'), integrity:join(source,'desktop/app-integrity.json') };
const readCommand = (command, args) => {
  const result = spawnSync(command, args, {cwd:repo,encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024});
  if (result.error || result.status !== 0) throw Error(command + ': ' + (result.error?.message || result.stderr));
  return {stdout:result.stdout,stderr:result.stderr};
};
let child, controller, ended, exited = false, timedOut = false, timer;
let stdout = '', stderr = '';
try {
  const signing = readCommand('/usr/bin/codesign', ['-dv','--verbose=4',bundle]);
  if (!signing.stderr.includes('Authority=OpenDesk Local Development')) throw Error('Unexpected development signature');
  readCommand('/usr/bin/codesign', ['--verify','--deep','--strict',bundle]);
  readCommand('/usr/bin/codesign', ['--verify','--strict',helper]);
  if (sha(helper) !== sha(join(bundle,'Contents/Helpers/opendesk-ui-host'))) throw Error('Helper/bundle mismatch');
  if (JSON.parse(readFileSync(files.integrity,'utf8')).previewSha256 !== sha(files.html)) throw Error('HTML integrity mismatch');
  if (!readFileSync(gate,'utf8').includes("phase === 'scenario'")) throw Error('Shared native gate scenario entry is not ready');
  const provenance = {at:new Date().toISOString(),cwd:repo,head:readCommand('git',['rev-parse','HEAD']).stdout.trim(),signing,
    goBuild:readCommand('/Users/shopme/.local/opt/go1.25.13-amd64/bin/go',['version','-m',binary]).stdout,
    files:Object.fromEntries(Object.entries(files).map(([key,path]) => [key,{path,realPath:realpathSync(path),sha256:sha(path),mtime:statSync(path).mtime.toISOString()}]))};
  out('provenance', provenance);
  const args = ['-app','examples/ai-customer-support','-console-mode','script','-log-dir','.runtime/tests/ai-customer-support/mapping-manual'];
  child = spawn('./dist/opendesk', args, {cwd:repo,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
  ended = new Promise(resolve => {
    child.once('exit', (code,signal) => { exited=true;resolve({code,signal}); });
    child.once('error', error => { exited=true;resolve({error:String(error)}); });
  });
  timer = setTimeout(() => { timedOut=true;child.kill('SIGTERM'); }, 240000);
  let startup;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && !exited && !startup) {
    for (const line of stdout.split('\n')) {
      const offset = line.indexOf('SUPPORT_APP ');
      if (offset < 0) continue;
      try { const item=JSON.parse(line.slice(offset+12));if(item.type==='startup')startup=item; } catch { /* Wait for a complete line. */ }
    }
    if (!startup) await new Promise(resolve => setTimeout(resolve,150));
  }
  if (!startup || realpathSync(startup.root) !== realpathSync(source) || startup.sha256 !== provenance.files.html.sha256)
    throw Error('Public command source loading not proven; do not target an older single instance');
  out('public-startup', {childPid:child.pid,...startup});
  const w = startup.window;
  const config = {target:{id:'darwin:'+w.hostPid+':native:'+w.nativeWindowId,pid:w.hostPid,handle:w.nativeWindowId,
    title:'OpenDesk · AI 客服助手（未连接）',...w.bounds},evidence:join(evidence,'external'),phase:'scenario',scenario,
    fileRoot:join(repo,'.runtime/business-sync'),expectedHost:helper};
  mkdirSync(config.evidence); out('external-config', config);
  const script = join(evidence,'controller.js');
  writeFileSync(script, `await (0,eval)(File.read(${JSON.stringify(gate)}))(await File.readJSON(${JSON.stringify(join(evidence,'external-config.json'))}));\n`, {flag:'wx'});
  const observed = await new Promise(resolve => {
    controller = spawn(binary, ['-ui','-script',script,'-console-mode','script','-log-dir',join(evidence,'controller')], {cwd:repo,stdio:['ignore','pipe','pipe']});
    let output='', errors='';
    controller.stdout.on('data', b => {output+=b;});controller.stderr.on('data', b => {errors+=b;});
    const limit=setTimeout(() => controller.kill('SIGTERM'),210000);
    controller.once('error',error => {clearTimeout(limit);resolve({error:String(error),output,errors});});
    controller.once('exit',(code,signal) => {clearTimeout(limit);resolve({code,signal,output,errors});});
  });
  out('external-controller', observed);
  if (observed.code !== 0) throw Error('Native controller failed; inspect receipts before further input');
  const outcome = await ended;
  const result = JSON.parse(readFileSync(join(config.evidence,'result.json'),'utf8'));
  if (timedOut || outcome.code !== 0 || result.status !== 'PASS') throw Error('Native gate/lifecycle failed');
  for (const [key,path] of Object.entries(files)) if(sha(path)!==provenance.files[key].sha256) throw Error('Provenance drift: '+key);
  out('result', {status:'PUBLIC_FUNCTIONAL_PASS_VISUAL_PENDING',command:'./dist/opendesk '+args.join(' '),cwd:repo,
    entryUnmodified:true,startup,outcome,result,visual:'NOT_REVIEWED',installedPackage:'NOT_RUN',realPlatform:'NOT_RUN'});
  console.log('MAPPING_NATIVE_PASSED; evidence=' + evidence);
} catch (error) {
  out('failure', {status:'FAIL',error:String(error),timedOut,action:'Inspect the saved native result and input receipt; never blindly replay the input prefix.'});
  console.error(String(error) + '\nEvidence: ' + evidence);process.exitCode=1;
} finally {
  clearTimeout(timer);
  if (controller && controller.exitCode === null && controller.signalCode === null) controller.kill('SIGTERM');
  if (child && !exited) { child.kill('SIGTERM'); await ended; }
  writeFileSync(join(evidence,'public.stdout.log'),stdout);writeFileSync(join(evidence,'public.stderr.log'),stderr);
}
