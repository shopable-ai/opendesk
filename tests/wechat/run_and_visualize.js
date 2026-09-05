/**
 * 运行检测并生成可视化的统一脚本
 * 用法: OPENDESK_WECHAT_MODE=simple ./dist/opendesk -script tests/wechat/run_and_visualize.js -console-mode script
 */

const mode = Execution.env.OPENDESK_WECHAT_MODE || 'simple';
if (mode !== 'simple' && mode !== 'complex') {
    throw new Error(`未知 OPENDESK_WECHAT_MODE "${mode}"；必须是 "simple" 或 "complex"`);
}

async function runAndVisualize() {
    console.log('='.repeat(80));
    console.log(`运行检测并生成可视化 - ${mode} 模式`);
    console.log('='.repeat(80));

    // 配置
    const configs = {
        simple: {
            imagePath: '.runtime/tests/wechat/simple_wechat.png',
            expectedVertical: [60, 340],
            expectedHorizontal: [60, 700],
            outputPath: '.runtime/tests/wechat/simple_visualization.png',
            configPath: '.runtime/tests/wechat/viz_config_simple.json'
        },
        complex: {
            imagePath: '.runtime/tests/wechat/mock_wechat.png',
            expectedVertical: [60, 340],
            expectedHorizontal: [60, 700],
            outputPath: '.runtime/tests/wechat/complex_visualization.png',
            configPath: '.runtime/tests/wechat/viz_config_complex.json'
        }
    };

    const config = configs[mode];

    // 步骤 1: 运行检测
    console.log('\n步骤 1: 运行布局检测...');
    const result = await Vision.analyzeLayout({
        imagePath: config.imagePath,
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

    console.log(`  检测到垂直分隔符: [${detectedVertical.join(', ')}]`);
    console.log(`  检测到水平分隔符: [${detectedHorizontal.join(', ')}]`);

    // 步骤 2: 评估结果
    console.log('\n步骤 2: 评估检测结果...');

    const tolerance = 10;
    const isMatch = (detected, expected) => {
        return expected.some(exp => Math.abs(detected - exp) <= tolerance);
    };

    let correctV = 0, falseV = 0, missedV = 0;
    let correctH = 0, falseH = 0, missedH = 0;

    detectedVertical.forEach(d => {
        if (isMatch(d, config.expectedVertical)) {
            correctV++;
        } else {
            falseV++;
        }
    });
    config.expectedVertical.forEach(e => {
        if (!isMatch(e, detectedVertical)) {
            missedV++;
        }
    });

    detectedHorizontal.forEach(d => {
        if (isMatch(d, config.expectedHorizontal)) {
            correctH++;
        } else {
            falseH++;
        }
    });
    config.expectedHorizontal.forEach(e => {
        if (!isMatch(e, detectedHorizontal)) {
            missedH++;
        }
    });

    const totalCorrect = correctV + correctH;
    const totalFalse = falseV + falseH;
    const totalMissed = missedV + missedH;
    const totalExpected = config.expectedVertical.length + config.expectedHorizontal.length;

    const precision = totalCorrect / (totalCorrect + totalFalse) * 100;
    const recall = totalCorrect / totalExpected * 100;
    const f1 = 2 * precision * recall / (precision + recall);

    console.log(`  垂直: 正确=${correctV}, 误检=${falseV}, 漏检=${missedV}`);
    console.log(`  水平: 正确=${correctH}, 误检=${falseH}, 漏检=${missedH}`);
    console.log(`  精确率: ${precision.toFixed(1)}%`);
    console.log(`  召回率: ${recall.toFixed(1)}%`);
    console.log(`  F1 分数: ${f1.toFixed(1)}%`);

    // 步骤 3: 生成可视化配置并调用 Go 程序
    console.log('\n步骤 3: 生成可视化图片...');

    const vizConfig = {
        imagePath: config.imagePath,
        expectedVertical: config.expectedVertical,
        expectedHorizontal: config.expectedHorizontal,
        detectedVertical: detectedVertical,
        detectedHorizontal: detectedHorizontal,
        outputPath: config.outputPath
    };

    // 输出配置供 Runtime JS gate 调用独立可视化工具。
    await File.writeJSON(config.configPath, vizConfig);
    console.log(`\n可视化配置 (保存到 ${config.configPath}):`);
    console.log(JSON.stringify(vizConfig, null, 2));

    const passed = precision >= 90 && recall === 100 && f1 >= 95;
    const report = {
        schemaVersion: 1,
        mode,
        passed,
        metrics: { precision, recall, f1 },
        detected: { vertical: detectedVertical, horizontal: detectedHorizontal },
        expected: { vertical: config.expectedVertical, horizontal: config.expectedHorizontal },
        visualization: vizConfig,
    };
    await File.writeJSON(`.runtime/tests/wechat/${mode}_analysis.json`, report);

    // 步骤 4: 显示结论
    console.log('\n' + '='.repeat(80));
    if (passed) {
        console.log('✓ 测试通过！算法达到目标。');
    } else {
        console.log('✗ 测试未通过。');
        if (precision < 90) {
            console.log(`  - 精确率不足: ${precision.toFixed(1)}% < 90%`);
        }
        if (recall < 100) {
            console.log(`  - 召回率不足: ${recall.toFixed(1)}% < 100%`);
        }
        if (f1 < 95) {
            console.log(`  - F1 分数不足: ${f1.toFixed(1)}% < 95%`);
        }
        throw new Error(`布局识别未达到门槛: precision=${precision.toFixed(1)} recall=${recall.toFixed(1)} f1=${f1.toFixed(1)}`);
    }
    console.log('='.repeat(80));

    console.log('\n下一步: 运行以下命令生成可视化图片');
    console.log(`  go run ./tests/wechat/tools/visualize-result ${config.configPath}`);
    console.log(`  open ${config.outputPath}`);

    return report;
}

await runAndVisualize();
