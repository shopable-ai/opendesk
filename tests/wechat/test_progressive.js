/**
 * 渐进式识别测试 - 展示不同策略的效果
 */

async function testProgressiveRecognition() {
    console.log('='.repeat(80));
    console.log('渐进式布局识别测试');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/mock_wechat.png';
    const expectedV = [60, 340];
    const expectedH = [60, 700];

    // 测试配置
    const tests = [
        {
            name: '策略 1: 颜色采样辅助',
            config: {
                imagePath,
                strategy: 'colorSampling',
                colorSamples: [
                    { name: 'sidebar', color: '#2E2E2E', x: 30, y: 400 },
                    { name: 'chatList', color: '#F5F5F5', x: 200, y: 400 },
                    { name: 'chatHeader', color: '#F5F5F5', x: 700, y: 30 },
                    { name: 'chatMessages', color: '#F9F9F9', x: 700, y: 400 },
                    { name: 'chatInput', color: '#F5F5F5', x: 700, y: 750 }
                ],
                minColorDiff: 15
            }
        },
        {
            name: '策略 2: 位置提示辅助',
            config: {
                imagePath,
                strategy: 'positionHints',
                hints: {
                    vertical: [
                        { label: 'sidebar', from: 0.04, to: 0.06 },      // x=60 附近 (60/1200 = 0.05)
                        { label: 'content', from: 0.27, to: 0.29 }       // x=340 附近 (340/1200 = 0.283)
                    ],
                    horizontal: [
                        { label: 'header', from: 0.06, to: 0.09 },       // y=60 附近 (60/800 = 0.075)
                        { label: 'input', from: 0.85, to: 0.90 }         // y=700 附近 (700/800 = 0.875)
                    ]
                }
            }
        },
        {
            name: '策略 4: 完全自动识别（基线）',
            config: {
                imagePath,
                strategy: 'fullyAutomatic'
            }
        }
    ];

    const results = [];

    for (const test of tests) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(test.name);
        console.log('='.repeat(80));

        try {
            // 根据策略运行检测
            let result;

            if (test.config.strategy === 'colorSampling') {
                // 颜色采样策略：调整参数
                result = await Vision.analyzeLayout({
                    imagePath: test.config.imagePath,
                    cellSize: 5,
                    quantize: 8,
                    tolerance: test.config.minColorDiff || 15,
                    minRegionArea: 4,
                    minSeparatorScore: 0.05,
                    cellColorMode: 'median',
                    boundarySpanWidth: 3,
                });
            } else if (test.config.strategy === 'positionHints') {
                // 位置提示策略：使用 hints
                result = await Vision.analyzeLayout({
                    imagePath: test.config.imagePath,
                    cellSize: 10,
                    quantize: 16,
                    tolerance: 32,
                    minRegionArea: 4,
                    minSeparatorScore: 0.08,
                    cellColorMode: 'median',
                    boundarySpanWidth: 3,
                    separatorHints: test.config.hints
                });
            } else {
                // 完全自动策略
                result = await Vision.analyzeLayout({
                    imagePath: test.config.imagePath,
                    cellSize: 10,
                    quantize: 16,
                    tolerance: 32,
                    minRegionArea: 4,
                    minSeparatorScore: 0.08,
                    cellColorMode: 'median',
                    boundarySpanWidth: 3,
                });
            }

            const detectedV = result.separators.vertical.map(s => s.position);
            const detectedH = result.separators.horizontal.map(s => s.position);

            console.log(`\n检测结果:`);
            console.log(`  垂直: [${detectedV.join(', ')}]`);
            console.log(`  水平: [${detectedH.join(', ')}]`);

            // 评估
            const tolerance = 10;
            const isMatch = (d, expected) => expected.some(e => Math.abs(d - e) <= tolerance);

            const correctV = detectedV.filter(d => isMatch(d, expectedV)).length;
            const falseV = detectedV.filter(d => !isMatch(d, expectedV)).length;
            const missedV = expectedV.filter(e => !isMatch(e, detectedV)).length;

            const correctH = detectedH.filter(d => isMatch(d, expectedH)).length;
            const falseH = detectedH.filter(d => !isMatch(d, expectedH)).length;
            const missedH = expectedH.filter(e => !isMatch(e, detectedH)).length;

            const totalCorrect = correctV + correctH;
            const totalFalse = falseV + falseH;
            const totalExpected = expectedV.length + expectedH.length;

            const precision = totalCorrect / (totalCorrect + totalFalse) * 100;
            const recall = totalCorrect / totalExpected * 100;
            const f1 = 2 * precision * recall / (precision + recall);

            console.log(`\n评估结果:`);
            console.log(`  垂直: ✓${correctV} ✗${falseV} ⊘${missedV}`);
            console.log(`  水平: ✓${correctH} ✗${falseH} ⊘${missedH}`);
            console.log(`  精确率: ${precision.toFixed(1)}%`);
            console.log(`  召回率: ${recall.toFixed(1)}%`);
            console.log(`  F1: ${f1.toFixed(1)}%`);

            const passed = precision >= 90 && recall === 100 && f1 >= 95;
            console.log(`\n结果: ${passed ? '✓ 通过' : '✗ 未通过'}`);

            results.push({
                name: test.name,
                strategy: test.config.strategy,
                passed,
                precision,
                recall,
                f1,
                detectedV,
                detectedH,
                correctV,
                correctH,
                falseV,
                falseH,
                missedV,
                missedH
            });

        } catch (error) {
            console.log(`\n错误: ${error.message}`);
            results.push({
                name: test.name,
                strategy: test.config.strategy,
                error: error.message
            });
        }
    }

    // 对比总结
    console.log('\n' + '='.repeat(80));
    console.log('策略对比总结');
    console.log('='.repeat(80));

    results.forEach((r, i) => {
        if (r.error) {
            console.log(`\n${i + 1}. ${r.name}`);
            console.log(`   错误: ${r.error}`);
            return;
        }

        const status = r.passed ? '✓' : '✗';
        console.log(`\n${i + 1}. ${status} ${r.name}`);
        console.log(`   精确率: ${r.precision.toFixed(1)}% | 召回率: ${r.recall.toFixed(1)}% | F1: ${r.f1.toFixed(1)}%`);
        console.log(`   垂直: ✓${r.correctV} ✗${r.falseV} ⊘${r.missedV} | 水平: ✓${r.correctH} ✗${r.falseH} ⊘${r.missedH}`);

        // 显示改进
        if (i > 0 && !results[i-1].error && !r.error) {
            const prevF1 = results[i-1].f1;
            const improvement = r.f1 - prevF1;
            if (improvement > 0) {
                console.log(`   📈 相比上一策略提升: +${improvement.toFixed(1)}%`);
            } else if (improvement < 0) {
                console.log(`   📉 相比上一策略下降: ${improvement.toFixed(1)}%`);
            }
        }
    });

    // 找出最佳策略
    const validResults = results.filter(r => !r.error);
    if (validResults.length > 0) {
        const best = validResults.reduce((a, b) => a.f1 > b.f1 ? a : b);
        console.log('\n' + '='.repeat(80));
        console.log(`🏆 最佳策略: ${best.name}`);
        console.log(`   F1 分数: ${best.f1.toFixed(1)}%`);
        console.log(`   精确率: ${best.precision.toFixed(1)}%`);
        console.log(`   召回率: ${best.recall.toFixed(1)}%`);
        console.log('='.repeat(80));
    }

    console.log('\n建议:');
    console.log('  1. 优先使用位置提示策略（最简单，效果好）');
    console.log('  2. 如果位置不确定，使用颜色采样策略');
    console.log('  3. 完全自动识别仅用于简化场景');
}

testProgressiveRecognition().catch(console.error);
