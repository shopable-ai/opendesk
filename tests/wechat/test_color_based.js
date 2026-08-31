/**
 * 测试智能颜色区域识别
 *
 * 阶段 1: 使用固定颜色参数
 */

async function testColorBasedRecognition() {
    console.log('='.repeat(80));
    console.log('智能颜色区域识别测试');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/mock_wechat.png';
    const expectedV = [60, 340];
    const expectedH = [60, 700];

    // 测试 1: 基于固定颜色识别
    console.log('\n' + '='.repeat(80));
    console.log('测试 1: 基于固定颜色识别');
    console.log('='.repeat(80));

    const result1 = await Vision.analyzeLayout({
        imagePath,
        cellSize: 5,
        quantize: 8,
        tolerance: 20,  // 颜色容差
        minRegionArea: 4,
        minSeparatorScore: 0.05,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    const detectedV1 = result1.separators.vertical.map(s => s.position);
    const detectedH1 = result1.separators.horizontal.map(s => s.position);

    console.log('\n配置:');
    console.log('  目标颜色:');
    console.log('    - 侧边栏: #2E2E2E (深灰)');
    console.log('    - 聊天列表: #F5F5F5 (浅灰)');
    console.log('    - 消息区域: #F9F9F9 (白色)');
    console.log('  预期区域数量: 5');
    console.log('  颜色容差: 20');

    console.log('\n检测结果:');
    console.log(`  垂直: [${detectedV1.join(', ')}]`);
    console.log(`  水平: [${detectedH1.join(', ')}]`);

    // 评估
    const tolerance = 10;
    const isMatch = (d, expected) => expected.some(e => Math.abs(d - e) <= tolerance);

    const correctV1 = detectedV1.filter(d => isMatch(d, expectedV)).length;
    const falseV1 = detectedV1.filter(d => !isMatch(d, expectedV)).length;
    const missedV1 = expectedV.filter(e => !isMatch(e, detectedV1)).length;

    const correctH1 = detectedH1.filter(d => isMatch(d, expectedH)).length;
    const falseH1 = detectedH1.filter(d => !isMatch(d, expectedH)).length;
    const missedH1 = expectedH.filter(e => !isMatch(e, detectedH1)).length;

    const totalCorrect1 = correctV1 + correctH1;
    const totalFalse1 = falseV1 + falseH1;
    const totalExpected = expectedV.length + expectedH.length;

    const precision1 = totalCorrect1 / (totalCorrect1 + totalFalse1) * 100;
    const recall1 = totalCorrect1 / totalExpected * 100;
    const f1_1 = 2 * precision1 * recall1 / (precision1 + recall1);

    console.log('\n评估结果:');
    console.log(`  垂直: ✓${correctV1} ✗${falseV1} ⊘${missedV1}`);
    console.log(`  水平: ✓${correctH1} ✗${falseH1} ⊘${missedH1}`);
    console.log(`  精确率: ${precision1.toFixed(1)}%`);
    console.log(`  召回率: ${recall1.toFixed(1)}%`);
    console.log(`  F1: ${f1_1.toFixed(1)}%`);

    const passed1 = precision1 >= 90 && recall1 === 100 && f1_1 >= 95;
    console.log(`\n结果: ${passed1 ? '✓ 通过' : '✗ 未通过'}`);

    // 测试 2: 调整颜色容差
    console.log('\n' + '='.repeat(80));
    console.log('测试 2: 调整颜色容差 (tolerance = 30)');
    console.log('='.repeat(80));

    const result2 = await Vision.analyzeLayout({
        imagePath,
        cellSize: 5,
        quantize: 8,
        tolerance: 30,  // 增加颜色容差
        minRegionArea: 4,
        minSeparatorScore: 0.05,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    const detectedV2 = result2.separators.vertical.map(s => s.position);
    const detectedH2 = result2.separators.horizontal.map(s => s.position);

    console.log('\n检测结果:');
    console.log(`  垂直: [${detectedV2.join(', ')}]`);
    console.log(`  水平: [${detectedH2.join(', ')}]`);

    const correctV2 = detectedV2.filter(d => isMatch(d, expectedV)).length;
    const falseV2 = detectedV2.filter(d => !isMatch(d, expectedV)).length;
    const missedV2 = expectedV.filter(e => !isMatch(e, detectedV2)).length;

    const correctH2 = detectedH2.filter(d => isMatch(d, expectedH)).length;
    const falseH2 = detectedH2.filter(d => !isMatch(d, expectedH)).length;
    const missedH2 = expectedH.filter(e => !isMatch(e, detectedH2)).length;

    const totalCorrect2 = correctV2 + correctH2;
    const totalFalse2 = falseV2 + falseH2;

    const precision2 = totalCorrect2 / (totalCorrect2 + totalFalse2) * 100;
    const recall2 = totalCorrect2 / totalExpected * 100;
    const f1_2 = 2 * precision2 * recall2 / (precision2 + recall2);

    console.log('\n评估结果:');
    console.log(`  垂直: ✓${correctV2} ✗${falseV2} ⊘${missedV2}`);
    console.log(`  水平: ✓${correctH2} ✗${falseH2} ⊘${missedH2}`);
    console.log(`  精确率: ${precision2.toFixed(1)}%`);
    console.log(`  召回率: ${recall2.toFixed(1)}%`);
    console.log(`  F1: ${f1_2.toFixed(1)}%`);

    const passed2 = precision2 >= 90 && recall2 === 100 && f1_2 >= 95;
    console.log(`\n结果: ${passed2 ? '✓ 通过' : '✗ 未通过'}`);

    // 测试 3: 更小的网格
    console.log('\n' + '='.repeat(80));
    console.log('测试 3: 更小的网格 (cellSize = 3)');
    console.log('='.repeat(80));

    const result3 = await Vision.analyzeLayout({
        imagePath,
        cellSize: 3,    // 更小的网格
        quantize: 8,
        tolerance: 20,
        minRegionArea: 4,
        minSeparatorScore: 0.05,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    const detectedV3 = result3.separators.vertical.map(s => s.position);
    const detectedH3 = result3.separators.horizontal.map(s => s.position);

    console.log('\n检测结果:');
    console.log(`  垂直: [${detectedV3.join(', ')}]`);
    console.log(`  水平: [${detectedH3.join(', ')}]`);

    const correctV3 = detectedV3.filter(d => isMatch(d, expectedV)).length;
    const falseV3 = detectedV3.filter(d => !isMatch(d, expectedV)).length;
    const missedV3 = expectedV.filter(e => !isMatch(e, detectedV3)).length;

    const correctH3 = detectedH3.filter(d => isMatch(d, expectedH)).length;
    const falseH3 = detectedH3.filter(d => !isMatch(d, expectedH)).length;
    const missedH3 = expectedH.filter(e => !isMatch(e, detectedH3)).length;

    const totalCorrect3 = correctV3 + correctH3;
    const totalFalse3 = falseV3 + falseH3;

    const precision3 = totalCorrect3 / (totalCorrect3 + totalFalse3) * 100;
    const recall3 = totalCorrect3 / totalExpected * 100;
    const f1_3 = 2 * precision3 * recall3 / (precision3 + recall3);

    console.log('\n评估结果:');
    console.log(`  垂直: ✓${correctV3} ✗${falseV3} ⊘${missedV3}`);
    console.log(`  水平: ✓${correctH3} ✗${falseH3} ⊘${missedH3}`);
    console.log(`  精确率: ${precision3.toFixed(1)}%`);
    console.log(`  召回率: ${recall3.toFixed(1)}%`);
    console.log(`  F1: ${f1_3.toFixed(1)}%`);

    const passed3 = precision3 >= 90 && recall3 === 100 && f1_3 >= 95;
    console.log(`\n结果: ${passed3 ? '✓ 通过' : '✗ 未通过'}`);

    // 总结
    console.log('\n' + '='.repeat(80));
    console.log('测试总结');
    console.log('='.repeat(80));

    const results = [
        { name: '测试 1: tolerance=20, cellSize=5', f1: f1_1, passed: passed1 },
        { name: '测试 2: tolerance=30, cellSize=5', f1: f1_2, passed: passed2 },
        { name: '测试 3: tolerance=20, cellSize=3', f1: f1_3, passed: passed3 }
    ];

    results.forEach((r, i) => {
        const status = r.passed ? '✓' : '✗';
        console.log(`\n${i + 1}. ${status} ${r.name}`);
        console.log(`   F1: ${r.f1.toFixed(1)}%`);
    });

    const best = results.reduce((a, b) => a.f1 > b.f1 ? a : b);
    console.log('\n' + '='.repeat(80));
    console.log(`🏆 最佳配置: ${best.name}`);
    console.log(`   F1 分数: ${best.f1.toFixed(1)}%`);
    console.log('='.repeat(80));

    console.log('\n下一步计划:');
    console.log('  阶段 1 ✓: 基于固定颜色参数识别（当前）');
    console.log('  阶段 2 ⏳: 自动颜色采样（分析图像颜色分布）');
    console.log('  阶段 3 ⏳: OCR 辅助（排除文字区域噪音）');
    console.log('  阶段 4 ⏳: AI 驱动（机器学习模型）');
}

testColorBasedRecognition().catch(console.error);
