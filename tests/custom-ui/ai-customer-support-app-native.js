// Exact WindowInfo and evidence directory come from this run's SUPPORT_APP startup.
// Repository root: ./dist/opendesk -ui -script-text "await (0,eval)(File.read('tests/custom-ui/ai-customer-support-app-native.js'))(await File.readJSON('.runtime/tests/ai-customer-support/app-mode/target.json'))" -console-mode script
// Only this run's own window is observed/pressed. No business-state/DOM injection.
(async function verifySupportApp({ target, evidence, close = false, strictAX = false, businessOnly = false }) {
  const results = [];
  let observation = 0;
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const nodes = root => [root, ...(root.children || []).flatMap(nodes)];
  const current = () => window.current(target);
  const tree = async () => {
    const result = await Accessibility.snapshot({ within: await current(), maxDepth: 48, maxNodes: 2500,
      properties: ['role', 'nativeSubrole', 'name', 'identifier', 'actions', 'enabled', 'bounds', 'selected', 'checked'] });
    // Persist even incomplete observations before rejecting them.
    await File.writeJSON(File.join(evidence, 'observation-' + String(++observation).padStart(3, '0') + '.json'), result);
    assert(result.complete && !result.truncated, 'Incomplete app observation');
    return result;
  };
  const check = (id, actual) => { results.push({ id, status: 'PASS', actual }); console.log('SUPPORT_APP_CHECK ' + id); };
  const wait = async (predicate, label) => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) { if (await predicate()) return; await sleep(100); }
    throw Error('Timed out: ' + label);
  };
  const press = async (name, role, subrole) => {
    const before = await current(), snapshot = await tree();
    const matches = nodes(snapshot.root).filter(n => n.role === role && (subrole ? n.nativeSubrole === subrole : typeof name === 'string' ? n.name === name : name.test(n.name || '')));
    assert(matches.length === 1, 'Missing/ambiguous control: ' + name);
    const node = matches[0], b = node.bounds, after = await current();
    assert(node.enabled !== false && b?.coordinateSpace === 'screen', 'Control is not enabled/calibrated');
    assert(['pid', 'handle', 'x', 'y', 'width', 'height'].every(k => before[k] === after[k]), 'Window moved during preflight');
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    assert(x > after.x && x < after.x + after.width && y > after.y && y < after.y + after.height, 'Control outside owned window');
    await mouse.clickForPID(after.pid, x, y);
  };
  // Explicit native strategy, selected before input. Never fall back after an
  // unknown action, and always read a new tree to prove the application result.
  const nativeAction = async (name, role, action = { action: 'invoke' }) => {
    const ref = await Accessibility.find({ name, role }, { within: await current(), maxDepth: 48, maxNodes: 2500 });
    assert(ref, 'Missing native control: ' + name);
    try {
      const state = await Accessibility.read(ref, { properties: ['enabled', 'actions', 'checked'] });
      assert(state.properties.enabled !== false, 'Disabled native control: ' + name);
      assert(state.properties.actions.includes(action.action), 'Unsupported native action: ' + name + '/' + action.action);
      const outcome = await Accessibility.perform(ref, action);
      assert(['acknowledged', 'not_needed'].includes(outcome.actionState), 'Uncertain native action: ' + name);
    } finally { await Accessibility.release(ref); }
  };
  const shot = async name => {
    // AXPress may change the tab while the helper is in the background. Acquire
    // this exact owned window before taking visual evidence, never another PID.
    const w = await window.activate(await current());
    assert(w.isForeground, 'Screenshot target is not foreground');
    await File.writeJSON(File.join(evidence, name + '.json'), await tree());
    await page.screenshot({ clip: { x: w.x, y: w.y, width: w.width, height: w.height },
      path: File.join(evidence, name + '.png'), returnType: 'path' });
    const after = await current();
    assert(after.isForeground && ['pid', 'handle', 'x', 'y', 'width', 'height'].every(k => w[k] === after[k]), 'Screenshot observation changed; inspect image before accepting');
  };
  // Explicit strategy for the known missing WebKit AX panel subtree. This is
  // selected before input, never a retry after an unknown action. AXPress still
  // targets only the owned helper PID; OCR observes fresh, scoped pixels.
  const visual = async (queries, match = 'contains') => {
    const w = await window.activate(await current());
    const result = await UI.findTextMatches(queries, { within: w, match });
    await File.writeJSON(File.join(evidence, 'visual-latest.json'), result);
    return { w, result };
  };
  const pressVisual = async text => {
    const { w, result } = await visual([text]);
    assert(result[0].matches.length === 1, 'Visual target missing/ambiguous: ' + text);
    const after = await current(), p = result[0].matches[0].center;
    assert(after.isForeground && ['pid', 'handle', 'x', 'y', 'width', 'height'].every(k => w[k] === after[k]), 'Visual observation stale');
    assert(p.coordinateSpace === 'screen' && p.x > w.x && p.x < w.x + w.width && p.y > w.y && p.y < w.y + w.height, 'Visual target outside owned window');
    await mouse.clickForPID(w.pid, p.x, p.y);
  };
  const reveal = async (text, direction = 1) => {
    for (let i = 0; i < 6; i++) {
      const { w, result } = await visual([text]);
      if (result[0].matches.length === 1) return;
      assert(result[0].matches.length === 0, 'Ambiguous visible target: ' + text);
      const after = await current();
      assert(after.isForeground && ['pid', 'handle', 'x', 'y', 'width', 'height'].every(k => w[k] === after[k]), 'Scroll preflight changed');
      await mouse.move(w.x + w.width - 24, w.y + w.height - 125);
      await mouse.wheel({ deltaY: direction * 210, steps: 3, delay: 20 });
      await sleep(160);
    }
    throw Error('Visible target not found within bounded workspace scroll: ' + text);
  };
  File.ensureDir(evidence);
  try {
    const w = await current();
    assert(w.title === 'OpenDesk · AI 客服助手（未连接）', 'Unexpected window title');
    if (!close && !strictAX) await window.activate(w);
    if (close) {
      // The close button comes from the current owned AX window; never a global shortcut.
      const snapshot = await tree();
      const candidates = nodes(snapshot.root).filter(n => n.role === 'button' && n.nativeSubrole === 'AXCloseButton');
      assert(candidates.length === 1, 'Missing unique native close button');
      await press(null, 'button', 'AXCloseButton');
      check('user-close-submitted', { pid: w.pid, handle: w.handle });
    } else if (businessOnly) {
      await press('打开设置', 'button');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'button' && n.name === '返回业务页面'), 'business settings');
      const content = await visual(['业务数据与同步', '来源与已应用游标']);
      assert(content.result.every(g => g.matches.length === 1), 'Local workspace content missing');
      await shot('business-workspace'); check('local-business-workspace-loaded', true);
      await pressVisual('业务数据与同步');
      const collapsed = await visual(['目标与授权', '原生窗口授权'], 'exact');
      assert(collapsed.result.every(g => g.matches.length === 1), 'Workspace did not collapse');
      await pressVisual('业务数据与同步');
      const reopened = await visual(['来源与已应用游标']);
      assert(reopened.result[0].matches.length === 1, 'Workspace did not reopen');
      check('workspace-native-button-collapse-reopen', true);
      await shot('business-workspace-reopened');
      await reveal('读取本机同步页');
      await pressVisual('读取本机同步页');
      await reveal('确认应用同步页');
      const review = await visual(['确认应用同步页', '取消同步预检']);
      assert(review.result.every(g => g.matches.length === 1), 'Native sync file did not reach preview');
      await shot('native-file-preview');
      await pressVisual('确认应用同步页');
      const applied = await visual(['已应用同步页']);
      assert(applied.result[0].matches.length === 1, 'Native sync apply readback missing');
      check('native-file-read-preview-apply', true);
      await reveal('导出业务备份', -1);
      await pressVisual('导出业务备份');
      const deadline = Date.now() + 6000;
      let saved = false;
      while (Date.now() < deadline) {
        const receipt = await visual(['已保存业务备份']);
        if (receipt.result[0].matches.length === 1) { saved = true; break; }
        await sleep(100);
      }
      assert(saved, 'Native backup Host receipt missing');
      await shot('native-file-backup');check('native-backup-host-confirmed', true);
    } else if (strictAX) {
      await tree();
      await nativeAction('打开设置', 'button');
      // Header change proves React handled the transition; it does not prove
      // the panel subtree exists. Check those requirements independently.
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'button' && n.name === '返回业务页面'), 'settings header');
      let observed = nodes((await tree()).root);
      const names = ['原生窗口授权', '智能托管', '智能窗口跟随', '发送后模拟回读验证', '继续观察新消息'];
      const missing = names.filter(name => observed.filter(n => n.role === 'checkbox' && n.name === name).length !== 1);
      await File.writeJSON(File.join(evidence, 'ax-settings-coverage.json'), { expected: names, missing,
        observed: observed.filter(n => n.name).map(n => ({ role: n.role, name: n.name, checked: n.checked, enabled: n.enabled })) });
      assert(!missing.length, 'AX_REQUIRED_NODES_MISSING: ' + missing.join(', '));
      for (const name of ['原生窗口授权', '智能托管', '发送后模拟回读验证']) {
        assert(observed.find(n => n.role === 'checkbox' && n.name === name).enabled === false, 'Disconnected control must be disabled: ' + name);
      }
      const toggles = ['智能窗口跟随', '继续观察新消息'];
      const originals = {};
      for (const name of toggles) {
        const original = observed.find(n => n.role === 'checkbox' && n.name === name).checked;
        assert(typeof original === 'boolean', 'Unreadable checkbox: ' + name);
        originals[name] = original;
        await nativeAction(name, 'checkbox', { action: 'setChecked', checked: !original });
        assert(nodes((await tree()).root).some(n => n.role === 'checkbox' && n.name === name && n.checked === !original), 'Checkbox readback: ' + name);
      }
      await nativeAction('返回业务页面', 'button');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'button' && n.name === '打开设置'), 'business return');
      await nativeAction('打开设置', 'button');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'button' && n.name === '返回业务页面'), 'settings reopen');
      for (const name of toggles) {
        assert(nodes((await tree()).root).some(n => n.role === 'checkbox' && n.name === name && n.checked === !originals[name]), 'Setting lost on return: ' + name);
        await nativeAction(name, 'checkbox', { action: 'setChecked', checked: originals[name] });
        assert(nodes((await tree()).root).some(n => n.role === 'checkbox' && n.name === name && n.checked === originals[name]), 'Restored checkbox readback: ' + name);
      }
      await shot('strict-settings');
      check('ax-settings-controls-and-readback', true);
      await nativeAction('返回业务页面', 'button');
      // Tabs use the existing PID-directed press. AXSelected acknowledgement
      // alone did not trigger React navigation in the observed host.
      await press('商品', 'radioButton');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'radioButton' && n.name === '商品' && n.selected === true), 'product tab');
      observed = nodes((await tree()).root);
      assert(observed.some(n => n.role === 'textField' && n.name === '搜索商品名称型号和规格'), 'AX product search missing');
      await nativeAction('查看商品：轻量连帽外套 · OD-JK-101', 'button');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'button' && n.name === '← 返回商品'), 'product detail');
      check('ax-product-detail', true);
      await nativeAction('打开设置', 'button');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'button' && n.name === '返回业务页面'), 'settings return');
      await nativeAction('返回业务页面', 'button');
      await press('知识库', 'radioButton');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'radioButton' && n.name === '知识库' && n.selected === true), 'knowledge tab');
      await press('商品', 'radioButton');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'radioButton' && n.name === '商品' && n.selected === true), 'product return');
      assert(nodes((await tree()).root).some(n => n.role === 'button' && n.name === '← 返回商品'), 'Product detail state lost');
      await press('推荐回复', 'radioButton');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'radioButton' && n.name === '推荐回复' && n.selected === true), 'reply tab');
      assert(nodes((await tree()).root).some(n => n.role === 'button' && n.name === '→ 填入聊天草稿' && n.enabled === false), 'Disconnected draft gained authority');
      check('ax-state-return-and-no-write-authority', true);
    } else {
      const labels = ['推荐回复', '知识库', '客户档案', '商品', '图片', '订单'];
      if (nodes((await tree()).root).some(n => n.role === 'button' && n.name === '返回业务页面')) await press('返回业务页面', 'button');
      await press('推荐回复', 'radioButton');
      const initial = nodes((await tree()).root);
      for (const name of labels) assert(initial.filter(n => n.role === 'radioButton' && n.name === name).length === 1, 'Tab preflight: ' + name);
      assert(initial.some(n => n.role === 'button' && n.name === '→ 填入聊天草稿' && n.enabled === false), 'Unbound draft must be disabled');
      check('unbound-has-no-write-authority', true);
      for (let i = 0; i < labels.length; i++) {
        await press(labels[i], 'radioButton');
        await wait(async () => nodes((await tree()).root).some(n => n.role === 'radioButton' && n.name === labels[i] && n.selected === true), labels[i]);
        const selected = nodes((await tree()).root).filter(n => n.role === 'radioButton' && labels.includes(n.name) && n.selected === true);
        assert(selected.length === 1 && selected[0].name === labels[i], 'Inactive tab remained selected');
        await shot('page-' + i); check('business-page-' + i, labels[i]);
        if (i === 3) {
          await pressVisual('轻量连帽外套');
          const readback = await visual(['返回商品', 'OD-JK-101']);
          assert(readback.result[0].matches.length === 1 && readback.result[1].matches.length > 0, 'Product identity/detail readback');
          await shot('product-detail'); check('product-detail-opens', 'OD-JK-101');
          await pressVisual('返回商品');
          const list = await visual(['商品列表', '轻量连帽外套']);
          assert(list.result.every(g => g.matches.length === 1), 'Product list restored');
          check('product-detail-returns-to-list', true);
        }
      }
      await press('打开设置', 'button');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'button' && n.name === '返回业务页面'), 'settings');
      const workspace = await visual(['业务数据与同步', '来源与已应用游标']);
      assert(workspace.result.every(g => g.matches.length === 1), 'Local business workspace not observed');
      await shot('business-workspace'); check('local-business-workspace-loaded', true);
      // Close the new details section before observing the existing settings below it.
      // This is a fresh scoped target, never a retry after unknown input.
      await pressVisual('业务数据与同步');
      const settings = await visual(['目标与授权', '智能托管', '原生窗口授权'], 'exact');
      assert(settings.result.every(g => g.matches.length === 1), 'Settings content not observed');
      await shot('settings'); check('settings-opens', true);
      await press('返回业务页面', 'button');
      await wait(async () => nodes((await tree()).root).some(n => n.role === 'radioButton' && n.name === '订单' && n.selected === true), 'return prior page');
      check('settings-returns-to-prior-page', true);
    }
    await File.writeJSON(File.join(evidence, close ? 'close-result.json' : 'result.json'), { status: 'PASS', results,
      limitations: close ? [] : businessOnly ? ['Uses the fixed workspace file bridge, not an OS picker. Live CRM, native restore confirmation and image editing are not qualified by this UI gate.'] : strictAX
        ? ['Required nodes observed in this run; intermittent native subtree omissions are not qualified as fixed.']
        : ['WebKit AX omits some panel subtrees; product/settings content verified through scoped OCR. Native checkbox AX coverage is incomplete.'] });
  } catch (error) {
    await File.writeJSON(File.join(evidence, close ? 'close-result.json' : 'result.json'), { status: 'FAIL', results, error: String(error),
      code: error.code ?? null, operation: error.operation ?? null, actionState: error.actionState ?? null, strictAX });
    throw error;
  }
})
