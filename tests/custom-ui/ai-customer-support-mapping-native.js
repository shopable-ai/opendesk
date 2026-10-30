// Called by the workspace native gate's optional scenario entry.
// All changes go through the real window. Exported files are read-only oracles.
(async function mappingNative(h) {
  const { assert, record, shot, press, pressAX, see, waitText, tree, exportBackup } = h;
  const mapped = data => [...data.records, ...data.overrides].filter(e =>
    e.storeId === 'store-demo' && e.sourceId === 'mapping-products' && e.kind === 'product' && e.id === 'mapped-mug-1');
  const cursor = data => data.cursors[JSON.stringify(['store-demo', 'mapping-products'])];
  const equals = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const disabled = async name => {
    const found = (await tree()).filter(n => n.role === 'button' && n.name === name);
    assert(found.length === 1 && found[0].enabled === false, 'Expected disabled control: ' + name);
  };

  await see('导出业务备份');
  const baseline = await exportBackup('mapping-baseline');
  assert(mapped(baseline.data).length === 0 && cursor(baseline.data) === undefined, 'Expected unused fictional mapping source');
  await press('数据处理方案', -1);
  await see('方案名称', 1);
  await shot('mapping-fields-380');
  await disabled('保存处理方案');
  await disabled('使用方案并预检');
  record('native-template-and-disabled-save-preflight', true);

  await press('试跑（不写入资料）');
  await waitText('试跑通过');
  await shot('mapping-trial-output');
  await see('导出业务备份');
  const trial = await exportBackup('mapping-after-trial');
  assert(equals(trial.data, baseline.data), 'Trial mutated business data');
  record('native-trial-does-not-write', true);

  await press('保存处理方案', -1);
  await waitText('已保存方案');
  await disabled('使用方案并预检');
  // Observe the saved source and its explicit off state before enabling it.
  const saved = (await tree()).filter(n => n.name === '启用方案 mapping-products' && n.role === 'button');
  assert(saved.length === 1 && saved[0].enabled !== false, 'Saved source was not disabled by default');
  await see('启用', 1);
  await shot('mapping-saved-off');
  await pressAX('启用方案 mapping-products');
  await waitText('已启用方案');
  await press('使用方案并预检', -1);
  await see('取消同步预检');
  await shot('mapping-preflight-before-cancel');
  await press('取消同步预检');
  await see('导出业务备份');
  const canceled = await exportBackup('mapping-after-cancel');
  assert(equals(canceled.data, baseline.data), 'Canceled preflight mutated business data or cursor');
  record('native-save-disabled-enable-preview-cancel', true);

  await press('使用方案并预检', -1);
  await see('确认应用同步页');
  await shot('mapping-preflight-before-apply');
  await press('确认应用同步页');
  await waitText('已应用同步页');
  await see('导出业务备份');
  const applied = await exportBackup('mapping-after-apply');
  const entities = mapped(applied.data);
  assert(entities.length === 1 && !entities[0].deleted && entities[0].data.name === '虚构星云马克杯', 'Wrong mapped product on disk');
  assert(entities[0].version === 1 && cursor(applied.data) === 'mapping-v1', 'Source version/cursor not applied');
  assert(applied.data.records.length === baseline.data.records.length + 1, 'Unexpected record changes');
  assert(equals(applied.data.overrides, baseline.data.overrides), 'Mapping changed local overrides');
  record('native-confirm-apply-independent-backup-oracle', { id:entities[0].id, sourceId:entities[0].sourceId, cursor:cursor(applied.data) });

  await see('停用', -1);
  await pressAX('停用方案 mapping-products');
  await waitText('已停用方案');
  await disabled('使用方案并预检');
  await see('导出业务备份');
  const stopped = await exportBackup('mapping-after-disable');
  assert(equals(stopped.data, applied.data), 'Disable removed applied business data');
  record('native-disable-preserves-applied-record', true);

  await pressAX('返回业务页面');
  await pressAX('商品', 'radioButton');
  await see('虚构星云马克杯');
  await shot('mapping-product-visible');
  record('native-product-visible-in-existing-tab', true);
})
