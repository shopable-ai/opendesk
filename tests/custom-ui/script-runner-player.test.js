'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const repo = path.resolve(__dirname, '..', '..');
const playerFile = path.join(repo, 'apps', 'opendesk', 'script-runner', 'player-controller.js');
vm.runInThisContext(fs.readFileSync(playerFile,'utf8'), {filename:playerFile});
const Player = globalThis.OpenDeskScriptRunnerPlayer;

function FakeUI() {
  const windows=[];
  return {windows, async createWindow(spec){
    const controls=new Map(), listeners=new Map();
    const w={spec,shown:false,hidden:false,closed:false,position:null,
      control(id){if(!controls.has(id)){const handlers={},state={};controls.set(id,{handlers,state,on(t,cb){handlers[t]=cb;},async update(p){Object.assign(state,p);return state;},async getState(){return state;}});}return controls.get(id);},
      on(t,cb){listeners.set(t,cb);},async show(){this.shown=true;this.hidden=false;return {bounds:{x:0,y:0,width:320,height:300}};},async hide(){this.hidden=true;this.shown=false;},async close(){if(this.closed)return;this.closed=true;const cb=listeners.get('close');if(cb)cb({type:'close'});},async getState(){return {bounds:{x:0,y:0,width:320,height:300}};},async setPosition(x,y){this.position={x,y};return {bounds:{x,y,width:320,height:300}};}}
    windows.push(w);return w;
  }};
}
function ToolbarCapture(){
  let current;
  class T{constructor(spec){current=this;this.spec=spec;this.buttons=new Map();this.labels=new Map();this.handlers=new Map();this.closedPromise=new Promise(r=>this.resolveClosed=r);}
    addButton(id,label,icon,cb){this.buttons.set(id,{id,label,icon,callback:cb,disabled:false});}
    addLabel(id,text,opt){this.labels.set(id,{id,text,...opt});}
    addSeparator(){}
    async updateButton(id,p){Object.assign(this.buttons.get(id),p);}
    async updateLabel(id,p){Object.assign(this.labels.get(id),p);}
    on(t,cb){this.handlers.set(t,cb);} onError(){}
    async show(){return {bounds:{x:700,y:700,width:400,height:40}};} waitUntilClosed(){return this.closedPromise;}
    async close(){const cb=this.handlers.get('close');if(cb)cb({type:'close'});this.resolveClosed();}
    async getButtonState(id){return {screenBounds:{x:1000,y:700,width:40,height:40}};}
    async getState(){return {bounds:{x:700,y:700,width:400,height:40}};}
  }
  return {T,current:()=>current};
}
function BaseController(scriptNames=['a.js','b.js','c.js']){
  return {createApp(options){
    let scripts=scriptNames.map(name=>({name,path:'/recipes/'+name}));let selected=scripts[0]?.name||null;let activeRun=null;let running=false;let listOpened=0;let rescanImpl=null;
    const headless=new options.FloatingWindow({});headless.addButton('run','运行','play.fill',()=>{});headless.addButton('stop','停止','stop.fill',()=>{});headless.addLabel('script','',{});headless.addButton('list','list','list.bullet',()=>{});
    return {
      async run(){await headless.show();await headless.waitUntilClosed();}, async prepareList(){return {prepared:true};}, async openList(){listOpened++;return {opened:true};},
      async selectScript(name){if(running||!scripts.some(s=>s.name===name))return false;selected=name;await headless.updateLabel('script',{text:name});return true;},
      async stopRun(){running=false;activeRun=null;await headless.updateButton('run',{});return true;},
      requestRun(queue){if(running)return Promise.resolve({status:'busy'});running=true;activeRun={current:queue[0]?.name||null,total:queue.length,index:0};void headless.updateLabel('script',{text:activeRun.current});return Promise.resolve().then(async()=>{running=false;activeRun=null;await headless.updateLabel('script',{text:selected});return {status:'succeeded'};});},
      async rescan(){if(rescanImpl)return rescanImpl();return true;},async restoreDefaultOrder(){return true;},
      scripts(){return scripts.map(s=>({...s}));}, state(){return {selectedScriptName:selected,loadError:null,configValid:true,running,activeRun, listOpened};},
      __setScripts(names){scripts=names.map(name=>({name,path:'/recipes/'+name}));if(!scripts.some(s=>s.name===selected))selected=scripts[0]?.name||null;},
    };
  }};
}
function harness(names){const ui=FakeUI(),tb=ToolbarCapture(),Base=BaseController(names);const command={async run(){return {exitCode:0}}};const app=Player.createApp({BaseController:Base,playerUI:ui,ui, FloatingWindow:tb.T,file:{},command,execution:{workdir:'/tmp'},system:{getPlatformInfo:()=>({os:'darwin'})},scriptRoot:'/recipes',AbortController});return {app,ui,tb:tb.current()};}
async function tick(){await new Promise(r=>setImmediate(r));}

test('display name strips only trailing js extension',()=>{assert.equal(Player.displayScriptName('daily-report.js'),'daily-report');assert.equal(Player.displayScriptName('report.v2.js'),'report.v2');assert.equal(Player.displayScriptName('report.jsx'),'report.jsx');assert.equal(Player.displayScriptName('foo.js.backup'),'foo.js.backup');});
test('refresh replacement follows old-order next then previous rule',()=>{assert.equal(Player.reconcileCurrentAfterRefresh(['a.js','b.js','c.js'],['a.js','c.js'],'b.js'),'c.js');assert.equal(Player.reconcileCurrentAfterRefresh(['a.js','b.js'],['a.js'],'b.js'),'a.js');assert.equal(Player.reconcileCurrentAfterRefresh(['a.js'],[],'a.js'),null);});
test('runner order and previous next are selection-only and bounded',async()=>{const f=harness(['a.js','b.js','c.js']);const run=f.app.run();await tick();assert.deepEqual([...f.tb.buttons.keys()],['run','stop','previous','next','list']);assert.equal(f.tb.labels.get('script').text,'a');assert.equal(await f.app.previous(),false);assert.equal(await f.app.next(),true);assert.equal(f.app.state().selectedScriptName,'b.js');assert.equal(f.tb.labels.get('script').text,'b');assert.equal(f.app.state().running,false);await f.tb.close();await run;});
test('list panel selection stays open and never executes',async()=>{const f=harness(['a.js','b.js']);const run=f.app.run();await tick();const panel=await f.app.openPanel();assert.equal(panel.shown,true);const control=panel.control('panelSelection');assert.equal(typeof control.handlers.change,'function');assert.equal(typeof control.handlers.click,'function');await control.handlers.change({type:'change',value:'b.js'});assert.equal(f.app.state().selectedScriptName,'a.js');await control.handlers.click({type:'click',value:'b.js'});assert.equal(f.app.state().selectedScriptName,'b.js');assert.equal(f.app.state().player.panelLifecycle,'visible');assert.equal(panel.closed,false);await f.tb.close();await run;});
test('keyboard highlight does not commit until Enter and Escape only hides panel',async()=>{const f=harness(['a.js','b.js','c.js']);const run=f.app.run();await tick();const panel=await f.app.openPanel();await f.app.panelKey('ArrowDown');assert.equal(f.app.state().selectedScriptName,'a.js');assert.equal(f.app.state().player.panelHighlightKey,'b.js');await f.app.panelKey('Enter');assert.equal(f.app.state().selectedScriptName,'b.js');assert.equal(f.app.state().player.panelLifecycle,'visible');await f.app.panelKey('Escape');assert.equal(panel.hidden,true);assert.equal(f.app.state().player.panelLifecycle,'hidden');await f.tb.close();await run;});
test('rapid panel toggle follows latest intent and reuses one panel',async()=>{const f=harness(['a.js']);const run=f.app.run();await tick();const p1=f.app.openPanel();const p2=f.app.closePanel();await Promise.all([p1,p2]);assert.equal(f.ui.windows.length,1);assert.notEqual(f.app.state().player.panelLifecycle,'visible');await f.app.openPanel();assert.equal(f.ui.windows.length,1);await f.tb.close();await run;});

test('official OpenDesk main decorates the base controller before product runner capture', () => {
  const mainSource = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'main.js'), 'utf8');
  assert.match(mainSource, /script-runner['"]\s*,\s*['"]controller\.js/);
  assert.match(mainSource, /script-runner['"]\s*,\s*['"]player-controller\.js/);
  assert.match(mainSource, /OpenDeskScriptRunnerPlayer\.wrapController/);
  assert.match(mainSource, /playerUI:\s*ui/);
});

test('panel presentation never exposes .js in the high-frequency list', () => {
  const html = Player.buildPanelHTML([
    {name: 'daily-report.js', path: '/recipes/daily-report.js'},
    {name: '中文超长自动化脚本名称.js', path: '/recipes/中文超长自动化脚本名称.js'},
    {name: 'report.v2.js', path: '/recipes/report.v2.js'},
  ], {currentKey: 'daily-report.js', highlightKey: 'daily-report.js', running: false});
  assert.match(html, />✓ daily-report<\/option>/);
  assert.match(html, />中文超长自动化脚本名称<\/option>/);
  assert.match(html, />report\.v2<\/option>/);
  assert.doesNotMatch(html, />[^<]*daily-report\.js<\/option>/);
  assert.doesNotMatch(html, />[^<]*report\.v2\.js<\/option>/);
});
