/**
 * 评估识别准确率
 * 对比识别结果和 Ground Truth
 */

// 加载 Ground Truth（硬编码，避免使用 fs）
function loadGroundTruth() {
    return {
        "imageWidth": 1200,
        "imageHeight": 800,
        "regions": [
            {
                "name": "sidebar",
                "x": 0,
                "y": 0,
                "width": 60,
                "height": 800,
                "color": "#2E2E2E"
            },
            {
                "name": "chatList",
                "x": 60,
                "y": 0,
                "width": 280,
                "height": 800,
                "color": "#E0E0E0"
            },
            {
                "name": "chatHeader",
                "x": 340,
                "y": 0,
                "width": 860,
                "height": 60,
                "color": "#F5F5F5"
            },
            {
                "name": "chatMessages",
                "x": 340,
                "y": 60,
                "width": 860,
                "height": 640,
                "color": "#FFFFFF"
            },
            {
                "name": "chatInput",
                "x": 340,
                "y": 700,
                "width": 860,
                "height": 100,
                "color": "#F0F0F0"
            }
        ]
    };
}

// 计算两个矩形的 IoU (Intersection over Union)
function calculateIoU(rect1, rect2) {
    const x1 = Math.max(rect1.x, rect2.x);
    const y1 = Math.max(rect1.y, rect2.y);
    const x2 = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
    const y2 = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);

    if (x2 <= x1 || y2 <= y1) {
        return 0;  // 没有交集
    }

    const intersection = (x2 - x1) * (y2 - y1);
    const area1 = rect1.width * rect1.height;
    const area2 = rect2.width * rect2.height;
    const union = area1 + area2 - intersection;

    return intersection / union;
}

// 评估识别结果
function evaluateRecognition(detectedRegions, groundTruth, iouThreshold = 0.5) {
    const expectedRegions = groundTruth.regions;

    console.log('\n' + '='.repeat(80));
    console.log('评估识别准确率');
    console.log('='.repeat(80));

    console.log(`\nGround Truth: ${expectedRegions.length} 个区域`);
    expectedRegions.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.name}: (${r.x}, ${r.y}, ${r.width}, ${r.height})`);
    });

    console.log(`\n识别结果: ${detectedRegions.length} 个区域`);
    detectedRegions.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.id}: (${r.bbox.x}, ${r.bbox.y}, ${r.bbox.width}, ${r.bbox.height})`);
    });

    // 匹配每个预期区域
    const matches = [];
    const matched = new Set();

    console.log('\n' + '-'.repeat(80));
    console.log('区域匹配（IoU 阈值 = ' + iouThreshold + '）');
    console.log('-'.repeat(80));

    for (let i = 0; i < expectedRegions.length; i++) {
        const expected = expectedRegions[i];
        let bestMatch = null;
        let bestIoU = 0;
        let bestIdx = -1;

        for (let j = 0; j < detectedRegions.length; j++) {
            if (matched.has(j)) continue;

            const detected = detectedRegions[j];
            const iou = calculateIoU(
                { x: expected.x, y: expected.y, width: expected.width, height: expected.height },
                detected.bbox
            );

            if (iou > bestIoU) {
                bestIoU = iou;
                bestMatch = detected;
                bestIdx = j;
            }
        }

        const isMatch = bestIoU >= iouThreshold;
        if (isMatch && bestIdx >= 0) {
            matched.add(bestIdx);
        }

        const status = isMatch ? '✓' : '✗';
        console.log(`\n  ${status} ${expected.name}:`);
        console.log(`      预期: (${expected.x}, ${expected.y}, ${expected.width}, ${expected.height})`);
        if (bestMatch) {
            console.log(`      识别: (${bestMatch.bbox.x}, ${bestMatch.bbox.y}, ${bestMatch.bbox.width}, ${bestMatch.bbox.height})`);
            console.log(`      IoU: ${(bestIoU * 100).toFixed(1)}%`);
        } else {
            console.log(`      识别: 未找到匹配`);
        }

        matches.push({
            expected,
            detected: bestMatch,
            iou: bestIoU,
            matched: isMatch
        });
    }

    // 计算指标
    const truePositives = matches.filter(m => m.matched).length;
    const falseNegatives = matches.filter(m => !m.matched).length;
    const falsePositives = detectedRegions.length - matched.size;

    const precision = truePositives / (truePositives + falsePositives) * 100;
    const recall = truePositives / expectedRegions.length * 100;
    const f1 = 2 * precision * recall / (precision + recall);

    console.log('\n' + '='.repeat(80));
    console.log('评估指标');
    console.log('='.repeat(80));
    console.log(`  正确识别 (TP): ${truePositives}`);
    console.log(`  漏检 (FN): ${falseNegatives}`);
    console.log(`  误检 (FP): ${falsePositives}`);
    console.log(`  精确率 (Precision): ${precision.toFixed(1)}%`);
    console.log(`  召回率 (Recall): ${recall.toFixed(1)}%`);
    console.log(`  F1 分数: ${f1.toFixed(1)}%`);

    const passed = precision >= 90 && recall >= 90 && f1 >= 90;
    console.log(`\n  结果: ${passed ? '✓ 通过' : '✗ 未通过'}`);

    return {
        truePositives,
        falseNegatives,
        falsePositives,
        precision,
        recall,
        f1,
        passed,
        matches
    };
}

// 测试不同策略
async function testAllStrategies() {
    console.log('='.repeat(80));
    console.log('测试所有识别策略并评估准确率');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/ground_truth_simple.png';
    const groundTruth = loadGroundTruth();

    const strategies = [
        {
            name: '完全自动识别',
            config: {
                imagePath,
                cellSize: 10,
                quantize: 16,
                tolerance: 32,
                minRegionArea: 4,
                minSeparatorScore: 0.08,
                cellColorMode: 'median',
                boundarySpanWidth: 3
            }
        },
        {
            name: '位置提示策略',
            config: {
                imagePath,
                separatorHints: {
                    vertical: [
                        { label: 'sidebar', from: 0.04, to: 0.06 },
                        { label: 'chatList', from: 0.27, to: 0.29 }
                    ],
                    horizontal: [
                        { label: 'header', from: 0.06, to: 0.09 },
                        { label: 'input', from: 0.85, to: 0.90 }
                    ]
                },
                cellSize: 10,
                quantize: 16,
                tolerance: 32,
                minRegionArea: 4,
                minSeparatorScore: 0.08,
                cellColorMode: 'median',
                boundarySpanWidth: 3
            }
        },
        {
            name: '激进识别（低阈值）',
            config: {
                imagePath,
                cellSize: 5,
                quantize: 8,
                tolerance: 20,
                minRegionArea: 2,
                minSeparatorScore: 0.03,
                cellColorMode: 'median',
                boundarySpanWidth: 3
            }
        }
    ];

    const results = [];

    for (const strategy of strategies) {
        console.log('\n\n' + '='.repeat(80));
        console.log(`策略: ${strategy.name}`);
        console.log('='.repeat(80));

        const result = await Vision.analyzeLayout(strategy.config);
        const evaluation = evaluateRecognition(result.regions, groundTruth);

        results.push({
            name: strategy.name,
            ...evaluation
        });
    }

    // 总结对比
    console.log('\n\n' + '='.repeat(80));
    console.log('策略对比总结');
    console.log('='.repeat(80));

    results.forEach((r, i) => {
        const status = r.passed ? '✓' : '✗';
        console.log(`\n${i + 1}. ${status} ${r.name}`);
        console.log(`   精确率: ${r.precision.toFixed(1)}% | 召回率: ${r.recall.toFixed(1)}% | F1: ${r.f1.toFixed(1)}%`);
        console.log(`   TP: ${r.truePositives} | FN: ${r.falseNegatives} | FP: ${r.falsePositives}`);
    });

    const best = results.reduce((a, b) => a.f1 > b.f1 ? a : b);
    console.log('\n' + '='.repeat(80));
    console.log(`🏆 最佳策略: ${best.name}`);
    console.log(`   F1 分数: ${best.f1.toFixed(1)}%`);
    console.log('='.repeat(80));
}

testAllStrategies().catch(console.error);
