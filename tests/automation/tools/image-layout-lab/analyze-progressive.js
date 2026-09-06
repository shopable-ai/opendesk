// Diagnostic tool, not a regression gate. Run from the repository root:
// ./dist/opendesk -script tests/automation/tools/image-layout-lab/analyze-progressive.js -console-mode script
// Generate the seven inputs with: go run ./tests/automation/tools/image-layout-lab all
// Counts/confidence describe the output; they do not establish accuracy.

const testImagesDir = './.runtime/tests/automation/image-layout';
const testLevels = [
  { name: 'level1_simple', description: 'Simple color blocks (no noise)' },
  { name: 'level2_borders', description: 'Color blocks with borders' },
  { name: 'level3_sparse_text', description: 'Sparse text (10% coverage)' },
  { name: 'level4_dense_text', description: 'Dense text (40% coverage)' },
  { name: 'level5_complex', description: 'Complex multi-region layout' },
  { name: 'level6_gradient', description: 'Gradient backgrounds' },
  { name: 'level7_mixed', description: 'Realistic mixed content' },
];

function summarize(result) {
  if (!result || !result.separators) throw new Error('Missing separator result');
  const vertical = result.separators.vertical || [];
  const horizontal = result.separators.horizontal || [];
  if (!Array.isArray(vertical) || !Array.isArray(horizontal)) {
    throw new Error('Separator results must be arrays');
  }
  const all = vertical.concat(horizontal);
  if (all.some(separator => !separator || !Number.isFinite(separator.confidence))) {
    throw new Error('Separator confidence must be finite');
  }
  return {
    vertical: vertical.length,
    horizontal: horizontal.length,
    total: all.length,
    avgConfidence: all.reduce((sum, separator) => sum + separator.confidence, 0) / (all.length || 1),
  };
}

function analyzeTestLevel(level) {
  const imagePath = `${testImagesDir}/${level.name}.png`;
  if (!File.exists(imagePath)) throw new Error('Missing input: ' + imagePath);
  const imageBase64 = ImageColor.loadBase64(imagePath);
  // Preserve the previous diagnostic parameters; this migration does not tune the algorithm.
  const median = summarize(ImageColor.analyzeLayout(imageBase64, {
    cellSize: 10, quantize: 16, tolerance: 32, minRegionArea: 4,
    minSeparatorScore: 0.08, cellColorMode: 'median', boundarySpanWidth: 3,
  }));
  const mean = summarize(ImageColor.analyzeLayout(imageBase64, {
    cellSize: 10, quantize: 16, tolerance: 32, minRegionArea: 4,
    minSeparatorScore: 0.14, cellColorMode: 'mean', boundarySpanWidth: 1,
  }));
  console.log(`${level.name}: median=${median.total}, mean=${mean.total} separators`);
  return { level: level.name, description: level.description, median, mean };
}

function main() {
  const results = [];
  const failures = [];
  for (const level of testLevels) {
    try {
      results.push(analyzeTestLevel(level));
    } catch (error) {
      failures.push({ level: level.name, error: String(error && error.message ? error.message : error) });
    }
  }
  const report = {
    kind: 'diagnostic',
    status: failures.length === 0 ? 'completed' : 'failed',
    accuracyVerified: false,
    attempted: testLevels.length,
    analyzed: results.length,
    failed: failures.length,
    averageSeparators: results.length === 0 ? null : {
      median: results.reduce((sum, result) => sum + result.median.total, 0) / results.length,
      mean: results.reduce((sum, result) => sum + result.mean.total, 0) / results.length,
    },
    results,
    failures,
  };
  const reportPath = File.join(Execution.artifactDir, 'progressive-analysis.json');
  File.write(reportPath, JSON.stringify(report, null, 2));
  console.log('[PROGRESSIVE-ANALYSIS] ' + JSON.stringify({
    status: report.status, analyzed: report.analyzed, failed: report.failed,
    accuracyVerified: false, reportPath,
  }));
  if (failures.length !== 0) {
    throw new Error(`Progressive analysis failed for ${failures.length}/${testLevels.length} inputs; evidence=${reportPath}`);
  }
  console.log('Diagnostic completed; separator counts are not an accuracy verdict.');
}

main();
