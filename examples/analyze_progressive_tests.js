// Progressive Test Image Analysis
// Compares median vs mean mode on all 7 test levels

const testImagesDir = './.runtime/tests/automation/image-layout';

const testLevels = [
    { name: 'level1_simple', description: 'Simple color blocks (no noise)' },
    { name: 'level2_borders', description: 'Color blocks with borders' },
    { name: 'level3_sparse_text', description: 'Sparse text (10% coverage)' },
    { name: 'level4_dense_text', description: 'Dense text (40% coverage)' },
    { name: 'level5_complex', description: 'Complex multi-region layout' },
    { name: 'level6_gradient', description: 'Gradient backgrounds' },
    { name: 'level7_mixed', description: 'Realistic mixed content' }
];

function analyzeTestLevel(level) {
    const imagePath = `${testImagesDir}/${level.name}.png`;

    console.log(`\nAnalyzing ${level.name}: ${level.description}`);

    try {
        const imageBase64 = ImageColor.loadBase64(imagePath);

        // Test with median mode
        const medianResult = ImageColor.analyzeLayout(imageBase64, {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3
        });

        // Test with mean mode
        const meanResult = ImageColor.analyzeLayout(imageBase64, {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.14,
            cellColorMode: 'mean',
            boundarySpanWidth: 1
        });

        const medianSeps = medianResult.separators;
        const meanSeps = meanResult.separators;

        const medianVertical = medianSeps.vertical || [];
        const medianHorizontal = medianSeps.horizontal || [];
        const meanVertical = meanSeps.vertical || [];
        const meanHorizontal = meanSeps.horizontal || [];

        const medianTotal = medianVertical.length + medianHorizontal.length;
        const meanTotal = meanVertical.length + meanHorizontal.length;

        const medianAvgConf = medianVertical.concat(medianHorizontal)
            .reduce((sum, s) => sum + s.confidence, 0) / (medianTotal || 1);

        const meanAvgConf = meanVertical.concat(meanHorizontal)
            .reduce((sum, s) => sum + s.confidence, 0) / (meanTotal || 1);

        console.log(`  Median: ${medianTotal} separators (${medianVertical.length}V + ${medianHorizontal.length}H), conf=${medianAvgConf.toFixed(3)}`);
        console.log(`  Mean:   ${meanTotal} separators (${meanVertical.length}V + ${meanHorizontal.length}H), conf=${meanAvgConf.toFixed(3)}`);

        const diff = medianTotal - meanTotal;
        const diffPct = ((diff / (meanTotal || 1)) * 100).toFixed(1);
        console.log(`  Diff:   ${diff > 0 ? '+' : ''}${diff} (${diffPct}%)`);

        return {
            level: level.name,
            description: level.description,
            median: {
                vertical: medianVertical.length,
                horizontal: medianHorizontal.length,
                total: medianTotal,
                avgConfidence: medianAvgConf
            },
            mean: {
                vertical: meanVertical.length,
                horizontal: meanHorizontal.length,
                total: meanTotal,
                avgConfidence: meanAvgConf
            }
        };
    } catch (error) {
        console.log(`  ⚠️  Error: ${error.message}`);
        return null;
    }
}

function main() {
    console.log('='.repeat(80));
    console.log('Progressive Test Image Analysis - Median vs Mean Mode');
    console.log('='.repeat(80));

    const results = [];

    for (const level of testLevels) {
        const result = analyzeTestLevel(level);
        if (result) {
            results.push(result);
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('Summary');
    console.log('='.repeat(80));

    console.log('\nLevel                  | Median | Mean | Diff | Median Conf | Mean Conf');
    console.log('-'.repeat(80));

    for (const r of results) {
        const levelName = r.level.padEnd(22);
        const medianTotal = String(r.median.total).padStart(6);
        const meanTotal = String(r.mean.total).padStart(4);
        const diff = String(r.median.total - r.mean.total).padStart(4);
        const medianConf = r.median.avgConfidence.toFixed(3);
        const meanConf = r.mean.avgConfidence.toFixed(3);

        console.log(`${levelName} | ${medianTotal} | ${meanTotal} | ${diff} | ${medianConf}       | ${meanConf}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('Key Findings');
    console.log('='.repeat(80));

    const avgMedianTotal = results.reduce((sum, r) => sum + r.median.total, 0) / results.length;
    const avgMeanTotal = results.reduce((sum, r) => sum + r.mean.total, 0) / results.length;

    console.log(`\nAverage separators:`);
    console.log(`  Median: ${avgMedianTotal.toFixed(1)}`);
    console.log(`  Mean:   ${avgMeanTotal.toFixed(1)}`);

    const betterInMedian = results.filter(r => r.median.total >= r.mean.total).length;
    const betterInMean = results.filter(r => r.mean.total > r.median.total).length;

    console.log(`\nPerformance comparison:`);
    console.log(`  Median performs better: ${betterInMedian}/${results.length} tests`);
    console.log(`  Mean performs better:   ${betterInMean}/${results.length} tests`);

    console.log('\n✅ Analysis complete');
}

main();
