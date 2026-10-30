// Formal P3 native gate, loaded by run-workspace-native.mjs into its own App Mode.
// Only native UI actions; disk reads are independent oracles, never state injection.
(async function workspaceNative({ target, evidence, phase, fileRoot, prior = {}, closeObserve = false, expectedHost }) {
  const checks = [], screenshots = [];
  let serial = 0, inputPending = null;
  const assert = (value, reason) => { if (!value) throw Error(reason); };
  const write = (name, value) => File.writeJSON(File.join(evidence, name + '.json'), value);
  const flat = n => [n, ...(n.children || []).flatMap(flat)];
  const current = () => window.current(target);
  const same = (a, b) => ['id','pid','handle','x','y','width','height'].every(k => a[k] === b[k]);
  const record = (id, actual) => { checks.push({ id, actual }); console.log('WORKSPACE_CHECK ' + id); };
  const tree = async () => {
    const result = await Accessibility.snapshot({ within: await current(), maxDepth: 48, maxNodes: 4000,
      properties: ['role','nativeSubrole','name','actions','enabled','checked','selected','bounds'] });
    await write('ax-' + (++serial), result);
    assert(result.complete && !result.truncated, 'Incomplete native observation');
    return flat(result.root);
  };
  const input = async (label, action) => {
    inputPending = label;
    await write('input-latest', { label, state: 'about-to-submit' });
    const result = await action();
    inputPending = null;
    await write('input-latest', { label, state:'returned', receipt:result??null });
    return result;
  };
  const visual = async (queries, match = 'contains') => {
    const w = await window.activate(await current());
    const groups = await UI.findTextMatches(queries, { within: w, match });
    await write('ocr-' + (++serial), { w, queries, groups });
    assert(same(w, await current()), 'Window changed during observation');
    return { w, groups };
  };
  const shot = async name => {
    const w = await window.activate(await current());
    assert(w.isForeground, 'Screenshot window is not foreground');
    await page.screenshot({ clip: { x:w.x, y:w.y, width:w.width, height:w.height },
      path: File.join(evidence, name + '.png'), returnType: 'path' });
    const after = await current();
    assert(after.isForeground && same(w, after), 'Screenshot identity/geometry changed');
    screenshots.push(name + '.png'); await write(name, { window: after, visualReview: 'NOT_REVIEWED' });
  };
  const clickPoint = async (w, p, label) => {
    const after = await current();
    assert(after.isForeground && same(w, after), 'Stale input target: ' + label);
    assert(p.coordinateSpace === 'screen' && p.x > w.x && p.y > w.y && p.x < w.x+w.width && p.y < w.y+w.height,
      'Target outside owned window: ' + label);
    await input(label, () => mouse.clickForPID(w.pid, p.x, p.y));
  };
  // Pick the strategy before input: AX header/tab/close; OCR panel buttons.
  const pressAX = async (name, role = 'button', nativeSubrole) => {
    const w = await window.activate(await current());
    const matches = (await tree()).filter(n => n.role === role && (nativeSubrole ? n.nativeSubrole === nativeSubrole : n.name === name));
    assert(matches.length === 1 && matches[0].enabled !== false, 'Missing/ambiguous/disabled native control: ' + name);
    const b = matches[0].bounds;
    assert(b?.coordinateSpace === 'screen', 'Uncalibrated native control: ' + name);
    await clickPoint(w, { x:b.x+b.width/2, y:b.y+b.height/2, coordinateSpace:b.coordinateSpace }, name);
  };
  const see = async (text, direction = 1, match = 'exact') => {
    for (let i=0; i<16; i++) {
      const found = await visual([text], match);
      assert(found.groups[0].matches.length <= 1, 'Ambiguous visible control: ' + text);
      if (found.groups[0].matches.length === 1) return found;
      const w = await window.activate(await current());
      assert(same(w,found.w)&&w.isForeground, 'Focus/geometry unavailable before scroll');
      await mouse.move(w.x+w.width-24, w.y+w.height-125);
      assert(same(w, await current()) && (await current()).isForeground, 'Scroll scope changed');
      await input('scroll-to-' + text, () => mouse.wheel({ deltaY:direction*190, steps:3, delay:20 }));
      await sleep(120);
    }
    throw Error('Target absent within bounded scroll: ' + text);
  };
  const press = async (text, direction = 1) => {
    const { w, groups } = await see(text, direction);
    await clickPoint(w, groups[0].matches[0].center, text);
  };
  const waitText = async text => {
    const deadline = Date.now()+8000;
    while (Date.now()<deadline) {
      if ((await visual([text])).groups[0].matches.length >= 1) return;
      await sleep(150);
    }
    throw Error('Missing business readback: ' + text);
  };
  const value = async (name, value, role = 'textField') => {
    {
      // Reveal the exact field before input. AX focus alone does not prove
      // the WebKit input view is the actual native keyboard first responder.
      for(let i=0;i<16;i++) {
        const w=await window.activate(await current());
        const found=(await tree()).filter(n=>n.name===name&&n.role===role);
        assert(found.length===1&&found[0].bounds?.coordinateSpace==='screen','Field geometry unavailable: '+name);
        const b=found[0].bounds;
        if(b.y>w.y+180&&b.y+b.height<w.y+w.height-80)break;
        assert(i<15,'Select not visible within bounded scroll');
        await mouse.move(w.x+w.width-24,w.y+w.height-125);
        assert(same(w,await current())&&(await current()).isForeground,'Select scroll target changed');
        await input('scroll-select-'+name,()=>mouse.wheel({deltaY:b.y<=w.y+180?-160:160,steps:3,delay:20}));
        await sleep(120);
      }
    }
    // Native selector remains mandatory. Text entry is deliberately a real
    // focused keyboard edit: an AXValue ACK did not prove React form state.
    // This strategy is selected before input, never after a failed setter.
    const ref = await Accessibility.find({ name, role }, { within:await current(), maxDepth:48, maxNodes:4000 });
    assert(ref, 'Native field missing: ' + name);
    try {
      const before = await Accessibility.read(ref, { properties:['enabled','actions','value'] });
      await write('field-' + (++serial), {name,role,observed:before});
      if (role==='popUpButton') {
        assert(before.properties.enabled!==false && before.properties.actions?.includes('invoke'), 'Select cannot be opened: '+name);
        const opened=await input('open-select-'+name,()=>Accessibility.perform(ref,{action:'invoke'}));
        assert(opened.actionState==='acknowledged','Unknown select open');
        // Application-root AX includes unrelated unmaterialized menu bars.
        // Observe the actual open popup pixels in this exact owned window.
        const choices=await visual([value],value.endsWith('.json')||value.endsWith('.png')?'contains':'exact');
        assert(choices.groups[0].matches.length===1,'Missing/ambiguous visible native option: '+value);
        await shot('select-menu-'+serial);
        await clickPoint(choices.w,choices.groups[0].matches[0].center,'select-option-'+value);
        let selected;
        const deadline=Date.now()+3000;
        do {
          selected=(await Accessibility.read(ref,{properties:['value']})).properties.value;
          if(selected===value||selected?.startsWith(value+' ·'))break;
          await sleep(100);
        } while(Date.now()<deadline);
        await write('select-readback-'+(++serial),{name,expected:value,actual:selected});
        assert(selected===value||selected?.startsWith(value+' ·'),'Native selection readback mismatch');
        return;
      }
      assert(before.properties.enabled !== false, 'Field cannot be focused: ' + name);
      const w=await window.activate(await current());
      const observed=await Accessibility.read(ref,{properties:['bounds']});
      const b=observed.properties.bounds;
      assert(b?.coordinateSpace==='screen'&&b.x>w.x&&b.y>w.y&&b.x+b.width<w.x+w.width&&b.y+b.height<w.y+w.height,'Field outside owned window');
      await shot('field-before-'+serial);
      assert(same(w,await current())&&(await current()).isForeground,'Native input window changed');
      await input('pointer-focus-field-'+name,()=>mouse.clickPoint({x:b.x+b.width/2,y:b.y+b.height/2,coordinateSpace:'screen'}));
      // Use the documented native AX setter on this ordinary business form.
      // Exported business files below independently prove React accepted it;
      // an acknowledged setter or matching AXValue alone is insufficient.
      const applied=await input('set-native-field-'+name,()=>Accessibility.perform(ref,{action:'setValue',value}));
      assert(applied.actionState==='acknowledged','Unknown native field edit: '+name);
      let actual;
      const deadline=Date.now()+3000;
      do {
        actual=(await Accessibility.read(ref,{properties:['value']})).properties.value;
        if(actual===value)break;
        await sleep(100);
      } while(Date.now()<deadline);
      await write('field-readback-'+(++serial),{name,expected:value,actual});
      await shot('field-after-'+serial);
      await tree();
      const fresh=await Accessibility.find({name,role},{within:await current(),maxDepth:48,maxNodes:4000});
      assert(fresh,'Fresh field missing after input');
      try {await write('field-fresh-'+serial,await Accessibility.read(fresh,{properties:['value','focused','bounds']}));}
      finally {await Accessibility.release(fresh);}
      assert(actual===value, 'Native value readback mismatch: ' + name);
    } finally { await Accessibility.release(ref); }
  };
  const confirm = async accept => {
    await waitText('继续'); // Dialog text must be observed before its button.
    await shot(accept ? 'confirm-dialog' : 'cancel-dialog');
    const pattern = accept ? /^(好|确定|确认|OK)$/ : /^(取消|Cancel)$/;
    const candidates = (await tree()).filter(n => n.role === 'button' && pattern.test(n.name || ''));
    assert(candidates.length === 1, 'Missing/ambiguous native confirmation button');
    await pressAX(candidates[0].name);
  };
  const backups = () => File.listDir(fileRoot).filter(n => /^business-backup-[\w-]+\.json$/.test(n));
  const exportBackup = async label => {
    const before = new Set(backups());
    await press('导出业务备份', -1);
    const deadline = Date.now()+10000;
    let added;
    do { added=backups().filter(n => !before.has(n)); if (added.length) break; await sleep(150); } while (Date.now()<deadline);
    assert(added.length === 1, 'Expected exactly one new native backup');
    const data = await File.readJSON(File.join(fileRoot, added[0]));
    assert(data.format === 'opendesk.ai-customer-support.business-backup', 'Unexpected backup format');
    await write(label, { name:added[0], data });
    return { name:added[0], data };
  };
  const product = data => [...data.records,...data.overrides].find(e => e.kind==='product' && e.id==='p3-product' && !e.deleted);
  const setProductName = async name => {
    await see('p3-product', 1, 'contains');
    await pressAX('编辑资料 p3-product');
    await value('资料名称', name);
    await press('保存本地资料'); await see('已保存本地资料', -1, 'contains');
    await press('关闭表单');
  };
  const restoreBackup = async (name, accept) => {
    await value('本机文件名', name);
    await press('恢复本机业务备份'); await confirm(accept);
    if (accept) await see('已恢复本地数据备份', 1, 'contains');
  };
  const saveWorkspace = async () => {
    await press('保存工作区', -1); await waitText('工作区已保存');
  };
  File.ensureDir(evidence);
  try {
    assert(['observe','probe','seed','reopen','damaged'].includes(phase), 'Unknown native phase');
    const w = await current();
    assert(w.title === 'OpenDesk · AI 客服助手（未连接）', 'Unexpected native title');
    assert(expectedHost && File.realPath(w.exePath)===File.realPath(expectedHost), 'Unexpected loaded UI host path');
    await write('owned-window', w);
    await shot('initial');
    await pressAX('打开设置');
    await waitText('业务数据与同步');
    const preflight = await visual(['保存工作区','刷新工作区版本'], 'exact');
    await shot('workspace-controls');
    assert(preflight.groups.every(g => g.matches.length === 1), 'Workspace control preflight failed');
    record('workspace-control-preflight', true);
    if(phase==='probe') {
      await press('新增商品');
      await value('资料 ID','p3-product');
      await tree();await shot('product-id-probe');
      await write('result',{status:'PASS',phase,checks,screenshots,scope:'Only native product ID input/readback; no product saved'});
      return;
    }
    if (phase === 'observe') {
      await write('result', { status:'OBSERVED', phase, checks, screenshots, functional:'NOT_RUN', visual:'NOT_REVIEWED' });
      if (closeObserve) await pressAX(null,'button','AXCloseButton');
      return;
    }
    const auto = (await tree()).filter(n => n.role==='checkbox' && n.name==='启用自动保存');
    assert(auto.length===1 && auto[0].checked===false, 'Auto-save default must be observed unchecked');
    record('auto-save-default-off', true);
    if (phase === 'seed') {
      assert(!File.listDir(fileRoot).some(n => /^workspace-slot-/.test(n)), 'First launch must not write workspace automatically');
      await press('刷新文件清单'); await waitText('目录已刷新');
      await value('选择本机业务文件', 'p3-input.json', 'popUpButton');
      await press('读取本机同步页'); await see('确认应用同步页');
      await shot('native-sync-preview'); await press('确认应用同步页'); await waitText('已应用同步页');
      record('directory-select-native-read-apply', true);
      // Create a local product, so its new image has an explicit same-source owner.
      await press('新增商品');
      await value('资料 ID','p3-product'); await value('资料名称','p3 native product'); await value('商品 SKU','p3-sku');
      await press('保存本地资料'); await see('已保存本地资料',-1,'contains'); await press('关闭表单');
      await value('管理资料类型','图片','popUpButton'); await press('新增图片');
      await value('资料 ID','p3-image'); await value('资料名称','p3 native image');
      await press('刷新图片清单'); await waitText('目录已刷新');
      await value('选择本机图片文件','support-image.png','popUpButton');
      await press('读取本机商品图片');
      await see('保存本地资料');
      await shot('native-image-read-preview');
      await press('保存本地资料'); await see('已保存本地资料',-1,'contains'); await press('关闭表单');
      const baseline = await exportBackup('backup-baseline');
      const image = [...baseline.data.records,...baseline.data.overrides].find(e => e.id==='p3-image' && e.kind==='image');
      assert(image?.data.productId==='p3-product' && image.sourceId===product(baseline.data)?.sourceId && image.data.dataUrl===prior.imageDataUrl,
        'Native bytes/product/source association mismatch');
      record('image-read-associated-and-saved', { productId:image.data.productId, imageId:image.data.imageId });
      await value('管理资料类型','商品','popUpButton'); await setProductName('p3 cancel retained');
      await restoreBackup(baseline.name,false);
      const canceled = await exportBackup('backup-after-cancel');
      assert(product(canceled.data)?.data.name==='p3 cancel retained', 'Cancel replaced current business data');
      record('backup-restore-cancel-preserves-current', true);
      await restoreBackup(baseline.name,true);
      const restored = await exportBackup('backup-after-confirm');
      assert(JSON.stringify(restored.data)===JSON.stringify(baseline.data), 'Confirmed backup restore differs');
      record('backup-restore-confirm-exact-readback', true);
      await saveWorkspace(); await shot('workspace-saved-v1');
      await setProductName('p3 latest workspace'); await saveWorkspace(); await shot('workspace-saved-v2');
      record('two-workspace-versions-saved', true);
    } else {
      // Startup never silently restores the last workspace into memory.
      const initial = await exportBackup('startup-unrestored');
      assert(!product(initial.data), 'Startup silently restored workspace');
      await press('刷新工作区版本',-1);
      if (phase==='damaged') { await waitText('损坏'); await shot('damaged-slot-visible'); }
      await see('刷新工作区版本',-1);
      await pressAX('恢复工作区版本 '+prior.generation); await confirm(true);
      await waitText('工作区已恢复到页面');
      const restored = await exportBackup('workspace-restored');
      assert(product(restored.data)?.data.name===prior.productName, 'Restored wrong workspace generation');
      const image = [...restored.data.records,...restored.data.overrides].find(e=>e.id==='p3-image');
      assert(image?.data.dataUrl===prior.imageDataUrl, 'Image lost across restart/restore');
      record(phase==='damaged'?'damaged-latest-old-version-recovered':'close-reopen-explicit-restore', { generation:prior.generation });
      await saveWorkspace(); await shot('workspace-restored-saved');
    }
    // Public product list/detail screenshots retain SVG/title layout evidence.
    await pressAX('返回业务页面'); await pressAX('商品','radioButton');
    await shot('product-svg-list');
    await press('轻量连帽外套'); await waitText('返回商品'); await shot('product-svg-detail');
    await write('result', { status:'PASS', phase, checks, screenshots, visual:'NOT_REVIEWED', close:'PENDING' });
    await pressAX(null,'button','AXCloseButton');
    // The runner also requires process exit; submitting close alone is not success.
  } catch (error) {
    await write('result', { status:'FAIL', phase, checks, screenshots, error:String(error), code:error.code??null,
      actionState:error.actionState??(inputPending?'unknown':null), inputPending, visual:'NOT_REVIEWED' });
    throw error;
  }
})
