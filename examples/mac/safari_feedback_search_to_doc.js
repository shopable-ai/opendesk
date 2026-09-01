const wait = (ms) => page.waitFor(ms);

const QUERY = '自动化测试';
const SEARCH_HOME = 'https://www.sogou.com';

function nowIso() {
  return new Date().toISOString();
}

function safeText(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function isSafariWindow(win) {
  const exe = safeText(win?.exeName).toLowerCase();
  const title = safeText(win?.title).toLowerCase();
  return exe.includes('safari') || title.includes('safari');
}

async function findSafariWindow() {
  const windows = await window.list();
  if (!Array.isArray(windows)) {
    return null;
  }
  return windows.find((w) => isSafariWindow(w)) || null;
}

async function bringSafariToFront(maxRetry = 6) {
  for (let i = 0; i < maxRetry; i++) {
    const safari = await findSafariWindow();
    if (safari?.title) {
      await window.bringToTop(safari.title, safari.processId || safari.pid || 0);
      await wait(450);
      return safari;
    }
    await wait(300);
  }
  return null;
}

function calcSogouSearchArea(activeWin) {
  const x = activeWin?.x ?? 0;
  const y = activeWin?.y ?? 0;
  const width = activeWin?.width ?? 1200;
  const height = activeWin?.height ?? 800;

  const inputX = Math.round(x + width * 0.50);
  const inputY = Math.round(y + height * 0.33);
  const buttonX = Math.round(x + width * 0.66);
  const buttonY = inputY;
  return { inputX, inputY, buttonX, buttonY };
}

async function performVisualSearch(query) {
  console.log(`[FLOW] Open search homepage: ${SEARCH_HOME}`);
  await page.openURLInApp('Safari', SEARCH_HOME);
  await wait(3600);

  const safari = await bringSafariToFront();
  if (!safari?.title) {
    throw new Error('Safari window not found');
  }

  // Standardize window geometry for more stable click coordinates.
  await window.maximize(safari.title);
  await wait(900);

  const active = await window.getActiveWindow();
  const area = calcSogouSearchArea(active);
  console.log(
    `[FLOW] Search box click @ (${area.inputX},${area.inputY}), button click @ (${area.buttonX},${area.buttonY})`
  );

  await mouse.click(area.inputX, area.inputY, { clickCount: 2 });
  await wait(180);
  await keyboard.combination('Meta', 'a');
  await wait(120);
  await keyboard.type(query);
  await wait(120);

  // Trigger a real "click search" interaction on page button.
  await mouse.click(area.buttonX, area.buttonY);
  await wait(4800);

  const pageTitle = await page.title();
  const screenshot = `.runtime/temp/mac/safari_feedback_search_${Date.now()}.png`;
  await page.screenshot({ path: screenshot });

  console.log(`[FLOW] page title after search: ${pageTitle}`);
  console.log(`[FLOW] screenshot: ${screenshot}`);

  return {
    pageTitle,
    screenshot,
    activeWindow: await window.getActiveWindow(),
  };
}

function normalizeHref(href) {
  const link = safeText(href);
  if (!link) return '';
  if (link.startsWith('http://') || link.startsWith('https://')) return link;
  if (link.startsWith('/')) return `https://www.sogou.com${link}`;
  return link;
}

async function fetchTop3ByQuery(query) {
  const url = `https://www.sogou.com/web?query=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36',
    },
  });

  const html = String(response?.data || '');
  const $ = cheerio.load(html);
  const out = [];
  const seen = {};

  $('.vrwrap h3.vr-title a').each((_, el) => {
    if (out.length >= 3) return;
    const title = safeText($(el).text());
    const href = normalizeHref($(el).attr('href'));
    if (!title || !href) return;
    const key = `${title}::${href}`;
    if (seen[key]) return;
    seen[key] = true;
    out.push({ title, href });
  });

  if (out.length === 0) {
    throw new Error('No searchable items extracted from Sogou result HTML');
  }

  return {
    fetchUrl: url,
    top3: out.slice(0, 3),
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push('# Safari 搜索反馈测试报告');
  lines.push('');
  lines.push(`- 执行时间: ${report.timestamp}`);
  lines.push(`- 查询词: ${report.query}`);
  lines.push(`- 页面标题: ${report.pageTitle}`);
  lines.push(`- 结果截图: ${report.screenshot}`);
  lines.push(`- 抓取来源: ${report.fetchUrl}`);
  lines.push('');
  lines.push('## 搜索结果前三条');
  lines.push('');

  report.top3.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.title}`);
    lines.push(`   ${item.href}`);
  });

  lines.push('');
  lines.push('## 活动窗口');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.activeWindow, null, 2));
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  console.log('safari_feedback_search_to_doc start');
  console.log(`query: ${QUERY}`);

  const visual = await performVisualSearch(QUERY);
  const extracted = await fetchTop3ByQuery(QUERY);

  const report = {
    timestamp: nowIso(),
    query: QUERY,
    pageTitle: visual.pageTitle,
    screenshot: visual.screenshot,
    fetchUrl: extracted.fetchUrl,
    top3: extracted.top3,
    activeWindow: visual.activeWindow,
  };

  const stamp = Date.now();
  const jsonPath = `.runtime/temp/mac/safari_feedback_search_${stamp}.json`;
  const mdPath = `.runtime/temp/mac/safari_feedback_search_${stamp}.md`;
  const latestPath = '.runtime/temp/mac/safari_feedback_search_latest.md';
  const historyPath = '.runtime/temp/mac/safari_feedback_search_history.jsonl';

  await File.write(jsonPath, JSON.stringify(report, null, 2));
  await File.write(mdPath, toMarkdown(report));
  await File.write(latestPath, toMarkdown(report));
  await File.append(historyPath, `${JSON.stringify(report)}\n`);

  console.log(`JSON report saved: ${jsonPath}`);
  console.log(`Markdown report saved: ${mdPath}`);
  console.log(`Latest report updated: ${latestPath}`);
  console.log(`History appended: ${historyPath}`);
  console.log('Top3 results:', JSON.stringify(report.top3, null, 2));
  console.log('safari_feedback_search_to_doc done');
}

await main();
