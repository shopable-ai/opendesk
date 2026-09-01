console.log('macOS window smoke test start');

const activeWindow = await window.getActiveWindow();
console.log('activeWindow:', JSON.stringify(activeWindow, null, 2));
const activeTitle = activeWindow?.title || activeWindow?.Title || '';
const activePid = activeWindow?.processId || activeWindow?.pid || activeWindow?.ProcessID || 0;

const title = await window.title();
console.log('title():', title);

const content = await window.content();
console.log('content():', content);

const windows = await window.list();
console.log('window count:', windows.length);

if (activeTitle) {
  const gotTitle = await window.getTitle(activeTitle);
  console.log('getTitle(active.title):', gotTitle);

  await window.bringToTop(activeTitle, activePid);
  console.log('bringToTop(active.title) done');
}

try {
  if (activeTitle) {
    await window.setAlwaysOnTop(activeTitle, true);
  }
} catch (err) {
  console.log('setAlwaysOnTop result:', err && err.message ? err.message : String(err));
}

console.log('macOS window smoke test done');
