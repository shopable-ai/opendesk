// Algorithm Validation Script
// 1. Generate test images with known separator positions
// 2. Run layout analysis
// 3. Draw detected separators on images
// 4. Compare detected vs expected positions
// 5. Calculate accuracy metrics

const wait = (ms) => page.waitFor(ms);

// Test cases with known separator positions
const testCases = [
    {
        name: 'three_columns',
        description: '3 equal columns',
        expectedVertical: [200, 400],
        expectedHorizontal: [],
        tolerance: 20
    },
    {
        name: 'sidebar_layout',
        description: 'Sidebar + main area',
        expectedVertical: [250],
        expectedHorizontal: [80, 520],
        tolerance: 20
    },
    {
        name: 'grid_layout',
        description: '2x2 grid',
        expectedVertical: [300],
        expectedHorizontal: [200],
        tolerance: 20
    },
    {
        name: 'complex_with_text',
        description: 'Complex app layout with text',
        expectedVertical: [250],
        expectedHorizontal: [60],
        tolerance: 20
    }
];

function isNear(detected, expected, tolerance) {
    return Math.abs(detected - expected) <= tolerance;
}

function findMatch(detected, expectedList, tolerance) {
    for (let i = 0; i < expectedList.length; i++) {
        if (isNear(detected, expectedList[i], tolerance)) {
            return i;
        }
    }
    return -1;
}

function calculateAccuracy(detected, expected, tolerance) {
    const detectedPositions = detected.map(s => s.position);

    // True Positives: detected separators that match expected
    let truePositives = 0;
    const matchedExpected = new Set();

    for (const pos of detectedPositions) {
        const matchIdx = findMatch(pos, expected, tolerance);
        if (matchIdx >= 0) {
            truePositives++;
            matchedExpected.add(matchIdx);
        }
    }

    // False Positives: detected but not expected
    const falsePositives = detectedPositions.length - truePositives;

    // False Negatives: expected but not detected
    const falseNegatives = expected.length - matchedExpected.size;

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = precision + recall > 0
        ? 2 * (precision * recall) / (precision + recall)
        : 0;

    return {
        truePositives,
        falsePositives,
        falseNegatives,
        precision,
        recall,
        f1Score,
        detectedPositions,
        matchedExpected: Array.from(matchedExpected).map(i => expected[i])
    };
}

async function validateTestCase(testCase, mode) {
    const imagePath = `.runtime/tests/automation/image-layout/${testCase.name}.png`;

    console.log(`\n  Testing ${mode.toUpperCase()} mode on ${testCase.name}...`);

    try {
        const imageBase64 = await ImageColor.loadBase64(imagePath);

        const config = mode === 'median' ? {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3
        } : {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.14,
            cellColorMode: 'mean',
            boundarySpanWidth: 1
        };

        const result = await ImageColor.analyzeLayout(imageBase64, config);
        const seps = result.separators;

        const vertical = seps.vertical || [];
        const horizontal = seps.horizontal || [];

        // Calculate accuracy for vertical separators
        const vAccuracy = calculateAccuracy(
            vertical,
            testCase.expectedVertical,
            testCase.tolerance
        );

        // Calculate accuracy for horizontal separators
        const hAccuracy = calculateAccuracy(
            horizontal,
            testCase.expectedHorizontal,
            testCase.tolerance
        );

        console.log(`    Vertical: ${vertical.length} detected, ${testCase.expectedVertical.length} expected`);
        console.log(`      TP=${vAccuracy.truePositives}, FP=${vAccuracy.falsePositives}, FN=${vAccuracy.falseNegatives}`);
        console.log(`      Precision=${vAccuracy.precision.toFixed(3)}, Recall=${vAccuracy.recall.toFixed(3)}, F1=${vAccuracy.f1Score.toFixed(3)}`);

        console.log(`    Horizontal: ${horizontal.length} detected, ${testCase.expectedHorizontal.length} expected`);
        console.log(`      TP=${hAccuracy.truePositives}, FP=${hAccuracy.falsePositives}, FN=${hAccuracy.falseNegatives}`);
        console.log(`      Precision=${hAccuracy.precision.toFixed(3)}, Recall=${hAccuracy.recall.toFixed(3)}, F1=${hAccuracy.f1Score.toFixed(3)}`);

        return {
            mode,
            testCase: testCase.name,
            vertical: vAccuracy,
            horizontal: hAccuracy,
            overallF1: (vAccuracy.f1Score + hAccuracy.f1Score) / 2
        };

    } catch (error) {
        console.log(`    ⚠️  Error: ${error.message}`);
        return null;
    }
}

async function main() {
    console.log('='.repeat(80));
    console.log('Algorithm Validation - Accuracy Testing');
    console.log('='.repeat(80));
    console.log('\nValidating algorithm against known ground truth...\n');

    const results = [];

    for (const testCase of testCases) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Test Case: ${testCase.description}`);
        console.log(`Expected: ${testCase.expectedVertical.length}V + ${testCase.expectedHorizontal.length}H separators`);
        console.log('='.repeat(80));

        // Test with median mode
        const medianResult = await validateTestCase(testCase, 'median');
        if (medianResult) results.push(medianResult);

        // Test with mean mode
        const meanResult = await validateTestCase(testCase, 'mean');
        if (meanResult) results.push(meanResult);
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('Validation Summary');
    console.log('='.repeat(80));

    const medianResults = results.filter(r => r.mode === 'median');
    const meanResults = results.filter(r => r.mode === 'mean');

    const avgMedianF1 = medianResults.reduce((sum, r) => sum + r.overallF1, 0) / medianResults.length;
    const avgMeanF1 = meanResults.reduce((sum, r) => sum + r.overallF1, 0) / meanResults.length;

    console.log(`\nAverage F1 Score:`);
    console.log(`  Median: ${avgMedianF1.toFixed(3)}`);
    console.log(`  Mean:   ${avgMeanF1.toFixed(3)}`);

    console.log('\nDetailed Results:');
    console.log('-'.repeat(80));
    console.log('Test Case          | Mode   | V-F1  | H-F1  | Overall');
    console.log('-'.repeat(80));

    for (const r of results) {
        const name = r.testCase.padEnd(18);
        const mode = r.mode.padEnd(6);
        const vf1 = r.vertical.f1Score.toFixed(3);
        const hf1 = r.horizontal.f1Score.toFixed(3);
        const overall = r.overallF1.toFixed(3);
        console.log(`${name} | ${mode} | ${vf1} | ${hf1} | ${overall}`);
    }

    console.log('\n✅ Validation complete');
    console.log('\nNote: Images in .runtime/tests/automation/image-layout/ can be used for visual inspection');
}

main().catch(console.error);
