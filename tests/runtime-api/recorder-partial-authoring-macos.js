// Formal native acceptance, repository root; Calculator only, Agent-controlled input (not a human claim):
// ./dist/opendesk -ui -allow-recorder-capture -script tests/runtime-api/recorder-partial-authoring-macos.js -console-mode script
'use strict';
const out=File.join(Execution.workdir,'.runtime','tests','human-to-recipe','partial-authoring','recorder-native-'+Execution.id);
File.ensureDir(out);
const sequence=['2','5','×','4','+','1','0','='];
const task={schemaVersion:'recorder-task/v1',description:'通过 Calculator 按钮输入 25 × 4 + 10 =；从当前显示区实际读取 firstResult；清空界面但保留变量；通过按钮输入 6 × firstResult =；实际读取并输出 finalResult。',
  successConditions:'110 和 660 仅用于预期判据；本次显示→firstResult→清空后仍保留→后续按钮实际消费→本次终点显示读取。',
  allowedSideEffects:'仅 Calculator 必要激活、清空、按钮和读取；Recorder 自身交接窗口与系统剪贴板；不外发材料。',declaredAt:new Date().toISOString()};
function check(value,message){if(!value)throw new Error(message);}
function flatten(n){return[n].concat(...(n.children||[]).map(flatten));}
async function clickNativeCopy(app){
  const surface=await app.toolbar().getState(),b=surface.bounds;
  check(surface.status==='visible'&&b.width===584&&b.height===81,'Measured Recorder toolbar layout changed; stop before input');
  const displays=Screen.getDisplays().filter(d=>b.x>=d.x&&b.y>=d.y&&b.x+b.width<=d.x+d.width&&b.y+b.height<=d.y+d.height);
  check(displays.length===1&&displays[0].scale===1,'Unverified Recorder display mapping');
  const region=Geometry.regionOffset(displays[0],{left:b.x-displays[0].x,top:b.y-displays[0].y,width:b.width,height:b.height});
  const fresh=await app.toolbar().getState();check(['x','y','width','height'].every(key=>fresh.bounds[key]===b[key]),'Recorder moved; no input');
  // Exact local measurement in recorder-preview.png. This test does not use the floating panel's unavailable CG title.
  await mouse.clickPoint(Geometry.pointOffset(region,296,55));
  return surface;
}
const savedInput=Execution.env.OPENDESK_RECORDER_PARTIAL_SAVED_RECORDING;
if(savedInput){
  // Native button acceptance using fixed inputs. No Recorder capture or Calculator input in this branch.
  // Do not count the injected control state as another live recording or a continuous Human run.
  const dir=File.join(Execution.workdir,savedInput);
  check(String(savedInput).startsWith('.runtime/recordings/rec-')&&!String(savedInput).includes('..'),'Unsupported saved recording root');
  const manifest=JSON.parse(File.read(File.join(dir,'manifest.json'))),actions=JSON.parse(File.read(File.join(dir,'actions.json')));
  check(manifest.state==='stopped'&&manifest.storage.state==='saved'&&actions.readiness==='ready','Saved inputs are not a valid terminal package');
  const root=File.join(Execution.workdir,'apps','opendesk','recorder');
  globalThis.__OPENDESK_RECORDER_UI_ROOT=root;
  try{(0,eval)(File.read(File.join(root,'controller.js')));}finally{delete globalThis.__OPENDESK_RECORDER_UI_ROOT;}
  const recorded={recordingDir:dir,rawFile:File.join(dir,'events.ndjson'),manifestFile:File.join(dir,'manifest.json'),captureState:'stopped',storageState:'saved'};
  const fixedRecorder={getCapabilities:()=>({capture:{available:true},actions:{available:true}}),
    start:async()=>({status:()=>({captureState:'recording'}),stop:async()=>recorded}),
    buildActions:async()=>({actionsFile:File.join(dir,'actions.json'),readiness:actions.readiness}),
    generateScript:async()=>({scriptFile:File.join(dir,'semantic.recipe.js'),candidateFile:File.join(dir,'semantic.candidate.json'),mode:'semantic',verification:'not-run'})};
  let copied=null;
  const app=OpenDeskSimpleRecordingConsole.createApp({task,refinementScope:'complete-task',recorder:fixedRecorder,countdownStepMs:0,
    windowID:'recording-console-partial-fixed-inputs',windowTitle:'OpenDesk — Recorder · 固定材料交接验收',
    getActiveWindow:async()=>({pid:manifest.within.processId,title:manifest.within.title}),
    copyText:text=>{clipboard.copy(text);copied=text;File.write(File.join(out,'clipboard.txt'),text);}});
  try{
    await app.show();await app.start();await app.stop();
    check(app.state().phase==='generated','Fixed inputs did not reach the existing native copy callback');
    const surface=await clickNativeCopy(app),b=surface.bounds;
    const deadline=Date.now()+5000;while(!copied&&Date.now()<deadline)await page.waitForTimeout(50);
    check(copied&&app.state().promptCopyStatus==='copied','Native copy click outcome unconfirmed; do not retry');
    await File.writeJSON(File.join(out,'result.json'),{scope:'actual native copy button / fixed-input host adapter; no capture or Calculator input in this invocation',
      recordingDir:dir,actualNativeCopyButton:true,continuousHumanRun:false,clipboardFile:File.join(out,'clipboard.txt'),state:app.state(),surface});
    File.write(File.join(Execution.workdir,'.runtime/tests/human-to-recipe/partial-authoring/handoff-native-ready.json'),JSON.stringify({out,bounds:b}));
    console.log(JSON.stringify({passed:true,actualNativeCopyButton:true,controlledSavedInputs:true,evidence:out}));
    await page.waitForTimeout(10000);
  }finally{await app.close();}
}else{
let calculator=await window.get({app:{bundleId:'com.apple.calculator'}});
check(calculator.title==='Calculator'&&calculator.width===232&&calculator.height===321,'Unsupported Calculator');
calculator=await window.activate(calculator,{timeout:1000});
async function observe(){
  const current=await window.current(calculator);
  check(current.id===calculator.id&&current.pid===calculator.pid&&current.handle===calculator.handle
    &&current.x===calculator.x&&current.y===calculator.y&&current.width===232&&current.height===321
    &&current.isForeground&&current.hasFocus,'Calculator identity/focus/layout changed; stop');
  const snapshot=await Accessibility.snapshot({within:current,maxDepth:16,maxNodes:300,properties:['role','name','value','enabled','actions','nativeBounds']});
  check(snapshot.complete&&!snapshot.truncated,'Incomplete Calculator snapshot');
  const root=snapshot.root.nativeBounds;
  check(root&&root.coordinateSpace==='macos-global-display-points-top-left'
    &&Math.abs(root.x-current.x)<4&&Math.abs(root.y-current.y)<4
    &&Math.abs(root.width-current.width)<4&&Math.abs(root.height-current.height)<4,'Native/window coordinate mapping unavailable');
  return {current,snapshot,root,nodes:flatten(snapshot.root)};
}
function unique(observation,name){
  const nodes=observation.nodes.filter(n=>n.role==='button'&&n.name===name);
  check(nodes.length===1&&nodes[0].enabled&&nodes[0].actions.includes('invoke'),'Missing/ambiguous button '+name);return nodes[0];
}
// Necessary fresh recording start; bounded all-clear precedes recording and is never recorded as business.
for(let i=0;i<2;i++){
  const o=await observe(),clear=o.nodes.filter(n=>n.role==='button'&&['清除','全部清除'].includes(n.name));
  check(clear.length===1,'Ambiguous clear');const name=clear[0].name;
  const receipt=await UI.tapTargets([{role:'button',name}],{within:calculator});
  check(receipt.ok&&receipt.completed.length===1&&receipt.completed[0].actionState==='acknowledged','Unknown clear input; stop');
  if(name==='全部清除')break;
}
check(await UI.readText({within:calculator})==='0','Recording start is not zero');
const preflight=await observe();for(const name of new Set(sequence))unique(preflight,name);
const root=File.join(Execution.workdir,'apps','opendesk','recorder');
globalThis.__OPENDESK_RECORDER_UI_ROOT=root;
try{(0,eval)(File.read(File.join(root,'controller.js')));}finally{delete globalThis.__OPENDESK_RECORDER_UI_ROOT;}
let copied=null;
const title='OpenDesk — Recorder · 部分录制验收';
const app=OpenDeskSimpleRecordingConsole.createApp({task,refinementScope:'complete-task',windowTitle:title,
  windowID:'recording-console-partial-acceptance',countdownStepMs:0,captureKeyboard:false,maxDurationMs:45000,
  getActiveWindow:()=>window.current(calculator),openDeskBinary:System.getExecutablePath(),
  copyText:text=>{clipboard.copy(text);copied=text;File.write(File.join(out,'clipboard.txt'),text);}});
try{
  await app.show();await window.activate(calculator,{timeout:1000});await app.start();
  check(app.state().phase==='recording','Recorder did not start; inspect capture permission');
  for(const name of sequence){
    const o=await observe(),node=unique(o,name),bounds=node.nativeBounds;
    check(bounds&&bounds.coordinateSpace===o.root.coordinateSpace,'Missing verified native geometry');
    const xp=(bounds.x+bounds.width/2-o.root.x)/o.root.width*100;
    const yp=(bounds.y+bounds.height/2-o.root.y)/o.root.height*100;
    check(xp>0&&xp<100&&yp>0&&yp<100,'Button outside verified Calculator root');
    await mouse.clickPoint(Geometry.pointPercent(o.current,xp,yp),{button:'left',clickCount:1,delay:30});
    await page.waitForTimeout(500);
  }
  await app.stop();
  const state=app.state();check(state.saved&&state.actions&&state.actions.readiness==='ready','Recorder package is not a valid saved partial');
  const actions=JSON.parse(File.read(state.actions.actionsFile));
  check(actions.actions.length===sequence.length&&actions.actions.map(a=>a.target.element.name).join(',')===sequence.join(','),'Recorded actions differ from the authorized key segment');
  const recordingDisplay=await UI.readText({within:calculator}); // Evidence only; never a future Recipe input.
  check(recordingDisplay==='110','Recorded first segment failed independent display check');
  const recorderSurface=await clickNativeCopy(app),recorderWindow=recorderSurface.bounds;
  const deadline=Date.now()+5000;while(!copied&&Date.now()<deadline)await page.waitForTimeout(50);
  check(copied&&copied.includes('human-to-recipe/SKILL.md')&&copied.includes('task-'),'Actual native copy button did not hand off the saved task');
  const screenshot=await page.screenshot({clip:{x:recorderWindow.x,y:recorderWindow.y,width:recorderWindow.width,height:recorderWindow.height},
    path:File.join(out,'recorder.png'),returnType:'object'});
  await File.writeJSON(File.join(out,'result.json'),{actor:{executor:'agent',collector:'Recorder',basis:'this acceptance script'},
    userHumanInput:'not-run',recordingDisplay,scope:'native capture and actual native copy button; historical guidance, no qualification transfer',
    controllerRoot:root,state:app.state(),screenshot,clipboardFile:File.join(out,'clipboard.txt')});
  console.log(JSON.stringify({passed:true,recordingDir:state.saved.recordingDir,actionsFile:state.actions.actionsFile,taskFile:state.taskFile,
    actualNativeCopyButton:true,humanExecutor:false,evidence:out}));
}finally{await app.close();}
}
