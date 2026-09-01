const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log('macOS window demo start');

const active = await window.getActiveWindow();
const title = active?.title || active?.Title || '';
const pid = active?.processId || active?.processID || active?.pid || active?.ProcessID || 0;

console.log('active:', JSON.stringify(active, null, 2));
console.log('resolved title:', title);
console.log('resolved pid:', pid);

const all = await window.list();
console.log('window count:', all.length);

if (title) {
  await window.bringToTop(title, pid);
  console.log('bringToTop ok:', title);

  const t = await window.getTitle(title);
  console.log('getTitle ok:', t);

  const current = await window.getWindowByTitle(title);
  const x = current?.x ?? current?.X ?? 0;
  const y = current?.y ?? current?.Y ?? 0;
  const w = current?.width ?? current?.Width ?? 0;
  const h = current?.height ?? current?.Height ?? 0;

  // Move/resize to same bounds only (non-invasive validation)
  await window.setWindowBounds(title, x, y, w, h);
  await window.setWidth(title, w);
  await window.setHeight(title, h);
  console.log('bounds APIs ok');

  await window.minimize(title);
  console.log('minimize ok');
  await wait(600);
  await window.restore(title);
  console.log('restore ok');
}

try {
  if (title) {
    await window.setAlwaysOnTop(title, true);
  }
} catch (err) {
  console.log('setAlwaysOnTop (expected on macOS):', err && err.message ? err.message : String(err));
}

console.log('macOS window demo done');
