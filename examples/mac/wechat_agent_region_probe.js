const wait = (ms) => page.waitFor(ms);

function t(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function short(v, max = 120) {
  const s = t(v);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

async function getWechatWindow() {
  const list = await window.list();
  const wx = (list || [])
    .filter((w) => String(w.exeName || '').toLowerCase().includes('wechat'))
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
  if (!wx) {
    throw new Error('未找到微信窗口');
  }
  await window.bringToTop(wx.title, wx.processId || wx.pid || 0);
  await wait(450);
  return (await window.getActiveWindow()) || wx;
}

function buildRegions(win) {
  const x = win?.x ?? 0;
  const y = win?.y ?? 0;
  const w = win?.width ?? 1000;
  const h = win?.height ?? 760;

  const regions = [
    {
      name: 'friend_list',
      x: Math.round(x + w * 0.07),
      y: Math.round(y + h * 0.14),
      width: Math.round(w * 0.22),
      height: Math.round(h * 0.72),
    },
    {
      name: 'chat_display',
      x: Math.round(x + w * 0.30),
      y: Math.round(y + h * 0.14),
      width: Math.round(w * 0.66),
      height: Math.round(h * 0.60),
    },
    {
      name: 'input_area',
      x: Math.round(x + w * 0.30),
      y: Math.round(y + h * 0.75),
      width: Math.round(w * 0.66),
      height: Math.round(h * 0.20),
    },
  ];

  return regions;
}

async function ocrTry(path, lang) {
  try {
    const text = await OCR.extractText(path, lang);
    return text || '';
  } catch (err) {
    return `OCR_ERROR: ${err && err.message ? err.message : String(err)}`;
  }
}

async function main() {
  console.log('wechat_agent_region_probe start');
  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: 'all',
    strict: true,
  });
  const win = await getWechatWindow();
  const ts = Date.now();

  const fullPath = `.runtime/temp/mac/wechat_agent_full_${ts}.png`;
  await page.screenshot({ path: fullPath });

  const regions = buildRegions(win);
  const out = [];
  for (const r of regions) {
    const clipPath = `.runtime/temp/mac/wechat_agent_${r.name}_${ts}.png`;
    await page.screenshot({
      path: clipPath,
      clip: {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      },
    });

    const centerX = Math.round(r.x + r.width / 2);
    const centerY = Math.round(r.y + r.height / 2);
    const color = await Screen.pixel(centerX, centerY);
    const ocrText = await ocrTry(clipPath, 'chi_sim+eng');

    out.push({
      region: r,
      screenshot: clipPath,
      centerColor: color,
      ocrText,
      ocrLength: ocrText.length,
      ocrPreview: short(ocrText, 180),
    });
  }

  const reportPath = `.runtime/temp/mac/wechat_agent_region_probe_${ts}.json`;
  const report = {
    timestamp: new Date().toISOString(),
    workerType: 'wechat_agent_region_probe',
    window: win,
    screenshotPath: fullPath,
    fullScreenshot: fullPath,
    reportPath,
    regions: out,
    bridgeHints: {
      preferredScreenshotPath: fullPath,
      reportUsage: 'visionrun --mode=validate --real-report <reportPath> --source-image <golden-image>',
    },
  };
  await File.write(reportPath, JSON.stringify(report, null, 2));

  console.log('report:', reportPath);
  console.log(JSON.stringify(report, null, 2));
  console.log('wechat_agent_region_probe done');
}

await main();
