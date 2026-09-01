const wait = (ms) => page.waitFor(ms);

const sites = [
  { name: 'Baidu', url: 'https://www.baidu.com', keywords: ['baidu', '百度'] },
  { name: 'QQ', url: 'https://www.qq.com', keywords: ['qq', '腾讯'] },
  { name: 'Bilibili', url: 'https://www.bilibili.com', keywords: ['bilibili', '哔哩哔哩'] },
  { name: 'CSDN', url: 'https://www.csdn.net', keywords: ['csdn'] }
];

function isSafariWindow(win) {
  const exe = String(win?.exeName || '').toLowerCase();
  const title = String(win?.title || '').toLowerCase();
  return exe.includes('safari') || title.includes('safari');
}

async function findSafariWindow() {
  const windows = await window.list();
  if (!Array.isArray(windows)) {
    return null;
  }
  return windows.find((w) => isSafariWindow(w)) || null;
}

async function bringSafariToFront(maxRetry = 5) {
  for (let i = 0; i < maxRetry; i++) {
    const safari = await findSafariWindow();
    if (safari?.title) {
      await window.bringToTop(safari.title, safari.processId || safari.pid || 0);
      await wait(500);
      return true;
    }
    await wait(300);
  }
  return false;
}

async function openByTyping(url) {
  await bringSafariToFront();
  await keyboard.combination('Meta', 'l');
  await wait(200);
  await keyboard.type(url);
  await keyboard.press('Enter');
}

console.log('safari_sites_healthcheck start');
await page.openURLInApp('Safari', 'about:blank');
await wait(2500);

const report = [];
for (let i = 0; i < sites.length; i++) {
  const site = sites[i];
  console.log(`Checking ${site.name}: ${site.url}`);

  await openByTyping(site.url);
  await wait(4500);

  await bringSafariToFront();
  const title = await page.title();
  const active = await window.getActiveWindow();
  const safariWindow = await findSafariWindow();
  const activeTitle = String(active?.title || '');
  const activeExe = String(active?.exeName || '').toLowerCase();
  const titleLower = activeTitle.toLowerCase();
  const pageTitleLower = String(title || '').toLowerCase();
  const keywordMatched = site.keywords.some((k) => {
    const kk = k.toLowerCase();
    return titleLower.includes(kk) || pageTitleLower.includes(kk);
  });
  const isSafariActive = activeExe.includes('safari');
  const isBlank = titleLower.trim() === '' || titleLower === 'about:blank';
  const fallbackMatched = !!safariWindow && keywordMatched;
  const ok = (isSafariActive && (keywordMatched || !isBlank)) || fallbackMatched;

  const shot = `.runtime/temp/mac/safari_health_${site.name.toLowerCase()}_${Date.now()}.png`;
  await page.screenshot({ path: shot });
  report.push({
    site: site.name,
    url: site.url,
    ok,
    title,
    activeTitle,
    activeExe: active?.exeName || '',
    keywordMatched,
    fallbackMatched,
    activeWindow: active,
    screenshot: shot,
    ts: new Date().toISOString()
  });

  console.log(`Result ${site.name}:`, ok ? 'PASS' : 'CHECK_MANUALLY');
}

const reportPath = `.runtime/temp/mac/safari_sites_healthcheck_${Date.now()}.json`;
await File.write(reportPath, JSON.stringify(report, null, 2));
console.log('Healthcheck report saved:', reportPath);
console.log('safari_sites_healthcheck done');
