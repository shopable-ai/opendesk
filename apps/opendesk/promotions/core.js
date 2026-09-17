(function installPromotionsCore(root) {
  'use strict';
  const LIMITS = Object.freeze({width: 360, gap: 12, margin: 16, lifetimeMs: 15000,
    motionMs: 5000, maxDaily: 2, cooldownMs: 1800000, dismissMs: 604800000,
    maxMediaChars: 2800000});
  const PRESENTATIONS = Object.freeze(['image', 'animated-image', 'media-only', 'image-text', 'text']);
  const MEDIA_KINDS = Object.freeze(['image', 'animated-image']);
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
  function validateMedia(media, presentation) {
    if (!media || typeof media !== 'object' || !MEDIA_KINDS.includes(media.kind)) fail('media.kind');
    if (Object.keys(media).some(key => !['kind','src','poster','alt'].includes(key))) fail('unknown media field');
    if (presentation === 'image' && media.kind !== 'image') fail('image presentation requires image media');
    if (presentation === 'animated-image' && media.kind !== 'animated-image') fail('animated-image presentation requires animated media');
    if (presentation === 'image-text' && media.kind !== 'image') fail('image-text presentation requires image media');
    const src = mediaSource(media.src, media.kind === 'image');
    const poster = media.kind === 'animated-image' ? mediaSource(media.poster, true) : src;
    if (media.kind === 'animated-image' && !/^data:image\/(gif|webp);/.test(src)) fail('animated GIF/WebP required');
    return Object.freeze({kind:media.kind, src, poster, alt:text(media.alt,'media.alt',120)});
  }
  function validateCreative(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.schemaVersion !== 2) fail('schemaVersion');
    const known = ['schemaVersion','id','campaignId','advertiser','presentation','title','description','cta','action','media'];
    if (Object.keys(input).some(key => !known.includes(key))) fail('unknown creative field');
    if (typeof input.id !== 'string' || typeof input.campaignId !== 'string' || !ID.test(input.id) || !ID.test(input.campaignId)) fail('id/campaignId');
    if (!PRESENTATIONS.includes(input.presentation)) fail('presentation');
    const action = input.action;
    if (!action || typeof action !== 'object' || !['preview','official'].includes(action.kind)) fail('action');
    if (Object.keys(action).some(key => !['kind','id'].includes(key))) fail('unknown action field');
    if (action.id !== undefined && typeof action.id !== 'string') fail('action.id');
    if (action.kind === 'official' && !['opendesk.home','opendesk.customize'].includes(action.id)) fail('official action');
    const mediaOnly = input.presentation === 'media-only';
    if (mediaOnly) {
      if ((typeof input.title === 'string' && input.title.trim())
        || (typeof input.description === 'string' && input.description.trim())) {
        fail('media-only cannot contain title/description');
      }
    }
    const value = {schemaVersion:2, id:input.id, campaignId:input.campaignId,
      advertiser:text(input.advertiser,'advertiser',48), presentation:input.presentation,
      title:mediaOnly ? '' : text(input.title,'title',64),
      description:mediaOnly ? '' : text(input.description,'description',120,true),
      cta:text(input.cta,'cta',16),
      action:Object.freeze({kind:action.kind, id:action.id || ''})};
    if (input.presentation === 'text') {
      if (input.media !== undefined) fail('text presentation cannot contain media');
    } else value.media = validateMedia(input.media, input.presentation);
    return Object.freeze(value);
  }
  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function sizeFor(creative) { if (creative.presentation === 'image-text') return {width:LIMITS.width,height:268}; if (creative.presentation === 'text') return {width:LIMITS.width,height:196}; return {width:LIMITS.width,height:240}; }
  function overlaps(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
  function validBounds(value){return !!value&&['x','y','width','height'].every(key=>Number.isFinite(value[key]))&&value.width>0&&value.height>0;}
  function place(mode, area, anchor, size) {
    if (!['runner-above','screen-bottom-right'].includes(mode) || !validBounds(area) || !validBounds({x:0,y:0,...size})) fail('placement');
    const m=LIMITS.margin; if(size.width+m*2>area.width||size.height+m*2>area.height)return null;
    let x=area.x+area.width-size.width-m,y=area.y+area.height-size.height-m;
    if(mode==='runner-above'){if(!validBounds(anchor))return null;x=anchor.x+anchor.width-size.width;y=anchor.y-size.height-LIMITS.gap;}
    x=Math.max(area.x+m,Math.min(x,area.x+area.width-size.width-m)); const result={x,y,width:size.width,height:size.height};
    if(y<area.y+m||y+size.height>area.y+area.height-m||(validBounds(anchor)&&overlaps(result,anchor)))return null; return result;
  }
  function contextReason(context) { if(!context||context.ready!==true)return 'unknown'; for(const key of ['ownerVisible','automationIdle','recorderIdle','measurementIdle'])if(context[key]!==true)return key; for(const key of ['listOpen','fullscreen','presentationMode'])if(context[key]!==false)return key; return ''; }
  function freshPreferences(){return {schemaVersion:1,enabled:true,day:'',count:0,lastShown:0,dayHiddenUntil:0,dismissed:{}};}
  function readPreferences(value){
    if(value===undefined||value===null)return freshPreferences(); if(typeof value!=='object'||value.schemaVersion!==1||typeof value.enabled!=='boolean')fail('preferences');
    const p=Object.assign(freshPreferences(),value,{dismissed:{}}); for(const key of ['count','lastShown','dayHiddenUntil'])if(!Number.isSafeInteger(p[key])||p[key]<0)fail('preferences.'+key);
    if(typeof p.day!=='string'||(p.day&&!/^\d{4}-\d{2}-\d{2}$/.test(p.day)))fail('preferences.day'); if(!value.dismissed||typeof value.dismissed!=='object'||Array.isArray(value.dismissed))fail('preferences.dismissed');
    for(const [key,until] of Object.entries(value.dismissed)){if(!ID.test(key)||!Number.isSafeInteger(until)||until<0)fail('dismissal');Object.defineProperty(p.dismissed,key,{value:until,enumerable:true,writable:true,configurable:true});} return p;
  }
  function localDay(now){const d=new Date(now);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function nextDay(now){const d=new Date(now);d.setHours(24,0,0,0);return d.getTime();}
  function eligible(creative,context,preferences,now){const reason=contextReason(context);if(reason)return reason;const p=readPreferences(preferences);if(!p.enabled)return 'disabled';if(p.dayHiddenUntil>now)return 'today';if(Object.prototype.hasOwnProperty.call(p.dismissed,creative.campaignId)&&p.dismissed[creative.campaignId]>now)return 'dismissed';if(p.lastShown&&now-p.lastShown<LIMITS.cooldownMs)return 'cooldown';if(p.day===localDay(now)&&p.count>=LIMITS.maxDaily)return 'daily-cap';return '';}
  function recordShown(preferences,now){const p=readPreferences(preferences),day=localDay(now);p.count=p.day===day?p.count+1:1;p.day=day;p.lastShown=now;for(const key of Object.keys(p.dismissed))if(p.dismissed[key]<=now)delete p.dismissed[key];return p;}
  function dismiss(preferences,creative,mode,now){const p=readPreferences(preferences);if(mode==='disable')p.enabled=false;else if(mode==='restore')p.enabled=true;else if(mode==='today')p.dayHiddenUntil=nextDay(now);else if(mode==='campaign')Object.defineProperty(p.dismissed,creative.campaignId,{value:now+LIMITS.dismissMs,enumerable:true,writable:true,configurable:true});else fail('dismiss mode');return p;}
  const CSS=`html,body{margin:0;padding:0;height:100%;background:transparent;color:#fff;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}.promo{position:relative;width:100%;height:100%;overflow:hidden;border-radius:14px;background:#172131;border:1px solid rgba(255,255,255,.13)}button{font:inherit;border:0;cursor:pointer}.chrome{position:absolute;z-index:4;top:0;left:0;right:0;height:42px;padding:9px 9px 8px 14px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(180deg,rgba(4,9,15,.7),transparent)}.badge{font-size:11px;color:rgba(255,255,255,.82);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px}.chrome-actions{display:flex;gap:2px}.icon{width:28px;height:28px;border-radius:7px;background:transparent;color:#fff;font-size:18px}.icon:hover{background:rgba(255,255,255,.13)}.media{position:absolute;inset:0}.media img{width:100%;height:100%;object-fit:cover;display:block}.overlay{position:absolute;z-index:2;inset:auto 0 0;padding:56px 14px 14px;background:linear-gradient(180deg,transparent,rgba(5,10,18,.84));text-shadow:0 1px 3px #000}.title{display:block;font-size:19px;line-height:24px;font-weight:700;max-height:48px;overflow:hidden}.description{margin:4px 0 0;color:rgba(255,255,255,.86);font-size:12px;line-height:17px;max-height:34px;overflow:hidden}.promo-image-text .media{height:164px}.promo-image-text .copy{position:absolute;left:0;right:0;bottom:0;height:104px;padding:12px 14px 34px;background:#172131}.promo-text .copy{position:absolute;inset:44px 0 0;padding:10px 14px 36px}.cta{position:absolute;z-index:5;right:14px;bottom:12px;background:transparent;color:#fff;font-weight:650;padding:2px 0}.menu{position:absolute;z-index:8;right:10px;top:38px;width:188px;padding:6px;border-radius:10px;background:#202d3f;border:1px solid rgba(255,255,255,.16);box-shadow:0 10px 28px rgba(0,0,0,.34)}.menu button{display:block;width:100%;text-align:left;padding:8px 9px;border-radius:7px;background:transparent;color:#fff}.menu button:hover{background:rgba(255,255,255,.11)}.hidden{display:none}.promo-media-only .chrome{background:linear-gradient(180deg,rgba(4,9,15,.5),transparent)}.promo-media-only .overlay{display:none}`;
  function render(input, staticOnly) {
    const c=validateCreative(input),hasMedia=!!c.media,mediaOnly=c.presentation==='media-only',source=hasMedia?(staticOnly?c.media.poster:c.media.src):'';
    const media=hasMedia?'<div class="media"><img id="promotionImage" src="'+escapeHTML(source)+'" alt="'+escapeHTML(c.media.alt)+'"></div>':''; let copy='';
    if(!mediaOnly){if(c.presentation==='image'||c.presentation==='animated-image')copy='<div class="overlay"><strong id="promotionTitle" class="title">'+escapeHTML(c.title)+'</strong><p id="promotionDescription" class="description">'+escapeHTML(c.description)+'</p></div>';else copy='<div class="copy"><strong id="promotionTitle" class="title">'+escapeHTML(c.title)+'</strong><p id="promotionDescription" class="description">'+escapeHTML(c.description)+'</p></div>';}
    return {size:sizeFor(c),css:CSS,html:'<main id="promotionCard" class="promo promo-'+c.presentation+'"><div class="chrome"><span class="badge">推广 · '+escapeHTML(c.advertiser)+'</span><div class="chrome-actions"><button id="promotionMore" class="icon" aria-label="推广选项">⋯</button><button id="promotionClose" class="icon" aria-label="关闭本次推广">×</button></div></div>'+media+copy+'<button id="promotionOpen" class="cta">'+escapeHTML(c.cta)+' →</button><div id="promotionMenu" class="menu hidden"><button id="promotionToday">今天不再显示</button><button id="promotionCampaign">7 天不再显示此推广</button><button id="promotionDisable">关闭所有推广</button></div></main>'};
  }
  const api=Object.freeze({LIMITS,PRESENTATIONS,MEDIA_KINDS,validateCreative,mediaSource,escapeHTML,sizeFor,validBounds,overlaps,place,contextReason,freshPreferences,readPreferences,eligible,recordShown,dismiss,render,CSS});
  root.OpenDeskPromotionsCore=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
