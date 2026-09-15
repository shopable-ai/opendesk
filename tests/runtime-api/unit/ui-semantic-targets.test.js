// Syntax adapter tests; resolver behavior is covered by ui-sequence and
// ui-target-sequence using the real core UI source with isolated native owners.
(() => {
  const { test, assert, equal } = RuntimeAPITest;
  const source = File.read(File.join(File.cwd(), 'polyfills/011-ui-targets.js'));
  const unit = (name, fn) => test({ name, tier: 'unit', covers: ['UI.tapTargets'] }, fn);
  function fixture(run) {
    const calls = [];
    const host = { UI: { tapTargets: async (targets, options) => {
      calls.push({ targets, options });
      return run ? run(targets, options) : { ok: true, action: 'tapTargets', completed: [] };
    } } };
    new Function('globalThis', source)(host);
    return { calls, UI: host.UI };
  }
  async function rejected(fn) {
    let caught; try { await fn(); } catch (error) { caught = error; }
    assert(caught); equal(caught.code, 'INVALID_ARGUMENT'); equal(caught.actionState, 'not_started');
  }
  unit('semantic spelling adapter delegates text objects and strings to one owner', async () => {
    const f = fixture(); await f.UI.tapTargets([{text:'A'}, 'B']);
    equal(JSON.stringify(f.calls[0].targets), '["A","B"]');
  });
  unit('semantic spelling adapter retains authoritative constraints', async () => {
    const f = fixture(); await f.UI.tapTargets([{text:'Confirm',role:'button',identifier:'ok'}]);
    equal(JSON.stringify(f.calls[0].targets[0]), '{"role":"button","identifier":"ok","name":"Confirm"}');
  });
  unit('semantic spelling adapter preserves an explicit accessible name', async () => {
    const f = fixture(); await f.UI.tapTargets([{text:'×',role:'button',name:'multiply'}]);
    equal(f.calls[0].targets[0].name, 'multiply'); equal(f.calls[0].targets[0].text, undefined);
  });
  unit('semantic spelling adapter copies all steps before awaiting execution', async () => {
    const targets=[{text:'A'},{text:'B'}]; const f=fixture(async () => {targets[1].text='changed';});
    await f.UI.tapTargets(targets); equal(f.calls[0].targets.join(','), 'A,B');
  });
  unit('semantic spelling adapter leaves default scope and timing to Runtime', async () => {
    const f=fixture(); const options={intervalMs:500};
    await f.UI.tapTargets([{text:'A'}],options); equal(f.calls[0].options,options);
  });
  unit('semantic spelling adapter rejects resolver bags before delegation', async () => {
    for(const key of ['fallback','accessibility','OCR','strategy','confidence','regex','fuzzy']) {
      const f=fixture(); await rejected(() => f.UI.tapTargets([{text:'A',[key]:'forbidden'}])); equal(f.calls.length,0);
    }
  });
  unit('semantic spelling adapter preserves unknown-state failure and prefix', async () => {
    const error=Object.assign(new Error('unknown'),{code:'STATE_UNKNOWN',failedIndex:1,actionState:'unknown',completed:[{ok:true}]});
    const f=fixture(async () => {throw error;}); let caught;
    try {await f.UI.tapTargets(['A','B','never']);} catch(e) {caught=e;}
    equal(caught,error); equal(f.calls.length,1); equal(caught.completed.length,1);
  });
  unit('semantic spelling adapter preserves explicit legacy calls', async () => {
    const f=fixture(); const targets=[{locator:{role:'button',name:'A'}}],options={within:{id:'w'}};
    await f.UI.tapTargets(targets,options); equal(f.calls[0].targets,targets); equal(f.calls[0].options,options);
  });
  unit('semantic spelling adapter rejects mixed legacy and invalid sequences', async () => {
    for(const targets of [[{locator:{name:'A'}},{text:'B'}],new Array(1),[],[null],[{}],[{text:''}]]) {
      const f=fixture(); await rejected(() => f.UI.tapTargets(targets)); equal(f.calls.length,0);
    }
  });
  unit('semantic spelling adapter never rewrites returned completion evidence', async () => {
    const result={ok:true,action:'tapTargets',completed:[{action:'invoke',actionState:'acknowledged'}]};
    const f=fixture(async()=>result); equal(await f.UI.tapTargets([{role:'button',name:'A'}]),result);
  });

})();
