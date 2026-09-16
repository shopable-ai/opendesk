(function installPromotionsController(root) {
  'use strict';
  const core = root.OpenDeskPromotionsCore || (typeof require === 'function' ? require('./core.js') : null);
  if (!core) throw new Error('Promotions core must be loaded first');
  let sequence=0;
  function create(options) {
    const o=options || {};
    if (!o.ui || typeof o.ui.createWindow!=='function') throw new Error('Promotion controller requires ui.createWindow');
    const clock=o.now || Date.now, later=o.setTimeout || root.setTimeout, cancel=o.clearTimeout || root.clearTimeout;
    const getContext=typeof o.getContext==='function'?o.getContext:()=>({});
    let preferences=core.readPreferences(o.preferences), handle=null, opening=null, creative=null;
    let revision=0, phase='idle', displayTimer=null, motionTimer=null, paused=true, disposed=false, closing=null, blocked=false;
    const offs=[];
    let saveTail=Promise.resolve();
    function context() { try { return getContext() || {}; } catch (_) { return {}; } }
    function log(error) { if (o.logger && typeof o.logger.warn==='function') o.logger.warn('OPENDESK_PROMOTION_ERROR='+String(error && error.message || error)); }
    function clearTimers() { if(displayTimer!==null)cancel(displayTimer);if(motionTimer!==null)cancel(motionTimer);displayTimer=motionTimer=null; }
    function offAll() { while(offs.length) { try { offs.pop()(); } catch(error) { log(error); } } }
    async function persist(next) {
      preferences=next;
      try { if(typeof o.savePreferences==='function') {
        const snapshot=JSON.parse(JSON.stringify(next));
        saveTail=saveTail.then(()=>o.savePreferences(snapshot));
        await saveTail;
      } }
      catch(error) { preferences.enabled=false;blocked=true;log(error);throw error; }
    }
    async function close(reason) {
      ++revision; clearTimers();
      if(closing) return closing;
      const current=handle;
      phase=current?'closing':phase==='opening'?'canceled':'idle';
      if(!current) return;
      closing=(async()=>{
        try { await current.close(); offAll(); if(handle===current)handle=null;phase=disposed?'disposed':'idle'; }
        catch(error) { blocked=true;phase='failed';log(error);throw error; }
        finally { closing=null; }
      })();
      return closing;
    }
    async function setMotion(wantPlay) {
      if(!handle || phase!=='visible' || !creative.media || creative.media.kind!=='animated-image')return;
      if(core.contextReason(context())) { await close('context');return; }
      if(motionTimer!==null)cancel(motionTimer);motionTimer=null;
      paused=!wantPlay;
      const current=handle;
      await current.control('promotionImage').update({source:wantPlay?creative.media.src:creative.media.poster});
      if(handle!==current || phase!=='visible')return;
      await current.control('promotionMotion').update({text:wantPlay?'暂停动图':'播放动图'});
      if(wantPlay)motionTimer=later(()=>void setMotion(false).catch(log),core.LIMITS.motionMs);
    }
    function listen(id, callback) {
      offs.push(handle.control(id).on('click', ()=>Promise.resolve().then(callback).catch(async error=>{log(error);try{await close('handler-error');}catch(e){log(e);}})));
    }
    async function dismiss(mode) {
      if(!creative)return;
      const next=core.dismiss(preferences,creative,mode,clock());
      // Closing never waits for disk persistence. A failed save disables this controller.
      const shut=close(mode);
      try { await persist(next); } finally { await shut; }
    }
    function show(input, placement) {
      if(disposed || blocked)return Promise.resolve({status:'suppressed',reason:disposed?'disposed':'failed'});
      if(opening)return opening;
      if(closing)return Promise.resolve({status:'suppressed',reason:'closing'});
      if(handle)return Promise.resolve({status:phase,windowId:handle.id});
      let value;
      try {value=core.validateCreative(input);} catch(error) {return Promise.reject(error);}
      const p=placement || {mode:'runner-above'};
      if(!['runner-above','screen-bottom-right'].includes(p.mode))return Promise.reject(new Error('Unknown promotion placement'));
      if(p.mode==='runner-above' && !core.validBounds(p.anchor))return Promise.resolve({status:'suppressed',reason:'anchor'});
      const reason=core.eligible(value,context(),preferences,clock());
      if(reason)return Promise.resolve({status:'suppressed',reason});
      const token=++revision;phase='opening';
      const valid=()=>token===revision && !disposed && !blocked && !core.contextReason(context());
      opening=(async()=>{
        let candidate=null;
        try {
          // Native uses a static poster by default. Animated start is explicit until
          // reduced-motion/readiness facts can be established by the product host.
          const content=core.render(value,true);
          candidate=await o.ui.createWindow({id:'opendeskPromotion'+(++sequence),kind:'floating',title:'OpenDesk · 推广',
            position:{mode:'anchor',size:content.size,horizontal:'right',vertical:'bottom',margin:core.LIMITS.margin,display:'active'},
            alwaysOnTop:true,draggable:false,interactionGroup:'opendeskPromotion',
            content:{html:content.html,css:content.css}});
          if(!valid()) {await candidate.close();return {status:'suppressed',reason:'canceled'};}
          handle=candidate;creative=value;paused=true;
          let state;
          if(p.mode==='runner-above')state=await candidate.setRelativeTo(p.anchor,{preferredSides:['above'],align:'end',gap:core.LIMITS.gap});
          else state=await candidate.setPlacement({horizontal:'right',vertical:'bottom',margin:core.LIMITS.margin,display:'active'});
          // Native clamping must not turn an advertisement into a cover over Run/Stop.
          if(!state || !core.validBounds(state.bounds))throw new Error('Promotion placement not confirmed');
          if(core.validBounds(p.anchor) && core.overlaps(state.bounds,p.anchor)) {
            await close('overlap');return {status:'suppressed',reason:'overlap'};
          }
          if(!valid()) {await close('canceled');return {status:'suppressed',reason:'canceled'};}
          listen('promotionClose',()=>dismiss('campaign'));
          listen('promotionToday',()=>dismiss('today'));
          listen('promotionDisable',()=>dismiss('disable'));
          if(value.media && value.media.kind==='animated-image')listen('promotionMotion',()=>setMotion(paused));
          listen('promotionOpen',async()=>{
            if(phase!=='visible' || core.contextReason(context())) {await close('context');return;}
            const action=value.action;
            await close('click');
            if(core.contextReason(context()))return;
            // Only validated action IDs, never a renderer-supplied URL or command.
            if(typeof o.activate==='function')await o.activate(action);
          });
          offs.push(candidate.on('interactionOutside',()=>close('outside')));
          offs.push(candidate.on('close',()=>{if(handle===candidate){clearTimers();offAll();handle=null;phase=disposed?'disposed':'idle';}}));
          const visible=await candidate.show();
          if(!valid()) {await close('canceled');return {status:'suppressed',reason:'canceled'};}
          if(!visible || visible.visible!==true || visible.onScreen!==true)throw new Error('Promotion not confirmed on-screen');
          phase='visible';
          displayTimer=later(()=>void close('timeout').catch(log),core.LIMITS.lifetimeMs);
          await persist(core.recordShown(preferences,clock()));
          if(!valid()) {await close('canceled');return {status:'suppressed',reason:'canceled'};}
          return {status:'visible',windowId:candidate.id};
        } catch(error) {
          log(error);
          try {if(handle)await close('error');else if(candidate)await candidate.close();}catch(e){blocked=true;log(e);}
          throw error;
        } finally {opening=null;if(!handle && !blocked)phase=disposed?'disposed':'idle';}
      })();
      return opening;
    }
    async function refreshContext() {if(core.contextReason(context()))await close('context');}
    async function reanchor(bounds) {
      if(!handle || phase!=='visible')return;
      if(!core.validBounds(bounds) || core.contextReason(context())) {await close('anchor');return;}
      const current=handle;
      try {
        const state=await current.setRelativeTo(bounds,{preferredSides:['above'],align:'end',gap:core.LIMITS.gap});
        if(!state || !core.validBounds(state.bounds) || core.overlaps(state.bounds,bounds))await close('overlap');
      } catch(error) {await close('anchor-error');throw error;}
    }
    async function waitUntilClosed() {const current=handle;if(current)await current.waitUntilClosed();}
    async function dispose() {disposed=true;await close('dispose');if(opening)await opening;}
    return Object.freeze({show,close,dismiss,setMotion,refreshContext,reanchor,waitUntilClosed,dispose,
      state:()=>({phase,paused,windowId:handle?handle.id:null,preferences:JSON.parse(JSON.stringify(preferences))})});
  }
  const api=Object.freeze({create});root.OpenDeskPromotionsController=api;
  if(typeof module==='object' && module.exports)module.exports=api;
})(globalThis);
