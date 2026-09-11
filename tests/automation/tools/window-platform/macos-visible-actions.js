const pause = async (ms) => {
  if (page && typeof page.waitFor === 'function') {
    await page.waitFor(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
};

console.log('macOS visible-actions test start');
console.log('3...'); await pause(1000);
console.log('2...'); await pause(1000);
console.log('1...'); await pause(1000);

const active = await window.getActiveWindow();
const title = active?.title || active?.Title || '';
const pid = active?.processId || active?.processID || active?.pid || active?.ProcessID || 0;

if (!title) {
  throw new Error('No active window title found');
}

console.log('Target window:', title, 'pid=', pid);
await window.bringToTop(title, pid);
await pause(800);

const current = await window.getWindowByTitle(title);
const x = current?.x ?? current?.X ?? 0;
const y = current?.y ?? current?.Y ?? 0;
const w = current?.width ?? current?.Width ?? 0;
const h = current?.height ?? current?.Height ?? 0;

console.log('Step 1: minimize window (visible)');
await window.minimize(title);
await pause(1500);

console.log('Step 2: restore window (visible)');
await window.restore(title);
await pause(1200);

console.log('Step 3: move window to offset (visible)');
await window.setWindowBounds(title, x + 160, y + 60, w, h);
await pause(1500);

console.log('Step 4: move window back');
await window.setWindowBounds(title, x, y, w, h);
await pause(1200);

const cx = Math.max(10, x + Math.floor(w / 2));
const cy = Math.max(10, y + Math.floor(h / 2));

console.log('Step 5: move mouse to center:', cx, cy);
await mouse.move(cx, cy, { steps: 20 });
await pause(700);

console.log('Step 6: click center (visible focus)');
await mouse.click(cx, cy, { button: 'left' });
await pause(700);

console.log('Step 7: keyboard input (no enter execution)');
await keyboard.type('VISIBLE_TEST_INPUT');
await pause(700);

console.log('macOS visible-actions test done');
