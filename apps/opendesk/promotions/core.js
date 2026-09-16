(function installPromotionsCore(root) {
  'use strict';
  const LIMITS = Object.freeze({width: 360, gap: 12, margin: 16, lifetimeMs: 15000,
    motionMs: 5000, maxDaily: 2, cooldownMs: 1800000, dismissMs: 604800000,
    maxMediaChars: 2800000});
  const LAYOUTS = Object.freeze(['image', 'image-text', 'text']);
  const ID = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
  const IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
  function fail(message) { throw new Error('PROMOTION_INVALID: ' + message); }
  function text(value, name, max, optional) {
    if (optional && (value === undefined || value === '')) return '';
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) fail(name);
    return value.trim();
  }
  function mediaSource(value, poster) {
    if (typeof value !== 'string' || value.length > LIMITS.maxMediaChars) fail('media size');
    const match = IMAGE.exec(value);
    if (!match || match[2].length % 4 !== 0) fail('only inline PNG/JPEG/GIF/WebP raster data');
    if (poster && !['png', 'jpeg'].includes(match[1])) fail('poster must be static PNG/JPEG');
    const signatures = {png:'iVBORw0KGgo', jpeg:'/9j/', gif:'R0lGOD', webp:'UklGR'};
    if (!match[2].startsWith(signatures[match[1]])) fail('media signature');
    return value;
  }
  function validateCreative(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.schemaVersion !== 1) fail('schemaVersion');
    const known = ['schemaVersion','id','campaignId','advertiser','layout','title','description','cta','action','media'];
    if (Object.keys(input).some(key => !known.includes(key))) fail('unknown creative field');
    if (typeof input.id !== 'string' || typeof input.campaignId !== 'string' || !ID.test(input.id) || !ID.test(input.campaignId)) fail('id/campaignId');
    if (!LAYOUTS.includes(input.layout)) fail('layout');
    const action = input.action;
    if (!action || typeof action !== 'object' || !['preview','official'].includes(action.kind)) fail('action');
    if (Object.keys(action).some(key => !['kind','id'].includes(key))) fail('unknown action field');
    if (action.id !== undefined && typeof action.id !== 'string') fail('action.id');
    if (action.kind === 'official' && !['opendesk.home','opendesk.customize'].includes(action.id)) fail('official action');
    const value = {schemaVersion:1, id:input.id, campaignId:input.campaignId,
      advertiser:text(input.advertiser,'advertiser',48), layout:input.layout,
      title:text(input.title,'title',64), description:text(input.description,'description',120,true),
      cta:text(input.cta,'cta',16), action:Object.freeze({kind:action.kind, id:action.id || ''})};
    if (input.layout !== 'text') {
      const media = input.media;
      if (!media || !['image','animated-image'].includes(media.kind)) fail('media.kind');
      if (Object.keys(media).some(key => !['kind','src','poster','alt'].includes(key))) fail('unknown media field');
      const src = mediaSource(media.src, media.kind === 'image');
      const poster = media.kind === 'animated-image' ? mediaSource(media.poster, true) : src;
      if (media.kind === 'animated-image' && !/^data:image\/(gif|webp);/.test(src)) fail('animated GIF/WebP required');
      value.media = Object.freeze({kind:media.kind, src, poster, alt:text(media.alt,'media.alt',120)});
    } else if (input.media !== undefined) fail('text layout cannot contain media');
    return Object.freeze(value);
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function sizeFor(creative) { return {width:LIMITS.width, height:creative.layout === 'image-text' ? 380 : creative.layout === 'image' ? 296 : 228}; }
  function overlaps(a, b) { return a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y; }
  function validBounds(value) { return !!value && ['x','y','width','height'].every(key => Number.isFinite(value[key])) && value.width > 0 && value.height > 0; }
  // Pure preview geometry. Native uses setRelativeTo / setPlacement and checks actual readback.
  function place(mode, area, anchor, size) {
    if (!['runner-above','screen-bottom-right'].includes(mode) || !validBounds(area) || !validBounds({x:0,y:0,...size})) fail('placement');
    const m = LIMITS.margin;
    if (size.width + m*2 > area.width || size.height + m*2 > area.height) return null;
    let x = area.x + area.width - size.width - m;
    let y = area.y + area.height - size.height - m;
    if (mode === 'runner-above') {
      if (!validBounds(anchor)) return null;
      x = anchor.x + anchor.width - size.width;
      y = anchor.y - size.height - LIMITS.gap;
    }
    x = Math.max(area.x+m, Math.min(x, area.x+area.width-size.width-m));
    const result = {x,y,width:size.width,height:size.height};
    if (y < area.y+m || y+size.height > area.y+area.height-m || (validBounds(anchor) && overlaps(result,anchor))) return null;
    return result;
  }
  function contextReason(context) {
    if (!context || context.ready !== true) return 'unknown';
    for (const key of ['ownerVisible','automationIdle','recorderIdle','measurementIdle']) if (context[key] !== true) return key;
    for (const key of ['listOpen','fullscreen','presentationMode']) if (context[key] !== false) return key;
    return '';
  }
  function freshPreferences() { return {schemaVersion:1, enabled:true, day:'', count:0, lastShown:0, dayHiddenUntil:0, dismissed:{}}; }
  function readPreferences(value) {
    if (value === undefined || value === null) return freshPreferences();
    if (typeof value !== 'object' || value.schemaVersion !== 1 || typeof value.enabled !== 'boolean') fail('preferences');
    const p = Object.assign(freshPreferences(), value, {dismissed:{}});
    for (const key of ['count','lastShown','dayHiddenUntil']) if (!Number.isSafeInteger(p[key]) || p[key] < 0) fail('preferences.'+key);
    if (typeof p.day !== 'string' || (p.day && !/^\d{4}-\d{2}-\d{2}$/.test(p.day))) fail('preferences.day');
    if (!value.dismissed || typeof value.dismissed !== 'object' || Array.isArray(value.dismissed)) fail('preferences.dismissed');
    for (const [key, until] of Object.entries(value.dismissed)) {
      if (!ID.test(key) || !Number.isSafeInteger(until) || until < 0) fail('dismissal');
      Object.defineProperty(p.dismissed, key, {value:until, enumerable:true, writable:true, configurable:true});
    }
    return p;
  }
  function localDay(now) { const d = new Date(now); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function nextDay(now) { const d = new Date(now); d.setHours(24,0,0,0); return d.getTime(); }
  function eligible(creative, context, preferences, now) {
    const reason = contextReason(context);
    if (reason) return reason;
    const p = readPreferences(preferences);
    if (!p.enabled) return 'disabled';
    if (p.dayHiddenUntil > now) return 'today';
    if (Object.prototype.hasOwnProperty.call(p.dismissed,creative.campaignId) && p.dismissed[creative.campaignId] > now) return 'dismissed';
    if (p.lastShown && now-p.lastShown < LIMITS.cooldownMs) return 'cooldown';
    if (p.day === localDay(now) && p.count >= LIMITS.maxDaily) return 'daily-cap';
    return '';
  }
  function recordShown(preferences, now) {
    const p = readPreferences(preferences), day = localDay(now);
    p.count = p.day === day ? p.count+1 : 1; p.day=day; p.lastShown=now;
    for (const key of Object.keys(p.dismissed)) if (p.dismissed[key] <= now) delete p.dismissed[key];
    return p;
  }
  function dismiss(preferences, creative, mode, now) {
    const p = readPreferences(preferences);
    if (mode === 'disable') p.enabled=false;
    else if (mode === 'today') p.dayHiddenUntil=nextDay(now);
    else if (mode === 'campaign') Object.defineProperty(p.dismissed, creative.campaignId, {value:now+LIMITS.dismissMs, enumerable:true,writable:true,configurable:true});
    else fail('dismiss mode');
    return p;
  }
  const CSS = `html,body{margin:0;padding:0;height:100%;background:transparent;color:#eef2f8;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}.promo{width:100%;height:100%;background:#182231;border:1px solid #344359;border-radius:14px;overflow:hidden;display:flex;flex-direction:column}button{font:inherit;cursor:pointer;border:0}button:focus-visible{outline:2px solid #9ec5ff;outline-offset:-3px}.promo-head{height:42px;flex-shrink:0;padding:5px 8px 5px 14px;display:flex;align-items:center;justify-content:space-between}.promo-badge{color:#b7c5d9;font-size:11px;max-width:235px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.promo-close{background:transparent;color:#e2e9f4;width:32px;height:32px;font-size:21px;border-radius:7px}.promo-close:hover{background:#344359}.promo-media{height:180px;margin:0 12px;position:relative;flex-shrink:0;background:#0c1624;border-radius:8px;overflow:hidden}.promo-image{width:100%;height:100%;object-fit:contain;display:block}.promo-motion{position:absolute;right:6px;bottom:6px;border-radius:6px;padding:6px 9px;background:#172536;color:#fff;font-size:11px}.promo-copy{padding:12px 14px 0;flex:1;min-height:0}.promo-title{display:block;font-size:17px;line-height:24px;font-weight:650;overflow:hidden;max-height:48px}.promo-description{font-size:12px;line-height:18px;color:#b7c5d9;margin:5px 0 0;overflow:hidden;max-height:36px}.promo-footer{height:68px;flex-shrink:0;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px}.promo-options{display:flex;gap:4px}.promo-quiet{background:transparent;color:#b7c5d9;font-size:10px;padding:7px 4px}.promo-open{background:#b9d7ff;color:#102239;border-radius:7px;min-height:34px;max-width:132px;padding:8px 12px;font-weight:650}.promo-open:disabled{opacity:.5;cursor:default}.promo-text .promo-copy{padding-top:10px}.promo-text .promo-footer{height:68px}`;
  function render(input, staticOnly) {
    const c=validateCreative(input), motion=c.media && c.media.kind==='animated-image';
    const media=c.media ? '<div class="promo-media"><img id="promotionImage" class="promo-image" src="'+escapeHTML(staticOnly?c.media.poster:c.media.src)+'" alt="'+escapeHTML(c.media.alt)+'">'+(motion?'<button id="promotionMotion" class="promo-motion">'+(staticOnly?'播放动图':'暂停动图')+'</button>':'')+'</div>' : '';
    const copy=c.layout==='image'?'':'<div class="promo-copy"><strong id="promotionTitle" class="promo-title">'+escapeHTML(c.title)+'</strong><p class="promo-description">'+escapeHTML(c.description)+'</p></div>';
    return {size:sizeFor(c), css:CSS, html:'<main id="promotionCard" class="promo promo-'+c.layout+'"><header class="promo-head"><span class="promo-badge">推广 · '+escapeHTML(c.advertiser)+'</span><button id="promotionClose" class="promo-close" aria-label="关闭此推广，七天内不再显示">×</button></header>'+media+copy+'<footer class="promo-footer"><div class="promo-options"><button id="promotionToday" class="promo-quiet">今天不再显示</button><button id="promotionDisable" class="promo-quiet">关闭推广</button></div><button id="promotionOpen" class="promo-open">'+escapeHTML(c.cta)+'</button></footer></main>'};
  }
  const api=Object.freeze({LIMITS,LAYOUTS,validateCreative,mediaSource,escapeHTML,sizeFor,validBounds,overlaps,place,contextReason,freshPreferences,readPreferences,eligible,recordShown,dismiss,render,CSS});
  root.OpenDeskPromotionsCore=api;
  if (typeof module==='object' && module.exports) module.exports=api;
})(globalThis);
