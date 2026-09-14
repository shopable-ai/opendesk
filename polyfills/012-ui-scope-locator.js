// UI.within(win) + lightweight locator. This layer owns no OCR/AX/mouse executor.
(function (g) {
  'use strict';
  const UI = g.UI, W = g.window, own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
  if (!UI || !W || typeof W.current !== 'function') return;
  const roles = new Set(['application','window','button','checkbox','radioButton','textField','staticText','menuBar','menu','menuItem','group','list','listItem','table','row','cell','unknown']);
  const winKeys = ['id','title','pid','processId','processID','x','y','width','height','exeName','exePath','isForeground','hasFocus','handle','isPopup','index'];
  const scoped = ['findText','findTexts','findTextMatches','hasText','tapText','tapTexts','tapTargets','findImage','findImages','tapImage'];
  function E(code, operation, message, details) {
    const e = new Error(message); e.code = code; e.operation = operation;
    if (details) Object.assign(e, details); return e;
  }
  function bad(op, msg) { throw E('INVALID_ARGUMENT', op, msg, { phase:'arguments', actionState:'not_started' }); }
  function obj(v) { return !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === null || Object.prototype.toString.call(v) === '[object Object]'); }
  function options(v, op, allow) {
    if (v === undefined) return {};
    if (!obj(v) || Object.getOwnPropertySymbols(v).length) bad(op, 'options must be a plain object without symbol fields');
    if (own(v, 'within')) bad(op, 'scope-bound operations do not accept options.within');
    if (allow) { const badKeys = Object.keys(v).filter(k => !allow.includes(k)); if (badKeys.length) bad(op, 'unknown option(s): ' + badKeys.join(', ')); }
    const out = {}; for (const k of Object.keys(v)) out[k] = Array.isArray(v[k]) ? Array.from(v[k]) : (obj(v[k]) ? Object.assign({}, v[k]) : v[k]);
    return out;
  }
  function n(v, lo, hi, name, op) { if (!Number.isInteger(v) || v < lo || v > hi) bad(op, name + ' must be an integer from ' + lo + ' to ' + hi); return v; }
  function signal(v, op) {
    if (v == null) return null;
    if (typeof v.aborted !== 'boolean' || typeof v.addEventListener !== 'function' || typeof v.removeEventListener !== 'function') bad(op, 'signal must be an AbortSignal');
    return v;
  }
  function canceled(s, op) { if (s && s.aborted) throw E('CANCELED', op, 'operation was canceled', { phase:'observation', actionState:'not_started' }); }
  function str(v, name, op) { if (typeof v !== 'string' || !v.length) bad(op, name + ' must be a non-empty string'); return v; }
  function snapWindow(v, op) {
    if (!obj(v) || Object.getOwnPropertySymbols(v).length) bad(op, 'window must be a resolved WindowInfo object');
    const extra = Object.keys(v).filter(k => !winKeys.includes(k)); if (extra.length) bad(op, 'unknown WindowInfo field(s): ' + extra.join(', '));
    if (typeof v.id !== 'string' || !v.id.length || /:unresolved$/.test(v.id) || typeof v.title !== 'string' || !v.title.trim() ||
        !Number.isSafeInteger(v.pid) || v.pid < 1 || v.pid > 4294967295 || !Number.isSafeInteger(v.handle) || v.handle < 1 ||
        !Number.isInteger(v.x) || !Number.isInteger(v.y) || !Number.isInteger(v.width) || !Number.isInteger(v.height) || v.width < 1 || v.height < 1)
      bad(op, 'window must contain resolved id/title/PID/handle and valid bounds');
    for (const a of ['processId','processID']) if (own(v,a) && v[a] !== v.pid) bad(op, 'window PID aliases must agree');
    const out = {}; for (const k of winKeys) if (own(v,k)) out[k] = v[k]; return Object.freeze(out);
  }
  async function refresh(initial, op) {
    const w = snapWindow(await W.current(initial), op);
    if (w.id !== initial.id || w.pid !== initial.pid || w.handle !== initial.handle) throw E('STALE_TARGET', op, 'bound window identity changed', { phase:'scope', actionState:'not_started' });
    return w;
  }
  function cloneTarget(v, op) {
    if (!obj(v) || Object.getOwnPropertySymbols(v).length) bad(op, 'target must be a plain object without symbol fields');
    const ks = Object.keys(v); if (!ks.length || ks.some(k => !['text','image','role','name','identifier'].includes(k))) bad(op, 'target contains no identity field or an unknown field');
    if (own(v,'image')) { if (ks.length !== 1) bad(op, 'image target cannot mix with text or semantic fields'); return Object.freeze({ kind:'image', public:Object.freeze({image:str(v.image,'target.image',op)}) }); }
    const pub = {}; for (const k of ks) { pub[k] = str(v[k], 'target.'+k, op); if (k === 'role' && !roles.has(pub[k])) bad(op, 'target.role is not a normalized Accessibility role'); }
    const semantic = own(pub,'role') || own(pub,'name') || own(pub,'identifier');
    if (!semantic) { if (ks.length !== 1 || !own(pub,'text')) bad(op, 'text target must contain only target.text'); return Object.freeze({ kind:'text', public:Object.freeze(pub) }); }
    const selector = {}; if (pub.role) selector.role = pub.role; if (pub.name) selector.name = pub.name; else if (pub.text) selector.name = pub.text; if (pub.identifier) selector.identifier = pub.identifier;
    return Object.freeze({ kind:'semantic', public:Object.freeze(pub), selector:Object.freeze(selector) });
  }
  function bounds(v) { if (!v || typeof v !== 'object' || ![v.x,v.y,v.width,v.height].every(Number.isFinite)) return; const b={x:v.x,y:v.y,width:v.width,height:v.height}; if (typeof v.coordinateSpace === 'string') b.coordinateSpace=v.coordinateSpace; return Object.freeze(b); }
  function match(t,w,c,source) {
    const wb = bounds({x:w.x,y:w.y,width:w.width,height:w.height,coordinateSpace:'screen'});
    const out = { target:t.public, source, window:Object.freeze({id:w.id,pid:w.pid,handle:w.handle,title:w.title,bounds:wb}), observedAt:Date.now() };
    if (c) {
      const b=bounds(c.bounds); if (b) out.bounds=b;
      for (const k of ['text','provider','template','role','name','identifier']) if (typeof c[k] === 'string' && c[k]) out[k]=c[k];
      if (Number.isFinite(c.confidence)) out.confidence=c.confidence;
      for (const k of ['enabled','focused','selected','checked','expanded']) if (typeof c[k] === 'boolean') out[k]=c[k];
      if (source === 'ocr' || source === 'image') out.visible=true;
    }
    return Object.freeze(out);
  }
  function findOpts(raw, op, override) {
    const o=options(raw,op,['timeout','signal','maxDepth','maxNodes']);
    o.timeout=override===undefined?(o.timeout===undefined?3000:n(o.timeout,1,30000,'options.timeout',op)):override;
    o.signal=signal(o.signal,op); if (o.maxDepth!==undefined) n(o.maxDepth,1,32,'options.maxDepth',op); if (o.maxNodes!==undefined) n(o.maxNodes,1,5000,'options.maxNodes',op); return o;
  }
  async function release(ref, primary, op) {
    if (!ref) return;
    try { if (await g.Accessibility.release(ref) !== true) throw E('BACKEND_FAILED',op,'Accessibility ref was not released',{phase:'cleanup'}); }
    catch (e) { if (primary) primary.cleanupError=e; else throw e; }
  }
  async function semanticFind(t,w,o,op) {
    const A=g.Accessibility; if (!A || typeof A.find!=='function' || typeof A.read!=='function' || typeof A.release!=='function') throw E('NOT_SUPPORTED',op,'native Accessibility observation is unavailable',{phase:'capability',actionState:'not_started'});
    const deadline=Date.now()+o.timeout; let ref=null, primary=null;
    try {
      canceled(o.signal,op); const fo={within:w,timeout:Math.max(1,Math.min(30000,deadline-Date.now()))}; if(o.maxDepth!==undefined)fo.maxDepth=o.maxDepth;if(o.maxNodes!==undefined)fo.maxNodes=o.maxNodes;
      ref=await A.find(t.selector,fo); canceled(o.signal,op); if(Date.now()>=deadline)throw E('TIMEOUT',op,'target observation exceeded deadline',{phase:'observation',actionState:'not_started'}); if(!ref)return null;
      const r=await A.read(ref,{timeout:Math.max(1,Math.min(30000,deadline-Date.now())),properties:['role','name','identifier','enabled','focused','selected','checked','expanded','bounds']}); canceled(o.signal,op);
      if(Date.now()>deadline)throw E('TIMEOUT',op,'target observation exceeded deadline',{phase:'observation',actionState:'not_started'}); if(!r||!r.properties)throw E('SEARCH_INCOMPLETE',op,'native target observation returned no readable properties',{phase:'observation',actionState:'not_started'});
      const c={}; for(const k of ['role','name','identifier'])if(typeof r.properties[k]==='string'&&r.properties[k])c[k]=r.properties[k]; for(const k of ['enabled','focused','selected','checked','expanded'])if(typeof r.properties[k]==='boolean')c[k]=r.properties[k]; if(r.properties.bounds)c.bounds=r.properties.bounds;
      return match(t,w,c,'accessibility');
    } catch(e) { primary=e; throw e; } finally { await release(ref,primary,op); }
  }
  async function findOnce(initial,t,raw,op,override) {
    const o=findOpts(raw,op,override); canceled(o.signal,op); const w=await refresh(initial,op); canceled(o.signal,op);
    if(t.kind==='semantic')return semanticFind(t,w,o,op);
    if(t.kind==='text'){const c=await UI.findText(t.public.text,{within:w,timeout:o.timeout});canceled(o.signal,op);return c?match(t,w,c,c.source||'ocr'):null;}
    const c=await UI.findImage(t.public.image,{within:w,timeout:o.timeout});canceled(o.signal,op);return c?match(t,w,c,c.source||'image'):null;
  }
  async function sleep(ms,s,op){if(ms<=0)return;canceled(s,op);if(g.page&&typeof g.page.waitForTimeout==='function'){try{await g.page.waitForTimeout(ms,s?{signal:s}:undefined);}catch(e){if(s&&s.aborted)canceled(s,op);throw e;}return;}await new Promise((res,rej)=>{let done=false,t;const finish=e=>{if(done)return;done=true;if(t)g.clearTimeout(t);if(s)s.removeEventListener('abort',abort);e?rej(e):res();};const abort=()=>finish(E('CANCELED',op,'operation was canceled',{phase:'wait',actionState:'not_started'}));if(s)s.addEventListener('abort',abort,{once:true});t=g.setTimeout(()=>finish(),ms);});}
  function locator(initial,rawTarget) {
    const t=cloneTarget(rawTarget,'UIScope.locator');
    return Object.freeze({
      find(raw){return findOnce(initial,t,raw,'UILocator.find');},
      async waitFor(raw){const op='UILocator.waitFor',o=options(raw,op,['state','timeout','signal']),state=o.state===undefined?'exists':o.state;if(!['exists','visible'].includes(state))bad(op,'options.state must be "exists" or "visible"');const timeout=o.timeout===undefined?10000:n(o.timeout,0,300000,'options.timeout',op),s=signal(o.signal,op),deadline=Date.now()+timeout;for(;;){canceled(s,op);const budget=timeout===0?1:Math.max(1,Math.min(30000,deadline-Date.now()));const m=await findOnce(initial,t,{timeout:budget,signal:s},op,budget);if(m){if(state==='exists'||m.visible===true)return;if(t.kind==='semantic')throw E('NOT_SUPPORTED',op,'visible state is not reliably observable for this semantic target',{phase:'state',actionState:'not_started'});}if(timeout===0||Date.now()>=deadline)throw E('TIMEOUT',op,'timed out waiting for target state',{state,timeout,phase:'wait',actionState:'not_started'});await sleep(Math.min(200,Math.max(1,deadline-Date.now())),s,op);}},
      async tap(raw){const op='UILocator.tap',o=options(raw,op,['timeout','signal']),s=signal(o.signal,op);if(o.timeout!==undefined)n(o.timeout,1,30000,'options.timeout',op);canceled(s,op);const w=await refresh(initial,op);canceled(s,op);const d={};if(o.timeout!==undefined)d.timeout=o.timeout;if(t.kind==='semantic'){if(s)d.signal=s;return UI.tapTargets([t.public],Object.assign({within:w,intervalMs:0},d));}if(t.kind==='text')return UI.tapText(t.public.text,Object.assign({within:w},d));return UI.tapImage(t.public.image,Object.assign({within:w},d));},
      async getValue(raw){const op='UILocator.getValue';if(t.kind!=='semantic')throw E('NOT_SUPPORTED',op,'visual targets do not expose a provable native field value',{phase:'capability',actionState:'not_started'});const o=options(raw,op,['timeout','maxDepth','maxNodes']),w=await refresh(initial,op);return UI.getValue(t.selector,Object.assign({within:w},o));},
      async setValue(value,raw){const op='UILocator.setValue';if(t.kind!=='semantic')throw E('NOT_SUPPORTED',op,'visual targets cannot set a provable native field value',{phase:'capability',actionState:'not_started'});const o=options(raw,op,['timeout','maxDepth','maxNodes']),w=await refresh(initial,op);return UI.setValue(t.selector,value,Object.assign({within:w},o));}
    });
  }
  function seq(v,method){if(method==='tapTexts')return Array.isArray(v)?Array.from(v):v;if(method!=='tapTargets'||!Array.isArray(v))return v;return Array.from(v,x=>{if(!obj(x))return x;const c=Object.assign({},x);if(obj(c.locator))c.locator=Object.assign({},c.locator);return c;});}
  function scope(win) {
    const initial=snapWindow(win,'UI.within'), out={};
    for(const method of scoped)if(typeof UI[method]==='function')out[method]=async function(){const a=Array.prototype.slice.call(arguments);if(a.length)a[0]=seq(a[0],method);const o=options(a[1],'UIScope.'+method),w=await refresh(initial,'UIScope.'+method);a[1]=Object.assign({},o,{within:w});return UI[method].apply(UI,a);};
    out.getValue=async function(target,raw){const op='UIScope.getValue',t=cloneTarget(target,op);if(t.kind!=='semantic')throw E('NOT_SUPPORTED',op,'visual targets do not expose a provable native field value',{phase:'capability',actionState:'not_started'});const o=options(raw,op,['timeout','maxDepth','maxNodes']),w=await refresh(initial,op);return UI.getValue(t.selector,Object.assign({within:w},o));};
    out.setValue=async function(target,value,raw){const op='UIScope.setValue',t=cloneTarget(target,op);if(t.kind!=='semantic')throw E('NOT_SUPPORTED',op,'visual targets cannot set a provable native field value',{phase:'capability',actionState:'not_started'});const o=options(raw,op,['timeout','maxDepth','maxNodes']),w=await refresh(initial,op);return UI.setValue(t.selector,value,Object.assign({within:w},o));};
    out.locator=target=>locator(initial,target); return Object.freeze(out);
  }
  UI.within=win=>scope(win);
})(globalThis);
