// From repository root (paired development bundle):
// ./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script tests/runtime-api/custom-ui-toolbar-text.js -console-mode script -log-dir .runtime/tests/custom-ui-toolbar-text/run
// Only own native windows; no external app lookup, keyboard or clipboard input.
const root=File.join(File.cwd(),'.runtime/tests/custom-ui-toolbar-text');
await File.ensureDir(root);
function check(value,message){if(!value)throw new Error(message);}
async function invalid(fn){
  let caught;try{await fn();}catch(e){caught=e;}
  check(caught&&caught.code==='INVALID_SPEC','Expected INVALID_SPEC');
}
const toolbar=new FloatingWindow({orientation:'vertical',position:{mode:'absolute',x:300,y:180}});
for(const icon of [{text:''},{text:'12345'},{text:'a b'},{text:'a\n'},
  {text:'a\0'},{text:'审阅',path:'fake.png'},{text:'审阅',extra:true}]){
  await invalid(()=>toolbar.addButton('bad','Bad',icon));
}
toolbar.addButton('text','完整语义名称，与可见文字独立',{text:'审阅'});
toolbar.addButton('legacy','旧图标调用兼容','message.fill');
const result={scope:'OWN_OPENDESK_NATIVE_ONLY',invalidDeclarations:7};
try{
  await toolbar.show();await System.delay(350);
  let before=await toolbar.getButtonState('text');
  check(before.renderedText==='审阅'&&before.icon.text==='审阅'&&before.iconPresentation.kind==='text','Text readback');
  check(before.tooltip===before.label&&before.accessibilityName===before.label,'Semantic metadata');
  check(before.screenBounds.width===40&&before.screenBounds.height===40,'Compact geometry');
  const old=await toolbar.getButtonState('legacy');
  check(old.renderedText===''&&old.icon==='message.fill'&&old.iconPresentation.kind==='builtIn','Legacy icon compatibility');
  const next=await toolbar.updateButton('text',{icon:{text:'计划'},label:'Plan semantic',disabled:true});
  check(next.renderedText==='计划'&&next.disabled&&next.label==='Plan semantic','Atomic text/label/state update');
  for(const icon of [{text:'12345'},{text:' '},{text:'x',path:'bad.png'},{text:'x',extra:true}]){
    await invalid(()=>toolbar.updateButton('text',{icon}));
    const fresh=await toolbar.getButtonState('text');
    check(fresh.revision===next.revision&&fresh.renderedText==='计划','Invalid patch changed applied state');
  }
  const icon=await toolbar.updateButton('text',{icon:'timer',disabled:false});
  check(icon.renderedText===''&&icon.icon==='timer','Text to icon transition');
  const text=await toolbar.updateButton('text',{icon:{text:'继续'}});
  check(text.renderedText==='继续'&&text.iconPresentation.kind==='text','Icon to text transition');
  const busy=await toolbar.updateButton('text',{busy:true});
  check(busy.busy&&busy.icon.text==='继续'&&busy.renderedText==='稍候','Busy actual text');
  const busyRead=await toolbar.getButtonState('text');
  check(busyRead.revision===busy.revision&&busyRead.renderedText==='稍候','Busy readback actual text');
  const idle=await toolbar.updateButton('text',{busy:false});
  check(!idle.busy&&idle.renderedText==='继续','Cleared busy restores text');
  check((await toolbar.getButtonState('text')).renderedText==='继续','Cleared busy readback');

  const relabeled=await toolbar.updateButton('text',{label:'Independent semantic label'});
  const relabeledRead=await toolbar.getButtonState('text');
  for(const state of [relabeled,relabeledRead]){
    check(state.label==='Independent semantic label'&&state.tooltip===state.label&&state.accessibilityName===state.label,'Label-only metadata');
    check(state.icon.text==='继续'&&state.renderedText==='继续','Label-only update replaced text');
    check(state.revision===relabeled.revision,'Label-only revision mismatch');
  }

  // Each unique label identifies an entire submitted revision. Responses may
  // legitimately return a newer applied revision, but never mixed fields.
  const expected=new Map(), revisions=new Map();
  function coherent(state){
    const spec=expected.get(state.label);
    check(spec,'Unknown applied label: '+state.label);
    check(state.tooltip===state.label&&state.accessibilityName===state.label,'Mixed label/native metadata');
    for(const key of ['active','disabled','busy','error','badge']){
      check(state[key]===spec[key],'Mixed '+key+' at revision '+state.revision);
    }
    const kind=typeof spec.icon==='string'?'builtIn':spec.icon.text?'text':'image';
    check(state.iconPresentation.kind===kind,'Mixed icon presentation');
    check(state.renderedText===(kind==='text'?(spec.busy?'稍候':spec.icon.text):''),'Mixed renderedText');
    if(kind==='builtIn')check(state.icon===spec.icon,'Mixed built-in icon');
    else if(kind==='text')check(state.icon.text===spec.icon.text,'Mixed text icon');
    else check(state.icon.path===spec.icon.path&&state.icon.renderingMode===spec.icon.renderingMode,'Image source/revision mismatch');
    const content=kind==='builtIn'?state.icon:kind==='text'?state.icon.text:[state.icon.path,state.icon.renderingMode];
    const fingerprint=JSON.stringify([state.label,content,state.active,state.disabled,state.busy,state.error,state.badge,state.renderedText]);
    check(!revisions.has(state.revision)||revisions.get(state.revision)===fingerprint,'Same revision returned different content');
    revisions.set(state.revision,fingerprint);
  }
  function submit(label,icon,index){
    const patch={label,icon,active:index%2===0,disabled:index%3===0,
      busy:index%4===0,error:index%2?'':'test',badge:String(index%10)};
    expected.set(label,patch);
    return toolbar.updateButton('text',patch).then(state=>{coherent(state);return state;});
  }
  // Two spellings of the same fixture prove source binding is by revision,
  // even when native image bytes and rendering mode are identical.
  const sources=[{text:'审阅'},{text:'计划'},'timer',
    {path:'./app-shell-macos/assets/tray-template.png',renderingMode:'template'},
    {path:'app-shell-macos/assets/tray-template.png',renderingMode:'template'},
    {text:'继续'}];
  await submit('Concurrent baseline',{text:'审阅'},1);
  let concurrentResponses=0, final;
  for(let round=0;round<16;round++){
    const pending=[];
    for(let i=0;i<sources.length;i++){
      pending.push(toolbar.getButtonState('text').then(state=>{coherent(state);return state;}));
      pending.push(submit('Concurrent '+round+'/'+i,sources[i],i));
    }
    const states=await Promise.all(pending);
    final=await toolbar.getButtonState('text');coherent(final);
    check(final.label==='Concurrent '+round+'/5','Monotonic apply lost latest update');
    check(states.every(state=>state.revision<=final.revision),'Native revision regressed');
    concurrentResponses+=states.length;
  }
  result.busy=busy;result.idle=idle;result.concurrentResponses=concurrentResponses;
  result.concurrentFinal=final;
  result.before=before;result.legacy=old;result.updated=next;result.final=text;
  result.invalidUpdates=4;
  await File.writeJSON(File.join(root,'evidence.json'),result);
  console.log('FLOATING_TEXT_PASS='+JSON.stringify({invalidDeclarations:7,invalidUpdates:4,legacyCompatible:true,concurrentResponses,busyActualText:true}));
}finally{await toolbar.close();}
