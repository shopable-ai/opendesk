const wait = (ms) => page.waitFor(ms);

function txt(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function short(v, max = 120) {
  const s = txt(v);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

async function getWechatWindow() {
  const list = await window.list();
  const wx = (list || [])
    .filter((w) => String(w.exeName || '').toLowerCase().includes('wechat'))
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
  if (!wx?.title) throw new Error('未找到微信窗口');
  return wx;
}

function isWechatWindow(win) {
  const exe = String(win?.exeName || '').toLowerCase();
  const title = String(win?.title || '').toLowerCase();
  return exe.includes('wechat') || title.includes('微信') || title.includes('wechat');
}

async function ensureWechatFront() {
  const wx = await getWechatWindow();
  await window.bringToTop(wx.title, wx.processId || wx.pid || 0);
  for (let i = 0; i < 6; i++) {
    await wait(350);
    const active = await window.getActiveWindow();
    const samePID =
      Number(active?.processID || active?.processId || active?.pid || 0) ===
      Number(wx?.processID || wx?.processId || wx?.pid || 0);
    if (isWechatWindow(active) || samePID) {
      return active || wx;
    }
    await window.bringToTop(wx.title, wx.processId || wx.pid || 0);
  }
  throw new Error(`微信窗口未能置前，当前前台窗口: ${JSON.stringify(await window.getActiveWindow())}`);
}

function layout(win) {
  const x = win?.x ?? 0;
  const y = win?.y ?? 0;
  const w = win?.width ?? 1000;
  const h = win?.height ?? 760;
  return {
    chatListX: Math.round(x + w * 0.14),
    firstChatY: Math.round(y + h * 0.22),
    chatRowHeight: Math.round(h * 0.085),
    paneLeft: Math.round(x + w * 0.30),
    paneRight: Math.round(x + w * 0.965),
    paneTop: Math.round(y + h * 0.15),
    paneBottom: Math.round(y + h * 0.84),
  };
}

async function readClipboard() {
  try {
    return await clipboard.paste();
  } catch (_) {
    return '';
  }
}

async function copyByDrag(ui) {
  await mouse.click(ui.paneRight - 24, ui.paneBottom - 14);
  await wait(120);
  await mouse.down({ button: 'left' });
  await mouse.move(ui.paneLeft + 16, ui.paneTop + 20, { steps: 30 });
  await mouse.up({ button: 'left' });
  await wait(180);
  await keyboard.combination('Meta', 'c');
  await wait(280);
  const t = await readClipboard();
  return { method: 'drag_select_copy', len: t.length, sample: short(t) };
}

async function copyBySelectAll(ui) {
  await mouse.click(ui.paneLeft + 60, ui.paneBottom - 30);
  await wait(120);
  await keyboard.combination('Meta', 'a');
  await wait(120);
  await keyboard.combination('Meta', 'c');
  await wait(280);
  const t = await readClipboard();
  return { method: 'cmd_a_copy', len: t.length, sample: short(t) };
}

async function copyByShiftPageSelect(ui) {
  await mouse.click(ui.paneRight - 24, ui.paneBottom - 14);
  await wait(120);
  await keyboard.down('Shift');
  await keyboard.press('Home');
  await keyboard.up('Shift');
  await wait(120);
  await keyboard.combination('Meta', 'c');
  await wait(280);
  const t = await readClipboard();
  return { method: 'shift_home_copy', len: t.length, sample: short(t) };
}

async function main() {
  console.log('wechat_probe_copy_strategies start');
  const active = await ensureWechatFront();
  const ui = layout(active);
  console.log('active window:', JSON.stringify(active));
  console.log('layout:', JSON.stringify(ui));

  // Probe first 3 chat rows for strategy effectiveness.
  const report = [];
  for (let row = 0; row < 3; row++) {
    await ensureWechatFront();
    const y = ui.firstChatY + ui.chatRowHeight * row;
    await mouse.click(ui.chatListX, y);
    await wait(700);

    const one = { row, tests: [] };
    one.tests.push(await copyByDrag(ui));
    one.tests.push(await copyBySelectAll(ui));
    one.tests.push(await copyByShiftPageSelect(ui));
    report.push(one);

    // Scroll one page up in current chat to compare stability.
    await mouse.move(ui.paneRight - 36, ui.paneTop + 60, { steps: 2 });
    await mouse.wheel({ deltaY: -900, steps: 8, delay: 15 });
    await wait(500);
  }

  const out = `.runtime/temp/mac/wechat_probe_copy_${Date.now()}.json`;
  await File.write(out, JSON.stringify(report, null, 2));
  console.log('probe report:', out);
  console.log('probe data:', JSON.stringify(report, null, 2));
  console.log('wechat_probe_copy_strategies done');
}

await main();
