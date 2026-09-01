/**
 * Continuous Layout Testing Script
 *
 * This script continuously tests layout recognition on various applications
 * to ensure the improvements work consistently over time.
 *
 * Usage: node examples/continuous_layout_test.js
 */

const wait = (ms) => page.waitFor(ms);

const CONFIG = {
  outputDir: '.runtime/temp/continuous_test',
  testInterval: 60000, // 1 minute between tests
  maxIterations: 100, // Maximum number of test iterations (0 = infinite)
  apps: ['wechat', 'vscode', 'chrome', 'safari', 'finder'],
  layoutOptions: {
    median: {
      cellSize: 10,
      quantize: 16,
      tolerance: 32,
      minRegionArea: 6,
      cellColorMode: 'median',
      boundarySpanWidth: 3,
    },
    mean: {
      cellSize: 10,
      quantize: 16,
      tolerance: 32,
      minRegionArea: 6,
      cellColorMode: 'mean',
      boundarySpanWidth: 1,
    },
  },
};

const APP_CONFIGS = {
  wechat: {
    name: 'WeChat',
    keywords: ['wechat', '微信'],
    minSize: { width: 900, height: 680 },
  },
  vscode: {
    name: 'Visual Studio Code',
    keywords: ['code', 'visual studio code', 'vscode'],
    minSize: { width: 1000, height: 700 },
  },
  chrome: {
    name: 'Google Chrome',
    keywords: ['chrome', 'google chrome'],
    minSize: { width: 1000, height: 700 },
  },
  safari: {
    name: 'Safari',
    keywords: ['safari'],
    minSize: { width: 1000, height: 700 },
  },
  finder: {
    name: 'Finder',
    keywords: ['finder'],
    minSize: { width: 800, height: 600 },
  },
};

async function findWindow(appConfig) {
  const list = await window.list();
  const matches = (list || []).filter((w) => {
    const exe = String(w?.exeName || '').toLowerCase();
    const title = String(w?.title || '').toLowerCase();
    return appConfig.keywords.some((keyword) => exe.includes(keyword) || title.includes(keyword));
  });

  if (matches.length === 0) return null;
  matches.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
  return matches[0];
}

async function captureAndAnalyze(win, appName, mode) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sourceImage = `${CONFIG.outputDir}/${appName}_${mode}_${timestamp}.png`;

  await page.screenshot({
    path: sourceImage,
    target: 'screen',
    clip: { x: win.x, y: win.y, width: win.width, height: win.height },
  });

  const imageBase64 = await ImageColor.loadBase64(sourceImage);
  const layout = await ImageColor.analyzeLayout(imageBase64, CONFIG.layoutOptions[mode]);

  return { sourceImage, layout };
}

function compareLayouts(medianLayout, meanLayout) {
  const medianSeps = [
    ...(medianLayout.separators?.vertical || []),
    ...(medianLayout.separators?.horizontal || []),
  ];
  const meanSeps = [
    ...(meanLayout.separators?.vertical || []),
    ...(meanLayout.separators?.horizontal || []),
  ];

  const medianAvgConf =
    medianSeps.length > 0
      ? medianSeps.reduce((sum, sep) => sum + (sep.confidence || 0), 0) / medianSeps.length
      : 0;
  const meanAvgConf =
    meanSeps.length > 0
      ? meanSeps.reduce((sum, sep) => sum + (sep.confidence || 0), 0) / meanSeps.length
      : 0;

  const medianHighConf = medianSeps.filter((sep) => (sep.confidence || 0) >= 0.55).length;
  const meanHighConf = meanSeps.filter((sep) => (sep.confidence || 0) >= 0.55).length;

  return {
    median: {
      count: medianSeps.length,
      avgConfidence: medianAvgConf,
      highConfidenceCount: medianHighConf,
    },
    mean: {
      count: meanSeps.length,
      avgConfidence: meanAvgConf,
      highConfidenceCount: meanHighConf,
    },
    improvement: {
      confidenceDelta: medianAvgConf - meanAvgConf,
      highConfDelta: medianHighConf - meanHighConf,
    },
  };
}

async function testAppIteration(appName, iteration) {
  const appConfig = APP_CONFIGS[appName];
  if (!appConfig) return null;

  const win = await findWindow(appConfig);
  if (!win) {
    console.log(`  ⚠️  ${appConfig.name} not found`);
    return null;
  }

  if (win.width < appConfig.minSize.width || win.height < appConfig.minSize.height) {
    console.log(`  ⚠️  ${appConfig.name} window too small`);
    return null;
  }

  console.log(`  Testing ${appConfig.name}...`);

  // Test with both modes
  const medianResult = await captureAndAnalyze(win, appName, 'median');
  const meanResult = await captureAndAnalyze(win, appName, 'mean');

  const comparison = compareLayouts(medianResult.layout, meanResult.layout);

  console.log(`    Median: ${comparison.median.count} seps, conf=${comparison.median.avgConfidence.toFixed(2)}, high=${comparison.median.highConfidenceCount}`);
  console.log(`    Mean:   ${comparison.mean.count} seps, conf=${comparison.mean.avgConfidence.toFixed(2)}, high=${comparison.mean.highConfidenceCount}`);
  console.log(`    Δ:      conf=${comparison.improvement.confidenceDelta >= 0 ? '+' : ''}${comparison.improvement.confidenceDelta.toFixed(2)}, high=${comparison.improvement.highConfDelta >= 0 ? '+' : ''}${comparison.improvement.highConfDelta}`);

  return {
    appName,
    iteration,
    timestamp: new Date().toISOString(),
    window: { width: win.width, height: win.height },
    comparison,
  };
}

async function runTestIteration(iteration) {
  console.log(`\n[Iteration ${iteration}] ${new Date().toLocaleString()}`);

  const results = [];
  for (const appName of CONFIG.apps) {
    try {
      const result = await testAppIteration(appName, iteration);
      if (result) {
        results.push(result);
      }
    } catch (error) {
      console.log(`  ❌ Error testing ${appName}: ${error.message}`);
    }
  }

  // Save iteration results
  const reportPath = `${CONFIG.outputDir}/iteration_${String(iteration).padStart(4, '0')}.json`;
  await File.write(
    reportPath,
    JSON.stringify(
      {
        iteration,
        timestamp: new Date().toISOString(),
        results,
      },
      null,
      2
    )
  );

  // Calculate summary
  const totalTests = results.length;
  const avgImprovementConf =
    totalTests > 0
      ? results.reduce((sum, r) => sum + r.comparison.improvement.confidenceDelta, 0) / totalTests
      : 0;
  const avgImprovementHighConf =
    totalTests > 0
      ? results.reduce((sum, r) => sum + r.comparison.improvement.highConfDelta, 0) / totalTests
      : 0;

  console.log(`\n  Summary: ${totalTests} apps tested`);
  console.log(`  Avg confidence improvement: ${avgImprovementConf >= 0 ? '+' : ''}${avgImprovementConf.toFixed(3)}`);
  console.log(`  Avg high-conf improvement: ${avgImprovementHighConf >= 0 ? '+' : ''}${avgImprovementHighConf.toFixed(1)}`);

  return { iteration, totalTests, avgImprovementConf, avgImprovementHighConf };
}

async function main() {
  console.log('=== Continuous Layout Testing ===');
  console.log(`Output directory: ${CONFIG.outputDir}`);
  console.log(`Test interval: ${CONFIG.testInterval / 1000}s`);
  console.log(`Max iterations: ${CONFIG.maxIterations || 'infinite'}`);
  console.log(`Apps: ${CONFIG.apps.join(', ')}`);

  // Ensure permissions
  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: 'all',
    strict: true,
  });

  // Create output directory
  await File.mkdir(CONFIG.outputDir, { recursive: true });

  const allResults = [];
  let iteration = 1;

  while (CONFIG.maxIterations === 0 || iteration <= CONFIG.maxIterations) {
    try {
      const result = await runTestIteration(iteration);
      allResults.push(result);

      // Save cumulative summary
      const summaryPath = `${CONFIG.outputDir}/summary.json`;
      await File.write(
        summaryPath,
        JSON.stringify(
          {
            startTime: allResults[0]?.timestamp || new Date().toISOString(),
            lastUpdate: new Date().toISOString(),
            totalIterations: allResults.length,
            results: allResults,
            overallAvgConfImprovement:
              allResults.reduce((sum, r) => sum + r.avgImprovementConf, 0) / allResults.length,
            overallAvgHighConfImprovement:
              allResults.reduce((sum, r) => sum + r.avgImprovementHighConf, 0) / allResults.length,
          },
          null,
          2
        )
      );

      iteration++;

      if (CONFIG.maxIterations === 0 || iteration <= CONFIG.maxIterations) {
        console.log(`\n⏳ Waiting ${CONFIG.testInterval / 1000}s until next iteration...`);
        await wait(CONFIG.testInterval);
      }
    } catch (error) {
      console.log(`\n❌ Error in iteration ${iteration}: ${error.message}`);
      await wait(5000); // Wait 5s before retrying
    }
  }

  console.log(`\n✅ Completed ${allResults.length} iterations`);
  console.log(`Overall average confidence improvement: ${(allResults.reduce((sum, r) => sum + r.avgImprovementConf, 0) / allResults.length).toFixed(3)}`);
  console.log(`Overall average high-conf improvement: ${(allResults.reduce((sum, r) => sum + r.avgImprovementHighConf, 0) / allResults.length).toFixed(1)}`);
}

await main();
