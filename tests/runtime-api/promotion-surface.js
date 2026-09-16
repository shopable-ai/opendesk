'use strict';
// Manual native UI smoke, from repository root:
// ./dist/opendesk -ui -script tests/runtime-api/promotion-surface.js -console-mode script
// Run on an idle desktop. This is an inert fixture, not the production Runner.
// Does not execute recipes, navigate externally, request ads, or alter user preferences.
const productRoot=File.join(Execution.scriptDir,'..','..','apps','opendesk');
for(const relative of ['promotions/core.js','promotions/controller.js','prototypes/promotions/samples.js']) {
  const path=File.join(productRoot,relative);
  (0,eval)(File.read(path)+'\n//# sourceURL='+path);
}
const fixtureContext={ready:true,ownerVisible:true,automationIdle:true,recorderIdle:true,
  measurementIdle:true,listOpen:false,fullscreen:false,presentationMode:false};
let anchor=null,advertisement=null;
try {
  anchor=await ui.createWindow({id:'promotionFixtureAnchor',kind:'floating',title:'推广测试锚点',
    position:{mode:'anchor',size:{width:590,height:54},horizontal:'center',vertical:'bottom',margin:40,display:'active'},
    alwaysOnTop:true,draggable:false,
    content:{html:'<main><strong>推广浮层测试锚点</strong><span>不是 Script Runner，不会执行脚本。请检查广告并点击关闭。</span></main>',
      css:'html,body{margin:0;background:#182231;color:#eef2f8;font:13px sans-serif}main{padding:16px}span{margin-left:12px;font-size:11px;color:#bdcde2}'}});
  await anchor.show();
  for(const mode of ['runner-above','screen-bottom-right']) {
    if(mode==='screen-bottom-right')await anchor.setPlacement({horizontal:'left',vertical:'top',margin:24,display:'current'});
    const anchorState=await anchor.getState();
    advertisement=OpenDeskPromotionsController.create({ui,getContext:()=>fixtureContext,
      activate:action=>console.log('PROMOTION_FIXTURE_CTA='+JSON.stringify(action)),logger:console});
    const result=await advertisement.show(OpenDeskPromotionSamples.sample('animated'),{mode,anchor:anchorState.bounds});
    console.log('PROMOTION_FIXTURE_SHOWN='+JSON.stringify({mode,result,state:advertisement.state()}));
    if(result.status!=='visible')throw new Error('Promotion fixture was not visible: '+JSON.stringify(result));
    // Observe actual GIF playback, poster restore, close hit target, and focus on the host.
    await advertisement.waitUntilClosed();
    await advertisement.dispose();advertisement=null;
  }
  console.log('PROMOTION_FIXTURE_COMPLETED: handles closed; visual quality requires human/native evidence.');
} finally {
  if(advertisement)await advertisement.dispose();
  if(anchor)await anchor.close();
}
