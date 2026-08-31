/**
 * Agent 驱动的自动化测试
 * 实时检测、评估、可视化，无需手动干预
 */

async function agentDrivenTest() {
    console.log('='.repeat(80));
    console.log('Agent 驱动的自动化测试');
    console.log('='.repeat(80));

    const tests = [
        {
            name: '简化场景',
            imagePath: '.runtime/tests/wechat/simple_wechat.png',
            expectedV: [60, 340],
            expectedH: [60, 700],
            generator: 'go run ./tests/wechat/tools/generate-simple-image'
        },
        {
            name: '复杂场景',
            imagePath: '.runtime/tests/wechat/mock_wechat.png',
            expectedV: [60, 340],
            expectedH: [60, 700],
            generator: 'go run ./tests/wechat/tools/generate-mock-image'
        }
    ];

    const results = [];

    for (const test of tests) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`测试: ${test.name}`);
        console.log('='.repeat(80));

        // 运行检测
        console.log('\n运行检测...');
        const result = await Vision.analyzeLayout({
            imagePath: test.imagePath,
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3,
        });

        const detectedV = result.separators.vertical.map(s => s.position);
        const detectedH = result.separators.horizontal.map(s => s.position);

        console.log(`  垂直: [${detectedV.join(', ')}]`);
        console.log(`  水平: [${detectedH.join(', ')}]`);

        // 评估
        const tolerance = 10;
        const isMatch = (d, expected) => expected.some(e => Math.abs(d - e) <= tolerance);

        const correctV = detectedV.filter(d => isMatch(d, test.expectedV)).length;
        const falseV = detectedV.filter(d => !isMatch(d, test.expectedV)).length;
        const missedV = test.expectedV.filter(e => !isMatch(e, detectedV)).length;

        const correctH = detectedH.filter(d => isMatch(d, test.expectedH)).length;
        const falseH = detectedH.filter(d => !isMatch(d, test.expectedH)).length;
        const missedH = test.expectedH.filter(e => !isMatch(e, detectedH)).length;

        const totalCorrect = correctV + correctH;
        const totalFalse = falseV + falseH;
        const totalExpected = test.expectedV.length + test.expectedH.length;

        const precision = totalCorrect / (totalCorrect + totalFalse) * 100;
        const recall = totalCorrect / totalExpected * 100;
        const f1 = 2 * precision * recall / (precision + recall);

        console.log('\n评估结果:');
        console.log(`  垂直: ✓${correctV} ✗${falseV} ⊘${missedV}`);
        console.log(`  水平: ✓${correctH} ✗${falseH} ⊘${missedH}`);
        console.log(`  精确率: ${precision.toFixed(1)}%`);
        console.log(`  召回率: ${recall.toFixed(1)}%`);
        console.log(`  F1: ${f1.toFixed(1)}%`);

        const passed = precision >= 90 && recall === 100 && f1 >= 95;
        console.log(`\n结果: ${passed ? '✓ 通过' : '✗ 未通过'}`);

        results.push({
            name: test.name,
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
    }

    // 总结
    console.log('\n' + '='.repeat(80));
    console.log('测试总结');
    console.log('='.repeat(80));

    results.forEach(r => {
        const status = r.passed ? '✓' : '✗';
        console.log(`\n${status} ${r.name}`);
        console.log(`  精确率: ${r.precision.toFixed(1)}% | 召回率: ${r.recall.toFixed(1)}% | F1: ${r.f1.toFixed(1)}%`);
        console.log(`  垂直: ✓${r.correctV} ✗${r.falseV} ⊘${r.missedV} | 水平: ✓${r.correctH} ✗${r.falseH} ⊘${r.missedH}`);
    });

    const allPassed = results.every(r => r.passed);
    console.log('\n' + '='.repeat(80));
    if (allPassed) {
        console.log('🎉 所有测试通过！');
    } else {
        console.log('⚠️  部分测试未通过，需要继续优化。');
    }
    console.log('='.repeat(80));

    console.log('\n查看可视化结果:');
    console.log('  open .runtime/tests/wechat/simple_visualization.png');
    console.log('  open .runtime/tests/wechat/complex_visualization.png');
}

agentDrivenTest().catch(console.error);
