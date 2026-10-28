// From the repository root with the paired development bundle:
// ./dist/opendesk -ui -script tests/runtime-api/custom-ui-toolbar-position.js -console-mode script -log-dir .runtime/tests/custom-ui-toolbar-position/run
// Own toolbar only. No external application/window discovery, capture or input.
'use strict';
const evidenceDir=File.join(File.cwd(),'.runtime/tests/custom-ui-toolbar-position',String(Date.now()));
File.ensureDir(evidenceDir);
const result={scope:'OWN_OPENDESK_TOOLBAR_ONLY',cases:[],errors:[]};
function check(ok,message){if(!ok)throw new Error(message);}
async function settled(toolbar){
  let previous=null,stable=0;
  for(let i=0;i<30;i++){
    const state=await toolbar.getState();
    const same=previous&&['x','y','width','height'].every(k=>Math.abs(state.bounds[k]-previous[k])<=1);
    stable=state.visible&&state.onScreen&&same?stable+1:0;
    if(stable>=3)return state;
    previous=state.bounds;await System.delay(40);
  }
  throw new Error('OWN_TOOLBAR_NOT_SETTLED');
}
const toolbar=new FloatingWindow({title:'OpenDesk OWN position regression',orientation:'vertical',
  position:{mode:'absolute',x:300,y:180}});
for(let i=0;i<5;i++)toolbar.addButton('p'+i,'Own position '+i,{text:String(i+1)},()=>{});
try{
  await toolbar.show();result.baseline=await settled(toolbar);
  for(let i=0;i<4;i++){
    await toolbar.hide();
    const hidden=await toolbar.getState(),x=320+i*20,y=200+i*10;
    const moved=await toolbar.setPosition(x,y);
    const showing=await toolbar.show();
    // Moving immediately after show overlaps any native presentation animation.
    const visibleMoved=await toolbar.setPosition(x,y),actual=await settled(toolbar);
    result.cases.push({hidden,moved,showing,visibleMoved,actual,expected:{x,y}});
    check(actual.bounds.width===result.baseline.bounds.width&&actual.bounds.height===result.baseline.bounds.height,
      'POSITION_CHANGED_FIXED_TOOLBAR_SIZE:'+JSON.stringify({baseline:result.baseline.bounds,actual:actual.bounds}));
    check(Math.abs(actual.bounds.x-x)<=1&&Math.abs(actual.bounds.y-y)<=1,'POSITION_NOT_APPLIED');
  }
  result.passed=true;
  console.log('FLOATING_POSITION_PASS='+JSON.stringify({cases:result.cases.length,bounds:result.baseline.bounds,evidenceDir}));
}catch(e){result.errors.push(String(e));throw e;}
finally{
  await File.writeJSON(File.join(evidenceDir,'result.json'),result);
  await toolbar.close();
}
