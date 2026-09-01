const wait = (ms) => page.waitFor(ms);

const CONFIG = {
  targetChatName: '知乎运营 自己',
  expectedIncomingText: '今天星期几？多少号？',
  replyMessage: `今天星期一，今天是2026年3月16号。`,
  useClipboardForInput: true,
  regionReportPath: '.runtime/temp/mac/wechat_region_map_latest.json',
  maxReportAgeMs: 10 * 60 * 1000,
  visionProfile: {
    provider: 'local',
    language: 'ch',
    minConfidence: 0.0,
    timeoutMs: 15000,
  },
};

function normalizeText(v) {
  return String(v || '').replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}

function compactText(v) {
  return normalizeText(v).replace(/\s+/g, '');
}

async function getWechatWindow() {
  const list = await window.list();
  const wx = (list || [])
    .filter((w) => {
      const exe = String(w?.exeName || '').toLowerCase();
      const title = String(w?.title || '').toLowerCase();
      return exe.includes('wechat') || title.includes('微信') || title.includes('wechat');
    })
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
  if (!wx?.title) {
    throw new Error('未找到微信窗口，请先打开并登录微信桌面版');
  }
  return wx;
}

async function focusWechat() {
  const wx = await getWechatWindow();
  await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
  await wait(500);
  let active = await window.getActiveWindow();
  if ((active?.width || 0) < 900 || (active?.height || 0) < 680) {
    await window.setWindowBounds(wx.title, 80, 60, 1280, 860);
    await wait(700);
    active = await window.getActiveWindow();
  }
  return active || wx;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label} 解析失败: ${err && err.message ? err.message : String(err)}`);
  }
}

function sameWindow(a, b) {
  return (
    Number(a?.x || 0) === Number(b?.x || 0) &&
    Number(a?.y || 0) === Number(b?.y || 0) &&
    Number(a?.width || 0) === Number(b?.width || 0) &&
    Number(a?.height || 0) === Number(b?.height || 0)
  );
}

function findRegion(report, id) {
  return (report?.regions || []).find((item) => item.id === id);
}

function findTargetRow(report, targetChatName) {
  const target = compactText(targetChatName);
  return (report?.chatList?.rows || []).find((row) => compactText(row?.compactText || row?.text || '').includes(target));
}

async function captureWindowRegion(win, box, label) {
  const path = `.runtime/temp/mac/${label}_${Date.now()}.png`;
  const image = await page.screenshot({
    path,
    target: 'screen',
    clip: {
      x: win.x + Number(box?.x || 0),
      y: win.y + Number(box?.y || 0),
      width: Number(box?.width || 1),
      height: Number(box?.height || 1),
    },
  });
  return { path, image };
}

async function captureWholeWindow(win, label) {
  const path = `.runtime/temp/mac/${label}_${Date.now()}.png`;
  const image = await page.screenshot({
    path,
    target: 'screen',
    clip: {
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height,
    },
  });
  return { path, image };
}

async function verifyContainsText(imageBase64, expectedText) {
  if (!expectedText) {
    return { ok: true, text: '' };
  }
  const ocr = await Vision.runOCR({
    visionProfile: CONFIG.visionProfile,
    image: imageBase64,
  });
  const merged = normalizeText(ocr?.text || '');
  return {
    ok: merged.includes(normalizeText(expectedText)),
    text: merged,
  };
}

async function verifyContainsCompactText(imageBase64, expectedText) {
  const ocr = await Vision.runOCR({
    visionProfile: CONFIG.visionProfile,
    image: imageBase64,
  });
  const merged = compactText(ocr?.text || '');
  return {
    ok: merged.includes(compactText(expectedText)),
    text: normalizeText(ocr?.text || ''),
  };
}

async function inputMessage(message) {
  if (CONFIG.useClipboardForInput) {
    await clipboard.copy(message);
    await wait(120);
    await keyboard.combination('Meta', 'v');
    return 'clipboard';
  }

  await keyboard.type(message);
  return 'keyboardType';
}

async function loadLatestRegionReport(win) {
  const raw = File.read(CONFIG.regionReportPath);
  if (!raw) {
    throw new Error(`缺少区域分析结果: ${CONFIG.regionReportPath}，请先运行 examples/mac/wechat_region_map.js`);
  }
  const report = parseJson(raw, CONFIG.regionReportPath);
  const ts = new Date(report?.timestamp || '').getTime();
  if (!ts || Date.now() - ts > CONFIG.maxReportAgeMs) {
    throw new Error(`区域分析结果过期，请重新运行 examples/mac/wechat_region_map.js`);
  }
  if (!sameWindow(report?.window, win)) {
    throw new Error(`区域分析结果与当前微信窗口尺寸不匹配，请重新运行 examples/mac/wechat_region_map.js`);
  }
  return report;
}

async function main() {
  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: 'all',
    strict: true,
  });

  const win = await focusWechat();
  const report = await loadLatestRegionReport(win);
  const row = findTargetRow(report, CONFIG.targetChatName);
  if (!row?.bbox) {
    throw new Error(`区域分析结果中未找到目标会话: ${CONFIG.targetChatName}`);
  }

  const messageRegion = findRegion(report, 'message_list');
  const headerRegion = findRegion(report, 'chat_header');
  const inputRegion = findRegion(report, 'input_area');
  if (!messageRegion?.bbox || !headerRegion?.bbox || !inputRegion?.bbox) {
    throw new Error('区域分析结果缺少 chat_header / message_list / input_area');
  }

  const rowCenterX = win.x + row.bbox.x + Math.round(Math.min(120, row.bbox.width * 0.30));
  const rowCenterY = win.y + row.bbox.y + Math.round(row.bbox.height / 2);
  await mouse.click(rowCenterX, rowCenterY);
  await wait(700);

  const headerShot = await captureWindowRegion(win, headerRegion.bbox, 'wechat_chat_header');
  const headerCheck = await verifyContainsCompactText(headerShot.image, CONFIG.targetChatName);

  const selectedWindow = await captureWholeWindow(win, 'wechat_selected_window');
  const incomingCheck = await verifyContainsText(selectedWindow.image, CONFIG.expectedIncomingText);
  const incomingSoftOk = incomingCheck.ok;

  const inputX = win.x + inputRegion.bbox.x + Math.round(inputRegion.bbox.width * 0.60);
  const inputY = win.y + inputRegion.bbox.y + Math.round(inputRegion.bbox.height * 0.72);
  await mouse.click(inputX, inputY);
  await wait(200);

  const inputMode = await inputMessage(CONFIG.replyMessage);
  await wait(500);

  const pastedShot = await captureWindowRegion(win, inputRegion.bbox, 'wechat_input_area');
  const pastedCheck = await verifyContainsText(pastedShot.image, CONFIG.replyMessage);
  if (!pastedCheck.ok) {
    throw new Error(`输入框校验失败，未识别到待发送文本。\nOCR: ${pastedCheck.text}`);
  }

  await keyboard.press('Enter');
  await wait(500);
  const sentShot = await page.screenshot({
    path: `.runtime/temp/mac/wechat_structured_sent_${Date.now()}.png`,
    target: 'screen',
    clip: {
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height,
    },
  });

  const output = {
    timestamp: new Date().toISOString(),
    config: CONFIG,
    window: win,
    regionReportPath: CONFIG.regionReportPath,
    row,
    inputMode,
    headerCheck,
    selectedWindow,
    incomingCheck,
    incomingSoftOk,
    pastedCheck,
    sentShot,
  };
  const reportPath = `.runtime/temp/mac/wechat_structured_send_${Date.now()}.json`;
  await File.write(reportPath, JSON.stringify(output, null, 2));
  console.log('report:', reportPath);
}

await main();
