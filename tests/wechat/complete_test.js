/**
 * 完整的测试流程：检测 -> 评估 -> 可视化
 */

async function completeTest() {
    console.log('='.repeat(80));
    console.log('完整测试流程：简化图片');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/simple_wechat.png';
    const expectedVertical = [60, 340];
    const expectedHorizontal = [60, 700];

    // 步骤 1: 运行检测
    console.log('\n步骤 1: 运行布局检测...');
    const result = await Vision.analyzeLayout({
        imagePath,
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    const detectedVertical = result.separators.vertical.map(s => s.position);
    const detectedHorizontal = result.separators.horizontal.map(s => s.position);

    console.log(`  检测到垂直分隔符: ${detectedVertical.join(', ')}`);
    console.log(`  检测到水平分隔符: ${detectedHorizontal.join(', ')}`);

    // 步骤 2: 评估结果
    console.log('\n步骤 2: 评估检测结果...');

    const tolerance = 10;
    const isMatch = (detected, expected) => {
        return expected.some(exp => Math.abs(detected - exp) <= tolerance);
    };

    let correctV = 0, falseV = 0, missedV = 0;
    let correctH = 0, falseH = 0, missedH = 0;

    // 评估垂直分隔符
    detectedVertical.forEach(d => {
        if (isMatch(d, expectedVertical)) {
            correctV++;
        } else {
            falseV++;
        }
    });
    expectedVertical.forEach(e => {
        if (!isMatch(e, detectedVertical)) {
            missedV++;
        }
    });

    // 评估水平分隔符
    detectedHorizontal.forEach(d => {
        if (isMatch(d, expectedHorizontal)) {
            correctH++;
        } else {
            falseH++;
        }
    });
    expectedHorizontal.forEach(e => {
        if (!isMatch(e, detectedHorizontal)) {
            missedH++;
        }
    });

    const totalCorrect = correctV + correctH;
    const totalFalse = falseV + falseH;
    const totalMissed = missedV + missedH;
    const totalExpected = expectedVertical.length + expectedHorizontal.length;

    const precision = totalCorrect / (totalCorrect + totalFalse) * 100;
    const recall = totalCorrect / totalExpected * 100;
    const f1 = 2 * precision * recall / (precision + recall);

    console.log(`  垂直: 正确=${correctV}, 误检=${falseV}, 漏检=${missedV}`);
    console.log(`  水平: 正确=${correctH}, 误检=${falseH}, 漏检=${missedH}`);
    console.log(`  精确率: ${precision.toFixed(1)}%`);
    console.log(`  召回率: ${recall.toFixed(1)}%`);
    console.log(`  F1 分数: ${f1.toFixed(1)}%`);

    // 步骤 3: 生成可视化配置
    console.log('\n步骤 3: 生成可视化图片...');

    const vizConfig = {
        imagePath: imagePath,
        expectedVertical: expectedVertical,
        expectedHorizontal: expectedHorizontal,
        detectedVertical: detectedVertical,
        detectedHorizontal: detectedHorizontal,
        outputPath: '.runtime/tests/wechat/simple_visualization.png'
    };

    // 保存配置到临时文件
    const configPath = '.runtime/tests/wechat/viz_config.json';
    System.writeFile(configPath, JSON.stringify(vizConfig, null, 2));

    console.log(`  配置已保存: ${configPath}`);
    console.log(`  请运行: go run ./tests/wechat/tools/visualize-result ${configPath}`);

    // 步骤 4: 显示结论
    console.log('\n' + '='.repeat(80));
    if (precision >= 90 && recall === 100 && f1 >= 95) {
        console.log('✓ 测试通过！算法达到目标。');
    } else {
        console.log('✗ 测试未通过。需要继续优化。');
    }
    console.log('='.repeat(80));

    console.log('\n查看可视化结果:');
    console.log(`  open ${vizConfig.outputPath}`);
}

completeTest().catch(console.error);
