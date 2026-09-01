/**
 * Layout Improvement Verification Script
 *
 * This script tests the improved layout recognition on various desktop applications
 * to verify that separators are closer to color block boundaries rather than text edges.
 *
 * Usage: node examples/test_layout_improvement.js [app_name]
 *
 * Supported apps:
 * - wechat: WeChat desktop app
 * - vscode: Visual Studio Code
 * - chrome: Google Chrome browser
 * - safari: Safari browser
 * - finder: macOS Finder
 * - all: Test all supported apps
 */

const wait = (ms) => page.waitFor(ms);

const CONFIG = {
  outputDir: '.runtime/temp/layout_test',
  apps: {
    wechat: {
      name: 'WeChat',
      keywords: ['wechat', '微信'],
      minSize: { width: 900, height: 680 },
      targetSize: { width: 1280, height: 860 },
      layoutOptions: {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 6,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
      },
    },
    vscode: {
      name: 'Visual Studio Code',
      keywords: ['code', 'visual studio code', 'vscode'],
      minSize: { width: 1000, height: 700 },
      targetSize: { width: 1400, height: 900 },
      layoutOptions: {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 6,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
      },
    },
    chrome: {
      name: 'Google Chrome',
      keywords: ['chrome', 'google chrome'],
      minSize: { width: 1000, height: 700 },
      targetSize: { width: 1400, height: 900 },
      layoutOptions: {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 6,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
      },
    },
    safari: {
      name: 'Safari',
      keywords: ['safari'],
      minSize: { width: 1000, height: 700 },
      targetSize: { width: 1400, height: 900 },
      layoutOptions: {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 6,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
      },
    },
    finder: {
      name: 'Finder',
      keywords: ['finder'],
      minSize: { width: 800, height: 600 },
      targetSize: { width: 1200, height: 800 },
      layoutOptions: {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 6,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
      },
    },
  },
};

async function findWindow(appConfig) {
  const list = await window.list();
  const matches = (list || []).filter((w) => {
    const exe = String(w?.exeName || '').toLowerCase();
    const title = String(w?.title || '').toLowerCase();
    return appConfig.keywords.some((keyword) => exe.includes(keyword) || title.includes(keyword));
  });

  if (matches.length === 0) {
    return null;
  }

  // Sort by window size (largest first)
  matches.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
  return matches[0];
}

async function focusAndResizeWindow(win, appConfig) {
  await window.bringToTop(win.title, win.processId || win.processID || win.pid || 0);
  await wait(500);

  let active = await window.getActiveWindow();
  if (
    (active?.width || 0) < appConfig.minSize.width ||
    (active?.height || 0) < appConfig.minSize.height
  ) {
    await window.setWindowBounds(
      win.title,
      80,
      60,
      appConfig.targetSize.width,
      appConfig.targetSize.height
    );
    await wait(700);
    active = await window.getActiveWindow();
  }

  return active || win;
}

async function captureWindow(win, outputPath) {
  await page.screenshot({
    path: outputPath,
    target: 'screen',
    clip: {
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height,
    },
  });
  return outputPath;
}

async function analyzeLayout(imagePath, appConfig) {
  const imageBase64 = await ImageColor.loadBase64(imagePath);
  const layout = await ImageColor.analyzeLayout(imageBase64, appConfig.layoutOptions);
  return layout;
}

async function annotateLayout(imagePath, layout, outputPath, title) {
  const imageBase64 = await ImageColor.loadBase64(imagePath);
  await Vision.annotateRegions({
    image: imageBase64,
    title,
    outputPath,
    separators: layout.separators,
    regions: layout.regions || [],
  });
  return outputPath;
}

function analyzeSeparatorQuality(layout) {
  const vertical = layout.separators?.vertical || [];
  const horizontal = layout.separators?.horizontal || [];

  const stats = {
    verticalCount: vertical.length,
    horizontalCount: horizontal.length,
    avgVerticalConfidence: 0,
    avgHorizontalConfidence: 0,
    highConfidenceCount: 0,
    mediumConfidenceCount: 0,
    lowConfidenceCount: 0,
  };

  const allSeparators = [...vertical, ...horizontal];
  if (allSeparators.length === 0) {
    return stats;
  }

  const confidences = allSeparators.map((sep) => sep.confidence || 0);
  stats.avgVerticalConfidence =
    vertical.length > 0
      ? vertical.reduce((sum, sep) => sum + (sep.confidence || 0), 0) / vertical.length
      : 0;
  stats.avgHorizontalConfidence =
    horizontal.length > 0
      ? horizontal.reduce((sum, sep) => sum + (sep.confidence || 0), 0) / horizontal.length
      : 0;

  for (const conf of confidences) {
    if (conf >= 0.55) stats.highConfidenceCount++;
    else if (conf >= 0.35) stats.mediumConfidenceCount++;
    else stats.lowConfidenceCount++;
  }

  return stats;
}

async function testApp(appName) {
  const appConfig = CONFIG.apps[appName];
  if (!appConfig) {
    console.log(`Unknown app: ${appName}`);
    return null;
  }

  console.log(`\n=== Testing ${appConfig.name} ===`);

  // Find window
  const win = await findWindow(appConfig);
  if (!win) {
    console.log(`❌ ${appConfig.name} window not found. Please open the app first.`);
    return null;
  }

  console.log(`✓ Found window: ${win.title}`);

  // Focus and resize
  const activeWin = await focusAndResizeWindow(win, appConfig);
  console.log(`✓ Window focused and resized to ${activeWin.width}x${activeWin.height}`);

  // Capture screenshot
  const sourceImage = `${CONFIG.outputDir}/${appName}_source.png`;
  await captureWindow(activeWin, sourceImage);
  console.log(`✓ Screenshot saved: ${sourceImage}`);

  // Analyze layout
  console.log(`⏳ Analyzing layout...`);
  const layout = await analyzeLayout(sourceImage, appConfig);
  console.log(`✓ Layout analyzed`);

  // Analyze separator quality
  const stats = analyzeSeparatorQuality(layout);
  console.log(`\nSeparator Statistics:`);
  console.log(`  Vertical: ${stats.verticalCount} (avg confidence: ${stats.avgVerticalConfidence.toFixed(2)})`);
  console.log(`  Horizontal: ${stats.horizontalCount} (avg confidence: ${stats.avgHorizontalConfidence.toFixed(2)})`);
  console.log(`  High confidence (≥0.55): ${stats.highConfidenceCount}`);
  console.log(`  Medium confidence (0.35-0.55): ${stats.mediumConfidenceCount}`);
  console.log(`  Low confidence (<0.35): ${stats.lowConfidenceCount}`);

  // Annotate layout
  const annotatedImage = `${CONFIG.outputDir}/${appName}_annotated.png`;
  await annotateLayout(sourceImage, layout, annotatedImage, `${appConfig.name} Layout`);
  console.log(`✓ Annotated image saved: ${annotatedImage}`);

  // Save JSON report
  const reportPath = `${CONFIG.outputDir}/${appName}_report.json`;
  const report = {
    timestamp: new Date().toISOString(),
    app: appConfig.name,
    window: activeWin,
    layout,
    stats,
  };
  await File.write(reportPath, JSON.stringify(report, null, 2));
  console.log(`✓ Report saved: ${reportPath}`);

  return { appName, appConfig, stats, layout };
}

async function testAllApps() {
  const results = [];

  for (const appName of Object.keys(CONFIG.apps)) {
    try {
      const result = await testApp(appName);
      if (result) {
        results.push(result);
      }
      await wait(2000); // Wait between apps
    } catch (error) {
      console.log(`❌ Error testing ${appName}: ${error.message}`);
    }
  }

  // Summary
  console.log(`\n\n=== Summary ===`);
  console.log(`Tested ${results.length} apps:\n`);

  for (const result of results) {
    const { appName, stats } = result;
    const totalSeparators = stats.verticalCount + stats.horizontalCount;
    const avgConfidence =
      totalSeparators > 0
        ? (stats.avgVerticalConfidence * stats.verticalCount +
            stats.avgHorizontalConfidence * stats.horizontalCount) /
          totalSeparators
        : 0;

    console.log(`${appName}:`);
    console.log(`  Total separators: ${totalSeparators}`);
    console.log(`  Average confidence: ${avgConfidence.toFixed(2)}`);
    console.log(`  High confidence: ${stats.highConfidenceCount}`);
    console.log(``);
  }

  // Save summary
  const summaryPath = `${CONFIG.outputDir}/summary.json`;
  await File.write(
    summaryPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        results,
      },
      null,
      2
    )
  );
  console.log(`Summary saved: ${summaryPath}`);
}

async function main() {
  // Ensure permissions
  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: 'all',
    strict: true,
  });

  // Create output directory
  await File.mkdir(CONFIG.outputDir, { recursive: true });

  // Get app name from command line or test all
  const args = process.argv.slice(2);
  const appName = args[0] || 'all';

  if (appName === 'all') {
    await testAllApps();
  } else {
    await testApp(appName);
  }

  console.log(`\n✅ Done!`);
}

await main();
