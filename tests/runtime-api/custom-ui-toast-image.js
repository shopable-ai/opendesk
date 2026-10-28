// From repository root, with a matching Runtime/native host and UI authorization:
// ./dist/opendesk -ui -script tests/runtime-api/custom-ui-toast-image.js -console-mode script
// Public contract/readback only; visual layout is a separate real-window check.
'use strict';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
async function invalid(invoke) {
  let error;
  try { await invoke(); } catch (caught) { error = caught; }
  assert(error && error.code === 'INVALID_SPEC', 'expected INVALID_SPEC, got ' + String(error));
}
const capabilities = ui.getCapabilities();
assert(capabilities.enabled && capabilities.available, 'matching enabled native UI host required');
const png = 'fixtures/toast-image/preview.png';
const jpeg = 'fixtures/toast-image/preview.jpg';
const position = { mode: 'anchor', horizontal: 'right', vertical: 'bottom', display: 'active', margin: 24 };
const handles = [];
const evidence = { platform: capabilities.platform, phases: [] };
async function create(options) {
  const handle = await ui.toast({ message: '本地图片预览', timeoutMs: 0, position, ...options });
  handles.push(handle);
  return handle;
}
function imagePath(state) { return state.toast && state.toast.image && state.toast.image.path; }
function separated(states) {
  const sorted = states.map(state => state.bounds).sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    assert(sorted[i].y >= sorted[i - 1].y + sorted[i - 1].height + 7, 'toast stack overlaps or lost spacing');
    assert(Math.abs(sorted[i].x + sorted[i].width - sorted[0].x - sorted[0].width) <= 1, 'right edges diverged: ' + JSON.stringify(sorted));
  }
}
try {
  for (const image of [undefined, '', false, [], {}, { path: null }, { path: 12 },
    { path: '' }, { path: png, extra: true }, { path: 'https://example.com/image.png' },
    { path: '../outside.png' }, { path: 'missing.png' }, { path: 'custom-ui-toast-image.js' },
    { path: 'fixtures/toast-image/truncated.png' }]) {
    await invalid(() => ui.toast({ message: 'invalid image', image }));
  }
  await invalid(() => ui.toast({ message: 'wire injection', imageAsset: {} }));
  const first = await create({ image: { path: png }, caption: '12×8 PNG / 原比例容纳' });
  const initial = await first.getState();
  assert(initial.visible && initial.nativeWindowId > 0 && imagePath(initial) === png, 'PNG creation/readback failed');
  assert(initial.notification.image.path === png && !initial.toast.imageAsset, 'compatibility state or private payload boundary failed');
  const updated = await first.update({ image: { path: jpeg }, message: 'JPEG 更新', caption: '同一句柄' });
  assert(updated.applied && imagePath(updated.state) === jpeg && updated.state.nativeWindowId === initial.nativeWindowId, 'JPEG in-place update failed');
  for (const image of [{ path: 'missing.png' }, { path: 'fixtures/toast-image/truncated.png' }, { path: jpeg, extra: true }]) {
    await invalid(() => first.update({ image, message: 'must not apply', timeoutMs: 1 }));
    const unchanged = await first.getState();
    assert(imagePath(unchanged) === jpeg && unchanged.toast.message === 'JPEG 更新' && unchanged.toast.timeoutMs === 0, 'failed update mutated state/timer');
  }
  const cleared = await first.update({ image: null, message: '无图布局', caption: '' });
  assert(cleared.applied && !imagePath(cleared.state) && cleared.state.nativeWindowId === initial.nativeWindowId, 'image:null failed');
  if (capabilities.platform === 'darwin') assert(cleared.state.bounds.height < initial.bounds.height, 'clear did not restore compact no-image layout');
  await first.update({ image: { path: png } });
  const second = await create({ message: '第二条纯文字' });
  const third = await create({ message: '第三条图片', image: { path: jpeg } });
  const three = await Promise.all([first, second, third].map(handle => handle.getState()));
  separated(three);
  evidence.phases.push({ phase: 'three', states: three });
  let busy;
  try { const extra = await create({ message: 'fourth' }); await extra.close(); } catch (error) { busy = error; }
  assert(busy && busy.code === 'UI_BUSY', 'execution bound exceeded');
  await first.update({ message: '较长的多行文字会改变原生实测高度。'.repeat(8), caption: '两行 caption。'.repeat(12), progress: { min: 0, max: 10, value: 3 } });
  const resized = await Promise.all([first, second, third].map(handle => handle.getState()));
  separated(resized);
  evidence.phases.push({ phase: 'resized', states: resized });
  await second.close();
  const afterClose = await Promise.all([first, third].map(handle => handle.getState()));
  separated(afterClose);
  assert(afterClose[1].bounds.y > resized[2].bounds.y, 'close did not compact upward stack toward bottom');
  evidence.phases.push({ phase: 'closed-middle', states: afterClose });
  // Reuse a vacant native slot and ensure the whole group is laid out again.
  const replacement = await create({ message: 'slot reuse', image: { path: png } });
  separated(await Promise.all([first, third, replacement].map(handle => handle.getState())));
  await replacement.close();
  // Different placements must not enter or displace this anchor group.
  const beforeOther = await third.getState();
  const other = await create({ message: 'independent top anchor', position: { ...position, vertical: 'top' } });
  const afterOther = await third.getState();
  assert(['x', 'y', 'width', 'height'].every(key => beforeOther.bounds[key] === afterOther.bounds[key]), 'unrelated anchor moved bottom group');
  await other.close();
  await first.update({ position: { ...position, vertical: 'top' } });
  const remaining = await third.getState();
  assert(remaining.bounds.y > afterClose[1].bounds.y, 'moving out did not compact old anchor group');
  await first.close(); await third.close();
  const legacy = await ui.notify({ message: '兼容别名图片', image: { path: png }, timeoutMs: 0 });
  handles.push(legacy);
  assert((await legacy.getState()).notification.image.path === png, 'legacy image support failed');
  const output = File.join(File.cwd(), '.runtime/tests/custom-ui-toast-image');
  await File.ensureDir(output);
  await File.writeJSON(File.join(output, 'evidence.json'), evidence);
  console.log('CUSTOM_UI_TOAST_IMAGE_PASS');
} finally {
  for (const handle of handles.reverse()) await handle.close();
}
