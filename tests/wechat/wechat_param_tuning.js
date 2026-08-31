/**
 * Parameter Tuning Test for WeChat
 *
 * This script tests different parameter combinations to find the optimal settings
 */

const wait = (ms) => page.waitFor(ms);

const PARAM_COMBINATIONS = [
  {
    name: 'median_span3',
    cellColorMode: 'median',
    boundarySpanWidth: 3,
    minSeparatorScore: 0.14,
  },
  {
    name: 'median_span2',
    cellColorMode: 'median',
    boundarySpanWidth: 2,
    minSeparatorScore: 0.14,
  },
  {
    name: 'median_span1',
    cellColorMode: 'median',
    boundarySpanWidth: 1,
    minSeparatorScore: 0.14,
  },
  {
    name: 'median_span3_low_threshold',
    cellColorMode: 'median',
    boundarySpanWidth: 3,
    minSeparatorScore: 0.08,
  },
  {
    name: 'median_span2_low_threshold',
    cellColorMode: 'median',
    boundarySpanWidth: 2,
    minSeparatorScore: 0.08,
  },
  {
    name: 'mean_baseline',
    cellColorMode: 'mean',
    boundarySpanWidth: 1,
    minSeparatorScore: 0.14,
  },
];

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
    throw new Error('未找到微信窗口');
  }
  return wx;
}

async function focusWechat() {
  const wx = await getWechatWindow();
  await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
  await wait(500);
  return await window.getActiveWindow() || wx;
}

async function testParams(imagePath, params) {
  const imageBase64 = await ImageColor.loadBase64(imagePath);
  const layout = await ImageColor.analyzeLayout(imageBase64, {
    cellSize: 10,
    quantize: 16,
    tolerance: 32,
    minRegionArea: 6,
    ...params,
  });

  const vertical = layout.separators?.vertical || [];
  const horizontal = layout.separators?.horizontal || [];
  const all = [...vertical, ...horizontal];

  return {
    total: all.length,
    vertical: vertical.length,
    horizontal: horizontal.length,
    avgConfidence: all.length > 0 ? all.reduce((sum, sep) => sum + (sep.confidence || 0), 0) / all.length : 0,
    highConf: all.filter((sep) => (sep.confidence || 0) >= 0.55).length,
    mediumConf: all.filter((sep) => (sep.confidence || 0) >= 0.35 && (sep.confidence || 0) < 0.55).length,
    lowConf: all.filter((sep) => (sep.confidence || 0) < 0.35).length,
    layout,
  };
}

async function main() {
  console.log('=== WeChat Parameter Tuning Test ===\n');

  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: 'all',
    strict: true,
  });

  const win = await focusWechat();
  console.log(`✓ WeChat window: ${win.width}x${win.height}\n`);

  // Capture screenshot once
  const sourceImage = '.runtime/temp/wechat_param_tuning_source.png';
  await page.screenshot({
    path: sourceImage,
    target: 'screen',
    clip: { x: win.x, y: win.y, width: win.width, height: win.height },
  });
  console.log(`✓ Screenshot saved\n`);

  // Test all parameter combinations
  const results = [];
  for (const params of PARAM_COMBINATIONS) {
    console.log(`Testing: ${params.name}...`);
    const result = await testParams(sourceImage, params);
    results.push({ params, result });
    console.log(`  Separators: ${result.total} (${result.vertical}V + ${result.horizontal}H)`);
    console.log(`  Avg confidence: ${result.avgConfidence.toFixed(3)}`);
    console.log(`  High/Med/Low: ${result.highConf}/${result.mediumConf}/${result.lowConf}\n`);
  }

  // Find best configuration
  const baseline = results.find((r) => r.params.name === 'mean_baseline');
  console.log('=== Comparison with Baseline (mean) ===\n');

  for (const { params, result } of results) {
    if (params.name === 'mean_baseline') continue;

    const confDelta = result.avgConfidence - baseline.result.avgConfidence;
    const highConfDelta = result.highConf - baseline.result.highConf;
    const totalDelta = result.total - baseline.result.total;

    console.log(`${params.name}:`);
    console.log(`  Confidence: ${confDelta >= 0 ? '+' : ''}${confDelta.toFixed(3)} (${((confDelta / baseline.result.avgConfidence) * 100).toFixed(1)}%)`);
    console.log(`  High-conf: ${highConfDelta >= 0 ? '+' : ''}${highConfDelta}`);
    console.log(`  Total seps: ${totalDelta >= 0 ? '+' : ''}${totalDelta}`);
    console.log('');
  }

  // Save report
  const reportPath = '.runtime/temp/wechat_param_tuning_report.json';
  await File.write(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        window: win,
        results,
      },
      null,
      2
    )
  );
  console.log(`✓ Report saved: ${reportPath}`);

  // Recommend best configuration
  const medianResults = results.filter((r) => r.params.cellColorMode === 'median');
  const best = medianResults.sort((a, b) => {
    // Prioritize: high confidence count > avg confidence > total separators
    if (b.result.highConf !== a.result.highConf) {
      return b.result.highConf - a.result.highConf;
    }
    if (Math.abs(b.result.avgConfidence - a.result.avgConfidence) > 0.01) {
      return b.result.avgConfidence - a.result.avgConfidence;
    }
    return Math.abs(b.result.total - baseline.result.total) - Math.abs(a.result.total - baseline.result.total);
  })[0];

  console.log(`\n✅ Recommended configuration: ${best.params.name}`);
  console.log(`   cellColorMode: "${best.params.cellColorMode}"`);
  console.log(`   boundarySpanWidth: ${best.params.boundarySpanWidth}`);
  console.log(`   minSeparatorScore: ${best.params.minSeparatorScore}`);
}

await main();
