// Parent-owned live gate; from repository root, after refreshing the native host:
// ./dist/opendesk -ui -script-text "await (0,eval)(File.read('tests/runtime-api/trusted-app-window.js'))" -console-mode script
// script-text deliberately keeps the content root at the repository root;
// all generated HTML/evidence remains under .runtime/, never tests/.
(async () => {
  'use strict';
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const rejected = async (fn, code) => {
    let caught;
    try { await fn(); } catch (error) { caught = error; }
    assert(caught && caught.code === code, 'expected ' + code + ', got ' + caught);
  };
  assert(typeof ui.createTrustedWindow === 'function', 'trusted entry missing');
  const caps = ui.getCapabilities();
  const position = { mode: 'absolute', bounds: { x: 120, y: 120, width: 380, height: 480 } };
  const spec = { id: 'trustedA', position, content: { file: '.runtime/tests/trusted-app-window/app.html', sha256: '0'.repeat(64) } };
  if (!caps.enabled) {
    await rejected(() => ui.createTrustedWindow(spec), 'UI_DISABLED');
    console.log('TRUSTED_APP_WINDOW_DISABLED_OK'); return;
  }
  await rejected(() => ui.createTrustedWindow({ ...spec, trusted: true }), 'INVALID_SPEC');
  for (const field of ['html', 'css', 'assets', 'controls', 'trust']) {
    await rejected(() => ui.createTrustedWindow({ ...spec, content: { ...spec.content, [field]: null } }), 'INVALID_SPEC');
  }
  await rejected(() => ui.createWindow({ ...spec, trustedContent: { html: '<script></script>' } }), 'INVALID_SPEC');
  if (!caps.window.trustedWindow) {
    await rejected(() => ui.createTrustedWindow(spec), 'UNSUPPORTED_CAPABILITY');
    console.log('TRUSTED_APP_WINDOW_UNSUPPORTED_OK'); return;
  }
  (0, eval)(File.read('tests/runtime-api/crypto.js'));
  const root = '.runtime/tests/trusted-app-window';
  File.ensureDir(root);
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><button id="click">React-compatible local app</button><script>
    const api=window.OpenDeskApp;
    let seen=0;
    api.onMessage(value=>{
      if(value&&value.command==='null'){api.postMessage(null);return;}
      if(value&&value.command==='probe'){const violations=[];const violation=e=>violations.push(e.effectiveDirective);addEventListener('securitypolicyviolation',violation);let invalid=0;for(const v of [undefined,()=>1,NaN,{v:undefined}]){try{api.postMessage(v);}catch(e){invalid++;}}let evalBlocked=false;try{eval('1');}catch(e){evalBlocked=true;}fetch('https://opendesk.invalid/blocked').then(()=>api.postMessage({probeFailed:true}),()=>setTimeout(()=>{removeEventListener('securitypolicyviolation',violation);api.postMessage({invalid,evalBlocked,connectBlocked:violations.includes('connect-src'),violations});},100));return;}
      if(value&&value.command==='navigate'){location.href='https://opendesk.invalid/escape';return;}
      if(value&&value.command==='popup'){window.open('https://opendesk.invalid/escape');return;}
      api.postMessage({value,seen:++seen,globals:[typeof File.read,typeof Runtime,typeof desktop,typeof ui],bridge:typeof api.onMessage});
    });
    document.querySelector('button').onclick=()=>api.postMessage({clicked:true});
  </script></body></html>`;
  File.write(spec.content.file, html);
  spec.content.sha256 = RuntimeAPICrypto.hashFile(spec.content.file);
  await rejected(() => ui.createTrustedWindow({ ...spec, content: { ...spec.content, sha256: '' } }), 'INVALID_SPEC');
  await rejected(() => ui.createTrustedWindow({ ...spec, content: { ...spec.content, sha256: '0'.repeat(64) } }), 'INVALID_SPEC');
  await rejected(() => ui.createTrustedWindow({ ...spec, content: { ...spec.content, file: '../escape.html' } }), 'INVALID_SPEC');
  await rejected(() => ui.createWindow({ id: 'restrictedScript', position, content: { html: '<script>1</script>' } }), 'INVALID_SPEC');
  const windows = [];
  async function exchange(window, value) {
    let off;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (off) off(); reject(new Error('message timeout')); }, 5000);
      off = window.on('message', event => { clearTimeout(timer); off(); resolve(event.value); });
    });
    await window.postMessage(value);
    return response;
  }
  try {
    const a = await ui.createTrustedWindow(spec); windows.push(a);
    assert(Array.isArray(a.controls()) && a.controls().length === 0, "trusted controls must be empty");
    await a.setSize(380, 480);
    await a.setDraggable(false);
    const b = await ui.createTrustedWindow({ ...spec, id: 'trustedB', kind: 'floating' }); windows.push(b);
    // Snapshot integrity: subsequent filesystem writes must not change the loaded bytes.
    File.write(spec.content.file, '<script>throw Error("mutated")</script>');
    const payload = { text: '</script>\u2028\u2029 " \\', list: [null, true, 1] };
    const answer = await exchange(a, payload);
    assert(answer.value.text === payload.text && JSON.stringify(answer.value.list) === JSON.stringify(payload.list) && Object.keys(answer.value).length === 2, 'data encoding changed');
    assert(answer.globals.every(value => value === 'undefined'), 'Runtime authority leaked');
    assert(answer.bridge === 'function', 'page bridge missing');
    let cross = 0;
    const off = b.on('message', () => { cross++; });
    assert(await exchange(a, { command: 'null' }) === null, 'root JSON null lost');
    const probe = await exchange(a, { command: 'probe' });
    assert(probe.invalid === 4 && probe.evalBlocked && probe.connectBlocked, 'page JSON/CSP boundary failed');
    await exchange(a, null);
    assert(cross === 0, 'window isolation failed'); off();
    for (const value of [undefined, () => 1, { value: undefined }, NaN, 'x'.repeat(65536)]) {
      await rejected(() => a.postMessage(value), 'INVALID_SPEC');
    }
    const cycle = {}; cycle.self = cycle;
    await rejected(() => a.postMessage(cycle), 'INVALID_SPEC');
    await a.postMessage({ command: 'navigate' });
    await a.postMessage({ command: 'popup' });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert((await exchange(a, 'still here')).value === 'still here', 'navigation escaped');
    await a.close();
    await rejected(() => a.postMessage(null), 'INVALID_STATE');
    const result = { trustedAppWindow: 'passed', protocol: caps.protocolVersion, platform: caps.platform };
    File.write(root + '/result.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { for (const window of windows) await window.close(); }
})();
