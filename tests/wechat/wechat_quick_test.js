/**
 * Quick WeChat Layout Test
 *
 * This script quickly tests the layout improvement on WeChat
 * by comparing median vs mean mode.
 */

const wait = (ms) => page.waitFor(ms);

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

async function captureWindow(win, path) {
  await page.screenshot({
    path,
    target: 'screen',
    clip: { x: win.x, y: win.y, width: win.width, height: win.height },
  });
  return path;
}

async function analyzeWithMode(imagePath, mode) {
  const imageBase64 = await ImageColor.loadBase64(imagePath);
  const layout = await ImageColor.analyzeLayout(imageBase64, {
    cellSize: 10,
    quantize: 16,
    tolerance: 32,
    minRegionArea: 6,
    cellColorMode: mode,
    boundarySpanWidth: mode === 'median' ? 3 : 1,
  });
  return layout;
}

function analyzeSeparators(layout) {
  const vertical = layout.separators?.vertical || [];
  const horizontal = layout.separators?.horizontal || [];
  const all = [...vertical, ...horizontal];

  const stats = {
    total: all.length,
    vertical: vertical.length,
    horizontal: horizontal.length,
    avgConfidence: all.length > 0 ? all.reduce((sum, sep) => sum + (sep.confidence || 0), 0) / all.length : 0,
    highConf: all.filter((sep) => (sep.confidence || 0) >= 0.55).length,
    mediumConf: all.filter((sep) => (sep.confidence || 0) >= 0.35 && (sep.confidence || 0) < 0.55).length,
    lowConf: all.filter((sep) => (sep.confidence || 0) < 0.35).length,
  };

  return stats;
}

async function main() {
  console.log('=== WeChat Layout Improvement Test ===\n');

  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: 'all',
    strict: true,
  });

  const win = await focusWechat();
  console.log(`✓ WeChat window: ${win.width}x${win.height}\n`);

  // Capture screenshot
  const sourceImage = '.runtime/temp/wechat_quick_test_source.png';
  await captureWindow(win, sourceImage);
  console.log(`✓ Screenshot saved: ${sourceImage}\n`);

  // Test with median mode (new)
  console.log('Testing with MEDIAN mode (new)...');
  const medianLayout = await analyzeWithMode(sourceImage, 'median');
  const medianStats = analyzeSeparators(medianLayout);
  console.log(`  Separators: ${medianStats.total} (${medianStats.vertical}V + ${medianStats.horizontal}H)`);
  console.log(`  Avg confidence: ${medianStats.avgConfidence.toFixed(3)}`);
  console.log(`  High (≥0.55): ${medianStats.highConf}, Medium (0.35-0.55): ${medianStats.mediumConf}, Low (<0.35): ${medianStats.lowConf}\n`);

  // Test with mean mode (old)
  console.log('Testing with MEAN mode (old)...');
  const meanLayout = await analyzeWithMode(sourceImage, 'mean');
  const meanStats = analyzeSeparators(meanLayout);
  console.log(`  Separators: ${meanStats.total} (${meanStats.vertical}V + ${meanStats.horizontal}H)`);
  console.log(`  Avg confidence: ${meanStats.avgConfidence.toFixed(3)}`);
  console.log(`  High (≥0.55): ${meanStats.highConf}, Medium (0.35-0.55): ${meanStats.mediumConf}, Low (<0.35): ${meanStats.lowConf}\n`);

  // Compare
  console.log('=== Comparison ===');
  const confDelta = medianStats.avgConfidence - meanStats.avgConfidence;
  const highConfDelta = medianStats.highConf - meanStats.highConf;
  console.log(`Confidence improvement: ${confDelta >= 0 ? '+' : ''}${confDelta.toFixed(3)} (${((confDelta / meanStats.avgConfidence) * 100).toFixed(1)}%)`);
  console.log(`High-confidence separators: ${highConfDelta >= 0 ? '+' : ''}${highConfDelta}`);

  if (confDelta > 0) {
    console.log(`\n✅ MEDIAN mode shows improvement!`);
  } else if (confDelta < 0) {
    console.log(`\n⚠️  MEDIAN mode shows regression`);
  } else {
    console.log(`\n➖ No significant difference`);
  }

  // Annotate both
  const medianAnnotated = '.runtime/temp/wechat_quick_test_median.png';
  const meanAnnotated = '.runtime/temp/wechat_quick_test_mean.png';

  const imageBase64 = await ImageColor.loadBase64(sourceImage);
  await Vision.annotateRegions({
    image: imageBase64,
    title: 'WeChat Layout (MEDIAN mode)',
    outputPath: medianAnnotated,
    separators: medianLayout.separators,
    regions: medianLayout.regions || [],
  });
  console.log(`\n✓ Median annotated: ${medianAnnotated}`);

  await Vision.annotateRegions({
    image: imageBase64,
    title: 'WeChat Layout (MEAN mode)',
    outputPath: meanAnnotated,
    separators: meanLayout.separators,
    regions: meanLayout.regions || [],
  });
  console.log(`✓ Mean annotated: ${meanAnnotated}`);

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    window: win,
    median: { stats: medianStats, layout: medianLayout },
    mean: { stats: meanStats, layout: meanLayout },
    comparison: {
      confidenceDelta: confDelta,
      highConfidenceDelta: highConfDelta,
      improvement: confDelta > 0,
    },
  };

  const reportPath = '.runtime/temp/wechat_quick_test_report.json';
  await File.write(reportPath, JSON.stringify(report, null, 2));
  console.log(`✓ Report saved: ${reportPath}`);

  console.log(`\n✅ Test complete!`);
}

await main();
