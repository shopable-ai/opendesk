// Real native host protocol smoke. Not a replacement for Runtime JS or visual acceptance.
'use strict';
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createInterface} = require('node:readline');
const hostPath = path.resolve(process.argv[2]);
const profileArg = process.argv.find(arg=>arg.startsWith('--profile='));
const profile = profileArg ? profileArg.slice('--profile='.length) : 'full';
const interactiveMeasurement = process.argv.includes('--interactive-measurement');
const interactiveWaitArg = process.argv.find(arg=>arg.startsWith('--interactive-wait-ms='));
const interactiveWaitMs = interactiveWaitArg ? Number(interactiveWaitArg.slice('--interactive-wait-ms='.length)) : 8000;
assert(Number.isInteger(interactiveWaitMs) && interactiveWaitMs >= 1000 && interactiveWaitMs <= 60000, 'interactive wait must be 1000..60000ms');
assert(['full','hosted-deterministic'].includes(profile), `unsupported native host smoke profile: ${profile}`);
const hostedDeterministic = profile === 'hosted-deterministic';
const root = path.resolve('.runtime/tests/native-ui');
fs.mkdirSync(root, {recursive:true});
const publicRegistry = JSON.parse(fs.readFileSync(path.resolve('pkg/customui/assets/toolbar-icons-v1.json'),'utf8'));
const windowsRegistry = JSON.parse(fs.readFileSync(path.resolve('pkg/customui/winhost/icons.json'),'utf8'));
const publicNames = publicRegistry.icons.map(icon=>icon.name).sort();
assert.deepEqual(Object.keys(windowsRegistry).sort(), publicNames, 'Windows icon registry must cover every canonical public name exactly');
for (const name of publicNames) {
  const codePoints = Array.from(windowsRegistry[name].glyph || '');
  assert(codePoints.length >= 1 && codePoints.length <= 2,
    `Windows icon ${name} must map to one glyph or a reviewed two-glyph transport composite`);
}
const child = spawn(hostPath, [], {stdio:['pipe','pipe','pipe']});
let sequence=0,stderr='',pending=new Map(),events=[],measurementStyle=null;
let helloResolve,helloReject;
const hello = new Promise((a,b)=>{helloResolve=a;helloReject=b;});
child.stderr.on('data',d=>{stderr+=d;});
child.on('error',helloReject);
child.on('exit',(code)=>{for(const value of pending.values()){clearTimeout(value.timer);value.reject(new Error('host exited '+code+' '+stderr));}pending.clear();});
createInterface({input:child.stdout}).on('line',line=>{
  let frame;try{frame=JSON.parse(line);}catch(e){helloReject(e);return;}
  if(frame.kind==='hello'){helloResolve(frame);return;}
  if(frame.kind==='event'){events.push(frame.event);return;}
  const value=pending.get(frame.requestId);if(!value)return;
  pending.delete(frame.requestId);clearTimeout(value.timer);
  if(frame.ok)value.resolve(frame.result);else value.reject(Object.assign(new Error(frame.error?.message||'host request failed'),frame.error));
});
function call(operation,payload,windowId='toolbar'){
  const requestId=String(++sequence);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('host timeout '+operation+' '+stderr));},20000);
    pending.set(requestId,{resolve,reject,timer});
    child.stdin.write(JSON.stringify({version:'1.11.0',kind:'request',requestId,sessionId:'smoke',windowId,operation,payload})+'\n');
  });
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const button={id:'run',label:'Run',icon:'play.fill',state:{active:false,disabled:false,busy:false,revision:1}};
const label={id:'status',text:'Ready',width:120,alignment:'center',verticalAlignment:'center',tone:'primary',revision:1};
const control={id:'progress',kind:'progress',label:'Progress',width:160,disabled:false,checked:false,text:'',placeholder:'',maxLength:0,selected:'',options:[],min:0,max:5,step:0,value:1,indeterminate:false,revision:1};
const toolbar={schemaVersion:4,revision:1,orientation:'horizontal',maxWidth:960,maxColumns:19,items:[{type:'button',id:'run',button},{type:'label',id:'status',label},{type:'progress',id:'progress',control}]};
const notice={message:'正在执行 · Native UI smoke',caption:'Task progress and expiry are distinct',level:'info',timeoutMs:0,timeoutProgress:false,closable:true,progress:{min:0,max:5,value:1,indeterminate:false},position:{mode:'relative',target:'toolbar',side:'bottom',align:'center',gap:8,follow:true}};
(async()=>{
  const helloTimer=setTimeout(()=>helloReject(new Error('host did not send hello '+stderr)),10000);
  const greet=await hello;clearTimeout(helloTimer);assert.equal(greet.version,'1.11.0');
  await call('create',{id:'toolbar',kind:'floating',title:'Native UI smoke',bounds:{x:100,y:100,width:376,height:81},alwaysOnTop:true,draggable:true,theme:'dark',toolbar,controls:[{id:'run',type:'button',order:0}]},'toolbar');
  const tools=await call('show',{},'toolbar');assert.equal(tools.visible,true);assert(tools.nativeWindowId>0);
  const text=await call('getToolbarLabelState',{id:'status'},'toolbar');assert.equal(text.renderedText,'Ready');
  const changed=await call('applyToolbarLabel',{label:{...label,text:'Updated',revision:2}},'toolbar');assert.equal(changed.renderedText,'Updated');
  const progress=await call('applyToolbarControl',{control:{...control,value:3,revision:2}},'toolbar');assert.equal(progress.value,3);
  await call('create',{id:'notice',kind:'notification',title:'OpenDesk',bounds:{x:0,y:0,width:280,height:52},alwaysOnTop:true,draggable:false,notification:notice,controls:[]},'notice');
  const first=await call('show',{},'notice');assert.equal(first.visible,true);assert(first.nativeWindowId>0);
  const movedToolbar=await call('setBounds',{...tools.bounds,x:tools.bounds.x+40,y:tools.bounds.y+40},'toolbar');
  assert.notEqual(movedToolbar.bounds.x,tools.bounds.x);
  await sleep(250);
  const movedNotice=await call('getState',{},'notice');assert.notEqual(movedNotice.bounds.y,first.bounds.y);
  const update={...notice,message:'A long native notification expands in place while remaining within the controlled maximum width. '.repeat(7),caption:'The caption remains limited to two visible lines while full state text is retained. '.repeat(4),progress:{...notice.progress,value:3}};
  const next=await call('updateNotification',{spec:update,resetTimeout:false,reposition:false},'notice');
  assert.equal(next.nativeWindowId,first.nativeWindowId);assert.equal(next.notification.message,update.message);
  assert(next.bounds.width>first.bounds.width,'long notification must expand in place');
  assert(next.bounds.height>=52&&next.bounds.height<=124,'notification height must stay within the native bounds');
  const noticeHidden=await call('hide',{},'notice');assert.equal(noticeHidden.visible,false);assert.equal(noticeHidden.onScreen,false);
  await call('show',{},'notice');
  await call('updateNotification',{spec:{...update,timeoutMs:250,timeoutProgress:true},resetTimeout:true,reposition:false},'notice');
  await sleep(500);
  assert(events.some(e=>e.windowId==='notice'&&e.type==='close'&&e.reason==='timeout'),'native expiry close event missing');
  assert.equal((await call('getState',{},'notice')).status,'closed');
  const hidden=await call('hide',{},'toolbar');assert.equal(hidden.visible,false);assert.equal(hidden.onScreen,false);await call('show',{},'toolbar');
  if (!hostedDeterministic) {
    // WebSurface navigation requires a real interactive desktop/WebView environment.
    // Keep it in the full native-host smoke rather than weakening the hosted CI gate with a fake fallback.
    const webspec={id:'web',kind:'normal',title:'Restricted UI smoke',bounds:{x:120,y:200,width:420,height:200},alwaysOnTop:false,draggable:false,content:{html:'<div id="root"><span id="text">Ready</span><input id="input" type="text" value="a"><button id="ok">OK</button></div>',css:'body { margin: 12px; }',basePath:process.cwd()},controls:[{id:'root',type:'container',order:0},{id:'text',type:'text',order:1},{id:'input',type:'input',order:2},{id:'ok',type:'button',order:3}]};
    await call('create',webspec,'web');await call('show',{},'web');
    assert.equal((await call('getControlState',{id:'text'},'web')).text,'Ready');
    assert.equal((await call('updateControl',{id:'text',patch:{text:'Updated from host'}},'web')).text,'Updated from host');
    await call('close',{},'web');
    const imageName='measurement-pixel.png';
    fs.writeFileSync(path.join(root,imageName),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+AvzqWQAAAABJRU5ErkJggg==','base64'));
    const measurement={id:'measurement',kind:'measurement',title:'must not render',bounds:{x:160,y:220,width:420,height:260},alwaysOnTop:true,draggable:false,theme:'dark',content:{html:`<main id="root"><img id="preview" src="${imageName}"></main>`,css:'body { margin: 0; } #preview { width: 100%; height: 100%; object-fit: contain; }',basePath:root},measurement:{targetId:'preview'},controls:[{id:'root',type:'container',order:0},{id:'preview',type:'img',order:1}]};
    const measurementState=await call('create',measurement,'measurement');
    assert.equal(measurementState.alwaysOnTop,true);
    if(process.platform==='darwin') {
      assert.equal(measurementState.surfaceClass,'CDMeasurementPanel','Measurement must use the dedicated macOS panel');
      assert.equal(measurementState.borderless,true,'Measurement must not receive ordinary title chrome');
      assert.equal(measurementState.nonActivatingPanel,true,'Measurement must remain a non-document panel');
      assert.equal(measurementState.excludedFromWindowCycle,true,'Measurement must be absent from ordinary window cycling');
      assert.equal(measurementState.isPanel,true,'Measurement must be a native panel rather than a normal window');
      assert.equal(measurementState.screenOverlayLevel,true,'Measurement must cover the frozen target instead of falling behind it');
      assert.equal(measurementState.hostAccessory,true,'Measurement must not leave the host as a Dock/app-switcher application');
      measurementStyle={surfaceClass:measurementState.surfaceClass,borderless:measurementState.borderless,nonActivatingPanel:measurementState.nonActivatingPanel,excludedFromWindowCycle:measurementState.excludedFromWindowCycle,isPanel:measurementState.isPanel,screenOverlayLevel:measurementState.screenOverlayLevel,hostAccessory:measurementState.hostAccessory,layer:measurementState.layer};
    }
    const visibleMeasurement=await call('show',{},'measurement');assert.equal(visibleMeasurement.onScreen,true,'Measurement panel must be physically visible');
    if (interactiveMeasurement) {
      console.log('MEASUREMENT_INTERACTIVE_READY');
      await sleep(interactiveWaitMs);
      assert(events.some(e=>e.windowId==='measurement'&&e.type==='measurement.pointerdown'),'actual pointer input did not reach the Measurement overlay');
      assert(events.some(e=>e.windowId==='measurement'&&e.type==='measurement.pointerup'),'actual pointer release did not reach the Measurement overlay');
      assert(events.some(e=>e.windowId==='measurement'&&e.type==='measurement.key'&&e.fields?.key==='ArrowLeft'),'actual ArrowLeft did not reach the Measurement overlay');
    }
    let imageState=null;
    for(let index=0;index<20;index++){imageState=await call('getControlState',{id:'preview'},'measurement');if(imageState.imageComplete&&imageState.imageNaturalWidth===1&&imageState.imageNaturalHeight===1)break;await sleep(50);}
    assert.equal(imageState.imageComplete,true,'Measurement image must finish loading');
    assert.equal(imageState.imageNaturalWidth,1,'Measurement image must retain its natural width');
    assert.equal(imageState.imageNaturalHeight,1,'Measurement image must retain its natural height');
    await call('close',{},'measurement');
  }
  await call('closeSession',{},'');
  const coverage = hostedDeterministic
    ? {profile,verified:['hello','icon-registry','toolbar-lifecycle','toolbar-state','notification-lifecycle','notification-follow','notification-timeout'],requiresInteractive:['web-surface-navigation','web-surface-control-bridge','measurement-local-image']}
    : {profile,verified:['hello','icon-registry','toolbar-lifecycle','toolbar-state','notification-lifecycle','notification-follow','notification-timeout','web-surface-navigation','web-surface-control-bridge','measurement-local-image',...(interactiveMeasurement?['measurement-pointer-and-key-input']:[])],requiresInteractive:interactiveMeasurement?[]:['measurement-pointer-and-key-input']};
  fs.writeFileSync(path.join(root,'protocol-smoke.json'),JSON.stringify({hostPath,platform:process.platform,passed:true,coverage,measurementStyle,events,stderr},null,2));
  console.log('NATIVE_HOST_PROTOCOL_PASS');await call('shutdown',{},'');child.stdin.end();
})().catch(error=>{fs.writeFileSync(path.join(root,'protocol-smoke-error.json'),JSON.stringify({message:error.message,code:error.code,profile,stderr,events},null,2));console.error(error,stderr);child.kill();process.exitCode=1;});
