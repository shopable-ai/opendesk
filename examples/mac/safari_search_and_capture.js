const wait = (ms) => page.waitFor(ms);

const queries = [
  'AI 大模型 最新进展',
  '杭州天气',
  '人民币汇率'
];

async function openSearch(keyword, index) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`;
  console.log(`Search[${index + 1}] keyword:`, keyword);
  console.log('Search URL:', url);

  await keyboard.combination('Meta', 'l');
  await wait(250);
  await keyboard.type(url);
  await keyboard.press('Enter');
  await wait(4200);

  const title = await page.title();
  const shot = `.runtime/temp/mac/safari_search_${index + 1}_${Date.now()}.png`;
  await page.screenshot({ path: shot });

  return { keyword, url, title, screenshot: shot, ts: new Date().toISOString() };
}

console.log('safari_search_and_capture start');
await page.openURLInApp('Safari', 'https://www.baidu.com');
await wait(3500);

const result = [];
for (let i = 0; i < queries.length; i++) {
  result.push(await openSearch(queries[i], i));
}

const reportPath = `.runtime/temp/mac/safari_search_report_${Date.now()}.json`;
await File.write(reportPath, JSON.stringify(result, null, 2));
console.log('Report saved:', reportPath);
console.log('safari_search_and_capture done');
