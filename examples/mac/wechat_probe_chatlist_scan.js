const wait = (ms) => page.waitFor(ms);

function s(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function sample(v, max = 80) {
  const t = s(v);
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

async function getWechat() {
  const list = await window.list();
  const wx = (list || [])
    .filter((w) => String(w.exeName || '').toLowerCase().includes('wechat'))
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
  if (!wx) throw new Error('wechat window not found');
  await window.bringToTop(wx.title, wx.processId || wx.pid || 0);
  await wait(400);
  return (await window.getActiveWindow()) || wx;
}

async function clip() {
  try {
    return await clipboard.paste();
  } catch (_) {
    return '';
  }
}

async function readRowByVisionOCR(imagePath) {
  try {
    const res = await Vision.runOCR({
      imagePath,
      includeRaw: false,
    });
    const lines = Array.isArray(res?.lines) ? res.lines : [];
    const text = lines
      .map((line) => s(line?.text))
      .filter(Boolean)
      .join(' ');
    return text;
  } catch (_) {
    return '';
  }
}

async function readRowByLocalOCR(imagePath) {
  try {
    return s(await OCR.extractText(imagePath, 'chi_sim+eng'));
  } catch (_) {
    return '';
  }
}

async function readRowText(imagePath) {
  const byVision = await readRowByVisionOCR(imagePath);
  if (byVision) return { text: byVision, source: 'vision' };

  const byLocal = await readRowByLocalOCR(imagePath);
  if (byLocal) return { text: byLocal, source: 'ocr' };

  return { text: '', source: 'none' };
}

async function main() {
  console.log('wechat_probe_chatlist_scan start');
  const win = await getWechat();
  const x = win.x || 0;
  const y = win.y || 0;
  const w = win.width || 1000;
  const h = win.height || 760;

  const scanX = Math.round(x + w * 0.15);
  const listX = Math.round(x + w * 0.07);
  const listWidth = Math.max(160, Math.round(w * 0.22));
  const topY = Math.round(y + h * 0.15);
  const bottomY = Math.round(y + h * 0.90);
  const step = Math.max(28, Math.round(h * 0.04));
  const runStamp = Date.now();

  const rows = [];
  for (let yy = topY; yy <= bottomY; yy += step) {
    const clipPath = `.runtime/temp/mac/wechat_probe_chatlist_row_${runStamp}_${yy}.png`;
    await page.screenshot({
      path: clipPath,
      clip: {
        x: listX,
        y: Math.max(y, yy - 12),
        width: listWidth,
        height: 28,
      },
    });
    const fromOCR = await readRowText(clipPath);

    try {
      clipboard.clear();
    } catch (_) {}
    await wait(80);

    await mouse.click(scanX, yy);
    await wait(220);
    await keyboard.combination('Meta', 'c');
    await wait(220);
    const clipboardText = s(await clip());
    const finalText = fromOCR.text || clipboardText;
    const source = fromOCR.text ? fromOCR.source : clipboardText ? 'clipboard' : 'none';

    rows.push({
      y: yy,
      len: finalText.length,
      sample: sample(finalText),
      source,
      clip: clipPath,
    });
  }

  const out = `.runtime/temp/mac/wechat_probe_chatlist_scan_${Date.now()}.json`;
  await File.write(
    out,
    JSON.stringify(
      {
        win,
        scanX,
        listX,
        listWidth,
        topY,
        bottomY,
        step,
        rows,
      },
      null,
      2
    )
  );
  console.log('scan report:', out);
  console.log(JSON.stringify(rows, null, 2));
  console.log('wechat_probe_chatlist_scan done');
}

await main();
