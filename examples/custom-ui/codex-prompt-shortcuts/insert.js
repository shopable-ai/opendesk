// Evaluating this helper performs no IO. App qualification is recorded separately.
(function () {
'use strict';
// getTarget must return the caller's app-identity-verified, resolved WindowInfo.
// editorSelector must come from reviewed composer evidence, never guessed labels.
// Trusted local Runtime only (Accessibility is disabled over HTTP/MCP/Scheduler).
// This candidate needs readable AX textField value and live screen bounds. No
// measured non-AX route is available here; this is not a product-wide AX policy.
// textInputState is a native, explicit-only observation. It does not prove an
// idle IME. The explicit paste policy uses ordinary desktop input; strict mode
// still requires an unavailable editor-directed compare-and-append transport.
const properties = ['role', 'nativeRole', 'name', 'identifier', 'enabled', 'focused', 'value', 'bounds'];
const windowKeys = ['id', 'pid', 'handle', 'title', 'exePath', 'x', 'y', 'width', 'height'];
const rectKeys = ['x', 'y', 'width', 'height', 'coordinateSpace'];
const same = (a, b, keys) => !!a && !!b && keys.every(k => a[k] === b[k]);
const stop = code => { throw Object.assign(new Error(code), { code }); };
const rect = b => b && b.coordinateSpace === 'screen' &&
  ['x', 'y', 'width', 'height'].every(k => Number.isFinite(b[k])) && b.width > 0 && b.height > 0;
const calibrationKeys = ['id', 'pid', 'handle', 'title', 'exePath', 'width', 'height'];
const relativeBounds = (win, bounds) => ({ x: bounds.x - win.x, y: bounds.y - win.y,
  width: bounds.width, height: bounds.height });
const withinWindow = (win, b) => rect(b) && b.x >= win.x && b.y >= win.y &&
  b.x + b.width <= win.x + win.width && b.y + b.height <= win.y + win.height;
function validateTarget(target) {
  if (typeof target?.id !== 'string' || !target.id || target.id.endsWith(':unresolved') ||
      !Number.isInteger(target.pid) || target.pid <= 0 ||
      !Number.isInteger(target.handle) || target.handle <= 0 ||
      typeof target.title !== 'string' || !rect({ ...target, coordinateSpace: 'screen' }))
    stop('INVALID_TARGET');
}
async function guardTarget(getTarget, window, target, scope) {
  if(scope!==undefined){
    if(!scope||Object.keys(scope).length!==2||!Number.isInteger(scope.pid)||scope.pid<=0||
        scope.pid>2147483647||typeof scope.exePath!=='string'||!scope.exePath||
        target.pid!==scope.pid||target.exePath!==scope.exePath)stop('INVALID_TARGET');
    const fresh=await window.getAppWindow({pid:scope.pid,exePath:scope.exePath});
    if(!same(target,await getTarget(),windowKeys)||!same(target,fresh,windowKeys))stop('TARGET_CHANGED');
    if(fresh.isForeground!==true)stop('NOT_FOREGROUND');
    return;
  }
  if (!same(target, await getTarget(), windowKeys) ||
      !same(target, await window.current(target), windowKeys)) stop('TARGET_CHANGED');
  const active = await window.getActiveWindow();
  if (!same(target, active, windowKeys) || active.isForeground !== true) stop('NOT_FOREGROUND');
}
async function snapshotNodes(Accessibility, target, maxDepth=24) {
  const snapshot = await Accessibility.snapshot({ within: target, properties,
    timeout: 3000, maxDepth, maxNodes: 2000 });
  if (snapshot.complete !== true || snapshot.truncated !== false || !snapshot.root)
    stop('SEARCH_INCOMPLETE');
  const nodes = [], stack = [snapshot.root], seen = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (!node || seen.has(node) || seen.size >= 2000) stop('SEARCH_INCOMPLETE');
    seen.add(node); nodes.push(node);
    if (!Array.isArray(node.children)) stop('SEARCH_INCOMPLETE');
    stack.push(...node.children);
  }
  return nodes;
}
const matchesSelector = (node, selector) => Object.keys(selector).every(k => node[k] === selector[k]);

/** Read-only user-pointer calibration; throws an Error with code on rejection.
 * Caller instructs the user to point at the composer before invoking this.
 * Returns Promise<{editorSelector, layout}>; no click, focus, clipboard or input.
 * Unnamed fields are rejected: a nonempty name/identifier and globally unique
 * selector within the resolved window are required by this bounded candidate.
 */
async function calibrateRuntimeEditor({ getTarget, scope, runtime = globalThis }) {
  const { window, Accessibility, mouse } = runtime;
  const target = { ...await getTarget() };
  validateTarget(target);
  const guard = () => guardTarget(getTarget, window, target, scope);
  await guard();
  const pointer = mouse.getPos();
  if (!pointer || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) stop('POINTER_UNREADABLE');
  const containsPointer = node => withinWindow(target, node.bounds) &&
    pointer.x >= node.bounds.x && pointer.y >= node.bounds.y &&
    pointer.x < node.bounds.x + node.bounds.width && pointer.y < node.bounds.y + node.bounds.height;
  const nodes = await snapshotNodes(Accessibility, target);
  const candidates = nodes.filter(n => n.role === 'textField' && n.enabled === true && containsPointer(n));
  if (candidates.length !== 1) stop(candidates.length ? 'AMBIGUOUS_FIELD' : 'MISSING_FIELD');
  const field = candidates[0], editorSelector = { role: 'textField' };
  for (const key of ['name', 'identifier'])
    if (typeof field[key] === 'string' && field[key].length) editorSelector[key] = field[key];
  if (Object.keys(editorSelector).length === 1) stop('EDITOR_EVIDENCE_REQUIRED');
  if (nodes.filter(n => matchesSelector(n, editorSelector)).length !== 1) stop('AMBIGUOUS_FIELD');
  await guard();
  const fresh = (await snapshotNodes(Accessibility, target)).filter(n => matchesSelector(n, editorSelector));
  if (fresh.length !== 1 || fresh[0].enabled !== true ||
      !same(fresh[0].bounds, field.bounds, rectKeys)) stop('FIELD_CHANGED');
  await guard();
  if (!same(pointer, mouse.getPos(), ['x', 'y'])) stop('POINTER_CHANGED');
  return { editorSelector, layout: {
    window: Object.fromEntries(calibrationKeys.filter(k => target[k] !== undefined).map(k => [k, target[k]])),
    editor: relativeBounds(target, field.bounds),
  } };
}

/** Discover from explicit app evidence or a reviewed candidate point. An
 * unnamed editor requires the profile's native-role policy and window-wide
 * uniqueness. The hint is never a click target.
 * No cached selector, PID, window size, or pointer position survives a click.
 */
async function discoverRuntimeEditor({getTarget, hint, editorSelector: configuredSelector, editorDiscovery, maxDepth=24, scope, runtime = globalThis}) {
  const {window, Accessibility} = runtime;
  const target = {...await getTarget()}; validateTarget(target);
  if (configuredSelector && (configuredSelector.role !== 'textField' ||
      !['name','identifier'].some(k => typeof configuredSelector[k] === 'string' && configuredSelector[k]) ||
      Object.keys(configuredSelector).some(k => !['role','name','identifier'].includes(k) ||
        typeof configuredSelector[k] !== 'string' || !configuredSelector[k]))) stop('EDITOR_EVIDENCE_REQUIRED');
  await guardTarget(getTarget, window, target, scope);
  if(editorDiscovery&&(configuredSelector||editorDiscovery.role!=='textField'||
      typeof editorDiscovery.nativeRole!=='string'||!editorDiscovery.nativeRole||
      !Number.isInteger(editorDiscovery.maxDepth)||editorDiscovery.maxDepth<1||editorDiscovery.maxDepth>32||
      Object.keys(editorDiscovery).some(k=>!['role','nativeRole','maxDepth'].includes(k))))stop('EDITOR_EVIDENCE_REQUIRED');
  if (!configuredSelector && !editorDiscovery && (!hint || !Number.isFinite(hint.x) || !Number.isFinite(hint.y) ||
      hint.x < 0 || hint.y < 0 || hint.x >= target.width || hint.y >= target.height))
    stop('EDITOR_EVIDENCE_REQUIRED');
  const point = hint && {x: target.x + hint.x, y: target.y + hint.y};
  const searchDepth=editorDiscovery?.maxDepth||maxDepth;
  if(!Number.isInteger(searchDepth)||searchDepth<1||searchDepth>64)stop('EDITOR_EVIDENCE_REQUIRED');
  const nodes = await snapshotNodes(Accessibility, target, searchDepth);
  const matches = nodes.filter(n => n.role === 'textField' && n.enabled !== false &&
    (editorDiscovery ? n.nativeRole===editorDiscovery.nativeRole : withinWindow(target, n.bounds) && (
      configuredSelector ? matchesSelector(n, configuredSelector) :
      point.x >= n.bounds.x && point.y >= n.bounds.y &&
      point.x < n.bounds.x + n.bounds.width && point.y < n.bounds.y + n.bounds.height)));
  if (matches.length !== 1) stop(matches.length ? 'AMBIGUOUS_FIELD' : 'MISSING_FIELD');
  const field = matches[0], editorSelector = {role: 'textField'};
  if(!withinWindow(target,field.bounds))stop('UNSAFE_BOUNDS');
  for (const k of ['name', 'identifier'])
    if (typeof field[k] === 'string' && field[k]) editorSelector[k] = field[k];
  if (Object.keys(editorSelector).length === 1 && !editorDiscovery) stop('EDITOR_EVIDENCE_REQUIRED');
  if (nodes.filter(n => matchesSelector(n, editorSelector)).length !== 1) stop('AMBIGUOUS_FIELD');
  await guardTarget(getTarget, window, target, scope);
  return {editorSelector,searchDepth,...(editorDiscovery?{nativeRole:editorDiscovery.nativeRole}:{}), layout: {
    window: Object.fromEntries(calibrationKeys.map(k => [k, target[k]])),
    editor: relativeBounds(target, field.bounds),
  }};
}

function inputState(p) {
  const state = p.textInputState, range = state?.selection;
  if (!state || state.unit !== 'utf16' || state.composition === 'unknown' ||
      !range || !Number.isSafeInteger(range.location) || !Number.isSafeInteger(range.length) ||
      range.location < 0 || range.length < 0 || range.location + range.length > p.value.length)
    stop(p.value ? 'EXISTING_DRAFT' : 'INPUT_STATE_UNVERIFIABLE');
  if (state.composition !== 'inactive') stop('IME_ACTIVE');
}

// Ordinary paste is intentionally a small desktop operation. Discovery proves
// uniqueness once; read(ref) revalidates that exact native element. A focused
// caret receives one paste only. Full Copy is reserved for fallback append.
function createPasteInserter({getTarget, editorSelector, nativeRole, searchDepth=24, layout, expectedWindow,
  window, Accessibility, scope, editorModel='plain', verifyContext, mouse, clipboard, keyboard, delay, onPhase}) {
  let busy=false,blocked=false,prepared=null,preparing=null,disposed=false;
  const selector={...editorSelector};
  const emit=(phase,detail)=>{try{onPhase?.(phase,detail);}catch(_){}};
  const prepare=()=>{
    if(disposed||blocked||busy)return Promise.resolve();
    if(prepared)return Promise.resolve();
    if(preparing)return preparing;
    preparing=(async()=>{
      const target={...await getTarget()};validateTarget(target);
      if(expectedWindow&&!same(target,expectedWindow,windowKeys))stop('TARGET_CHANGED');
      if(target.isForeground!==true)stop('NOT_FOREGROUND');
      const ref=await Accessibility.find(selector,{within:target,timeout:3000,maxDepth:searchDepth,maxNodes:2000});
      if(!ref)stop('MISSING_FIELD');
      if(disposed)await Accessibility.release(ref);else prepared={ref,target};
    })().finally(()=>{preparing=null;});
    return preparing;
  };
  return {prepare,setOnPhase(callback){onPhase=callback;},async dispose(){
    disposed=true;
    if(preparing)try{await preparing;}catch(_){}
    if(prepared){const {ref}=prepared;prepared=null;await Accessibility.release(ref);}
  },async insert(body){
    const result=(status,code,actionState='not_started')=>({status,code,actionState});
    if(blocked)return result('blocked','INPUT_BLOCKED','unknown');
    if(busy)return result('rejected','BUSY');
    if(!['plain','claude-code','opencode'].includes(editorModel))return result('rejected','INVALID_EDITOR_MODEL');
    if(typeof body!=='string'||!body.trim()||body.length>8192||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(body))return result('rejected','UNSAFE_BODY');
    if(selector.role!=='textField'||Object.keys(selector).some(k=>!['role','name','identifier'].includes(k)||
        typeof selector[k]!=='string'||!selector[k])||
        !['name','identifier'].some(k=>selector[k])&&!(typeof nativeRole==='string'&&nativeRole)||
        !Number.isInteger(searchDepth)||searchDepth<1||searchDepth>64)return result('rejected','EDITOR_EVIDENCE_REQUIRED');
    busy=true;
    let ref,attempted=false,phase='preflight',outcome;
    try{
      if(typeof clipboard?.copy!=='function'||typeof clipboard?.paste!=='function'||
          typeof keyboard?.combination!=='function'||typeof delay!=='function')stop('INPUT_UNAVAILABLE');
      emit('target-start');
      const target={...await getTarget()};validateTarget(target);emit('target');
      if(expectedWindow&&!same(target,expectedWindow,windowKeys))stop('TARGET_CHANGED');
      if(layout&&!same(target,layout.window,calibrationKeys))stop('LAYOUT_CHANGED');
      if(scope&&(!same(scope,target,['pid','exePath'])||Object.keys(scope).length!==2))stop('INVALID_TARGET');
      const guard=async()=>{
        if(disposed)stop('STALE_TARGET');
        emit('guard-start');
        const fresh=scope?await window.getAppWindow(scope):await getTarget();
        if(!same(target,fresh,windowKeys))stop('TARGET_CHANGED');
        if(fresh.isForeground!==true)stop('NOT_FOREGROUND');
        if(!scope){
          const active=await window.getActiveWindow();
          if(!same(target,active,windowKeys)||active.isForeground!==true)stop('NOT_FOREGROUND');
        }
        if(disposed)stop('STALE_TARGET');
        emit('guard-ready');
      };
      if(target.isForeground!==true)stop('NOT_FOREGROUND');
      if(disposed)stop('STALE_TARGET');
      if(preparing){emit('prepare-wait');await preparing;}
      if(disposed)stop('STALE_TARGET');
      if(prepared){
        emit('prepared-editor');
        ref=prepared.ref;const observed=prepared.target;prepared=null;
        if(!same(observed,target,windowKeys))stop('TARGET_CHANGED');
      }else{emit('find-start');ref=await Accessibility.find(selector,{within:target,timeout:3000,maxDepth:searchDepth,maxNodes:2000});}
      if(!ref)stop('MISSING_FIELD');emit('editor');
      let readCount=0;
      const read=async(initial=false,needsBounds=false)=>{
        if(disposed)stop('STALE_TARGET');
        const index=++readCount,startedAt=Date.now();emit('read-start',{index});
        const p=(await Accessibility.read(ref,{properties:[...properties.filter(k=>k!=='bounds'),
          ...(needsBounds||initial&&layout?.editor?['bounds']:[]),'textInputState'],timeout:1500})).properties;
        emit('read-ready',{index,durationMs:Date.now()-startedAt});
        if(disposed)stop('STALE_TARGET');
        if(!p||!matchesSelector(p,selector)||nativeRole&&p.nativeRole!==nativeRole)stop('FIELD_CHANGED');
        if(p.enabled!==true)stop('FIELD_UNAVAILABLE');
        if(typeof p.value!=='string')stop('VALUE_UNREADABLE');
        if((needsBounds||initial&&layout?.editor)&&!withinWindow(target,p.bounds))stop('UNSAFE_BOUNDS');
        if(initial&&layout?.editor&&!same(relativeBounds(target,p.bounds),layout.editor,['x','y','width','height']))stop('LAYOUT_CHANGED');
        return p;
      };
      const web=editorModel!=='plain';
      const state=p=>{
        const s=p.textInputState,r=s?.selection;
        if(s?.unit!=='utf16'||!r||!Number.isSafeInteger(r.location)||!Number.isSafeInteger(r.length)||
            r.location<0||r.length<0||!Number.isSafeInteger(r.location+r.length)||
            !web&&r.location+r.length>p.value.length)stop('SELECTION_UNREADABLE');
        if(s.composition==='active'||s.markedRange?.length>0)stop('IME_ACTIVE');
        return r;
      };
      // Qualify the page once, before reading the focused editor. There is no
      // scene scan or asynchronous field read between the final guard and V.
      emit('context-start');if(verifyContext)await verifyContext();emit('context-ready');
      let field=await read(true);state(field);const raw=field.value;emit('field-read');
      const direct=field.focused===true&&state(field).length===0;
      if(field.focused!==true){
        if(typeof mouse?.clickPoint!=='function')stop('INPUT_UNAVAILABLE');
        field=await read(false,true);state(field);
        if(field.value!==raw)stop('DRAFT_CHANGED');
        await guard();attempted=true;phase='focus';
        await mouse.clickPoint({x:field.bounds.x+field.bounds.width/2,
          y:field.bounds.y+field.bounds.height/2,coordinateSpace:'screen'});
        field=await read();state(field);
        if(field.value!==raw)stop('DRAFT_CHANGED');
        if(field.focused!==true)stop('FOCUS_UNVERIFIED');
      }
      let range=state(field);
      // Web AX values/offsets are not a faithful text-length oracle. One end
      // key collapses selection without replacing any original draft. Plain
      // editors already at the proven endpoint need no caret input at all.
      if(!direct&&(web||range.length||range.location!==raw.length)){
        await guard();attempted=true;phase='caret';
        await keyboard.combination('Meta','ArrowDown');
        for(let i=0;i<10;i++){
          field=await read();range=state(field);
          if(field.value!==raw)stop('DRAFT_CHANGED');
          if(field.focused!==true)stop('FOCUS_UNVERIFIED');
          if(range.length===0&&(web||range.location===raw.length))break;
          if(i===9)stop('CARET_UNVERIFIED');
          await delay(25);
        }
      }
      // Only the ambiguous one-paragraph empty representation needs the
      // extra boundary check. Never strip a genuine newline from a draft.
      if(!direct&&web&&raw==='\n'&&range.location===0){
        await guard();attempted=true;phase='caret';await keyboard.combination('ArrowRight');
        const boundary=await read(),r=state(boundary);
        if(boundary.value!==raw||boundary.focused!==true||!same(r,range,['location','length']))stop('CARET_UNVERIFIED');
        field=boundary;
      }
      if(!direct&&web&&raw!=='\n'&&raw!==''&&range.location===0)stop('CARET_UNVERIFIED');
      const empty=web?range.location===0:raw.length===0;
      emit('caret-ready');
      const suffix=(direct||empty?'':'\n\n')+body;
      clipboard.copy(suffix);
      if(!direct){
        const ready=await read(),r=state(ready);
        if(ready.value!==raw)stop('DRAFT_CHANGED');
        if(ready.focused!==true||!same(r,range,['location','length']))stop('CARET_CHANGED');
      }
      await guard();
      if(clipboard.paste()!==suffix)stop('CLIPBOARD_CHANGED');
      attempted=true;phase='paste';emit('paste-start');
      await keyboard.combination('Meta','v');emit('paste-dispatched');phase='readback';
      let actual;
      for(let i=0;i<20;i++){
        actual=await read();
        if(actual.focused!==true)stop('FOCUS_UNVERIFIED');
        if(actual.value!==raw)break;
        if(i===19)stop('READBACK_MISMATCH');
        await delay(25);
      }
      emit('value-observed');
      if(web&&!direct){
        await guard();
        await keyboard.combination('Meta','a');
        let selected;
        for(let i=0;i<10;i++){
          selected=await read();const s=state(selected);
          if(selected.value!==actual.value||selected.focused!==true)stop('DRAFT_CHANGED');
          if(s.location===0&&s.length>0)break;
          if(i===9)stop('COPY_UNVERIFIED');
          await delay(25);
        }
        const marker='OpenDesk copy probe '+Date.now()+' '+Math.random();
        clipboard.copy(marker);await guard();
        if(clipboard.paste()!==marker)stop('CLIPBOARD_CHANGED');
        await keyboard.combination('Meta','c');
        let copied=marker;
        for(let i=0;i<20&&copied===marker;i++){await delay(25);copied=clipboard.paste();}
        if(copied===marker)stop('COPY_UNVERIFIED');
        // Copy is the actual string, without trimming or AX normalization.
        // Fallback append checks its suffix; this is no editor transaction.
        if(typeof copied!=='string'||!copied.endsWith(suffix)||empty&&copied!==body)stop('READBACK_MISMATCH');
        const checked=await read();
        if(checked.value!==selected.value||checked.focused!==true||
            !same(state(checked),state(selected),['location','length']))stop('DRAFT_CHANGED');
        await guard();phase='caret';await keyboard.combination('Meta','ArrowDown');
        const restored=await read();
        if(restored.value!==checked.value||restored.focused!==true||state(restored).length!==0)stop('CARET_UNVERIFIED');
      }else if(!web&&actual.value!==(direct?raw.slice(0,range.location)+body+raw.slice(range.location):raw+suffix))stop('READBACK_MISMATCH');
      await guard();
      // Web AX projects whitespace and caret offsets. Observing its value
      // change acknowledges paste without pretending to verify exact text.
      // Do not select/copy or move the user's caret just to obtain a receipt.
      const verified=!(web&&direct);emit(verified?'verified':'paste-observed');
      outcome={status:'inserted',code:verified?'VERIFIED_PASTE':'PASTE_OBSERVED',actionState:'acknowledged',verified};
    }catch(error){
      blocked=attempted||error?.actionState==='unknown';
      outcome={...result(blocked?'blocked':'rejected',error?.code||'INSERT_FAILED',blocked?'unknown':'not_started'),phase};
    }finally{
      if(ref)try{await Accessibility.release(ref);}catch(_){blocked=true;outcome={...result('blocked','RELEASE_FAILED','unknown'),phase:'release'};}
      busy=false;
    }
    return outcome;
  }};
}

/** The default strict policy only preflights. An explicit paste policy inputs
 * at a focused collapsed caret, or falls back to focus/end/append.
 * Neither policy invents provider composition state or an atomic transaction.
 * Any uncertain input latches this instance until the caller reconciles it.
 */
function createInserter({ getTarget, editorSelector, nativeRole, searchDepth=24, layout, expectedWindow, window, Accessibility, scope,
  inputMode='strict', editorModel='plain', verifyContext, mouse, clipboard, keyboard, delay, onPhase }) {
  if(inputMode==='paste')return createPasteInserter({getTarget,editorSelector,nativeRole,searchDepth,layout,expectedWindow,
    window,Accessibility,scope,editorModel,verifyContext,mouse,clipboard,keyboard,delay,onPhase});
  const selector = {...editorSelector};
  const measured = layout && {window: {...layout.window}, editor: {...layout.editor}};
  const validSelector = selector.role === 'textField' &&
    Object.keys(selector).every(k => ['role', 'name', 'identifier'].includes(k)) &&
    (['name', 'identifier'].some(k => typeof selector[k] === 'string' && selector[k].length > 0)||
      Object.keys(selector).length===1&&typeof nativeRole==='string'&&nativeRole.length>0) &&
    Object.keys(selector).every(k => typeof selector[k] === 'string' && selector[k].length > 0);
  let busy = false, blocked = false;
  return {async insert(body) {
    const result = (status, code, actionState = 'not_started') => ({status, code, actionState});
    if (blocked) return result('blocked', 'INPUT_BLOCKED', 'unknown');
    if (busy) return result('rejected', 'BUSY');
    if (!['strict','paste'].includes(inputMode)) return result('rejected', 'INVALID_INPUT_MODE');
    if (!['plain','claude-code','opencode'].includes(editorModel)) return result('rejected', 'INVALID_EDITOR_MODEL');
    if (typeof body !== 'string' || !body.trim() || body.length > 8192 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(body))
      return result('rejected', 'UNSAFE_BODY');
    if (!validSelector||!Number.isInteger(searchDepth)||searchDepth<1||searchDepth>64)
      return result('rejected', 'EDITOR_EVIDENCE_REQUIRED');
    if (!measured || !rect({...measured.editor, coordinateSpace: 'screen'}) ||
        !Number.isFinite(measured.window.width) || measured.window.width <= 0 ||
        !Number.isFinite(measured.window.height) || measured.window.height <= 0)
      return result('rejected', 'CALIBRATION_REQUIRED');
    busy = true;
    let ref, outcome, attempted=false,phase='preflight';
    try {
      const target = {...await getTarget()}; validateTarget(target);
      if (!same(target, measured.window, calibrationKeys)) stop('LAYOUT_CHANGED');
      const guard = () => guardTarget(getTarget, window, target, scope);
      function checkField(p, afterPaste=false) {
        if (!p || !matchesSelector(p, selector)||nativeRole&&p.nativeRole!==nativeRole) stop('FIELD_CHANGED');
        // Some AXTextAreas omit AXEnabled. Native preparation independently
        // checks editability and refuses an explicit disabled/read-only field.
        if (p.enabled !== true && p.enabled !== null) stop('FIELD_UNAVAILABLE');
        if (typeof p.value !== 'string') stop('VALUE_UNREADABLE');
        if (!withinWindow(target, p.bounds)) stop('UNSAFE_BOUNDS');
        if (!afterPaste&&!same(relativeBounds(target, p.bounds), measured.editor, ['x', 'y', 'width', 'height']))
          stop('LAYOUT_CHANGED');
      }
      await guard();
      const matches = (await snapshotNodes(Accessibility, target, searchDepth)).filter(n => matchesSelector(n, selector));
      if (matches.length !== 1) stop(matches.length ? 'AMBIGUOUS_FIELD' : 'MISSING_FIELD');
      const observed = matches[0]; checkField(observed);
      ref = await Accessibility.find(selector, {within: target, timeout: 3000, maxDepth: searchDepth, maxNodes: 2000});
      if (!ref) stop('MISSING_FIELD');
      const read = async (afterPaste=false) => {
        const p = (await Accessibility.read(ref, {properties: [...properties, 'textInputState'], timeout: 3000})).properties;
        checkField(p,afterPaste); return p;
      };
      let field = await read();
      if (field.value !== observed.value) stop('DRAFT_CHANGED');
      await guard();
      inputState(field);
      // Future support must perform the draft/selection/IME preconditions and
      // suffix-only mutation in the target editor's own transaction. A final
      // AX read followed by a global key event cannot provide that contract.
      stop('DIRECTED_APPEND_UNAVAILABLE');
    } catch (error) {
      blocked = attempted||error?.actionState === 'unknown';
      outcome = result(blocked ? 'blocked' : 'rejected', error?.code || 'INSERT_FAILED',
        blocked ? 'unknown' : 'not_started');
      if(inputMode==='paste')outcome.phase=phase;
    } finally {
      if (ref) try {await Accessibility.release(ref);} catch (_) {
        blocked = true; outcome = result('blocked', 'RELEASE_FAILED', 'unknown');
        if(inputMode==='paste')outcome.phase='release';
      }
      busy = false;
    }
    return outcome;
  }};
}

// Explicit construction only; passes documented Runtime globals as dependencies.
function createRuntimeInserter({ getTarget, editorSelector, nativeRole, searchDepth, layout, expectedWindow, scope, inputMode, editorModel, verifyContext, onPhase, runtime = globalThis }) {
  return createInserter({ getTarget, editorSelector, nativeRole, searchDepth, layout, expectedWindow, window: runtime.window, scope,
    inputMode, editorModel, verifyContext, onPhase, Accessibility: runtime.Accessibility, mouse:runtime.mouse, clipboard:runtime.clipboard,
    keyboard:runtime.keyboard,delay:runtime.System?.delay?.bind(runtime.System) });
}

// Loaded lazily by the public .js entry with indirect eval(File.read(path)).
globalThis.OpenDeskPromptInsertion = { createInserter, createRuntimeInserter, calibrateRuntimeEditor, discoverRuntimeEditor };
})();
