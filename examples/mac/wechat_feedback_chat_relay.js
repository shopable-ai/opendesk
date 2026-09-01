const wait = (ms) => page.waitFor(ms);

const CONFIG = {
  targetChatCount: 3,
  pagesPerChat: 2,
  maxRowsToTry: 8,
  selfChatName: '文件传输助手',
  fallbackSelfChatName: 'File Transfer Assistant',
  ignoreKeywords: ['文件传输助手', '微信团队', '服务通知'],
};

function nowIso() {
  return new Date().toISOString();
}

function text(v) {
  return String(v || '').replace(/\r/g, '').replace(/\t/g, ' ').trim();
}

function safeShort(v, maxLen = 600) {
  const s = text(v).replace(/\s+/g, ' ');
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
}

function isWeChatWindow(win) {
  const exe = String(win?.exeName || '').toLowerCase();
  const title = String(win?.title || '').toLowerCase();
  return exe.includes('wechat') || title === '微信' || title.includes('wechat');
}

async function findWeChatWindow() {
  const list = await window.list();
  if (!Array.isArray(list)) return null;
  const items = list.filter((w) => isWeChatWindow(w));
  if (items.length === 0) return null;
  return items.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
}

async function focusWeChat() {
  const wx = await findWeChatWindow();
  if (!wx?.title) {
    throw new Error('未找到微信窗口，请先打开并登录微信桌面版');
  }
  await window.bringToTop(wx.title, wx.processId || wx.pid || 0);
  await wait(600);
  await window.maximize(wx.title);
  await wait(900);
  let active = await window.getActiveWindow();
  if ((active?.width || 0) < 900 || (active?.height || 0) < 680) {
    await window.setWindowBounds(wx.title, 60, 60, 1280, 860);
    await wait(700);
    active = await window.getActiveWindow();
  }
  return active || wx;
}

function layout(win) {
  const x = win?.x ?? 0;
  const y = win?.y ?? 0;
  const width = win?.width ?? 1200;
  const height = win?.height ?? 900;
  return {
    x,
    y,
    width,
    height,
    chatListX: Math.round(x + width * 0.14),
    firstChatY: Math.round(y + height * 0.22),
    chatRowHeight: Math.round(height * 0.085),
    chatPaneLeft: Math.round(x + width * 0.30),
    chatPaneRight: Math.round(x + width * 0.965),
    chatPaneTop: Math.round(y + height * 0.15),
    chatPaneBottom: Math.round(y + height * 0.84),
    inputX: Math.round(x + width * 0.64),
    inputY: Math.round(y + height * 0.93),
    sendBtnX: Math.round(x + width * 0.95),
    sendBtnY: Math.round(y + height * 0.93),
  };
}

async function clickChatRow(ui, row) {
  const y = ui.firstChatY + ui.chatRowHeight * row;
  await mouse.click(ui.chatListX, y);
  await wait(800);
}

async function selectAndCopyVisibleChatText(ui) {
  let oldClipboard = '';
  try {
    oldClipboard = await clipboard.paste();
  } catch (_) {
    oldClipboard = '';
  }

  await mouse.click(ui.chatPaneRight - 30, ui.chatPaneBottom - 12);
  await wait(160);
  await mouse.down({ button: 'left' });
  await mouse.move(ui.chatPaneLeft + 18, ui.chatPaneTop + 24, { steps: 30 });
  await mouse.up({ button: 'left' });
  await wait(180);

  await keyboard.combination('Meta', 'c');
  await wait(260);
  let copied = '';
  try {
    copied = await clipboard.paste();
  } catch (_) {
    copied = '';
  }

  // Restore user clipboard to reduce side effects.
  if (oldClipboard) {
    clipboard.copy(oldClipboard);
  }

  return text(copied);
}

async function captureTwoPages(ui) {
  const pages = [];
  for (let i = 0; i < CONFIG.pagesPerChat; i++) {
    const content = await selectAndCopyVisibleChatText(ui);
    pages.push({
      page: i + 1,
      text: content,
      short: safeShort(content, 400),
      charCount: content.length,
    });

    // Scroll up to older messages.
    await mouse.move(ui.chatPaneRight - 40, ui.chatPaneTop + 60, { steps: 3 });
    await mouse.wheel({ deltaY: -1400, steps: 10, delay: 18 });
    await wait(700);
  }
  return pages;
}

function isIgnoredChat(chatPages) {
  const whole = chatPages.map((p) => p.text).join('\n').toLowerCase();
  return CONFIG.ignoreKeywords.some((k) => whole.includes(k.toLowerCase()));
}

function buildRelayMessage(collected) {
  const lines = [];
  lines.push(`[自动化回传] ${nowIso()}`);
  lines.push(`采集会话数: ${collected.length}`);
  lines.push('');

  collected.forEach((c, idx) => {
    lines.push(`【会话 ${idx + 1} | chatRow=${c.chatRow}】`);
    c.pages.forEach((p) => {
      lines.push(`- 第${p.page}页 (${p.charCount} chars): ${p.short || '(空)'}`);
    });
    lines.push('');
  });

  return lines.join('\n');
}

async function openSelfChatAndSend(ui, message) {
  await keyboard.combination('Meta', 'f');
  await wait(300);
  await keyboard.combination('Meta', 'a');
  await wait(120);
  await keyboard.type(CONFIG.selfChatName);
  await keyboard.press('Enter');
  await wait(900);

  // Fallback for English name when zh-cn alias is unavailable.
  const maybeActive = await window.getActiveWindow();
  if (!String(maybeActive?.title || '').includes('微信')) {
    await keyboard.combination('Meta', 'f');
    await wait(300);
    await keyboard.combination('Meta', 'a');
    await wait(120);
    await keyboard.type(CONFIG.fallbackSelfChatName);
    await keyboard.press('Enter');
    await wait(900);
  }

  await mouse.click(ui.inputX, ui.inputY);
  await wait(200);
  clipboard.copy(message);
  await wait(160);
  await keyboard.combination('Meta', 'v');
  await wait(200);
  await keyboard.press('Enter');
  await wait(350);

  // If Enter is configured as newline in user settings, click send button as fallback.
  await mouse.click(ui.sendBtnX, ui.sendBtnY);
  await wait(300);
}

async function main() {
  console.log('wechat_feedback_chat_relay start');
  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: 'all',
    strict: true,
  });
  const focused = await focusWeChat();
  const ui = layout(focused);
  console.log('wechat window:', JSON.stringify(focused));

  const collected = [];
  for (let row = 0; row < CONFIG.maxRowsToTry && collected.length < CONFIG.targetChatCount; row++) {
    console.log(`[STEP] collecting chat row ${row}`);
    await clickChatRow(ui, row);
    const pages = await captureTwoPages(ui);

    const hasEnoughText = pages.some((p) => p.charCount >= 20);
    if (!hasEnoughText) {
      console.log(`[SKIP] row ${row}, copied text too short`);
      continue;
    }

    if (isIgnoredChat(pages)) {
      console.log(`[SKIP] row ${row}, matched ignore keywords`);
      continue;
    }

    collected.push({
      chatRow: row,
      pages,
    });
  }

  if (collected.length === 0) {
    throw new Error('未采集到有效会话内容，请确认微信聊天窗口在前台且聊天中含文本消息');
  }

  const relayMessage = buildRelayMessage(collected);
  await openSelfChatAndSend(ui, relayMessage);

  const stamp = Date.now();
  const report = {
    timestamp: nowIso(),
    config: CONFIG,
    window: focused,
    collected,
    relayMessagePreview: safeShort(relayMessage, 1000),
    relayMessageLength: relayMessage.length,
    sentTo: CONFIG.selfChatName,
  };

  const jsonPath = `.runtime/temp/mac/wechat_feedback_chat_relay_${stamp}.json`;
  const mdPath = `.runtime/temp/mac/wechat_feedback_chat_relay_${stamp}.md`;
  const shot = `.runtime/temp/mac/wechat_feedback_chat_relay_${stamp}.png`;
  await page.screenshot({ path: shot });

  const md = [
    '# WeChat 系统级自动化反馈报告',
    '',
    `- 时间: ${report.timestamp}`,
    `- 发送目标: ${report.sentTo}`,
    `- 会话采集数量: ${report.collected.length}`,
    `- 截图: ${shot}`,
    '',
    '## 采集摘要',
    '',
    report.relayMessagePreview,
    '',
  ].join('\n');

  await File.write(jsonPath, JSON.stringify(report, null, 2));
  await File.write(mdPath, md);

  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${mdPath}`);
  console.log(`Screenshot: ${shot}`);
  console.log('wechat_feedback_chat_relay done');
}

await main();
