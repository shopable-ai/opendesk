const wait = (ms) => page.waitFor(ms);

const report = {
  timestamp: new Date().toISOString(),
  platform: 'darwin',
  checks: [],
  ready: false,
};

async function check(name, fn, required = true) {
  const item = { name, required, pass: false, detail: '' };
  try {
    const out = await fn();
    item.pass = !!out?.pass;
    item.detail = out?.detail || '';
  } catch (err) {
    item.pass = false;
    item.detail = err && err.message ? err.message : String(err);
  }
  report.checks.push(item);
  console.log(`[CHECK] ${name}: ${item.pass ? 'PASS' : 'FAIL'}${item.detail ? ' | ' + item.detail : ''}`);
}

function pickTitle(win) {
  return win?.title || win?.Title || '';
}

function isSafariWindow(win) {
  const exe = String(win?.exeName || '').toLowerCase();
  const title = String(win?.title || '').toLowerCase();
  return exe.includes('safari') || title.includes('safari');
}

async function findSafariWindow() {
  const list = await window.list();
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  return list.find((w) => isSafariWindow(w)) || null;
}

async function main() {
  console.log('remote_desktop_readiness start');
  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: 'all',
    strict: true,
  });

  await check('accessibility_window_list', async () => {
    const list = await window.list();
    const count = Array.isArray(list) ? list.length : 0;
    return { pass: count > 0, detail: `windowCount=${count}` };
  });

  await check('automation_safari_open', async () => {
    await page.openURLInApp('Safari', 'https://www.bilibili.com');
    await wait(2500);

    const safariWindow = await findSafariWindow();
    if (!safariWindow) {
      return { pass: false, detail: 'Safari window not found after launch' };
    }

    await window.bringToTop(
      safariWindow.title,
      safariWindow.processId || safariWindow.pid || 0
    );
    await wait(600);

    const active = await window.getActiveWindow();
    const activeTitle = pickTitle(active);
    const activeExe = String(active?.exeName || '').toLowerCase();
    const ok = activeExe.includes('safari') || activeTitle.toLowerCase().includes('safari');
    return {
      pass: ok,
      detail: `activeTitle=${activeTitle || '(empty)'}; activeExe=${active?.exeName || '(empty)'}`
    };
  });

  await check('automation_safari_hotkey_navigation', async () => {
    const safariWindow = await findSafariWindow();
    if (!safariWindow?.title) {
      return { pass: false, detail: 'Safari window not ready for hotkey navigation' };
    }

    await window.bringToTop(
      safariWindow.title,
      safariWindow.processId || safariWindow.pid || 0
    );
    await wait(300);

    await keyboard.combination('Meta', 'l');
    await wait(150);
    await keyboard.type('https://www.bilibili.com');
    await keyboard.press('Enter');
    await wait(1800);

    const active = await window.getActiveWindow();
    const activeTitle = pickTitle(active);
    const activeExe = String(active?.exeName || '').toLowerCase();
    const ok = activeExe.includes('safari') || activeTitle.toLowerCase().includes('safari');
    return {
      pass: ok,
      detail: `activeTitle=${activeTitle || '(empty)'}; activeExe=${active?.exeName || '(empty)'}`
    };
  });

  await check('screen_capture', async () => {
    const shot = `.runtime/temp/mac/rd_ready_${Date.now()}.png`;
    await page.screenshot({ path: shot });
    const ok = await File.exists(shot);
    return { pass: !!ok, detail: `screenshot=${shot}` };
  });

  await check('input_injection_mouse_move', async () => {
    const p1 = await mouse.getPos();
    const x1 = p1?.x ?? p1?.X ?? 0;
    const y1 = p1?.y ?? p1?.Y ?? 0;

    await mouse.move(x1 + 2, y1 + 2, { steps: 2 });
    await wait(120);
    const p2 = await mouse.getPos();
    const x2 = p2?.x ?? p2?.X ?? 0;
    const y2 = p2?.y ?? p2?.Y ?? 0;

    await mouse.move(x1, y1, { steps: 2 });
    const moved = Math.abs(x2 - x1) >= 1 || Math.abs(y2 - y1) >= 1;
    return { pass: moved, detail: `from=(${x1},${y1}) to=(${x2},${y2})` };
  });

  await check('window_control_bring_to_top', async () => {
    const active = await window.getActiveWindow();
    const title = pickTitle(active);
    if (!title) {
      return { pass: false, detail: 'no active title' };
    }
    await window.bringToTop(title, active?.processId || active?.processID || active?.pid || active?.ProcessID || 0);
    await wait(200);
    const currentTitle = await window.title();
    return { pass: !!currentTitle, detail: `active=${currentTitle}` };
  }, false);

  const requiredChecks = report.checks.filter((c) => c.required);
  report.ready = requiredChecks.every((c) => c.pass);

  const output = `.runtime/temp/mac/remote_desktop_readiness_${Date.now()}.json`;
  await File.write(output, JSON.stringify(report, null, 2));

  console.log('remote_desktop_readiness result:', report.ready ? 'READY' : 'NOT_READY');
  console.log('report:', output);
  console.log('remote_desktop_readiness done');
}

await main();
