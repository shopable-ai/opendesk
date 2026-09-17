(function installPromotionsController(root) {
  'use strict';
  const core=root.OpenDeskPromotionsCore||(typeof require==='function'?require('./core.js'):null);
  if(!core)throw new Error('Promotions core must be loaded first');
  let sequence=0;
  function create(options){
    const o=options||{};
    if(!o.ui||typeof o.ui.createWindow!=='function')throw new Error('Promotion controller requires ui.createWindow');
    const clock=o.now||Date.now,later=o.setTimeout||root.setTimeout,cancel=o.clearTimeout||root.clearTimeout;
    const getContext=typeof o.getContext==='function'?o.getContext:()=>({});
    let preferences=core.readPreferences(o.preferences),handle=null,opening=null,creative=null;
    let revision=0,phase='idle',displayTimer=null,motionTimer=null,disposed=false,closing=null,blocked=false,menuOpen=false,motionPlayed=false;
    const offs=[];let saveTail=Promise.resolve();
    function context(){try{return getContext()||{};}catch(_){return {};}}
    function log(error){if(o.logger&&typeof o.logger.warn==='function')o.logger.warn('OPENDESK_PROMOTION_ERROR='+String(error&&error.message||error));}
    function reducedMotion(){try{return typeof o.reducedMotion==='function'?o.reducedMotion()===true:o.reducedMotion===true;}catch(_){return true;}}
    function clearTimers(){if(displayTimer!==null)cancel(displayTimer);if(motionTimer!==null)cancel(motionTimer);displayTimer=motionTimer=null;}
    function offAll(){while(offs.length){try{offs.pop()();}catch(error){log(error);}}}
    async function persist(next){preferences=next;if(typeof o.savePreferences!=='function')return;const snapshot=JSON.parse(JSON.stringify(next));try{saveTail=saveTail.then(()=>o.savePreferences(snapshot));await saveTail;}catch(error){preferences.enabled=false;blocked=true;log(error);throw error;}}
    async function close(reason){
      ++revision;clearTimers();menuOpen=false;if(closing)return closing;const current=handle;phase=current?'closing':phase==='opening'?'canceled':'idle';if(!current)return;
      closing=(async()=>{try{await current.close();offAll();if(handle===current)handle=null;phase=disposed?'disposed':'idle';}catch(error){blocked=true;phase='failed';log(error);throw error;}finally{closing=null;}})();return closing;
    }
    async function awaitImageReady(candidate,token,expectedSource){
      if(!creative||!creative.media)return true;const image=candidate.control('promotionImage');
      for(let i=0;i<80;i+=1){
        if(token!==revision||core.contextReason(context()))return false;
        const state=await image.getState();
        const sourceMatches=!expectedSource||!state||!state.source||state.source===expectedSource;
        if(state&&sourceMatches&&state.imageComplete===true){
          if(Number(state.imageNaturalWidth)>0&&Number(state.imageNaturalHeight)>0)return true;
          throw new Error('Promotion image decode failed');
        }
        await new Promise(resolve=>later(resolve,25));
      }
      throw new Error('Promotion image readiness timeout');
    }
    async function playMotionOnce(candidate,token,value){
      if(!value.media||value.media.kind!=='animated-image'||reducedMotion()||motionPlayed)return true;
      motionPlayed=true;
      const image=candidate.control('promotionImage');
      await image.update({source:value.media.src});
      motionTimer=later(()=>{
        motionTimer=null;
        if(handle===candidate&&phase==='visible')image.update({source:value.media.poster}).catch(log);
      },Math.min(core.LIMITS.motionMs,5000));
      return awaitImageReady(candidate,token,value.media.src);
    }
    function listen(id,callback){offs.push(handle.control(id).on('click',()=>Promise.resolve().then(callback).catch(async error=>{log(error);try{await close('handler-error');}catch(e){log(e);}})));}
    async function setMenu(next){if(!handle||phase!=='visible')return;menuOpen=!!next;await handle.control('promotionMenu').update({classes:menuOpen?['menu']:['menu','hidden']});}
    async function dismiss(mode){if(!creative)return;const next=core.dismiss(preferences,creative,mode,clock());const shut=close(mode);try{await persist(next);}finally{await shut;}}
    function show(input,placement){
      if(disposed||blocked)return Promise.resolve({status:'suppressed',reason:disposed?'disposed':'failed'});if(opening)return opening;if(closing)return Promise.resolve({status:'suppressed',reason:'closing'});if(handle)return Promise.resolve({status:phase,windowId:handle.id});
      let value;try{value=core.validateCreative(input);}catch(error){return Promise.reject(error);}const p=placement||{mode:'runner-above'};
      if(!['runner-above','screen-bottom-right'].includes(p.mode))return Promise.reject(new Error('Unknown promotion placement'));if(p.mode==='runner-above'&&!core.validBounds(p.anchor))return Promise.resolve({status:'suppressed',reason:'anchor'});
      const reason=core.eligible(value,context(),preferences,clock());if(reason)return Promise.resolve({status:'suppressed',reason});
      const token=++revision;phase='opening';creative=value;motionPlayed=false;const valid=()=>token===revision&&!disposed&&!blocked&&!core.contextReason(context())&&(!o.canShow||o.canShow()===true);
      opening=(async()=>{let candidate=null;try{
        // Every media surface is born on a static poster. Animated media starts
        // only after the window is confirmed visible so its single play budget
        // is not consumed while Native is still creating/placing the surface.
        const content=core.render(value,true);
        candidate=await o.ui.createWindow({id:'opendeskPromotion'+(++sequence),kind:'floating',title:'OpenDesk · 推广',position:{mode:'anchor',size:content.size,horizontal:'right',vertical:'bottom',margin:core.LIMITS.margin,display:'active'},alwaysOnTop:true,draggable:false,keyEvents:true,interactionGroup:o.interactionGroup||'scriptRunnerPlayer',content:{html:content.html,css:content.css}});
        if(!valid()){await candidate.close();return {status:'suppressed',reason:'canceled'};}handle=candidate;
        const placed=p.mode==='runner-above'?await candidate.setRelativeTo(p.anchor,{preferredSides:['above'],align:'end',gap:core.LIMITS.gap}):await candidate.setPlacement({horizontal:'right',vertical:'bottom',margin:core.LIMITS.margin,display:'active'});
        if(!placed||!core.validBounds(placed.bounds))throw new Error('Promotion placement not confirmed');if(core.validBounds(p.anchor)&&core.overlaps(placed.bounds,p.anchor)){await close('overlap');return {status:'suppressed',reason:'overlap'};}
        if(!valid()){await close('canceled');return {status:'suppressed',reason:'canceled'};}if(value.media&&!(await awaitImageReady(candidate,token,value.media.poster))){await close('canceled');return {status:'suppressed',reason:'canceled'};}
        listen('promotionClose',()=>close('transient'));listen('promotionMore',()=>setMenu(!menuOpen));listen('promotionToday',()=>dismiss('today'));listen('promotionCampaign',()=>dismiss('campaign'));listen('promotionDisable',()=>dismiss('disable'));
        listen('promotionOpen',async()=>{if(phase!=='visible'||core.contextReason(context())){await close('context');return;}const action=value.action;await close('click');if(core.contextReason(context()))return;if(typeof o.activate==='function')await o.activate(action);});
        offs.push(candidate.on('interactionOutside',event=>Promise.resolve().then(async()=>{if(typeof o.onInteractionOutside==='function')await o.onInteractionOutside(event);await close('interaction-outside');}).catch(log)));
        offs.push(candidate.on('key',event=>{const key=event&&event.fields&&event.fields.key;if(key==='Escape')return menuOpen?setMenu(false):close('escape');}));offs.push(candidate.on('close',()=>{if(handle===candidate){clearTimers();offAll();handle=null;phase=disposed?'disposed':'idle';}}));
        if(!valid()){await close('canceled');return {status:'suppressed',reason:'canceled'};}const visible=await candidate.show();if(!valid()){await close('canceled');return {status:'suppressed',reason:'canceled'};}if(!visible||visible.visible!==true||visible.onScreen!==true)throw new Error('Promotion not confirmed on-screen');
        phase='visible';displayTimer=later(()=>void close('timeout').catch(log),core.LIMITS.lifetimeMs);
        if(!(await playMotionOnce(candidate,token,value))){await close('canceled');return {status:'suppressed',reason:'canceled'};}
        if(!valid()){await close('canceled');return {status:'suppressed',reason:'canceled'};}
        await persist(core.recordShown(preferences,clock()));if(!valid()){await close('canceled');return {status:'suppressed',reason:'canceled'};}return {status:'visible',windowId:candidate.id};
      }catch(error){log(error);try{if(handle)await close('error');else if(candidate)await candidate.close();}catch(e){blocked=true;log(e);}return {status:'suppressed',reason:'surface-error',error:String(error&&error.message||error)};}finally{opening=null;if(!handle&&!blocked)phase=disposed?'disposed':'idle';}})();return opening;
    }
    async function refreshContext(){if(core.contextReason(context()))await close('context');}
    async function reanchor(bounds){if(!handle||phase!=='visible')return;if(!core.validBounds(bounds)||core.contextReason(context())){await close('anchor');return;}const current=handle;try{const state=await current.setRelativeTo(bounds,{preferredSides:['above'],align:'end',gap:core.LIMITS.gap});if(!state||!core.validBounds(state.bounds)||core.overlaps(state.bounds,bounds))await close('overlap');}catch(error){await close('anchor-error');throw error;}}
    async function waitUntilClosed(){const current=handle;if(current)await current.waitUntilClosed();}
    async function waitUntilHidden(){await close('safety');return !handle;}
    async function restore(){const next=core.dismiss(preferences,creative||{campaignId:'restore'},'restore',clock());await persist(next);blocked=false;return state();}
    async function dispose(){disposed=true;await close('dispose');if(opening)await opening;}
    function state(){return {phase,visible:phase==='visible',windowId:handle?handle.id:null,menuOpen,motionPlayed,preferences:JSON.parse(JSON.stringify(preferences))};}
    return Object.freeze({show,close,dismiss,restore,refreshContext,reanchor,waitUntilClosed,waitUntilHidden,dispose,state});
  }
  const api=Object.freeze({create});root.OpenDeskPromotionsController=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
