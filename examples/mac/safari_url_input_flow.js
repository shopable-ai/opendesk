const wait = (ms) => page.waitFor(ms);

async function bringSafariToFront() {
  const windows = await window.list();
  const safariWin = windows.find((w) => {
    const exe = (w.exeName || '').toLowerCase();
    return exe.includes('safari');
  });
  if (safariWin?.title) {
    await window.bringToTop(safariWin.title, safariWin.processId || safariWin.pid || 0);
    await wait(600);
  }
}

console.log('safari_url_input_flow start');
console.log('Launching Safari and opening Baidu...');
await page.openURLInApp('Safari', 'https://www.baidu.com');
await wait(3500);
await bringSafariToFront();

console.log('Typing URL in address bar: https://www.bilibili.com');
await keyboard.combination('Meta', 'l');
await wait(200);
await keyboard.type('https://www.bilibili.com');
await keyboard.press('Enter');
await wait(4500);

console.log('Typing URL in address bar: https://www.qq.com');
await keyboard.combination('Meta', 'l');
await wait(200);
await keyboard.type('https://www.qq.com');
await keyboard.press('Enter');
await wait(4500);

console.log('Scrolling page to verify mouse wheel automation...');
await mouse.wheel({ deltaY: 800, steps: 8, delay: 40 });
await wait(700);
await mouse.wheel({ deltaY: -400, steps: 4, delay: 40 });

const shot = `.runtime/tests/e2e/live/safari_url_input_flow_${Date.now()}.png`;
File.ensureDir('.runtime/tests/e2e/live');
await page.screenshot({ path: shot });
console.log('Screenshot saved:', shot);
console.log('safari_url_input_flow done');
