const wait = (ms) => page.waitFor(ms);

function clean(v) {
  return String(v || '').replace(/\r/g, '').trim();
}

function singleLine(v) {
  return clean(v).replace(/\s+/g, ' ');
}

function short(v, max = 180) {
  const s = singleLine(v);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function isWechatWindow(win) {
  const exe = String(win?.exeName || '').toLowerCase();
  const title = String(win?.title || '').toLowerCase();
  return exe.includes('wechat') || title.includes('微信') || title.includes('wechat');
}

async function getWechatWindow() {
  const list = await window.list();
  const wx = (list || [])
    .filter((w) => isWechatWindow(w))
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
  if (!wx?.title) {
    throw new Error('未找到微信窗口，请先打开并登录微信桌面版');
  }
  return wx;
}

async function ensureWechatFront(wx) {
  await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
  for (let i = 0; i < 8; i++) {
    await wait(350);
    const active = await window.getActiveWindow();
    if (isWechatWindow(active)) {
      return active;
    }
    await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
  }
  throw new Error(`微信窗口未能置前，当前前台窗口: ${JSON.stringify(await window.getActiveWindow())}`);
}

async function runOcrVariants(imagePath) {
  const langs = ['chi_sim+eng', 'chi_sim+chi_tra+eng', 'eng'];
  const variants = [];
  for (const lang of langs) {
    try {
      const text = clean(await OCR.extractText(imagePath, lang));
      variants.push({
        lang,
        ok: true,
        length: text.length,
        preview: short(text),
        text,
      });
    } catch (err) {
      variants.push({
        lang,
        ok: false,
        length: 0,
        preview: '',
        error: err && err.message ? err.message : String(err),
        text: '',
      });
    }
  }

  let best = variants[0] || null;
  for (const item of variants) {
    if (!best || (item.ok && item.length > (best.length || 0))) {
      best = item;
    }
  }
  return { variants, best };
}

async function main() {
  console.log('wechat_full_window_ocr start');
  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: 'all',
    strict: true,
  });

  const wx = await getWechatWindow();
  const active = await ensureWechatFront(wx);
  const ts = Date.now();

  // Capture by explicit absolute clip to avoid activeWindow mis-detection.
  // Keep one diagnostic capture with activeWindow target for troubleshooting.
  const activeTargetPath = `.runtime/temp/mac/wechat_full_window_active_target_${ts}.png`;
  await page.screenshot({ path: activeTargetPath, target: 'activeWindow' });

  const x = Math.max(0, Number(active?.x || wx?.x || 0));
  const y = Math.max(0, Number(active?.y || wx?.y || 0));
  const width = Math.max(1, Number(active?.width || wx?.width || 1));
  const height = Math.max(1, Number(active?.height || wx?.height || 1));

  const screenshotPath = `.runtime/temp/mac/wechat_full_window_${ts}.png`;
  await page.screenshot({
    path: screenshotPath,
    target: 'screen',
    clip: { x, y, width, height },
  });

  const ocr = await runOcrVariants(screenshotPath);
  const bestText = clean(ocr?.best?.text || '');
  const textPath = `.runtime/temp/mac/wechat_full_window_ocr_${ts}.txt`;
  const jsonPath = `.runtime/temp/mac/wechat_full_window_ocr_${ts}.json`;
  await File.write(textPath, bestText);

  const report = {
    timestamp: new Date().toISOString(),
    window: active,
    capture: {
      strategy: 'screen+absolute-clip',
      clip: { x, y, width, height },
      activeWindowDiagnosticShot: activeTargetPath,
    },
    screenshot: screenshotPath,
    best: {
      lang: ocr?.best?.lang || '',
      length: ocr?.best?.length || 0,
      preview: ocr?.best?.preview || '',
      textPath,
    },
    variants: ocr.variants.map((v) => ({
      lang: v.lang,
      ok: v.ok,
      length: v.length,
      preview: v.preview,
      error: v.error || '',
    })),
  };
  await File.write(jsonPath, JSON.stringify(report, null, 2));

  console.log('screenshot:', screenshotPath);
  console.log('ocr_text:', textPath);
  console.log('report:', jsonPath);
  console.log('best_lang:', report.best.lang, 'best_len:', report.best.length);
  console.log('wechat_full_window_ocr done');
}

await main();
