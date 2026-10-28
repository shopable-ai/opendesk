'use strict';
// Dependency simulations only; never launches or controls Codex/any desktop.
const nodeTest = require('node:test');
const test = (name, run) => nodeTest(name, { timeout: 3000 }, run);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const helperPath = path.resolve(__dirname, '../../examples/custom-ui/codex-prompt-shortcuts/insert.js');
const source = fs.readFileSync(helperPath, 'utf8');
function loadHelper() {
  const context = vm.createContext({});
  vm.runInContext(source + '\n//# sourceURL=' + helperPath, context);
  return context.OpenDeskPromptInsertion;
}
const clone = x => structuredClone(x);
const fail = (code, extra) => Object.assign(new Error(code), { code, ...extra });

async function harness() {
  const { createRuntimeInserter, calibrateRuntimeEditor, discoverRuntimeEditor } = loadHelper();
  const target = { id: 'mac:42:71', pid: 42, handle: 71, title: 'Fixture',
    exePath: '/fixture/editor', x: 10, y: 20, width: 900, height: 600, isForeground: true };
  const selector = { role: 'textField', identifier: 'fixture-composer' };
  const field = { ...selector, name: 'Fixture editor', enabled: true, focused: false, value: '',
    bounds: { x: 40, y: 400, width: 700, height: 120, coordinateSpace: 'screen' }, children: [] };
  const ref = Object.freeze({ kind: 'AccessibilityElementRef', id: 'owned', role: 'textField' });
  const state = { target: clone(target), active: clone(target), field, complete: true,
    truncated: false, extra: [], missing: false, reads: 0, snapshots: 0, readOptions: [],
    clipboard: '', pointer: { x: 300, y: 450 } };
  const calls = [], hooks = {};
  const runtime = {
    window: {
      async current(win) { assert.deepEqual(clone(win), target); return clone(state.target); },
      async getActiveWindow() { return clone(state.active); },
    },
    Accessibility: {
      async snapshot(options) {
        assert.deepEqual(clone(options.within), target);
        assert.ok(options.properties.includes('value'));
        state.snapshots++;
        await hooks.snapshot?.();
        return { complete: state.complete, truncated: state.truncated,
          root: { role: 'window', children: [...(state.missing ? [] : [clone(field)]), ...clone(state.extra)] } };
      },
      async find(s, options) {
        assert.ok(Object.keys(s).every(key => s[key] === field[key])); assert.deepEqual(clone(options.within), target);
        if (hooks.find) return hooks.find();
        calls.push('find'); return ref;
      },
      async read(r, options) {
        assert.equal(r, ref); assert.ok(options.properties.includes('focused'));
        state.reads++; state.readOptions.push(clone(options));
        await hooks.read?.();
        return { ref, properties: clone(field) };
      },
      async release(r) { assert.equal(r, ref); calls.push('release'); await hooks.release?.(); return true; },
    },
    Geometry: { center(bounds) {
      assert.equal(bounds.coordinateSpace, 'screen');
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, coordinateSpace: 'screen' };
    } },
    mouse: { getPos() { return clone(state.pointer); }, async clickPoint(point) {
      calls.push(['focus', point]); field.focused = true;
      await hooks.focus?.();
    } },
    clipboard: {
      copy(body) { calls.push(['copy', body]); state.clipboard = body; hooks.copy?.(); },
      paste() { hooks.clipboardRead?.(); return state.clipboard; },
    },
    keyboard: { async combination(...keys) {
      assert.deepEqual(keys, ['Meta', 'v']);
      calls.push(['paste', state.clipboard]);
      if (hooks.paste) return hooks.paste(state.clipboard);
      field.value += state.clipboard;
    } },
  };
  const layout = { window: { ...target }, editor: { x: 30, y: 380, width: 700, height: 120 } };
  const options = { getTarget: async () => clone(target), editorSelector: selector, layout, runtime };
  const inserter = createRuntimeInserter(options);
  return { inserter, state, calls, hooks, target, field, runtime, options, createRuntimeInserter, calibrateRuntimeEditor, discoverRuntimeEditor };
}
const pasted = h => h.calls.filter(c => Array.isArray(c) && c[0] === 'paste');
const focused = h => h.calls.filter(c => Array.isArray(c) && c[0] === 'focus');

async function pasteHarness(draft='') {
  const h=await harness();
  h.field.value=draft;h.field.focused=true;
  h.field.textInputState={unit:'utf16',selection:{location:draft.length,length:0},
    composition:'unknown',markedRange:null};
  h.runtime.System={delay:async()=>{await h.hooks.delay?.();}};
  h.runtime.keyboard.combination=async(...keys)=>{
    if(keys.join('+')==='Meta+ArrowDown'){
      h.calls.push(['end']);
      h.field.textInputState.selection={location:h.field.value.length,length:0};
      await h.hooks.end?.();return;
    }
    assert.deepEqual(keys,['Meta','v']);
    h.calls.push(['paste',h.state.clipboard]);
    if(h.hooks.paste)return h.hooks.paste(h.state.clipboard);
    const {location,length}=h.field.textInputState.selection;
    h.field.value=h.field.value.slice(0,location)+h.state.clipboard+h.field.value.slice(location+length);
    h.field.textInputState.selection={location:location+h.state.clipboard.length,length:0};
  };
  h.inserter=h.createRuntimeInserter({...h.options,inputMode:'paste'});
  return h;
}

for(const draft of ['', '  草稿\r\n\t😀 e\u0301  ', '末尾\n\n', ' '.repeat(3)])
test('ordinary paste preserves exact draft and full body, draft length '+draft.length,async()=>{
  const h=await pasteHarness(draft),body='  正文 e\u0301 😀\n\t尾部  ';
  const expected=draft+body;
  const result=await h.inserter.insert(body);
  assert.deepEqual(clone(result),{status:'inserted',code:'VERIFIED_PASTE',actionState:'acknowledged',verified:true});
  assert.equal(h.field.value,expected);
  assert.deepEqual(pasted(h),[['paste',body]]);
  assert.equal(focused(h).length,0);
  assert.equal(h.calls.at(-1),'release');
});

async function claudePasteHarness(draft='',options={}) {
  const editorModel=options.editorModel||'claude-code';
  const projection=options.projection||(text=>!text?'\n':text.replace(/\n\n/g,'\n')+(text.endsWith('\n')?'\n':''));
  const length=text=>editorModel==='claude-code'?Array.from(text).length:text.length;
  const h=await pasteHarness(projection(draft));h.logical=draft;h.copyCount=0;
  h.field.textInputState.selection={location:length(draft),length:0};
  h.runtime.keyboard.combination=async(...keys)=>{
    if(keys.join('+')==='Meta+a'){
      h.calls.push(['select-all-for-copy']);
      h.field.textInputState.selection={location:0,length:h.logical?length(h.logical):1};return;
    }
    if(keys.join('+')==='Meta+c'){
      h.copyCount++;h.calls.push(['read-copy']);
      if(h.hooks.copyText)h.hooks.copyText();else if(h.logical||editorModel!=='opencode')h.state.clipboard=h.logical;
      return;
    }
    if(keys.join('+')==='Meta+ArrowDown'){
      h.calls.push(['end']);h.field.textInputState.selection={location:length(h.logical),length:0};
      await h.hooks.end?.();return;
    }
    if(keys.join('+')==='ArrowRight'){
      const r=h.field.textInputState.selection;
      if(r.location<length(h.logical))r.location++;return;
    }
    assert.deepEqual(keys,['Meta','v']);assert.equal(h.field.textInputState.selection.length,0);
    h.calls.push(['paste',h.state.clipboard]);
    if(h.hooks.paste)return h.hooks.paste(h.state.clipboard);
    const offset=h.field.textInputState.selection.location;
    const index=editorModel==='claude-code'?Array.from(h.logical).slice(0,offset).join('').length:offset;
    h.logical=h.logical.slice(0,index)+h.state.clipboard+h.logical.slice(index);
    h.field.value=projection(h.logical);
    h.field.textInputState.selection={location:offset+length(h.state.clipboard),length:0};
  };
  h.inserter=h.createRuntimeInserter({...h.options,inputMode:'paste',editorModel});
  return h;
}
const opencodePasteHarness=(draft='',trailingAX=false)=>claudePasteHarness(draft,{editorModel:'opencode',
  projection:text=>!text?'\n':text+(trailingAX?'\n':'')});
for(const editorModel of ['claude-code','opencode'])
for(const draft of ['', '\n', '  原稿 😀 e\u0301\n', '原稿😀', 'a\n\nb'])
test(editorModel+' direct paste preserves logical whitespace despite AX projection '+JSON.stringify(draft),async()=>{
  const h=await claudePasteHarness(draft,{editorModel}),body='  正文 e\u0301 😀\n\t末尾  \n';
  const result=await h.inserter.insert(body);
  assert.equal(result.code,'PASTE_OBSERVED');assert.equal(result.verified,false);
  assert.equal(result.actionState,'acknowledged');
  assert.equal(h.logical,draft+body);
  assert.deepEqual(pasted(h),[['paste',body]]);assert.equal(h.copyCount,0);
  assert.equal(h.calls.some(c=>Array.isArray(c)&&['end','read-copy','select-all-for-copy','focus'].includes(c[0])),false);
  assert.equal(h.state.clipboard,body);
});

for(const editorModel of ['claude-code','opencode'])
test(editorModel+' consecutive direct pastes preserve the middle caret without other input',async()=>{
  const h=await claudePasteHarness('prefix suffix',{editorModel});
  h.field.textInputState.selection.location=7;
  for(const body of ['BODY',' NEXT']){
    assert.equal((await h.inserter.insert(body)).code,'PASTE_OBSERVED');
    assert.equal(h.state.clipboard,body);
  }
  assert.equal(h.logical,'prefix BODY NEXTsuffix');assert.equal(h.copyCount,0);
  assert.equal(h.field.textInputState.selection.location,16);
  assert.deepEqual(pasted(h),[['paste','BODY'],['paste',' NEXT']]);
  assert.equal(h.calls.some(c=>Array.isArray(c)&&['end','read-copy','select-all-for-copy','focus'].includes(c[0])),false);
});

for(const receipt of ['unchanged-marker','missing-body','partial-body'])
test('web fallback postpaste Copy failure latches without retry: '+receipt,async()=>{
  const h=await claudePasteHarness('original');
  h.field.focused=false;
  h.hooks.copyText=()=>{
    if(receipt!=='unchanged-marker')h.state.clipboard=receipt==='partial-body'?'originalBO':'original';
  };
  const result=await h.inserter.insert('BODY');
  assert.equal(result.code,receipt==='unchanged-marker'?'COPY_UNVERIFIED':'READBACK_MISMATCH');
  assert.equal(result.status,'blocked');assert.equal(result.actionState,'unknown');
  assert.equal(h.logical,'original\n\nBODY');assert.equal(pasted(h).length,1);
  const calls=h.calls.length,reads=h.state.reads;
  assert.equal((await h.inserter.insert('BODY')).code,'INPUT_BLOCKED');
  assert.equal(h.calls.length,calls);assert.equal(h.state.reads,reads);
});

for(const trailingAX of [false,true])for(const actual of ['', '\n','  原稿 😀 e\u0301\n','a\n\nb',' '])
test('OpenCode unfocused fallback preserves draft and separator '+JSON.stringify({actual,trailingAX}),async()=>{
  const h=await opencodePasteHarness(actual,trailingAX),body='  正文 😀\n尾  ';
  h.field.focused=false;
  assert.equal((await h.inserter.insert(body)).verified,true);
  assert.equal(h.logical,actual+(actual?'\n\n':'')+body);
  assert.deepEqual(pasted(h),[['paste',(actual?'\n\n':'')+body]]);
  assert.equal(h.copyCount,1);assert.equal(focused(h).length,1);
});

test('OpenCode fallback refuses an apparent zero endpoint when Right still advances',async()=>{
  const h=await opencodePasteHarness('\n');h.field.focused=false;
  h.hooks.end=()=>{h.field.textInputState.selection={location:0,length:0};};
  const r=await h.inserter.insert('body');
  assert.equal(r.code,'CARET_UNVERIFIED');assert.equal(r.actionState,'unknown');assert.equal(pasted(h).length,0);
  assert.equal((await h.inserter.insert('body')).code,'INPUT_BLOCKED');
});

test('plain focused newline is preserved without adding a separator',async()=>{
  const h=await pasteHarness('\n');
  assert.equal((await h.inserter.insert('body')).verified,true);
  assert.equal(h.field.value,'\nbody');
});

for(const location of [0,4,9])
test('plain collapsed caret inserts body at exact UTF-16 offset '+location,async()=>{
  const draft='前😀e\u0301 尾  ',body=' \t正文 😀\n ';
  const h=await pasteHarness(draft);h.field.textInputState.selection.location=location;
  const result=await h.inserter.insert(body);
  assert.equal(result.verified,true);
  assert.equal(h.field.value,draft.slice(0,location)+body+draft.slice(location));
  assert.deepEqual(pasted(h),[['paste',body]]);
  assert.equal(h.calls.some(c=>Array.isArray(c)&&c[0]==='end'),false);
  assert.equal(h.state.snapshots,0);assert.equal(focused(h).length,0);
});

for(const value of ['prefixBODYsuffix!','BODY'])
test('plain readback requires exact whole value: '+value,async()=>{
  const h=await pasteHarness('prefixsuffix');h.field.textInputState.selection.location=6;
  h.hooks.paste=()=>{h.field.value=value;};
  assert.equal((await h.inserter.insert('BODY')).code,'READBACK_MISMATCH');
  assert.equal((await h.inserter.insert('BODY')).code,'INPUT_BLOCKED');
  assert.equal(pasted(h).length,1);
});

test('unknown editor model fails closed before desktop observations',async()=>{
  const h=await pasteHarness();
  h.inserter=h.createRuntimeInserter({...h.options,inputMode:'paste',editorModel:'guessed'});
  assert.equal((await h.inserter.insert('body')).code,'INVALID_EDITOR_MODEL');
  assert.equal(h.state.snapshots,0);
});

test('ordinary paste focuses only the measured editor then clears a nonempty selection by moving to end',async()=>{
  const h=await pasteHarness('do not replace');h.field.focused=false;
  h.field.textInputState.selection={location:2,length:5};
  const result=await h.inserter.insert('正文');
  assert.equal(result.verified,true);assert.equal(focused(h).length,1);
  assert.equal(h.calls.filter(c=>Array.isArray(c)&&c[0]==='end').length,1);
  assert.equal(h.field.value,'do not replace\n\n正文');
});

test('ordinary paste verifies async acceptance and permits editor height growth after paste',async()=>{
  const h=await pasteHarness();let pending;
  h.hooks.paste=async text=>{pending=text;h.field.bounds.height+=40;};
  h.hooks.delay=async()=>{h.field.value=pending;};
  assert.equal((await h.inserter.insert('first\nsecond')).verified,true);
  assert.equal(h.field.value,'first\nsecond');assert.equal(pasted(h).length,1);
});

test('ordinary paste tolerates focus-driven editor reflow on the same scoped reference',async()=>{
  const h=await pasteHarness('original');h.field.focused=false;
  h.hooks.focus=()=>{h.field.bounds.y-=20;h.field.bounds.height+=20;};
  assert.equal((await h.inserter.insert('body')).verified,true);
  assert.equal(h.field.value,'original\n\nbody');assert.equal(pasted(h).length,1);
});

for(const reason of ['active-composition','marked-range','missing-selection','invalid-range','disabled'])
test('ordinary paste rejects '+reason+' before any input',async()=>{
  const h=await pasteHarness('draft'),s=h.field.textInputState;
  if(reason==='active-composition')s.composition='active';
  if(reason==='marked-range')s.markedRange={location:0,length:1};
  if(reason==='missing-selection')s.selection=null;
  if(reason==='invalid-range')s.selection.location=100;
  if(reason==='disabled')h.field.enabled=null;
  const result=await h.inserter.insert('body');
  assert.equal(result.status,'rejected');assert.equal(result.actionState,'not_started');
  assert.equal(pasted(h).length,0);assert.equal(focused(h).length,0);
  assert.equal(h.field.value,'draft');assert.equal(h.state.clipboard,'');
});

test('fallback refuses a concurrently edited draft before submitting paste',async()=>{
  const h=await pasteHarness('draft');h.field.focused=false;
  h.hooks.read=()=>{if(h.state.reads===2)h.field.value='user changed draft';};
  assert.equal((await h.inserter.insert('body')).code,'DRAFT_CHANGED');
  assert.equal(pasted(h).length,0);assert.equal(h.field.value,'user changed draft');
});

test('ordinary paste checks clipboard immediately before dispatch',async()=>{
  const h=await pasteHarness();
  h.hooks.copy=()=>{h.state.clipboard='other application';};
  const r=await h.inserter.insert('body');
  assert.equal(r.code,'CLIPBOARD_CHANGED');assert.equal(r.actionState,'not_started');
  assert.equal(pasted(h).length,0);assert.equal(h.field.value,'');
});

test('ordinary paste rechecks foreground after its initial field read',async()=>{
  const h=await pasteHarness();
  h.hooks.read=()=>{h.state.active.pid=99;};
  const result=await h.inserter.insert('body');
  assert.equal(result.actionState,'not_started');assert.equal(result.code,'NOT_FOREGROUND');
  assert.equal(pasted(h).length,0);assert.equal(h.field.value,'');
});

for(const reason of ['paste-throws','wrong-result','unchanged-result','lost-focus','release-fails','focus-commits-ime','caret-changes-draft'])
test('ordinary paste latches unknown after '+reason+' and never retries',async()=>{
  const h=await pasteHarness('original');
  if(reason==='paste-throws')h.hooks.paste=()=>{throw fail('BACKEND_FAILED');};
  if(reason==='wrong-result')h.hooks.paste=()=>{h.field.value='unexpected';};
  if(reason==='unchanged-result')h.hooks.paste=()=>{};
  if(reason==='lost-focus')h.hooks.paste=()=>{h.state.active.pid=99;};
  if(reason==='release-fails')h.hooks.release=()=>{throw fail('STALE_TARGET');};
  if(reason==='focus-commits-ime'){
    h.field.focused=false;h.hooks.focus=()=>{h.field.value+='composition';};
  }
  if(reason==='caret-changes-draft'){
    h.field.textInputState.selection={location:0,length:1};h.hooks.end=()=>{h.field.value+='concurrent';};
  }
  const result=await h.inserter.insert('body');
  assert.equal(result.status,'blocked');assert.equal(result.actionState,'unknown');
  const count=h.calls.length;
  assert.equal((await h.inserter.insert('again')).code,'INPUT_BLOCKED');
  assert.equal(h.calls.length,count);assert.ok(pasted(h).length<=1);
});

test('ordinary paste serializes repeated clicks and permits a later explicit append after success',async()=>{
  const h=await pasteHarness();let complete,started;
  const ready=new Promise(resolve=>{started=resolve;});
  h.hooks.paste=async text=>{started();await new Promise(resolve=>{complete=resolve;});h.field.value+=text;h.field.textInputState.selection.location=h.field.value.length;};
  const pending=h.inserter.insert('first');await ready;
  assert.equal((await h.inserter.insert('second')).code,'BUSY');
  complete();assert.equal((await pending).verified,true);
  delete h.hooks.paste;
  assert.equal((await h.inserter.insert('third')).verified,true);
  assert.equal(h.field.value,'firstthird');assert.equal(pasted(h).length,2);
});

test('unconfigured helper remains strict; unsupported paste mode fails before observations',async()=>{
  const h=await pasteHarness();
  assert.equal((await h.createRuntimeInserter({...h.options}).insert('body')).code,'INPUT_STATE_UNVERIFIABLE');
  h.calls.length=0;
  const result=await h.createRuntimeInserter({...h.options,inputMode:'invented'}).insert('body');
  assert.equal(result.code,'INVALID_INPUT_MODE');assert.deepEqual(h.calls,[]);
});


// Empty AX value is not evidence of an empty text selection, end caret or idle IME.
for (const focused of [false, true]) for (const selected of [undefined, null, false, true]) {
  test(`empty draft refuses unverifiable input state: focused=${focused}, selected=${selected}`, async () => {
    const h = await harness(); h.field.focused = focused;
    if (selected !== undefined) h.field.selected = selected;
    h.state.clipboard = 'user clipboard';
    const result = await h.inserter.insert('  请审阅 e\u0301 😀 ${literal}\n\ttail  ');
    assert.deepEqual(clone(result), {
      status: 'rejected', code: 'INPUT_STATE_UNVERIFIABLE', actionState: 'not_started',
    });
    assert.equal(h.field.value, ''); assert.equal(h.field.focused, focused);
    assert.equal(h.state.clipboard, 'user clipboard');
    assert.deepEqual(h.calls, ['find', 'release']);
    assert.equal(h.state.reads, 1); assert.equal(h.state.snapshots, 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(h.calls, ['find', 'release']); // No scheduled retry/fallback.
  });
}

test('invented selection/composition evidence never enables insertion', async () => {
  const h = await harness();
  // Deliberately unsupported data, not a simulated Runtime capability.
  Object.assign(h.field, { selectionStart: 0, selectionEnd: 0, isComposing: false,
    selectedTextRange: { location: 0, length: 0 }, markedText: '' });
  const inserter = h.createRuntimeInserter({ ...h.options, inputStateVerified: true });
  assert.equal((await inserter.insert('body')).code, 'INPUT_STATE_UNVERIFIABLE');
  assert.deepEqual(h.calls, ['find', 'release']);
});

for (const draft of ['  D\r\n\t😀 e\u0301  ', 'D\n\n', 'D\u2028尾', 'x'.repeat(10000)]) {
  test(`preserve full existing draft of length ${draft.length} and clipboard`, async () => {
    const h = await harness(); h.field.value = draft; h.state.clipboard = 'original';
    assert.equal((await h.inserter.insert('new')).code, 'EXISTING_DRAFT');
    assert.equal(h.field.value, draft); assert.equal(h.state.clipboard, 'original');
    assert.deepEqual(h.calls, ['find', 'release']);
  });
}

test('value becomes nonempty between snapshot and original ref read: preserve it', async () => {
  const h = await harness(); h.hooks.read = () => { h.field.value = 'late user draft'; };
  assert.equal((await h.inserter.insert('new')).code, 'DRAFT_CHANGED');
  assert.equal(h.field.value, 'late user draft');
  assert.deepEqual(h.calls, ['find', 'release']);
});

test('release failure latches, with no clipboard/focus/paste fallback', async () => {
  const h = await harness(); h.hooks.release = () => { throw fail('BACKEND_FAILED'); };
  assert.deepEqual(clone(await h.inserter.insert('body')), {
    status: 'blocked', code: 'RELEASE_FAILED', actionState: 'unknown',
  });
  assert.equal((await h.inserter.insert('again')).code, 'INPUT_BLOCKED');
  assert.deepEqual(h.calls, ['find', 'release']);
});

test('concurrent insert is rejected rather than queued; no replay after completion', async () => {
  const h = await harness(); let resume;
  h.hooks.read = () => new Promise(resolve => { resume = resolve; });
  const first = h.inserter.insert('one');
  while (!resume) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await h.inserter.insert('two')).code, 'BUSY');
  resume(); assert.equal((await first).code, 'INPUT_STATE_UNVERIFIABLE');
  assert.deepEqual(h.calls, ['find', 'release']);
});

test('unsafe body rejected before observations; literal Enter never sends a key', async () => {
  const h = await harness();
  for (const body of ['', ' ', 'a\0b', '\u001b', '\u000b', '\u000c', '\u007f', '\u0085', 'x'.repeat(8193), null])
    assert.equal((await h.inserter.insert(body)).code, 'UNSAFE_BODY');
  assert.deepEqual(h.calls, []); assert.equal(h.state.snapshots, 0);
  assert.equal((await h.inserter.insert('literal <Enter>')).code, 'INPUT_STATE_UNVERIFIABLE');
  assert.equal(pasted(h).length, 0); assert.equal(focused(h).length, 0);
});

for (const bounds of [
  { y: 320, height: 200 }, // Normal bottom-anchored composer growth upwards.
  { height: 200 }, // Downward expansion.
]) test(`changed editor layout ${JSON.stringify(bounds)} refuses without input`, async () => {
  const h = await harness(); Object.assign(h.field.bounds, bounds);
  assert.equal((await h.inserter.insert('first\nsecond')).code, 'LAYOUT_CHANGED');
  assert.deepEqual(h.calls, []);
});

for (const value of ['draft', ' ', '\n', null, undefined, 0, false]) {
  test(`reject existing/unreadable value ${JSON.stringify(value)} without focus or paste`, async () => {
    const h = await harness(); h.field.value = value;
    const result = await h.inserter.insert('new');
    assert.equal(result.status, 'rejected');
    assert.equal(result.code, typeof value === 'string' ? 'EXISTING_DRAFT' : 'VALUE_UNREADABLE');
    assert.equal(pasted(h).length, 0); assert.equal(focused(h).length, 0);
    assert.equal(h.field.value, value);
  });
}

for (const [name, change, code] of [
  ['missing', h => { h.state.missing = true; }, 'MISSING_FIELD'],
  ['ambiguous', h => { h.state.extra.push(clone(h.field)); }, 'AMBIGUOUS_FIELD'],
  ['incomplete', h => { h.state.complete = false; }, 'SEARCH_INCOMPLETE'],
  ['truncated', h => { h.state.truncated = true; }, 'SEARCH_INCOMPLETE'],
  ['disabled', h => { h.field.enabled = false; }, 'FIELD_UNAVAILABLE'],
  ['unknown enabled', h => { h.field.enabled = null; }, 'INPUT_STATE_UNVERIFIABLE'],
  ['no screen bounds', h => { h.field.bounds = null; }, 'UNSAFE_BOUNDS'],
  ['native bounds', h => { h.field.bounds.coordinateSpace = 'native'; }, 'UNSAFE_BOUNDS'],
  ['outside window', h => { h.field.bounds.x = -100; }, 'UNSAFE_BOUNDS'],
  ['wrong foreground', h => { h.state.active.id = 'other'; }, 'NOT_FOREGROUND'],
  ['unknown foreground', h => { delete h.state.active.isForeground; }, 'NOT_FOREGROUND'],
  ['changed window', h => { h.state.target.handle++; }, 'TARGET_CHANGED'],
]) test(name, async () => {
  const h = await harness(); change(h);
  assert.equal((await h.inserter.insert('new')).code, code);
  assert.equal(pasted(h).length, 0); assert.equal(focused(h).length, 0);
});

test('original ref stale after discovery: release and no re-find', async () => {
  const h = await harness(); h.hooks.read = () => { throw fail('STALE_TARGET'); };
  assert.equal((await h.inserter.insert('new')).code, 'STALE_TARGET');
  assert.deepEqual(h.calls, ['find', 'release']);
});

test('find rejects ambiguity rather than choosing first candidate', async () => {
  const h = await harness(); h.hooks.find = () => { throw fail('AMBIGUOUS_TARGET'); };
  assert.equal((await h.inserter.insert('body')).code, 'AMBIGUOUS_TARGET');
  assert.equal(pasted(h).length, 0); assert.equal(focused(h).length, 0);
});

test('unknown native action state latches even during preflight', async () => {
  const h = await harness(); h.hooks.find = () => { throw fail('STATE_UNKNOWN', { actionState: 'unknown' }); };
  assert.equal((await h.inserter.insert('body')).status, 'blocked');
  assert.equal((await h.inserter.insert('body')).code, 'INPUT_BLOCKED');
  assert.equal(pasted(h).length, 0);
});

test('caller changes selected target during operation: stop before focus', async () => {
  const h = await harness(); let changed = false;
  const inserter = h.createRuntimeInserter({ ...h.options, getTarget: async () => ({
    ...h.target, id: changed ? 'replacement' : h.target.id,
  }) });
  h.hooks.read = () => { changed = true; };
  assert.equal((await inserter.insert('body')).code, 'TARGET_CHANGED');
  assert.equal(focused(h).length, 0); assert.equal(pasted(h).length, 0);
  assert.equal(h.calls.at(-1), 'release');
});

test('no generic textField guess without composer evidence', async () => {
  const h = await harness();
  for (const editorSelector of [undefined, { role: 'textField' }, { role: 'button', name: 'Send' }]) {
    const inserter = h.createRuntimeInserter({ ...h.options, editorSelector });
    assert.equal((await inserter.insert('body')).code, 'EDITOR_EVIDENCE_REQUIRED');
  }
  assert.equal(h.state.snapshots, 0);
});

test('helper exposes only the four functions and evaluates without Runtime globals', () => {
  assert.deepEqual(Object.keys(loadHelper()).sort(),
    ['calibrateRuntimeEditor', 'createInserter', 'createRuntimeInserter', 'discoverRuntimeEditor']);
  assert.equal(fs.existsSync(helperPath.replace(/\.js$/, '.mjs')), false);
});

for (const key of ['x', 'y', 'width', 'height']) test(`editor ${key} differs from calibration: reject before clipboard/focus`, async () => {
  const h = await harness(); h.field.bounds[key]++;
  assert.equal((await h.inserter.insert('body')).code, 'LAYOUT_CHANGED');
  assert.deepEqual(h.calls, []);
});

for (const key of ['width', 'height']) test(`window ${key} differs from calibration: reject`, async () => {
  const h = await harness(); h.target[key]++; h.state.target[key]++; h.state.active[key]++;
  assert.equal((await h.inserter.insert('body')).code, 'LAYOUT_CHANGED');
  assert.equal(h.state.snapshots, 0); assert.deepEqual(h.calls, []);
});

test('missing calibration rejects without observations or input', async () => {
  const h = await harness(); const inserter = h.createRuntimeInserter({ ...h.options, layout: undefined });
  assert.equal((await inserter.insert('body')).code, 'CALIBRATION_REQUIRED');
  assert.equal(h.state.snapshots, 0); assert.deepEqual(h.calls, []);
});

test('whole-window translation preserves calibrated relative layout', async () => {
  const h = await harness();
  for (const win of [h.target, h.state.target, h.state.active]) { win.x += 30; win.y -= 10; }
  h.field.bounds.x += 30; h.field.bounds.y -= 10;
  assert.equal((await h.inserter.insert('body')).code, 'INPUT_STATE_UNVERIFIABLE');
});

test('calibration is read-only, uses pointer over unique enabled field, returns exact measured layout', async () => {
  const h = await harness(); h.field.value = 'existing draft is not changed by calibration';
  const calibration = await h.calibrateRuntimeEditor(h.options);
  assert.deepEqual(clone(calibration), {
    editorSelector: { role: 'textField', name: 'Fixture editor', identifier: 'fixture-composer' },
    layout: { window: { id: h.target.id, pid: 42, handle: 71, title: 'Fixture',
      exePath: '/fixture/editor', width: 900, height: 600 },
    editor: { x: 30, y: 380, width: 700, height: 120 } },
  });
  assert.deepEqual(h.calls, []); assert.equal(h.state.reads, 0);
  assert.equal(h.state.clipboard, ''); assert.equal(h.field.focused, false);
  assert.equal(h.field.value, 'existing draft is not changed by calibration');
  h.field.value = '';
  const inserter = h.createRuntimeInserter({ ...h.options, ...calibration });
  assert.equal((await inserter.insert('body\n\ttail')).code, 'INPUT_STATE_UNVERIFIABLE');
});

for (const [name, change, code] of [
  ['pointer outside field', h => { h.state.pointer = { x: 20, y: 30 }; }, 'MISSING_FIELD'],
  ['invalid pointer', h => { h.state.pointer.x = NaN; }, 'POINTER_UNREADABLE'],
  ['disabled field', h => { h.field.enabled = false; }, 'MISSING_FIELD'],
  ['overlapping fields', h => { h.state.extra.push({ ...clone(h.field), identifier: 'other' }); }, 'AMBIGUOUS_FIELD'],
  ['duplicate selector elsewhere', h => {
    const other = clone(h.field); other.bounds.y = 100; h.state.extra.push(other);
  }, 'AMBIGUOUS_FIELD'],
  ['unnamed editor', h => { h.field.name = ''; h.field.identifier = ''; }, 'EDITOR_EVIDENCE_REQUIRED'],
  ['incomplete snapshot', h => { h.state.complete = false; }, 'SEARCH_INCOMPLETE'],
  ['wrong foreground', h => { h.state.active.id = 'other'; }, 'NOT_FOREGROUND'],
]) test(`calibration rejects ${name} read-only`, async () => {
  const h = await harness(); change(h);
  await assert.rejects(h.calibrateRuntimeEditor(h.options), { code });
  assert.deepEqual(h.calls, []);
});

for (const [name, change, code] of [
  ['moved field', h => { h.field.bounds.x++; }, 'FIELD_CHANGED'],
  ['resized window', h => { h.state.target.width++; }, 'TARGET_CHANGED'],
  ['changed pointer', h => { h.state.pointer.x++; }, 'POINTER_CHANGED'],
  ['lost foreground', h => { h.state.active.isForeground = false; }, 'NOT_FOREGROUND'],
]) test(`calibration detects ${name} during observation`, async () => {
  const h = await harness(); h.hooks.snapshot = () => {
    if (h.state.snapshots === 2) change(h);
  };
  await assert.rejects(h.calibrateRuntimeEditor(h.options), { code });
  assert.deepEqual(h.calls, []);
});

// New native contract simulations; these do not qualify any real provider.
function nativeState(h, draft = '') {
  h.field.value = draft;
  h.field.textInputState = {unit: 'utf16', selection: {location: 1, length: 0}, composition: 'inactive'};
  h.field.textInputState.selection.location = draft.length;
  h.runtime.Accessibility.perform = async (ref, action) => {
    h.calls.push(['prepare', clone(action)]);
    assert.equal(action.action, 'prepareTextAppend');
    assert.equal(action.value, h.field.value);
    if (h.hooks.prepare) return h.hooks.prepare();
    h.field.textInputState.selection = {location: draft.length, length: 0};
    return {actionState: 'acknowledged'};
  };
}
test('idle IME evidence alone never enables the non-atomic global paste transport', async () => {
  const h = await harness(); nativeState(h, '  原稿\r\n\t😀 e\u0301  ');
  h.state.clipboard = 'user clipboard';
  const result = await h.inserter.insert('完整正文');
  assert.deepEqual(clone(result), {
    status:'rejected',code:'DIRECTED_APPEND_UNAVAILABLE',actionState:'not_started',
  });
  assert.deepEqual(h.calls,['find','release']);
  assert.equal(h.field.focused,false);
  assert.equal(h.field.value,'  原稿\r\n\t😀 e\u0301  ');
  assert.equal(h.state.clipboard,'user clipboard');
});
// These are refusal tests, not provider qualification or positive append tests.
for (const draft of ['', '  原稿\r\n\t😀 e\u0301  ', '\n\n', 'D\u2028尾'])
for (const focus of [false,true])
for (const selected of [false,true]) test(`directed transport required: length=${draft.length}, focus=${focus}, selection=${selected}`, async () => {
  const h = await harness(); nativeState(h, draft); h.field.focused=focus;
  h.state.clipboard='original clipboard';
  if(selected)h.field.textInputState.selection={location:0,length:draft.length};
  // None of these input channels can be a fallback, even with idle IME data.
  h.runtime.Accessibility.perform=async()=>assert.fail('must not prepare selection');
  h.runtime.mouse.clickPoint=async()=>assert.fail('must not focus via click');
  h.runtime.clipboard.copy=()=>assert.fail('helper must not write clipboard');
  h.runtime.keyboard.combination=async()=>assert.fail('must not send global input');
  const result = await h.inserter.insert('  完整正文\n\ttail  ');
  assert.equal(result.code,'DIRECTED_APPEND_UNAVAILABLE');
  assert.equal(result.actionState,'not_started');
  assert.equal(h.field.value,draft);assert.equal(h.field.focused,focus);
  assert.equal(h.state.clipboard,'original clipboard');
  assert.deepEqual(h.calls,['find','release']);
});
test('IME active or unknown rejects before any focus or paste', async () => {
  for (const composition of ['active', 'unknown']) {
    const h = await harness(); nativeState(h); h.field.textInputState.composition = composition;
    const result = await h.inserter.insert('body');
    assert.equal(result.status, 'rejected'); assert.equal(pasted(h).length, 0);
    assert.equal(focused(h).length, 0);
  }
});
test('new target/window or another explicit click cannot enable global paste', async () => {
  const h=await harness();nativeState(h,'  draft  ');
  assert.equal((await h.inserter.insert('first')).code,'DIRECTED_APPEND_UNAVAILABLE');
  for(const win of [h.target,h.state.target,h.state.active]){win.id='mac:42:72';win.handle=72;}
  const next=h.createRuntimeInserter({...h.options,layout:{...h.options.layout,window:{...h.target}}});
  assert.equal((await next.insert('second')).code,'DIRECTED_APPEND_UNAVAILABLE');
  assert.equal(pasted(h).length,0);assert.equal(focused(h).length,0);
  assert.equal(h.field.value,'  draft  ');
});
test('profile candidate point must intersect a unique actual named field', async () => {
  const h = await harness();
  const measured = await h.discoverRuntimeEditor({...h.options, editorSelector:undefined, hint:{x:300,y:430}});
  assert.equal(measured.editorSelector.identifier, 'fixture-composer');
  assert.deepEqual(h.calls, []);
  await assert.rejects(h.discoverRuntimeEditor({...h.options, editorSelector:undefined, hint:{x:10,y:10}}), {code:'MISSING_FIELD'});
  h.state.extra.push({...clone(h.field), identifier:'other'});
  await assert.rejects(h.discoverRuntimeEditor({...h.options, editorSelector:undefined, hint:{x:300,y:430}}), {code:'AMBIGUOUS_FIELD'});
});

test('scoped discovery, calibration and insertion never use global window reads',async()=>{
  const h=await harness(),scope={pid:h.target.pid,exePath:h.target.exePath};
  h.runtime.window.current=()=>assert.fail('global current');
  h.runtime.window.getActiveWindow=()=>assert.fail('global active');
  h.runtime.window.getAppWindow=async actual=>{
    assert.deepEqual(clone(actual),scope);return clone(h.state.target);
  };
  const options={...h.options,scope};
  await h.discoverRuntimeEditor(options);
  await h.calibrateRuntimeEditor(options);
  h.field.textInputState={unit:'utf16',composition:'inactive',selection:{location:0,length:0}};
  assert.equal((await h.createRuntimeInserter(options).insert('body')).code,'DIRECTED_APPEND_UNAVAILABLE');
  assert.deepEqual(h.calls,['find','release']);
  h.state.target=null;
  await assert.rejects(h.discoverRuntimeEditor(options),{code:'TARGET_CHANGED'});
});


test('explicit unnamed AXTextArea policy discovers at depth 24 without inventing a name',async()=>{
  const h=await harness();h.field.name='';h.field.identifier='';h.field.nativeRole='AXTextArea';
  const editorDiscovery={role:'textField',nativeRole:'AXTextArea',maxDepth:24};
  const measured=await h.discoverRuntimeEditor({...h.options,editorSelector:undefined,editorDiscovery});
  assert.deepEqual(clone(measured.editorSelector),{role:'textField'});
  assert.equal(measured.nativeRole,'AXTextArea');assert.equal(measured.searchDepth,24);
  const inserter=h.createRuntimeInserter({...h.options,...measured});
  assert.equal((await inserter.insert('完整正文')).code,'INPUT_STATE_UNVERIFIABLE');
  assert.deepEqual(h.calls,['find','release']);assert.equal(h.field.value,'');
  h.state.extra.push({...clone(h.field),nativeRole:'AXTextField'});
  await assert.rejects(h.discoverRuntimeEditor({...h.options,editorSelector:undefined,editorDiscovery}),{code:'AMBIGUOUS_FIELD'});
});
test('unnamed discovery refuses missing coordinate qualification and native-role changes',async()=>{
  const h=await harness();h.field.name='';h.field.identifier='';h.field.nativeRole='AXTextArea';
  const editorDiscovery={role:'textField',nativeRole:'AXTextArea',maxDepth:24};
  const options={...h.options,editorSelector:undefined,editorDiscovery};
  const bounds=h.field.bounds;h.field.bounds=null;
  await assert.rejects(h.discoverRuntimeEditor(options),{code:'UNSAFE_BOUNDS'});
  h.field.bounds=bounds;
  const measured=await h.discoverRuntimeEditor(options);
  h.hooks.read=()=>{h.field.nativeRole='AXTextField';};
  const result=await h.createRuntimeInserter({...h.options,...measured}).insert('正文');
  assert.equal(result.code,'FIELD_CHANGED');assert.deepEqual(h.calls,['find','release']);
});


test('deep named editor keeps depth 64 through discovery and pre-input rejection',async()=>{
  const h=await harness();h.field.name='Prompt';h.field.identifier='';
  let tree=clone(h.field);
  for(let i=0;i<43;i++)tree={role:'group',children:[tree]};
  const originalFind=h.runtime.Accessibility.find;
  h.runtime.Accessibility.snapshot=async options=>{
    assert.equal(options.maxDepth,64);return {complete:true,truncated:false,root:{role:'window',children:[tree]}};
  };
  h.runtime.Accessibility.find=async (selector,options)=>{
    assert.equal(options.maxDepth,64);return originalFind(selector,options);
  };
  const options={...h.options,editorSelector:{role:'textField',name:'Prompt'},maxDepth:64};
  const measured=await h.discoverRuntimeEditor(options);
  assert.equal(measured.searchDepth,64);
  const result=await h.createRuntimeInserter({...options,...measured}).insert('完整正文');
  assert.equal(result.actionState,'not_started');assert.equal(result.code,'INPUT_STATE_UNVERIFIABLE');
  assert.deepEqual(h.calls,['find','release']);assert.equal(h.field.value,'');
  await assert.rejects(h.discoverRuntimeEditor({...options,maxDepth:65}),{code:'EDITOR_EVIDENCE_REQUIRED'});
});

// One context qualification per operation; guards still protect the selected target.
test('context rejection prevents input and allows an explicit later retry',async()=>{
  const h=await pasteHarness('original');let checks=0;
  const verifyContext=async()=>{if(++checks===1)throw fail('SCENE_CHANGED');};
  const helper=h.createRuntimeInserter({...h.options,inputMode:'paste',verifyContext});
  const result=await helper.insert('body');
  assert.equal(result.code,'SCENE_CHANGED');assert.equal(result.actionState,'not_started');
  assert.equal(pasted(h).length,0);assert.equal(h.field.value,'original');
  assert.equal((await helper.insert('body')).verified,true);assert.equal(checks,2);
});

test('focused common path qualifies context once, reads without bounds and avoids pre-input scans',async()=>{
  const h=await pasteHarness('original');let checks=0;
  const verifyContext=async()=>{checks++;};
  const helper=h.createRuntimeInserter({...h.options,layout:undefined,inputMode:'paste',verifyContext});
  h.hooks.paste=text=>{
    assert.equal(checks,1);assert.equal(h.state.reads,1);assert.equal(h.state.snapshots,0);
    h.field.value+=text;
  };
  assert.equal((await helper.insert('body')).verified,true);assert.equal(checks,1);
  assert.ok(h.state.readOptions.every(o=>!o.properties.includes('bounds')));
});

test('a changed measured editor after context qualification cannot be clicked',async()=>{
  const h=await pasteHarness('original');h.field.focused=false;
  const verifyContext=async()=>{h.field.bounds.y++;};
  const result=await h.createRuntimeInserter({...h.options,inputMode:'paste',verifyContext}).insert('body');
  assert.equal(result.code,'LAYOUT_CHANGED');assert.equal(focused(h).length,0);
});

for(const changed of ['selected-target','foreground','field-identity'])
test('target/ref guard refuses '+changed+' before paste',async()=>{
  const h=await pasteHarness('original');let replacement=false;
  const helper=h.createRuntimeInserter({...h.options,inputMode:'paste',getTarget:async()=>({
    ...h.target,...(replacement?{handle:999,id:'replacement'}:{})
  })});
  h.hooks.read=()=>{
    if(changed==='selected-target')replacement=true;
    if(changed==='foreground')h.state.active.isForeground=false;
    if(changed==='field-identity')h.field.identifier='another';
  };
  const r=await helper.insert('body');
  assert.equal(r.status,'rejected');assert.equal(r.actionState,'not_started');
  assert.equal(pasted(h).length,0);assert.equal(h.calls.at(-1),'release');
});

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}

test('prepare is read-only, coalesces find and consumes cached managed ref once',async()=>{
  const h=await pasteHarness('draft'),entered=deferred(),finish=deferred();
  const find=h.runtime.Accessibility.find;
  h.runtime.Accessibility.find=async(...args)=>{entered.resolve();await finish.promise;return find(...args);};
  h.state.clipboard='user clipboard';
  const first=h.inserter.prepare();await entered.promise;
  const second=h.inserter.prepare();finish.resolve();await Promise.all([first,second]);
  await h.inserter.prepare();
  assert.deepEqual(h.calls,['find']);assert.equal(h.state.reads,0);assert.equal(h.state.snapshots,0);
  assert.equal(h.state.clipboard,'user clipboard');assert.equal(h.field.value,'draft');
  assert.equal((await h.inserter.insert('one')).verified,true);
  assert.deepEqual(h.calls.filter(c=>c==='find'||c==='release'),['find','release']);
  assert.equal((await h.inserter.insert('two')).verified,true);
  assert.deepEqual(pasted(h),[['paste','one'],['paste','two']]);assert.equal(h.field.value,'draftonetwo');
  assert.deepEqual(h.calls.filter(c=>c==='find'||c==='release'),['find','release','find','release']);
});

test('dispose releases unused prepared ref exactly once and prevents later input',async()=>{
  const h=await pasteHarness('draft');await h.inserter.prepare();
  await h.inserter.dispose();await h.inserter.dispose();
  assert.deepEqual(h.calls,['find','release']);
  const result=await h.inserter.insert('body');
  assert.notEqual(result.status,'inserted');assert.equal(result.actionState,'not_started');
  await h.inserter.prepare();assert.deepEqual(h.calls,['find','release']);
  assert.equal(pasted(h).length,0);assert.equal(h.field.value,'draft');
});

test('dispose during preparation releases the late ref and prevents input',async()=>{
  const h=await pasteHarness(),entered=deferred(),finish=deferred();
  const find=h.runtime.Accessibility.find;
  h.runtime.Accessibility.find=async(...args)=>{entered.resolve();await finish.promise;return find(...args);};
  const preparing=h.inserter.prepare();await entered.promise;
  const disposing=h.inserter.dispose();finish.resolve();await Promise.all([preparing,disposing]);
  assert.deepEqual(h.calls,['find','release']);
  assert.notEqual((await h.inserter.insert('body')).status,'inserted');
  assert.deepEqual(h.calls,['find','release']);assert.equal(pasted(h).length,0);
});

test('busy preparation does not allocate an unused second ref',async()=>{
  const h=await pasteHarness(),entered=deferred(),finish=deferred();
  h.hooks.read=async()=>{if(h.state.reads===1){entered.resolve();await finish.promise;}};
  const pending=h.inserter.insert('first');await entered.promise;
  try{
    await h.inserter.prepare();
    assert.equal((await h.inserter.insert('second')).code,'BUSY');
    assert.equal(h.calls.filter(c=>c==='find').length,1);
  }finally{finish.resolve();await pending;}
  assert.deepEqual(pasted(h),[['paste','first']]);
  await h.inserter.dispose();assert.equal(h.calls.filter(c=>c==='release').length,1);
});

for(const point of ['find','context','field-read'])
test('dispose while insert awaits '+point+' prevents subsequent input',async()=>{
  const h=await pasteHarness('draft'),entered=deferred(),finish=deferred();
  const wait=async()=>{entered.resolve();await finish.promise;};
  let verifyContext;
  if(point==='context')verifyContext=wait;
  if(point==='field-read')h.hooks.read=wait;
  if(point==='find'){
    const find=h.runtime.Accessibility.find;
    h.runtime.Accessibility.find=async(...args)=>{await wait();return find(...args);};
  }
  const helper=h.createRuntimeInserter({...h.options,inputMode:'paste',verifyContext});
  const pending=helper.insert('body');await entered.promise;
  await helper.dispose();finish.resolve();const result=await pending;
  assert.notEqual(result.status,'inserted');assert.equal(result.actionState,'not_started');
  assert.equal(pasted(h).length,0);assert.equal(focused(h).length,0);
  assert.equal(h.field.value,'draft');assert.equal(h.state.clipboard,'');
  assert.equal(h.calls.filter(c=>c==='release').length,1);
});

for(const body of ['', ' ', 'a\0b', '\u001b', 'x'.repeat(8193), null])
test('paste rejects unsafe body without observation '+JSON.stringify(body?.length),async()=>{
  const h=await pasteHarness('draft');
  assert.equal((await h.inserter.insert(body)).code,'UNSAFE_BODY');
  assert.equal(h.state.reads,0);assert.equal(h.state.snapshots,0);assert.deepEqual(h.calls,[]);
});

for(const editorModel of ['plain','claude-code','opencode'])
test(editorModel+' focused selection falls back to end without replacing selected draft',async()=>{
  const h=editorModel==='plain'?await pasteHarness('keep selected tail'):
    await claudePasteHarness('keep selected tail',{editorModel});
  h.field.textInputState.selection={location:5,length:8};
  assert.equal((await h.inserter.insert('BODY')).verified,true);
  assert.equal(editorModel==='plain'?h.field.value:h.logical,'keep selected tail\n\nBODY');
  assert.deepEqual(pasted(h),[['paste','\n\nBODY']]);assert.equal(focused(h).length,0);
  const pasteIndex=h.calls.findIndex(c=>Array.isArray(c)&&c[0]==='paste');
  assert.equal(h.calls.slice(0,pasteIndex).filter(c=>Array.isArray(c)&&c[0]==='end').length,1);
});

test('prepare failure releases no unowned ref and permits a fresh preparation',async()=>{
  const h=await pasteHarness('draft');
  h.hooks.find=()=>{throw fail('STALE_TARGET');};
  await assert.rejects(h.inserter.prepare(),{code:'STALE_TARGET'});
  assert.deepEqual(h.calls,[]);assert.equal(h.state.reads,0);
  delete h.hooks.find;await h.inserter.prepare();
  assert.deepEqual(h.calls,['find']);
  assert.equal((await h.inserter.insert('body')).verified,true);
  assert.deepEqual(h.calls.filter(c=>c==='find'||c==='release'),['find','release']);
  assert.equal(h.field.value,'draftbody');
});

test('prepared ref cannot authorize a replacement target and is released',async()=>{
  const h=await pasteHarness('draft');
  h.inserter=h.createRuntimeInserter({...h.options,layout:undefined,inputMode:'paste'});
  await h.inserter.prepare();
  for(const win of [h.target,h.state.target,h.state.active]){win.id='mac:42:72';win.handle=72;}
  const result=await h.inserter.insert('body');
  assert.equal(result.code,'TARGET_CHANGED');assert.equal(result.actionState,'not_started');
  assert.deepEqual(h.calls,['find','release']);assert.equal(h.state.reads,0);
  assert.equal(pasted(h).length,0);assert.equal(h.field.value,'draft');
});

for(const point of ['focus','caret'])
test('dispose during fallback '+point+' blocks paste and prevents retry',async()=>{
  const h=await pasteHarness('draft');
  if(point==='focus'){
    h.field.focused=false;h.hooks.focus=()=>h.inserter.dispose();
  }else{
    h.field.textInputState.selection={location:0,length:2};
    h.hooks.end=()=>h.inserter.dispose();
  }
  const result=await h.inserter.insert('body');
  assert.equal(result.status,'blocked');assert.equal(result.actionState,'unknown');
  assert.equal(pasted(h).length,0);assert.equal(h.field.value,'draft');
  assert.equal(h.calls.filter(c=>c==='release').length,1);
  const calls=h.calls.length;
  assert.equal((await h.inserter.insert('again')).code,'INPUT_BLOCKED');assert.equal(h.calls.length,calls);
});
